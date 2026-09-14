import { Prisma, RecordStatus } from '@prisma/client';
import { AppError } from '../../utils/helpers';

export async function assertAccountsApprovedForPosting(
  tx: Prisma.TransactionClient,
  accountIds: number[],
): Promise<void> {
  const uniqueIds = [...new Set(accountIds.filter((id) => id > 0))];
  if (uniqueIds.length === 0) return;

  const accounts = await tx.account.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true, status: true, isHidden: true },
  });

  const byId = new Map(accounts.map((a) => [a.id, a]));
  for (const id of uniqueIds) {
    const account = byId.get(id);
    if (!account) throw new AppError(400, `Account #${id} not found`);
    if (account.isHidden) continue;
    if (account.status !== RecordStatus.ACTIVE) {
      throw new AppError(400, `Account "${account.name}" is not approved yet`);
    }
  }
}

export async function assertProductApprovedForPosting(
  tx: Prisma.TransactionClient,
  productId: number,
): Promise<void> {
  const product = await tx.product.findFirst({
    where: { id: productId, isActive: true },
    select: { id: true, name: true, status: true },
  });
  if (!product) throw new AppError(400, 'Product not found');
  if (product.status !== RecordStatus.ACTIVE) {
    throw new AppError(400, `Product "${product.name}" is not approved yet`);
  }
}
