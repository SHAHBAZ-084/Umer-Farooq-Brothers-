import {
  AdjustmentStatus,
  OpeningBalanceSide,
  Prisma,
  RecordStatus,
  StockBagType,
  StockDirection,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';
import {
  assertVoucherDateInActiveFinancialYear,
  postOneSidedEntryInTx,
} from '../accounting/accounting.service';
import { parseVoucherDateInput } from '../accounting/ledger-utils';
import { assertAccountsApprovedForPosting } from '../approvals/approval-guards';
import { assertStockAvailableForOut } from '../approvals/stock-approval-guards';
import { USER_VISIBLE_ACCOUNT_STATUS } from '../approvals/record-status';
import { isMaalKhataCategoryName } from '../products/maal-khata';

const userSelect = { id: true, displayName: true, username: true } as const;

const adjustmentInclude = {
  account: { include: { category: true, ledger: true } },
  createdBy: { select: userSelect },
} as const;

const stockAdjustmentInclude = {
  product: { include: { account: { include: { ledger: true, category: true } } } },
  createdBy: { select: userSelect },
} as const;

async function assertAccountEligibleForAdjustment(accountId: number) {
  const account = await prisma.account.findFirst({
    where: { id: accountId, isActive: true, status: USER_VISIBLE_ACCOUNT_STATUS },
    include: { category: true, product: { select: { name: true } } },
  });
  if (!account) throw new AppError(400, 'Account not found or not active');

  if (isMaalKhataCategoryName(account.category.name)) {
    throw new AppError(
      400,
      'Maal Khata accounts belong to products — use Stock Adjustment instead',
    );
  }
  if (account.product) {
    throw new AppError(
      400,
      `This ledger belongs to product "${account.product.name}" — use Stock Adjustment instead`,
    );
  }
  return account;
}

export async function createAccountAdjustment(data: {
  accountId: number;
  amount: number;
  side: OpeningBalanceSide;
  adjustmentDate: string;
  notes?: string;
  createdById: number;
}) {
  const amount = Number(data.amount);
  if (!(amount > 0)) throw new AppError(400, 'Amount must be greater than zero');

  const account = await assertAccountEligibleForAdjustment(data.accountId);
  const adjustmentDate = parseVoucherDateInput(data.adjustmentDate);
  await assertVoucherDateInActiveFinancialYear(prisma, adjustmentDate);

  return prisma.accountAdjustment.create({
    data: {
      accountId: account.id,
      amount,
      side: data.side,
      adjustmentDate,
      notes: data.notes?.trim() || null,
      createdById: data.createdById,
      status: AdjustmentStatus.PENDING_APPROVAL,
    },
    include: adjustmentInclude,
  });
}

export async function createStockAdjustment(data: {
  productId: number;
  bagType: 'BORI' | 'THELA';
  direction: 'IN' | 'OUT';
  bags: number;
  amount: number;
  adjustmentDate: string;
  notes?: string;
  createdById: number;
}) {
  const bags = Number(data.bags);
  const amount = Number(data.amount);
  if (!(bags > 0)) throw new AppError(400, 'Bag quantity must be greater than zero');
  if (!(amount > 0)) throw new AppError(400, 'Amount must be greater than zero');

  const product = await prisma.product.findFirst({
    where: { id: data.productId, isActive: true, status: RecordStatus.ACTIVE },
    include: { account: { include: { ledger: true, category: true } } },
  });
  if (!product) throw new AppError(400, 'Product not found or not approved');

  const adjustmentDate = parseVoucherDateInput(data.adjustmentDate);
  await assertVoucherDateInActiveFinancialYear(prisma, adjustmentDate);

  const direction =
    data.direction === 'IN' ? StockDirection.IN : StockDirection.OUT;
  const bagType = data.bagType === 'THELA' ? StockBagType.THELA : StockBagType.BORI;
  const side = direction === StockDirection.IN ? OpeningBalanceSide.DR : OpeningBalanceSide.CR;

  return prisma.stockAdjustment.create({
    data: {
      productId: product.id,
      bagType,
      direction,
      bags,
      amount,
      side,
      adjustmentDate,
      notes: data.notes?.trim() || null,
      createdById: data.createdById,
      status: AdjustmentStatus.PENDING_APPROVAL,
    },
    include: stockAdjustmentInclude,
  });
}

export async function approvePendingAccountAdjustmentInTx(
  tx: Prisma.TransactionClient,
  adjustmentId: number,
) {
  const adjustment = await tx.accountAdjustment.findFirst({
    where: { id: adjustmentId, status: AdjustmentStatus.PENDING_APPROVAL },
    include: { account: { include: { ledger: true } } },
  });
  if (!adjustment) throw new AppError(404, 'Pending account adjustment not found');

  await assertAccountsApprovedForPosting(tx, [adjustment.accountId]);

  let ledger = adjustment.account.ledger;
  if (!ledger) {
    ledger = await tx.ledger.create({ data: { accountId: adjustment.accountId, balance: 0 } });
  }

  const financialYearId = await assertVoucherDateInActiveFinancialYear(
    tx,
    adjustment.adjustmentDate,
  );

  await postOneSidedEntryInTx(tx, {
    ledgerId: ledger.id,
    accountName: adjustment.account.name,
    amount: Number(adjustment.amount),
    side: adjustment.side,
    isOpeningBalance: false,
    notes: adjustment.notes ?? 'Account Adjustment',
    entryDate: adjustment.adjustmentDate,
    financialYearId,
  });

  return tx.accountAdjustment.update({
    where: { id: adjustment.id },
    data: { status: AdjustmentStatus.APPROVED },
    include: adjustmentInclude,
  });
}

export async function approvePendingStockAdjustmentInTx(
  tx: Prisma.TransactionClient,
  adjustmentId: number,
) {
  const adjustment = await tx.stockAdjustment.findFirst({
    where: { id: adjustmentId, status: AdjustmentStatus.PENDING_APPROVAL },
    include: {
      product: { include: { account: { include: { ledger: true, category: true } } } },
    },
  });
  if (!adjustment) throw new AppError(404, 'Pending stock adjustment not found');

  const bags = Number(adjustment.bags);
  if (adjustment.direction === StockDirection.OUT) {
    await assertStockAvailableForOut(
      tx,
      adjustment.productId,
      adjustment.bagType,
      bags,
      adjustment.product.name,
    );
  }

  await assertAccountsApprovedForPosting(tx, [adjustment.product.accountId]);

  let ledger = adjustment.product.account.ledger;
  if (!ledger) {
    ledger = await tx.ledger.create({
      data: { accountId: adjustment.product.accountId, balance: 0 },
    });
  }

  const financialYearId = await assertVoucherDateInActiveFinancialYear(
    tx,
    adjustment.adjustmentDate,
  );

  await postOneSidedEntryInTx(tx, {
    ledgerId: ledger.id,
    accountName: adjustment.product.account.name,
    amount: Number(adjustment.amount),
    side: adjustment.side,
    isOpeningBalance: false,
    notes: adjustment.notes ?? 'Stock Adjustment',
    entryDate: adjustment.adjustmentDate,
    financialYearId,
  });

  const reference = `STK-ADJ-${adjustment.id}`;
  await tx.stockMovement.create({
    data: {
      productId: adjustment.productId,
      bagType: adjustment.bagType,
      direction: adjustment.direction,
      bags,
      date: adjustment.adjustmentDate,
      invoiceReference: reference,
      description: adjustment.notes?.trim() || reference,
      stockAdjustmentId: adjustment.id,
    },
  });

  return tx.stockAdjustment.update({
    where: { id: adjustment.id },
    data: { status: AdjustmentStatus.APPROVED },
    include: stockAdjustmentInclude,
  });
}

export async function rejectPendingAccountAdjustment(adjustmentId: number) {
  const row = await prisma.accountAdjustment.findFirst({
    where: { id: adjustmentId, status: AdjustmentStatus.PENDING_APPROVAL },
  });
  if (!row) throw new AppError(404, 'Pending account adjustment not found');
  return prisma.accountAdjustment.update({
    where: { id: adjustmentId },
    data: { status: AdjustmentStatus.REJECTED },
    include: adjustmentInclude,
  });
}

export async function rejectPendingStockAdjustment(adjustmentId: number) {
  const row = await prisma.stockAdjustment.findFirst({
    where: { id: adjustmentId, status: AdjustmentStatus.PENDING_APPROVAL },
  });
  if (!row) throw new AppError(404, 'Pending stock adjustment not found');
  return prisma.stockAdjustment.update({
    where: { id: adjustmentId },
    data: { status: AdjustmentStatus.REJECTED },
    include: stockAdjustmentInclude,
  });
}

export async function patchPendingAccountAdjustment(
  id: number,
  data: Record<string, unknown>,
) {
  const updates: Prisma.AccountAdjustmentUpdateInput = {};
  if (data.amount != null) {
    const amount = Number(data.amount);
    if (!(amount > 0)) throw new AppError(400, 'Amount must be greater than zero');
    updates.amount = amount;
  }
  if (data.side === 'DR' || data.side === 'CR') {
    updates.side = data.side;
  }
  if (typeof data.adjustmentDate === 'string') {
    updates.adjustmentDate = parseVoucherDateInput(data.adjustmentDate);
  }
  if (typeof data.notes === 'string') {
    updates.notes = data.notes.trim() || null;
  }
  if (data.accountId != null) {
    const account = await assertAccountEligibleForAdjustment(Number(data.accountId));
    updates.account = { connect: { id: account.id } };
  }
  if (Object.keys(updates).length === 0) {
    throw new AppError(400, 'No valid fields to update');
  }
  return prisma.accountAdjustment.update({
    where: { id },
    data: updates,
    include: adjustmentInclude,
  });
}

export async function patchPendingStockAdjustment(
  id: number,
  data: Record<string, unknown>,
) {
  const updates: Prisma.StockAdjustmentUpdateInput = {};
  if (data.bags != null) {
    const bags = Number(data.bags);
    if (!(bags > 0)) throw new AppError(400, 'Bag quantity must be greater than zero');
    updates.bags = bags;
  }
  if (data.amount != null) {
    const amount = Number(data.amount);
    if (!(amount > 0)) throw new AppError(400, 'Amount must be greater than zero');
    updates.amount = amount;
  }
  if (data.direction === 'IN' || data.direction === 'OUT') {
    const direction = data.direction === 'IN' ? StockDirection.IN : StockDirection.OUT;
    updates.direction = direction;
    updates.side = direction === StockDirection.IN ? OpeningBalanceSide.DR : OpeningBalanceSide.CR;
  }
  if (data.bagType === 'BORI' || data.bagType === 'THELA') {
    updates.bagType = data.bagType === 'THELA' ? StockBagType.THELA : StockBagType.BORI;
  }
  if (typeof data.adjustmentDate === 'string') {
    updates.adjustmentDate = parseVoucherDateInput(data.adjustmentDate);
  }
  if (typeof data.notes === 'string') {
    updates.notes = data.notes.trim() || null;
  }
  if (data.productId != null) {
    const product = await prisma.product.findFirst({
      where: { id: Number(data.productId), isActive: true, status: RecordStatus.ACTIVE },
    });
    if (!product) throw new AppError(400, 'Product not found or not approved');
    updates.product = { connect: { id: product.id } };
  }
  if (Object.keys(updates).length === 0) {
    throw new AppError(400, 'No valid fields to update');
  }
  return prisma.stockAdjustment.update({
    where: { id },
    data: updates,
    include: stockAdjustmentInclude,
  });
}

export async function getPendingAccountAdjustmentDetail(id: number) {
  const row = await prisma.accountAdjustment.findFirst({
    where: { id, status: AdjustmentStatus.PENDING_APPROVAL },
    include: adjustmentInclude,
  });
  if (!row) throw new AppError(404, 'Pending account adjustment not found');
  return row;
}

export async function getPendingStockAdjustmentDetail(id: number) {
  const row = await prisma.stockAdjustment.findFirst({
    where: { id, status: AdjustmentStatus.PENDING_APPROVAL },
    include: stockAdjustmentInclude,
  });
  if (!row) throw new AppError(404, 'Pending stock adjustment not found');
  return row;
}
