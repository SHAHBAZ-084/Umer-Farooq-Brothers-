import { InvoiceStatus, InvoiceType, Prisma, StockDirection } from '@prisma/client';
import { AppError } from '../../utils/helpers';
import { roundMoney } from '../invoices/purchase-maal.calculations';

type Tx = Prisma.TransactionClient;

/** Signed on-hand quantity from ProductQuantityMovement (can be negative). */
export async function getProductQuantityOnHand(tx: Tx, productId: number): Promise<number> {
  const movements = await tx.productQuantityMovement.findMany({
    where: { productId },
    select: { direction: true, quantity: true },
  });
  let qty = 0;
  for (const m of movements) {
    const n = Number(m.quantity);
    qty += m.direction === StockDirection.IN ? n : -n;
  }
  return roundMoney(qty);
}

export async function postGeneralPurchaseQuantityIn(
  tx: Tx,
  data: {
    invoiceId: number;
    invoiceReference: string;
    invoiceDate: Date;
    lines: Array<{ productId: number; quantity: number }>;
    invoiceType?: InvoiceType;
  },
) {
  const invoiceType = data.invoiceType ?? InvoiceType.PURCHASE_GENERAL;
  for (const line of data.lines) {
    if (!(line.quantity > 0)) continue;
    await tx.productQuantityMovement.create({
      data: {
        productId: line.productId,
        direction: StockDirection.IN,
        quantity: line.quantity,
        date: data.invoiceDate,
        invoiceId: data.invoiceId,
        invoiceType,
        invoiceReference: data.invoiceReference,
        description: data.invoiceReference,
      },
    });
  }
}

export async function postGeneralSaleQuantityOut(
  tx: Tx,
  data: {
    invoiceId: number;
    invoiceReference: string;
    invoiceDate: Date;
    lines: Array<{ productId: number; quantity: number }>;
    invoiceType?: InvoiceType;
  },
) {
  const invoiceType = data.invoiceType ?? InvoiceType.SALE_GENERAL;
  for (const line of data.lines) {
    if (!(line.quantity > 0)) continue;
    await tx.productQuantityMovement.create({
      data: {
        productId: line.productId,
        direction: StockDirection.OUT,
        quantity: line.quantity,
        date: data.invoiceDate,
        invoiceId: data.invoiceId,
        invoiceType,
        invoiceReference: data.invoiceReference,
        description: data.invoiceReference,
      },
    });
  }
}

/**
 * Weighted average cost after a purchase receipt.
 * newAvg = (oldQty × oldAvg + purchaseValue) / (oldQty + purchaseQty)
 */
export function computeWeightedAverageCost(params: {
  oldQty: number;
  oldAverageCost: number | null | undefined;
  purchaseQty: number;
  purchaseValue: number;
}): number | null {
  const purchaseQty = Number(params.purchaseQty);
  if (!(purchaseQty > 0)) return params.oldAverageCost != null ? Number(params.oldAverageCost) : null;

  const oldQty = Number(params.oldQty);
  const oldAvg = params.oldAverageCost != null ? Number(params.oldAverageCost) : 0;
  const newQty = oldQty + purchaseQty;
  if (Math.abs(newQty) < 1e-9) return null;

  const existingValue = oldQty * oldAvg;
  return roundMoney((existingValue + Number(params.purchaseValue)) / newQty);
}

export async function applyPurchaseWeightedAverageCost(
  tx: Tx,
  productId: number,
  purchaseQty: number,
  purchaseValue: number,
) {
  const product = await tx.product.findFirst({ where: { id: productId } });
  if (!product) throw new AppError(400, 'Product not found for average cost update');

  const oldQty = await getProductQuantityOnHand(tx, productId);
  const next = computeWeightedAverageCost({
    oldQty,
    oldAverageCost: product.averageCost != null ? Number(product.averageCost) : null,
    purchaseQty,
    purchaseValue,
  });

  await tx.product.update({
    where: { id: productId },
    data: { averageCost: next },
  });

  return next;
}

