import { InvoiceType, PrismaClient, ProductStockMode } from '@prisma/client';
import { logger } from '../../lib/logger';
import { computeWeightedAverageCost } from '../stock/quantity-stock.service';
import { roundMoney } from '../invoices/purchase-maal.calculations';

/**
 * Idempotent: set Product.averageCost for QUANTITY products that still have null,
 * by replaying approved PURCHASE_GENERAL lines in chronological order.
 */
export async function backfillProductAverageCosts(db: PrismaClient) {
  const products = await db.product.findMany({
    where: {
      isActive: true,
      averageCost: null,
      category: { stockMode: ProductStockMode.QUANTITY },
    },
    select: { id: true, name: true },
  });
  if (products.length === 0) return { updated: 0 };

  let updated = 0;
  for (const product of products) {
    const lines = await db.generalPurchaseLine.findMany({
      where: {
        productId: product.id,
        invoice: {
          type: InvoiceType.PURCHASE_GENERAL,
          status: 'POSTED',
        },
      },
      include: { invoice: { select: { invoiceDate: true, createdAt: true } } },
      orderBy: [{ invoice: { invoiceDate: 'asc' } }, { id: 'asc' }],
    });

    if (lines.length === 0) continue;

    let qty = 0;
    let avg: number | null = null;
    for (const line of lines) {
      const purchaseQty = Number(line.quantity);
      const purchaseValue = roundMoney(Number(line.lineTotal) + Number(line.mazduriAmount));
      avg = computeWeightedAverageCost({
        oldQty: qty,
        oldAverageCost: avg,
        purchaseQty,
        purchaseValue,
      });
      qty = roundMoney(qty + purchaseQty);
    }

    // Also account for sales so qty matches movements if needed for future — averageCost
    // itself only depends on purchase history, so sales are ignored for the value.

    if (avg != null) {
      await db.product.update({
        where: { id: product.id },
        data: { averageCost: avg },
      });
      updated += 1;
    }
  }

  if (updated > 0) {
    logger.info('Backfilled product averageCost for general-goods products', { updated });
  }
  return { updated };
}

/** Ensure default product categories exist after migrations. */
export async function ensureProductCategorySeed(db: PrismaClient) {
  const { ensureGrainProductCategoryInTx, ensureDefaultQuantityCategoriesInTx } = await import(
    '../products/product-categories'
  );
  await db.$transaction(async (tx) => {
    await ensureGrainProductCategoryInTx(tx);
    await ensureDefaultQuantityCategoriesInTx(tx);
  });
}
