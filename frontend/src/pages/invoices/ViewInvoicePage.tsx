import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { INVOICE_TYPE_LABELS } from '../../config/navigation';
import { ApiRequestError, api, type InvoiceDetail, type SystemPreferences } from '../../lib/api';
import { buildInvoiceReference, type InvoiceTypeKey } from '../../lib/invoiceReference';
import { FieldLabel, FinancialButton, PageShell, Panel, SecondaryButton, TextInput } from '../../components/ui/PageShell';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { InvoiceBillView } from './InvoiceBillView';

const INVOICE_TYPE_OPTIONS = (Object.keys(INVOICE_TYPE_LABELS) as InvoiceTypeKey[]).map((key) => ({
  value: key,
  label: INVOICE_TYPE_LABELS[key]!,
}));

function isInvoiceTypeKey(value: string): value is InvoiceTypeKey {
  return value in INVOICE_TYPE_PREFIX_CHECK;
}

const INVOICE_TYPE_PREFIX_CHECK: Record<string, true> = {
  SALE_COMMISSION: true,
  SALE_PAUNCH: true,
  PURCHASE_MAAL: true,
  KACHI_MAAL: true,
  PURCHASE_GENERAL: true,
  SALE_GENERAL: true,
  GENERAL_TRADE: true,
};

function isInvoiceNotFoundError(err: unknown): boolean {
  if (err instanceof ApiRequestError && err.status === 404) return true;
  const message = err instanceof Error ? err.message : String(err ?? '');
  const lower = message.toLowerCase();
  return (
    lower.includes('no invoice found')
    || lower.includes('invoice not found')
    || (lower.includes('not found') && lower.includes('invoice'))
  );
}

export function ViewInvoicePage() {
  const [searchParams] = useSearchParams();
  const printRef = useRef<HTMLDivElement>(null);
  const autoFetchedKey = useRef<string | null>(null);

  const paramType = searchParams.get('type') ?? '';
  const paramNumber = searchParams.get('number') ?? '';
  const paramId = searchParams.get('id') ?? '';
  const wantAutoPrint = searchParams.get('autoprint') === '1';
  const initialType = isInvoiceTypeKey(paramType) ? paramType : 'KACHI_MAAL';
  const initialNumber = /^\d+$/.test(paramNumber) ? paramNumber : '';

  const [invoiceType, setInvoiceType] = useState<InvoiceTypeKey>(initialType);
  const [invoiceNumber, setInvoiceNumber] = useState(initialNumber);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [prefs, setPrefs] = useState<SystemPreferences | null>(null);
  const [notFoundRef, setNotFoundRef] = useState<string | null>(null);
  const [error, setError] = useState('');
  const autoPrintDone = useRef(false);

  const fetchInvoiceById = useCallback(async (id: number) => {
    setError('');
    setNotFoundRef(null);
    setInvoice(null);
    setPrefs(null);
    setLoading(true);
    try {
      const [row, systemPrefs] = await Promise.all([
        api.getInvoice(id),
        api.getSystemPreferences(),
      ]);
      setInvoice(row);
      setPrefs(systemPrefs);
      if (isInvoiceTypeKey(row.type)) setInvoiceType(row.type);
      const numMatch = /-(\d+)$/.exec(row.reference ?? '');
      if (numMatch) setInvoiceNumber(String(parseInt(numMatch[1]!, 10)));
    } catch (err) {
      if (isInvoiceNotFoundError(err)) {
        setNotFoundRef(`id:${id}`);
      } else {
        setError(err instanceof Error ? err.message : 'Lookup failed');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInvoice = useCallback(async (type: InvoiceTypeKey, numberText: string) => {
    setError('');
    setNotFoundRef(null);
    setInvoice(null);
    setPrefs(null);

    const num = parseInt(numberText.trim(), 10);
    if (!Number.isFinite(num) || num < 1) {
      setError('Enter a valid invoice number (1 or greater).');
      return;
    }

    const reference = buildInvoiceReference(type, num);
    setLoading(true);
    try {
      const [row, systemPrefs] = await Promise.all([
        api.getInvoiceByReference(reference),
        api.getSystemPreferences(),
      ]);
      setInvoice(row);
      setPrefs(systemPrefs);
    } catch (err) {
      if (isInvoiceNotFoundError(err)) {
        setNotFoundRef(reference);
      } else {
        setError(err instanceof Error ? err.message : 'Lookup failed');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (/^\d+$/.test(paramId)) {
      const key = `id:${paramId}`;
      if (autoFetchedKey.current === key) return;
      autoFetchedKey.current = key;
      void fetchInvoiceById(parseInt(paramId, 10));
      return;
    }
    if (!isInvoiceTypeKey(paramType) || !/^\d+$/.test(paramNumber)) return;
    const key = `${paramType}:${paramNumber}`;
    if (autoFetchedKey.current === key) return;
    autoFetchedKey.current = key;
    setInvoiceType(paramType);
    setInvoiceNumber(paramNumber);
    void fetchInvoice(paramType, paramNumber);
  }, [paramType, paramNumber, paramId, fetchInvoice, fetchInvoiceById]);

  useEffect(() => {
    autoPrintDone.current = false;
  }, [paramType, paramNumber, paramId, wantAutoPrint]);

  useEffect(() => {
    if (!wantAutoPrint || loading || !invoice || autoPrintDone.current) return;
    autoPrintDone.current = true;
    const timer = window.setTimeout(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [wantAutoPrint, loading, invoice]);

  async function onFetch(event: FormEvent) {
    event.preventDefault();
    await fetchInvoice(invoiceType, invoiceNumber);
  }

  async function onDownloadPdf() {
    if (!printRef.current || !invoice) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, imgHeight);
      pdf.save(`${invoice.reference}.pdf`);
    } catch {
      setError('PDF export failed. Try again.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <PageShell title="View Invoice" subtitle="Look up a bill by type and number (posted or pending)">
      <Panel className="mb-6 print:hidden">
        <form onSubmit={onFetch} className="flex flex-wrap items-end gap-4">
          <div className="min-w-[220px] flex-1">
            <FieldLabel>Invoice type</FieldLabel>
            <SearchSelect
              value={invoiceType}
              onChange={(v) => setInvoiceType(v as InvoiceTypeKey)}
              options={INVOICE_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              placeholder="Select type…"
            />
          </div>
          <div className="w-full min-w-[120px] max-w-[160px]">
            <FieldLabel>Invoice number</FieldLabel>
            <TextInput
              type="number"
              min={1}
              step={1}
              required
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="e.g. 3"
            />
          </div>
          <FinancialButton type="submit" disabled={loading} className="px-6">
            {loading ? 'Fetching…' : 'Fetch'}
          </FinancialButton>
        </form>
        {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
        {notFoundRef ? (
          <p className="mt-4 text-sm text-textSecondary">
            No invoice found for <strong className="text-textPrimary">{notFoundRef}</strong>.
          </p>
        ) : null}
      </Panel>

      {invoice ? (
        <div className="space-y-4">
          <div className="flex justify-end print:hidden">
            <SecondaryButton type="button" disabled={downloading} onClick={onDownloadPdf}>
              {downloading ? 'Generating PDF…' : 'Download PDF'}
            </SecondaryButton>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface2 p-4">
            <div ref={printRef} className="mx-auto w-[800px] max-w-full shadow-sm">
              <InvoiceBillView invoice={invoice} prefs={prefs} />
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
