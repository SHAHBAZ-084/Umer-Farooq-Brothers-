import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  InvoiceAddRowAction,
  InvoiceField,
  InvoiceFieldGroup,
  InvoiceFieldRow,
  InvoiceFieldStack,
  InvoiceFormFooter,
  InvoiceFormSection,
  InvoiceHeaderRow,
  InvoiceReadOnlyField,
  InvoiceToggleField,
} from '../../components/invoices/InvoiceFormLayout';
import { DateField } from '../../components/ui/DateField';
import {
  FieldLabel,
  PageShell,
  Panel,
  TextInput,
} from '../../components/ui/PageShell';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useMinimizableForm } from '../../hooks/useMinimizableForm';
import { api, Account, AccountCategory, Product, SystemPreferences, type InvoiceDetail } from '../../lib/api';
import { formatLedgerAmount } from '../../lib/format';
import { invoiceLoadErrorMessage, loadInvoiceFormBase } from '../../lib/invoiceFormLoad';
import { InvoicePreviewGridShell } from './InvoicePreviewGrid';
import {
  computeSalePaunchInvoiceTotals,
  computeSalePaunchRow,
  MAAL_KHATA_CATEGORIES,
  parseNum,
  SALE_PARTY_CATEGORIES,
} from '../../lib/salePaunchCalculations';

type BoriThelaMode = 'BORI' | 'THELA';

type GridRow = {
  clientId: string;
  maalKhataAccountId: number;
  maalKhataName: string;
  boriOrThelaMode: BoriThelaMode;
  bagCount: number;
  thelaCount: number;
  compWeightKg: number;
  kaatKg: number;
  totalWeightKg: number;
  netWeightKg: number;
  upperRatePerMaund: number;
  dammiChecked: boolean;
  bardanaQty: number | null;
  bardanaRate: number | null;
  maunds: number;
  upperAmount: number;
  kanta: number;
  netUpperAmount: number;
  dammiAmount: number;
  bardanaAmount: number | null;
};

type SalePaunchDraft = {
  predictedRef: string;
  gridRows: GridRow[];
  invoiceDate: string;
  productId: string;
  jins: string;
  billNo: string;
  gariNo: string;
  tafseel: string;
  maalKhataAccountId: string;
  boriOrThelaMode: BoriThelaMode;
  bagCount: string;
  compWeightKg: string;
  kaatKg: string;
  kanta: string;
  upperRatePerMaund: string;
  rowBardanaQty: string;
  rowBardanaRate: string;
  dammiChecked: boolean;
  salePartyAccountId: string;
  lowerRatePerMaund: string;
  lowerKaatKg: string;
  taxAmount: string;
  miscAmount: string;
  biltyKirayaAmount: string;
  lowerBoriThela: BoriThelaMode;
  lowerBardanaQty: string;
  lowerBardanaRate: string;
};

function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) return todayInputValue();
  return String(value).slice(0, 10);
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

