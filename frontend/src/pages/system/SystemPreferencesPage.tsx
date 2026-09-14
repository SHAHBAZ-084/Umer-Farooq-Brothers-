import { FormEvent, useEffect, useState } from 'react';
import {
  PageShell,
  Panel,
  PrimaryButton,
  Tile,
  FieldLabel,
  TextInput,
  SecondaryButton,
} from '../../components/ui/PageShell';
import { useTheme } from '../../contexts/ThemeContext';
import { api, SystemPreferences } from '../../lib/api';

type PrefForm = Omit<SystemPreferences, 'updatedAt'>;
type NumericPrefKey = Exclude<
  keyof PrefForm,
  | 'closingDate'
  | 'businessName'
  | 'proprietorName'
  | 'phone'
  | 'mobile'
  | 'email'
  | 'address'
  | 'ntnNumber'
>;
type BusinessPrefKey =
  | 'businessName'
  | 'proprietorName'
  | 'phone'
  | 'mobile'
  | 'email'
  | 'address'
  | 'ntnNumber';

type PrefTab =
  | 'business-info'
  | 'general'
  | 'kachi-maal'
  | 'purchase-maal'
  | 'sale-paunch'
  | 'sale-commission'
  | 'purchase-general'
  | 'sale-general';

type PrefFieldDef = { key: NumericPrefKey; label: string; hint?: string };

const PREF_TABS: Array<{ value: PrefTab; label: string }> = [
  { value: 'business-info', label: 'Business Info' },
  { value: 'general', label: 'General' },
  { value: 'kachi-maal', label: 'Kachi Maal' },
  { value: 'purchase-maal', label: 'Purchase Maal' },
  { value: 'sale-paunch', label: 'Sale Paunch' },
  { value: 'sale-commission', label: 'Sale Commission' },
  { value: 'purchase-general', label: 'Purchase Invoice' },
  { value: 'sale-general', label: 'Sale Invoice' },
];

/** All numeric preference keys — used when building the save payload. */
const ALL_NUMERIC_FIELDS: NumericPrefKey[] = [
  'daamiPercent',
  'paleDariPercent',
  'brokeryPercent',
  'marketFeeRate',
  'bardanaRate',
  'taxPercent',
  'kaatPercent',
  'mazduriPercent',
  'mazduriPerBagRate',
  'commissionPercent',
  'dalaliPercent',
  'sutliRate',
  'markeetFeeRate',
  'kantaRate',
];

const SHARED_RATE_FIELDS: PrefFieldDef[] = [
  {
    key: 'daamiPercent',
    label: 'Daami (%)',
    hint: 'Shop-wide — Kachi Maal profit / Purchase Maal, Sale Paunch & Sale Commission Dammi',
  },
  {
    key: 'marketFeeRate',
    label: 'Market Fee (per bag)',
    hint: 'Shop-wide — Kachi Maal (calc bags), Purchase Maal & Sale Commission',
  },
  {
    key: 'kaatPercent',
    label: 'Kaat (%)',
    hint: 'Shop-wide — used on Kachi Maal / Purchase Maal bill print',
  },
];

const GENERAL_OTHER_FIELDS: PrefFieldDef[] = [
  { key: 'bardanaRate', label: 'Bardana Rate', hint: 'Default bardana rate reference' },
  { key: 'taxPercent', label: 'Tax (%)' },
  { key: 'markeetFeeRate', label: 'Markeet Fee', hint: 'Legacy unused field' },
];

const KACHI_FIELDS: PrefFieldDef[] = [
  { key: 'paleDariPercent', label: 'Pale Dari (%)', hint: 'Labour rate — Kachi Maal' },
  { key: 'brokeryPercent', label: 'Brokery (%)', hint: 'Broker rate — Kachi Maal' },
];

const PURCHASE_MAAL_FIELDS: PrefFieldDef[] = [
  { key: 'mazduriPercent', label: 'Mazduri (%)', hint: 'Percentage — Purchase Maal' },
  { key: 'kantaRate', label: 'Kanta', hint: 'Per-thela rate on Purchase Maal bills' },
];

