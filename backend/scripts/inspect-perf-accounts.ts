import { prisma } from '../src/lib/prisma';

async function main() {
  const accounts = await prisma.account.findMany({
    where: {
      OR: [
        { name: { contains: 'Emptyy' } },
        { name: { startsWith: 'Perf Exp' } },
        { name: { contains: 'Perf ' } },
      ],
    },
    select: {
      id: true,
      name: true,
      code: true,
      isActive: true,
      createdAt: true,
      ledger: { select: { id: true, balance: true } },
    },
    orderBy: { id: 'asc' },
  });

  const enriched = [];
  for (const account of accounts) {
    const entryCount = account.ledger
      ? await prisma.ledgerEntry.count({ where: { ledgerId: account.ledger.id } })
      : 0;
    const sampleNotes = account.ledger
      ? await prisma.ledgerEntry.findMany({
          where: { ledgerId: account.ledger.id },
          take: 3,
          orderBy: { id: 'asc' },
          select: { notes: true, isOpeningBalance: true, voucherId: true, createdAt: true },
        })
      : [];
    enriched.push({
      id: account.id,
      name: account.name,
      code: account.code,
      isActive: account.isActive,
      createdAt: account.createdAt,
      ledgerId: account.ledger?.id ?? null,
      entryCount,
      sampleNotes,
    });
  }

  console.log(JSON.stringify(enriched, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
