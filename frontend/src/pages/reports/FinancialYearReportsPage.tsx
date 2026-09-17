import { useEffect, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { formatDate } from '../../lib/format';
import { api, type FinancialYear } from '../../lib/api';
import { PageShell, Panel } from '../../components/ui/PageShell';
import { LockedClosedYearProvider, useReportFinancialYear } from '../../contexts/ReportFinancialYearContext';

function yearPeriodLabel(year: FinancialYear) {
  const start = year.startDate ? formatDate(year.startDate.slice(0, 10)) : '—';
  const end = year.endDate ? formatDate(year.endDate.slice(0, 10)) : '—';
  return `${start} → ${end}`;
}

/** Lists CLOSED financial years only — read-only entry to historical reports. */
export function FinancialYearListPage() {
  const [years, setYears] = useState<FinancialYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listFinancialYears()
      .then((rows) => {
        if (cancelled) return;
        setYears(rows.filter((y) => y.status === 'CLOSED'));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load financial years');
        setYears([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageShell
      title="Financial Year"
      subtitle="View reports for closed years (read-only). The active year is under normal Reports."
    >
      <Panel>
        {loading ? (
          <p className="text-sm text-textMuted">Loading closed years…</p>
        ) : error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : years.length === 0 ? (
          <p className="text-sm text-textMuted">No closed financial years yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {years.map((year) => (
              <li key={year.id}>
                <Link
                  to={`/reports/financial-year/${year.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-1 py-3 transition-colors hover:bg-surface2"
                >
                  <div>
                    <p className="text-sm font-semibold text-textPrimary">{year.label}</p>
                    <p className="mt-0.5 text-xs text-textMuted">{yearPeriodLabel(year)}</p>
                  </div>
                  <div className="text-right text-xs text-textMuted">
                    {year.closedAt ? (
                      <span>Closed {formatDate(year.closedAt.slice(0, 10))}</span>
                    ) : (
                      <span>Closed</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PageShell>
  );
}

const HUB_LINKS: Array<{ label: string; path: string; description: string }> = [
  { label: 'Account Ledger', path: 'accounts', description: 'Ledger for any account in this year' },
  { label: 'Account Balance', path: 'account-balance', description: 'Balances as of year end' },
  { label: 'Vouchers Report', path: 'vouchers', description: 'Posted vouchers (view only)' },
  { label: 'Daily Report', path: 'daily', description: 'Day activity within this year' },
  { label: 'Trial Balance', path: 'trial-balance', description: 'Detail trial balance for this year' },
  { label: 'Sale/Purchase Reports', path: 'sale-purchase', description: 'Invoices in this year' },
  { label: 'Stock Report', path: 'stock', description: 'Stock movements in this year' },
];

export function ClosedYearReportsLayout() {
  const { financialYearId = '' } = useParams();
  return (
    <LockedClosedYearProvider financialYearId={financialYearId}>
      <Outlet />
    </LockedClosedYearProvider>
  );
}

/** Hub of report links for one locked closed financial year. */
export function FinancialYearHubPage() {
  const { selectedYear } = useReportFinancialYear();
  const { financialYearId = '' } = useParams();

  if (!selectedYear) return null;

  return (
    <PageShell
      title={selectedYear.label}
      subtitle={`Closed year reports · ${yearPeriodLabel(selectedYear)} · read-only`}
    >
      <div className="mb-4">
        <Link
          to="/reports/financial-year"
          className="text-sm text-financial hover:underline"
        >
          ← All closed years
        </Link>
      </div>
      <Panel>
        <p className="mb-4 text-sm text-textMuted">
          Choose a report. Filters are locked to this financial year — no create, edit, approve,
          or delete actions are available here.
        </p>
        <ul className="divide-y divide-border">
          {HUB_LINKS.map((link) => (
            <li key={link.path}>
              <Link
                to={`/reports/financial-year/${financialYearId}/${link.path}`}
                className="flex flex-col gap-0.5 px-1 py-3 transition-colors hover:bg-surface2"
              >
                <span className="text-sm font-semibold text-textPrimary">{link.label}</span>
                <span className="text-xs text-textMuted">{link.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </PageShell>
  );
}

/** Small banner shown on report pages inside the closed-year hub. */
export function ClosedYearReportBanner() {
  const { locked, selectedYear, readOnly } = useReportFinancialYear();
  if (!locked || !selectedYear) return null;
  return (
    <div className="mb-4 rounded-lg border border-border bg-surface2 px-4 py-3 text-sm print:hidden">
      <p className="font-medium text-textPrimary">
        Viewing closed year: {selectedYear.label}
      </p>
      <p className="mt-0.5 text-xs text-textMuted">
        {yearPeriodLabel(selectedYear)}
        {readOnly ? ' · Read-only — changes are not allowed' : ''}
      </p>
      <Link
        to={`/reports/financial-year/${selectedYear.id}`}
        className="mt-2 inline-block text-xs text-financial hover:underline"
      >
        ← Back to year reports
      </Link>
    </div>
  );
}
