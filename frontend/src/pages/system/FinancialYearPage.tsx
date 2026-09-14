import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  DangerButton,
  FieldLabel,
  PageShell,
  Panel,
  SecondaryButton,
  TextInput,
  Tile,
} from '../../components/ui/PageShell';
import { useAuth } from '../../contexts/AuthContext';
import { ApiRequestError, api, type FinancialYear } from '../../lib/api';
import { formatDate } from '../../lib/format';

function nextYearLabel(label: string): string {
  const start = parseInt(label.split('-')[0] ?? '', 10);
  if (!Number.isFinite(start)) return '—';
  return `${start + 1}-${start + 2}`;
}

export function FinancialYearPage() {
  const { user } = useAuth();
  const [years, setYears] = useState<FinancialYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState('');

  const isAdmin = user?.role === 'ADMIN';

  const activeFromList = useMemo(
    () => years.find((y) => y.status === 'ACTIVE') ?? null,
    [years],
  );

  async function loadYears() {
    setLoading(true);
    setError('');
    try {
      const rows = await api.listFinancialYears();
      setYears(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load financial years');
      setYears([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) void loadYears();
  }, [isAdmin]);

  if (!isAdmin) {
    return <Navigate to="/user" replace />;
  }

  function openCloseModal() {
    setPassword('');
    setCloseError('');
    setModalOpen(true);
  }

  function closeModal() {
    if (closing) return;
    setModalOpen(false);
    setPassword('');
    setCloseError('');
  }

  async function onConfirmClose(event: FormEvent) {
    event.preventDefault();
    if (!password.trim()) {
      setCloseError('Re-enter your account password to confirm.');
      return;
    }
    setClosing(true);
    setCloseError('');
    setMessage('');
    try {
      const result = await api.closeFinancialYear({ confirm: true, password });
      setModalOpen(false);
      setPassword('');
      setMessage(`Financial year closed. Active year is now ${result.newYear.label}.`);
      await loadYears();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'TRIAL_BALANCE_MISMATCH') {
        setCloseError(err.message);
      } else {
        setCloseError(err instanceof Error ? err.message : 'Close failed');
      }
    } finally {
      setClosing(false);
    }
  }

  const closingLabel = activeFromList?.label ?? '—';
  const openingLabel = closingLabel !== '—' ? nextYearLabel(closingLabel) : '—';

  return (
    <PageShell title="Financial Year" subtitle="View years and close the active period">
      <Panel className="space-y-6">
        <Tile>
          <p className="text-xs uppercase tracking-wide text-textSecondary">Current active year</p>
          <p className="mt-1 text-2xl font-semibold text-textPrimary">
            {activeFromList?.label ?? (loading ? '…' : 'None')}
          </p>
          {activeFromList ? (
            <p className="mt-1 text-sm text-textSecondary">
              Starts {formatDate(activeFromList.startDate)}
              {activeFromList.endDate ? ` · Ends ${formatDate(activeFromList.endDate)}` : ''}
            </p>
          ) : null}
        </Tile>

        {message ? <p className="text-sm text-success">{message}</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-textSecondary">
                <th className="py-2 pr-3">Label</th>
                <th className="py-2 pr-3">Start</th>
                <th className="py-2 pr-3">End</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {years.map((year) => (
                <tr
                  key={year.id}
                  className={`border-b border-border ${
                    year.status === 'ACTIVE' ? 'bg-bgAccent/40 font-medium' : ''
                  }`}
                >
                  <td className="py-2 pr-3 text-textPrimary">{year.label}</td>
                  <td className="py-2 pr-3 tabular-nums">{formatDate(year.startDate)}</td>
                  <td className="py-2 pr-3 tabular-nums">
                    {year.endDate ? formatDate(year.endDate) : '—'}
                  </td>
                  <td className="py-2">
                    <span
                      className={
                        year.status === 'ACTIVE' ? 'text-success' : 'text-textSecondary'
                      }
                    >
                      {year.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && years.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-textSecondary">
                    No financial years found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <DangerButton type="button" onClick={openCloseModal} disabled={!activeFromList}>
            Close & Start New Year
          </DangerButton>
          <p className="text-xs text-textMuted">
            Snapshots closing balances and opens the next year. Past vouchers become read-only.
          </p>
        </div>
      </Panel>

      {modalOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="fy-close-title"
            className="w-full max-w-md border border-border bg-surface2 p-5 shadow-lg"
          >
            <h2 id="fy-close-title" className="text-lg font-semibold text-textPrimary">
              Close financial year?
            </h2>
            <p className="mt-2 text-sm text-textSecondary">
              This is irreversible. All vouchers in FY {closingLabel} will be locked for editing.
              Closing balances will be snapshotted and FY {openingLabel} will become active.
            </p>
            <p className="mt-3 rounded-sm border border-border bg-surface1 px-3 py-2 text-sm text-textPrimary">
              This will close <strong>{closingLabel}</strong> and open <strong>{openingLabel}</strong>.
            </p>

            <form className="mt-4 space-y-3" onSubmit={onConfirmClose}>
              <div>
                <FieldLabel>Your password</FieldLabel>
                <TextInput
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Re-enter your account password"
                />
              </div>

              {closeError ? (
                <p className="text-sm text-danger whitespace-pre-wrap">{closeError}</p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <SecondaryButton type="button" onClick={closeModal} disabled={closing}>
                  Cancel
                </SecondaryButton>
                <DangerButton type="submit" disabled={closing}>
                  {closing ? 'Closing…' : 'Confirm close'}
                </DangerButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
