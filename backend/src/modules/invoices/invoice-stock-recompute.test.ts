import {
  AccountType,
  BoriThelaMode,
  InvoiceType,
  RecordStatus,
  StockBagType,
  StockDirection,
} from '@prisma/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma';
import { approveInvoice, approveProduct } from '../../test-helpers/approval';
import { voucherDateInActiveYear } from '../../test-helpers/financial-year';
import {
  ensureGeneralGoodsAccounts,
  ensureKachiMaalAccounts,
  ensureSalePaunchAccounts,
  KACHI_MAAL_CATEGORY_NAMES,
} from '../accounting/accounting.service';
import {
  addEmptyBardana,
  getEmptyBardanaReport,
} from '../inventory/bardana.service';
import { listProductCategories } from '../products/product-categories';
import { createProduct, MAAL_KHATA_CATEGORY_NAME } from '../products/products.service';
import { getProductQuantityOnHand, computeWeightedAverageCost } from '../stock/quantity-stock.service';
import { cancelInvoice } from './invoices.service';
import { createPurchaseGeneralInvoice } from './purchase-general.service';
import { createPurchaseMaalInvoice } from './purchase-maal.service';
import { createSaleGeneralInvoice } from './sale-general.service';
import { createSalePaunchInvoice } from './sale-paunch.service';

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

async function maalStockSnapshot(productId: number) {
  const movements = await prisma.stockMovement.findMany({
    where: {
      productId,
      invoiceType: InvoiceType.PURCHASE_MAAL,
      direction: StockDirection.IN,
    },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });
  const remainders = await prisma.stockRemainder.findMany({
    where: { productId },
  });
  const bagsByType: Record<string, number> = { BORI: 0, THELA: 0 };
  for (const row of movements) {
    bagsByType[row.bagType] = (bagsByType[row.bagType] ?? 0) + Number(row.bags);
  }
  const remainderByType: Record<string, number> = { BORI: 0, THELA: 0 };
  for (const row of remainders) {
    remainderByType[row.bagType] = Number(row.remainderKg);
  }
  return {
    bagsByType,
    remainderByType,
    movementCount: movements.length,
    totalBags: Object.values(bagsByType).reduce((sum, n) => sum + n, 0),
  };
}