const SALE_COMMISSION_FIELDS: PrefFieldDef[] = [
  { key: 'commissionPercent', label: 'Commission (%)', hint: 'Post-dammi base' },
  { key: 'dalaliPercent', label: 'Dalali (%)', hint: 'Pre-dammi goods base' },
  { key: 'sutliRate', label: 'Sutli (per bag)' },
  { key: 'mazduriPerBagRate', label: 'Mazduri / Labour (per bag)', hint: 'Flat Rs per bag' },
];

function PrefFieldInputs({
  fields,
  form,
  onChange,
}: {
  fields: PrefFieldDef[];
  form: PrefForm;
  onChange: (key: NumericPrefKey, value: number) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field.key}>
          <FieldLabel>{field.label}</FieldLabel>
          <TextInput
            type="number"
            step="any"
            min="0"
            value={String(form[field.key])}
            onChange={(e) =>
              onChange(field.key, e.target.value === '' ? 0 : Number(e.target.value))
            }
          />
          {field.hint ? <p className="mt-1 text-xs text-textMuted">{field.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function SystemPreferencesPage() {
  const { theme, setTheme } = useTheme();
  const [tab, setTab] = useState<PrefTab>('business-info');
  const [form, setForm] = useState<PrefForm | null>(null);
  const [closingDate, setClosingDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dbChecking, setDbChecking] = useState(false);
  const [dbResult, setDbResult] = useState<{ ok: boolean; results: string[] } | null>(null);
  const [backingUp, setBackingUp] = useState(false);

  useEffect(() => {
    api
      .getSystemPreferences()
      .then((prefs) => {
        const { updatedAt: _, ...rest } = prefs;
        setForm(rest);
        setClosingDate(prefs.closingDate ?? '');
      })
      .catch(() => setError('Failed to load preferences'));
  }, []);

  function setNumericField(key: NumericPrefKey, value: number) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function setBusinessField(key: BusinessPrefKey, value: string) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      if (!form.businessName.trim()) throw new Error('Business Name is required');
      if (!form.proprietorName.trim()) throw new Error('Proprietor Name is required');
      if (!form.phone.trim()) throw new Error('Phone is required');

      const payload = {} as Partial<PrefForm>;
      for (const key of ALL_NUMERIC_FIELDS) {
        payload[key] = Number(form[key]) || 0;
      }
      payload.closingDate = closingDate.trim() || null;
      payload.businessName = form.businessName.trim();
      payload.proprietorName = form.proprietorName.trim();
      payload.phone = form.phone.trim();
      payload.mobile = form.mobile?.trim() || null;
      payload.email = form.email?.trim() || null;
      payload.address = form.address?.trim() || null;
      payload.ntnNumber = form.ntnNumber?.trim() || null;
      const updated = await api.updateSystemPreferences(payload);
      const { updatedAt: _, ...rest } = updated;
      setForm(rest);
      setClosingDate(updated.closingDate ?? '');
      setMessage('Preferences saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function onVerifyDatabase() {
    setDbChecking(true);
    setDbResult(null);
    setError('');
    try {
      const result = await api.verifyDatabaseIntegrity();
      setDbResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Integrity check failed');
    } finally {
      setDbChecking(false);
    }
  }

  async function onBackupDatabase() {
    setBackingUp(true);
    setError('');
    setMessage('');
    try {
      const result = await api.backupDatabase();
      setMessage(result.path ? `Backup saved to ${result.path}` : 'Backup skipped — no database file yet.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setBackingUp(false);
    }
  }

  return (
    <PageShell title="System Preference" subtitle="Shop-wide settings by section">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {PREF_TABS.map((item) => (
          <SecondaryButton
            key={item.value}
            type="button"
            className={tab === item.value ? 'ring-2 ring-accent' : ''}
            onClick={() => setTab(item.value)}
          >
            {item.label}
          </SecondaryButton>
        ))}
      </div>

      <Panel className="max-w-2xl">
        {!form && error ? <p className="text-sm text-danger">{error}</p> : null}
        {!form && !error ? <p className="text-sm text-textMuted">Loading…</p> : null}

        {form ? (
          <form className="space-y-6" onSubmit={onSave}>
            {tab === 'business-info' ? (
              <Tile>
                <p className="text-sm font-medium text-textPrimary">Business Info</p>
                <p className="mt-1 text-xs text-textMuted">
                  Letterhead used on invoice bills and every PDF/Excel report export.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <FieldLabel>
                      Business Name <span className="text-danger">*</span>
                    </FieldLabel>
                    <TextInput
                      value={form.businessName}
                      onChange={(e) => setBusinessField('businessName', e.target.value)}
                      required
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <FieldLabel>
                      Proprietor Name <span className="text-danger">*</span>
                    </FieldLabel>
                    <TextInput
                      value={form.proprietorName}
                      onChange={(e) => setBusinessField('proprietorName', e.target.value)}
                      required
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <FieldLabel>Address</FieldLabel>
                    <textarea
                      className="app-input min-h-[4.5rem] w-full resize-y"
                      rows={3}
                      value={form.address ?? ''}
                      onChange={(e) => setBusinessField('address', e.target.value)}
                    />
                  </div>
                  <div>
                    <FieldLabel>
                      Phone <span className="text-danger">*</span>
                    </FieldLabel>
                    <TextInput
                      value={form.phone}
                      onChange={(e) => setBusinessField('phone', e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <FieldLabel>Mobile</FieldLabel>
                    <TextInput
                      value={form.mobile ?? ''}
                      onChange={(e) => setBusinessField('mobile', e.target.value)}
                    />
                  </div>
                  <div>
                    <FieldLabel>Email</FieldLabel>
                    <TextInput
                      type="email"
                      value={form.email ?? ''}
                      onChange={(e) => setBusinessField('email', e.target.value)}
                    />
                  </div>
                  <div>
                    <FieldLabel>NTN No.</FieldLabel>
                    <TextInput
                      value={form.ntnNumber ?? ''}
                      onChange={(e) => setBusinessField('ntnNumber', e.target.value)}
                    />
                  </div>
                </div>
              </Tile>
            ) : null}

            {tab === 'general' ? (
              <>
                <Tile>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-textPrimary">Appearance</p>
                      <p className="mt-1 text-xs text-textMuted">
                        Choose light or dark theme for the whole app.
                      </p>
                    </div>
                    <div className="flex rounded-lg border border-border bg-surface2 p-1">
                      <button
                        type="button"
                        onClick={() => setTheme('light')}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                          theme === 'light'
                            ? 'bg-accent text-onAccent'
                            : 'text-textSecondary hover:text-textPrimary'
                        }`}
                      >
                        Light
                      </button>
                      <button
                        type="button"
                        onClick={() => setTheme('dark')}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                          theme === 'dark'
                            ? 'bg-accent text-onAccent'
                            : 'text-textSecondary hover:text-textPrimary'
                        }`}
                      >
                        Dark
                      </button>
                    </div>
                  </div>
                </Tile>

                <Tile>
                  <p className="text-sm font-medium text-textPrimary">Database maintenance</p>
                  <p className="mt-1 text-xs text-textMuted">
                    Verify local SQLite integrity or create an on-demand backup. Automatic backups
                    run on app startup in production.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <SecondaryButton type="button" onClick={onVerifyDatabase} disabled={dbChecking}>
                      {dbChecking ? 'Checking…' : 'Verify database integrity'}
                    </SecondaryButton>
                    <SecondaryButton type="button" onClick={onBackupDatabase} disabled={backingUp}>
                      {backingUp ? 'Backing up…' : 'Backup database now'}
                    </SecondaryButton>
                  </div>
                  {dbResult ? (
                    <p className={`mt-3 text-sm ${dbResult.ok ? 'text-success' : 'text-danger'}`}>
                      {dbResult.ok
                        ? 'Integrity check passed (ok).'
                        : `Integrity issues: ${dbResult.results.join('; ')}`}
                    </p>
                  ) : null}
                </Tile>

                <Tile>
                  <p className="text-sm font-medium text-textPrimary">Shared rates</p>
                  <p className="mt-1 text-xs text-textMuted">
                    Shop-wide values used by more than one invoice type. Changing a rate here
                    updates every form that reads it.
                  </p>
                  <div className="mt-4">
                    <PrefFieldInputs
                      fields={SHARED_RATE_FIELDS}
                      form={form}
                      onChange={setNumericField}
                    />
                  </div>
                </Tile>

                <Tile>
                  <p className="text-sm font-medium text-textPrimary">Other</p>
                  <div className="mt-4 space-y-4">
                    <PrefFieldInputs
                      fields={GENERAL_OTHER_FIELDS}
                      form={form}
                      onChange={setNumericField}
                    />
                    <div>
                      <FieldLabel>Closing Date</FieldLabel>
                      <TextInput
                        value={closingDate}
                        onChange={(e) => setClosingDate(e.target.value)}
                        placeholder="e.g. 2026-06-30"
                      />
                    </div>
                  </div>
                </Tile>
              </>
            ) : null}

            {tab === 'kachi-maal' ? (
              <Tile>
                <p className="text-sm font-medium text-textPrimary">Kachi Maal</p>
                <p className="mt-1 text-xs text-textMuted">
                  Type-specific rates. Daami %, Market Fee, and Kaat % live under General → Shared
                  rates.
                </p>
                <div className="mt-4">
                  <PrefFieldInputs fields={KACHI_FIELDS} form={form} onChange={setNumericField} />
                </div>
              </Tile>
            ) : null}

            {tab === 'purchase-maal' ? (
              <Tile>
                <p className="text-sm font-medium text-textPrimary">Purchase Maal</p>
                <p className="mt-1 text-xs text-textMuted">
                  Type-specific rates. Daami %, Market Fee, and Kaat % live under General → Shared
                  rates.
                </p>
                <div className="mt-4">
                  <PrefFieldInputs
                    fields={PURCHASE_MAAL_FIELDS}
                    form={form}
                    onChange={setNumericField}
                  />
                </div>
              </Tile>
            ) : null}

            {tab === 'sale-paunch' ? (
              <Tile>
                <p className="text-sm font-medium text-textPrimary">Sale Paunch</p>
                <p className="mt-3 text-sm text-textSecondary">
                  Uses shared Daami % (General → Shared rates). Kaat and Kanta are entered per line
                  on the invoice form — there are no Sale Paunch–only preference fields.
                </p>
              </Tile>
            ) : null}

            {tab === 'sale-commission' ? (
              <Tile>
                <p className="text-sm font-medium text-textPrimary">Sale Commission</p>
                <p className="mt-1 text-xs text-textMuted">
                  Type-specific rates. Daami % and Market Fee live under General → Shared rates.
                </p>
                <div className="mt-4">
                  <PrefFieldInputs
                    fields={SALE_COMMISSION_FIELDS}
                    form={form}
                    onChange={setNumericField}
                  />
                </div>
              </Tile>
            ) : null}

            {tab === 'purchase-general' ? (
              <Tile>
                <p className="text-sm font-medium text-textPrimary">Purchase Invoice</p>
                <p className="mt-3 text-sm text-textSecondary">
                  No preferences for this invoice type.
                </p>
              </Tile>
            ) : null}

            {tab === 'sale-general' ? (
              <Tile>
                <p className="text-sm font-medium text-textPrimary">Sale Invoice</p>
                <p className="mt-3 text-sm text-textSecondary">
                  No preferences for this invoice type.
                </p>
              </Tile>
            ) : null}

            {error ? <p className="text-sm text-danger">{error}</p> : null}
            {message ? <p className="text-sm text-success">{message}</p> : null}

            <PrimaryButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save preferences'}
            </PrimaryButton>
          </form>
        ) : null}
      </Panel>
    </PageShell>
  );
}
