import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { formatLedgerBalance } from '../../lib/format';
import { PARTY_ACCOUNT_CATEGORIES } from '../../lib/kachiMaalCalculations';
import { api, type Account, type AccountCategory } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { FieldLabel, PageShell, Panel, PrimaryButton, SecondaryButton, TextInput } from '../../components/ui/PageShell';

type Mode = 'add' | 'edit' | 'remove';

const copy: Record<Mode, { title: string; subtitle: string }> = {
  add: { title: 'Add Account', subtitle: 'Create a new account under a category' },
  edit: { title: 'Edit Account', subtitle: 'Rename an existing account' },
  remove: { title: 'Remove Account', subtitle: 'Soft-delete an account' },
};

function defaultOpeningSideForCategory(categoryId: number, accounts: Account[]): 'DR' | 'CR' {
  const sibling = accounts.find((a) => a.categoryId === categoryId);
  if (sibling) {
    return sibling.type === 'ASSET' || sibling.type === 'EXPENSE' ? 'DR' : 'CR';
  }
  return 'DR';
}

function isPartyContactCategory(name?: string | null): boolean {
  return Boolean(name && (PARTY_ACCOUNT_CATEGORIES as readonly string[]).includes(name));
}

const DELETE_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export function AccountManagePage({ mode }: { mode: Mode }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [categories, setCategories] = useState<AccountCategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [cnic, setCnic] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [openingBalanceSide, setOpeningBalanceSide] = useState<'DR' | 'CR'>('DR');
  const [selectedId, setSelectedId] = useState<number | ''>('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listCategories().then(setCategories).catch(() => setCategories([]));
    api.listAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    if (mode === 'edit' && selectedId) {
      const account = accounts.find((a) => a.id === selectedId);
      setName(account?.name ?? '');
      setPhone(account?.phone ?? '');
      setAddress(account?.address ?? '');
      setCnic(account?.cnic ?? '');
    }
  }, [selectedId, accounts, mode]);

  useEffect(() => {
    if (mode === 'add' && categoryId) {
      setOpeningBalanceSide(defaultOpeningSideForCategory(Number(categoryId), accounts));
    }
  }, [categoryId, accounts, mode]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId),
    [categories, categoryId],
  );

  const editAccount = useMemo(
    () => (selectedId ? accounts.find((a) => a.id === selectedId) : undefined),
    [accounts, selectedId],
  );

  const showContactFields =
    mode === 'add'
      ? isPartyContactCategory(selectedCategory?.name)
      : mode === 'edit'
        ? isPartyContactCategory(editAccount?.category?.name)
        : false;

  if (mode === 'remove' && !isAdmin) {
    return <Navigate to="/accounts/manage/add" replace />;
  }

  async function reload() {
    setCategories(await api.listCategories());
    setAccounts(await api.listAccounts());
  }

  function clearForm() {
    setCategoryId('');
    setName('');
    setPhone('');
    setAddress('');
    setCnic('');
    setOpeningBalance('');
    setSelectedId('');
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      if (mode === 'add') {
        if (!categoryId) throw new Error('Select a category');
        const parsedOpening = openingBalance.trim() ? Number(openingBalance) : 0;
        if (openingBalance.trim() && !(parsedOpening >= 0)) {
          throw new Error('Opening balance must be zero or greater');
        }
        const contactPayload = showContactFields
          ? {
              phone: phone.trim() || null,
              address: address.trim() || null,
              cnic: cnic.trim() || null,
            }
          : {};
        await api.createAccount({
          categoryId: Number(categoryId),
          name,
          ...contactPayload,
          ...(parsedOpening > 0
            ? { openingBalance: parsedOpening, openingBalanceSide }
            : {}),
        });
        if (parsedOpening > 0) {
          setMessage(
            `Account "${name}" submitted for approval with opening balance ${formatLedgerBalance(parsedOpening)} (${openingBalanceSide}).`,
          );
        } else {
          setMessage(`Account "${name}" submitted for approval.`);
        }
        clearForm();
        setOpeningBalanceSide('DR');
      } else if (mode === 'edit') {
        if (!selectedId) throw new Error('Select an account');
        const contactPayload = showContactFields
          ? {
              phone: phone.trim() || null,
              address: address.trim() || null,
              cnic: cnic.trim() || null,
            }
          : {};
        await api.updateAccount(Number(selectedId), { name, ...contactPayload });
        setMessage('Account updated.');
        clearForm();
      } else {
        if (!selectedId) throw new Error('Select an account');
        await withTimeout(
          api.removeAccount(Number(selectedId)),
          DELETE_TIMEOUT_MS,
          'Delete failed, please try again',
        );
        setMessage('Account removed.');
        clearForm();
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  const { title, subtitle } = copy[mode];

  const contactFields = showContactFields ? (
    <>
      <div>
        <FieldLabel>Phone number (optional)</FieldLabel>
        <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0300-1234567" />
      </div>
      <div>
        <FieldLabel>Address (optional)</FieldLabel>
        <TextInput value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" />
      </div>
      <div>
        <FieldLabel>CNIC (optional)</FieldLabel>
        <TextInput value={cnic} onChange={(e) => setCnic(e.target.value)} placeholder="e.g. 35202-1234567-1" />
      </div>
    </>
  ) : null;

  return (
    <PageShell title={title} subtitle={subtitle}>
      <Panel className="max-w-lg">
        <form className="space-y-4" onSubmit={onSubmit}>
          {mode === 'add' ? (
            <>
              <div>
                <FieldLabel>Category</FieldLabel>
                <select
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}
                  required
                >
                  <option value="">Select category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Account name</FieldLabel>
                <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              {contactFields}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>Opening balance</FieldLabel>
                  <TextInput
                    type="number"
                    min="0"
                    step="0.01"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    placeholder="0.00 (optional)"
                  />
                </div>
                <div>
                  <FieldLabel>Opening balance side</FieldLabel>
                  <select
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    value={openingBalanceSide}
                    onChange={(e) => setOpeningBalanceSide(e.target.value as 'DR' | 'CR')}
                    disabled={!openingBalance.trim() || Number(openingBalance) <= 0}
                  >
                    <option value="DR">Dr</option>
                    <option value="CR">Cr</option>
                  </select>
                  {selectedCategory ? (
                    <p className="mt-1 text-xs text-textMuted">
                      Default for {selectedCategory.name}: {defaultOpeningSideForCategory(selectedCategory.id, accounts)} side
                    </p>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <FieldLabel>Account</FieldLabel>
                <select
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : '')}
                  required
                >
                  <option value="">Select account</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              {mode === 'edit' ? (
                <>
                  <div>
                    <FieldLabel>Account name</FieldLabel>
                    <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
                  </div>
                  {contactFields}
                </>
              ) : null}
            </>
          )}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {message ? <p className="text-sm text-success">{message}</p> : null}
          <div className="flex gap-2">
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? (mode === 'remove' ? 'Removing…' : 'Saving…') : mode === 'remove' ? 'Remove' : 'Save'}
            </PrimaryButton>
            <SecondaryButton type="button" disabled={saving} onClick={clearForm}>Clear</SecondaryButton>
          </div>
        </form>
      </Panel>
    </PageShell>
  );
}
