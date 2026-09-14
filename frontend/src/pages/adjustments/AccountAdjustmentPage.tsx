import { FormEvent, useEffect, useMemo, useState } from 'react';
import { notifyApprovalsChanged } from '../../lib/approvals';
import { api, type Account } from '../../lib/api';
import { DateField } from '../../components/ui/DateField';
import { FieldLabel, PageShell, Panel, PrimaryButton, TextInput } from '../../components/ui/PageShell';
import { SearchSelect } from '../../components/ui/SearchSelect';

const MAAL_KHATA_CATEGORY = 'Maal Khata';

function todayInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function AccountAdjustmentPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [side, setSide] = useState<'DR' | 'CR'>('DR');
  const [adjustmentDate, setAdjustmentDate] = useState(todayInputValue());
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  const eligibleAccounts = useMemo(
    () => accounts.filter((a) => a.category?.name !== MAAL_KHATA_CATEGORY),
    [accounts],
  );

  const accountOptions = eligibleAccounts.map((a) => ({
    value: String(a.id),
    label: a.name,
  }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const id = parseInt(accountId, 10);
      const value = parseFloat(amount);
      if (!Number.isFinite(id) || id < 1) throw new Error('Select an account');
      if (!Number.isFinite(value) || value <= 0) throw new Error('Enter a valid amount');

      await api.createAccountAdjustment({
        accountId: id,
        amount: value,
        side,
        adjustmentDate,
        notes: notes.trim() || undefined,
      });
      setMessage('Account adjustment submitted for approval.');
      notifyApprovalsChanged();
      setAmount('');
      setNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit adjustment');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell
      title="Account Adjustment"
      subtitle="Correct a ledger balance on a non-product account — posts after admin approval"
    >
      <Panel>
        <p className="mb-4 text-sm text-textMuted">
          Maal Khata (product) accounts cannot be adjusted here — use Stock Adjustment instead.
        </p>
        <form className="max-w-md space-y-4" onSubmit={onSubmit}>
          <div>
            <FieldLabel>Account</FieldLabel>
            <SearchSelect
              value={accountId}
              onChange={setAccountId}
              options={accountOptions}
              placeholder="Select account…"
            />
          </div>
          <div>
            <FieldLabel>Amount</FieldLabel>
            <TextInput
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div>
            <FieldLabel>Side</FieldLabel>
            <select className="app-input" value={side} onChange={(e) => setSide(e.target.value as 'DR' | 'CR')}>
              <option value="DR">Debit (DR)</option>
              <option value="CR">Credit (CR)</option>
            </select>
          </div>
          <div>
            <FieldLabel>Date</FieldLabel>
            <DateField
              value={adjustmentDate}
              onChange={setAdjustmentDate}
              required
            />
          </div>
          <div>
            <FieldLabel>Notes (optional)</FieldLabel>
            <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {message ? <p className="text-sm text-success">{message}</p> : null}
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? 'Submitting…' : 'Submit for approval'}
          </PrimaryButton>
        </form>
      </Panel>
    </PageShell>
  );
}
