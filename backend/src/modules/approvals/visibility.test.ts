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
import { bootstrapChartOfAccounts, listAccounts, listVouchers } from '../accounting/accounting.service';
import { getInvoice, getInvoiceByReference, listInvoices } from '../invoices/invoices.service';
import { listProducts } from '../products/products.service';

describe('visibility filters (Phase 4)', () => {
  let adminId: number;
  let categoryId: number;
  let cashId: number;

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

    const cash = await prisma.account.findFirst({
      where: { name: 'Cash in Hand', isActive: true, status: RecordStatus.ACTIVE },
    });
    if (!cash) throw new Error('Cash in Hand missing');
    cashId = cash.id;
  });

  it('hides pending accounts and products from list endpoints', async () => {
    const stamp = Date.now();

    const pendingAccount = await prisma.account.create({
      data: {
        categoryId,
        name: `Pending Visibility Acct ${stamp}`,
        code: `PVA${stamp}`,
        type: AccountType.EXPENSE,
        status: RecordStatus.PENDING_APPROVAL,
        createdById: adminId,
      },
    });
    await prisma.ledger.create({ data: { accountId: pendingAccount.id, balance: 0 } });

    const grainCategory = await prisma.productCategory.findFirst({
      where: { name: 'Grain' },
    });
    if (!grainCategory) throw new Error('Grain product category missing — run migrations');

    const pendingProduct = await prisma.product.create({
      data: {
        name: `Pending Visibility Product ${stamp}`,
        code: `PVP${stamp}`,
        accountId: pendingAccount.id,
        categoryId: grainCategory.id,
        status: RecordStatus.PENDING_APPROVAL,
        createdById: adminId,
      },
    });

    const accounts = await listAccounts();
    const products = await listProducts();
    expect(accounts.some((a) => a.id === pendingAccount.id)).toBe(false);
    expect(products.some((p) => p.id === pendingProduct.id)).toBe(false);

    await prisma.product.delete({ where: { id: pendingProduct.id } });
    await prisma.ledger.deleteMany({ where: { accountId: pendingAccount.id } });
    await prisma.account.delete({ where: { id: pendingAccount.id } });
  });

  it('hides pending vouchers from listVouchers', async () => {
    const stamp = Date.now();
    const expense = await prisma.account.create({
      data: {
        categoryId,
        name: `Pending Voucher Exp ${stamp}`,
        code: `PVE${stamp}`,
        type: AccountType.EXPENSE,
        status: RecordStatus.ACTIVE,
      },
    });
    await prisma.ledger.create({ data: { accountId: expense.id, balance: 0 } });

    const year = await prisma.financialYear.findFirst({ where: { status: 'ACTIVE' } });
    if (!year) throw new Error('Active year missing');

    const pendingVoucher = await prisma.voucher.create({
      data: {
        type: VoucherType.PAYMENT,
        number: 88_000 + (stamp % 1000),
        date: new Date(),
        debitAccountId: expense.id,
        creditAccountId: cashId,
        amount: 100,
        reference: `PEND-VIS-${stamp}`,
        status: VoucherStatus.PENDING_APPROVAL,
        createdById: adminId,
        financialYearId: year.id,
      },
    });

    const listed = await listVouchers();
    expect(listed.items.some((v) => v.id === pendingVoucher.id)).toBe(false);

    await prisma.voucher.delete({ where: { id: pendingVoucher.id } });
    await prisma.ledger.deleteMany({ where: { accountId: expense.id } });
    await prisma.account.delete({ where: { id: expense.id } });
  });

  it('hides non-posted invoices from list and get', async () => {
    const stamp = Date.now();
    const reference = `VIS-PEND-${stamp}`;

    const pendingInvoice = await prisma.invoice.create({
      data: {
        type: InvoiceType.KACHI_MAAL,
        status: InvoiceStatus.PENDING_APPROVAL,
        number: 92_000 + (stamp % 1000),
        reference,
        total: 100,
        createdById: adminId,
      },
    });

    const listed = await listInvoices();
    expect(listed.items.some((i) => i.id === pendingInvoice.id)).toBe(false);

    await expect(getInvoice(pendingInvoice.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(getInvoiceByReference(reference)).rejects.toMatchObject({ statusCode: 404 });

    await prisma.invoice.delete({ where: { id: pendingInvoice.id } });
  });
});
