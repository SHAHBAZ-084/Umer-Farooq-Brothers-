import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { defaultCardDescription, QuickLinkCard } from '../components/ui/QuickLinkCard';
import { INVOICE_QUICK_LINKS, REPORT_QUICK_LINKS, VOUCHER_QUICK_LINKS } from '../config/navigation';
import { APPROVALS_CHANGED_EVENT } from '../lib/approvals';
import { PageShell, Tile } from '../components/ui/PageShell';
import { api, type Reminder } from '../lib/api';
import { formatLedgerAmount } from '../lib/format';
import {
  expectedNotifyCount,
  formatReminderWhen,
  REMINDERS_CHANGED_EVENT,
  reminderSeverityForCount,
  type ReminderSeverity,
} from '../lib/reminders';

const DASHBOARD_INVOICE_LINKS = INVOICE_QUICK_LINKS.filter(
  (link) => link.to !== '/invoices/view-invoice',
);

type DashboardSummary = Awaited<ReturnType<typeof api.getDashboardSummary>>;
type MetricTone = 'cash' | 'stock' | 'vouchers';

function reminderBannerClass(severity: ReminderSeverity) {
  if (severity === 'green') return 'reminder-dash-banner reminder-dash-banner--green';
  if (severity === 'yellow') return 'reminder-dash-banner reminder-dash-banner--yellow';
  return 'reminder-dash-banner reminder-dash-banner--red';
}

function StatBox({ label, value, tone }: { label: string; value: string; tone: MetricTone }) {
  return (
    <Tile className={`dashboard-metric dashboard-metric--${tone} min-h-[4.5rem]`}>
      <p className="dashboard-metric-label">{label}</p>
      <p className="dashboard-metric-value">{value}</p>
    </Tile>
  );
}

function QuickLinkSection({
  title,
  links,
  tone,
}: {
  title: string;
  links: Array<{ label: string; to: string; description?: string }>;
  tone: 'vouchers' | 'invoices' | 'reports';
}) {
  return (
    <div className="mb-6">
      <h2 className={`legacy-section-title dashboard-section-title dashboard-section-title--${tone}`}>
        {title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {links.map((link) => (
          <QuickLinkCard
            key={link.to}
            to={link.to}
            title={link.label}
            description={link.description ?? defaultCardDescription(link.to)}
          />
        ))}
      </div>
    </div>
  );
}

export function PosHomePage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loadError, setLoadError] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [dueReminders, setDueReminders] = useState<Reminder[]>([]);

  useEffect(() => {
    api
      .getDashboardSummary()
      .then(setSummary)
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load dashboard'));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const rows = await api.listPendingApprovals();
        if (!cancelled) setPendingCount(rows.length);
      } catch {
        if (!cancelled) setPendingCount(0);
      }
    }
    void refresh();
    window.addEventListener(APPROVALS_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(APPROVALS_CHANGED_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadReminders() {
      try {
        const rows = await api.listReminders('PENDING');
        if (cancelled) return;
        const now = Date.now();
        setDueReminders(
          rows.filter((r) => {
            const due = new Date(r.reminderAt).getTime();
            return Number.isFinite(due) && due <= now;
          }),
        );
      } catch {
        if (!cancelled) setDueReminders([]);
      }
    }
    void loadReminders();
    window.addEventListener(REMINDERS_CHANGED_EVENT, loadReminders);
    const timer = window.setInterval(loadReminders, 60_000);
    return () => {
      cancelled = true;
      window.removeEventListener(REMINDERS_CHANGED_EVENT, loadReminders);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <PageShell subtitle="Today at a glance">
      {loadError ? <p className="text-sm text-danger">{loadError}</p> : null}

      {pendingCount > 0 ? (
        <Link to="/approvals" className="dashboard-approvals-banner is-pending">
          <span className="font-medium">Approval</span>
          <span className="dashboard-approvals-badge">
            {pendingCount} waiting
          </span>
        </Link>
      ) : null}

      {dueReminders.length > 0 ? (
        <div className="mb-4 space-y-2">
          <h2 className="legacy-section-title">Due reminders</h2>
          {dueReminders.map((row) => {
            const count = Math.max(row.notifyCount, expectedNotifyCount(row.reminderAt), 1);
            const severity = reminderSeverityForCount(count);
            return (
              <div key={row.id} className={reminderBannerClass(severity)}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {row.account?.name ?? `Account #${row.accountId}`}
                    <span className="ml-2 text-xs font-bold uppercase tracking-wide opacity-80">
                      {severity} · {Math.min(9, count)}/9
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm tabular-nums">
                    Rs {formatLedgerAmount(row.amount)} · due {formatReminderWhen(row.reminderAt)}
                    {row.note ? ` · ${row.note}` : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatBox
          label="Cash Balance"
          value={summary ? formatLedgerAmount(summary.cashBalance) : '—'}
          tone="cash"
        />
        <Tile className="dashboard-metric dashboard-metric--stock min-h-[4.5rem] sm:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <p className="dashboard-metric-label">Stock bags</p>
            <Link to="/reports/stock" className="dashboard-metric-link">
              Stock Report
            </Link>
          </div>
          {!summary ? (
            <p className="mt-2 text-sm text-textMuted">Loading…</p>
          ) : summary.productStock.length === 0 ? (
            <p className="mt-2 text-sm text-textMuted">No bag stock yet.</p>
          ) : (
            <div className="mt-2 max-h-36 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-textSecondary">
                    <th className="pb-1 pr-2 font-medium">Product</th>
                    <th className="pb-1 pr-2 text-right font-medium">Bori</th>
                    <th className="pb-1 text-right font-medium">Thela</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.productStock.map((row) => (
                    <tr key={row.productId} className="border-t border-border">
                      <td className="py-1 pr-2 text-textPrimary">{row.name}</td>
                      <td className="dashboard-stock-num py-1 pr-2 text-right tabular-nums font-medium">
                        {row.bori}
                      </td>
                      <td className="dashboard-stock-num py-1 text-right tabular-nums font-medium">
                        {row.thela}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tile>
        <StatBox
          label="Vouchers Today"
          value={summary ? String(summary.vouchersToday) : '—'}
          tone="vouchers"
        />
      </div>

      <QuickLinkSection title="Vouchers" links={VOUCHER_QUICK_LINKS} tone="vouchers" />
      <QuickLinkSection title="Invoices" links={DASHBOARD_INVOICE_LINKS} tone="invoices" />
      <QuickLinkSection title="Reports" links={REPORT_QUICK_LINKS} tone="reports" />
    </PageShell>
  );
}
