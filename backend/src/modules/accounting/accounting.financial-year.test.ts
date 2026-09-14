import { FinancialYearStatus } from '@prisma/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';
import {
  closeActiveFinancialYear,
  getActiveFinancialYear,
  getTrialBalance,
  listFinancialYears,
} from './accounting.service';

describe('financial year close guards', () => {
  let userId: number;
  let adminPassword: string;

  beforeAll(async () => {
    const user = await prisma.user.findFirst({ where: { username: 'admin' } });
    if (!user) throw new Error('Seed admin user first');
    userId = user.id;
    adminPassword = process.env.DEFAULT_ADMIN_PASSWORD ?? 'admin123';

    // Ensure role is ADMIN for requireAdmin / close path expectations.
    await prisma.user.update({
      where: { id: userId },
      data: { role: 'ADMIN' },
    });
  });

  it('getActiveFinancialYear returns the ACTIVE year', async () => {
    const year = await getActiveFinancialYear();
    expect(year.status).toBe(FinancialYearStatus.ACTIVE);
    expect(year.label).toMatch(/^\d{4}-\d{4}$/);
    expect(year.startDate).toBeInstanceOf(Date);
  });

  it('listFinancialYears includes status fields', async () => {
    const years = await listFinancialYears();
    expect(years.length).toBeGreaterThan(0);
    expect(years.some((y) => y.status === FinancialYearStatus.ACTIVE)).toBe(true);
  });

  it('rejects close without confirm: true', async () => {
    await expect(
      closeActiveFinancialYear({ userId, confirm: false, password: adminPassword }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('irreversible'),
    } satisfies Partial<AppError>);
  });

  it('rejects close with wrong password', async () => {
    await expect(
      closeActiveFinancialYear({ userId, confirm: true, password: 'not-the-password' }),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: 'Incorrect password',
    } satisfies Partial<AppError>);
  });

  it('rejects close when trial balance is unbalanced', async () => {
    const tb = await getTrialBalance();
    expect(tb.isBalanced).toBe(true);

    const ledger = await prisma.ledger.findFirst({ include: { account: true } });
    if (!ledger) throw new Error('Need at least one ledger');

    const original = Number(ledger.balance);
    await prisma.ledger.update({
      where: { id: ledger.id },
      data: { balance: original + 123.45 },
    });

    try {
      await expect(
        closeActiveFinancialYear({ userId, confirm: true, password: adminPassword }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'TRIAL_BALANCE_MISMATCH',
        message: expect.stringContaining('mismatch'),
      } satisfies Partial<AppError>);
    } finally {
      await prisma.ledger.update({
        where: { id: ledger.id },
        data: { balance: original },
      });
    }
  });

  it('closes active year and opens the next when TB is balanced', async () => {
    const before = await getActiveFinancialYear();
    const tb = await getTrialBalance();
    expect(tb.isBalanced).toBe(true);

    const result = await closeActiveFinancialYear({
      userId,
      confirm: true,
      password: adminPassword,
    });

    expect(result.closedYear.id).toBe(before.id);
    expect(result.closedYear.status).toBe(FinancialYearStatus.CLOSED);
    expect(result.newYear.status).toBe(FinancialYearStatus.ACTIVE);
    expect(result.snapshot.accountCount).toBeGreaterThan(0);
    expect(result.snapshot.closedLabel).toBe(before.label);

    // Restore prior active year so other integration tests keep working.
    await prisma.financialYearClosingBalance.deleteMany({
      where: { financialYearId: result.closedYear.id },
    });
    await prisma.financialYear.delete({ where: { id: result.newYear.id } });
    await prisma.financialYear.update({
      where: { id: result.closedYear.id },
      data: {
        status: FinancialYearStatus.ACTIVE,
        closedAt: null,
        closedById: null,
        endDate: null,
      },
    });

    const restored = await getActiveFinancialYear();
    expect(restored.id).toBe(before.id);
  });
});
