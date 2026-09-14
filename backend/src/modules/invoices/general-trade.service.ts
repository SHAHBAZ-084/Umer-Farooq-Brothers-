import {
  InvoiceStatus,
  InvoiceType,
  LedgerEntryType,
  Prisma,
  VoucherType,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';
import {
  createMultiLegVoucherInTx,
  ensureGeneralGoodsAccounts,
  getActiveFinancialYearId,
  type VoucherLeg,
} from '../accounting/accounting.service';
import { roundMoney } from './purchase-maal.calculations';
import {
  applyPurchaseWeightedAverageCost,
  computeWeightedAverageCost,
  getProductQuantityOnHand,
  postGeneralPurchaseQuantityIn,
  postGeneralSaleQuantityOut,
} from '../stock/quantity-stock.service';
import {
  assertPurchasePartyAccount,
  buildPurchaseGeneralComputedLines,
  buildPurchaseGeneralLedgerLegs,
  resolveQuantityProduct,
  type ComputedPurchaseGeneralLine,
  type PurchaseGeneralLineInput,
} from './purchase-general.service';
import {
  assertSalePartyAccount,
  buildSaleGeneralComputedLines,
  buildSaleGeneralLedgerLegs,
  type ComputedSaleGeneralLine,
  type SaleGeneralLineInput,
} from './sale-general.service';
import { allocateNextInvoiceReference } from './invoice-reference';

export async function getNextGeneralTradeReference() {
  return prisma.$transaction(async (tx) => {
    await ensureGeneralGoodsAccounts(tx);
    const { reference } = await allocateNextInvoiceReference(tx, InvoiceType.GENERAL_TRADE);
    return { reference };
  });
}

export type GeneralTradeLineInput = {
  productId: number;
  /** Shared purchase + sale quantity — must match on both sides. */
  quantity: number;
  purchaseRate: number;
  saleRate: number;
  mazduriAmount?: number;
};

export type CreateGeneralTradeInput = {
  invoiceDate: string;
  partyAccountId: number;
  salePartyAccountId: number;
  billNo?: string;
  tafseel?: string;
  lines: GeneralTradeLineInput[];
  createdById: number;
};

export type UpdateGeneralTradeInput = Omit<CreateGeneralTradeInput, 'createdById'>;

function assertMatchingQuantities(
  purchaseLines: ComputedPurchaseGeneralLine[],
  saleLines: Array<SaleGeneralLineInput & { productName: string }>,
) {
  if (purchaseLines.length !== saleLines.length) {
    throw new AppError(400, 'Purchase and sale lines must be paired one-to-one');
  }
  for (let i = 0; i < purchaseLines.length; i += 1) {
    const purchase = purchaseLines[i]!;
    const sale = saleLines[i]!;
    if (purchase.productId !== sale.productId) {
      throw new AppError(
        400,
        `Purchase and sale product mismatch for line ${i + 1} (${purchase.productName})`,
      );
    }
    if (Math.abs(purchase.quantity - Number(sale.quantity)) > 1e-9) {
      throw new AppError(
        400,
        `Purchase and sale quantity must match for ${purchase.productName}`,
      );
    }
  }
}

function assertCombinedLegsBalance(legs: VoucherLeg[]) {
  const totalDebits = roundMoney(
    legs.filter((l) => l.type === LedgerEntryType.DEBIT).reduce((s, l) => s + l.amount, 0),
  );
  const totalCredits = roundMoney(
    legs.filter((l) => l.type === LedgerEntryType.CREDIT).reduce((s, l) => s + l.amount, 0),
  );
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new AppError(500, 'General Trade voucher debits and credits do not balance');
  }
  return { totalDebits, totalCredits };
}

/**
 * Project post-purchase average costs for sale costing without writing WAC yet.
 * Applies purchases in line order so repeated products accumulate correctly.
 */
