import { prisma } from '../src/lib/prisma';
import { configureSqlitePragmas } from '../src/lib/database-maintenance';
import { cancelInvoice } from '../src/modules/invoices/invoices.service';

async function main() {
  await configureSqlitePragmas(prisma);

  const busy = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    'PRAGMA busy_timeout;',
  );
  console.log('busy_timeout after configure:', busy);

  const topLedgers = await prisma.$queryRawUnsafe<
    Array<{ ledgerId: number; cnt: bigint; name: string }>
  >(
    `SELECT le.ledgerId as ledgerId, COUNT(*) as cnt, a.name as name
     FROM LedgerEntry le
     JOIN Ledger l ON l.id = le.ledgerId
     JOIN Account a ON a.id = l.accountId
     GROUP BY le.ledgerId
     ORDER BY cnt DESC
     LIMIT 8`,
  );
  console.log(
    'top ledgers:',
    topLedgers.map((r) => ({
      ledgerId: Number(r.ledgerId),
      cnt: Number(r.cnt),
      name: r.name,
    })),
  );

  const candidate = await prisma.invoice.findFirst({
    where: {
      type: 'PURCHASE_MAAL',
      status: 'POSTED',
      OR: [
        { billNo: { startsWith: 'HANG-BILL-' } },
        { billNo: { startsWith: 'CS-PM-' } },
      ],
    },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      reference: true,
      billNo: true,
      productId: true,
      vouchers: { select: { voucherId: true } },
    },
  });
  if (!candidate) {
    console.log('No safe test PURCHASE_MAAL (HANG-BILL/CS-PM) to cancel — aborting without touching live invoices');
    return;
  }

  const siblingCount = candidate.productId
    ? await prisma.invoice.count({
        where: {
          type: 'PURCHASE_MAAL',
          status: 'POSTED',
          productId: candidate.productId,
        },
      })
    : 0;

  const entryCountForVoucher = await prisma.ledgerEntry.count({
    where: {
      voucherId: { in: candidate.vouchers.map((v) => v.voucherId) },
    },
  });

  console.log('cancel candidate', {
    id: candidate.id,
    reference: candidate.reference,
    billNo: candidate.billNo,
    productId: candidate.productId,
    siblingPostedSameProduct: siblingCount,
    voucherEntryCount: entryCountForVoucher,
  });

  const user = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!user) throw new Error('No admin user');

  // Concurrent read probe
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
        console.log('probe error', err instanceof Error ? err.message : err);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  })();

  await new Promise((r) => setTimeout(r, 150));
  const baseline = [...latencies];
  latencies.length = 0;

  const t0 = Date.now();
  await cancelInvoice(candidate.id, user.id);
  const cancelMs = Date.now() - t0;
  probing = false;
  await probe;

  console.log('LIVE CANCEL RESULT', {
    cancelMs,
    baselineMaxMs: baseline.length ? Math.max(...baseline) : 0,
    concurrentMaxMs: latencies.length ? Math.max(...latencies) : 0,
    concurrentAvgMs: latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0,
    concurrentSamples: latencies.slice(0, 40),
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
