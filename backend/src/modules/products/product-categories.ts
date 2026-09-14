import { ProductStockMode, Prisma } from '@prisma/client';
import { AppError } from '../../utils/helpers';

export const GRAIN_PRODUCT_CATEGORY_NAME = 'Grain';

/** Default QUANTITY categories for general-goods pickers (idempotent seed). */
export const DEFAULT_QUANTITY_CATEGORY_NAMES = [
  'Fertilizer',
  'Pesticide',
  'Seed',
  'General',
] as const;

export async function ensureGrainProductCategoryInTx(tx: Prisma.TransactionClient) {
  const existing = await tx.productCategory.findFirst({
    where: { name: GRAIN_PRODUCT_CATEGORY_NAME },
  });
  if (existing) {
    if (!existing.isActive || existing.stockMode !== ProductStockMode.GRAIN_BAGS) {
      return tx.productCategory.update({
        where: { id: existing.id },
        data: { isActive: true, stockMode: ProductStockMode.GRAIN_BAGS },
      });
    }
    return existing;
  }
  return tx.productCategory.create({
    data: {
      name: GRAIN_PRODUCT_CATEGORY_NAME,
      stockMode: ProductStockMode.GRAIN_BAGS,
      isActive: true,
    },
  });
}

export async function ensureDefaultQuantityCategoriesInTx(tx: Prisma.TransactionClient) {
  for (const name of DEFAULT_QUANTITY_CATEGORY_NAMES) {
    const existing = await tx.productCategory.findFirst({ where: { name } });
    if (existing) {
      if (!existing.isActive || existing.stockMode !== ProductStockMode.QUANTITY) {
        await tx.productCategory.update({
          where: { id: existing.id },
          data: { isActive: true, stockMode: ProductStockMode.QUANTITY },
        });
      }
      continue;
    }
    await tx.productCategory.create({
      data: { name, stockMode: ProductStockMode.QUANTITY, isActive: true },
    });
  }
}

export async function listProductCategories(options?: { stockMode?: ProductStockMode }) {
  const { prisma } = await import('../../lib/prisma');
  await prisma.$transaction(async (tx) => {
    await ensureGrainProductCategoryInTx(tx);
    await ensureDefaultQuantityCategoriesInTx(tx);
  });
  return prisma.productCategory.findMany({
    where: {
      isActive: true,
      ...(options?.stockMode ? { stockMode: options.stockMode } : {}),
    },
    orderBy: { name: 'asc' },
  });
}

export async function createProductCategory(data: {
  name: string;
  stockMode: ProductStockMode;
}) {
  const { prisma } = await import('../../lib/prisma');
  const name = data.name.trim();
  if (!name) throw new AppError(400, 'Category name is required');

  const existing = await prisma.productCategory.findFirst({ where: { name } });
  if (existing) {
    if (existing.isActive) throw new AppError(400, `Category "${name}" already exists`);
    return prisma.productCategory.update({
      where: { id: existing.id },
      data: { isActive: true, stockMode: data.stockMode },
    });
  }

  return prisma.productCategory.create({
    data: { name, stockMode: data.stockMode, isActive: true },
  });
}

export async function assertProductCategory(
  tx: Prisma.TransactionClient,
  categoryId: number,
  expectedStockMode?: ProductStockMode,
) {
  const category = await tx.productCategory.findFirst({
    where: { id: categoryId, isActive: true },
  });
  if (!category) throw new AppError(400, 'Invalid product category');
  if (expectedStockMode && category.stockMode !== expectedStockMode) {
    throw new AppError(
      400,
      `Product category must use ${expectedStockMode === ProductStockMode.QUANTITY ? 'quantity' : 'grain'} stock mode`,
    );
  }
  return category;
}