function FlatAccountSelect({
  label,
  categoryNames,
  categories,
  accounts,
  value,
  onChange,
  placeholder = 'Search account…',
}: {
  label: string;
  categoryNames: readonly string[];
  categories: AccountCategory[];
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const options = flatAccountOptions(categories, accounts, categoryNames);
  return (
    <>
      <FieldLabel>{label}</FieldLabel>
      <SearchSelect value={value} onChange={onChange} options={options} placeholder={placeholder} />
    </>
  );
}

export function SalePaunchInvoicePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editInvoiceId = Number(searchParams.get('editInvoiceId') ?? 0);
  const isEditMode = editInvoiceId > 0;
  const { restoredState, minimize } = useMinimizableForm<SalePaunchDraft>('sale-paunch');
  const keepRestoredPredictedRef = useRef(Boolean(restoredState?.predictedRef) || isEditMode);
  const trapRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  useFocusTrap(trapRef, { initialFocusRef: dateRef });

  const [categories, setCategories] = useState<AccountCategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [prefs, setPrefs] = useState<SystemPreferences | null>(null);
  const [predictedRef, setPredictedRef] = useState(() => restoredState?.predictedRef ?? '');
  const [gridRows, setGridRows] = useState<GridRow[]>(() => restoredState?.gridRows ?? []);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [invoiceDate, setInvoiceDate] = useState(() => restoredState?.invoiceDate ?? todayInputValue());
  const [productId, setProductId] = useState(() => restoredState?.productId ?? '');
  const [jins, setJins] = useState(() => restoredState?.jins ?? '');
  const [billNo, setBillNo] = useState(() => restoredState?.billNo ?? '');
  const [gariNo, setGariNo] = useState(() => restoredState?.gariNo ?? '');
  const [tafseel, setTafseel] = useState(() => restoredState?.tafseel ?? '');

  const [maalKhataAccountId, setMaalKhataAccountId] = useState(() => restoredState?.maalKhataAccountId ?? '');
  const [boriOrThelaMode, setBoriOrThelaMode] = useState<BoriThelaMode>(() => restoredState?.boriOrThelaMode ?? 'BORI');
  const [bagCount, setBagCount] = useState(() => restoredState?.bagCount ?? '');
  const [compWeightKg, setCompWeightKg] = useState(() => restoredState?.compWeightKg ?? '');
  const [kaatKg, setKaatKg] = useState(() => restoredState?.kaatKg ?? '');
  const [kanta, setKanta] = useState(() => restoredState?.kanta ?? '');
  const [upperRatePerMaund, setUpperRatePerMaund] = useState(() => restoredState?.upperRatePerMaund ?? '');
  const [rowBardanaQty, setRowBardanaQty] = useState(() => restoredState?.rowBardanaQty ?? '');
  const [rowBardanaRate, setRowBardanaRate] = useState(() => restoredState?.rowBardanaRate ?? '');
  const [dammiChecked, setDammiChecked] = useState(() => restoredState?.dammiChecked ?? false);

  const [salePartyAccountId, setSalePartyAccountId] = useState(() => restoredState?.salePartyAccountId ?? '');
  const [lowerRatePerMaund, setLowerRatePerMaund] = useState(() => restoredState?.lowerRatePerMaund ?? '');
  const [lowerKaatKg, setLowerKaatKg] = useState(() => restoredState?.lowerKaatKg ?? '');
  const [taxAmount, setTaxAmount] = useState(() => restoredState?.taxAmount ?? '');
  const [miscAmount, setMiscAmount] = useState(() => restoredState?.miscAmount ?? '');
  const [biltyKirayaAmount, setBiltyKirayaAmount] = useState(() => restoredState?.biltyKirayaAmount ?? '');
  const [lowerBoriThela, setLowerBoriThela] = useState<BoriThelaMode>(() => restoredState?.lowerBoriThela ?? 'BORI');
  const [lowerBardanaQty, setLowerBardanaQty] = useState(() => restoredState?.lowerBardanaQty ?? '');
  const [lowerBardanaRate, setLowerBardanaRate] = useState(() => restoredState?.lowerBardanaRate ?? '');

  const reload = useCallback(async () => {
    const base = await loadInvoiceFormBase({ includeProducts: true });
    setAccounts(base.accounts);
    setCategories(base.categories);
    setPrefs(base.prefs);
    setProducts(base.products ?? []);
    if (isEditMode) return;
    try {
      const refRow = await api.getNextSalePaunchReference();
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
        const productName = String(record.jins ?? '');
        setPredictedRef(String(record.reference ?? ''));
        setInvoiceDate(toDateInputValue(record.invoiceDate as string | null | undefined));
        setJins(productName);
        setProductId(record.productId ? String(record.productId) : String(products.find((p) => p.name === productName)?.id ?? ''));
        setBillNo(String(record.billNo ?? ''));
        setGariNo(String(record.gariNo ?? ''));
        setTafseel(String(record.tafseel ?? record.notes ?? ''));
        setSalePartyAccountId(String(record.salePartyAccountId ?? record.debitAccountId ?? ''));
        setTaxAmount(record.taxAmount != null ? String(record.taxAmount) : '');
        setMiscAmount(record.miscAmount != null ? String(record.miscAmount) : '');
        setBiltyKirayaAmount(record.biltyKirayaAmount != null ? String(record.biltyKirayaAmount) : '');
        setLowerBoriThela((record.lowerBardanaMode as BoriThelaMode | null) ?? 'BORI');
        setLowerBardanaQty(record.lowerBardanaQty != null ? String(record.lowerBardanaQty) : '');
        setLowerBardanaRate(record.lowerBardanaRate != null ? String(record.lowerBardanaRate) : '');
        const firstLine = record.salePaunchLines?.[0];
        setLowerRatePerMaund(firstLine?.lowerRatePerMaund != null ? String(firstLine.lowerRatePerMaund) : '');
        setLowerKaatKg(firstLine?.lowerKaatKg != null ? String(firstLine.lowerKaatKg) : '');
        setGridRows((record.salePaunchLines ?? []).map((line, index) => {
          const raw = line as typeof line & { maalKhataAccountId?: number };
          const accountId = Number(line.maalKhataAccount?.id ?? raw.maalKhataAccountId);
          return {
            clientId: `edit-${line.id ?? index}`,
            maalKhataAccountId: accountId,
            maalKhataName: line.maalKhataAccount?.name ?? accounts.find((a) => a.id === accountId)?.name ?? '',
            boriOrThelaMode: line.boriOrThelaMode,
            bagCount: Number(line.bagCount),
            thelaCount: Number(line.thelaCount ?? 0),
            compWeightKg: Number(line.totalWeightKg),
            kaatKg: Number(line.kaatKg),
            totalWeightKg: Number(line.totalWeightKg),
            netWeightKg: Number(line.netWeightKg),
            upperRatePerMaund: Number(line.upperRatePerMaund),
            dammiChecked: Boolean(line.dammiChecked),
            bardanaQty: line.bardanaQty != null ? Number(line.bardanaQty) : null,
            bardanaRate: line.bardanaRate != null ? Number(line.bardanaRate) : null,
            maunds: Number(line.netWeightKg) / 40,
            upperAmount: Number(line.upperAmount),
            kanta: Number(line.kanta),
            netUpperAmount: Number(line.netUpperAmount),
            dammiAmount: Number(line.dammiAmount ?? 0),
            bardanaAmount: line.bardanaAmount != null ? Number(line.bardanaAmount) : null,
          };
        }));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load pending invoice'));
    return () => {
      cancelled = true;
    };
  }, [accounts, editInvoiceId, isEditMode, products]);

  const productOptions = useMemo(
    () => products.map((p) => ({ value: String(p.id), label: p.name })),
    [products],
  );

  function onProductChange(id: string) {
    setProductId(id);
    const product = products.find((p) => String(p.id) === id);
    setJins(product?.name ?? '');
  }

  const prefRates = useMemo(
    () => ({
      daamiPercent: prefs?.daamiPercent ?? 0,
    }),
    [prefs],
  );

  const entryPreview = useMemo(() => {
    const input = {
      bagCount: boriOrThelaMode === 'BORI' ? parseNum(bagCount) : 0,
      thelaCount: boriOrThelaMode === 'THELA' ? parseNum(bagCount) : 0,
      compWeightKg: parseNum(compWeightKg),
      kaatKg: kaatKg.trim() ? parseNum(kaatKg) : 0,
      upperRatePerMaund: parseNum(upperRatePerMaund),
      kanta: kanta.trim() ? parseNum(kanta) : 0,
      bardanaQty: rowBardanaQty.trim() ? parseNum(rowBardanaQty) : null,
      bardanaRate: rowBardanaRate.trim() ? parseNum(rowBardanaRate) : null,
      dammiChecked,
    };
    return computeSalePaunchRow(input, prefRates);
  }, [
    bagCount,
    boriOrThelaMode,
    compWeightKg,
    kaatKg,
    upperRatePerMaund,
    kanta,
    rowBardanaQty,
    rowBardanaRate,
    dammiChecked,
    prefRates,
  ]);

  const invoiceTotals = useMemo(() => {
    const lowerRate = lowerRatePerMaund.trim() ? parseNum(lowerRatePerMaund) : 0;
    const lowerKaat = lowerKaatKg.trim() ? parseNum(lowerKaatKg) : 0;
    const computedRows = gridRows.map((row) =>
      computeSalePaunchRow(
        {
          bagCount: row.bagCount,
          thelaCount: row.thelaCount,
          compWeightKg: row.compWeightKg,
          kaatKg: row.kaatKg,
          lowerKaatKg: lowerKaat,
          upperRatePerMaund: row.upperRatePerMaund,
          lowerRatePerMaund: lowerRate,
          kanta: row.kanta,
          bardanaQty: row.bardanaQty,
          bardanaRate: row.bardanaRate,
          dammiChecked: row.dammiChecked,
        },
        prefRates,
      ),
    );
    return computeSalePaunchInvoiceTotals(computedRows, {
      taxAmount: taxAmount.trim() ? parseNum(taxAmount) : 0,
      miscAmount: miscAmount.trim() ? parseNum(miscAmount) : 0,
      biltyKirayaAmount: biltyKirayaAmount.trim() ? parseNum(biltyKirayaAmount) : 0,
      lowerBardanaQty: lowerBardanaQty.trim() ? parseNum(lowerBardanaQty) : null,
      lowerBardanaRate: lowerBardanaRate.trim() ? parseNum(lowerBardanaRate) : null,
    });
  }, [
    gridRows,
    lowerRatePerMaund,
    lowerKaatKg,
    taxAmount,
    miscAmount,
    biltyKirayaAmount,
    lowerBardanaQty,
    lowerBardanaRate,
    prefRates,
  ]);

  function addRow() {
    setError('');
    if (!maalKhataAccountId) {
      setError('Select a Maal Khata or Int/Ext Purchase Party account before adding a row');
      return;
    }
    const weight = parseNum(compWeightKg);
    const upperRate = parseNum(upperRatePerMaund);
    if (!(weight > 0)) {
      setError('Computer weight must be greater than zero');
      return;
    }
    if (!(upperRate > 0)) {
      setError('Rate must be greater than zero');
      return;
    }
    const kaat = kaatKg.trim() ? parseNum(kaatKg) : 0;
    if (kaat > weight) {
      setError('Kaat cannot exceed computer weight');
      return;
    }
    if (!(entryPreview.netWeightKg > 0)) {
      setError('Net weight after kaat must be greater than zero');
      return;
    }
    if (!(entryPreview.netUpperAmount > 0)) {
      setError('Net amount must be greater than zero after kanta');
      return;
    }

    const count = parseNum(bagCount);
    const maalKhata = accounts.find((a) => String(a.id) === maalKhataAccountId);
    const row: GridRow = {
      clientId: `${Date.now()}-${Math.random()}`,
      maalKhataAccountId: Number(maalKhataAccountId),
      maalKhataName: maalKhata?.name ?? '',
      boriOrThelaMode,
      bagCount: boriOrThelaMode === 'BORI' ? count : 0,
      thelaCount: boriOrThelaMode === 'THELA' ? count : 0,
      compWeightKg: weight,
      kaatKg: kaat,
      upperRatePerMaund: upperRate,
      dammiChecked,
      bardanaQty: rowBardanaQty.trim() ? parseNum(rowBardanaQty) : null,
      bardanaRate: rowBardanaRate.trim() ? parseNum(rowBardanaRate) : null,
      totalWeightKg: entryPreview.totalWeightKg,
      netWeightKg: entryPreview.netWeightKg,
      maunds: entryPreview.maunds,
      upperAmount: entryPreview.upperAmount,
      kanta: entryPreview.kanta,
      netUpperAmount: entryPreview.netUpperAmount,
      dammiAmount: entryPreview.dammiAmount,
      bardanaAmount: entryPreview.bardanaAmount,
    };
    setGridRows((prev) => [...prev, row]);
    setBagCount('');
    setCompWeightKg('');
    setKaatKg('');
    setKanta('');
    setUpperRatePerMaund('');
    setRowBardanaQty('');
    setRowBardanaRate('');
    setDammiChecked(false);
  }

  function removeRow(clientId: string) {
    setGridRows((prev) => prev.filter((r) => r.clientId !== clientId));
  }

  async function saveInvoice(options: { printAfter: boolean }) {
    setError('');
    setMessage('');
    if (gridRows.length === 0) {
      setError('Add at least one row to the grid');
      return;
    }
    if (!salePartyAccountId) {
      setError('Select a sale party for the debit side');
      return;
    }
    const lowerRate = lowerRatePerMaund.trim() ? parseNum(lowerRatePerMaund) : 0;
    if (!(lowerRate > 0)) {
      setError('Rate must be greater than zero');
      return;
    }
    const lowerKaat = lowerKaatKg.trim() ? parseNum(lowerKaatKg) : 0;
    const overweight = gridRows.find((row) => lowerKaat > row.compWeightKg);
    if (overweight) {
      setError('Kaat cannot exceed computer weight on any row');
      return;
    }
    if (!(invoiceTotals.totalLowerAmount > 0)) {
      setError('Amount must be greater than zero');
      return;
    }
    if (invoiceTotals.totalLowerNetWeightKg <= 0) {
      setError('Net weight after kaat must be greater than zero');
      return;
    }
    if (invoiceTotals.lowerBardanaAmount != null && invoiceTotals.lowerBardanaAmount > 0 && !lowerBoriThela) {
      setError('Select Bori or Thela for bardana');
      return;
    }
    if (!jins.trim()) {
      setError('Select جنس (product) before saving');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        invoiceDate,
        salePartyAccountId: Number(salePartyAccountId),
        billNo: billNo.trim() || undefined,
        gariNo: gariNo.trim() || undefined,
        jins: jins.trim(),
        tafseel: tafseel.trim() || undefined,
        taxAmount: taxAmount.trim() ? parseNum(taxAmount) : undefined,
        miscAmount: miscAmount.trim() ? parseNum(miscAmount) : undefined,
        biltyKirayaAmount: biltyKirayaAmount.trim() ? parseNum(biltyKirayaAmount) : undefined,
        lowerBardanaMode:
          invoiceTotals.lowerBardanaAmount != null && invoiceTotals.lowerBardanaAmount > 0
            ? lowerBoriThela
            : null,
        lowerBardanaQty: lowerBardanaQty.trim() ? parseNum(lowerBardanaQty) : null,
        lowerBardanaRate: lowerBardanaRate.trim() ? parseNum(lowerBardanaRate) : null,
        lines: gridRows.map((row) => ({
          maalKhataAccountId: row.maalKhataAccountId,
          jins: jins.trim(),
          boriOrThelaMode: row.boriOrThelaMode,
          bagCount: row.bagCount,
          thelaCount: row.thelaCount,
          compWeightKg: row.compWeightKg,
          kaatKg: row.kaatKg,
          lowerKaatKg: lowerKaat,
          upperRatePerMaund: row.upperRatePerMaund,
          lowerRatePerMaund: lowerRate,
          kanta: row.kanta,
          bardanaQty: row.bardanaQty,
          bardanaRate: row.bardanaRate,
          dammiChecked: row.dammiChecked,
        })),
      };
      const result = isEditMode
        ? await api.updatePendingSalePaunchInvoice(editInvoiceId, payload)
        : await api.createSalePaunchInvoice(payload);

      if (options.printAfter) {
        const numMatch = /-(\d+)$/.exec(result.reference ?? '');
        const number = numMatch ? parseInt(numMatch[1]!, 10) : NaN;
        if (!Number.isFinite(number) || number < 1) {
          setError('Saved, but could not open print view (missing invoice number).');
          return;
        }
        navigate(`/invoices/view?type=SALE_PAUNCH&number=${number}&autoprint=1`);
        return;
      }

      if (isEditMode) {
        navigate('/approvals');
        return;
      }
      setMessage(`Invoice ${result.reference} posted.`);
      setGridRows([]);
      setSalePartyAccountId('');
      setTaxAmount('');
      setMiscAmount('');
      setBiltyKirayaAmount('');
      setLowerBardanaQty('');
      setLowerBardanaRate('');
      setLowerRatePerMaund('');
      setLowerKaatKg('');
      const refRow = await api.getNextSalePaunchReference();
      setPredictedRef(refRow.reference);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    await saveInvoice({ printAfter: false });
  }

  function handleSaveAndPrint() {
    void saveInvoice({ printAfter: true });
  }

  return (
    <PageShell centerTitle invoiceTitleBand title="Sale on Paunch" className="app-page--sale-paunch">
      <Panel className="inv-form-panel mx-auto w-full overflow-visible bg-white">
        <div ref={trapRef} className="overflow-visible">
          <form onSubmit={onSave} className="space-y-0">
            <InvoiceFormSection>
              <InvoiceHeaderRow>
                <InvoiceField>
                  <FieldLabel>Date</FieldLabel>
                  <DateField ref={dateRef} required value={invoiceDate} onChange={setInvoiceDate} />
                </InvoiceField>
                <InvoiceField>
                  <FieldLabel>Invoice #</FieldLabel>
                  <div className="app-input-static app-input-static--emphasis tabular-nums">{predictedRef || '…'}</div>
                </InvoiceField>
                <InvoiceField>
                  <FieldLabel>جنس</FieldLabel>
                  <SearchSelect
                    value={productId}
                    onChange={onProductChange}
                    options={productOptions}
                    placeholder="Select product…"
                  />
                </InvoiceField>
                <InvoiceField>
                  <FieldLabel>Bill #</FieldLabel>
                  <TextInput value={billNo} onChange={(e) => setBillNo(e.target.value)} />
                </InvoiceField>
                <InvoiceField>
                  <FieldLabel>گاڑی #</FieldLabel>
                  <TextInput value={gariNo} onChange={(e) => setGariNo(e.target.value)} />
                </InvoiceField>
                <InvoiceField>
                  <FieldLabel>تفصیل</FieldLabel>
                  <TextInput value={tafseel} onChange={(e) => setTafseel(e.target.value)} />
                </InvoiceField>
              </InvoiceHeaderRow>
            </InvoiceFormSection>

            <InvoiceFormSection label="Credit Side" labelClassName="text-ledgerCredit">
              <InvoiceFieldStack>
                <InvoiceFieldGroup label="Identity">
                  <InvoiceFieldRow cols={6}>
                    <InvoiceField wide>
                      <FlatAccountSelect
                        label="Line account"
                        categoryNames={MAAL_KHATA_CATEGORIES}
                        categories={categories}
                        accounts={accounts}
                        value={maalKhataAccountId}
                        onChange={setMaalKhataAccountId}
                        placeholder="Search Maal Khata / Int / Ext…"
                      />
                    </InvoiceField>
                    <InvoiceField>
                      <FieldLabel>Bori / Thela</FieldLabel>
                      <SegmentedControl
                        value={boriOrThelaMode}
                        onChange={(v) => setBoriOrThelaMode(v as BoriThelaMode)}
                        options={[
                          { value: 'BORI', label: 'Bori' },
                          { value: 'THELA', label: 'Thela' },
                        ]}
                      />
                    </InvoiceField>
                    <InvoiceField>
                      <FieldLabel>{boriOrThelaMode === 'BORI' ? 'Bori count' : 'Thela count'}</FieldLabel>
                      <TextInput value={bagCount} onChange={(e) => setBagCount(e.target.value)} inputMode="decimal" />
                    </InvoiceField>
                    <InvoiceField>
                      <FieldLabel>Computer Weight (kg)</FieldLabel>
                      <TextInput value={compWeightKg} onChange={(e) => setCompWeightKg(e.target.value)} inputMode="decimal" />
                    </InvoiceField>
                    <InvoiceField>
                      <FieldLabel>کاٹ (kg)</FieldLabel>
                      <TextInput value={kaatKg} onChange={(e) => setKaatKg(e.target.value)} inputMode="decimal" />
                    </InvoiceField>
                    <InvoiceReadOnlyField label="Net weight (kg)" value={entryPreview.netWeightKg} format="number" />
                  </InvoiceFieldRow>
                </InvoiceFieldGroup>

                <InvoiceFieldGroup label="Pricing">
                  <InvoiceFieldRow cols={6}>
                    <InvoiceField>
                      <FieldLabel>ریٹ / من</FieldLabel>
                      <TextInput value={upperRatePerMaund} onChange={(e) => setUpperRatePerMaund(e.target.value)} inputMode="decimal" />
                    </InvoiceField>
                    <InvoiceField>
                      <FieldLabel>کانٹا</FieldLabel>
                      <TextInput value={kanta} onChange={(e) => setKanta(e.target.value)} inputMode="decimal" />
                    </InvoiceField>
                    <InvoiceReadOnlyField label="Net" value={entryPreview.netUpperAmount} />
                    <InvoiceField>
                      <FieldLabel>Bardana qty</FieldLabel>
                      <TextInput value={rowBardanaQty} onChange={(e) => setRowBardanaQty(e.target.value)} inputMode="decimal" />
                    </InvoiceField>
                    <InvoiceField>
                      <FieldLabel>Bardana rate</FieldLabel>
                      <TextInput value={rowBardanaRate} onChange={(e) => setRowBardanaRate(e.target.value)} inputMode="decimal" />
                    </InvoiceField>
                    <InvoiceToggleField
                      label={`Dammi (${prefRates.daamiPercent}%)`}
                      checked={dammiChecked}
                      onChange={setDammiChecked}
                    />
                  </InvoiceFieldRow>
                </InvoiceFieldGroup>

                <InvoiceAddRowAction onClick={addRow} />
              </InvoiceFieldStack>
            </InvoiceFormSection>

            <InvoiceFormSection label="Preview grid">
              <InvoicePreviewGridShell isEmpty={gridRows.length === 0}>
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-surface2">
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-textMuted">
                      <th className="px-3 py-2.5">Maal Khata</th>
                      <th className="px-3 py-2.5 text-right">Bori</th>
                      <th className="px-3 py-2.5 text-right">Thela</th>
                      <th className="px-3 py-2.5 text-right">Comp wt</th>
                      <th className="px-3 py-2.5 text-right">Kaat</th>
                      <th className="px-3 py-2.5 text-right">Net wt</th>
                      <th className="px-3 py-2.5 text-right">Rate</th>
                      <th className="px-3 py-2.5 text-right">Kanta</th>
                      <th className="px-3 py-2.5 text-right">Net</th>
                      <th className="px-3 py-2.5 text-right">Dammi</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {gridRows.map((row) => (
                      <tr key={row.clientId} className="border-b border-border/40">
                        <td className="px-3 py-2">{row.maalKhataName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.bagCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.thelaCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.compWeightKg.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.kaatKg.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.netWeightKg.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatLedgerAmount(row.upperRatePerMaund)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatLedgerAmount(row.kanta)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatLedgerAmount(row.netUpperAmount)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.dammiChecked ? formatLedgerAmount(row.dammiAmount) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" className="text-xs text-danger hover:underline" onClick={() => removeRow(row.clientId)}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </InvoicePreviewGridShell>
            </InvoiceFormSection>

            <InvoiceFormSection label="Debit Side" labelClassName="text-ledgerDebit">
              <InvoiceFieldStack>
                <InvoiceFieldGroup>
                  <InvoiceFieldRow cols={5}>
                    <InvoiceField wide>
                      <FlatAccountSelect
                        label="Debit party"
                        categoryNames={SALE_PARTY_CATEGORIES}
                        categories={categories}
                        accounts={accounts}
                        value={salePartyAccountId}
                        onChange={setSalePartyAccountId}
                        placeholder="Search Int / Ext / Sale Party…"
                      />
                    </InvoiceField>
                    <InvoiceReadOnlyField label="Net total" value={invoiceTotals.totalNetUpperAmount} />
                    <InvoiceReadOnlyField label="Dammi total" value={invoiceTotals.totalDammiAmount} />
                    <InvoiceField>
                      <FieldLabel>کاٹ (kg)</FieldLabel>
                      <TextInput value={lowerKaatKg} onChange={(e) => setLowerKaatKg(e.target.value)} inputMode="decimal" />
                    </InvoiceField>
                    <InvoiceField>
                      <FieldLabel>ریٹ / من</FieldLabel>
                      <TextInput value={lowerRatePerMaund} onChange={(e) => setLowerRatePerMaund(e.target.value)} inputMode="decimal" />
                    </InvoiceField>
                  </InvoiceFieldRow>
                </InvoiceFieldGroup>

                <InvoiceFieldGroup>
                  <InvoiceFieldRow cols={6}>
                    <InvoiceField>
                      <FieldLabel>Bardana</FieldLabel>
                      <SegmentedControl
                        value={lowerBoriThela}
                        onChange={(v) => setLowerBoriThela(v as BoriThelaMode)}
                        options={[
                          { value: 'BORI', label: 'Bori' },
                          { value: 'THELA', label: 'Thela' },
                        ]}
                      />
                    </InvoiceField>
                    <InvoiceField>
                      <FieldLabel>Bardana qty</FieldLabel>
                      <TextInput value={lowerBardanaQty} onChange={(e) => setLowerBardanaQty(e.target.value)} inputMode="decimal" />
                    </InvoiceField>
                    <InvoiceField>
                      <FieldLabel>Bardana rate</FieldLabel>
                      <TextInput value={lowerBardanaRate} onChange={(e) => setLowerBardanaRate(e.target.value)} inputMode="decimal" />
                    </InvoiceField>
                    <InvoiceReadOnlyField label="Net wt (kg)" value={invoiceTotals.totalLowerNetWeightKg} format="number" />
                    <InvoiceReadOnlyField label="Amount" value={invoiceTotals.totalLowerAmount} />
                    <InvoiceReadOnlyField label="Row revenue" value={invoiceTotals.totalRowRevenue} />
                  </InvoiceFieldRow>
                </InvoiceFieldGroup>

                <InvoiceFieldGroup>
                  <InvoiceFieldRow cols={3}>
                    <InvoiceField>
                      <FieldLabel>ٹیکس</FieldLabel>
                      <TextInput value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} inputMode="decimal" />
                    </InvoiceField>
                    <InvoiceField>
                      <FieldLabel>متفرق</FieldLabel>
                      <TextInput value={miscAmount} onChange={(e) => setMiscAmount(e.target.value)} inputMode="decimal" />
                    </InvoiceField>
                    <InvoiceField>
                      <FieldLabel>بلٹی کرایہ</FieldLabel>
                      <TextInput value={biltyKirayaAmount} onChange={(e) => setBiltyKirayaAmount(e.target.value)} inputMode="decimal" />
                    </InvoiceField>
                  </InvoiceFieldRow>
                </InvoiceFieldGroup>
              </InvoiceFieldStack>
              <InvoiceFormFooter
                totalLabel="Debit side total"
                totalValue={invoiceTotals.lowerNetTotal}
                error={error}
                message={message}
                saving={saving}
                primaryLabel={isEditMode ? 'Update' : 'Save invoice'}
                secondaryLabel="Save & Print"
                onSecondary={handleSaveAndPrint}
                onClose={() => navigate('/')}
                onMinimize={() =>
                  minimize(
                    {
                      predictedRef,
                      gridRows,
                      invoiceDate,
                      productId,
                      jins,
                      billNo,
                      gariNo,
                      tafseel,
                      maalKhataAccountId,
                      boriOrThelaMode,
                      bagCount,
                      compWeightKg,
                      kaatKg,
                      kanta,
                      upperRatePerMaund,
                      rowBardanaQty,
                      rowBardanaRate,
                      dammiChecked,
                      salePartyAccountId,
                      lowerRatePerMaund,
                      lowerKaatKg,
                      taxAmount,
                      miscAmount,
                      biltyKirayaAmount,
                      lowerBoriThela,
                      lowerBardanaQty,
                      lowerBardanaRate,
                    },
                    `Sale on Paunch — ${predictedRef || 'draft'}`,
                  )
                }
              />
            </InvoiceFormSection>
          </form>
        </div>
      </Panel>
    </PageShell>
  );
}
