import type { VoucherType } from '@prisma/client';

/** Signed ledger balance: previous + debit − credit (always use this formula). */
export function computeLedgerBalance(
  previousBalance: number,
  debitAmount: number,
  creditAmount: number,
): number {
  return previousBalance + debitAmount - creditAmount;
}

export function entryAmounts(type: 'DEBIT' | 'CREDIT', amount: number) {
  if (type === 'DEBIT') return { debit: amount, credit: 0 };
  return { debit: 0, credit: amount };
}

export function trialBalanceFromSignedBalance(balance: number) {
  return {
    debit: balance > 0 ? balance : 0,
    credit: balance < 0 ? Math.abs(balance) : 0,
  };
}

export function isTrialBalanceBalanced(totalDebit: number, totalCredit: number, tolerance = 0.01) {
  return Math.abs(totalDebit - totalCredit) < tolerance;
}

export function parseVoucherDateInput(value: string | Date): Date {
  const d = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid voucher date');
  }
  d.setHours(12, 0, 0, 0);
  return d;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function defaultOpeningSide(
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE',
): 'DR' | 'CR' {
  return type === 'ASSET' || type === 'EXPENSE' ? 'DR' : 'CR';
}

export function entryEffectiveDate(entry: {
  createdAt: Date;
  isOpeningBalance: boolean;
  voucher?: { date: Date } | null;
}): Date {
  if (entry.isOpeningBalance) return entry.createdAt;
  return entry.voucher?.date ?? entry.createdAt;
}

/**
 * Same-date secondary sort: cash vouchers, then journal, then sales, then purchases.
 * Lower rank sorts first within each credit/debit group.
 */
export const VOUCHER_TYPE_LEDGER_RANK: Record<VoucherType, number> = {
  RECEIPT: 1,
  PAYMENT: 2,
  JOURNAL: 3,
  SALE_COMMISSION: 4,
  SALE_PAUNCH: 5,
  SALE_GENERAL: 6,
  GENERAL_TRADE: 7,
  PURCHASE_MAAL: 8,
  PURCHASE_GENERAL: 9,
  KACHI: 10,
};

const UNKNOWN_VOUCHER_TYPE_RANK = 99;

export type LedgerSortEntry = {
  id: number;
  createdAt: Date;
  isOpeningBalance: boolean;
  /** Entry side on this ledger. Optional on synthetic recompute keys. */
  type?: 'DEBIT' | 'CREDIT' | null;
  voucher?: { date: Date; number: number; type?: VoucherType | null } | null;
};

function voucherTypeRank(type: VoucherType | null | undefined): number {
  if (!type) return UNKNOWN_VOUCHER_TYPE_RANK;
  return VOUCHER_TYPE_LEDGER_RANK[type] ?? UNKNOWN_VOUCHER_TYPE_RANK;
}

/** Credits before debits on this account (1 = credit first, 2 = debit). */
function sideRank(type: 'DEBIT' | 'CREDIT' | null | undefined): number | null {
  if (type === 'CREDIT') return 1;
  if (type === 'DEBIT') return 2;
  return null;
}

export function compareLedgerEntries(a: LedgerSortEntry, b: LedgerSortEntry): number {
  // Opening balance is always the first row in a ledger, regardless of createdAt.
  if (a.isOpeningBalance !== b.isOpeningBalance) {
    return a.isOpeningBalance ? -1 : 1;
  }

  const dateCmp =
    new Date(entryEffectiveDate(a)).getTime() - new Date(entryEffectiveDate(b)).getTime();
  if (dateCmp !== 0) return dateCmp;

  // Same effective date: credits on this account before debits.
  const aSide = sideRank(a.type);
  const bSide = sideRank(b.type);
  if (aSide != null && bSide != null && aSide !== bSide) {
    return aSide - bSide;
  }

  // Within side: fixed voucher-type ranking (not creation order).
  const aTypeRank = voucherTypeRank(a.voucher?.type);
  const bTypeRank = voucherTypeRank(b.voucher?.type);
  if (aTypeRank !== bTypeRank) {
    return aTypeRank - bTypeRank;
  }

  const aNo = a.isOpeningBalance ? 0 : (a.voucher?.number ?? 0);
  const bNo = b.isOpeningBalance ? 0 : (b.voucher?.number ?? 0);
  if (aNo !== bNo) return aNo - bNo;
  return a.id - b.id;
}
