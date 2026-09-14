import { AccountType, Prisma, ProductStockMode, RecordStatus, StockDirection } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';
import { USER_VISIBLE_PRODUCT_STATUS } from '../approvals/record-status';
import { ensureGeneralGoodsAccounts } from '../accounting/accounting.service';
import {
  ensureDefaultQuantityCategoriesInTx,
  ensureGrainProductCategoryInTx,
  assertProductCategory,
} from './product-categories';
import {
  ensureMaalKhataCategoryInTx,
  generateNextMaalKhataCodeInTx,
  maalKhataAccountName,
} from './maal-khata';
import { roundMoney } from '../invoices/purchase-maal.calculations';

export { MAAL_KHATA_CATEGORY_NAME, maalKhataAccountName } from './maal-khata';

async function generateNextGeneralGoodsCodeInTx(tx: Prisma.TransactionClient): Promise<string> {
  const accounts = await tx.account.findMany({
    where: { code: { startsWith: 'GG' } },
    select: { code: true },
  });
  let max = 0;
  for (const { code } of accounts) {
    const num = parseInt(code.slice(2), 10);
    if (!Number.isNaN(num) && num > max) max = num;
  }
  return `GG${String(max + 1).padStart(4, '0')}`;
}

export async function listProducts(options?: { stockMode?: ProductStockMode; categoryId?: number }) {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      status: USER_VISIBLE_PRODUCT_STATUS,
      ...(options?.categoryId ? { categoryId: options.categoryId } : {}),
      ...(options?.stockMode ? { category: { stockMode: options.stockMode } } : {}),
    },
    include: {
      account: { include: { ledger: true } },
      category: true,
    },
    orderBy: { name: 'asc' },
  });

  const quantityIds = products
    .filter((p) => p.category?.stockMode === ProductStockMode.QUANTITY)
    .map((p) => p.id);

  const onHandByProduct = new Map<number, number>();
  if (quantityIds.length > 0) {
    const grouped = await prisma.productQuantityMovement.groupBy({
      by: ['productId', 'direction'],
      where: { productId: { in: quantityIds } },
      _sum: { quantity: true },
    });
    for (const row of grouped) {
      const qty = Number(row._sum.quantity ?? 0);
      const signed = row.direction === StockDirection.IN ? qty : -qty;
      onHandByProduct.set(row.productId, roundMoney((onHandByProduct.get(row.productId) ?? 0) + signed));
    }
  }

  return products.map((product) => ({
    ...product,
    quantityOnHand:
      product.category?.stockMode === ProductStockMode.QUANTITY
        ? (onHandByProduct.get(product.id) ?? 0)
        : null,
  }));
}

export async function createProduct(data: {
  name: string;
  unit?: string;
  code?: string;
  categoryId?: number;
  openingBalance?: number;
  openingBalanceSide?: 'DR' | 'CR';
  createdById?: number;
}) {
  const name = data.name.trim();
  if (!name) throw new AppError(400, 'Product name is required');

  const existing = await prisma.product.findFirst({
    where: { isActive: true, name },
  });
  if (existing) throw new AppError(400, `Product "${name}" already exists`);

  const amount = Math.abs(Number(data.openingBalance ?? 0));
  if (amount > 0 && data.openingBalanceSide !== 'DR' && data.openingBalanceSide !== 'CR') {
    throw new AppError(400, 'Opening balance requires Debit or Credit selection');
  }
  const side = data.openingBalanceSide ?? 'DR';

  return prisma.$transaction(async (tx) => {
    await ensureGrainProductCategoryInTx(tx);
    await ensureDefaultQuantityCategoriesInTx(tx);

    let categoryId = data.categoryId;
    if (categoryId == null) {
      const grain = await ensureGrainProductCategoryInTx(tx);
      categoryId = grain.id;
    }
    const category = await assertProductCategory(tx, categoryId);

    const isQuantity = category.stockMode === ProductStockMode.QUANTITY;
    let accountCategoryId: number;
    let accountName: string;
    let code: string;

    if (isQuantity) {
      const system = await ensureGeneralGoodsAccounts(tx);
      accountCategoryId = system.inventoryCategoryId;
      accountName = name;
      code = data.code?.trim() || (await generateNextGeneralGoodsCodeInTx(tx));
    } else {
      const maalCategory = await ensureMaalKhataCategoryInTx(tx);
      accountCategoryId = maalCategory.id;
      accountName = maalKhataAccountName(name);
      code = data.code?.trim() || (await generateNextMaalKhataCodeInTx(tx));
    }

    const codeTaken = await tx.account.findFirst({ where: { code } });
    if (codeTaken) throw new AppError(400, `Account code "${code}" already exists`);

    const nameTaken = await tx.account.findFirst({
      where: { isActive: true, name: accountName, categoryId: accountCategoryId },
    });
    if (nameTaken) {
      throw new AppError(
        400,
        isQuantity
          ? `Inventory ledger "${accountName}" already exists`
          : `Maal Khata ledger "${accountName}" already exists`,
      );
    }

    const account = await tx.account.create({
      data: {
        categoryId: accountCategoryId,
        name: accountName,
        code,
        type: AccountType.ASSET,
        status: RecordStatus.PENDING_APPROVAL,
        createdById: data.createdById,
        pendingOpeningBalance: amount > 0 ? amount : null,
        pendingOpeningBalanceSide: amount > 0 ? side : null,
      },
    });

    await tx.ledger.create({ data: { accountId: account.id, balance: 0 } });

    const product = await tx.product.create({
      data: {
        name,
        code,
        unit: data.unit?.trim() || null,
        accountId: account.id,
        categoryId: category.id,
        status: RecordStatus.PENDING_APPROVAL,
        createdById: data.createdById,
      },
      include: {
        account: { include: { ledger: true } },
        category: true,
      },
    });

    return product;
  });
}

export async function removeProduct(id: number) {
  const product = await prisma.product.findFirst({
    where: { id, isActive: true },
    include: { account: { include: { ledger: true } } },
  });
  if (!product) throw new AppError(404, 'Product not found');

  const balance = product.account.ledger ? Number(product.account.ledger.balance) : 0;
  if (Math.abs(balance) > 0.005) {
    throw new AppError(400, 'Product ledger has a balance and cannot be removed');
  }

  return prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data: { isActive: false } });
    await tx.account.update({ where: { id: product.accountId }, data: { isActive: false } });
    return { ok: true };
  });
}

export async function approvePendingProductInTx(
  tx: Prisma.TransactionClient,
  productId: number,
) {
  const product = await tx.product.findFirst({
    where: { id: productId, status: RecordStatus.PENDING_APPROVAL },
    include: { account: { include: { ledger: true } } },
  });
  if (!product) throw new AppError(404, 'Pending product not found');

  const { approvePendingAccountInTx } = await import('../accounting/accounting.service');
  await approvePendingAccountInTx(tx, product.accountId);

  return tx.product.update({
    where: { id: product.id },
    data: { status: RecordStatus.ACTIVE },
    include: {
      account: { include: { ledger: true, category: true } },
      category: true,
      createdBy: { select: { id: true, displayName: true, username: true } },
    },
  });
}