describe('invoice cancel stock recompute', () => {
  let userId: number;
  let invoiceDate: string;
  let partyId: number;
  let salePartyId: number;
  let purchasePartyId: number;
  let fertilizerCategoryId: number;
  let stamp: number;

  beforeAll(async () => {
    invoiceDate = await voucherDateInActiveYear();
    const user = await prisma.user.findFirst();
    if (!user) throw new Error('Seed admin user first');
    userId = user.id;
    stamp = Date.now();

    await prisma.$transaction(async (tx) => {
      await ensureGeneralGoodsAccounts(tx);
      await ensureKachiMaalAccounts(tx);
      await ensureSalePaunchAccounts(tx);
    });

    partyId = (
      await ensureAccountInCategory(
        KACHI_MAAL_CATEGORY_NAMES.EXT_PURCHASE,
        `CancelStock GG Sup ${stamp}`,
        AccountType.LIABILITY,
        `CS-GG-SUP-${stamp}`,
      )
    ).id;
    salePartyId = (
      await ensureAccountInCategory(
        KACHI_MAAL_CATEGORY_NAMES.SALE_PARTY,
        `CancelStock GG Cus ${stamp}`,
        AccountType.ASSET,
        `CS-GG-CUS-${stamp}`,
      )
    ).id;
    purchasePartyId = (
      await ensureAccountInCategory(
        KACHI_MAAL_CATEGORY_NAMES.EXT_PURCHASE,
        `CancelStock PM Party ${stamp}`,
        AccountType.LIABILITY,
        `CS-PM-PARTY-${stamp}`,
      )
    ).id;

    const cats = await listProductCategories({ stockMode: 'QUANTITY' });
    const fertilizer = cats.find((c) => c.name === 'Fertilizer') ?? cats[0];
    if (!fertilizer) throw new Error('No QUANTITY product category');
    fertilizerCategoryId = fertilizer.id;
  });

  async function createApprovedPurchaseMaal(
    productId: number,
    line: {
      bagCount: number;
      bhartii: number;
      looseKg: number;
      dharanCount?: number;
    },
    billSuffix: string,
  ) {
    const pending = await createPurchaseMaalInvoice({
      invoiceDate,
      billNo: `CS-PM-${stamp}-${billSuffix}`,
      productId,
      marketFeeEnabled: false,
      mazduriEnabled: false,
      lowerBardanaMode: null,
      lowerBardanaQty: null,
      lowerBardanaRate: null,
      lines: [
        {
          partyAccountId: purchasePartyId,
          boriOrThelaMode: BoriThelaMode.BORI,
          bagCount: line.bagCount,
          bhartii: line.bhartii,
          dharanCount: line.dharanCount ?? 0,
          looseKg: line.looseKg,
          ratePerMaund: 2000,
        },
      ],
      createdById: userId,
    });
    await approveInvoice(pending.id);
    return pending;
  }

  async function createApprovedPurchaseGeneral(
    productId: number,
    quantity: number,
    rate: number,
  ) {
    const pending = await createPurchaseGeneralInvoice({
      invoiceDate,
      partyAccountId: partyId,
      lines: [{ productId, quantity, rate }],
      createdById: userId,
    });
    await approveInvoice(pending.id);
    return pending;
  }

  it('PURCHASE_MAAL: cancel middle invoice; remainder/stock matches invoices 1+3 only', async () => {
    const productUnderTest = await createProduct({ name: `CS Wheat Mid ${stamp}` });
    await approveProduct(productUnderTest.id);
    const category = await prisma.accountCategory.findUnique({
      where: { id: productUnderTest.account.categoryId },
    });
    expect(category?.name).toBe(MAAL_KHATA_CATEGORY_NAME);

    const controlProduct = await createProduct({ name: `CS Wheat Ctrl ${stamp}` });
    await approveProduct(controlProduct.id);

    const line1 = { bagCount: 5, bhartii: 100, looseKg: 40 };
    const line2 = { bagCount: 0, bhartii: 100, looseKg: 70 };
    const line3 = { bagCount: 2, bhartii: 100, looseKg: 20 };

    const inv1 = await createApprovedPurchaseMaal(productUnderTest.id, line1, 'A1');
    const inv2 = await createApprovedPurchaseMaal(productUnderTest.id, line2, 'A2');
    const inv3 = await createApprovedPurchaseMaal(productUnderTest.id, line3, 'A3');
    expect([inv1.id, inv2.id, inv3.id].every((id) => id > 0)).toBe(true);

    await createApprovedPurchaseMaal(controlProduct.id, line1, 'C1');
    await createApprovedPurchaseMaal(controlProduct.id, line3, 'C3');
    const controlSnap = await maalStockSnapshot(controlProduct.id);

    await cancelInvoice(inv2.id, userId);

    const afterCancel = await maalStockSnapshot(productUnderTest.id);
    expect(afterCancel.remainderByType.BORI).toBe(controlSnap.remainderByType.BORI);
    expect(afterCancel.bagsByType.BORI).toBe(controlSnap.bagsByType.BORI);
    expect(afterCancel.totalBags).toBe(controlSnap.totalBags);
    expect(afterCancel.remainderByType.BORI).toBe(60);
    expect(afterCancel.bagsByType.BORI).toBe(7);

    const cancelledMovements = await prisma.stockMovement.count({
      where: { invoiceId: inv2.id },
    });
    expect(cancelledMovements).toBe(0);

    const cancelledInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: inv2.id } });
    expect(cancelledInvoice.status).toBe('CANCELLED');
  });

  it('PURCHASE_GENERAL: cancel middle; averageCost matches 2-invoice replay (and sales affect WAC qty)', async () => {
    const product = await createProduct({
      name: `CS Fert Mid ${stamp}`,
      unit: 'bag',
      categoryId: fertilizerCategoryId,
      createdById: userId,
    });
    await approveProduct(product.id);

    const control = await createProduct({
      name: `CS Fert Ctrl ${stamp}`,
      unit: 'bag',
      categoryId: fertilizerCategoryId,
      createdById: userId,
    });
    await approveProduct(control.id);

    const inv1 = await createApprovedPurchaseGeneral(product.id, 10, 100);
    const inv2 = await createApprovedPurchaseGeneral(product.id, 5, 200);
    const inv3 = await createApprovedPurchaseGeneral(product.id, 10, 150);

    await createApprovedPurchaseGeneral(control.id, 10, 100);
    await createApprovedPurchaseGeneral(control.id, 10, 150);
    const controlAvg = Number(
      (await prisma.product.findUniqueOrThrow({ where: { id: control.id } })).averageCost,
    );
    expect(controlAvg).toBe(125);

    await cancelInvoice(inv2.id, userId);

    const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(Number(after.averageCost)).toBe(controlAvg);
    expect(Number(after.averageCost)).toBe(125);

    const onHand = await prisma.$transaction((tx) => getProductQuantityOnHand(tx, product.id));
    expect(onHand).toBe(20);

    const qtyForCancelled = await prisma.productQuantityMovement.count({
      where: { invoiceId: inv2.id },
    });
    expect(qtyForCancelled).toBe(0);
    expect(inv1.id).toBeTruthy();
    expect(inv3.id).toBeTruthy();

    // Sales must affect running qty used by subsequent WAC (live posting math).
    const productWithSale = await createProduct({
      name: `CS Fert SaleWAC ${stamp}`,
      unit: 'bag',
      categoryId: fertilizerCategoryId,
      createdById: userId,
    });
    await approveProduct(productWithSale.id);

    await createApprovedPurchaseGeneral(productWithSale.id, 10, 100);
    const salePending = await createSaleGeneralInvoice({
      invoiceDate,
      salePartyAccountId: salePartyId,
      lines: [{ productId: productWithSale.id, quantity: 4, rate: 120 }],
      createdById: userId,
    });
    await approveInvoice(salePending.id);
    const midPurchase = await createApprovedPurchaseGeneral(productWithSale.id, 10, 200);
    await createApprovedPurchaseGeneral(productWithSale.id, 6, 300);

    await cancelInvoice(midPurchase.id, userId);

    // Expected: buy 10@100 → avg 100 qty 10; sell 4 → qty 6; buy 6@300 →
    // (6*100 + 1800) / 12 = 200
    let expectedAvg: number | null = null;
    expectedAvg = computeWeightedAverageCost({
      oldQty: 0,
      oldAverageCost: null,
      purchaseQty: 10,
      purchaseValue: 1000,
    });
    expectedAvg = computeWeightedAverageCost({
      oldQty: 6,
      oldAverageCost: expectedAvg,
      purchaseQty: 6,
      purchaseValue: 1800,
    });

    const saleWacProduct = await prisma.product.findUniqueOrThrow({
      where: { id: productWithSale.id },
    });
    expect(Number(saleWacProduct.averageCost)).toBe(expectedAvg);
    expect(Number(saleWacProduct.averageCost)).toBe(200);
  });

  it('cancelling the most recent invoice of each stock-touching type restores prior state', async () => {
    const ggProduct = await createProduct({
      name: `CS Fert Latest ${stamp}`,
      unit: 'bag',
      categoryId: fertilizerCategoryId,
      createdById: userId,
    });
    await approveProduct(ggProduct.id);

    await createApprovedPurchaseGeneral(ggProduct.id, 8, 50);
    const latestPg = await createApprovedPurchaseGeneral(ggProduct.id, 2, 100);
    const beforeCancelPg = await prisma.product.findUniqueOrThrow({ where: { id: ggProduct.id } });
    expect(Number(beforeCancelPg.averageCost)).toBe(60);

    await cancelInvoice(latestPg.id, userId);
    const afterPg = await prisma.product.findUniqueOrThrow({ where: { id: ggProduct.id } });
    expect(Number(afterPg.averageCost)).toBe(50);
    const onHand = await prisma.$transaction((tx) => getProductQuantityOnHand(tx, ggProduct.id));
    expect(onHand).toBe(8);

    const maalProduct = await createProduct({ name: `CS Wheat Latest ${stamp}` });
    await approveProduct(maalProduct.id);
    await createApprovedPurchaseMaal(
      maalProduct.id,
      { bagCount: 3, bhartii: 100, looseKg: 25 },
      'L1',
    );
    const beforeMaal = await maalStockSnapshot(maalProduct.id);
    const latestPm = await createApprovedPurchaseMaal(
      maalProduct.id,
      { bagCount: 1, bhartii: 100, looseKg: 10 },
      'L2',
    );
    await cancelInvoice(latestPm.id, userId);
    const afterMaal = await maalStockSnapshot(maalProduct.id);
    expect(afterMaal).toEqual(beforeMaal);

    const salePending = await createSaleGeneralInvoice({
      invoiceDate,
      salePartyAccountId: salePartyId,
      lines: [{ productId: ggProduct.id, quantity: 1, rate: 80 }],
      createdById: userId,
    });
    await approveInvoice(salePending.id);
    const onHandBeforeSaleCancel = await prisma.$transaction((tx) =>
      getProductQuantityOnHand(tx, ggProduct.id),
    );
    expect(onHandBeforeSaleCancel).toBe(7);
    const avgBeforeSaleCancel = Number(
      (await prisma.product.findUniqueOrThrow({ where: { id: ggProduct.id } })).averageCost,
    );

    await cancelInvoice(salePending.id, userId);
    const onHandAfterSaleCancel = await prisma.$transaction((tx) =>
      getProductQuantityOnHand(tx, ggProduct.id),
    );
    expect(onHandAfterSaleCancel).toBe(8);
    const avgAfterSaleCancel = Number(
      (await prisma.product.findUniqueOrThrow({ where: { id: ggProduct.id } })).averageCost,
    );
    expect(avgAfterSaleCancel).toBe(avgBeforeSaleCancel);

    const spProduct = await createProduct({ name: `CS Wheat SP Latest ${stamp}` });
    await approveProduct(spProduct.id);
    await createApprovedPurchaseMaal(
      spProduct.id,
      { bagCount: 20, bhartii: 100, looseKg: 0 },
      'SPSEED',
    );
    await addEmptyBardana({ bagType: 'BORI', quantity: 50 });
    const emptyBefore = await getEmptyBardanaReport();
    const boriBefore = emptyBefore.balances.find((b) => b.bagType === 'BORI')!.balance;

    const spPending = await createSalePaunchInvoice({
      invoiceDate,
      salePartyAccountId: salePartyId,
      billNo: `CS-SP-LATEST-${stamp}`,
      lines: [
        {
          maalKhataAccountId: spProduct.accountId,
          boriOrThelaMode: BoriThelaMode.BORI,
          bagCount: 3,
          thelaCount: 0,
          compWeightKg: 300,
          upperRatePerMaund: 2000,
          lowerRatePerMaund: 2500,
          kanta: 0,
          dammiChecked: false,
        },
      ],
      createdById: userId,
    });
    await approveInvoice(spPending.id);

    const stockOutBeforeCancel = await prisma.stockMovement.count({
      where: { invoiceId: spPending.id, direction: StockDirection.OUT },
    });
    expect(stockOutBeforeCancel).toBe(1);

    await cancelInvoice(spPending.id, userId);

    const stockOutAfter = await prisma.stockMovement.count({
      where: { invoiceId: spPending.id },
    });
    expect(stockOutAfter).toBe(0);
    const emptyAfter = await getEmptyBardanaReport();
    const boriAfter = emptyAfter.balances.find((b) => b.bagType === 'BORI')!.balance;
    expect(boriAfter).toBe(boriBefore);
    const emptyMoves = await prisma.emptyBardanaMovement.count({
      where: { invoiceId: spPending.id },
    });
    expect(emptyMoves).toBe(0);
  });

  it('SALE_GENERAL / SALE_PAUNCH cancel deletes movements without touching WAC or Maal remainder', async () => {
    const ggProduct = await createProduct({
      name: `CS Fert SaleOnly ${stamp}`,
      unit: 'bag',
      categoryId: fertilizerCategoryId,
      createdById: userId,
    });
    await approveProduct(ggProduct.id);
    await createApprovedPurchaseGeneral(ggProduct.id, 12, 40);
    const avgBefore = Number(
      (await prisma.product.findUniqueOrThrow({ where: { id: ggProduct.id } })).averageCost,
    );
    expect(avgBefore).toBe(40);

    const sale = await createSaleGeneralInvoice({
      invoiceDate,
      salePartyAccountId: salePartyId,
      lines: [{ productId: ggProduct.id, quantity: 3, rate: 55 }],
      createdById: userId,
    });
    await approveInvoice(sale.id);
    expect(await prisma.$transaction((tx) => getProductQuantityOnHand(tx, ggProduct.id))).toBe(9);

    await cancelInvoice(sale.id, userId);

    expect(await prisma.$transaction((tx) => getProductQuantityOnHand(tx, ggProduct.id))).toBe(12);
    expect(
      Number((await prisma.product.findUniqueOrThrow({ where: { id: ggProduct.id } })).averageCost),
    ).toBe(avgBefore);
    expect(await prisma.productQuantityMovement.count({ where: { invoiceId: sale.id } })).toBe(0);

    const maalProduct = await createProduct({ name: `CS Wheat SaleOnly ${stamp}` });
    await approveProduct(maalProduct.id);
    await createApprovedPurchaseMaal(
      maalProduct.id,
      { bagCount: 15, bhartii: 100, looseKg: 35 },
      'SO1',
    );
    const remainderBefore = await maalStockSnapshot(maalProduct.id);

    await addEmptyBardana({ bagType: 'BORI', quantity: 20 });
    const emptyBefore = await getEmptyBardanaReport();
    const boriBefore = emptyBefore.balances.find((b) => b.bagType === 'BORI')!.balance;

    const sp = await createSalePaunchInvoice({
      invoiceDate,
      salePartyAccountId: salePartyId,
      billNo: `CS-SP-SO-${stamp}`,
      lines: [
        {
          maalKhataAccountId: maalProduct.accountId,
          boriOrThelaMode: BoriThelaMode.BORI,
          bagCount: 2,
          thelaCount: 0,
          compWeightKg: 200,
          upperRatePerMaund: 2000,
          lowerRatePerMaund: 2200,
          kanta: 0,
          dammiChecked: false,
        },
      ],
      createdById: userId,
    });
    await approveInvoice(sp.id);

    await cancelInvoice(sp.id, userId);

    const remainderAfter = await maalStockSnapshot(maalProduct.id);
    expect(remainderAfter.remainderByType.BORI).toBe(remainderBefore.remainderByType.BORI);
    expect(remainderAfter.bagsByType.BORI).toBe(remainderBefore.bagsByType.BORI);
    expect(await prisma.stockMovement.count({ where: { invoiceId: sp.id } })).toBe(0);

    const emptyAfter = await getEmptyBardanaReport();
    expect(emptyAfter.balances.find((b) => b.bagType === 'BORI')!.balance).toBe(boriBefore);
    expect(await prisma.emptyBardanaMovement.count({ where: { invoiceId: sp.id } })).toBe(0);

    // Maal remainder types unused stay zero
    expect(remainderAfter.remainderByType[StockBagType.THELA] ?? 0).toBe(0);
  });
});
