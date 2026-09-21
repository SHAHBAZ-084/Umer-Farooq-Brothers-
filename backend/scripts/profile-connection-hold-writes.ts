import { prisma } from '../src/lib/prisma';
import { configureSqlitePragmas } from '../src/lib/database-maintenance';

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

  console.log('Starting write-heavy interactive transaction (5001 updates)...');
  const holdStarted = Date.now();
  const entries = await prisma.ledgerEntry.findMany({
    where: { ledgerId: 47 },
    take: 2000,
    select: { id: true, balance: true },
  });

  await prisma.$transaction(
    async (tx) => {
      for (const entry of entries) {
        await tx.ledgerEntry.update({
          where: { id: entry.id },
          data: { balance: entry.balance },
        });
      }
    },
    { timeout: 300_000 },
  );
  console.log('write tx finished', Date.now() - holdStarted, 'ms', 'updates', entries.length);

  probing = false;
  await probe;

  console.log({
    baselineMaxMs: Math.max(...baseline, 0),
    duringWriteMaxMs: Math.max(...latencies, 0),
    duringWriteAvgMs: latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0,
    sampleCount: latencies.length,
    p95: latencies.length
      ? [...latencies].sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)]
      : 0,
    worst10: [...latencies].sort((a, b) => b - a).slice(0, 10),
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
