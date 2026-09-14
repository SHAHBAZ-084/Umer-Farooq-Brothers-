import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Account, type AccountCategory, type Voucher } from '../../lib/api';
import { DEFAULT_BUSINESS_INFO, loadBusinessInfo } from '../../lib/businessInfo';
import { formatDate, formatLedgerAmount, formatLedgerBalance, formatVoucherNumber, formatVoucherTypeLabel, ledgerBalanceColorClass, ledgerCreditColorClass, ledgerDebitColorClass, voucherTypeColorClass } from '../../lib/format';
import { downloadExcel, downloadPdf, formatBusinessContactLine, printReportPdf, type ReportBusinessInfo } from '../../lib/reportExport';
import { useReportFinancialYear } from '../../contexts/ReportFinancialYearContext';
import { ReportFinancialYearSelect } from '../../components/reports/ReportFinancialYearSelect';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { DateField } from '../../components/ui/DateField';
import { Modal } from '../../components/ui/Modal';
import { FieldLabel, FinancialButton, PageShell, Panel, PrimaryButton, SecondaryButton } from '../../components/ui/PageShell';
import { VoucherDetailCard } from '../vouchers/VoucherPages';
import {
  buildCategoryGroupedExportRows,
  CategoryGroupHeaderRow,
  CategoryGroupTotalRow,
  sumGroupField,
} from './categoryReportGroups';

type LedgerResult = Awaited<ReturnType<typeof api.getLedger>>;
type AccountBalanceResult = Awaited<ReturnType<typeof api.getAccountBalanceReport>>;
type BalanceSideFilter = 'debit' | 'credit' | 'both';
type VoucherTypeFilter = 'all' | 'PAYMENT' | 'RECEIPT' | 'JOURNAL' | 'KACHI' | 'PURCHASE_MAAL';

export const REPORT_PAGE_SIZE = 30;

/** Shared on-screen letterhead used above every report results block. */
function ReportLetterheadBlock({
  businessInfo,
  title,
  subtitle,
}: {
  businessInfo: ReportBusinessInfo;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-6 text-center">
      <p className="text-3xl font-bold tracking-wide text-textPrimary sm:text-4xl">{businessInfo.businessName}</p>
      <p className="mt-1 text-sm text-textSecondary">{businessInfo.proprietorName}</p>
      {businessInfo.address?.trim() ? (
        <p className="whitespace-pre-line text-xs text-textSecondary">{businessInfo.address.trim()}</p>
      ) : null}
      <p className="text-xs text-textMuted">{formatBusinessContactLine(businessInfo)}</p>
      <h2 className="mt-3 text-lg font-semibold text-financial">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-textSecondary">{subtitle}</p> : null}
    </div>
  );
}

function useReportBusinessInfo() {
  const [businessInfo, setBusinessInfo] = useState<ReportBusinessInfo>(DEFAULT_BUSINESS_INFO);
  useEffect(() => {
    void loadBusinessInfo().then(setBusinessInfo);
  }, []);
  return businessInfo;
}

function reportPageLabel(offset: number, limit: number, total: number, pageCount?: number) {
  if (total <= 0) return 'No rows';
  if (pageCount != null && pageCount > 0) {
    const pageIndex = Math.floor(offset / Math.max(limit, 1));
    return `Page ${pageIndex + 1} of ${pageCount} · ${total} account${total === 1 ? '' : 's'}`;
  }
  const from = offset + 1;
  const to = Math.min(offset + limit, total);
  return `Showing ${from}–${to} of ${total}`;
}

export function ReportPager(props: {
  offset: number;
  limit: number;
  total: number;
  loading?: boolean;
  onChange: (nextOffset: number) => void;
  /** When set (e.g. category-packed Account Balance), Next/Prev follow page boundaries. */
  pageCount?: number;
}) {
  const { offset, limit, total, loading, onChange, pageCount } = props;
  const pageIndex = pageCount != null ? Math.floor(offset / Math.max(limit, 1)) : null;
  const hasMultiplePages = pageCount != null ? pageCount > 1 : total > limit;
  if (!hasMultiplePages) {
    return total > 0 ? (
      <p className="text-sm text-textSecondary">{reportPageLabel(offset, limit, total, pageCount)}</p>
    ) : null;
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm text-textSecondary">{reportPageLabel(offset, limit, total, pageCount)}</p>
      <div className="flex gap-2">
        <SecondaryButton
          type="button"
          disabled={loading || offset <= 0 || (pageIndex != null && pageIndex <= 0)}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          Previous
        </SecondaryButton>
        <SecondaryButton
          type="button"
          disabled={
            loading
            || (pageCount != null && pageIndex != null
              ? pageIndex >= pageCount - 1
              : offset + limit >= total)
          }
          onClick={() => onChange(offset + limit)}
        >
          Next
        </SecondaryButton>
      </div>
    </div>
  );
}

function todayInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function voucherFromAccount(voucher: Voucher) {
  if (voucher.type === 'KACHI' || voucher.type === 'PURCHASE_MAAL') return 'Multi-leg';
  if (voucher.type === 'JOURNAL') return voucher.debitAccount?.name ?? '—';
  return voucher.creditAccount?.name ?? '—';
}

function voucherToAccount(voucher: Voucher) {
  if (voucher.type === 'KACHI' || voucher.type === 'PURCHASE_MAAL') return `${voucher.ledgerEntries?.length ?? 0} legs`;
  if (voucher.type === 'JOURNAL') return voucher.creditAccount?.name ?? '—';
  return voucher.debitAccount?.name ?? '—';
}

