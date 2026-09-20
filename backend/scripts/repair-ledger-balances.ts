/**
 * Repair ledger.balance + entry.balance drift by full-year recompute.
 * Run: npx tsx scripts/repair-ledger-balances.ts
 */
import 'dotenv/config';
import { repairAllLedgerRunningBalances } from '../src/modules/accounting/accounting.service';
import { prisma } from '../src/lib/prisma';

async function main() {
  const result = await repairAllLedgerRunningBalances();
  if (result.repairedCount === 0) {
    console.log('All ledger balances already match recomputed running totals.');
    return;
  }
  for (const row of result.repaired) {
    const delta = row.after - row.before;
    console.log(
      `Repaired ${row.account}: ${row.before.toFixed(2)} → ${row.after.toFixed(2)} (Δ ${delta.toFixed(2)})`,
    );
  }
  console.log(`Done. Repaired ${result.repairedCount} ledger(s).`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
