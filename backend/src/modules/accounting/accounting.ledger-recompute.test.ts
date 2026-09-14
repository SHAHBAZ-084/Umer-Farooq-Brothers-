import { beforeAll, describe, expect, it } from 'vitest';
import { LedgerEntryType, RecordStatus, VoucherStatus, VoucherType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  activeFinancialYearStartDate,
  voucherDateInActiveYear,
} from '../../test-helpers/financial-year';
import { approveVoucher } from '../../test-helpers/approval';
import {
  bootstrapChartOfAccounts,
  createVoucher,
  getActiveFinancialYearId,
} from './accounting.service';
import { compareLedgerEntries, parseVoucherDateInput } from './ledger-utils';

async function createApprovedVoucher(data: Parameters<typeof createVoucher>[0]) {
  const pending = await createVoucher(data);
  await approveVoucher(pending.id);
  return prisma.voucher.findUniqueOrThrow({ where: { id: pending.id } });
}

function addDays(isoDate: string, days: number): string {
  const d = parseVoucherDateInput(isoDate);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('ledger running balance recompute (partial from affected point)', () => {
  let userId: number;
  let yearStart: string;
  let today: string;

  beforeAll(async () => {
    await bootstrapChartOfAccounts();
    const user = await prisma.user.findFirst();
    if (!user) throw new Error('Seed admin user first');
    userId = user.id;
    yearStart = await activeFinancialYearStartDate();
    today = await voucherDateInActiveYear();
  });

  it('backdated insert shifts subsequent entry balances', async () => {
    const stamp = Date.now();
    const expenseCat = await prisma.accountCategory.findFirst({ where: { name: 'Expenses' } });
    const cashCat = await prisma.accountCategory.findFirst({ where: { name: 'Cash' } });
    if (!expenseCat || !cashCat) throw new Error('Missing categories');

    const cash = await prisma.account.create({
      data: {
        categoryId: cashCat.id,
        name: `Recompute Cash ${stamp}`,
        code: `RC-${stamp}`,
        type: 'ASSET',
        status: RecordStatus.ACTIVE,
      },
    });
    const expense = await prisma.account.create({
      data: {
        categoryId: expenseCat.id,
        name: `Recompute Exp ${stamp}`,
        code: `RE-${stamp}`,
        type: 'EXPENSE',
        status: RecordStatus.ACTIVE,
      },
    });
    await prisma.ledger.create({ data: { accountId: cash.id, balance: 0 } });
    await prisma.ledger.create({ data: { accountId: expense.id, balance: 0 } });

    const early = addDays(yearStart, 5);
    const mid = addDays(yearStart, 15);
    const late = addDays(yearStart, 25);

    await createApprovedVoucher({
      type: VoucherType.PAYMENT,
      debitAccountId: expense.id,
      creditAccountId: cash.id,
      amount: 1000,
      date: early,
      createdById: userId,
      description: 'Early',
      reference: `RC-EARLY-${stamp}`,
    });
    await createApprovedVoucher({
      type: VoucherType.PAYMENT,
      debitAccountId: expense.id,
      creditAccountId: cash.id,
      amount: 2000,
      date: late,
      createdById: userId,
      description: 'Late',
      reference: `RC-LATE-${stamp}`,
    });

    const beforeBackdate = await prisma.ledgerEntry.count({
      where: {
        ledger: { accountId: cash.id },
        isReversal: false,
        voucher: { status: VoucherStatus.ACTIVE },
      },
    });
    expect(beforeBackdate).toBe(2);

    await createApprovedVoucher({
      type: VoucherType.PAYMENT,
      debitAccountId: expense.id,
      creditAccountId: cash.id,
      amount: 500,
      date: mid,
      createdById: userId,
      description: 'Backdated mid',
      reference: `RC-MID-${stamp}`,
    });

    const cashLedger = await prisma.ledger.findUniqueOrThrow({ where: { accountId: cash.id } });
    const entries = await prisma.ledgerEntry.findMany({
      where: { ledgerId: cashLedger.id, isReversal: false },
      include: { voucher: { select: { date: true, number: true, type: true, reference: true } } },
    });
    entries.sort(compareLedgerEntries);

    expect(entries).toHaveLength(3);
    expect(Number(entries[0].amount)).toBe(1000);
    expect(Number(entries[0].balance)).toBe(-1000);
    expect(Number(entries[1].amount)).toBe(500);
    expect(Number(entries[1].balance)).toBe(-1500);
    expect(Number(entries[2].amount)).toBe(2000);
    expect(Number(entries[2].balance)).toBe(-3500);
    expect(Number(cashLedger.balance)).toBe(-3500);

    // Late entry must have been shifted by the backdated 500.
    const lateEntry = entries.find((e) => e.voucher?.reference === `RC-LATE-${stamp}`);
    expect(lateEntry).toBeTruthy();
    expect(Number(lateEntry!.balance)).toBe(-3500);
  });

  it('append on a ledger with ~5000 prior entries finishes under 500ms', async () => {
    const stamp = Date.now();
    const expenseCat = await prisma.accountCategory.findFirst({ where: { name: 'Expenses' } });
    const cashCat = await prisma.accountCategory.findFirst({ where: { name: 'Cash' } });
    if (!expenseCat || !cashCat) throw new Error('Missing categories');

    const cash = await prisma.account.create({
      data: {
        categoryId: cashCat.id,
        name: `Perf Cash ${stamp}`,
        code: `PC-${stamp}`,
        type: 'ASSET',
        status: RecordStatus.ACTIVE,
      },
    });
    const expense = await prisma.account.create({
      data: {
        categoryId: expenseCat.id,
        name: `Perf Exp ${stamp}`,
        code: `PE-${stamp}`,
        type: 'EXPENSE',
        status: RecordStatus.ACTIVE,
      },
    });
    const cashLedger = await prisma.ledger.create({ data: { accountId: cash.id, balance: 0 } });
    const expenseLedger = await prisma.ledger.create({ data: { accountId: expense.id, balance: 0 } });

    const financialYearId = await getActiveFinancialYearId(prisma);
    const seedDate = parseVoucherDateInput(addDays(yearStart, 1));
    const COUNT = 5000;
    const amount = 1;

    const maxExisting = await prisma.voucher.aggregate({
      where: { financialYearId, type: VoucherType.PAYMENT },
      _max: { number: true },
    });
    const baseNumber = (maxExisting._max.number ?? 0) + 1;

    let cashRunning = 0;
    let expenseRunning = 0;
    const batchSize = 250;

    for (let offset = 0; offset < COUNT; offset += batchSize) {
      const slice = Math.min(batchSize, COUNT - offset);
      const voucherRows = [];
      for (let i = 0; i < slice; i += 1) {
        const number = baseNumber + offset + i;
        voucherRows.push({
          type: VoucherType.PAYMENT,
          number,
          date: seedDate,
          debitAccountId: expense.id,
          creditAccountId: cash.id,
          amount,
          description: `Seed ${number}`,
          reference: `PERF-${stamp}-${number}`,
          createdById: userId,
          financialYearId,
          status: VoucherStatus.ACTIVE,
        });
      }
      await prisma.voucher.createMany({ data: voucherRows });

      const created = await prisma.voucher.findMany({
        where: {
          reference: { startsWith: `PERF-${stamp}-` },
          number: { gt: baseNumber + offset - 1, lte: baseNumber + offset + slice - 1 },
        },
        orderBy: { number: 'asc' },
        select: { id: true, number: true },
      });

      const entryRows: Array<{
        ledgerId: number;
        voucherId: number;
        type: LedgerEntryType;
        amount: number;
        balance: number;
        isReversal: boolean;
      }> = [];

      for (const voucher of created) {
        expenseRunning += amount;
        cashRunning -= amount;
        entryRows.push({
          ledgerId: expenseLedger.id,
          voucherId: voucher.id,
          type: LedgerEntryType.DEBIT,
          amount,
          balance: expenseRunning,
          isReversal: false,
        });
        entryRows.push({
          ledgerId: cashLedger.id,
          voucherId: voucher.id,
          type: LedgerEntryType.CREDIT,
          amount,
          balance: cashRunning,
          isReversal: false,
        });
      }
      await prisma.ledgerEntry.createMany({ data: entryRows });
    }

    await prisma.ledger.update({ where: { id: cashLedger.id }, data: { balance: cashRunning } });
    await prisma.ledger.update({
      where: { id: expenseLedger.id },
      data: { balance: expenseRunning },
    });

    const appendAmount = 17;
    const started = performance.now();
    await createApprovedVoucher({
      type: VoucherType.PAYMENT,
      debitAccountId: expense.id,
      creditAccountId: cash.id,
      amount: appendAmount,
      date: today,
      createdById: userId,
      description: 'Perf append',
      reference: `PERF-APPEND-${stamp}`,
    });
    const elapsedMs = performance.now() - started;

    const cashAfter = await prisma.ledger.findUniqueOrThrow({ where: { id: cashLedger.id } });
    const expenseAfter = await prisma.ledger.findUniqueOrThrow({ where: { id: expenseLedger.id } });
    expect(Number(cashAfter.balance)).toBe(cashRunning - appendAmount);
    expect(Number(expenseAfter.balance)).toBe(expenseRunning + appendAmount);
    // Same-day ledger order is no longer voucher-number-only, so recompute loads the
    // full same-day window. Keep a modest budget above the old 200ms number-filter path.
    expect(elapsedMs).toBeLessThan(500);
  }, 180_000);
});
