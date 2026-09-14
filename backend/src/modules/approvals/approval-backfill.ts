import { PrismaClient, RecordStatus } from '@prisma/client';

/**
 * Databases upgraded to Phase 1 may have live rows stuck at schema default PENDING_APPROVAL
 * until Phase 3 defers new creates. Promote rows that already have ledger/stock activity.
 */
export async function backfillLegacyActiveRecordStatus(db: PrismaClient): Promise<void> {
  try {
    await db.account.updateMany({
      where: {
        status: RecordStatus.PENDING_APPROVAL,
        OR: [
          { isHidden: true },
          { ledger: { entries: { some: {} } } },
        ],
      },
      data: { status: RecordStatus.ACTIVE },
    });

    await db.product.updateMany({
      where: {
        status: RecordStatus.PENDING_APPROVAL,
        OR: [
          { stockMovements: { some: {} } },
          { account: { ledger: { entries: { some: {} } } } },
        ],
      },
      data: { status: RecordStatus.ACTIVE },
    });
  } catch {
    // Schema not migrated yet — no-op until approval columns exist.
  }
}
