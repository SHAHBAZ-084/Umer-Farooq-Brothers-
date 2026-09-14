import { Prisma, StockBagType, StockDirection } from '@prisma/client';
import { AppError } from '../../utils/helpers';
import {
  bagTypeFromMode,
  computeStockOutBags,
  type StockBagKind,
} from '../stock/stock.calculations';
import {
  resolveSalePaunchStockProduct,
  type SalePaunchStockLine,
} from '../stock/stock.service';

type Tx = Prisma.TransactionClient;

function toStockBagType(kind: StockBagKind): StockBagType {
  return kind === 'THELA' ? StockBagType.THELA : StockBagType.BORI;
}

async function netStockBags(
  tx: Tx,
  productId: number,
  bagType: StockBagType,
): Promise<number> {
  const movements = await tx.stockMovement.findMany({
    where: { productId, bagType },
    select: { direction: true, bags: true },
  });

  let net = 0;
  for (const movement of movements) {
    const bags = Number(movement.bags);
    net += movement.direction === StockDirection.IN ? bags : -bags;
  }
  return net;
}

/** Reject OUT movements that would take product stock below zero. */
export async function assertStockAvailableForOut(
  tx: Tx,
  productId: number,
  bagType: StockBagType,
  bagsOut: number,
  productName: string,
): Promise<void> {
  if (!(bagsOut > 0)) return;
  const net = await netStockBags(tx, productId, bagType);
  if (net - bagsOut < -0.001) {
    const label = bagType === StockBagType.THELA ? 'Thela' : 'Bori';
    throw new AppError(
      400,
      `Insufficient ${label} stock for "${productName}" (available ${net}, requested ${bagsOut})`,
    );
  }
}

/** Reject sale-paunch OUT lines that would take product stock below zero. */
export async function assertStockAvailableForSalePaunchOut(
  tx: Tx,
  lines: SalePaunchStockLine[],
): Promise<void> {
  const requiredByProduct = new Map<
    string,
    { productId: number; productName: string; bagType: StockBagType; bags: number }
  >();

  for (const line of lines) {
    const kind = bagTypeFromMode(line.boriOrThelaMode);
    const bagType = toStockBagType(kind);
    const bagsOut = computeStockOutBags(line.bagCount, line.thelaCount, kind);
    if (!(bagsOut > 0)) continue;

    const resolved = await resolveSalePaunchStockProduct(tx, line.maalKhataAccountId);
    if (!resolved) {
      // Int/Ext party lines skip product stock checks (no product to reduce).
      continue;
    }

    const key = `${resolved.productId}:${bagType}`;
    const existing = requiredByProduct.get(key);
    if (existing) {
      existing.bags += bagsOut;
    } else {
      requiredByProduct.set(key, {
        productId: resolved.productId,
        productName: resolved.productName,
        bagType,
        bags: bagsOut,
      });
    }
  }

  for (const { productId, productName, bagType, bags } of requiredByProduct.values()) {
    await assertStockAvailableForOut(tx, productId, bagType, bags, productName);
  }
}
