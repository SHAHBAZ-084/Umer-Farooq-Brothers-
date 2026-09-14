import {
  AccountType,
  InvoiceStatus,
  InvoiceType,
  RecordStatus,
  VoucherStatus,
  VoucherType,
} from '@prisma/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma';
import { bootstrapChartOfAccounts } from '../accounting/accounting.service';
import {
  approvePendingRecord,
  getPendingApprovalDetail,
  listPendingApprovals,
  rejectPendingRecord,
} from './approvals.service';

describe('approvals service (Phase 2)', () => {
  let adminId: number;
  let categoryId: number;

  beforeAll(async () => {
    await bootstrapChartOfAccounts();
    const admin = await prisma.user.findFirst({ where: { username: 'admin' } });
    if (!admin) throw new Error('Seed admin required');
    adminId = admin.id;

    const category = await prisma.accountCategory.findFirst({
      where: { name: 'Expenses', isActive: true },
    });
    if (!category) throw new Error('Expenses category missing');
    categoryId = category.id;
  });

  it('lists pending account and voucher items', async () => {
    const stamp = Date.now();
    const account = await prisma.account.create({
      data: {
        categoryId,
        name: `Pending Acct ${stamp}`,
        code: `PA${stamp}`,
        type: AccountType.EXPENSE,
        status: RecordStatus.PENDING_APPROVAL,
        createdById: adminId,
      },
    });

    const cash = await prisma.account.findFirst({
      where: { name: 'Cash in Hand', isActive: true },
      include: { ledger: true },
    });
    const expense = await prisma.account.findFirst({
      where: {
        type: AccountType.EXPENSE,
        isActive: true,
        status: RecordStatus.ACTIVE,
        id: { not: account.id },
        ledger: { isNot: null },
      },
    });
    if (!cash?.ledger || !expense) throw new Error('Accounts missing for voucher test');

    const year = await prisma.financialYear.findFirst({ where: { status: 'ACTIVE' } });
    if (!year) throw new Error('Active year missing');

    const voucher = await prisma.voucher.create({
      data: {
        type: VoucherType.PAYMENT,
        number: 99_000 + (stamp % 1000),
        date: new Date(),
        debitAccountId: expense.id,
        creditAccountId: cash.id,
        amount: 500,
        description: 'Pending payment test',
        reference: `PEND-${stamp}`,
        status: VoucherStatus.PENDING_APPROVAL,
        createdById: adminId,
        financialYearId: year.id,
      },
    });

    const items = await listPendingApprovals();
    expect(items.some((i) => i.kind === 'account' && i.id === account.id)).toBe(true);
    expect(items.some((i) => i.kind === 'voucher' && i.id === voucher.id)).toBe(true);

    const detail = await getPendingApprovalDetail('account', account.id);
    expect(detail.kind).toBe('account');
    expect((detail.record as { name: string }).name).toContain('Pending Acct');

    const approved = await approvePendingRecord('account', account.id);
    expect(approved.status).toBe(RecordStatus.ACTIVE);

    const approvedAccount = await prisma.account.findUniqueOrThrow({
      where: { id: account.id },
    });
    expect(approvedAccount.status).toBe(RecordStatus.ACTIVE);

    const approvedVoucher = await approvePendingRecord('voucher', voucher.id);
    expect(approvedVoucher.status).toBe(VoucherStatus.ACTIVE);

    const entries = await prisma.ledgerEntry.count({ where: { voucherId: voucher.id } });
    expect(entries).toBe(2);

    await prisma.ledgerEntry.deleteMany({ where: { voucherId: voucher.id } });
    await prisma.voucher.delete({ where: { id: voucher.id } });
    await prisma.ledger.deleteMany({ where: { accountId: account.id } });
    await prisma.account.delete({ where: { id: account.id } });
  });

  it('rejects pending invoice without posting', async () => {
    const stamp = Date.now();
    const invoice = await prisma.invoice.create({
      data: {
        type: InvoiceType.KACHI_MAAL,
        status: InvoiceStatus.PENDING_APPROVAL,
        number: 91_000 + (stamp % 1000),
        reference: `KM-PEND-${stamp}`,
        total: 0,
        createdById: adminId,
      },
    });

    const rejected = await rejectPendingRecord('invoice', invoice.id);
    expect(rejected.status).toBe(InvoiceStatus.REJECTED);

    const links = await prisma.invoiceVoucher.count({ where: { invoiceId: invoice.id } });
    expect(links).toBe(0);

    await prisma.invoice.delete({ where: { id: invoice.id } });
  });
});
