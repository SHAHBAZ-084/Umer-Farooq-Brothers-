import {
  Prisma,
  ScheduleFrequency,
  ScheduleStatus,
  VoucherType,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { AppError } from '../../utils/helpers';
import { createVoucherInTx } from '../accounting/accounting.service';

const SCHEDULE_VOUCHER_TYPES = new Set<VoucherType>([
  VoucherType.PAYMENT,
  VoucherType.RECEIPT,
  VoucherType.JOURNAL,
]);

const scheduleInclude = {
  debitAccount: { select: { id: true, name: true, code: true } },
  creditAccount: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, displayName: true, username: true } },
} as const;

function serializeSchedule<
  T extends {
    amount: unknown;
    startAt: Date;
    endAt: Date | null;
    nextRunAt: Date;
    lastRunAt: Date | null;
    createdAt: Date;
  },
>(row: T) {
  return {
    ...row,
    amount: Number(row.amount),
    startAt: row.startAt.toISOString(),
    endAt: row.endAt?.toISOString() ?? null,
    nextRunAt: row.nextRunAt.toISOString(),
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function parseDateInput(value: string | Date, field: string): Date {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new AppError(400, `Invalid ${field}`);
  return d;
}

/** Advance one frequency interval from `from` (does not mutate `from`). */
export function advanceScheduleDate(from: Date, frequency: ScheduleFrequency): Date {
  const d = new Date(from.getTime());
  switch (frequency) {
    case ScheduleFrequency.HOURLY:
      d.setHours(d.getHours() + 1);
      break;
    case ScheduleFrequency.DAILY:
      d.setDate(d.getDate() + 1);
      break;
    case ScheduleFrequency.WEEKLY:
      d.setDate(d.getDate() + 7);
      break;
    case ScheduleFrequency.MONTHLY:
      d.setMonth(d.getMonth() + 1);
      break;
    case ScheduleFrequency.YEARLY:
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      throw new AppError(400, `Unsupported frequency: ${frequency}`);
  }
  return d;
}

function assertFiniteSchedule(data: {
  frequency: ScheduleFrequency;
  endAt: Date | null;
  occurrenceLimit: number | null;
}) {
  if (data.frequency === ScheduleFrequency.HOURLY) {
    if (data.occurrenceLimit == null || !(data.occurrenceLimit > 0)) {
      throw new AppError(
        400,
        'Hourly schedules require a fixed number of occurrences (how many times should this run?)',
      );
    }
    return;
  }

  const hasEnd = data.endAt != null;
  const hasLimit = data.occurrenceLimit != null && data.occurrenceLimit > 0;
  if (!hasEnd && !hasLimit) {
    throw new AppError(
      400,
      'Daily/Weekly/Monthly/Yearly schedules require an end date or a number of occurrences',
    );
  }
}

function assertScheduleVoucherType(type: VoucherType) {
  if (!SCHEDULE_VOUCHER_TYPES.has(type)) {
    throw new AppError(400, 'Scheduled vouchers must be Payment, Receipt, or Journal');
  }
}

export type CreateScheduleInput = {
  voucherType: VoucherType;
  debitAccountId: number;
  creditAccountId: number;
  amount: number;
  description?: string | null;
  frequency: ScheduleFrequency;
  startAt: string | Date;
  endAt?: string | Date | null;
  occurrenceLimit?: number | null;
  createdById: number;
};

export async function createSchedule(data: CreateScheduleInput) {
  assertScheduleVoucherType(data.voucherType);

  const amount = Number(data.amount);
  if (!(amount > 0) || !Number.isFinite(amount)) {
    throw new AppError(400, 'Amount must be greater than zero');
  }
  if (data.debitAccountId === data.creditAccountId) {
    throw new AppError(400, 'Debit and credit accounts must be different');
  }

  const startAt = parseDateInput(data.startAt, 'startAt');
  const endAt =
    data.endAt == null || data.endAt === ''
      ? null
      : parseDateInput(data.endAt, 'endAt');
  const occurrenceLimit =
    data.occurrenceLimit == null || data.occurrenceLimit === undefined
      ? null
      : Math.floor(Number(data.occurrenceLimit));

  if (occurrenceLimit != null && !(occurrenceLimit > 0)) {
    throw new AppError(400, 'Occurrence limit must be a positive integer');
  }
  if (endAt && endAt.getTime() < startAt.getTime()) {
    throw new AppError(400, 'End date must be on or after the start date');
  }

  assertFiniteSchedule({
    frequency: data.frequency,
    endAt,
    occurrenceLimit,
  });

  const [debit, credit] = await Promise.all([
    prisma.account.findFirst({
      where: { id: data.debitAccountId, isActive: true, status: 'ACTIVE' },
      select: { id: true },
    }),
    prisma.account.findFirst({
      where: { id: data.creditAccountId, isActive: true, status: 'ACTIVE' },
      select: { id: true },
    }),
  ]);
  if (!debit) throw new AppError(400, 'Debit account not found or inactive');
  if (!credit) throw new AppError(400, 'Credit account not found or inactive');

  const created = await prisma.scheduledVoucher.create({
    data: {
      voucherType: data.voucherType,
      debitAccountId: data.debitAccountId,
      creditAccountId: data.creditAccountId,
      amount,
      description: data.description?.trim() || null,
      frequency: data.frequency,
      startAt,
      endAt,
      occurrenceLimit,
      occurrencesRun: 0,
      nextRunAt: startAt,
      status: ScheduleStatus.ACTIVE,
      createdById: data.createdById,
    },
    include: scheduleInclude,
  });

  return serializeSchedule(created);
}

export async function listSchedules() {
  const rows = await prisma.scheduledVoucher.findMany({
    where: { status: { not: ScheduleStatus.DELETED } },
    include: scheduleInclude,
    orderBy: [{ status: 'asc' }, { nextRunAt: 'asc' }, { id: 'desc' }],
  });
  return rows.map(serializeSchedule);
}

export type UpdateScheduleInput = {
  voucherType?: VoucherType;
  debitAccountId?: number;
  creditAccountId?: number;
  amount?: number;
  description?: string | null;
  frequency?: ScheduleFrequency;
  startAt?: string | Date;
  endAt?: string | Date | null;
  occurrenceLimit?: number | null;
  /** When true, reset nextRunAt to startAt (only if occurrencesRun === 0). */
  resetNextRun?: boolean;
};

export async function updateSchedule(id: number, data: UpdateScheduleInput) {
  const existing = await prisma.scheduledVoucher.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Schedule not found');
  if (
    existing.status !== ScheduleStatus.ACTIVE
    && existing.status !== ScheduleStatus.PAUSED
  ) {
    throw new AppError(400, 'Only active or paused schedules can be edited');
  }

  // Judgement: already-created pending vouchers from past runs stay as-is.
  // Editing only changes the template / future runs — we do not rewrite past vouchers.

  const voucherType = data.voucherType ?? existing.voucherType;
  assertScheduleVoucherType(voucherType);

  const debitAccountId = data.debitAccountId ?? existing.debitAccountId;
  const creditAccountId = data.creditAccountId ?? existing.creditAccountId;
  if (debitAccountId === creditAccountId) {
    throw new AppError(400, 'Debit and credit accounts must be different');
  }

  const amount =
    data.amount != null ? Number(data.amount) : Number(existing.amount);
  if (!(amount > 0) || !Number.isFinite(amount)) {
    throw new AppError(400, 'Amount must be greater than zero');
  }

  const frequency = data.frequency ?? existing.frequency;
  const startAt =
    data.startAt != null ? parseDateInput(data.startAt, 'startAt') : existing.startAt;

  let endAt: Date | null = existing.endAt;
  if (Object.prototype.hasOwnProperty.call(data, 'endAt')) {
    endAt =
      data.endAt == null || data.endAt === ''
        ? null
        : parseDateInput(data.endAt as string | Date, 'endAt');
  }

  let occurrenceLimit: number | null = existing.occurrenceLimit;
  if (Object.prototype.hasOwnProperty.call(data, 'occurrenceLimit')) {
    if (data.occurrenceLimit == null) {
      occurrenceLimit = null;
    } else {
      occurrenceLimit = Math.floor(Number(data.occurrenceLimit));
      if (!(occurrenceLimit > 0)) {
        throw new AppError(400, 'Occurrence limit must be a positive integer');
      }
    }
  }

  if (occurrenceLimit != null && occurrenceLimit < existing.occurrencesRun) {
    throw new AppError(
      400,
      `Occurrence limit cannot be less than runs already completed (${existing.occurrencesRun})`,
    );
  }

  if (endAt && endAt.getTime() < startAt.getTime()) {
    throw new AppError(400, 'End date must be on or after the start date');
  }

  assertFiniteSchedule({ frequency, endAt, occurrenceLimit });

  let nextRunAt = existing.nextRunAt;
  if (data.resetNextRun && existing.occurrencesRun === 0) {
    nextRunAt = startAt;
  } else if (data.startAt != null && existing.occurrencesRun === 0) {
    nextRunAt = startAt;
  }

  const updated = await prisma.scheduledVoucher.update({
    where: { id },
    data: {
      voucherType,
      debitAccountId,
      creditAccountId,
      amount,
      description:
        data.description !== undefined
          ? (data.description?.trim() || null)
          : undefined,
      frequency,
      startAt,
      endAt,
      occurrenceLimit,
      nextRunAt,
    },
    include: scheduleInclude,
  });

  return serializeSchedule(updated);
}

export async function pauseSchedule(id: number) {
  const existing = await prisma.scheduledVoucher.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Schedule not found');
  if (existing.status !== ScheduleStatus.ACTIVE) {
    throw new AppError(400, 'Only active schedules can be paused');
  }
  const updated = await prisma.scheduledVoucher.update({
    where: { id },
    data: { status: ScheduleStatus.PAUSED },
    include: scheduleInclude,
  });
  return serializeSchedule(updated);
}

export async function resumeSchedule(id: number) {
  const existing = await prisma.scheduledVoucher.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Schedule not found');
  if (existing.status !== ScheduleStatus.PAUSED) {
    throw new AppError(400, 'Only paused schedules can be resumed');
  }
  const updated = await prisma.scheduledVoucher.update({
    where: { id },
    data: { status: ScheduleStatus.ACTIVE },
    include: scheduleInclude,
  });
  return serializeSchedule(updated);
}

export async function softDeleteSchedule(id: number) {
  const existing = await prisma.scheduledVoucher.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Schedule not found');
  if (existing.status === ScheduleStatus.DELETED) {
    throw new AppError(400, 'Schedule is already deleted');
  }
  // Mark deleted first so an in-flight runner cannot revive the row to ACTIVE.
  const updated = await prisma.scheduledVoucher.update({
    where: { id },
    data: { status: ScheduleStatus.DELETED },
    include: scheduleInclude,
  });
  return serializeSchedule(updated);
}

function scheduleReference(scheduleId: number, occurrenceNumber: number) {
  return `SCH-${scheduleId}-${occurrenceNumber}`;
}

/**
 * Catch-up loop for one ACTIVE schedule:
 * while nextRunAt <= now → create pending voucher dated nextRunAt,
 * bump occurrencesRun, advance nextRunAt by one interval, repeat.
 * Completes when occurrenceLimit is hit or nextRunAt passes endAt.
 */
/** Cap catch-up per tick so a long backlog cannot hold SQLite write locks for minutes. */
const MAX_CATCHUP_PER_TICK = 24;

async function runOneDueSchedule(
  scheduleId: number,
  now: Date,
): Promise<{ created: number; completed: boolean }> {
  let created = 0;
  let completed = false;

  // Re-load inside the loop so concurrent pause/delete is observed quickly.
  // eslint-disable-next-line no-constant-condition
  while (created < MAX_CATCHUP_PER_TICK) {
    const schedule = await prisma.scheduledVoucher.findUnique({ where: { id: scheduleId } });
    if (!schedule || schedule.status !== ScheduleStatus.ACTIVE) break;

    if (schedule.nextRunAt.getTime() > now.getTime()) break;

    if (
      schedule.occurrenceLimit != null
      && schedule.occurrencesRun >= schedule.occurrenceLimit
    ) {
      await prisma.scheduledVoucher.updateMany({
        where: { id: scheduleId, status: ScheduleStatus.ACTIVE },
        data: { status: ScheduleStatus.COMPLETED },
      });
      completed = true;
      break;
    }

    if (schedule.endAt && schedule.nextRunAt.getTime() > schedule.endAt.getTime()) {
      await prisma.scheduledVoucher.updateMany({
        where: { id: scheduleId, status: ScheduleStatus.ACTIVE },
        data: { status: ScheduleStatus.COMPLETED },
      });
      completed = true;
      break;
    }

    const runNumber = schedule.occurrencesRun + 1;
    const runAt = schedule.nextRunAt;

    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Bail if paused/deleted after we loaded the row — do not create or revive.
        const stillActive = await tx.scheduledVoucher.findFirst({
          where: { id: scheduleId, status: ScheduleStatus.ACTIVE },
          select: { id: true },
        });
        if (!stillActive) return;

        await createVoucherInTx(tx, {
          type: schedule.voucherType,
          debitAccountId: schedule.debitAccountId,
          creditAccountId: schedule.creditAccountId,
          amount: Number(schedule.amount),
          date: runAt,
          description:
            schedule.description
            ?? `Scheduled ${schedule.voucherType.toLowerCase()} #${scheduleId}`,
          reference: scheduleReference(scheduleId, runNumber),
          createdById: schedule.createdById,
        });

        const nextRunAt = advanceScheduleDate(runAt, schedule.frequency);
        const hitLimit =
          schedule.occurrenceLimit != null && runNumber >= schedule.occurrenceLimit;
        const pastEnd = schedule.endAt != null && nextRunAt.getTime() > schedule.endAt.getTime();

        // updateMany + ACTIVE guard: never overwrite DELETED/PAUSED back to ACTIVE.
        await tx.scheduledVoucher.updateMany({
          where: { id: scheduleId, status: ScheduleStatus.ACTIVE },
          data: {
            occurrencesRun: runNumber,
            lastRunAt: runAt,
            nextRunAt,
            status:
              hitLimit || pastEnd
                ? ScheduleStatus.COMPLETED
                : ScheduleStatus.ACTIVE,
          },
        });
      });
    } catch (err) {
      logger.error('Scheduled voucher run failed', {
        scheduleId,
        runNumber,
        runAt: runAt.toISOString(),
        err: err instanceof Error ? err.message : String(err),
      });
      // Leave nextRunAt unchanged so the next interval retries this occurrence.
      break;
    }

    // Re-check status — delete/pause during the transaction should stop the loop.
    const after = await prisma.scheduledVoucher.findUnique({
      where: { id: scheduleId },
      select: { status: true, occurrencesRun: true, nextRunAt: true, endAt: true, occurrenceLimit: true },
    });
    if (!after || after.status !== ScheduleStatus.ACTIVE) break;

    created += 1;
    if (
      after.occurrenceLimit != null && after.occurrencesRun >= after.occurrenceLimit
    ) {
      completed = true;
      break;
    }
    if (after.endAt && after.nextRunAt.getTime() > after.endAt.getTime()) {
      completed = true;
      break;
    }
  }

  return { created, completed };
}

