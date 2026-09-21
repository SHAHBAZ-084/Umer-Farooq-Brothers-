import { prisma } from '../src/lib/prisma';
import { configureSqlitePragmas } from '../src/lib/database-maintenance';

/**
 * Prove: one long interactive $transaction monopolizes Prisma's SQLite connection,
 * so unrelated reads queue for the entire duration (not just SQLite busy_timeout).
 */
async function main() {
  await configureSqlitePragmas(prisma);

  const latencies: number[] = [];
  let probing = true;
  const probe = (async () => {
    while (probing) {
      const t0 = Date.now();
      try {
        await prisma.account.findFirst({ select: { id: true } });
        latencies.push(Date.now() - t0);
      } catch (err) {
        latencies.push(Date.now() - t0);
        console.log('probe err', Date.now() - t0, err instanceof Error ? err.message : err);
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  })();

  await new Promise((r) => setTimeout(r, 300));
  const baseline = [...latencies];
  latencies.length = 0;

  const holdMs = 3000;
  console.log(`Starting ${holdMs}ms interactive transaction hold...`);
  const holdStarted = Date.now();
  await prisma.$transaction(async (tx) => {
    await tx.account.findFirst({ select: { id: true } });
    // Hold the connection without releasing
    await new Promise((r) => setTimeout(r, holdMs));
    await tx.account.findFirst({ select: { id: true } });
  });
  console.log('hold finished', Date.now() - holdStarted, 'ms');

  probing = false;
  await probe;

  console.log({
    baselineMaxMs: Math.max(...baseline, 0),
    duringHoldMaxMs: Math.max(...latencies, 0),
    duringHoldAvgMs: latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0,
    duringHoldSamples: latencies,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
