import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Info } from 'lucide-react';
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

type GridRow = {
  key: string;
  productId: number;
  productName: string;
  unit: string | null;
  quantity: number;
  rate: number;
  lineTotal: number;
};

type Draft = {
  predictedRef: string;
  invoiceDate: string;
  billNo: string;
  tafseel: string;
  salePartyAccountId: string;
  productCategoryId: string;
  productId: string;
  quantity: string;
  rate: string;
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

export function SaleGeneralInvoicePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editInvoiceId = Number(searchParams.get('editInvoiceId') ?? 0);
  const isEditMode = editInvoiceId > 0;
  const { restoredState, minimize } = useMinimizableForm<Draft>('sale-general');
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
  const [salePartyAccountId, setSalePartyAccountId] = useState(
    () => restoredState?.salePartyAccountId ?? '',
  );
  const [productCategoryId, setProductCategoryId] = useState(
    () => restoredState?.productCategoryId ?? '',
  );
  const [productId, setProductId] = useState(() => restoredState?.productId ?? '');
  const [quantity, setQuantity] = useState(() => restoredState?.quantity ?? '');
  const [rate, setRate] = useState(() => restoredState?.rate ?? '');

  const partyOptions = useMemo(
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

  const selectedProduct = useMemo(
    () => filteredProducts.find((p) => String(p.id) === productId) ?? null,
    [filteredProducts, productId],
  );

  const productInfoTooltip = useMemo(() => {
    if (!selectedProduct) return '';
    const unit = selectedProduct.unit?.trim() || 'unit';
    const stockRaw = selectedProduct.quantityOnHand;
    const stockN = stockRaw == null || stockRaw === '' ? 0 : Number(stockRaw);
    const stockLabel = Number.isFinite(stockN)
      ? `Stock: ${Number.isInteger(stockN) ? String(stockN) : formatLedgerAmount(stockN)} ${unit}`
      : 'Stock: —';
    if (selectedProduct.averageCost == null || selectedProduct.averageCost === '') {
      return `${stockLabel}\nNo cost data yet`;
    }
    const cost = Number(selectedProduct.averageCost);
    if (!Number.isFinite(cost)) return `${stockLabel}\nNo cost data yet`;
    return `${stockLabel}\nAvg. Cost: Rs. ${formatLedgerAmount(cost)}/${unit}`;
  }, [selectedProduct]);

  const [rateInfoOpen, setRateInfoOpen] = useState(false);

  const invoiceTotal = useMemo(
    () => roundMoney(gridRows.reduce((s, r) => s + r.lineTotal, 0)),
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
      const refRow = await api.getNextSaleGeneralReference();
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
        setSalePartyAccountId(String(record.salePartyAccountId ?? ''));
        setGridRows((record.generalSaleLines ?? []).map((line, index) => ({
          key: `edit-${line.id ?? index}`,
          productId: Number(line.productId),
          productName: line.product?.name ?? '',
          unit: line.product?.unit ?? null,
          quantity: Number(line.quantity),
          rate: Number(line.rate),
          lineTotal: Number(line.lineTotal),
        })));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load pending invoice'));
    return () => {
      cancelled = true;
    };
  }, [editInvoiceId, isEditMode]);

  function addToGrid() {
    setError('');
    setMessage('');
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
    const rt = parseNum(rate);
    if (!(qty > 0) || !(rt > 0)) {
      setError('Quantity and rate must be greater than zero');
      return;
    }
    setGridRows((rows) => [
      ...rows,
      {
        key: `${Date.now()}-${product.id}`,
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        quantity: qty,
        rate: rt,
        lineTotal: roundMoney(qty * rt),
      },
    ]);
    setProductId('');
    setQuantity('');
    setRate('');
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
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
        salePartyAccountId: Number(salePartyAccountId),
        billNo: billNo.trim() || undefined,
        tafseel: tafseel.trim() || undefined,
        lines: gridRows.map((row) => ({
          productId: row.productId,
          quantity: row.quantity,
          rate: row.rate,
        })),
      };
      const result = isEditMode
        ? await api.updatePendingSaleGeneralInvoice(editInvoiceId, payload)
        : await api.createSaleGeneralInvoice(payload);
      if (isEditMode) {
        navigate('/approvals');
        return;
      }
      setMessage(`Invoice ${result.reference} submitted for approval.`);
      setGridRows([]);
      const refRow = await api.getNextSaleGeneralReference();
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
      title="Sale Invoice (General)"
      className="app-page--sale-general"
    >
      <div ref={trapRef}>
        <Panel>
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
                <FieldLabel>Sale party</FieldLabel>
                <SearchSelect
                  value={salePartyAccountId}
                  onChange={setSalePartyAccountId}
                  options={partyOptions}
                  placeholder="Search Int / Ext / Sale Party…"
                />
              </div>
            </div>

            <div>
              <FieldLabel>Tafseel</FieldLabel>
              <TextInput value={tafseel} onChange={(e) => setTafseel(e.target.value)} />
            </div>

            <div className="rounded-lg border border-border p-3">
              <div className="grid gap-3 md:grid-cols-6 md:items-end">
                <div>
                  <FieldLabel>Category</FieldLabel>
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
                <div>
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className="app-field-label-text text-sm font-medium text-textPrimary">Rate</span>
                    {selectedProduct && productInfoTooltip ? (
                      <span className="relative inline-flex">
                        <button
                          type="button"
                          className="rounded p-0.5 text-textMuted hover:bg-surface1 hover:text-textPrimary"
                          title={productInfoTooltip}
                          aria-label={productInfoTooltip.replace(/\n/g, '. ')}
                          onClick={() => setRateInfoOpen((open) => !open)}
                          onBlur={() => setRateInfoOpen(false)}
                        >
                          <Info className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        {rateInfoOpen ? (
                          <span
                            role="tooltip"
                            className="absolute left-0 top-full z-20 mt-1 w-max max-w-[14rem] whitespace-pre-line rounded-md border border-border bg-surface2 px-2.5 py-1.5 text-xs text-textSecondary shadow-sm"
                          >
                            {productInfoTooltip}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                  <TextInput
                    type="number"
                    min="0"
                    step="any"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                  />
                </div>
                <div>
                  <FinancialButton type="button" onClick={addToGrid}>
                    Add to grid
                  </FinancialButton>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-textSecondary">
                    <th className="py-2 pr-3">Product</th>
                    <th className="py-2 pr-3 text-right">Qty</th>
                    <th className="py-2 pr-3 text-right">Rate</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {gridRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-textSecondary">
                        No lines yet — add products above.
                      </td>
                    </tr>
                  ) : (
                    gridRows.map((row) => (
                      <tr key={row.key} className="border-b border-border/60">
                        <td className="py-2 pr-3">
                          {row.productName}
                          {row.unit ? ` (${row.unit})` : ''}
                        </td>
                        <td className="py-2 pr-3 text-right">{row.quantity}</td>
                        <td className="py-2 pr-3 text-right">{formatLedgerAmount(row.rate)}</td>
                        <td className="py-2 pr-3 text-right">{formatLedgerAmount(row.lineTotal)}</td>
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

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-textSecondary">
                Invoice total: <strong>{formatLedgerAmount(invoiceTotal)}</strong>
              </p>
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
                        salePartyAccountId,
                        productCategoryId,
                        productId,
                        quantity,
                        rate,
                        gridRows,
                      },
                      predictedRef || 'Sale General',
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
