import { prisma } from '../src/lib/prisma';

async function main() {
  const [ledgers, entries, vouchers, pmPosted] = await Promise.all([
    prisma.ledger.count(),
    prisma.ledgerEntry.count(),
    prisma.voucher.count({ where: { status: 'ACTIVE' } }),
    prisma.invoice.count({ where: { type: 'PURCHASE_MAAL', status: 'POSTED' } }),
  ]);

  const products = await prisma.invoice.groupBy({
    by: ['productId'],
    where: { type: 'PURCHASE_MAAL', status: 'POSTED', productId: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { productId: 'desc' } },
    take: 5,
  });

  const top = await prisma.$queryRawUnsafe<
    Array<{ ledgerId: number; cnt: number }>
  >(
    `SELECT ledgerId, COUNT(*) as cnt FROM LedgerEntry GROUP BY ledgerId ORDER BY cnt DESC LIMIT 5`,
  );

  const busy = await prisma.$queryRawUnsafe<Array<{ busy_timeout: number }>>(
    'PRAGMA busy_timeout;',
  );

  console.log(
    JSON.stringify(
      {
        ledgers,
        entries,
        vouchers,
        pmPosted,
        topProductsByPmInvoices: products,
        topLedgersByEntries: top.map((row) => ({
          ledgerId: Number(row.ledgerId),
          cnt: Number(row.cnt),
        })),
        busyTimeout: busy.map((row) => ({
          busy_timeout: Number(row.busy_timeout),
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
