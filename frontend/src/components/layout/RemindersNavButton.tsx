import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bell } from 'lucide-react';
import { api, type Account, type Reminder } from '../../lib/api';
import { formatLedgerAmount } from '../../lib/format';
import {
  expectedNotifyCount,
  formatReminderWhen,
  notifyRemindersChanged,
  processReminderNotifications,
  REMINDERS_CHANGED_EVENT,
  reminderSeverityForCount,
  type ReminderSeverity,
} from '../../lib/reminders';
import { DateField } from '../ui/DateField';
import { SearchSelect } from '../ui/SearchSelect';
import { FieldLabel, TextInput } from '../ui/PageShell';

function severityBadgeClass(severity: ReminderSeverity) {
  if (severity === 'green') return 'bg-bgSuccess text-success';
  if (severity === 'yellow') return 'bg-surface1 text-textSecondary ring-1 ring-border';
  return 'bg-bgDanger text-danger';
}

function todayIsoLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowTimeLocal() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function combineDateTimeLocal(dateIso: string, timeHm: string): string {
  const [y, m, day] = dateIso.split('-').map(Number);
  const [hh, mm] = timeHm.split(':').map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, day ?? 1, hh ?? 0, mm ?? 0, 0, 0);
  return dt.toISOString();
}

export function RemindersNavButton() {
  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [dateIso, setDateIso] = useState(todayIsoLocal);
  const [timeHm, setTimeHm] = useState(nowTimeLocal);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [settlingId, setSettlingId] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const catchUpDone = useRef(false);

  async function loadReminders() {
    try {
      const rows = await api.listReminders('PENDING');
      setReminders(rows);
      return rows;
    } catch {
      setReminders([]);
      return [] as Reminder[];
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const rows = await loadReminders();
      if (cancelled) return;
      if (!catchUpDone.current) {
        catchUpDone.current = true;
        const changed = await processReminderNotifications(rows);
        if (changed && !cancelled) {
          await loadReminders();
          notifyRemindersChanged();
        }
      }
    }
    void boot();

    const onChanged = () => {
      void loadReminders();
    };
    window.addEventListener(REMINDERS_CHANGED_EVENT, onChanged);

    const interval = window.setInterval(() => {
      void (async () => {
        const rows = await loadReminders();
        const changed = await processReminderNotifications(rows);
        if (changed) {
          await loadReminders();
          notifyRemindersChanged();
        }
      })();
    }, 30_000);

    function onFocus() {
      void (async () => {
        const rows = await loadReminders();
        const changed = await processReminderNotifications(rows);
        if (changed) {
          await loadReminders();
          notifyRemindersChanged();
        }
      })();
    }
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener(REMINDERS_CHANGED_EVENT, onChanged);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setFormOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function openPanel() {
    setOpen((v) => !v);
    setError('');
    if (!open) {
      setLoading(true);
      try {
        const [rows, accs] = await Promise.all([api.listReminders('PENDING'), api.listAccounts()]);
        setReminders(rows);
        setAccounts(accs.filter((a) => a.isActive));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load reminders');
      } finally {
        setLoading(false);
      }
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    const id = Number(accountId);
    const amt = Number(amount);
    if (!Number.isFinite(id) || id < 1) {
      setError('Select an account');
      return;
    }
    if (!(amt > 0)) {
      setError('Enter an amount greater than zero');
      return;
    }
    if (!dateIso || !timeHm) {
      setError('Date and time are required');
      return;
    }
    setSaving(true);
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      await api.createReminder({
        accountId: id,
        amount: amt,
        reminderAt: combineDateTimeLocal(dateIso, timeHm),
        note: note.trim() || null,
      });
      setFormOpen(false);
      setAccountId('');
      setAmount('');
      setNote('');
      setDateIso(todayIsoLocal());
      setTimeHm(nowTimeLocal());
      await loadReminders();
      notifyRemindersChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create reminder');
    } finally {
      setSaving(false);
    }
  }

  async function onSettle(id: number) {
    setSettlingId(id);
    setError('');
    try {
      await api.settleReminder(id);
      setReminders((prev) => prev.filter((r) => r.id !== id));
      notifyRemindersChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to settle reminder');
    } finally {
      setSettlingId(null);
    }
  }

  const count = reminders.length;
  const accountOptions = accounts.map((a) => ({
    value: String(a.id),
    label: `${a.name} (${a.code})`,
  }));

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => void openPanel()}
        className={`app-topnav-link ${open ? 'is-active' : ''}`}
        aria-label="Reminders"
        title="Reminders"
      >
        <Bell className="inline h-4 w-4" strokeWidth={2} aria-hidden />
        <span className="ml-1.5 hidden sm:inline">Reminders</span>
        {count > 0 ? (
          <span className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="app-dropdown right-0 top-full z-[220] mt-1 w-[380px] max-w-[calc(100vw-1.5rem)] p-0">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-sm font-semibold text-textPrimary">Reminders</p>
            <button
              type="button"
              className="text-sm font-medium text-textAccent hover:underline"
              onClick={() => {
                setFormOpen((v) => !v);
                setError('');
              }}
            >
              {formOpen ? 'Cancel' : '+ New Reminder'}
            </button>
          </div>

          {formOpen ? (
            <form onSubmit={(e) => void onCreate(e)} className="space-y-2 border-b border-border px-3 py-3">
              <div>
                <FieldLabel>Account</FieldLabel>
                <SearchSelect
                  value={accountId}
                  onChange={setAccountId}
                  options={accountOptions}
                  placeholder="Search any account…"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel>Date</FieldLabel>
                  <DateField value={dateIso} onChange={setDateIso} />
                </div>
                <div>
                  <FieldLabel>Time</FieldLabel>
                  <TextInput
                    type="time"
                    value={timeHm}
                    onChange={(e) => setTimeHm(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div>
                <FieldLabel>Amount</FieldLabel>
                <TextInput
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <FieldLabel>Note (optional)</FieldLabel>
                <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-md bg-bgAccent px-3 py-2 text-sm font-semibold text-textAccent disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save reminder'}
              </button>
            </form>
          ) : null}

          {error ? <p className="px-3 py-2 text-sm text-danger">{error}</p> : null}

          <div className="max-h-[360px] overflow-y-auto">
            {loading ? (
              <p className="px-3 py-4 text-sm text-textSecondary">Loading…</p>
            ) : reminders.length === 0 ? (
              <p className="px-3 py-4 text-sm text-textSecondary">No pending reminders.</p>
            ) : (
              <ul className="divide-y divide-border">
                {reminders.map((row) => {
                  const expected = Math.max(
                    row.notifyCount,
                    expectedNotifyCount(row.reminderAt),
                  );
                  const severity = reminderSeverityForCount(
                    expected > 0 ? expected : 1,
                  );
                  const overdue = Date.now() >= new Date(row.reminderAt).getTime();
                  return (
                    <li key={row.id} className="px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-textPrimary">
                            {row.account?.name ?? `Account #${row.accountId}`}
                          </p>
                          <p className="mt-0.5 text-xs text-textSecondary">
                            {formatReminderWhen(row.reminderAt)}
                            {overdue ? ' · overdue' : ''}
                          </p>
                          <p className="mt-0.5 text-sm tabular-nums text-textPrimary">
                            Rs {formatLedgerAmount(row.amount)}
                          </p>
                          {row.note ? (
                            <p className="mt-0.5 truncate text-xs text-textMuted">{row.note}</p>
                          ) : null}
                          {overdue ? (
                            <span
                              className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${severityBadgeClass(severity)}`}
                            >
                              {severity} · {Math.min(9, expected)}/9
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          disabled={settlingId === row.id}
                          onClick={() => void onSettle(row.id)}
                          className="shrink-0 rounded border border-border px-2 py-1 text-xs font-semibold text-textPrimary hover:bg-surface1 disabled:opacity-60"
                        >
                          {settlingId === row.id ? '…' : 'Done'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
