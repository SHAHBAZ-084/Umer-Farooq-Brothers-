import { ReminderStatus, UserRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';

const reminderInclude = {
  account: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, displayName: true, username: true, role: true } },
  settledBy: { select: { id: true, displayName: true, username: true } },
} as const;

function serializeReminder<T extends { amount: unknown; reminderAt: Date; settledAt: Date | null; lastNotifiedAt: Date | null; createdAt: Date }>(
  row: T,
) {
  return {
    ...row,
    amount: Number(row.amount),
    reminderAt: row.reminderAt.toISOString(),
    settledAt: row.settledAt?.toISOString() ?? null,
    lastNotifiedAt: row.lastNotifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listReminders(status?: ReminderStatus) {
  const rows = await prisma.reminder.findMany({
    where: status ? { status } : undefined,
    include: reminderInclude,
    orderBy: [{ reminderAt: 'asc' }, { id: 'asc' }],
  });
  return rows.map(serializeReminder);
}

export async function createReminder(data: {
  accountId: number;
  amount: number;
  reminderAt: string | Date;
  note?: string | null;
  createdById: number;
}) {
  const account = await prisma.account.findFirst({
    where: { id: data.accountId, isActive: true },
    select: { id: true },
  });
  if (!account) throw new AppError(400, 'Account not found');

  const amount = Number(data.amount);
  if (!(amount > 0) || !Number.isFinite(amount)) {
    throw new AppError(400, 'Amount must be greater than zero');
  }

  const reminderAt = new Date(data.reminderAt);
  if (Number.isNaN(reminderAt.getTime())) {
    throw new AppError(400, 'Invalid reminder date/time');
  }

  const creator = await prisma.user.findUnique({
    where: { id: data.createdById },
    select: { id: true, role: true },
  });
  if (!creator) throw new AppError(401, 'Not authenticated');

  const created = await prisma.reminder.create({
    data: {
      accountId: data.accountId,
      amount,
      reminderAt,
      note: data.note?.trim() || null,
      createdById: creator.id,
      createdByRole: creator.role === UserRole.ADMIN ? UserRole.ADMIN : UserRole.USER,
      status: ReminderStatus.PENDING,
    },
    include: reminderInclude,
  });

  return serializeReminder(created);
}

export async function settleReminder(id: number, settledById: number) {
  const existing = await prisma.reminder.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Reminder not found');
  if (existing.status === ReminderStatus.SETTLED) {
    throw new AppError(400, 'Reminder is already settled');
  }

  const updated = await prisma.reminder.update({
    where: { id },
    data: {
      status: ReminderStatus.SETTLED,
      settledAt: new Date(),
      settledById,
    },
    include: reminderInclude,
  });

  return serializeReminder(updated);
}

/** Persist notification progress so catch-up survives restarts. */
export async function recordReminderNotification(
  id: number,
  opts?: { notifyCount?: number },
) {
  const existing = await prisma.reminder.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Reminder not found');
  if (existing.status !== ReminderStatus.PENDING) {
    throw new AppError(400, 'Only pending reminders can be notified');
  }

  let nextCount: number;
  if (opts?.notifyCount != null) {
    const n = Math.floor(Number(opts.notifyCount));
    if (!Number.isFinite(n) || n < 0) throw new AppError(400, 'Invalid notifyCount');
    nextCount = Math.min(9, Math.max(existing.notifyCount, n));
  } else {
    nextCount = Math.min(9, existing.notifyCount + 1);
  }

  const updated = await prisma.reminder.update({
    where: { id },
    data: {
      notifyCount: nextCount,
      lastNotifiedAt: new Date(),
    },
    include: reminderInclude,
  });

  return serializeReminder(updated);
}
