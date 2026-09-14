import { InvoiceType, VoucherType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';
import { endOfDay, startOfDay } from '../accounting/ledger-utils';
import {
  invoiceApprovalAccounts,
  invoiceTypeLabel,
  voucherApprovalAccounts,
} from '../approvals/approval-display';
import {
  USER_VISIBLE_INVOICE_STATUS,
  USER_VISIBLE_VOUCHER_STATUS,
} from '../approvals/record-status';

const DAILY_VOUCHER_TYPES: VoucherType[] = [
  VoucherType.PAYMENT,
  VoucherType.RECEIPT,
  VoucherType.JOURNAL,
];

const DAILY_INVOICE_TYPES: InvoiceType[] = [
  InvoiceType.KACHI_MAAL,
  InvoiceType.PURCHASE_MAAL,
  InvoiceType.SALE_PAUNCH,
  InvoiceType.SALE_COMMISSION,
  InvoiceType.PURCHASE_GENERAL,
  InvoiceType.SALE_GENERAL,
  InvoiceType.GENERAL_TRADE,
];

export type DailyReportFilterKey =
  | 'PAYMENT'
  | 'RECEIPT'
  | 'JOURNAL'
  | 'KACHI_MAAL'
  | 'PURCHASE_MAAL'
  | 'SALE_PAUNCH'
  | 'SALE_COMMISSION'
  | 'PURCHASE_GENERAL'
  | 'SALE_GENERAL'
  | 'GENERAL_TRADE';

export type DailyReportAccountRef = {
  name: string;
  code: string;
};

export type DailyReportRow = {
  kind: 'voucher' | 'invoice';
  id: number;
  filterKey: DailyReportFilterKey;
  typeLabel: string;
  reference: string;
  amount: number;
  date: string;
  debitAccount: DailyReportAccountRef | null;
  creditAccount: DailyReportAccountRef | null;
  voucherType?: VoucherType;
  voucherNumber?: number;
  invoiceType?: InvoiceType;
  invoiceNumber?: number;
  invoiceReference?: string;
};

export type DailyReportResult = {
  date: string;
  rows: DailyReportRow[];
  totals: {
    count: number;
    amount: number;
  };
  /** Totals after optional kind filter, across the full day (not just the page). */
  filteredTotals: {
    count: number;
    amount: number;
  };
  kindCounts: Partial<Record<DailyReportFilterKey, number>>;
  total: number;
  limit: number;
  offset: number;
};

function parseDay(dateStr: string, end: boolean): Date {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) throw new AppError(400, 'Invalid date');
  return end ? endOfDay(d) : startOfDay(d);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function accountRef(
  account: { name: string; code: string } | null | undefined,
): DailyReportAccountRef | null {
  if (!account) return null;
  return { name: account.name, code: account.code };
}

function parseInvoiceNumber(reference: string): number | undefined {
  const m = reference.match(/(\d+)\s*$/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

function voucherTypeLabel(type: VoucherType): string {
  if (type === VoucherType.PAYMENT) return 'Payment';
  if (type === VoucherType.RECEIPT) return 'Receipt';
  return 'Journal';
}

function shortInvoiceTypeLabel(type: InvoiceType): string {
  switch (type) {
    case InvoiceType.KACHI_MAAL:
      return 'Kachi Maal';
    case InvoiceType.PURCHASE_MAAL:
      return 'Purchase Maal';
    case InvoiceType.SALE_PAUNCH:
      return 'Sale Paunch';
    case InvoiceType.SALE_COMMISSION:
      return 'Sale Commission';
    case InvoiceType.PURCHASE_GENERAL:
      return 'Purchase Invoice';
    case InvoiceType.SALE_GENERAL:
      return 'Sale Invoice';
    case InvoiceType.GENERAL_TRADE:
      return 'General Trade';
    default:
      return invoiceTypeLabel(type);
  }
}

export async function getDailyReport(
  date: string,
  options?: {
    filterKey?: DailyReportFilterKey;
    pagination?: { limit: number; offset: number } | null;
  },
): Promise<DailyReportResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError(400, 'date must be YYYY-MM-DD');
  }

  const from = parseDay(date, false);
  const to = parseDay(date, true);

  const [vouchers, invoices] = await Promise.all([
    prisma.voucher.findMany({
      where: {
        status: USER_VISIBLE_VOUCHER_STATUS,
        type: { in: DAILY_VOUCHER_TYPES },
        date: { gte: from, lte: to },
      },
      include: {
        debitAccount: { select: { name: true, code: true } },
        creditAccount: { select: { name: true, code: true } },
      },
      orderBy: [{ type: 'asc' }, { number: 'asc' }],
    }),
    prisma.invoice.findMany({
      where: {
        status: USER_VISIBLE_INVOICE_STATUS,
        type: { in: DAILY_INVOICE_TYPES },
        invoiceDate: { gte: from, lte: to },
      },
      include: {
        debitAccount: { select: { name: true, code: true } },
        partyAccount: { select: { name: true, code: true } },
        salePartyAccount: { select: { name: true, code: true } },
        product: {
          select: {
            name: true,
            code: true,
            account: { select: { name: true, code: true } },
          },
        },
        generalPurchaseLines: {
          orderBy: { sortOrder: 'asc' },
          include: {
            product: {
              select: {
                name: true,
                code: true,
                account: { select: { name: true, code: true } },
              },
            },
          },
        },
        generalSaleLines: {
          orderBy: { sortOrder: 'asc' },
          include: {
            product: {
              select: {
                name: true,
                code: true,
                account: { select: { name: true, code: true } },
              },
            },
          },
        },
      },
      orderBy: [{ type: 'asc' }, { id: 'asc' }],
    }),
  ]);

  const voucherRows: DailyReportRow[] = vouchers.map((row) => {
    const { debitAccount, creditAccount } = voucherApprovalAccounts(row);
    return {
      kind: 'voucher' as const,
      id: row.id,
      filterKey: row.type as DailyReportFilterKey,
      typeLabel: voucherTypeLabel(row.type),
      reference: String(row.number),
      amount: num(row.amount),
      date: row.date.toISOString(),
      debitAccount: accountRef(debitAccount),
      creditAccount: accountRef(creditAccount),
      voucherType: row.type,
      voucherNumber: row.number,
    };
  });

  const invoiceRows: DailyReportRow[] = invoices.map((row) => {
    const { debitAccount, creditAccount } = invoiceApprovalAccounts(row);
    const invoiceNumber = parseInvoiceNumber(row.reference);
    return {
      kind: 'invoice' as const,
      id: row.id,
      filterKey: row.type as DailyReportFilterKey,
      typeLabel: shortInvoiceTypeLabel(row.type),
      reference: row.reference,
      amount: num(row.total),
      date: (row.invoiceDate ?? row.createdAt).toISOString(),
      debitAccount: accountRef(debitAccount),
      creditAccount: accountRef(creditAccount),
      invoiceType: row.type,
      invoiceNumber,
      invoiceReference: row.reference,
    };
  });

  const allRows = [...voucherRows, ...invoiceRows].sort((a, b) => {
    const typeCmp = a.typeLabel.localeCompare(b.typeLabel);
    if (typeCmp !== 0) return typeCmp;
    return a.reference.localeCompare(b.reference, undefined, { numeric: true });
  });

  const kindCounts: Partial<Record<DailyReportFilterKey, number>> = {};
  for (const row of allRows) {
    kindCounts[row.filterKey] = (kindCounts[row.filterKey] ?? 0) + 1;
  }

  const totals = {
    count: allRows.length,
    amount: allRows.reduce((sum, row) => sum + row.amount, 0),
  };

  const filterKey = options?.filterKey;
  const filteredRows = filterKey
    ? allRows.filter((row) => row.filterKey === filterKey)
    : allRows;

  const filteredTotals = {
    count: filteredRows.length,
    amount: filteredRows.reduce((sum, row) => sum + row.amount, 0),
  };

  const pagination = options?.pagination ?? null;
  const limit = pagination?.limit ?? filteredRows.length;
  const offset = pagination?.offset ?? 0;
  const rows = pagination
    ? filteredRows.slice(offset, offset + limit)
    : filteredRows;

  return {
    date,
    rows,
    totals,
    filteredTotals,
    kindCounts,
    total: filteredRows.length,
    limit: pagination ? limit : filteredRows.length,
    offset: pagination ? offset : 0,
  };
}
