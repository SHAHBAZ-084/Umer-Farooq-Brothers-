import { FormEvent, useEffect, useMemo, useState } from 'react';
import { formatLedgerBalance } from '../../lib/format';
import { PARTY_ACCOUNT_CATEGORIES } from '../../lib/kachiMaalCalculations';
import { api, type Account, type AccountCategory } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import {
  DangerButton,
  FieldLabel,
  PageShell,
  Panel,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from '../../components/ui/PageShell';

function defaultOpeningSideForCategory(categoryId: number, accounts: Account[]): 'DR' | 'CR' {
  const sibling = accounts.find((a) => a.categoryId === categoryId);
  if (sibling) {
    return sibling.type === 'ASSET' || sibling.type === 'EXPENSE' ? 'DR' : 'CR';
  }
  return 'DR';
}

function isPartyContactCategory(name?: string | null): boolean {
  return Boolean(
    name
    && (
      (PARTY_ACCOUNT_CATEGORIES as readonly string[]).includes(name)
      || name === 'Party / Customer'
    ),
  );
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

/**
 * Unified accounts workspace: searchable list + create/edit/remove in one screen.
 * Creating = no row selected; editing = row selected (admin can remove from the same form).
 */
export function AccountManagePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [categories, setCategories] = useState<AccountCategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [listCategoryId, setListCategoryId] = useState<number | ''>('');
  const [listQuery, setListQuery] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [cnic, setCnic] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [openingBalanceSide, setOpeningBalanceSide] = useState<'DR' | 'CR'>('DR');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isCreate = selectedId == null;

  useEffect(() => {
    api.listCategories().then(setCategories).catch(() => setCategories([]));
    api.listAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    if (isCreate && categoryId) {
      setOpeningBalanceSide(defaultOpeningSideForCategory(Number(categoryId), accounts));
    }
  }, [categoryId, accounts, isCreate]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId),
    [categories, categoryId],
  );

  const editAccount = useMemo(
    () => (selectedId != null ? accounts.find((a) => a.id === selectedId) : undefined),
    [accounts, selectedId],
  );

  const showContactFields = isCreate
    ? isPartyContactCategory(selectedCategory?.name)
    : isPartyContactCategory(editAccount?.category?.name);

  const filteredAccounts = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    return accounts
      .filter((a) => (listCategoryId === '' ? true : a.categoryId === listCategoryId))
      .filter((a) => {
        if (!q) return true;
        const hay = `${a.code} ${a.name} ${a.category?.name ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [accounts, listCategoryId, listQuery]);

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
    setOpeningBalanceSide('DR');
    setSelectedId(null);
    setError('');
  }

  function startCreate() {
    clearForm();
    setMessage('');
  }

  function selectAccount(account: Account, options?: { keepMessage?: boolean }) {
    setSelectedId(account.id);
    setCategoryId(account.categoryId);
    setName(account.name);
    setPhone(account.phone ?? '');
    setAddress(account.address ?? '');
    setCnic(account.cnic ?? '');
    setOpeningBalance('');
    setError('');
    if (!options?.keepMessage) setMessage('');
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      if (isCreate) {
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
      } else {
        if (selectedId == null) throw new Error('Select an account');
        const contactPayload = showContactFields
          ? {
              phone: phone.trim() || null,
              address: address.trim() || null,
              cnic: cnic.trim() || null,
            }
          : {};
        await api.updateAccount(selectedId, { name, ...contactPayload });
        setMessage('Account updated.');
        const rows = await api.listAccounts();
        setAccounts(rows);
        setCategories(await api.listCategories());
        const next = rows.find((a) => a.id === selectedId);
        if (next) selectAccount(next, { keepMessage: true });
        else clearForm();
        return;
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function onRemove() {
    if (selectedId == null || !isAdmin) return;
    const account = accounts.find((a) => a.id === selectedId);
    if (!account) return;
    if (!window.confirm(`Remove account "${account.name}"? This soft-deletes the account.`)) {
      return;
    }
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await withTimeout(
        api.removeAccount(selectedId),
        DELETE_TIMEOUT_MS,
        'Delete failed, please try again',
      );
      setMessage(`Account "${account.name}" removed.`);
      clearForm();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

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
    <PageShell
      title="Accounts"
      subtitle="Browse, create, edit, and remove ledger accounts in one place"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.95fr)_minmax(0,1.15fr)]">
        <Panel className="overflow-hidden p-0">
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-textPrimary">Account list</p>
              <SecondaryButton type="button" onClick={startCreate} disabled={saving || isCreate}>
                New account
              </SecondaryButton>
            </div>
            <div>
              <FieldLabel>Filter by category</FieldLabel>
              <select
                className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-textPrimary"
                value={listCategoryId}
                onChange={(e) => setListCategoryId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Search</FieldLabel>
              <TextInput
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                placeholder="Code, name, or category…"
              />
            </div>
          </div>
          <div className="max-h-[min(32rem,60vh)] overflow-auto">
            {filteredAccounts.length === 0 ? (
              <p className="p-4 text-sm text-textMuted">No accounts match these filters.</p>
            ) : (
              <ul className="divide-y divide-border">
                {filteredAccounts.map((account) => {
                  const active = selectedId === account.id;
                  return (
                    <li key={account.id}>
                      <button
                        type="button"
                        className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors ${
                          active ? 'bg-financial/10' : 'hover:bg-surface2'
                        }`}
                        onClick={() => selectAccount(account)}
                        disabled={saving}
                      >
                        <span className="text-sm font-medium text-textPrimary">{account.name}</span>
                        <span className="text-xs text-textMuted">
                          {account.code}
                          {account.category?.name ? ` · ${account.category.name}` : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Panel>

        <Panel>
          <div className="mb-4">
            <p className="text-sm font-semibold text-textPrimary">
              {isCreate ? 'New account' : 'Edit account'}
            </p>
            <p className="mt-1 text-xs text-textMuted">
              {isCreate
                ? 'Fill the form and save to submit for approval.'
                : 'Update details below. Admins can also remove this account.'}
            </p>
          </div>

          <form className="space-y-4" onSubmit={onSubmit}>
            {isCreate ? (
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
            ) : (
              <div>
                <FieldLabel>Category</FieldLabel>
                <div className="app-input-static text-sm">
                  {editAccount?.category?.name ?? '—'}
                </div>
              </div>
            )}

            <div>
              <FieldLabel>Account name</FieldLabel>
              <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            {contactFields}

            {isCreate ? (
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
                      Default for {selectedCategory.name}:{' '}
                      {defaultOpeningSideForCategory(selectedCategory.id, accounts)} side
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {error ? <p className="text-sm text-danger">{error}</p> : null}
            {message ? <p className="text-sm text-success">{message}</p> : null}

            <div className="flex flex-wrap gap-2">
              <PrimaryButton type="submit" disabled={saving}>
                {saving ? 'Saving…' : isCreate ? 'Create account' : 'Save changes'}
              </PrimaryButton>
              <SecondaryButton type="button" disabled={saving} onClick={startCreate}>
                {isCreate ? 'Clear' : 'Cancel'}
              </SecondaryButton>
              {!isCreate && isAdmin ? (
                <DangerButton type="button" disabled={saving} onClick={() => void onRemove()}>
                  {saving ? 'Removing…' : 'Remove'}
                </DangerButton>
              ) : null}
            </div>
          </form>
        </Panel>
      </div>
    </PageShell>
  );
}