async function projectUnitCostsAfterPurchase(
  tx: Prisma.TransactionClient,
  purchaseLines: ComputedPurchaseGeneralLine[],
): Promise<Map<number, number>> {
  type Running = { qty: number; avg: number | null };
  const running = new Map<number, Running>();
  const unitCosts = new Map<number, number>();

  for (const line of purchaseLines) {
    let state = running.get(line.productId);
    if (!state) {
      const product = await tx.product.findFirst({ where: { id: line.productId } });
      const onHand = await getProductQuantityOnHand(tx, line.productId);
      state = {
        qty: onHand,
        avg: product?.averageCost != null ? Number(product.averageCost) : null,
      };
    }
    const nextAvg = computeWeightedAverageCost({
      oldQty: state.qty,
      oldAverageCost: state.avg,
      purchaseQty: line.quantity,
      purchaseValue: line.inventoryDebit,
    });
    state = {
      qty: state.qty + line.quantity,
      avg: nextAvg,
    };
    running.set(line.productId, state);
    unitCosts.set(line.productId, nextAvg != null ? nextAvg : 0);
  }

  return unitCosts;
}

async function buildTradeComputed(
  tx: Prisma.TransactionClient,
  data: {
    lines: GeneralTradeLineInput[];
    /** When set, use these unit costs instead of projecting (approve path after WAC write). */
    unitCostByProductId?: Map<number, number>;
  },
) {
  const { assertProductApprovedForPosting } = await import('../approvals/approval-guards');

  const purchaseResolved: Array<PurchaseGeneralLineInput & { productName: string; accountId: number }> =
    [];
  const saleMeta: Array<{ productId: number; productName: string; accountId: number; quantity: number; saleRate: number }> =
    [];

  for (const line of data.lines) {
    await assertProductApprovedForPosting(tx, line.productId);
    const product = await resolveQuantityProduct(tx, line.productId);
    const quantity = Number(line.quantity);
    purchaseResolved.push({
      productId: line.productId,
      quantity,
      rate: Number(line.purchaseRate),
      mazduriAmount: line.mazduriAmount,
      productName: product.name,
      accountId: product.accountId,
    });
    saleMeta.push({
      productId: line.productId,
      productName: product.name,
      accountId: product.accountId,
      quantity,
      saleRate: Number(line.saleRate),
    });
  }

  const purchaseComputed = buildPurchaseGeneralComputedLines(purchaseResolved);
  assertMatchingQuantities(
    purchaseComputed,
    saleMeta.map((s) => ({
      productId: s.productId,
      quantity: s.quantity,
      rate: s.saleRate,
      productName: s.productName,
    })),
  );

  const unitCostByProduct =
    data.unitCostByProductId ?? (await projectUnitCostsAfterPurchase(tx, purchaseComputed));

  const saleResolved: Array<
    SaleGeneralLineInput & { productName: string; accountId: number; unitCost: number }
  > = saleMeta.map((row) => ({
    productId: row.productId,
    quantity: row.quantity,
    rate: row.saleRate,
    productName: row.productName,
    accountId: row.accountId,
    unitCost: unitCostByProduct.get(row.productId) ?? 0,
  }));

  const saleComputed = buildSaleGeneralComputedLines(saleResolved);
  return { purchaseComputed, saleComputed };
}

function combineTradeLegs(params: {
  purchaseComputed: ComputedPurchaseGeneralLine[];
  saleComputed: ComputedSaleGeneralLine[];
  partyAccountId: number;
  salePartyAccountId: number;
  mazduriAccountId: number;
  generalTradeRevenueAccountId: number;
  reference: string;
}) {
  const purchaseBuilt = buildPurchaseGeneralLedgerLegs(
    params.purchaseComputed,
    params.partyAccountId,
    params.mazduriAccountId,
    params.reference,
  );
  const saleBuilt = buildSaleGeneralLedgerLegs(
    params.saleComputed,
    params.salePartyAccountId,
    params.generalTradeRevenueAccountId,
    params.reference,
  );
  const legs = [...purchaseBuilt.legs, ...saleBuilt.legs];
  const { totalDebits, totalCredits } = assertCombinedLegsBalance(legs);
  return {
    legs,
    totalDebits,
    totalCredits,
    goodsTotal: purchaseBuilt.goodsTotal,
    mazduriTotal: purchaseBuilt.mazduriTotal,
    invoiceTotal: saleBuilt.invoiceTotal,
  };
}

