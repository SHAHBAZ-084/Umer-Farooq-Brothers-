import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DateField } from '../../components/ui/DateField';
import {
  FieldLabel,
  FinancialButton,
  PageShell,
  Panel,
  SecondaryButton,
  TextInput,
} from '../../components/ui/PageShell';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { api, Account, AccountCategory, Product, ProductCategory, type InvoiceDetail } from '../../lib/api';
import { formatLedgerAmount } from '../../lib/format';
import { invoiceLoadErrorMessage, loadInvoiceFormBase } from '../../lib/invoiceFormLoad';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useMinimizableForm } from '../../hooks/useMinimizableForm';
import { SALE_PARTY_CATEGORIES } from '../../lib/salePaunchCalculations';

const PURCHASE_PARTY_CATEGORIES = [
  'Int. Purchase Party',
  'Ext. Purchase Party',
  'Sale Party',
] as const;

type GridRow = {
  key: string;
  productId: number;
  productName: string;
  unit: string | null;
  quantity: number;
  purchaseRate: number;
  purchaseTotal: number;
  mazduriAmount: number;
  saleRate: number;
  saleTotal: number;
};

type Draft = {
  predictedRef: string;
  invoiceDate: string;
  billNo: string;
  tafseel: string;
  partyAccountId: string;
  salePartyAccountId: string;
  productCategoryId: string;
  productId: string;
  quantity: string;
  purchaseRate: string;
  saleRate: string;
  mazduriEnabled: boolean;
  mazduriAmount: string;
  gridRows: GridRow[];
};

function todayInputValue() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) return todayInputValue();
  return String(value).slice(0, 10);
}