/**
 * Replay Product.averageCost from remaining POSTED purchase history.
 * Sale OUT events adjust running qty only — matching live applyPurchaseWeightedAverageCost
 * which reads getProductQuantityOnHand before each purchase.
 * Call AFTER this invoice is CANCELLED and its ProductQuantityMovement rows are deleted.
 */
export async function recomputeAverageCostInTx(tx: Tx, productId: number) {
  await tx.product.update({
    where: { id: productId },
    data: { averageCost: null },
  });

  const purchaseLines = await tx.generalPurchaseLine.findMany({
    where: {
      productId,
      invoice: {
        status: InvoiceStatus.POSTED,
        type: { in: [InvoiceType.PURCHASE_GENERAL, InvoiceType.GENERAL_TRADE] },
      },
    },
    include: {
      invoice: { select: { id: true, invoiceDate: true, createdAt: true } },
    },
  });

  const saleLines = await tx.generalSaleLine.findMany({
    where: {
      productId,
      invoice: {
        status: InvoiceStatus.POSTED,
        type: { in: [InvoiceType.SALE_GENERAL, InvoiceType.GENERAL_TRADE] },
      },
    },
    include: {
      invoice: { select: { id: true, invoiceDate: true, createdAt: true } },
    },
  });

  type Event = {
    sortDate: number;
    invoiceId: number;
    lineId: number;
    kind: 'purchase' | 'sale';
    qty: number;
    purchaseValue?: number;
  };

  const events: Event[] = [];
  for (const line of purchaseLines) {
    const d = line.invoice.invoiceDate ?? line.invoice.createdAt;
    events.push({
      sortDate: d.getTime(),
      invoiceId: line.invoiceId,
      lineId: line.id,
      kind: 'purchase',
      qty: Number(line.quantity),
      purchaseValue: roundMoney(Number(line.lineTotal) + Number(line.mazduriAmount)),
    });
  }
  for (const line of saleLines) {
    const d = line.invoice.invoiceDate ?? line.invoice.createdAt;
    events.push({
      sortDate: d.getTime(),
      invoiceId: line.invoiceId,
      lineId: line.id,
      kind: 'sale',
      qty: Number(line.quantity),
    });
  }

  events.sort((a, b) => {
    if (a.sortDate !== b.sortDate) return a.sortDate - b.sortDate;
    if (a.invoiceId !== b.invoiceId) return a.invoiceId - b.invoiceId;
    // Match GENERAL_TRADE post order: WAC/purchase before sale OUT on same invoice.
    if (a.kind !== b.kind) return a.kind === 'purchase' ? -1 : 1;
    return a.lineId - b.lineId;
  });

  let qty = 0;
  let avg: number | null = null;
  for (const event of events) {
    if (event.kind === 'purchase') {
      avg = computeWeightedAverageCost({
        oldQty: qty,
        oldAverageCost: avg,
        purchaseQty: event.qty,
        purchaseValue: event.purchaseValue ?? 0,
      });
      qty = roundMoney(qty + event.qty);
    } else {
      qty = roundMoney(qty - event.qty);
    }
  }

  await tx.product.update({
    where: { id: productId },
    data: { averageCost: avg },
  });

  return avg;
}

/** Delete quantity + Sale Paunch bag OUT rows for one invoice. Returns touched productIds. */
export async function deleteInvoiceStockMovementsInTx(tx: Tx, invoiceId: number) {
  const qtyRows = await tx.productQuantityMovement.findMany({
    where: { invoiceId },
    select: { productId: true },
  });
  const bagOutRows = await tx.stockMovement.findMany({
    where: {
      invoiceId,
      invoiceType: InvoiceType.SALE_PAUNCH,
      direction: StockDirection.OUT,
    },
    select: { productId: true },
  });

  await tx.productQuantityMovement.deleteMany({ where: { invoiceId } });
  await tx.stockMovement.deleteMany({
    where: {
      invoiceId,
      invoiceType: InvoiceType.SALE_PAUNCH,
      direction: StockDirection.OUT,
    },
  });

  return [...new Set([...qtyRows, ...bagOutRows].map((row) => row.productId))];
}