export async function createGeneralTradeInvoice(data: CreateGeneralTradeInput) {
  if (!data.lines.length) throw new AppError(400, 'At least one line is required');

  return prisma.$transaction(async (tx) => {
    await getActiveFinancialYearId(tx);
    const systemAccounts = await ensureGeneralGoodsAccounts(tx);
    await assertPurchasePartyAccount(tx, data.partyAccountId);
    await assertSalePartyAccount(tx, data.salePartyAccountId);

    const { purchaseComputed, saleComputed } = await buildTradeComputed(tx, { lines: data.lines });
    const { number, reference } = await allocateNextInvoiceReference(tx, InvoiceType.GENERAL_TRADE);
    const { legs, totalDebits, totalCredits, invoiceTotal, goodsTotal } = combineTradeLegs({
      purchaseComputed,
      saleComputed,
      partyAccountId: data.partyAccountId,
      salePartyAccountId: data.salePartyAccountId,
      mazduriAccountId: systemAccounts.mazduri.id,
      generalTradeRevenueAccountId: systemAccounts.generalTradeRevenue.id,
      reference,
    });

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new AppError(500, 'Invoice debits and credits do not balance — save aborted');
    }

    const financialYearId = await getActiveFinancialYearId(tx);
    const invoiceDate = new Date(data.invoiceDate);

    const invoice = await tx.invoice.create({
      data: {
        type: InvoiceType.GENERAL_TRADE,
        status: InvoiceStatus.PENDING_APPROVAL,
        number,
        reference,
        invoiceDate,
        billNo: data.billNo?.trim() || null,
        tafseel: data.tafseel?.trim() || null,
        notes: data.tafseel?.trim() || null,
        partyAccountId: data.partyAccountId,
        salePartyAccountId: data.salePartyAccountId,
        // Customer-facing sale total (purchase cost / mazduri live on purchase lines)
        total: invoiceTotal,
        financialYearId,
        createdById: data.createdById,
        generalPurchaseLines: {
          create: purchaseComputed.map((line, index) => ({
            productId: line.productId,
            quantity: line.quantity,
            rate: line.rate,
            lineTotal: line.lineTotal,
            mazduriAmount: line.mazduriAmount,
            sortOrder: index,
          })),
        },
        generalSaleLines: {
          create: saleComputed.map((line, index) => ({
            productId: line.productId,
            quantity: line.quantity,
            rate: line.rate,
            lineTotal: line.lineTotal,
            unitCost: line.unitCost,
            sortOrder: index,
          })),
        },
      },
    });

    void legs;
    void goodsTotal;

    return tx.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: {
        generalPurchaseLines: { include: { product: true }, orderBy: { sortOrder: 'asc' } },
        generalSaleLines: { include: { product: true }, orderBy: { sortOrder: 'asc' } },
        partyAccount: true,
        salePartyAccount: true,
        createdBy: { select: { id: true, displayName: true, username: true } },
      },
    });
  });
}

