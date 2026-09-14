import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { DateField } from '../../components/ui/DateField';
import { Modal } from '../../components/ui/Modal';
import {
  FieldLabel,
  FinancialButton,
  LegacyTable,
  PageShell,
  Panel,
  SecondaryButton,
} from '../../components/ui/PageShell';
import { api } from '../../lib/api';
import { formatLedgerAmount } from '../../lib/format';
import { REPORT_PAGE_SIZE, ReportPager } from './ReportPages';

type DailyFilterKey =
  | 'all'
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

type DailyReportResult = Awaited<ReturnType<typeof api.getDailyReport>>;
type DailyRow = DailyReportResult['rows'][number];

const KIND_FILTERS: Array<{ value: DailyFilterKey; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'PAYMENT', label: 'Payment' },
  { value: 'RECEIPT', label: 'Receipt' },
  { value: 'JOURNAL', label: 'Journal' },
  { value: 'KACHI_MAAL', label: 'Kachi Maal' },
  { value: 'PURCHASE_MAAL', label: 'Purchase Maal' },
  { value: 'SALE_PAUNCH', label: 'Sale Paunch' },
  { value: 'SALE_COMMISSION', label: 'Sale Commission' },
  { value: 'PURCHASE_GENERAL', label: 'Purchase Invoice' },
  { value: 'SALE_GENERAL', label: 'Sale Invoice' },
  { value: 'GENERAL_TRADE', label: 'General Trade' },
];

function todayInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function accountCellLabel(account: { name: string; code: string } | null | undefined) {
  if (!account) return '—';
  return account.name;
}

function viewHref(row: DailyRow): string | null {
  if (row.kind === 'voucher' && row.voucherType && row.voucherNumber != null) {
    const params = new URLSearchParams({
      type: row.voucherType,
      number: String(row.voucherNumber),
    });
    return `/vouchers/view?${params.toString()}`;
  }
  if (row.kind === 'invoice' && row.invoiceType && row.invoiceNumber != null) {
    const params = new URLSearchParams({
      type: row.invoiceType,
      number: String(row.invoiceNumber),
    });
    return `/invoices/view-invoice?${params.toString()}`;
  }
  return null;
}

export function DailyReportPage() {
  const [date, setDate] = useState(todayInputValue);
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [kindCounts, setKindCounts] = useState<Partial<Record<string, number>>>({});
  const [filteredTotals, setFilteredTotals] = useState({ count: 0, amount: 0 });
  const [listTotal, setListTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [error, setError] = useState('');
  const [kindFilter, setKindFilter] = useState<DailyFilterKey>('all');

  async function loadReport(day: string, nextFilter: DailyFilterKey = kindFilter, nextOffset = 0) {
    if (!day) {
      setError('Select a date');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await api.getDailyReport({
        date: day,
        filterKey: nextFilter,
        limit: REPORT_PAGE_SIZE,
        offset: nextOffset,
      });
      setRows(result.rows);
      setKindCounts(result.kindCounts);
      setFilteredTotals(result.filteredTotals);
      setListTotal(result.total);
      setOffset(result.offset);
      setKindFilter(nextFilter);
      setLoaded(true);
      setFiltersOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load daily report');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void loadReport(date, 'all', 0);
  }

  function onKindChange(next: DailyFilterKey) {
    void loadReport(date, next, 0);
  }

  const allCount = KIND_FILTERS
    .filter((f) => f.value !== 'all')
    .reduce((sum, f) => sum + (kindCounts[f.value] ?? 0), 0);

  return (
    <PageShell
      title="Daily Report"
      subtitle="Posted vouchers and invoices for a single day"
    >
      <Modal
        open={filtersOpen}
        title="Daily Report"
        onClose={() => setFiltersOpen(false)}
        footer={
          <>
            <FinancialButton type="submit" form="daily-report-filters" disabled={loading}>
              {loading ? 'Loading…' : 'Generate Report'}
            </FinancialButton>
          </>
        }
      >
        <form id="daily-report-filters" onSubmit={onSubmit} className="report-filter-stack">
          <div>
            <FieldLabel>Date</FieldLabel>
            <DateField
              value={date}
              onChange={setDate}
              required
            />
          </div>
        </form>
        {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      </Modal>

      {!filtersOpen && loaded ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SecondaryButton type="button" onClick={() => setFiltersOpen(true)}>
            Edit filters
          </SecondaryButton>
          {KIND_FILTERS.map((filter) => (
            <SecondaryButton
              key={filter.value}
              type="button"
              className={kindFilter === filter.value ? 'ring-2 ring-accent' : ''}
              onClick={() => onKindChange(filter.value)}
              disabled={loading}
            >
              {filter.label}
              {filter.value === 'all'
                ? ` (${allCount})`
                : ` (${kindCounts[filter.value] ?? 0})`}
            </SecondaryButton>
          ))}
          <SecondaryButton
            type="button"
            className="ml-auto"
            onClick={() => void loadReport(date, kindFilter, offset)}
            disabled={loading}
          >
            Refresh
          </SecondaryButton>
        </div>
      ) : null}

      {!filtersOpen && loaded && !error ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-textSecondary">
            {filteredTotals.count} record{filteredTotals.count === 1 ? '' : 's'} · Full period total{' '}
            {formatLedgerAmount(filteredTotals.amount)}
          </p>
          <ReportPager
            offset={offset}
            limit={REPORT_PAGE_SIZE}
            total={listTotal}
            loading={loading}
            onChange={(next) => void loadReport(date, kindFilter, next)}
          />
        </div>
      ) : null}

      <Panel className="p-0">
        {!filtersOpen && !loaded ? (
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-textSecondary">Select a date to generate the daily report.</p>
            <SecondaryButton type="button" onClick={() => setFiltersOpen(true)}>Open filters</SecondaryButton>
          </div>
        ) : !filtersOpen && rows.length === 0 ? (
          <p className="p-4 text-sm text-textMuted">No posted work for this date.</p>
        ) : !filtersOpen ? (
          <>
            <LegacyTable className="border-0">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Debit Account</th>
                  <th>Credit Account</th>
                  <th className="text-right">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const href = viewHref(row);
                  return (
                    <tr key={`${row.kind}-${row.id}`}>
                      <td>{row.kind === 'voucher' ? 'Voucher' : 'Invoice'}</td>
                      <td>{row.typeLabel}</td>
                      <td>{row.reference}</td>
                      <td>{accountCellLabel(row.debitAccount)}</td>
                      <td>{accountCellLabel(row.creditAccount)}</td>
                      <td className="text-right tabular-nums">{formatLedgerAmount(row.amount)}</td>
                      <td className="text-right">
                        {href ? (
                          <Link to={href} className="text-sm font-medium text-financial hover:underline">
                            View
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </LegacyTable>
            <div className="border-t border-border p-3">
              <ReportPager
                offset={offset}
                limit={REPORT_PAGE_SIZE}
                total={listTotal}
                loading={loading}
                onChange={(next) => void loadReport(date, kindFilter, next)}
              />
            </div>
          </>
        ) : null}
      </Panel>
    </PageShell>
  );
}
