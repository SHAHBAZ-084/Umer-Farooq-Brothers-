import {
  AccountType,
  InvoiceStatus,
  InvoiceType,
  RecordStatus,
  VoucherStatus,
} from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma';
import { approveProduct } from '../../test-helpers/approval';
import { voucherDateInActiveYear } from '../../test-helpers/financial-year';
import {
  bootstrapChartOfAccounts,
  cancelVoucher,
  createVoucher,
  ensureGeneralGoodsAccounts,
  KACHI_MAAL_CATEGORY_NAMES,
  listAccounts,
  previewNextVoucherNumber,
} from '../accounting/accounting.service';
import { listProductCategories } from '../products/product-categories';
import { createProduct } from '../products/products.service';
import {
  createPurchaseGeneralInvoice,
  getNextPurchaseGeneralReference,
} from './purchase-general.service';

async function accountByName(name: string) {
  const accounts = await listAccounts();
  const account = accounts.find((a) => a.name === name);
  if (!account?.ledger) throw new Error(`Account not found: ${name}`);
  return account;
}

async function ensureAccountInCategory(
  categoryName: string,
  accountName: string,
  type: AccountType,
  code: string,
) {
  const category = await prisma.accountCategory.findFirst({
    where: { isActive: true, name: categoryName },
  });
  if (!category) throw new Error(`Category missing: ${categoryName}`);

  let account = await prisma.account.findFirst({
    where: { isActive: true, name: accountName, categoryId: category.id },
    include: { ledger: true },
  });
  if (!account) {
    account = await prisma.account.create({
      data: { categoryId: category.id, name: accountName, code, type, status: RecordStatus.ACTIVE },
      include: { ledger: true },
    });
    await prisma.ledger.create({ data: { accountId: account.id, balance: 0 } });
  } else if (!account.ledger) {
    await prisma.ledger.create({ data: { accountId: account.id, balance: 0 } });
  }
  return account;
}

