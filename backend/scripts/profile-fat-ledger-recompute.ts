import { prisma } from '../src/lib/prisma';
import { configureSqlitePragmas } from '../src/lib/database-maintenance';
import { getActiveFinancialYearId } from '../src/modules/accounting/accounting.service';

async function main() {
  await configureSqlitePragmas(prisma);
  const financialYearId = await getActiveFinancialYearId(prisma);

  // Dynamic import of internal recompute via cancel path is hard; measure raw entry update cost.
  const fatLedgerId = 47;
  const entryCount = await prisma.ledgerEntry.count({ where: { ledgerId: fatLedgerId } });
  console.log({ fatLedgerId, entryCount, financialYearId });

  const loadStarted = Date.now();
  const entries = await prisma.ledgerEntry.findMany({
    where: { ledgerId: fatLedgerId },
    orderBy: { id: 'asc' },
    select: { id: true, balance: true, type: true, amount: true },
  });
  console.log('load all entries ms', Date.now() - loadStarted, 'count', entries.length);

  // Simulate worst-case: update every entry sequentially inside a transaction (like recompute when all drift)
  const updateStarted = Date.now();
  await prisma.$transaction(
    async (tx) => {
      let i = 0;
      for (const entry of entries) {
        // no-op-ish update to measure round-trip cost
        await tx.ledgerEntry.update({
          where: { id: entry.id },
          data: { balance: entry.balance },
        });
        i += 1;
        if (i === 100 || i === 500 || i === 1000 || i === 2500 || i === entries.length) {
          console.log('updated', i, 'ms', Date.now() - updateStarted);
        }
      }
    },
    { timeout: 600_000 },
  );
  console.log('FULL sequential update of', entries.length, 'entries ms', Date.now() - updateStarted);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
