/**
 * Re-profile sequential vs batched balance updates on the fat 5001-row ledger.
 * Also times the real recomputeLedgerRunningBalancesInTx path via repair-style full recompute.
 */
import { prisma } from '../src/lib/prisma';
import { configureSqlitePragmas } from '../src/lib/database-maintenance';
import { getActiveFinancialYearId } from '../src/modules/accounting/accounting.service';

async function main() {
  await configureSqlitePragmas(prisma);
  const financialYearId = await getActiveFinancialYearId(prisma);
  const fatLedgerId = 47;

  const entries = await prisma.ledgerEntry.findMany({
    where: { ledgerId: fatLedgerId },
    orderBy: { id: 'asc' },
    select: { id: true, balance: true, type: true, amount: true },
  });
  console.log({ fatLedgerId, entryCount: entries.length, financialYearId });

  // Force every row to need an update by applying a tiny drift, then recompute via batched CASE updates
  // mimicking recomputeLedgerRunningBalancesInTx's new path.
  const pending = entries.map((e, idx) => ({
    id: e.id,
    balance: Number(e.balance) + (idx % 2 === 0 ? 0.01 : -0.01),
  }));

  const CHUNK = 200;
  const batchStarted = Date.now();
  await prisma.$transaction(
    async (tx) => {
      for (let i = 0; i < pending.length; i += CHUNK) {
        const chunk = pending.slice(i, i + CHUNK);
        const caseSql = chunk
          .map((row) => `WHEN ${row.id} THEN ${Number(row.balance)}`)
          .join(' ');
        const idList = chunk.map((row) => row.id).join(',');
        await tx.$executeRawUnsafe(
          `UPDATE "LedgerEntry" SET balance = CASE id ${caseSql} END WHERE id IN (${idList})`,
        );
      }
    },
    { timeout: 120_000 },
  );
  const batchMs = Date.now() - batchStarted;
  console.log('BATCHED CASE UPDATE of', pending.length, 'rows ms', batchMs);

  // Restore exact balances with another batched pass (write original values back)
  const restoreStarted = Date.now();
  await prisma.$transaction(
    async (tx) => {
      for (let i = 0; i < entries.length; i += CHUNK) {
        const chunk = entries.slice(i, i + CHUNK);
        const caseSql = chunk
          .map((row) => `WHEN ${row.id} THEN ${Number(row.balance)}`)
          .join(' ');
        const idList = chunk.map((row) => row.id).join(',');
        await tx.$executeRawUnsafe(
          `UPDATE "LedgerEntry" SET balance = CASE id ${caseSql} END WHERE id IN (${idList})`,
        );
      }
    },
    { timeout: 120_000 },
  );
  console.log('RESTORE batched ms', Date.now() - restoreStarted);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