export function AccountReportsPage() {
  const {
    financialYearId,
    financialYearIdNum,
    selectedYear,
  } = useReportFinancialYear();
  const [categories, setCategories] = useState<AccountCategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [ledger, setLedger] = useState<LedgerResult | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const businessInfo = useReportBusinessInfo();
  const dateDefaultsAppliedRef = useRef(false);

  const filteredAccounts = useMemo(
    () => accounts.filter((a) => categoryId && String(a.categoryId) === categoryId),
    [accounts, categoryId],
  );

  useEffect(() => {
    Promise.all([api.listCategories(), api.listAccounts()])
      .then(([categoryRows, accountRows]) => {
        setCategories(categoryRows.filter((c) => c.isActive));
        setAccounts(accountRows.filter((a) => a.isActive));
      })
      .catch(() => {
        setCategories([]);
        setAccounts([]);
      });
  }, []);

  useEffect(() => {
    if (!selectedYear?.startDate || dateDefaultsAppliedRef.current) return;
    setFromDate(selectedYear.startDate.slice(0, 10));
    setToDate(todayInputValue());
    dateDefaultsAppliedRef.current = true;
  }, [selectedYear?.id, selectedYear?.startDate]);

  useEffect(() => {
    setLoaded(false);
    setLedger(null);
    setOffset(0);
    setError('');
  }, [financialYearId]);

  function onCategoryChange(nextCategoryId: string) {
    setCategoryId(nextCategoryId);
    setAccountId('');
    setLoaded(false);
    setLedger(null);
    setOffset(0);
    setError('');
  }

  function onAccountChange(nextAccountId: string) {
    setAccountId(nextAccountId);
    setLoaded(false);
    setLedger(null);
    setOffset(0);
    setError('');
  }

  async function loadLedger(nextOffset = 0) {
    if (!categoryId) {
      setError('Select a category');
      return;
    }
    if (!accountId) {
      setError('Select an account');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await api.getLedger(Number(accountId), {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        financialYearId: financialYearIdNum,
        limit: REPORT_PAGE_SIZE,
        offset: nextOffset,
      });
      setLedger(result);
      setOffset(result.offset);
      setLoaded(true);
      setFiltersOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ledger');
      setLedger(null);
    } finally {
      setLoading(false);
    }
  }

  async function exportLedger(format: 'pdf' | 'excel' | 'print') {
    if (!ledger) return;
    const accountName = ledger.account.name;
    const period = [fromDate, toDate].filter(Boolean).join(' to ') || 'All dates';
    const title = `${accountName} (${period})`;
    const headers = ['Date', 'Voucher#', 'Ref#', 'Type', 'Description', 'Debit', 'Credit', 'Balance'];

    let exportRows = ledger.rows;
    if (ledger.total > ledger.rows.filter((r) => !r.isOpeningRow).length) {
      try {
        const full = await api.getLedger(Number(accountId), {
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          financialYearId: financialYearIdNum,
        });
        exportRows = full.rows;
      } catch {
        // Fall back to current page.
      }
    }

    const rows = exportRows.map((r) => [
      formatDate(r.date),
      r.voucherNo,
      r.ref ?? '',
      r.type,
      r.description,
      r.debit > 0 ? formatLedgerAmount(r.debit) : '',
      r.credit > 0 ? formatLedgerAmount(r.credit) : '',
      formatLedgerBalance(r.balance),
    ]);
    rows.push([
      'Total / Closing',
      '',
      '',
      '',
      '',
      formatLedgerAmount(ledger.summary.totalDebit),
      formatLedgerAmount(ledger.summary.totalCredit),
      formatLedgerBalance(ledger.summary.closingBalance),
    ]);
    const safeName = accountName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
    const base = `ledger-${safeName || 'account'}`;
    if (format === 'excel') {
      downloadExcel(`${base}.xlsx`, 'Ledger', headers, rows, businessInfo);
    } else if (format === 'print') {
      printReportPdf(title, headers, rows, businessInfo);
    } else {
      downloadPdf(`${base}.pdf`, title, headers, rows, businessInfo);
    }
  }

  return (
    <PageShell
      title="Account Ledger"
      subtitle={
        selectedYear
          ? `View ledger entries · FY ${selectedYear.label}${selectedYear.status === 'ACTIVE' ? ' (Active)' : ''}`
          : 'View ledger entries for any account'
      }
    >
      <Modal
        open={filtersOpen}
        title="Account Ledger"
        onClose={() => setFiltersOpen(false)}
        footer={
          <>
            <PrimaryButton type="button" onClick={() => void loadLedger(0)} disabled={loading || !financialYearId}>
              {loading ? 'Loading…' : 'Generate Report'}
            </PrimaryButton>
          </>
        }
      >
        <div className="report-filter-stack">
          <div>
            <FieldLabel>Category</FieldLabel>
            <SearchSelect
              value={categoryId}
              onChange={onCategoryChange}
              options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
              placeholder="Search category…"
            />
          </div>
          <div>
            <FieldLabel>Account</FieldLabel>
            <SearchSelect
              value={accountId}
              onChange={onAccountChange}
              options={filteredAccounts.map((a) => ({ value: String(a.id), label: a.name }))}
              placeholder={categoryId ? 'Search account…' : 'Select a category first'}
              disabled={!categoryId}
            />
          </div>
          <div>
            <FieldLabel>From date</FieldLabel>
            <DateField value={fromDate} onChange={setFromDate} />
          </div>
          <div>
            <FieldLabel>To date</FieldLabel>
            <DateField value={toDate} onChange={setToDate} />
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      </Modal>

      <Panel className="overflow-visible">
        {!filtersOpen && !loaded ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-textSecondary">Select filters to generate the account ledger.</p>
            <SecondaryButton type="button" onClick={() => setFiltersOpen(true)}>Open filters</SecondaryButton>
          </div>
        ) : !filtersOpen && ledger && ledger.rows.length === 0 ? (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              <SecondaryButton type="button" onClick={() => setFiltersOpen(true)}>Edit filters</SecondaryButton>
            </div>
            <ReportLetterheadBlock
              businessInfo={businessInfo}
              title={ledger.account.name}
              subtitle={[fromDate, toDate].filter(Boolean).join(' to ') || 'All dates'}
            />
            <p className="text-sm text-textSecondary">No entries in this period</p>
          </>
        ) : !filtersOpen && ledger ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <SecondaryButton type="button" onClick={() => setFiltersOpen(true)}>Edit filters</SecondaryButton>
                <SecondaryButton type="button" onClick={() => void exportLedger('pdf')}>Download PDF</SecondaryButton>
                <SecondaryButton type="button" onClick={() => void exportLedger('excel')}>Download Excel</SecondaryButton>
                <SecondaryButton type="button" onClick={() => void exportLedger('print')}>Print</SecondaryButton>
              </div>
              <ReportPager
                offset={offset}
                limit={ledger.limit}
                total={ledger.total}
                loading={loading}
                onChange={(next) => void loadLedger(next)}
              />
            </div>
            <ReportLetterheadBlock
              businessInfo={businessInfo}
              title={ledger.account.name}
              subtitle={[fromDate, toDate].filter(Boolean).join(' to ') || 'All dates'}
            />
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-[7.5rem]" />
                  <col className="w-[5.75rem]" />
                  <col className="w-[6.5rem]" />
                  <col className="w-[5.5rem]" />
                  <col />
                  <col className="w-[5.5rem]" />
                  <col className="w-[5.5rem]" />
                  <col className="w-[6.5rem]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border text-textSecondary">
                    <th className="py-2 pr-2">Date</th>
                    <th className="py-2 pr-4 text-right">Voucher#</th>
                    <th className="py-2 pl-3 pr-2">Ref#</th>
                    <th className="py-2 pr-2">Type</th>
                    <th className="py-2 pr-2">Description</th>
                    <th className="py-2 pr-2 text-right">Debit</th>
                    <th className="py-2 pr-2 text-right">Credit</th>
                    <th className="py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.rows.map((r, i) => (
                    <tr key={i} className={`border-b border-border ${r.isOpeningRow ? 'bg-surface1 font-medium' : ''}`}>
                      <td className="py-2 pr-2 align-top whitespace-nowrap">{formatDate(r.date)}</td>
                      <td className="py-2 pr-4 align-top text-right font-mono text-xs font-semibold text-financial">{r.voucherNo}</td>
                      <td className="py-2 pl-3 pr-2 align-top truncate text-textSecondary" title={r.ref ?? ''}>{r.ref ?? ''}</td>
                      <td className={`py-2 pr-2 align-top font-medium ${voucherTypeColorClass(r.type)}`}>{formatVoucherTypeLabel(r.type)}</td>
                      <td className="py-2 pr-2 align-top whitespace-normal break-words text-textSecondary">{r.description}</td>
                      <td className={`py-2 pr-2 align-top text-right tabular-nums ${ledgerDebitColorClass(r.debit)}`}>{r.debit > 0 ? formatLedgerAmount(r.debit) : ''}</td>
                      <td className={`py-2 pr-2 align-top text-right tabular-nums ${ledgerCreditColorClass(r.credit)}`}>{r.credit > 0 ? formatLedgerAmount(r.credit) : ''}</td>
                      <td className={`py-2 align-top text-right font-medium tabular-nums ${ledgerBalanceColorClass(r.balance)}`}>{formatLedgerBalance(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="py-2" colSpan={5}>Total / Closing (full period)</td>
                    <td className={`py-2 text-right ${ledgerDebitColorClass(ledger.summary.totalDebit)}`}>{formatLedgerAmount(ledger.summary.totalDebit)}</td>
                    <td className={`py-2 text-right ${ledgerCreditColorClass(ledger.summary.totalCredit)}`}>{formatLedgerAmount(ledger.summary.totalCredit)}</td>
                    <td className={`py-2 text-right font-medium tabular-nums ${ledgerBalanceColorClass(ledger.summary.closingBalance)}`}>{formatLedgerBalance(ledger.summary.closingBalance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="mt-3">
              <ReportPager
                offset={offset}
                limit={ledger.limit}
                total={ledger.total}
                loading={loading}
                onChange={(next) => void loadLedger(next)}
              />
            </div>
          </>
        ) : null}
      </Panel>
    </PageShell>
  );
}

export function TrialBalancePage() {
  const {
    years,
    financialYearId,
    setFinancialYearId,
    financialYearIdNum,
    selectedYear,
    loading: yearsLoading,
  } = useReportFinancialYear();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getTrialBalance>> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const businessInfo = useReportBusinessInfo();

  useEffect(() => {
    setLoaded(false);
    setData(null);
    setError('');
    setOffset(0);
  }, [financialYearId]);

  async function loadTrialBalance(nextOffset = 0) {
    if (financialYearIdNum == null) {
      setError('Select a financial year');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await api.getTrialBalance({
        financialYearId: financialYearIdNum,
        limit: REPORT_PAGE_SIZE,
        offset: nextOffset,
      });
      setData(result);
      setOffset(result.offset);
      setLoaded(true);
      setFiltersOpen(false);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Failed to load trial balance');
    } finally {
      setLoading(false);
    }
  }

  async function exportTrialBalance(format: 'pdf' | 'excel' | 'print') {
    if (!data || financialYearIdNum == null) return;
    const headers = ['Account', 'Debit', 'Credit'];
    let groups = data.groups;
    let totalDebit = data.totalDebit;
    let totalCredit = data.totalCredit;
    let isBalanced = data.isBalanced;
    if (data.pageCount != null && data.pageCount > 1) {
      try {
        const full = await api.getTrialBalance({ financialYearId: financialYearIdNum });
        groups = full.groups;
        totalDebit = full.totalDebit;
        totalCredit = full.totalCredit;
        isBalanced = full.isBalanced;
      } catch {
        // Fall back to current page groups.
      }
    }
    const rows =
      groups.length > 0
        ? buildCategoryGroupedExportRows(groups, {
            headerPadding: ['', ''],
            formatAccount: (row) => [
              row.accountName,
              row.debit.toFixed(2),
              row.credit.toFixed(2),
            ],
            formatCategoryTotal: (categoryName, accounts) => [
              `${categoryName} Total`,
              sumGroupField(accounts, (a) => a.debit).toFixed(2),
              sumGroupField(accounts, (a) => a.credit).toFixed(2),
            ],
            grandTotalRow: [
              'GRAND TOTAL',
              totalDebit.toFixed(2),
              totalCredit.toFixed(2),
            ],
          })
        : [
            ...data.accounts.map((row) => [
              row.accountName,
              row.debit.toFixed(2),
              row.credit.toFixed(2),
            ]),
            ['Total', totalDebit.toFixed(2), totalCredit.toFixed(2)],
          ];
    const title = `Detail Trial Balance${isBalanced ? '' : ' (Out of balance)'}`;
    if (format === 'excel') {
      downloadExcel('trial-balance.xlsx', 'Trial Balance', headers, rows, businessInfo);
    } else if (format === 'print') {
      printReportPdf(title, headers, rows, businessInfo);
    } else {
      downloadPdf('trial-balance.pdf', title, headers, rows, businessInfo);
    }
  }

  return (
    <PageShell
      title="Detail Trial Balance"
      subtitle={
        selectedYear
          ? `Debit and credit totals · FY ${selectedYear.label}${selectedYear.status === 'ACTIVE' ? ' (Active)' : ''}`
          : 'Debit and credit totals by account'
      }
    >
      <Modal
        open={filtersOpen}
        title="Detail Trial Balance"
        onClose={() => setFiltersOpen(false)}
        footer={
          <>
            <PrimaryButton type="button" onClick={() => void loadTrialBalance(0)} disabled={loading || !financialYearId}>
              {loading ? 'Loading…' : 'Generate Report'}
            </PrimaryButton>
          </>
        }
      >
        <div className="report-filter-stack">
          <ReportFinancialYearSelect
            value={financialYearId}
            years={years}
            onChange={setFinancialYearId}
            disabled={yearsLoading}
          />
        </div>
        {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      </Modal>

      <Panel>
        {!filtersOpen && !loaded ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-textSecondary">Select a financial year to generate the trial balance.</p>
            <SecondaryButton type="button" onClick={() => setFiltersOpen(true)}>Open filters</SecondaryButton>
          </div>
        ) : !filtersOpen && data ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <SecondaryButton type="button" onClick={() => setFiltersOpen(true)}>Edit filters</SecondaryButton>
                <SecondaryButton type="button" onClick={() => void exportTrialBalance('pdf')}>Download PDF</SecondaryButton>
                <SecondaryButton type="button" onClick={() => void exportTrialBalance('excel')}>Download Excel</SecondaryButton>
                <SecondaryButton type="button" onClick={() => void exportTrialBalance('print')}>Print</SecondaryButton>
              </div>
              <ReportPager
                offset={offset}
                limit={data.limit}
                total={data.total}
                pageCount={data.pageCount}
                loading={loading}
                onChange={(next) => void loadTrialBalance(next)}
              />
            </div>
            <ReportLetterheadBlock
              businessInfo={businessInfo}
              title={`Detail Trial Balance${data.isBalanced ? '' : ' (Out of balance)'}`}
            />
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-textSecondary">
                  <th className="py-2">Account</th>
                  <th className="py-2 text-right">Debit</th>
                  <th className="py-2 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {(data.groups.length > 0 ? data.groups : []).map((group) => {
                  const groupDebit = sumGroupField(group.accounts, (a) => a.debit);
                  const groupCredit = sumGroupField(group.accounts, (a) => a.credit);
                  return (
                    <Fragment key={group.categoryId}>
                      <CategoryGroupHeaderRow name={group.categoryName} colSpan={3} />
                      {group.accounts.map((row) => (
                        <tr key={row.accountId} className="border-b border-border">
                          <td className="py-2">{row.accountName}</td>
                          <td className={`py-2 text-right tabular-nums ${ledgerDebitColorClass(row.debit)}`}>
                            {row.debit.toFixed(2)}
                          </td>
                          <td className={`py-2 text-right tabular-nums ${ledgerCreditColorClass(row.credit)}`}>
                            {row.credit.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                      <CategoryGroupTotalRow categoryName={group.categoryName}>
                        <td className={`py-2 text-right font-bold tabular-nums ${ledgerDebitColorClass(groupDebit)}`}>
                          {groupDebit.toFixed(2)}
                        </td>
                        <td className={`py-2 text-right font-bold tabular-nums ${ledgerCreditColorClass(groupCredit)}`}>
                          {groupCredit.toFixed(2)}
                        </td>
                      </CategoryGroupTotalRow>
                    </Fragment>
                  );
                })}
                {data.groups.length === 0
                  ? data.accounts.map((row) => (
                      <tr key={row.accountId} className="border-b border-border">
                        <td className="py-2">{row.accountName}</td>
                        <td className={`py-2 text-right tabular-nums ${ledgerDebitColorClass(row.debit)}`}>
                          {row.debit.toFixed(2)}
                        </td>
                        <td className={`py-2 text-right tabular-nums ${ledgerCreditColorClass(row.credit)}`}>
                          {row.credit.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  : null}
                {offset + data.limit >= data.total ? (
                  <tr className="border-t-2 border-borderStrong bg-surface1">
                    <td className="py-2.5 pr-3 font-bold uppercase tracking-wide text-textPrimary">
                      Grand Total (full period)
                    </td>
                    <td className={`py-2.5 text-right font-bold tabular-nums ${ledgerDebitColorClass(data.totalDebit)}`}>
                      {data.totalDebit.toFixed(2)}
                    </td>
                    <td className={`py-2.5 text-right font-bold tabular-nums ${ledgerCreditColorClass(data.totalCredit)}`}>
                      {data.totalCredit.toFixed(2)}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <p className="mt-4 text-sm text-textSecondary">
              {data.isBalanced ? 'Balanced' : 'Out of balance'}
              {' · '}Full period
            </p>
            <div className="mt-3">
              <ReportPager
                offset={offset}
                limit={data.limit}
                total={data.total}
                pageCount={data.pageCount}
                loading={loading}
                onChange={(next) => void loadTrialBalance(next)}
              />
            </div>
          </>
        ) : null}
      </Panel>
    </PageShell>
  );
}

export function SalePurchaseReportsPage() {
  type Mode = 'SALE' | 'PURCHASE';
  type TypeFilter = 'ALL' | 'COMMISSION' | 'PAUNCH' | 'MAAL';
  type ReportResult = Awaited<ReturnType<typeof api.getSalePurchaseReport>>;

  const { selectedYear } = useReportFinancialYear();
  const [mode, setMode] = useState<Mode>('SALE');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [partyAccountId, setPartyAccountId] = useState('');
  const [productId, setProductId] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [products, setProducts] = useState<Array<{ id: number; name: string; code: string }>>([]);
  const [report, setReport] = useState<ReportResult | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const businessInfo = useReportBusinessInfo();
  const dateDefaultsAppliedRef = useRef(false);

  useEffect(() => {
    if (!selectedYear?.startDate || dateDefaultsAppliedRef.current) return;
    setFromDate(selectedYear.startDate.slice(0, 10));
    setToDate(todayInputValue());
    dateDefaultsAppliedRef.current = true;
  }, [selectedYear?.id, selectedYear?.startDate]);

  useEffect(() => {
    api.listAccounts()
      .then((rows) => setAccounts(rows.filter((a) => a.isActive !== false)))
      .catch(() => setAccounts([]));
    api.listProducts()
      .then((rows) => setProducts(rows.map((p) => ({ id: p.id, name: p.name, code: p.code }))))
      .catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    if (mode === 'PURCHASE') {
      setTypeFilter('MAAL');
    } else if (typeFilter === 'MAAL') {
      setTypeFilter('ALL');
    }
    setPartyAccountId('');
    setReport(null);
    setLoaded(false);
    setOffset(0);
  }, [mode]);

  const partyOptions = useMemo(() => {
    const saleCats = new Set(['Sale Party']);
    const purchaseCats = new Set(['Int. Purchase Party', 'Ext. Purchase Party']);
    const allowed = mode === 'SALE' ? saleCats : purchaseCats;
    return accounts
      .filter((a) => a.category && allowed.has(a.category.name))
      .map((a) => ({ value: String(a.id), label: a.name }));
  }, [accounts, mode]);

  const typeOptions = mode === 'SALE'
    ? [
        { value: 'ALL', label: 'All' },
        { value: 'COMMISSION', label: 'Commission' },
        { value: 'PAUNCH', label: 'Paunch' },
      ]
    : [{ value: 'MAAL', label: 'Maal' }];

  async function loadReport(nextOffset = 0) {
    setError('');
    if (!fromDate || !toDate) {
      setError('Select from and to dates');
      return;
    }
    setLoading(true);
    try {
      const result = await api.getSalePurchaseReport({
        mode,
        typeFilter: mode === 'PURCHASE' ? 'MAAL' : typeFilter,
        fromDate,
        toDate,
        partyAccountId: partyAccountId ? Number(partyAccountId) : null,
        productId: productId ? Number(productId) : null,
        limit: REPORT_PAGE_SIZE,
        offset: nextOffset,
      });
      setReport(result);
      setOffset(result.offset);
      setLoaded(true);
      setFiltersOpen(false);
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }

  function onView() {
    void loadReport(0);
  }

  function filterSummary(r: ReportResult) {
    const typeLabel = r.typeFilter === 'ALL'
      ? 'All'
      : r.typeFilter === 'COMMISSION'
        ? 'Commission'
        : r.typeFilter === 'PAUNCH'
          ? 'Paunch'
          : 'Maal';
    const partyLabel = partyAccountId
      ? (partyOptions.find((p) => p.value === partyAccountId)?.label ?? partyAccountId)
      : 'All Parties';
    const productLabel = productId
      ? (products.find((p) => String(p.id) === productId)?.name ?? productId)
      : 'All Products';
    return `From ${formatDate(r.fromDate)} To ${formatDate(r.toDate)} · Type: ${typeLabel} · Account: ${partyLabel} · Product: ${productLabel}`;
  }

  function exportFlatRows(r: ReportResult): (string | number)[][] {
    const out: (string | number)[][] = [];
    for (const cat of r.categories) {
      if (cat.label) out.push([cat.label, '', '', '', '', '', '']);
      for (const party of cat.parties) {
        out.push([party.partyName, '', '', '', '', '', '']);
        for (const row of party.rows) {
          out.push([
            row.invoiceNumber,
            row.product,
            row.thela,
            row.bori,
            Number(row.weight.toFixed(2)),
            Number(row.totalPrice.toFixed(2)),
            Number(row.netBill.toFixed(2)),
          ]);
        }
        out.push([
          'Total Up To Party',
          '',
          Number(party.subtotal.thela.toFixed(2)),
          Number(party.subtotal.bori.toFixed(2)),
          Number(party.subtotal.weight.toFixed(2)),
          Number(party.subtotal.totalPrice.toFixed(2)),
          Number(party.subtotal.netBill.toFixed(2)),
        ]);
      }
      if (cat.label) {
        out.push([
          `Total ${cat.label}`,
          '',
          Number(cat.subtotal.thela.toFixed(2)),
          Number(cat.subtotal.bori.toFixed(2)),
          Number(cat.subtotal.weight.toFixed(2)),
          Number(cat.subtotal.totalPrice.toFixed(2)),
          Number(cat.subtotal.netBill.toFixed(2)),
        ]);
      }
    }
    out.push([
      'Grand Total',
      '',
      Number(r.grandTotal.thela.toFixed(2)),
      Number(r.grandTotal.bori.toFixed(2)),
      Number(r.grandTotal.weight.toFixed(2)),
      Number(r.grandTotal.totalPrice.toFixed(2)),
      Number(r.grandTotal.netBill.toFixed(2)),
    ]);
    return out;
  }

  async function onExport(format: 'pdf' | 'excel' | 'print') {
    if (!report) return;
    const headers = ['Invoice #', 'Product', 'Thela', 'Bori', 'Weight', 'Total Price', 'NetBill'];
    let exportSource = report;
    if (report.total > report.limit) {
      try {
        exportSource = await api.getSalePurchaseReport({
          mode,
          typeFilter,
          fromDate,
          toDate,
          partyAccountId: partyAccountId ? Number(partyAccountId) : undefined,
          productId: productId ? Number(productId) : undefined,
        });
      } catch {
        // Fall back to current page.
      }
    }
    const rows = exportFlatRows(exportSource);
    const base = `${exportSource.mode.toLowerCase()}-report-${exportSource.fromDate}-to-${exportSource.toDate}`;
    if (format === 'excel') {
      downloadExcel(`${base}.xlsx`, exportSource.title, headers, rows, businessInfo);
    } else if (format === 'print') {
      printReportPdf(exportSource.title, headers, rows, businessInfo, {
        subtitle: filterSummary(exportSource),
      });
    } else {
      downloadPdf(`${base}.pdf`, exportSource.title, headers, rows, businessInfo, {
        subtitle: filterSummary(exportSource),
      });
    }
  }

  function fmtQty(n: number) {
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  }

  return (
    <PageShell title="Sale/Purchase Reports" subtitle="Combined invoice reporting (Kachi Maal excluded)">
      <Modal
        open={filtersOpen}
        title="Sale/Purchase Reports"
        onClose={() => setFiltersOpen(false)}
        footer={
          <>
            <FinancialButton type="button" onClick={onView} disabled={loading}>
              {loading ? 'Loading…' : 'Generate Report'}
            </FinancialButton>
          </>
        }
      >
        <div className="report-filter-stack">
          <div>
            <FieldLabel>Sale / Purchase</FieldLabel>
            <SegmentedControl
              value={mode}
              onChange={(v) => setMode(v as Mode)}
              options={[
                { value: 'SALE', label: 'Sale' },
                { value: 'PURCHASE', label: 'Purchase' },
              ]}
            />
          </div>
          <div>
            <FieldLabel>Type</FieldLabel>
            <SegmentedControl
              value={typeFilter}
              onChange={(v) => setTypeFilter(v as TypeFilter)}
              options={typeOptions}
            />
          </div>
          <div>
            <FieldLabel>From</FieldLabel>
            <DateField value={fromDate} onChange={setFromDate} />
          </div>
          <div>
            <FieldLabel>To</FieldLabel>
            <DateField value={toDate} onChange={setToDate} />
          </div>
          <div>
            <FieldLabel>Account</FieldLabel>
            <SearchSelect
              value={partyAccountId}
              onChange={setPartyAccountId}
              options={[{ value: '', label: 'All Parties' }, ...partyOptions]}
              placeholder="All Parties"
            />
          </div>
          <div>
            <FieldLabel>Product</FieldLabel>
            <SearchSelect
              value={productId}
              onChange={setProductId}
              options={[
                { value: '', label: 'All Products' },
                ...products.map((p) => ({ value: String(p.id), label: p.name })),
              ]}
              placeholder="All Products"
            />
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      </Modal>

      {!filtersOpen && !loaded ? (
        <Panel className="mt-4 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-textSecondary">Select filters to generate the sale/purchase report.</p>
            <SecondaryButton type="button" onClick={() => setFiltersOpen(true)}>Open filters</SecondaryButton>
          </div>
        </Panel>
      ) : null}

      {!filtersOpen && report ? (
        <Panel className="mt-4 sale-purchase-report-print">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 print:hidden">
            <ReportPager
              offset={offset}
              limit={report.limit}
              total={report.total}
              loading={loading}
              onChange={(next) => void loadReport(next)}
            />
            <div className="flex flex-wrap gap-2">
              <SecondaryButton type="button" onClick={() => setFiltersOpen(true)}>Edit filters</SecondaryButton>
              <SecondaryButton type="button" onClick={() => void onExport('print')}>Print</SecondaryButton>
              <SecondaryButton type="button" onClick={() => void onExport('pdf')}>PDF</SecondaryButton>
              <SecondaryButton type="button" onClick={() => void onExport('excel')}>Excel</SecondaryButton>
            </div>
          </div>

          <ReportLetterheadBlock
            businessInfo={businessInfo}
            title={report.title}
            subtitle={filterSummary(report)}
          />

          {report.rowCount === 0 ? (
            <p className="text-sm text-textSecondary">No invoices match these filters.</p>
          ) : (
            <div className="space-y-6">
              {report.categories.map((cat) => (
                <div key={`${cat.category}-${cat.label || 'main'}`}>
                  {cat.label ? (
                    <h3 className="mb-3 border-b border-border pb-1 text-base font-semibold text-textPrimary">
                      {cat.label}
                    </h3>
                  ) : null}

                  {cat.parties.map((party) => (
                    <div key={party.partyAccountId} className="mb-5">
                      <h4 className="mb-2 text-sm font-semibold text-financial">{party.partyName}</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-border text-textSecondary">
                              <th className="py-1.5 pr-2">Invoice #</th>
                              <th className="py-1.5 pr-2">Product</th>
                              <th className="py-1.5 pr-2 text-right">Thela</th>
                              <th className="py-1.5 pr-2 text-right">Bori</th>
                              <th className="py-1.5 pr-2 text-right">Weight</th>
                              <th className="py-1.5 pr-2 text-right">Total Price</th>
                              <th className="py-1.5 text-right">NetBill</th>
                            </tr>
                          </thead>
                          <tbody>
                            {party.rows.map((row, idx) => (
                              <tr key={`${row.invoiceId}-${idx}`} className="border-b border-border/60">
                                <td className="py-1.5 pr-2 tabular-nums">{row.invoiceNumber}</td>
                                <td className="py-1.5 pr-2">{row.product}</td>
                                <td className="py-1.5 pr-2 text-right tabular-nums">{fmtQty(row.thela)}</td>
                                <td className="py-1.5 pr-2 text-right tabular-nums">{fmtQty(row.bori)}</td>
                                <td className="py-1.5 pr-2 text-right tabular-nums">{fmtQty(row.weight)}</td>
                                <td className="py-1.5 pr-2 text-right tabular-nums">{formatLedgerAmount(row.totalPrice)}</td>
                                <td className="py-1.5 text-right tabular-nums">{formatLedgerAmount(row.netBill)}</td>
                              </tr>
                            ))}
                            <tr className="border-t border-border font-semibold">
                              <td className="py-1.5 pr-2" colSpan={2}>Total Up To Party</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums">{fmtQty(party.subtotal.thela)}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums">{fmtQty(party.subtotal.bori)}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums">{fmtQty(party.subtotal.weight)}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums">{formatLedgerAmount(party.subtotal.totalPrice)}</td>
                              <td className="py-1.5 text-right tabular-nums">{formatLedgerAmount(party.subtotal.netBill)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}

                  {cat.label ? (
                    <div className="mb-2 text-sm font-semibold text-textPrimary">
                      Total {cat.label}: Thela {fmtQty(cat.subtotal.thela)} · Bori {fmtQty(cat.subtotal.bori)} · Weight{' '}
                      {fmtQty(cat.subtotal.weight)} ·{' '}
                      {formatLedgerAmount(cat.subtotal.totalPrice)} / {formatLedgerAmount(cat.subtotal.netBill)}
                    </div>
                  ) : null}
                </div>
              ))}

              <div className="border-t-2 border-border pt-3 text-sm font-semibold text-financial">
                Grand Total (full period) — Thela {fmtQty(report.grandTotal.thela)} · Bori {fmtQty(report.grandTotal.bori)} · Weight{' '}
                {fmtQty(report.grandTotal.weight)} · Total Price {formatLedgerAmount(report.grandTotal.totalPrice)} · NetBill{' '}
                {formatLedgerAmount(report.grandTotal.netBill)}
              </div>
              <div className="mt-3 print:hidden">
                <ReportPager
                  offset={offset}
                  limit={report.limit}
                  total={report.total}
                  loading={loading}
                  onChange={(next) => void loadReport(next)}
                />
              </div>
            </div>
          )}
        </Panel>
      ) : null}
    </PageShell>
  );
}

type StockBagType = 'BORI' | 'THELA';
type StockReportResult = Awaited<ReturnType<typeof api.getStockReport>>;

export function StockReportPage() {
  const [products, setProducts] = useState<
    Array<{ id: number; name: string; code: string; stockMode?: string }>
  >([]);
  const [productId, setProductId] = useState('');
  const [bagType, setBagType] = useState<StockBagType>('BORI');
  const [report, setReport] = useState<StockReportResult | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const businessInfo = useReportBusinessInfo();

  useEffect(() => {
    api.listProducts()
      .then((rows) =>
        setProducts(
          rows.map((p) => ({
            id: p.id,
            name: p.name,
            code: p.code,
            stockMode: p.category?.stockMode,
          })),
        ),
      )
      .catch(() => setProducts([]));
  }, []);

  const selectedProduct = products.find((p) => String(p.id) === productId);
  const isQuantityProduct = selectedProduct?.stockMode === 'QUANTITY';
  const qtyMode = report?.stockMode === 'QUANTITY' || isQuantityProduct;

  async function loadReport(nextOffset = 0) {
    setError('');
    const id = Number(productId);
    if (!Number.isFinite(id) || id < 1) {
      setError('Select a product');
      return;
    }
    setLoading(true);
    try {
      const result = await api.getStockReport({
        productId: id,
        bagType,
        limit: REPORT_PAGE_SIZE,
        offset: nextOffset,
      });
      setReport(result);
      setOffset(result.offset);
      setLoaded(true);
      setFiltersOpen(false);
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : 'Failed to load stock report');
    } finally {
      setLoading(false);
    }
  }

  function onLoad() {
    void loadReport(0);
  }

  return (
    <PageShell
      title="Stock Report"
      subtitle={
        qtyMode
          ? 'Quantity stock for general goods (Purchase IN / Sale OUT). Negatives shown as-is.'
          : 'Bag stock from Purchase to Maal (IN) and Sale on Paunch (OUT)'
      }
    >
      <Modal
        open={filtersOpen}
        title="Stock Report"
        onClose={() => setFiltersOpen(false)}
        footer={
          <>
            <FinancialButton type="button" onClick={onLoad} disabled={loading}>
              {loading ? 'Loading…' : 'Generate Report'}
            </FinancialButton>
          </>
        }
      >
        <div className="report-filter-stack">
          <div>
            <FieldLabel>Product</FieldLabel>
            <SearchSelect
              value={productId}
              onChange={setProductId}
              options={products.map((p) => ({ value: String(p.id), label: p.name }))}
              placeholder="Search product…"
            />
          </div>
          {!isQuantityProduct ? (
            <div>
              <FieldLabel>Bag type</FieldLabel>
              <SegmentedControl
                value={bagType}
                onChange={(v) => setBagType(v as StockBagType)}
                options={[
                  { value: 'BORI', label: 'Bori' },
                  { value: 'THELA', label: 'Thela' },
                ]}
              />
            </div>
          ) : (
            <div>
              <FieldLabel>Mode</FieldLabel>
              <p className="rounded-lg border border-border px-3 py-2 text-sm text-textSecondary">
                Quantity
              </p>
            </div>
          )}
        </div>

        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      </Modal>

      <Panel>
        {!filtersOpen && !loaded ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-textSecondary">Select filters to generate the stock report.</p>
            <SecondaryButton type="button" onClick={() => setFiltersOpen(true)}>Open filters</SecondaryButton>
          </div>
        ) : !filtersOpen && report ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <SecondaryButton type="button" onClick={() => setFiltersOpen(true)}>Edit filters</SecondaryButton>
            </div>
            <ReportLetterheadBlock
              businessInfo={businessInfo}
              title={`Stock Report — ${report.product.name}`}
              subtitle={
                report.stockMode === 'QUANTITY'
                  ? `Quantity stock${report.product.unit ? ` (${report.product.unit})` : ''}`
                  : `${report.bagType === 'BORI' ? 'Bori' : 'Thela'} · from ${formatDate(report.trackingStartedAt)}`
              }
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-textSecondary">
                {report.stockMode === 'QUANTITY' ? (
                  <>
                    Quantity stock
                    {report.product.unit ? ` (${report.product.unit})` : ''}. Net balance can be
                    negative.
                  </>
                ) : (
                  <>
                    Tracking from {formatDate(report.trackingStartedAt)} onward.
                    {!report.historicalBackfill
                      ? ' Invoices saved before stock tracking started are not included.'
                      : null}
                    {' '}Carried loose remainder: {report.carriedRemainderKg} kg
                    ({report.bagType === 'BORI' ? 'Bori' : 'Thela'}).
                  </>
                )}
              </p>
              <ReportPager
                offset={offset}
                limit={report.limit}
                total={report.total}
                loading={loading}
                onChange={(next) => void loadReport(next)}
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-textSecondary">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Description</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3 text-right">
                      {report.stockMode === 'QUANTITY' ? 'Qty' : 'Bags'}
                    </th>
                    <th className="py-2 text-right">Running Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-textSecondary">
                        No stock movements for this product yet.
                      </td>
                    </tr>
                  ) : (
                    report.rows.map((row) => (
                      <tr key={row.id} className="border-b border-border">
                        <td className="py-2 pr-3 whitespace-nowrap">{formatDate(row.date)}</td>
                        <td className="py-2 pr-3">{row.description}</td>
                        <td className={`py-2 pr-3 font-medium ${row.status === 'IN' ? 'text-success' : 'text-danger'}`}>
                          {row.status}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {row.quantity ?? row.bags}
                        </td>
                        <td className="py-2 text-right font-medium tabular-nums">{row.runningBalance}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="py-2 pr-3" colSpan={3}>
                      Full period — Total In {report.totals.totalIn} · Total Out {report.totals.totalOut}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums" />
                    <td className="py-2 text-right tabular-nums">
                      Net {report.totals.netBalance}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <ReportPager
              offset={offset}
              limit={report.limit}
              total={report.total}
              loading={loading}
              onChange={(next) => void loadReport(next)}
            />
          </div>
        ) : null}
      </Panel>
    </PageShell>
  );
}




function sumAccountBalances(
  accounts: { balance: number }[],
): number {
  return accounts.reduce((sum, row) => sum + Number(row.balance), 0);
}

function BalanceTable({
  rows,
  groups,
  reportTotalDebit,
  reportTotalCredit,
  isLastPage = true,
}: {
  rows?: AccountBalanceResult['accounts'];
  groups?: AccountBalanceResult['groups'];
  /** Full-report debit/credit totals (period-wide). Shown only on the last page. */
  reportTotalDebit?: number;
  reportTotalCredit?: number;
  /** When false (middle pages of a multi-page report), omit the final Total Debit/Credit rows. */
  isLastPage?: boolean;
}) {
  const flatRows = rows ?? [];
  const groupList = groups ?? [];
  const showReportTotals =
    isLastPage && reportTotalDebit != null && reportTotalCredit != null;

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-border text-textSecondary">
          <th className="py-2 pr-3">Account Name</th>
          <th className="py-2 text-right">Balance</th>
        </tr>
      </thead>
      <tbody>
        {groups
          ? groupList.map((group) => {
              const groupTotal = sumAccountBalances(group.accounts);
              return (
                <Fragment key={group.categoryId}>
                  <tr className="border-b border-border bg-surface1">
                    <td
                      colSpan={2}
                      className="py-2 pr-3 text-sm font-bold uppercase tracking-wide text-textPrimary"
                    >
                      {group.categoryName}
                    </td>
                  </tr>
                  {group.accounts.map((row) => (
                    <tr key={row.accountId} className="border-b border-border">
                      <td className="py-2 pr-3">{row.accountName}</td>
                      <td className={`py-2 text-right font-medium tabular-nums ${ledgerBalanceColorClass(row.balance)}`}>
                        {formatLedgerBalance(row.balance)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border bg-surface1">
                    <td className="py-2 pr-3 text-textSecondary">
                      {group.categoryName} Total
                    </td>
                    <td className={`py-2 text-right font-bold tabular-nums ${ledgerBalanceColorClass(groupTotal)}`}>
                      {formatLedgerBalance(groupTotal)}
                    </td>
                  </tr>
                </Fragment>
              );
            })
          : flatRows.map((row) => (
              <tr key={row.accountId} className="border-b border-border">
                <td className="py-2 pr-3">{row.accountName}</td>
                <td className={`py-2 text-right font-medium tabular-nums ${ledgerBalanceColorClass(row.balance)}`}>
                  {formatLedgerBalance(row.balance)}
                </td>
              </tr>
            ))}

        {showReportTotals ? (
          <>
            <tr className="border-t-2 border-borderStrong bg-surface1">
              <td className="py-2.5 pr-3 font-bold text-textPrimary">Total Debit</td>
              <td className={`py-2.5 text-right font-bold tabular-nums ${ledgerDebitColorClass(reportTotalDebit)}`}>
                {reportTotalDebit.toFixed(2)}
              </td>
            </tr>
            <tr className="border-t border-border bg-surface1">
              <td className="py-2.5 pr-3 font-bold text-textPrimary">Total Credit</td>
              <td className={`py-2.5 text-right font-bold tabular-nums ${ledgerCreditColorClass(reportTotalCredit)}`}>
                {reportTotalCredit.toFixed(2)}
              </td>
            </tr>
          </>
        ) : null}
      </tbody>
    </table>
  );
}

export function AccountBalancePage() {
  const {
    financialYearId,
    financialYearIdNum,
    selectedYear,
  } = useReportFinancialYear();
  const [categories, setCategories] = useState<AccountCategory[]>([]);
  const [datedOn, setDatedOn] = useState(todayInputValue);
  const [categoryId, setCategoryId] = useState('');
  const [side, setSide] = useState<BalanceSideFilter>('both');
  const [report, setReport] = useState<AccountBalanceResult | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const businessInfo = useReportBusinessInfo();

  useEffect(() => {
    api.listCategories()
      .then((rows) => setCategories(rows.filter((c) => c.isActive)))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!selectedYear) return;
    if (selectedYear.status === 'CLOSED' && selectedYear.endDate) {
      setDatedOn(selectedYear.endDate.slice(0, 10));
    } else if (selectedYear.status === 'ACTIVE') {
      setDatedOn(todayInputValue());
    }
    setLoaded(false);
    setReport(null);
    setOffset(0);
  }, [selectedYear?.id, selectedYear?.status, selectedYear?.endDate]);

  async function loadReport(nextOffset = 0) {
    if (!datedOn) {
      setError('Select a date');
      return;
    }
    if (financialYearIdNum == null) {
      setError('Select a financial year');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await api.getAccountBalanceReport({
        date: datedOn,
        categoryId: categoryId ? Number(categoryId) : undefined,
        side,
        financialYearId: financialYearIdNum,
        limit: REPORT_PAGE_SIZE,
        offset: nextOffset,
      });
      setReport(result);
      setOffset(result.offset);
      setLoaded(true);
      setFiltersOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  async function exportReport(format: 'pdf' | 'excel' | 'print') {
    if (!report || financialYearIdNum == null) return;
    const headers = ['Account Name', 'Balance'];
    let exportSource = report;
    if (report.pageCount != null && report.pageCount > 1) {
      try {
        exportSource = await api.getAccountBalanceReport({
          date: datedOn,
          categoryId: categoryId ? Number(categoryId) : undefined,
          side,
          financialYearId: financialYearIdNum,
        });
      } catch {
        // Fall back to current page.
      }
    }
    const rows: (string | number)[][] = [];
    const showGroupedExport = !categoryId && exportSource.groups.length > 0;

    if (showGroupedExport) {
      for (const group of exportSource.groups) {
        rows.push([group.categoryName.toUpperCase(), '']);
        for (const row of group.accounts) {
          rows.push([row.accountName, formatLedgerBalance(row.balance)]);
        }
        const groupTotal = sumAccountBalances(group.accounts);
        rows.push([`${group.categoryName} Total`, formatLedgerBalance(groupTotal)]);
      }
      rows.push(['Total Debit', exportSource.totalDebit.toFixed(2)]);
      rows.push(['Total Credit', exportSource.totalCredit.toFixed(2)]);
    } else {
      for (const row of exportSource.accounts) {
        rows.push([row.accountName, formatLedgerBalance(row.balance)]);
      }
      if (exportSource.accounts.length > 0) {
        rows.push(['Total Debit', exportSource.totalDebit.toFixed(2)]);
        rows.push(['Total Credit', exportSource.totalCredit.toFixed(2)]);
      }
    }

    const title = `Account Balance as of ${formatDate(datedOn)}`;
    const safeDate = datedOn.replace(/[^\d-]/g, '');
    const base = `account-balance-${safeDate}`;
    if (format === 'excel') {
      downloadExcel(`${base}.xlsx`, 'Account Balance', headers, rows, businessInfo);
    } else if (format === 'print') {
      printReportPdf(title, headers, rows, businessInfo);
    } else {
      downloadPdf(`${base}.pdf`, title, headers, rows, businessInfo);
    }
  }

  const showGrouped = !categoryId && (report?.groups.length ?? 0) > 0;
  const isLastPage =
    !report
    || report.pageCount == null
    || report.pageCount <= 1
    || Math.floor(report.offset / Math.max(report.limit, 1)) >= report.pageCount - 1;

  return (
    <PageShell
      title="Account Balance"
      subtitle={
        selectedYear
          ? `Balances as of a selected date · FY ${selectedYear.label}${selectedYear.status === 'ACTIVE' ? ' (Active)' : ''}`
          : 'Balances as of a selected date'
      }
    >
      <Modal
        open={filtersOpen}
        title="Account Balance"
        onClose={() => setFiltersOpen(false)}
        footer={
          <>
            <FinancialButton type="button" onClick={() => void loadReport(0)} disabled={loading || !financialYearId}>
              {loading ? 'Loading…' : 'Generate Report'}
            </FinancialButton>
          </>
        }
      >
        <div className="report-filter-stack">
          <div>
            <FieldLabel>Dated On</FieldLabel>
            <DateField value={datedOn} onChange={setDatedOn} />
          </div>
          <div>
            <FieldLabel>Account Type</FieldLabel>
            <select
              className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-textPrimary"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">All Groups</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Amount Type</FieldLabel>
            <SegmentedControl
              ariaLabel="Amount type"
              value={side}
              onChange={setSide}
              options={[
                { value: 'both', label: 'Both' },
                { value: 'debit', label: 'Debit' },
                { value: 'credit', label: 'Credit' },
              ]}
            />
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      </Modal>

      <Panel className="overflow-visible">
        {!filtersOpen && !loaded ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-textSecondary">Select filters to generate the account balance report.</p>
            <SecondaryButton type="button" onClick={() => setFiltersOpen(true)}>Open filters</SecondaryButton>
          </div>
        ) : !filtersOpen && report && report.accounts.length === 0 ? (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              <SecondaryButton type="button" onClick={() => setFiltersOpen(true)}>Edit filters</SecondaryButton>
            </div>
            <ReportLetterheadBlock
              businessInfo={businessInfo}
              title={`Account Balance as of ${formatDate(datedOn)}`}
            />
            <p className="text-sm text-textSecondary">No accounts match these filters</p>
          </>
        ) : !filtersOpen && report ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <SecondaryButton type="button" onClick={() => setFiltersOpen(true)}>Edit filters</SecondaryButton>
                <SecondaryButton type="button" onClick={() => void exportReport('pdf')}>Download PDF</SecondaryButton>
                <SecondaryButton type="button" onClick={() => void exportReport('excel')}>Download Excel</SecondaryButton>
                <SecondaryButton type="button" onClick={() => void exportReport('print')}>Print</SecondaryButton>
              </div>
              <ReportPager
                offset={offset}
                limit={report.limit}
                total={report.total}
                pageCount={report.pageCount}
                loading={loading}
                onChange={(next) => void loadReport(next)}
              />
            </div>
            <ReportLetterheadBlock
              businessInfo={businessInfo}
              title={`Account Balance as of ${formatDate(datedOn)}`}
            />
            <div className="overflow-x-auto">
              {showGrouped ? (
                <BalanceTable
                  groups={report.groups}
                  reportTotalDebit={report.totalDebit}
                  reportTotalCredit={report.totalCredit}
                  isLastPage={isLastPage}
                />
              ) : (
                <BalanceTable
                  rows={report.accounts}
                  reportTotalDebit={report.totalDebit}
                  reportTotalCredit={report.totalCredit}
                  isLastPage={isLastPage}
                />
              )}
            </div>
            <div className="mt-3">
              <ReportPager
                offset={offset}
                limit={report.limit}
                total={report.total}
                pageCount={report.pageCount}
                loading={loading}
                onChange={(next) => void loadReport(next)}
              />
            </div>
          </>
        ) : null}
      </Panel>
    </PageShell>
  );
}

export function VouchersReportPage() {
  const {
    years,
    financialYearId,
    setFinancialYearId,
    financialYearIdNum,
    selectedYear,
    loading: yearsLoading,
  } = useReportFinancialYear();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [voucherType, setVoucherType] = useState<VoucherTypeFilter>('all');
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [totals, setTotals] = useState<{
    totalAmount: number;
    byType: {
      PAYMENT: number;
      RECEIPT: number;
      JOURNAL: number;
      KACHI: number;
      PURCHASE_MAAL: number;
    };
  }>({
    totalAmount: 0,
    byType: { PAYMENT: 0, RECEIPT: 0, JOURNAL: 0, KACHI: 0, PURCHASE_MAAL: 0 },
  });
  const [offset, setOffset] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Voucher | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [updating, setUpdating] = useState(false);
  const businessInfo = useReportBusinessInfo();
  const dateDefaultsAppliedRef = useRef(false);

  useEffect(() => {
    if (!selectedYear?.startDate || dateDefaultsAppliedRef.current) return;
    setFromDate(selectedYear.startDate.slice(0, 10));
    setToDate(todayInputValue());
    dateDefaultsAppliedRef.current = true;
  }, [selectedYear?.id, selectedYear?.startDate]);

  useEffect(() => {
    setLoaded(false);
    setVouchers([]);
    setSelected(null);
    setOffset(0);
    setTotals({
      totalAmount: 0,
      byType: { PAYMENT: 0, RECEIPT: 0, JOURNAL: 0, KACHI: 0, PURCHASE_MAAL: 0 },
    });
  }, [financialYearId]);

  async function loadReport(nextOffset = 0) {
    if (!fromDate || !toDate) {
      setError('Select from and to dates');
      return;
    }
    if (financialYearIdNum == null) {
      setError('Select a financial year');
      return;
    }
    setError('');
    setLoading(true);
    setSelected(null);
    try {
      const page = await api.listVouchers({
        fromDate,
        toDate,
        type: voucherType === 'all' ? undefined : voucherType,
        financialYearId: financialYearIdNum,
        limit: REPORT_PAGE_SIZE,
        offset: nextOffset,
      });
      setVouchers(page.items);
      setListTotal(page.total);
      setTotals(page.totals);
      setOffset(page.offset);
      setLoaded(true);
      setFiltersOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vouchers');
      setVouchers([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!selected) return;
    if (!window.confirm(`Cancel voucher #${selected.number}? Reversal entries will be posted.`)) return;
    setCancelling(true);
    try {
      const updated = await api.cancelVoucher(selected.id);
      setSelected(updated);
      await loadReport(offset);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      setCancelling(false);
    }
  }

  async function handleUpdateDetails(patch: {
    amount: number;
    date: string;
    debitAccountId: number;
    creditAccountId: number;
  }) {
    if (!selected) return;
    setUpdating(true);
    try {
      const updated = await api.updateVoucherDetails(selected.id, patch);
      setSelected(updated);
      await loadReport(offset);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setUpdating(false);
    }
  }

  async function exportReport(format: 'pdf' | 'excel' | 'print') {
    if (!loaded || financialYearIdNum == null) return;
    const headers = ['Voucher #', 'Date', 'Type', 'From/Debit', 'To/Credit', 'Amount', 'Ref#', 'Status'];
    let exportVouchers = vouchers;
    let exportTotals = totals;
    if (listTotal > vouchers.length) {
      try {
        const full = await api.listVouchers({
          fromDate,
          toDate,
          type: voucherType === 'all' ? undefined : voucherType,
          financialYearId: financialYearIdNum,
          limit: 500,
          offset: 0,
        });
        exportVouchers = full.items;
        exportTotals = full.totals;
      } catch {
        // Fall back to current page.
      }
    }
    const rows = exportVouchers.map((v) => [
      formatVoucherNumber(v.number, v.type),
      formatDate(v.date),
      formatVoucherTypeLabel(v.type),
      voucherFromAccount(v),
      voucherToAccount(v),
      formatLedgerAmount(v.amount),
      v.reference ?? '',
      v.status === 'CANCELLED' ? 'Cancelled' : 'Active',
    ]);
    rows.push(['Total', '', '', '', '', formatLedgerAmount(exportTotals.totalAmount), '', '']);
    const title = `Vouchers ${fromDate} to ${toDate}`;
    const base = `vouchers-${fromDate}-to-${toDate}`;
    if (format === 'excel') {
      downloadExcel(`${base}.xlsx`, 'Vouchers', headers, rows, businessInfo);
    } else if (format === 'print') {
      printReportPdf(title, headers, rows, businessInfo);
    } else {
      downloadPdf(`${base}.pdf`, title, headers, rows, businessInfo);
    }
  }

  return (
    <PageShell
      title="Vouchers Report"
      subtitle={
        selectedYear
          ? `Filter and review posted vouchers · FY ${selectedYear.label}${selectedYear.status === 'ACTIVE' ? ' (Active)' : ''}`
          : 'Filter and review posted vouchers'
      }
    >
      <Modal
        open={filtersOpen}
        title="Vouchers Report"
        onClose={() => setFiltersOpen(false)}
        footer={
          <>
            <FinancialButton type="button" onClick={() => void loadReport(0)} disabled={loading || !financialYearId}>
              {loading ? 'Loading…' : 'Generate Report'}
            </FinancialButton>
          </>
        }
      >
        <div className="report-filter-stack">
          <ReportFinancialYearSelect
            value={financialYearId}
            years={years}
            onChange={setFinancialYearId}
            disabled={yearsLoading}
          />
          <div>
            <FieldLabel>From Date</FieldLabel>
            <DateField value={fromDate} onChange={setFromDate} />
          </div>
          <div>
            <FieldLabel>To Date</FieldLabel>
            <DateField value={toDate} onChange={setToDate} />
          </div>
          <div>
            <FieldLabel>Voucher Type</FieldLabel>
            <SegmentedControl
              ariaLabel="Voucher type"
              value={voucherType}
              onChange={setVoucherType}
              options={[
                { value: 'all', label: 'All' },
                { value: 'PAYMENT', label: 'Payment' },
                { value: 'RECEIPT', label: 'Receipt' },
                { value: 'JOURNAL', label: 'Journal' },
                { value: 'KACHI', label: 'Kachi' },
                { value: 'PURCHASE_MAAL', label: 'Purchase Maal' },
              ]}
            />
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      </Modal>

      <Panel>
        {!filtersOpen && loaded ? (
          <div className="mb-4">
            <ReportPager
              offset={offset}
              limit={REPORT_PAGE_SIZE}
              total={listTotal}
              loading={loading}
              onChange={(next) => void loadReport(next)}
            />
          </div>
        ) : null}

        {!filtersOpen && !loaded ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-textSecondary">Select filters to generate the vouchers report.</p>
            <SecondaryButton type="button" onClick={() => setFiltersOpen(true)}>Open filters</SecondaryButton>
          </div>
        ) : !filtersOpen && vouchers.length === 0 ? (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              <SecondaryButton type="button" onClick={() => setFiltersOpen(true)}>Edit filters</SecondaryButton>
            </div>
            <ReportLetterheadBlock
              businessInfo={businessInfo}
              title={`Vouchers ${fromDate} to ${toDate}`}
            />
            <p className="text-sm text-textSecondary">No vouchers in this period</p>
          </>
        ) : !filtersOpen ? (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              <SecondaryButton type="button" onClick={() => setFiltersOpen(true)}>Edit filters</SecondaryButton>
              <SecondaryButton type="button" onClick={() => void exportReport('pdf')}>Download PDF</SecondaryButton>
              <SecondaryButton type="button" onClick={() => void exportReport('excel')}>Download Excel</SecondaryButton>
              <SecondaryButton type="button" onClick={() => void exportReport('print')}>Print</SecondaryButton>
            </div>
            <ReportLetterheadBlock
              businessInfo={businessInfo}
              title={`Vouchers ${fromDate} to ${toDate}`}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-textSecondary">
                    <th className="py-2 pr-2 text-right">Voucher #</th>
                    <th className="py-2 pr-2">Date</th>
                    <th className="py-2 pr-2">Type</th>
                    <th className="py-2 pr-2">From/Debit Account</th>
                    <th className="py-2 pr-2">To/Credit Account</th>
                    <th className="py-2 pr-2 text-right">Amount</th>
                    <th className="py-2 pr-2">Ref#</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map((v) => (
                    <tr
                      key={v.id}
                      onClick={() => setSelected(v)}
                      className={`cursor-pointer border-b border-border transition hover:bg-surface1 ${
                        selected?.id === v.id ? 'bg-surface1' : ''
                      }`}
                    >
                      <td className="py-2 pr-2 text-right font-mono text-xs font-semibold text-financial">
                        {formatVoucherNumber(v.number, v.type)}
                      </td>
                      <td className="py-2 pr-2 whitespace-nowrap">{formatDate(v.date)}</td>
                      <td className={`py-2 pr-2 font-medium ${voucherTypeColorClass(v.type)}`}>
                        {formatVoucherTypeLabel(v.type)}
                      </td>
                      <td className="py-2 pr-2 text-textSecondary">{voucherFromAccount(v)}</td>
                      <td className="py-2 pr-2 text-textSecondary">{voucherToAccount(v)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{formatLedgerAmount(v.amount)}</td>
                      <td className="py-2 pr-2 text-textSecondary">{v.reference ?? ''}</td>
                      <td className="py-2">
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                            v.status === 'CANCELLED'
                              ? 'bg-bgDanger text-danger'
                              : 'bg-bgSuccess text-success'
                          }`}
                        >
                          {v.status === 'CANCELLED' ? 'Cancelled' : 'Active'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="py-2" colSpan={5}>Full period total</td>
                    <td className="py-2 text-right tabular-nums">{formatLedgerAmount(totals.totalAmount)}</td>
                    <td className="py-2" colSpan={2} />
                  </tr>
                  {voucherType === 'all' ? (
                    <tr className="border-t border-border text-sm text-textSecondary">
                      <td className="py-2" colSpan={8}>
                        Full period — Payments: {formatLedgerAmount(totals.byType.PAYMENT)} · Receipts:{' '}
                        {formatLedgerAmount(totals.byType.RECEIPT)} · Journal:{' '}
                        {formatLedgerAmount(totals.byType.JOURNAL)} · Kachi:{' '}
                        {formatLedgerAmount(totals.byType.KACHI)}
                      </td>
                    </tr>
                  ) : null}
                </tfoot>
              </table>
            </div>
            <div className="mt-3">
              <ReportPager
                offset={offset}
                limit={REPORT_PAGE_SIZE}
                total={listTotal}
                loading={loading}
                onChange={(next) => void loadReport(next)}
              />
            </div>
          </>
        ) : null}
      </Panel>

      {selected ? (
        <VoucherDetailCard
          voucher={selected}
          onCancel={handleCancel}
          onUpdateDetails={handleUpdateDetails}
          cancelling={cancelling}
          updating={updating}
        />
      ) : null}
    </PageShell>
  );
}
