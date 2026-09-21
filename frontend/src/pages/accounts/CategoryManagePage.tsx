import { FormEvent, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, type AccountCategory } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { FieldLabel, PageShell, Panel, PrimaryButton, SecondaryButton, TextInput } from '../../components/ui/PageShell';

type Mode = 'add' | 'edit' | 'remove';

const copy: Record<Mode, { title: string; subtitle: string }> = {
  add: { title: 'Add Category', subtitle: 'Create a new chart-of-accounts category' },
  edit: { title: 'Edit Category', subtitle: 'Rename a category and set contact-field collection' },
  remove: { title: 'Remove Category', subtitle: 'Soft-delete an empty category' },
};

export function CategoryManagePage({ mode }: { mode: Mode }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [categories, setCategories] = useState<AccountCategory[]>([]);
  const [name, setName] = useState('');
  const [collectsContactInfo, setCollectsContactInfo] = useState(false);
  const [selectedId, setSelectedId] = useState<number | ''>('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.listCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (mode !== 'edit' || selectedId === '') {
      return;
    }
    const selected = categories.find((c) => c.id === selectedId);
    if (!selected) return;
    setName(selected.name);
    setCollectsContactInfo(Boolean(selected.collectsContactInfo));
  }, [mode, selectedId, categories]);

  if (mode === 'remove' && !isAdmin) {
    return <Navigate to="/accounts/categories/add" replace />;
  }

  function clearForm() {
    setName('');
    setCollectsContactInfo(false);
    setSelectedId('');
    setError('');
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      if (mode === 'add') {
        await api.createCategory({ name, collectsContactInfo });
        setMessage('Category created.');
        clearForm();
      } else if (mode === 'edit') {
        if (!selectedId) throw new Error('Select a category');
        if (!name.trim()) throw new Error('Category name is required');
        await api.updateCategory(Number(selectedId), {
          name,
          collectsContactInfo,
        });
        setMessage('Category updated.');
      } else if (mode === 'remove') {
        if (!selectedId) throw new Error('Select a category');
        await api.deleteCategory(Number(selectedId));
        setMessage('Category removed.');
        clearForm();
      }
      setCategories(await api.listCategories());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  const { title, subtitle } = copy[mode];

  return (
    <PageShell title={title} subtitle={subtitle}>
      <Panel className="max-w-lg">
        <form className="space-y-4" onSubmit={onSubmit}>
          {mode === 'add' ? (
            <>
              <div>
                <FieldLabel>Category name</FieldLabel>
                <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <label className="flex items-start gap-2 text-sm text-textPrimary">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={collectsContactInfo}
                  onChange={(e) => setCollectsContactInfo(e.target.checked)}
                />
                <span>
                  Collect phone / address / CNIC for accounts in this category
                  <span className="mt-0.5 block text-xs text-textMuted">
                    Enable for party / customer categories. Leave off for Cash, Bank, Capital, etc.
                  </span>
                </span>
              </label>
            </>
          ) : (
            <>
              <div>
                <FieldLabel>Category</FieldLabel>
                <select
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : '')}
                  required
                >
                  <option value="">Select category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              {mode === 'edit' ? (
                <>
                  <div>
                    <FieldLabel>Category name</FieldLabel>
                    <TextInput
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      disabled={selectedId === ''}
                    />
                  </div>
                  <label className="flex items-start gap-2 text-sm text-textPrimary">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={collectsContactInfo}
                      onChange={(e) => setCollectsContactInfo(e.target.checked)}
                      disabled={selectedId === ''}
                    />
                    <span>
                      Collect phone / address / CNIC for accounts in this category
                      <span className="mt-0.5 block text-xs text-textMuted">
                        Enable for party / customer categories. Leave off for Cash, Bank, Capital, etc.
                      </span>
                    </span>
                  </label>
                </>
              ) : null}
            </>
          )}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {message ? <p className="text-sm text-success">{message}</p> : null}
          <div className="flex gap-2">
            <PrimaryButton type="submit">
              {mode === 'remove' ? 'Remove' : mode === 'edit' ? 'Save changes' : 'Save'}
            </PrimaryButton>
            <SecondaryButton type="button" onClick={clearForm}>Clear</SecondaryButton>
          </div>
        </form>
      </Panel>
    </PageShell>
  );
}