export async function updatePendingGeneralTradeInvoice(
  invoiceId: number,
  data: UpdateGeneralTradeInput,
  userId: number,
) {
  void userId;
  if (!data.lines.length) throw new AppError(400, 'At least one line is required');

  return prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findFirst({
      where: {
        id: invoiceId,
        type: InvoiceType.GENERAL_TRADE,
        status: InvoiceStatus.PENDING_APPROVAL,
      },
      select: { id: true, reference: true },
    });
    if (!existing) throw new AppError(404, 'Pending General Trade invoice not found');

    await getActiveFinancialYearId(tx);
    const systemAccounts = await ensureGeneralGoodsAccounts(tx);
    await assertPurchasePartyAccount(tx, data.partyAccountId);
    await assertSalePartyAccount(tx, data.salePartyAccountId);

    const { purchaseComputed, saleComputed } = await buildTradeComputed(tx, { lines: data.lines });
    const { legs, totalDebits, totalCredits, invoiceTotal, goodsTotal } = combineTradeLegs({
      purchaseComputed,
      saleComputed,
      partyAccountId: data.partyAccountId,
      salePartyAccountId: data.salePartyAccountId,
      mazduriAccountId: systemAccounts.mazduri.id,
      generalTradeRevenueAccountId: systemAccounts.generalTradeRevenue.id,
      reference: existing.reference,
    });

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new AppError(500, 'Invoice debits and credits do not balance — save aborted');
    }

    await tx.generalPurchaseLine.deleteMany({ where: { invoiceId: existing.id } });
    await tx.generalSaleLine.deleteMany({ where: { invoiceId: existing.id } });
    await tx.invoice.update({
      where: { id: existing.id },
      data: {
        invoiceDate: new Date(data.invoiceDate),
        billNo: data.billNo?.trim() || null,
        tafseel: data.tafseel?.trim() || null,
        notes: data.tafseel?.trim() || null,
        partyAccountId: data.partyAccountId,
        salePartyAccountId: data.salePartyAccountId,
        total: invoiceTotal,
        generalPurchaseLines: {
          create: purchaseComputed.map((line, index) => ({
            productId: line.productId,
            quantity: line.quantity,
            rate: line.rate,
            lineTotal: line.lineTotal,
            mazduriAmount: line.mazduriAmount,
            sortOrder: index,
          })),
        },
        generalSaleLines: {
          create: saleComputed.map((line, index) => ({
            productId: line.productId,
            quantity: line.quantity,
            rate: line.rate,
            lineTotal: line.lineTotal,
            unitCost: line.unitCost,
            sortOrder: index,
          })),
        },
      },
    });

    void legs;
    void goodsTotal;

    return tx.invoice.findUniqueOrThrow({
      where: { id: existing.id },
      include: {
        generalPurchaseLines: { include: { product: true }, orderBy: { sortOrder: 'asc' } },
        generalSaleLines: { include: { product: true }, orderBy: { sortOrder: 'asc' } },
        partyAccount: true,
        salePartyAccount: true,
        createdBy: { select: { id: true, displayName: true, username: true } },
      },
    });
  });
}

