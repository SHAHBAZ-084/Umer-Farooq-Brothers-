/**
 * One-off diagnostic: why Detail Trial Balance debit ≠ credit.
 * Run: npx tsx scripts/trial-balance-diagnostic.ts
 */
import { PrismaClient } from '@prisma/client';
import { trialBalanceFromSignedBalance, isTrialBalanceBalanced } from '../src/modules/accounting/ledger-utils';

const prisma = new PrismaClient();

async function main() {
  const activeYear = await prisma.financialYear.findFirst({
    where: { status: 'ACTIVE' },
  });
  console.log('Active FY:', activeYear?.label ?? 'none');

  const ledgers = await prisma.ledger.findMany({
    include: { account: true },
    orderBy: [{ account: { isHidden: 'asc' } }, { account: { name: 'asc' } }],
  });

  let totalDebit = 0;
  let totalCredit = 0;
  let visibleDebit = 0;
  let visibleCredit = 0;
  let hiddenDebit = 0;
  let hiddenCredit = 0;

  const rows: Array<{
    name: string;
    code: string;
    balance: number;
    debit: number;
    credit: number;
    isHidden: boolean;
    status: string;
    isActive: boolean;
  }> = [];

  for (const l of ledgers) {
    const balance = Number(l.balance);
    const { debit, credit } = trialBalanceFromSignedBalance(balance);
    totalDebit += debit;
    totalCredit += credit;
    if (l.account.isHidden) {
      hiddenDebit += debit;
      hiddenCredit += credit;
    } else {
      visibleDebit += debit;
      visibleCredit += credit;
    }
    rows.push({
      name: l.account.name,
      code: l.account.code,
      balance,
      debit,
      credit,
      isHidden: l.account.isHidden,
      status: l.account.status,
      isActive: l.account.isActive,
    });
  }

  const mismatch = totalDebit - totalCredit;
  console.log('\n=== FOOTER TOTALS (all ledgers, incl. hidden) ===');
  console.log('Total Debit: ', totalDebit.toFixed(2));
  console.log('Total Credit:', totalCredit.toFixed(2));
  console.log('Difference:  ', mismatch.toFixed(2));
  console.log('Balanced:    ', isTrialBalanceBalanced(totalDebit, totalCredit));

  console.log('\n=== VISIBLE ROWS ONLY (what table lists) ===');
  console.log('Visible Debit: ', visibleDebit.toFixed(2));
  console.log('Visible Credit:', visibleCredit.toFixed(2));
  console.log('Visible diff:  ', (visibleDebit - visibleCredit).toFixed(2));

  console.log('\n=== HIDDEN ACCOUNTS (excluded from table, included in footer) ===');
  console.log('Hidden Debit: ', hiddenDebit.toFixed(2));
  console.log('Hidden Credit:', hiddenCredit.toFixed(2));
  const hiddenRows = rows.filter((r) => r.isHidden);
  for (const r of hiddenRows) {
    console.log(`  ${r.name} (${r.code}): balance=${r.balance.toFixed(2)} → Dr ${r.debit.toFixed(2)} / Cr ${r.credit.toFixed(2)}`);
  }

  console.log('\n=== PENDING (not in trial balance ledger yet) ===');
  const [pendingAccounts, pendingVouchers, pendingInvoices, pendingAcctAdj, pendingStockAdj] =
    await Promise.all([
      prisma.account.count({ where: { status: 'PENDING_APPROVAL' } }),
      prisma.voucher.count({ where: { status: 'PENDING_APPROVAL' } }),
      prisma.invoice.count({ where: { status: 'PENDING_APPROVAL' } }),
      prisma.accountAdjustment.count({ where: { status: 'PENDING_APPROVAL' } }),
      prisma.stockAdjustment.count({ where: { status: 'PENDING_APPROVAL' } }),
    ]);
  console.log('Pending accounts:', pendingAccounts);
  console.log('Pending vouchers:', pendingVouchers);
  console.log('Pending invoices:', pendingInvoices);
  console.log('Pending acct adj:', pendingAcctAdj);
  console.log('Pending stock adj:', pendingStockAdj);

  // Check ledger entry double-entry per voucher
  const entrySums = await prisma.$queryRaw<
    Array<{ voucherId: number | null; netDebit: number; netCredit: number }>
  >`
    SELECT voucherId,
           SUM(CASE WHEN type = 'DEBIT' THEN amount ELSE 0 END) as netDebit,
           SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END) as netCredit
    FROM LedgerEntry
    WHERE voucherId IS NOT NULL
    GROUP BY voucherId
    HAVING ABS(netDebit - netCredit) > 0.01
    LIMIT 20
  `;
  console.log('\n=== UNBALANCED VOUCHER ENTRIES (Dr ≠ Cr) ===');
  if (entrySums.length === 0) {
    console.log('None found — each voucher’s ledger legs balance.');
  } else {
    for (const v of entrySums) {
      console.log(`  Voucher #${v.voucherId}: Dr ${Number(v.netDebit).toFixed(2)} vs Cr ${Number(v.netCredit).toFixed(2)}`);
    }
  }

  // Non-voucher one-sided entries (opening balance, adjustments)
  const orphanEntries = await prisma.ledgerEntry.groupBy({
    by: ['ledgerId'],
    _sum: { amount: true },
    where: { voucherId: null },
  });

  const nonVoucherImbalance: Array<{ accountName: string; net: number }> = [];
  for (const g of orphanEntries) {
    const entries = await prisma.ledgerEntry.findMany({
      where: { ledgerId: g.ledgerId, voucherId: null },
      select: { type: true, amount: true },
    });
    let net = 0;
    for (const e of entries) {
      const amt = Number(e.amount);
      net += e.type === 'DEBIT' ? amt : -amt;
    }
    const ledger = await prisma.ledger.findUnique({
      where: { id: g.ledgerId },
      include: { account: { select: { name: true } } },
    });
    if (ledger && Math.abs(net) > 0.01) {
      nonVoucherImbalance.push({ accountName: ledger.account.name, net });
    }
  }

  console.log('\n=== LEDGER BALANCE vs SUM OF ENTRIES (sample mismatches) ===');
  let ledgerDrift = 0;
  for (const l of ledgers) {
    const entries = await prisma.ledgerEntry.findMany({
      where: { ledgerId: l.id },
      select: { type: true, amount: true },
    });
    let computed = 0;
    for (const e of entries) {
      const amt = Number(e.amount);
      computed += e.type === 'DEBIT' ? amt : -amt;
    }
    const stored = Number(l.balance);
    const drift = stored - computed;
    if (Math.abs(drift) > 0.01) {
      ledgerDrift += drift;
      console.log(`  ${l.account.name}: stored=${stored.toFixed(2)} computed=${computed.toFixed(2)} drift=${drift.toFixed(2)}`);
    }
  }
  if (ledgerDrift === 0) console.log('All ledger balances match sum of entries.');
  else {
    const allDrifts = await (async () => {
      let total = 0;
      for (const l of ledgers) {
        const entries = await prisma.ledgerEntry.findMany({
          where: { ledgerId: l.id },
          select: { type: true, amount: true },
        });
        let computed = 0;
        for (const e of entries) {
          const amt = Number(e.amount);
          computed += e.type === 'DEBIT' ? amt : -amt;
        }
        total += Number(l.balance) - computed;
      }
      return total;
    })();
    console.log(`Total ledger drift (sum of stored − computed): ${allDrifts.toFixed(2)}`);
  }

  console.log('\n=== WHY FOOTER CAN DIFFER FROM VISIBLE ROW SUM ===');
  console.log(
    'Footer uses ALL accounts (incl. hidden Opening Balance Equity).',
  );
  console.log(
    'Table rows exclude hidden accounts — so visible Dr/Cr sum may ≠ footer if hidden account has balance.',
  );
  console.log(
    `Hidden account offset: Dr ${hiddenDebit.toFixed(2)} / Cr ${hiddenCredit.toFixed(2)}`,
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
