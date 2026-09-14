import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { DateField } from '../../components/ui/DateField';
import {
  DangerButton,
  FieldLabel,
  LegacyTable,
  PageShell,
  Panel,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from '../../components/ui/PageShell';
import { formatDate, formatLedgerAmount, formatVoucherTypeLabel } from '../../lib/format';
import {
  api,
  type Account,
  type AccountCategory,
  type ScheduleFrequency,
  type ScheduledVoucher,
} from '../../lib/api';
import {
  AccountSideFields,
  categoriesForSide,
} from './VoucherPages';

type VoucherKind = 'payment' | 'receipt' | 'journal';
type Tab = 'create' | 'manage';

const FREQUENCIES: { value: ScheduleFrequency; label: string }[] = [
  { value: 'HOURLY', label: 'Hourly' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
];

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

function splitIsoLocal(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: todayIsoLocal(), time: nowTimeLocal() };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: todayIsoLocal(), time: nowTimeLocal() };
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${formatDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function voucherTypeToKind(type: ScheduledVoucher['voucherType']): VoucherKind {
  if (type === 'PAYMENT') return 'payment';
  if (type === 'RECEIPT') return 'receipt';
  return 'journal';
}

function kindToVoucherType(kind: VoucherKind): ScheduledVoucher['voucherType'] {
  if (kind === 'payment') return 'PAYMENT';
  if (kind === 'receipt') return 'RECEIPT';
  return 'JOURNAL';
}

function statusClass(status: ScheduledVoucher['status']) {
  if (status === 'ACTIVE') return 'text-success';
  if (status === 'PAUSED') return 'text-accent';
  if (status === 'COMPLETED') return 'text-textSecondary';
  return 'text-textMuted';
}

export function SchedulesPage() {
  const [tab, setTab] = useState<Tab>('create');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<AccountCategory[]>([]);
  const [schedules, setSchedules] = useState<ScheduledVoucher[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [kind, setKind] = useState<VoucherKind>('payment');
  const [debitCategoryId, setDebitCategoryId] = useState('');
  const [creditCategoryId, setCreditCategoryId] = useState('');
  const [debitAccountId, setDebitAccountId] = useState('');
  const [creditAccountId, setCreditAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState<ScheduleFrequency>('DAILY');
  const [startDate, setStartDate] = useState(todayIsoLocal);
  const [startTime, setStartTime] = useState(nowTimeLocal);
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('23:59');
  const [occurrenceLimit, setOccurrenceLimit] = useState('');
  const [saving, setSaving] = useState(false);

  const [editRow, setEditRow] = useState<ScheduledVoucher | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editFrequency, setEditFrequency] = useState<ScheduleFrequency>('DAILY');
  const [editStartDate, setEditStartDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editEndTime, setEditEndTime] = useState('23:59');
  const [editOccurrenceLimit, setEditOccurrenceLimit] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteRow, setDeleteRow] = useState<ScheduledVoucher | null>(null);

  const leftCategoryRef = useRef<HTMLInputElement>(null);
  const leftAccountRef = useRef<HTMLInputElement>(null);
  const rightCategoryRef = useRef<HTMLInputElement>(null);
  const rightAccountRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const reloadAccounts = useCallback(async () => {
    try {
      const [accountRows, categoryRows] = await Promise.all([
        api.listAccounts(),
        api.listCategories(),
      ]);
      setAccounts(accountRows);
      setCategories(categoryRows);
    } catch {
      setAccounts([]);
      setCategories([]);
    }
  }, []);

  const reloadSchedules = useCallback(async () => {
    setLoadingList(true);
    try {
      const rows = await api.listSchedules();
      setSchedules(rows.filter((r) => r.status !== 'DELETED'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
      setSchedules([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void reloadAccounts();
  }, [reloadAccounts]);

  useEffect(() => {
    if (tab === 'manage') void reloadSchedules();
  }, [tab, reloadSchedules]);

  const debitCategories = categoriesForSide(categories, kind, 'debit');
  const creditCategories = categoriesForSide(categories, kind, 'credit');

  const leftLabel = kind === 'journal' ? 'Debit' : 'From';
  const rightLabel = kind === 'journal' ? 'Credit' : 'To';
  const leftCategoryId = kind === 'journal' ? debitCategoryId : creditCategoryId;
  const rightCategoryId = kind === 'journal' ? creditCategoryId : debitCategoryId;
  const leftAccountId = kind === 'journal' ? debitAccountId : creditAccountId;
  const rightAccountId = kind === 'journal' ? creditAccountId : debitAccountId;

  function setLeftCategory(id: string) {
    if (kind === 'journal') {
      setDebitCategoryId(id);
      setDebitAccountId('');
    } else {
      setCreditCategoryId(id);
      setCreditAccountId('');
    }
  }
  function setRightCategory(id: string) {
    if (kind === 'journal') {
      setCreditCategoryId(id);
      setCreditAccountId('');
    } else {
      setDebitCategoryId(id);
      setDebitAccountId('');
    }
  }
  function setLeftAccount(id: string) {
    if (kind === 'journal') setDebitAccountId(id);
    else setCreditAccountId(id);
  }
  function setRightAccount(id: string) {
    if (kind === 'journal') setCreditAccountId(id);
    else setDebitAccountId(id);
  }

  function resetCreateForm() {
    setDebitCategoryId('');
    setCreditCategoryId('');
    setDebitAccountId('');
    setCreditAccountId('');
    setAmount('');
    setDescription('');
    setFrequency('DAILY');
    setStartDate(todayIsoLocal());
    setStartTime(nowTimeLocal());
    setEndDate('');
    setEndTime('23:59');
    setOccurrenceLimit('');
  }

  function validateFinite(freq: ScheduleFrequency, endIso: string | null, limitRaw: string) {
    const limit = limitRaw.trim() ? Number(limitRaw) : null;
    if (freq === 'HOURLY') {
      if (limit == null || !(limit > 0)) {
        return 'Hourly schedules require how many times to run';
      }
      return '';
    }
    if (!endIso && (limit == null || !(limit > 0))) {
      return 'Set an end date or a number of occurrences';
    }
    return '';
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!debitAccountId || !creditAccountId) {
      setError('Select both accounts');
      return;
    }
    if (debitAccountId === creditAccountId) {
      setError('Debit and credit accounts must be different');
      return;
    }
    const parsedAmount = Number(amount);
    if (!(parsedAmount > 0)) {
      setError('Amount must be greater than zero');
      return;
    }
    const startAt = combineDateTimeLocal(startDate, startTime);
    const endAt = endDate.trim() ? combineDateTimeLocal(endDate, endTime || '23:59') : null;
    const finiteErr = validateFinite(frequency, endAt, occurrenceLimit);
    if (finiteErr) {
      setError(finiteErr);
      return;
    }
    setSaving(true);
    try {
      await api.createSchedule({
        voucherType: kindToVoucherType(kind),
        debitAccountId: Number(debitAccountId),
        creditAccountId: Number(creditAccountId),
        amount: parsedAmount,
        description: description.trim() || null,
        frequency,
        startAt,
        endAt,
        occurrenceLimit: occurrenceLimit.trim() ? Number(occurrenceLimit) : null,
      });
      setMessage('Schedule created. Vouchers will appear in Pending Approvals when due.');
      resetCreateForm();
      setTab('manage');
      await reloadSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create schedule');
    } finally {
      setSaving(false);
    }
  }

  function openEdit(row: ScheduledVoucher) {
    const start = splitIsoLocal(row.startAt);
    const end = splitIsoLocal(row.endAt);
    setEditRow(row);
    setEditAmount(String(row.amount));
    setEditDescription(row.description ?? '');
    setEditFrequency(row.frequency);
    setEditStartDate(start.date);
    setEditStartTime(start.time);
    setEditEndDate(row.endAt ? end.date : '');
    setEditEndTime(row.endAt ? end.time : '23:59');
    setEditOccurrenceLimit(row.occurrenceLimit != null ? String(row.occurrenceLimit) : '');
    setError('');
    setMessage('');
  }

  async function onSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editRow) return;
    setError('');
    setMessage('');
    const parsedAmount = Number(editAmount);
    if (!(parsedAmount > 0)) {
      setError('Amount must be greater than zero');
      return;
    }
    const startAt = combineDateTimeLocal(editStartDate, editStartTime);
    const endAt = editEndDate.trim()
      ? combineDateTimeLocal(editEndDate, editEndTime || '23:59')
      : null;
    const finiteErr = validateFinite(editFrequency, endAt, editOccurrenceLimit);
    if (finiteErr) {
      setError(finiteErr);
      return;
    }
    setSavingEdit(true);
    try {
      await api.updateSchedule(editRow.id, {
        amount: parsedAmount,
        description: editDescription.trim() || null,
        frequency: editFrequency,
        startAt,
        endAt,
        occurrenceLimit: editOccurrenceLimit.trim() ? Number(editOccurrenceLimit) : null,
      });
      setMessage(`Schedule #${editRow.id} updated.`);
      setEditRow(null);
      await reloadSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update schedule');
    } finally {
      setSavingEdit(false);
    }
  }

  async function onPause(id: number) {
    setBusyId(id);
    setError('');
    try {
      await api.pauseSchedule(id);
      await reloadSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause');
    } finally {
      setBusyId(null);
    }
  }

  async function onResume(id: number) {
    setBusyId(id);
    setError('');
    try {
      await api.resumeSchedule(id);
      await reloadSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume');
    } finally {
      setBusyId(null);
    }
  }

  function askDelete(row: ScheduledVoucher) {
    setEditRow(null);
    setDeleteRow(row);
    setError('');
    setMessage('');
  }

  async function onConfirmDelete() {
    if (!deleteRow) return;
    const id = deleteRow.id;
    setBusyId(id);
    setError('');
    try {
      await api.deleteSchedule(id);
      setMessage(`Schedule #${id} deleted.`);
      setDeleteRow(null);
      setEditRow(null);
      await reloadSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageShell centerTitle title="Scheduled Vouchers">
      <div className="mx-auto w-full max-w-[1100px] space-y-4 px-2">
        <div className="flex flex-wrap gap-2">
          <SecondaryButton
            type="button"
            className={tab === 'create' ? 'ring-1 ring-accent' : ''}
            onClick={() => setTab('create')}
          >
            Create schedule
          </SecondaryButton>
          <SecondaryButton
            type="button"
            className={tab === 'manage' ? 'ring-1 ring-accent' : ''}
            onClick={() => setTab('manage')}
          >
            Manage schedules
          </SecondaryButton>
        </div>

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {message ? <p className="text-sm text-success">{message}</p> : null}

        {tab === 'create' ? (
          <Panel>
            <form className="space-y-6" onSubmit={onCreate}>
              <div>
                <FieldLabel>Voucher type</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {(['payment', 'receipt', 'journal'] as VoucherKind[]).map((k) => (
                    <SecondaryButton
                      key={k}
                      type="button"
                      className={kind === k ? 'ring-1 ring-accent' : ''}
                      onClick={() => {
                        setKind(k);
                        setDebitCategoryId('');
                        setCreditCategoryId('');
                        setDebitAccountId('');
                        setCreditAccountId('');
                      }}
                    >
                      {k === 'payment' ? 'Payment' : k === 'receipt' ? 'Receipt' : 'Journal'}
                    </SecondaryButton>
                  ))}
                </div>
              </div>

              <div className="grid gap-8 sm:grid-cols-2">
                <AccountSideFields
                  label={leftLabel}
                  categoryId={leftCategoryId}
                  accountId={leftAccountId}
                  categories={kind === 'journal' ? debitCategories : creditCategories}
                  accounts={accounts}
                  onCategoryChange={setLeftCategory}
                  onAccountChange={setLeftAccount}
                  categoryTabIndex={1}
                  accountTabIndex={2}
                  categoryInputRef={leftCategoryRef}
                  accountInputRef={leftAccountRef}
                  accountNextFocusRef={rightCategoryRef}
                />
                <AccountSideFields
                  label={rightLabel}
                  categoryId={rightCategoryId}
                  accountId={rightAccountId}
                  categories={kind === 'journal' ? creditCategories : debitCategories}
                  accounts={accounts}
                  onCategoryChange={setRightCategory}
                  onAccountChange={setRightAccount}
                  categoryTabIndex={3}
                  accountTabIndex={4}
                  categoryInputRef={rightCategoryRef}
                  accountInputRef={rightAccountRef}
                  accountNextFocusRef={amountRef}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>Amount</FieldLabel>
                  <TextInput
                    ref={amountRef}
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <FieldLabel>Description</FieldLabel>
                  <TextInput
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional note on each voucher"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>Frequency</FieldLabel>
                  <select
                    className="app-input"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}
                  >
                    {FREQUENCIES.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Start date</FieldLabel>
                    <DateField required value={startDate} onChange={setStartDate} />
                  </div>
                  <div>
                    <FieldLabel>Start time</FieldLabel>
                    <TextInput
                      type="time"
                      required
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>
                      End date{frequency === 'HOURLY' ? ' (optional)' : ' or times'}
                    </FieldLabel>
                    <DateField value={endDate} onChange={setEndDate} />
                  </div>
                  <div>
                    <FieldLabel>End time</FieldLabel>
                    <TextInput
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      disabled={!endDate}
                    />
                  </div>
                </div>
                <div>
                  <FieldLabel>
                    {frequency === 'HOURLY' ? 'How many times (required)' : 'Number of times (optional)'}
                  </FieldLabel>
                  <TextInput
                    type="number"
                    min="1"
                    step="1"
                    value={occurrenceLimit}
                    onChange={(e) => setOccurrenceLimit(e.target.value)}
                    placeholder={frequency === 'HOURLY' ? 'e.g. 12' : 'e.g. 10'}
                    required={frequency === 'HOURLY'}
                  />
                  <p className="mt-1 text-xs text-textSecondary">
                    {frequency === 'HOURLY'
                      ? 'Hourly schedules must end after a fixed number of runs.'
                      : 'Provide an end date and/or a fixed number of occurrences.'}
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <PrimaryButton type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Create schedule'}
                </PrimaryButton>
              </div>
            </form>
          </Panel>
        ) : (
          <Panel>
            {loadingList ? (
              <p className="text-sm text-textSecondary">Loading…</p>
            ) : schedules.length === 0 ? (
              <p className="text-sm text-textSecondary">No schedules yet.</p>
            ) : (
              <LegacyTable>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Type</th>
                    <th>From / Debit</th>
                    <th>To / Credit</th>
                    <th>Amount</th>
                    <th>Freq</th>
                    <th>Next run</th>
                    <th>Runs</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((row) => {
                    const debitName = row.debitAccount?.name ?? `#${row.debitAccountId}`;
                    const creditName = row.creditAccount?.name ?? `#${row.creditAccountId}`;
                    const fromName = row.voucherType === 'JOURNAL' ? debitName : creditName;
                    const toName = row.voucherType === 'JOURNAL' ? creditName : debitName;
                    const canEdit = row.status === 'ACTIVE' || row.status === 'PAUSED';
                    return (
                      <tr key={row.id}>
                        <td className="tabular-nums">{row.id}</td>
                        <td>{formatVoucherTypeLabel(row.voucherType)}</td>
                        <td>{fromName}</td>
                        <td>{toName}</td>
                        <td className="tabular-nums">{formatLedgerAmount(row.amount)}</td>
                        <td>{row.frequency}</td>
                        <td className="whitespace-nowrap">{formatDateTime(row.nextRunAt)}</td>
                        <td className="tabular-nums">
                          {row.occurrencesRun}
                          {row.occurrenceLimit != null ? ` / ${row.occurrenceLimit}` : ''}
                        </td>
                        <td className={statusClass(row.status)}>{row.status}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {row.status === 'ACTIVE' ? (
                              <SecondaryButton
                                type="button"
                                disabled={busyId === row.id}
                                onClick={() => void onPause(row.id)}
                              >
                                Pause
                              </SecondaryButton>
                            ) : null}
                            {row.status === 'PAUSED' ? (
                              <SecondaryButton
                                type="button"
                                disabled={busyId === row.id}
                                onClick={() => void onResume(row.id)}
                              >
                                Resume
                              </SecondaryButton>
                            ) : null}
                            {canEdit ? (
                              <SecondaryButton type="button" onClick={() => openEdit(row)}>
                                Edit
                              </SecondaryButton>
                            ) : null}
                            {row.status !== 'COMPLETED' ? (
                              <DangerButton
                                type="button"
                                disabled={busyId === row.id}
                                onClick={() => askDelete(row)}
                              >
                                Delete
                              </DangerButton>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </LegacyTable>
            )}
          </Panel>
        )}
      </div>

      <Modal
        open={Boolean(deleteRow)}
        onClose={() => {
          if (busyId == null) setDeleteRow(null);
        }}
        title={deleteRow ? `Delete schedule #${deleteRow.id}?` : 'Delete schedule'}
      >
        {deleteRow ? (
          <div className="space-y-4">
            <p className="text-sm text-textSecondary">
              Future runs will stop. Vouchers already created stay in Approvals / ledger.
            </p>
            <p className="text-sm text-textPrimary">
              {formatVoucherTypeLabel(deleteRow.voucherType)} · Rs{' '}
              {formatLedgerAmount(deleteRow.amount)} · {deleteRow.frequency}
            </p>
            <div className="flex justify-end gap-2">
              <SecondaryButton
                type="button"
                disabled={busyId === deleteRow.id}
                onClick={() => setDeleteRow(null)}
              >
                Cancel
              </SecondaryButton>
              <DangerButton
                type="button"
                disabled={busyId === deleteRow.id}
                onClick={() => void onConfirmDelete()}
              >
                {busyId === deleteRow.id ? 'Deleting…' : 'Delete'}
              </DangerButton>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(editRow)}
        onClose={() => setEditRow(null)}
        title={editRow ? `Edit schedule #${editRow.id}` : 'Edit schedule'}
        maxWidthClassName="max-w-lg"
      >
        {editRow ? (
          <form className="space-y-4" onSubmit={onSaveEdit}>
            <p className="text-sm text-textSecondary">
              {formatVoucherTypeLabel(editRow.voucherType)} ·{' '}
              {voucherTypeToKind(editRow.voucherType) === 'journal'
                ? `${editRow.debitAccount?.name ?? editRow.debitAccountId} → ${editRow.creditAccount?.name ?? editRow.creditAccountId}`
                : `${editRow.creditAccount?.name ?? editRow.creditAccountId} → ${editRow.debitAccount?.name ?? editRow.debitAccountId}`}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel>Amount</FieldLabel>
                <TextInput
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>Frequency</FieldLabel>
                <select
                  className="app-input"
                  value={editFrequency}
                  onChange={(e) => setEditFrequency(e.target.value as ScheduleFrequency)}
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <FieldLabel>Description</FieldLabel>
              <TextInput
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Start date</FieldLabel>
                <DateField required value={editStartDate} onChange={setEditStartDate} />
              </div>
              <div>
                <FieldLabel>Start time</FieldLabel>
                <TextInput
                  type="time"
                  required
                  value={editStartTime}
                  onChange={(e) => setEditStartTime(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>End date</FieldLabel>
                <DateField value={editEndDate} onChange={setEditEndDate} />
              </div>
              <div>
                <FieldLabel>End time</FieldLabel>
                <TextInput
                  type="time"
                  value={editEndTime}
                  onChange={(e) => setEditEndTime(e.target.value)}
                  disabled={!editEndDate}
                />
              </div>
            </div>
            <div>
              <FieldLabel>
                {editFrequency === 'HOURLY' ? 'How many times (required)' : 'Number of times'}
              </FieldLabel>
              <TextInput
                type="number"
                min="1"
                step="1"
                value={editOccurrenceLimit}
                onChange={(e) => setEditOccurrenceLimit(e.target.value)}
                required={editFrequency === 'HOURLY'}
              />
            </div>
            <div className="flex justify-end gap-2">
              <SecondaryButton type="button" onClick={() => setEditRow(null)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={savingEdit}>
                {savingEdit ? 'Saving…' : 'Save'}
              </PrimaryButton>
            </div>
          </form>
        ) : null}
      </Modal>
    </PageShell>
  );
}