function parseNum(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function filterCategories(all: AccountCategory[], allowed: readonly string[]) {
  const set = new Set(allowed);
  return all.filter((c) => set.has(c.name));
}

function flatAccountOptions(
  categories: AccountCategory[],
  accounts: Account[],
  categoryNames: readonly string[],
) {
  const allowedIds = new Set(filterCategories(categories, categoryNames).map((c) => c.id));
  return accounts
    .filter((a) => allowedIds.has(a.categoryId))
    .map((a) => ({ value: String(a.id), label: a.name }));
}

export function GeneralTradeInvoicePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editInvoiceId = Number(searchParams.get('editInvoiceId') ?? 0);
  const isEditMode = editInvoiceId > 0;
  const { restoredState, minimize } = useMinimizableForm<Draft>('general-trade');
  const keepRestoredPredictedRef = useRef(Boolean(restoredState?.predictedRef) || isEditMode);
  const trapRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  useFocusTrap(trapRef, { initialFocusRef: dateRef });

  const [categories, setCategories] = useState<AccountCategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [predictedRef, setPredictedRef] = useState(() => restoredState?.predictedRef ?? '');
  const [gridRows, setGridRows] = useState<GridRow[]>(() => restoredState?.gridRows ?? []);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [invoiceDate, setInvoiceDate] = useState(() => restoredState?.invoiceDate ?? todayInputValue());
  const [billNo, setBillNo] = useState(() => restoredState?.billNo ?? '');
  const [tafseel, setTafseel] = useState(() => restoredState?.tafseel ?? '');
  const [partyAccountId, setPartyAccountId] = useState(() => restoredState?.partyAccountId ?? '');
  const [salePartyAccountId, setSalePartyAccountId] = useState(
    () => restoredState?.salePartyAccountId ?? '',
  );
  const [productCategoryId, setProductCategoryId] = useState(
    () => restoredState?.productCategoryId ?? '',
  );
  const [productId, setProductId] = useState(() => restoredState?.productId ?? '');
  const [quantity, setQuantity] = useState(() => restoredState?.quantity ?? '');
  const [purchaseRate, setPurchaseRate] = useState(() => restoredState?.purchaseRate ?? '');
  const [saleRate, setSaleRate] = useState(() => restoredState?.saleRate ?? '');
  const [mazduriEnabled, setMazduriEnabled] = useState(() => restoredState?.mazduriEnabled ?? false);
  const [mazduriAmount, setMazduriAmount] = useState(() => restoredState?.mazduriAmount ?? '');

  /** Backend allows one purchase party + one sale party per invoice. */
  const partiesLocked = gridRows.length > 0;

  const purchasePartyOptions = useMemo(
    () => flatAccountOptions(categories, accounts, PURCHASE_PARTY_CATEGORIES),
    [categories, accounts],
  );
  const salePartyOptions = useMemo(
    () => flatAccountOptions(categories, accounts, SALE_PARTY_CATEGORIES),
    [categories, accounts],
  );

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          p.category?.stockMode === 'QUANTITY'
          && (!productCategoryId || String(p.categoryId) === productCategoryId),
      ),
    [products, productCategoryId],
  );

  const productOptions = useMemo(
    () =>
      filteredProducts.map((p) => ({
        value: String(p.id),
        label: p.unit ? `${p.name} (${p.unit})` : p.name,
      })),
    [filteredProducts],
  );

  const showMazduriColumn = useMemo(
    () => mazduriEnabled || gridRows.some((r) => r.mazduriAmount > 0),
    [mazduriEnabled, gridRows],
  );

  const purchaseGoodsTotal = useMemo(
    () => roundMoney(gridRows.reduce((s, r) => s + r.purchaseTotal, 0)),
    [gridRows],
  );
  const saleGoodsTotal = useMemo(
    () => roundMoney(gridRows.reduce((s, r) => s + r.saleTotal, 0)),
    [gridRows],
  );

  const reload = useCallback(async () => {
    const base = await loadInvoiceFormBase({ includeProducts: true });
    setAccounts(base.accounts);
    setCategories(base.categories);
    const [cats, qtyProducts] = await Promise.all([
      api.listProductCategories('QUANTITY'),
      api.listProducts({ stockMode: 'QUANTITY' }),
    ]);
    setProductCategories(cats);
    setProducts(qtyProducts);
    if (isEditMode) return;
    try {
      const refRow = await api.getNextGeneralTradeReference();
      if (keepRestoredPredictedRef.current) {
        keepRestoredPredictedRef.current = false;
      } else {
        setPredictedRef(refRow.reference);
      }
    } catch {
      if (!keepRestoredPredictedRef.current) setPredictedRef('');
      keepRestoredPredictedRef.current = false;
    }
  }, [isEditMode]);

  useEffect(() => {
    reload().catch((err) => setError(invoiceLoadErrorMessage(err)));
  }, [reload]);

  useEffect(() => {
    if (!isEditMode) return;
    let cancelled = false;
    api
      .getPendingApprovalDetail('invoice', editInvoiceId)
      .then((detail) => {
        if (cancelled) return;
        const record = detail.record as unknown as InvoiceDetail;
        setPredictedRef(String(record.reference ?? ''));
        setInvoiceDate(toDateInputValue(record.invoiceDate as string | null | undefined));
        setBillNo(String(record.billNo ?? ''));
        setTafseel(String(record.tafseel ?? record.notes ?? ''));
        setPartyAccountId(String(record.partyAccountId ?? ''));
        setSalePartyAccountId(String(record.salePartyAccountId ?? ''));
        const purchaseLines = record.generalPurchaseLines ?? [];
        const saleLines = record.generalSaleLines ?? [];
        const rows = purchaseLines.map((purchase, index) => {
          const sale = saleLines[index];
          return {
            key: `edit-${purchase.id ?? index}`,
            productId: Number(purchase.productId),
            productName: purchase.product?.name ?? sale?.product?.name ?? '',
            unit: purchase.product?.unit ?? sale?.product?.unit ?? null,
            quantity: Number(purchase.quantity),
            purchaseRate: Number(purchase.rate),
            purchaseTotal: Number(purchase.lineTotal),
            mazduriAmount: Number(purchase.mazduriAmount ?? 0),
            saleRate: Number(sale?.rate ?? 0),
            saleTotal: Number(sale?.lineTotal ?? 0),
          };
        });
        setGridRows(rows);
        setMazduriEnabled(rows.some((row) => row.mazduriAmount > 0));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load pending invoice'));
    return () => {
      cancelled = true;
    };
  }, [editInvoiceId, isEditMode]);

  function addToGrid() {
    setError('');
    setMessage('');
    if (!partyAccountId) {
      setError('Select a purchase party');
      return;
    }
    if (!salePartyAccountId) {
      setError('Select a sale party');
      return;
    }
    if (!productId) {
      setError('Select a product');
      return;
    }
    const product = filteredProducts.find((p) => String(p.id) === productId);
    if (!product) {
      setError('Invalid product');
      return;
    }
    const qty = parseNum(quantity);
    const buyRate = parseNum(purchaseRate);
    const sellRate = parseNum(saleRate);
    if (!(qty > 0)) {
      setError('Quantity must be greater than zero');
      return;
    }
    if (!(buyRate > 0)) {
      setError('Purchase rate must be greater than zero');
      return;
    }
    if (!(sellRate > 0)) {
      setError('Sale rate must be greater than zero');
      return;
    }
    const maz = mazduriEnabled ? Math.max(0, parseNum(mazduriAmount)) : 0;
    setGridRows((rows) => [
      ...rows,
      {
        key: `${Date.now()}-${product.id}`,
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        quantity: qty,
        purchaseRate: buyRate,
        purchaseTotal: roundMoney(qty * buyRate),
        mazduriAmount: roundMoney(maz),
        saleRate: sellRate,
        saleTotal: roundMoney(qty * sellRate),
      },
    ]);
    setProductId('');
    setQuantity('');
    setPurchaseRate('');
    setSaleRate('');
    setMazduriAmount('');
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!partyAccountId) {
      setError('Select a purchase party');
      return;
    }
    if (!salePartyAccountId) {
      setError('Select a sale party');
      return;
    }
    if (gridRows.length === 0) {
      setError('Add at least one line to the grid');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        invoiceDate,
        partyAccountId: Number(partyAccountId),
        salePartyAccountId: Number(salePartyAccountId),
        billNo: billNo.trim() || undefined,
        tafseel: tafseel.trim() || undefined,
        lines: gridRows.map((row) => ({
          productId: row.productId,
          quantity: row.quantity,
          purchaseRate: row.purchaseRate,
          saleRate: row.saleRate,
          mazduriAmount: row.mazduriAmount > 0 ? row.mazduriAmount : undefined,
        })),
      };
      const result = isEditMode
        ? await api.updatePendingGeneralTradeInvoice(editInvoiceId, payload)
        : await api.createGeneralTradeInvoice(payload);
      if (isEditMode) {
        navigate('/approvals');
        return;
      }
      setMessage(`Invoice ${result.reference} submitted for approval.`);
      setGridRows([]);
      setMazduriEnabled(false);
      const refRow = await api.getNextGeneralTradeReference();
      setPredictedRef(refRow.reference);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell
      centerTitle
      invoiceTitleBand
      title="General Trade"
      className="app-page--general-trade"
    >
      <div ref={trapRef}>
        <Panel className="inv-form-panel mx-auto w-full overflow-visible bg-white">
          <form className="space-y-4" onSubmit={onSave}>
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <FieldLabel>Invoice #</FieldLabel>
                <TextInput value={predictedRef} readOnly />
              </div>
              <div>
                <FieldLabel>Date</FieldLabel>
                <DateField
                  ref={dateRef}
                  value={invoiceDate}
                  onChange={setInvoiceDate}
                  required
                />
              </div>
              <div>
                <FieldLabel>Bill No</FieldLabel>
                <TextInput value={billNo} onChange={(e) => setBillNo(e.target.value)} />
              </div>
              <div>
                <FieldLabel>Tafseel</FieldLabel>
                <TextInput value={tafseel} onChange={(e) => setTafseel(e.target.value)} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-border border-l-4 border-l-ledgerCredit bg-surface1/40 p-3">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ledgerCredit">
                  Purchase
                </h3>
                <div className="space-y-3">
                  <div>
                    <FieldLabel>Purchase Party</FieldLabel>
                    <SearchSelect
                      value={partyAccountId}
                      onChange={setPartyAccountId}
                      options={purchasePartyOptions}
                      placeholder="Search purchase party…"
                      disabled={partiesLocked}
                    />
                  </div>
                  <div>
                    <FieldLabel>Purchase Rate</FieldLabel>
                    <TextInput
                      type="number"
                      min="0"
                      step="any"
                      value={purchaseRate}
                      onChange={(e) => setPurchaseRate(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-border border-l-4 border-l-ledgerDebit bg-surface1/40 p-3">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ledgerDebit">
                  Sale
                </h3>
                <div className="space-y-3">
                  <div>
                    <FieldLabel>Sale Party</FieldLabel>
                    <SearchSelect
                      value={salePartyAccountId}
                      onChange={setSalePartyAccountId}
                      options={salePartyOptions}
                      placeholder="Search sale party…"
                      disabled={partiesLocked}
                    />
                  </div>
                  <div>
                    <FieldLabel>Sale Rate</FieldLabel>
                    <TextInput
                      type="number"
                      min="0"
                      step="any"
                      value={saleRate}
                      onChange={(e) => setSaleRate(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
            {partiesLocked ? (
              <p className="text-xs text-textMuted">
                Parties apply to the whole invoice. Remove all grid lines to change them.
              </p>
            ) : (
              <p className="text-xs text-textMuted">Parties apply to the whole invoice.</p>
            )}

            <div className="rounded-md border border-border bg-surface1/40 p-3">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-textSecondary">
                Line details
              </h3>
              <div className="grid gap-3 md:grid-cols-5 md:items-end">
                <div className="md:col-span-2">
                  <FieldLabel>Product category</FieldLabel>
                  <SearchSelect
                    value={productCategoryId}
                    onChange={(id) => {
                      setProductCategoryId(id);
                      setProductId('');
                    }}
                    options={productCategories.map((c) => ({
                      value: String(c.id),
                      label: c.name,
                    }))}
                    placeholder="All categories…"
                  />
                </div>
                <div className="md:col-span-2">
                  <FieldLabel>Product</FieldLabel>
                  <SearchSelect
                    value={productId}
                    onChange={setProductId}
                    options={productOptions}
                    placeholder="Search product…"
                  />
                </div>
                <div>
                  <FieldLabel>Qty</FieldLabel>
                  <TextInput
                    type="number"
                    min="0"
                    step="any"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={mazduriEnabled}
                  onChange={(e) => setMazduriEnabled(e.target.checked)}
                />
                Apply Mazduri
              </label>
              {mazduriEnabled ? (
                <div className="mt-2 max-w-xs">
                  <FieldLabel>Mazduri amount</FieldLabel>
                  <TextInput
                    type="number"
                    min="0"
                    step="0.01"
                    value={mazduriAmount}
                    onChange={(e) => setMazduriAmount(e.target.value)}
                  />
                </div>
              ) : null}
              <div className="mt-3">
                <FinancialButton type="button" onClick={addToGrid}>
                  Add to grid
                </FinancialButton>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-textSecondary">
                Trade grid
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-textSecondary">
                      <th className="py-2 pr-3">Product</th>
                      <th className="py-2 pr-3 text-right">Qty</th>
                      <th className="py-2 pr-3 text-right">Buy rate</th>
                      <th className="py-2 pr-3 text-right">Buy total</th>
                      {showMazduriColumn ? (
                        <th className="py-2 pr-3 text-right">Mazduri</th>
                      ) : null}
                      <th className="py-2 pr-3 text-right">Sale rate</th>
                      <th className="py-2 pr-3 text-right">Sale total</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {gridRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={showMazduriColumn ? 8 : 7}
                          className="py-6 text-center text-textSecondary"
                        >
                          No lines yet — set parties, rates, and line details above, then add.
                        </td>
                      </tr>
                    ) : (
                      gridRows.map((row) => (
                        <tr key={row.key} className="border-b border-border/60">
                          <td className="py-2 pr-3">
                            {row.productName}
                            {row.unit ? ` (${row.unit})` : ''}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">{row.quantity}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {formatLedgerAmount(row.purchaseRate)}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {formatLedgerAmount(row.purchaseTotal)}
                          </td>
                          {showMazduriColumn ? (
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {formatLedgerAmount(row.mazduriAmount)}
                            </td>
                          ) : null}
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {formatLedgerAmount(row.saleRate)}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {formatLedgerAmount(row.saleTotal)}
                          </td>
                          <td className="py-2 text-right">
                            <button
                              type="button"
                              className="text-sm text-danger"
                              onClick={() =>
                                setGridRows((rows) => rows.filter((r) => r.key !== row.key))
                              }
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-textSecondary">
                <p>
                  Purchase goods: <strong>{formatLedgerAmount(purchaseGoodsTotal)}</strong>
                </p>
                <p>
                  Sale total: <strong>{formatLedgerAmount(saleGoodsTotal)}</strong>
                </p>
              </div>
              <div className="flex gap-2">
                <SecondaryButton type="button" onClick={() => navigate('/')}>
                  Close
                </SecondaryButton>
                <SecondaryButton
                  type="button"
                  onClick={() =>
                    minimize(
                      {
                        predictedRef,
                        invoiceDate,
                        billNo,
                        tafseel,
                        partyAccountId,
                        salePartyAccountId,
                        productCategoryId,
                        productId,
                        quantity,
                        purchaseRate,
                        saleRate,
                        mazduriEnabled,
                        mazduriAmount,
                        gridRows,
                      },
                      predictedRef || 'General Trade',
                    )
                  }
                >
                  Minimize
                </SecondaryButton>
                <FinancialButton type="submit" disabled={saving}>
                  {saving ? 'Saving…' : isEditMode ? 'Update' : 'Save invoice'}
                </FinancialButton>
              </div>
            </div>

            {error ? <p className="text-sm text-danger">{error}</p> : null}
            {message ? <p className="text-sm text-success">{message}</p> : null}
          </form>
        </Panel>
      </div>
    </PageShell>
  );
}