describe('cancelled numbering reuse', () => {
  let userId: number;
  let cashId: number;
  let expenseId: number;
  let partyId: number;
  let productId: number;
  let voucherDate: string;
  let activeFinancialYearId: number;
  let paymentSnapshots: Array<{ id: number; status: VoucherStatus }>;
  let purchaseGeneralSnapshots: Array<{ id: number; status: InvoiceStatus }>;
  const createdVoucherIds: number[] = [];
  const createdInvoiceIds: number[] = [];

  beforeAll(async () => {
    voucherDate = await voucherDateInActiveYear();
    await bootstrapChartOfAccounts();
    await prisma.$transaction((tx) => ensureGeneralGoodsAccounts(tx));

    const user = await prisma.user.findFirst();
    if (!user) throw new Error('Seed admin user first');
    userId = user.id;

    const activeYear = await prisma.financialYear.findFirst({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    if (!activeYear) throw new Error('No active financial year');
    activeFinancialYearId = activeYear.id;

    cashId = (await accountByName('Cash in Hand')).id;
    expenseId = (
      await ensureAccountInCategory('Expenses', 'Numbering Test Expense', AccountType.EXPENSE, 'EXP-NUMBERING')
    ).id;
    partyId = (
      await ensureAccountInCategory(
        KACHI_MAAL_CATEGORY_NAMES.EXT_PURCHASE,
        'Numbering Test Supplier',
        AccountType.LIABILITY,
        'PG-NUM-SUP',
      )
    ).id;

    const categories = await listProductCategories({ stockMode: 'QUANTITY' });
    const category = categories[0];
    if (!category) throw new Error('No quantity product category');
    const product = await createProduct({
      name: `Numbering Product ${Date.now()}`,
      unit: 'bag',
      categoryId: category.id,
      createdById: userId,
    });
    await approveProduct(product.id);
    productId = product.id;

    paymentSnapshots = await prisma.voucher.findMany({
      where: { financialYearId: activeFinancialYearId, type: 'PAYMENT' },
      select: { id: true, status: true },
    });
    purchaseGeneralSnapshots = await prisma.invoice.findMany({
      where: { type: InvoiceType.PURCHASE_GENERAL },
      select: { id: true, status: true },
    });
  });

  beforeEach(async () => {
    await cleanupCreatedRecords();
    await prisma.voucher.updateMany({
      where: { financialYearId: activeFinancialYearId, type: 'PAYMENT' },
      data: { status: VoucherStatus.CANCELLED },
    });
    await prisma.invoice.updateMany({
      where: { type: InvoiceType.PURCHASE_GENERAL },
      data: { status: InvoiceStatus.CANCELLED },
    });
  });

  afterAll(async () => {
    await cleanupCreatedRecords();
    await restoreVoucherStatuses();
    await restoreInvoiceStatuses();
  }, 30_000);

  async function cleanupCreatedRecords() {
    if (createdVoucherIds.length > 0) {
      await prisma.ledgerEntry.deleteMany({ where: { voucherId: { in: createdVoucherIds } } });
      await prisma.voucher.deleteMany({ where: { id: { in: createdVoucherIds } } });
      createdVoucherIds.length = 0;
    }
    if (createdInvoiceIds.length > 0) {
      await prisma.generalPurchaseLine.deleteMany({ where: { invoiceId: { in: createdInvoiceIds } } });
      await prisma.invoice.deleteMany({ where: { id: { in: createdInvoiceIds } } });
      createdInvoiceIds.length = 0;
    }
  }

  async function restoreVoucherStatuses() {
    for (const status of Object.values(VoucherStatus)) {
      const ids = paymentSnapshots.filter((row) => row.status === status).map((row) => row.id);
      if (ids.length > 0) {
        await prisma.voucher.updateMany({ where: { id: { in: ids } }, data: { status } });
      }
    }
  }

  async function restoreInvoiceStatuses() {
    for (const status of Object.values(InvoiceStatus)) {
      const ids = purchaseGeneralSnapshots
        .filter((row) => row.status === status)
        .map((row) => row.id);
      if (ids.length > 0) {
        await prisma.invoice.updateMany({ where: { id: { in: ids } }, data: { status } });
      }
    }
  }

  async function createPayment(reference: string) {
    const voucher = await createVoucher({
      type: 'PAYMENT',
      debitAccountId: expenseId,
      creditAccountId: cashId,
      amount: 100,
      date: voucherDate,
      createdById: userId,
      reference,
    });
    createdVoucherIds.push(voucher.id);
    return voucher;
  }

  async function createPurchaseGeneral() {
    const invoice = await createPurchaseGeneralInvoice({
      invoiceDate: voucherDate,
      partyAccountId: partyId,
      lines: [{ productId, quantity: 1, rate: 100 }],
      createdById: userId,
    });
    createdInvoiceIds.push(invoice.id);
    return invoice;
  }

  it('restarts Payment voucher numbering when all are cancelled', async () => {
    const first = await createPayment('NUM-RESTART-1');
    const second = await createPayment('NUM-RESTART-2');
    expect(first.number).toBe(1);
    expect(second.number).toBe(2);

    await cancelVoucher(first.id, userId);
    await cancelVoucher(second.id, userId);

    const preview = await previewNextVoucherNumber('PAYMENT');
    const afterAllCancelled = await createPayment('NUM-RESTART-3');

    expect(preview.number).toBe(1);
    expect(afterAllCancelled.number).toBe(1);
  });

  it('continues Payment voucher numbering from max surviving number', async () => {
    const first = await createPayment('NUM-SURVIVE-1');
    const middle = await createPayment('NUM-SURVIVE-2');
    const third = await createPayment('NUM-SURVIVE-3');
    expect([first.number, middle.number, third.number]).toEqual([1, 2, 3]);

    await cancelVoucher(middle.id, userId);

    const afterMiddleCancelled = await createPayment('NUM-SURVIVE-4');
    expect(afterMiddleCancelled.number).toBe(4);
  });

  it('restarts Purchase General invoice numbering when all are cancelled', async () => {
    const first = await createPurchaseGeneral();
    const second = await createPurchaseGeneral();
    expect([first.number, second.number]).toEqual([1, 2]);
    expect([first.reference, second.reference]).toEqual(['PG-00001', 'PG-00002']);

    await prisma.invoice.updateMany({
      where: { id: { in: [first.id, second.id] } },
      data: { status: InvoiceStatus.CANCELLED },
    });

    const preview = await getNextPurchaseGeneralReference();
    const afterAllCancelled = await createPurchaseGeneral();

    expect(preview.reference).toBe('PG-00001');
    expect(afterAllCancelled.number).toBe(1);
    expect(afterAllCancelled.reference).toBe('PG-00001');
  });

  it('continues Purchase General invoice numbering from max surviving number', async () => {
    const first = await createPurchaseGeneral();
    const middle = await createPurchaseGeneral();
    const third = await createPurchaseGeneral();
    expect([first.number, middle.number, third.number]).toEqual([1, 2, 3]);

    await prisma.invoice.update({
      where: { id: middle.id },
      data: { status: InvoiceStatus.CANCELLED },
    });

    const afterMiddleCancelled = await createPurchaseGeneral();
    expect(afterMiddleCancelled.number).toBe(4);
    expect(afterMiddleCancelled.reference).toBe('PG-00004');
  });
});
