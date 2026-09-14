import { AccountType, RecordStatus } from '@prisma/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma';
import {
  ensureGeneralGoodsAccounts,
  KACHI_MAAL_CATEGORY_NAMES,
} from '../accounting/accounting.service';
import { createProduct } from '../products/products.service';
import { listProductCategories } from '../products/product-categories';
import { voucherDateInActiveYear } from '../../test-helpers/financial-year';
import { approveInvoice, approveProduct } from '../../test-helpers/approval';
import { getQuantityStockReport } from '../stock/stock.service';
import { listPendingApprovals, getPendingApprovalDetail } from '../approvals/approvals.service';
import { createPurchaseGeneralInvoice } from './purchase-general.service';
import { createSaleGeneralInvoice } from './sale-general.service';
import { createGeneralTradeInvoice } from './general-trade.service';
import { AppError } from '../../utils/helpers';

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

async function voucherLegs(voucherId: number) {
  const entries = await prisma.ledgerEntry.findMany({
    where: { voucherId, isReversal: false },
    include: { ledger: { include: { account: true } } },
    orderBy: { id: 'asc' },
  });
  return entries.map((entry) => ({
    accountName: entry.ledger.account.name,
    type: entry.type,
    amount: Number(entry.amount),
    description: entry.notes,
  }));
}