export async function approvePendingGeneralTradeInvoice(
  tx: Prisma.TransactionClient,
  invoiceId: number,
) {
  const invoice = await tx.invoice.findFirst({
    where: {
      id: invoiceId,
      type: InvoiceType.GENERAL_TRADE,
      status: InvoiceStatus.PENDING_APPROVAL,
    },
    include: {
      generalPurchaseLines: {
        include: { product: true },
        orderBy: { sortOrder: 'asc' },
      },
      generalSaleLines: {
        include: { product: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  if (!invoice) throw new AppError(404, 'Pending General Trade invoice not found');
  if (!invoice.partyAccountId) throw new AppError(400, 'Invoice missing purchase party account');
  if (!invoice.salePartyAccountId) throw new AppError(400, 'Invoice missing sale party account');
  if (!invoice.invoiceDate) throw new AppError(400, 'Invoice missing date');

  const existingLink = await tx.invoiceVoucher.findFirst({ where: { invoiceId } });
  if (existingLink) throw new AppError(400, 'Invoice already posted');

  const systemAccounts = await ensureGeneralGoodsAccounts(tx);
  await assertPurchasePartyAccount(tx, invoice.partyAccountId);
  await assertSalePartyAccount(tx, invoice.salePartyAccountId);

  if (invoice.generalPurchaseLines.length !== invoice.generalSaleLines.length) {
    throw new AppError(400, 'General Trade invoice has unpaired purchase/sale lines');
  }

  const lines: GeneralTradeLineInput[] = invoice.generalPurchaseLines.map((purchase, index) => {
    const sale = invoice.generalSaleLines[index];
    if (!sale || sale.productId !== purchase.productId) {
      throw new AppError(400, 'General Trade purchase/sale lines are misaligned');
    }
    const purchaseQty = Number(purchase.quantity);
    const saleQty = Number(sale.quantity);
    if (Math.abs(purchaseQty - saleQty) > 1e-9) {
      throw new AppError(
        400,
        `Purchase and sale quantity must match for ${purchase.product?.name ?? 'product'}`,
      );
    }
    return {
      productId: purchase.productId,
      quantity: purchaseQty,
      purchaseRate: Number(purchase.rate),
      saleRate: Number(sale.rate),
      mazduriAmount: Number(purchase.mazduriAmount),
    };
  });

  const { purchaseComputed } = await buildTradeComputed(tx, { lines });

  // Apply WAC for real before resolving sale unit costs
  const unitCostByProductId = new Map<number, number>();
  for (const line of purchaseComputed) {
    const next = await applyPurchaseWeightedAverageCost(
      tx,
      line.productId,
      line.quantity,
      line.inventoryDebit,
    );
    unitCostByProductId.set(line.productId, next != null ? next : 0);
  }

  const rebuilt = await buildTradeComputed(tx, { lines, unitCostByProductId });
  const { legs, invoiceTotal, goodsTotal } = combineTradeLegs({
    purchaseComputed: rebuilt.purchaseComputed,
    saleComputed: rebuilt.saleComputed,
    partyAccountId: invoice.partyAccountId,
    salePartyAccountId: invoice.salePartyAccountId,
    mazduriAccountId: systemAccounts.mazduri.id,
    generalTradeRevenueAccountId: systemAccounts.generalTradeRevenue.id,
    reference: invoice.reference,
  });

  // Persist refreshed unit costs used for posting
  for (let i = 0; i < rebuilt.saleComputed.length; i += 1) {
    const saleLine = invoice.generalSaleLines[i];
    const computed = rebuilt.saleComputed[i];
    if (!saleLine || !computed) continue;
    await tx.generalSaleLine.update({
      where: { id: saleLine.id },
      data: { unitCost: computed.unitCost, lineTotal: computed.lineTotal },
    });
  }

  const voucher = await createMultiLegVoucherInTx(tx, {
    type: VoucherType.GENERAL_TRADE,
    legs,
    amount: invoiceTotal,
    date: invoice.invoiceDate,
    description: `General Trade ${invoice.reference}`,
    reference: invoice.reference,
    createdById: invoice.createdById,
  });

  await tx.invoiceVoucher.create({
    data: { invoiceId: invoice.id, voucherId: voucher.id },
  });

  await postGeneralPurchaseQuantityIn(tx, {
    invoiceId: invoice.id,
    invoiceReference: invoice.reference,
    invoiceDate: invoice.invoiceDate,
    invoiceType: InvoiceType.GENERAL_TRADE,
    lines: rebuilt.purchaseComputed.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
    })),
  });

  await postGeneralSaleQuantityOut(tx, {
    invoiceId: invoice.id,
    invoiceReference: invoice.reference,
    invoiceDate: invoice.invoiceDate,
    invoiceType: InvoiceType.GENERAL_TRADE,
    lines: rebuilt.saleComputed.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
    })),
  });

  void goodsTotal;

  return tx.invoice.update({
    where: { id: invoice.id },
    data: { status: InvoiceStatus.POSTED, total: invoiceTotal },
    include: {
      generalPurchaseLines: { include: { product: true }, orderBy: { sortOrder: 'asc' } },
      generalSaleLines: { include: { product: true }, orderBy: { sortOrder: 'asc' } },
      partyAccount: true,
      salePartyAccount: true,
      vouchers: { include: { voucher: true } },
    },
  });
}