/** Find ACTIVE schedules with nextRunAt <= now and catch up all missed runs. */
export async function runDueSchedules(now = new Date()) {
  const due = await prisma.scheduledVoucher.findMany({
    where: {
      status: ScheduleStatus.ACTIVE,
      nextRunAt: { lte: now },
    },
    select: { id: true },
    orderBy: [{ nextRunAt: 'asc' }, { id: 'asc' }],
  });

  let created = 0;
  let completed = 0;
  for (const row of due) {
    const result = await runOneDueSchedule(row.id, now);
    created += result.created;
    if (result.completed) completed += 1;
  }

  if (created > 0 || completed > 0) {
    logger.info('runDueSchedules finished', {
      due: due.length,
      created,
      completed,
    });
  }

  return { due: due.length, created, completed };
}

const RUNNER_INTERVAL_MS = 2 * 60 * 1000;
let runnerTimer: ReturnType<typeof setInterval> | null = null;
let runnerBusy = false;

async function safeRunDueSchedules(reason: string) {
  if (runnerBusy) return;
  runnerBusy = true;
  try {
    await runDueSchedules();
  } catch (err) {
    logger.error('runDueSchedules crashed', {
      reason,
      err: err instanceof Error ? err.message : String(err),
    });
  } finally {
    runnerBusy = false;
  }
}

/** Call once after DB is ready; also starts the periodic interval. */
export function startScheduleRunner() {
  void safeRunDueSchedules('startup');
  if (runnerTimer) return;
  runnerTimer = setInterval(() => {
    void safeRunDueSchedules('interval');
  }, RUNNER_INTERVAL_MS);
  // Allow process to exit in tests even if timer is open.
  if (typeof runnerTimer.unref === 'function') runnerTimer.unref();
}

export function stopScheduleRunner() {
  if (runnerTimer) {
    clearInterval(runnerTimer);
    runnerTimer = null;
  }
}