describe('General Goods purchase + sale', () => {
  let userId: number;
  let partyId: number;
  let salePartyId: number;
  let intPartyId: number;
  let fertilizerCategoryId: number;
  let productAId: number;
  let productBId: number;
  let productAAccountId: number;
  let mazduriId: number;
  let revenueId: number;
  let invoiceDate: string;

  beforeAll(async () => {
    invoiceDate = await voucherDateInActiveYear();
    const user = await prisma.user.findFirst();
    if (!user) throw new Error('Seed admin user first');
    userId = user.id;

    await prisma.$transaction(async (tx) => {
      await ensureGeneralGoodsAccounts(tx);
    });

    partyId = (
      await ensureAccountInCategory(
        KACHI_MAAL_CATEGORY_NAMES.EXT_PURCHASE,
        'GG Party Supplier',
        AccountType.LIABILITY,
        'GG-SUP-1',
      )
    ).id;
    salePartyId = (
      await ensureAccountInCategory(
        KACHI_MAAL_CATEGORY_NAMES.SALE_PARTY,
        'GG Party Customer',
        AccountType.ASSET,
        'GG-CUS-1',
      )
    ).id;
    intPartyId = (
      await ensureAccountInCategory(
        KACHI_MAAL_CATEGORY_NAMES.INT_PURCHASE,
        'GG Party Internal',
        AccountType.LIABILITY,
        'GG-INT-1',
      )
    ).id;

    const cats = await listProductCategories({ stockMode: 'QUANTITY' });
    const fertilizer = cats.find((c) => c.name === 'Fertilizer') ?? cats[0];
    if (!fertilizer) throw new Error('No QUANTITY product category');
    fertilizerCategoryId = fertilizer.id;

    const stamp = Date.now();
    const productA = await createProduct({
      name: `Fert A ${stamp}`,
      unit: 'bag',
      categoryId: fertilizerCategoryId,
      createdById: userId,
    });
    const productB = await createProduct({
      name: `Fert B ${stamp}`,
      unit: 'bag',
      categoryId: fertilizerCategoryId,
      createdById: userId,
    });
    await approveProduct(productA.id);
    await approveProduct(productB.id);
    productAId = productA.id;
    productBId = productB.id;
    productAAccountId = productA.accountId;

    const system = await prisma.$transaction((tx) => ensureGeneralGoodsAccounts(tx));
    mazduriId = system.mazduri.id;
    revenueId = system.saleRevenue.id;
  });

  it('updates WAC across two purchases and posts balanced multi-product legs', async () => {
    const pending1 = await createPurchaseGeneralInvoice({
      invoiceDate,
      partyAccountId: partyId,
      lines: [{ productId: productAId, quantity: 10, rate: 4500 }],
      createdById: userId,
    });
    expect(pending1.status).toBe('PENDING_APPROVAL');
    const beforeAvg = await prisma.product.findUniqueOrThrow({ where: { id: productAId } });
    expect(beforeAvg.averageCost).toBeNull();

    await approveInvoice(pending1.id);
    const after1 = await prisma.product.findUniqueOrThrow({ where: { id: productAId } });
    expect(Number(after1.averageCost)).toBe(4500);

    const pending2 = await createPurchaseGeneralInvoice({
      invoiceDate,
      partyAccountId: partyId,
      lines: [
        { productId: productAId, quantity: 5, rate: 6000 },
        { productId: productBId, quantity: 2, rate: 1000, mazduriAmount: 50 },
      ],
      createdById: userId,
    });
    await approveInvoice(pending2.id);

    const after2 = await prisma.product.findUniqueOrThrow({ where: { id: productAId } });
    expect(Number(after2.averageCost)).toBe(5000);

    const productB = await prisma.product.findUniqueOrThrow({ where: { id: productBId } });
    expect(Number(productB.averageCost)).toBe(1025); // (2000+50)/2

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: pending2.id },
      include: { vouchers: true },
    });
    expect(invoice.vouchers).toHaveLength(1);
    const legs = await voucherLegs(invoice.vouchers[0]!.voucherId);
    const debits = legs.filter((l) => l.type === 'DEBIT').reduce((s, l) => s + l.amount, 0);
    const credits = legs.filter((l) => l.type === 'CREDIT').reduce((s, l) => s + l.amount, 0);
    expect(Math.abs(debits - credits)).toBeLessThan(0.01);

    const partyLeg = legs.find(
      (l) => l.type === 'CREDIT' && l.amount === 32_000,
    );
    expect(partyLeg).toBeTruthy();
    expect(partyLeg!.description ?? '').toContain('Fert A');
    expect(partyLeg!.description ?? '').toContain('Fert B');

    const mazLeg = legs.find((l) => l.accountName === 'General Goods Mazduri');
    expect(mazLeg?.type).toBe('CREDIT');
    expect(mazLeg?.amount).toBe(50);

    const invALegs = legs.filter(
      (l) => l.type === 'DEBIT' && (l.description ?? '').startsWith('Fert A'),
    );
    expect(invALegs.length).toBeGreaterThanOrEqual(1);
    expect(invALegs.some((l) => l.amount === 30_000)).toBe(true);
  });

  it('allows negative quantity stock on sale and posts profit correctly', async () => {
    // Sell more than on-hand for product B (stock 2) — should allow negative
    const pendingSale = await createSaleGeneralInvoice({
      invoiceDate,
      salePartyAccountId: salePartyId,
      lines: [{ productId: productBId, quantity: 5, rate: 2000 }],
      createdById: userId,
    });
    expect(pendingSale.status).toBe('PENDING_APPROVAL');
    await approveInvoice(pendingSale.id);

    const report = await getQuantityStockReport({ productId: productBId });
    expect(report.totals.netBalance).toBe(-3);
    expect(report.stockMode).toBe('QUANTITY');

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: pendingSale.id },
      include: {
        vouchers: true,
        generalSaleLines: true,
      },
    });
    expect(Number(invoice.generalSaleLines[0]!.unitCost)).toBe(1025);

    const legs = await voucherLegs(invoice.vouchers[0]!.voucherId);
    const debits = legs.filter((l) => l.type === 'DEBIT').reduce((s, l) => s + l.amount, 0);
    const credits = legs.filter((l) => l.type === 'CREDIT').reduce((s, l) => s + l.amount, 0);
    expect(Math.abs(debits - credits)).toBeLessThan(0.01);

    // lineTotal 10000, cost 5125, profit 4875 → Cr inventory 5125, Cr revenue 4875, Dr customer 10000
    const revenueLeg = legs.find((l) => l.accountName === 'General Goods Sale Revenue');
    expect(revenueLeg?.type).toBe('CREDIT');
    expect(revenueLeg?.amount).toBe(4875);

    const customerLeg = legs.find((l) => l.type === 'DEBIT' && l.amount === 10_000);
    expect(customerLeg).toBeTruthy();

    void productAAccountId;
    void mazduriId;
    void revenueId;
  });

  it('shows readable approval descriptions for pending general invoices', async () => {
    const pendingPurchase = await createPurchaseGeneralInvoice({
      invoiceDate,
      partyAccountId: partyId,
      lines: [{ productId: productAId, quantity: 1, rate: 5000 }],
      createdById: userId,
    });
    const pendingSale = await createSaleGeneralInvoice({
      invoiceDate,
      salePartyAccountId: salePartyId,
      lines: [{ productId: productAId, quantity: 1, rate: 5500 }],
      createdById: userId,
    });

    const items = await listPendingApprovals();
    const purchaseItem = items.find((i) => i.kind === 'invoice' && i.id === pendingPurchase.id);
    const saleItem = items.find((i) => i.kind === 'invoice' && i.id === pendingSale.id);
    expect(purchaseItem?.description).toMatch(/Purchase: Fert A .*1@5000 from GG Party Supplier/);
    expect(saleItem?.description).toMatch(/Sale: Fert A .*1@5500 to GG Party Customer/);

    const purchaseDetail = await getPendingApprovalDetail('invoice', pendingPurchase.id);
    expect(purchaseDetail.approvalDescription).toMatch(/Purchase:.*from GG Party Supplier/);

    // Leave pending — do not approve (avoids changing stock for later tests).
  });

  it('allows Int. Purchase Party as sale settlement party (Sale Paunch parity)', async () => {
    const pendingSale = await createSaleGeneralInvoice({
      invoiceDate,
      salePartyAccountId: intPartyId,
      lines: [{ productId: productAId, quantity: 1, rate: 5100 }],
      createdById: userId,
    });
    expect(pendingSale.status).toBe('PENDING_APPROVAL');
    await approveInvoice(pendingSale.id);

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: pendingSale.id },
      include: { vouchers: true, salePartyAccount: true },
    });
    expect(invoice.salePartyAccountId).toBe(intPartyId);
    expect(invoice.vouchers).toHaveLength(1);
  });

  it('rejects non-party accounts on sale settlement', async () => {
    const bankCat = await prisma.accountCategory.findFirst({
      where: { isActive: true, name: { contains: 'Bank' } },
    });
    if (!bankCat) return;

    const bank = await prisma.account.findFirst({
      where: { isActive: true, status: RecordStatus.ACTIVE, categoryId: bankCat.id },
    });
    if (!bank) return;

    await expect(
      createSaleGeneralInvoice({
        invoiceDate,
        salePartyAccountId: bank.id,
        lines: [{ productId: productAId, quantity: 1, rate: 100 }],
        createdById: userId,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('creates and posts a General Trade buy+sell in one voucher with post-purchase WAC', async () => {
    const stamp = Date.now();
    const product = await createProduct({
      name: `GT Trade ${stamp}`,
      unit: 'bag',
      categoryId: fertilizerCategoryId,
      createdById: userId,
    });
    await approveProduct(product.id);

    await expect(
      createGeneralTradeInvoice({
        invoiceDate,
        partyAccountId: partyId,
        salePartyAccountId: salePartyId,
        lines: [
          {
            productId: product.id,
            quantity: 4,
            purchaseRate: 1000,
            saleRate: 1300,
          },
        ],
        createdById: userId,
      }),
    ).resolves.toMatchObject({ type: 'GENERAL_TRADE', status: 'PENDING_APPROVAL' });

    // Mismatched quantities must be rejected (API shape uses one shared quantity field,
    // so simulate unpaired lines via direct create after a paired success check).
    await expect(
      createGeneralTradeInvoice({
        invoiceDate,
        partyAccountId: partyId,
        salePartyAccountId: salePartyId,
        lines: [
          {
            productId: product.id,
            quantity: 2,
            purchaseRate: 1000,
            saleRate: 0,
          },
        ],
        createdById: userId,
      }),
    ).rejects.toBeInstanceOf(AppError);

    const pending = await createGeneralTradeInvoice({
      invoiceDate,
      partyAccountId: partyId,
      salePartyAccountId: salePartyId,
      lines: [
        {
          productId: product.id,
          quantity: 4,
          purchaseRate: 1000,
          saleRate: 1300,
        },
      ],
      createdById: userId,
    });
    expect(Number(pending.total)).toBe(5200);
    expect(pending.partyAccountId).toBe(partyId);
    expect(pending.salePartyAccountId).toBe(salePartyId);
    expect(pending.generalPurchaseLines).toHaveLength(1);
    expect(pending.generalSaleLines).toHaveLength(1);
    expect(Number(pending.generalSaleLines![0]!.unitCost)).toBe(1000);

    const detail = await getPendingApprovalDetail('invoice', pending.id);
    expect(detail.debitAccount?.name).toContain('GG Party Customer');
    expect(detail.creditAccount?.name).toContain('GG Party Supplier');
    expect(detail.creditAccount?.name).toContain('General Trade Revenue');
    expect(detail.debitAmount).toBe(5200);
    expect(detail.creditAmount).toBe(5200);

    await approveInvoice(pending.id);

    const posted = await prisma.invoice.findUniqueOrThrow({
      where: { id: pending.id },
      include: {
        vouchers: true,
        generalSaleLines: true,
      },
    });
    expect(posted.status).toBe('POSTED');
    expect(posted.vouchers).toHaveLength(1);

    const avg = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(Number(avg.averageCost)).toBe(1000);

    const legs = await voucherLegs(posted.vouchers[0]!.voucherId);
    const debits = legs.filter((l) => l.type === 'DEBIT').reduce((s, l) => s + l.amount, 0);
    const credits = legs.filter((l) => l.type === 'CREDIT').reduce((s, l) => s + l.amount, 0);
    expect(Math.abs(debits - credits)).toBeLessThan(0.01);

    const purchaseCredit = legs.find((l) => l.type === 'CREDIT' && l.amount === 4000);
    expect(purchaseCredit).toBeTruthy();
    const saleDebit = legs.find((l) => l.type === 'DEBIT' && l.amount === 5200);
    expect(saleDebit).toBeTruthy();
    const profit = legs.find(
      (l) => l.accountName === 'General Trade Revenue' && l.type === 'CREDIT',
    );
    expect(profit?.amount).toBe(1200);

    const stock = await getQuantityStockReport({ productId: product.id });
    expect(stock.totals.netBalance).toBe(0);
  });
});
