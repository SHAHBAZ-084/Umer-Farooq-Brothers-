import { BILL_TITLES } from '../../config/billPrint';
import type { InvoiceDetail, SystemPreferences } from '../../lib/api';
import { DEFAULT_BUSINESS_INFO, businessInfoFromPrefs } from '../../lib/businessInfo';
import { formatBusinessContactLine } from '../../lib/reportExport';
import {
  computeKachiDeductions,
  computeMaalBillFromTotals,
  computeSalePaunchBillFromTotals,
  formatBillAmount,
  formatBillDate,
  formatBillWeight,
  formatBoriThelaLine,
  formatCommissionBardanaLine,
  invoiceBillDate,
  maalLineToBillRow,
  parseInvoiceDisplayNumber,
  resolveMaalBillFromPartyName,
  resolveSalePaunchBillFromLabel,
  saleCommissionLineToBillRow,
  salePaunchLowerToBillRow,
  salePaunchUpperToBillRow,
  sumCommissionBillRows,
  sumLineAmounts,
  type BillLineRow,
  type CommissionBillRow,
} from '../../lib/billPrintFormat';
import { computePurchaseMaalInvoiceTotals } from '../../lib/purchaseMaalCalculations';
import { computeSaleCommissionInvoiceTotals } from '../../lib/saleCommissionCalculations';

const billFont =
  'font-[Arial,Helvetica,sans-serif] text-[13px] leading-snug text-black lining-nums';

function BillHeader({
  title,
  prefs,
}: {
  title: string;
  prefs?: SystemPreferences | null;
}) {
  const h = prefs ? businessInfoFromPrefs(prefs) : DEFAULT_BUSINESS_INFO;
  return (
    <header className="text-center">
      <h1 className="text-[22px] font-normal underline decoration-1 underline-offset-[3px]">
        {h.businessName}
      </h1>
      <p className="mt-0.5 text-[13px]">Proprietor: {h.proprietorName}</p>
      {h.address?.trim() ? (
        <p className="mt-0.5 whitespace-pre-line text-[11px]">{h.address.trim()}</p>
      ) : null}
      <p className="mt-1 text-[11px]">{formatBusinessContactLine(h)}</p>
      <div className="my-3 border-b border-dashed border-black" />
      <h2 className="text-[15px] font-bold tracking-wide">{title}</h2>
    </header>
  );
}

function MetaRow({
  invoiceNo,
  date,
  billNo,
  gariNo,
}: {
  invoiceNo: string;
  date: string;
  billNo: string;
  gariNo: string;
}) {
  return (
    <div className="mt-4 flex justify-between gap-2 border-b border-black pb-2 text-[12px]">
      <span>
        <span className="underline decoration-1 underline-offset-2">Invoice#</span>
        &nbsp;{invoiceNo}
      </span>
      <span>
        <strong>Date:</strong>&nbsp;{date}
      </span>
      <span>
        <strong>Bill#</strong>&nbsp;{billNo || '—'}
      </span>
      <span>
        <strong>Gari#</strong>&nbsp;{gariNo || '\u00A0'}
      </span>
    </div>
  );
}

function PartyBlock({
  billToLabel,
  partyCode: _partyCode,
  partyName,
  address,
  phone,
  product,
  productInsideBox = false,
}: {
  billToLabel: string;
  partyCode?: string;
  partyName: string;
  address?: string | null;
  phone?: string | null;
  product: string;
  /** When true, Product sits inside the Bill To box (Sale Commission style). */
  productInsideBox?: boolean;
}) {
  const partyContent = (
    <>
      <div>{partyName}</div>
      {address ? <div className="mt-0.5 whitespace-pre-wrap">{address}</div> : null}
      {phone ? <div className="mt-0.5">{phone}</div> : null}
    </>
  );

  if (productInsideBox) {
    return (
      <div className="mt-3 border border-black px-3 py-2 text-[12px]">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <span className="font-semibold">{billToLabel}</span>
            <div className="mt-1">{partyContent}</div>
          </div>
          {product.trim() ? (
            <div className="shrink-0">
              <strong>Product:</strong>&nbsp;{product}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 flex items-start justify-between gap-6 text-[12px]">
      <div className="min-w-0 flex-1">
        <span className="font-semibold">{billToLabel}</span>
        <div className="mt-1">{partyContent}</div>
      </div>
      {product.trim() ? (
        <div className="shrink-0 pt-1">
          <strong>Product:</strong>&nbsp;{product}
        </div>
      ) : null}
    </div>
  );
}

function LineTable({ rows }: { rows: BillLineRow[] }) {
  return (
    <table className="mt-3 w-full border-collapse text-[12px]">
      <thead>
        <tr className="border-b border-black">
          <th className="py-1.5 pr-2 text-left font-semibold">Variety</th>
          <th className="px-1 py-1.5 text-right font-semibold">Bori</th>
          <th className="px-1 py-1.5 text-right font-semibold">Thela</th>
          <th className="px-1 py-1.5 text-right font-semibold">CompWeight</th>
          <th className="px-1 py-1.5 text-right font-semibold">Kaat</th>
          <th className="px-1 py-1.5 text-right font-semibold">Net Weight</th>
          <th className="px-1 py-1.5 text-right font-semibold">Rate</th>
          <th className="py-1.5 pl-1 text-right font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td className="py-1.5 pr-2">{row.variety || '\u00A0'}</td>
            <td className="px-1 py-1.5 text-right tabular-nums">{row.bori || '0'}</td>
            <td className="px-1 py-1.5 text-right tabular-nums">{row.thela || '0'}</td>
            <td className="px-1 py-1.5 text-right tabular-nums">{formatBillAmount(row.compWeight)}</td>
            <td className="px-1 py-1.5 text-right tabular-nums">{formatBillAmount(row.kaat)}</td>
            <td className="px-1 py-1.5 text-right tabular-nums">{formatBillAmount(row.netWeight)}</td>
            <td className="px-1 py-1.5 text-right tabular-nums">{formatBillAmount(row.rate)}</td>
            <td className="py-1.5 pl-1 text-right tabular-nums">{formatBillAmount(row.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TotalsStack({
  lines,
  netAmount,
  netLabel = 'Net Amount:',
}: {
  lines: Array<{ label: string; value: string; bold?: boolean; boxed?: boolean }>;
  netAmount: string;
  netLabel?: string;
}) {
  return (
    <div className="mt-4 flex justify-end">
      <div className="min-w-[280px] space-y-1 text-[12px]">
        {lines.map((line) => (
          <div key={line.label} className="flex justify-between gap-8">
            <span>{line.label}</span>
            <span className={`tabular-nums ${line.bold ? 'font-bold' : ''}`}>{line.value}</span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 pt-2">
          <span className="font-bold">{netLabel}</span>
          <span className="border-2 border-black px-3 py-0.5 text-[13px] font-bold tabular-nums">
            {netAmount}
          </span>
        </div>
      </div>
    </div>
  );
}

function BillFromSection({
  supplierName,
  rows,
  totals,
  netAmount,
}: {
  supplierName: string;
  rows: BillLineRow[];
  totals: Array<{ label: string; value: string }>;
  netAmount: string;
}) {
  return (
    <section className="mt-8">
      <p className="text-[12px] font-semibold">
        Bill From:&nbsp;{supplierName}
      </p>
      <LineTable rows={rows} />
      <div className="mt-4 flex justify-end">
        <div className="min-w-[280px] space-y-1 text-[12px]">
          {totals.map((line) => (
            <div key={line.label} className="flex justify-between gap-8">
              <span>{line.label}</span>
              <span className="tabular-nums">{line.value}</span>
            </div>
          ))}
          <div className="flex justify-between gap-8 pt-1 font-bold underline decoration-1 underline-offset-2">
            <span>Net Amount</span>
            <span className="tabular-nums">{netAmount}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function MaalBillBody({
  invoice,
  prefs,
  title,
}: {
  invoice: InvoiceDetail;
  prefs: SystemPreferences;
  title: string;
}) {
  const lines = invoice.kachiMaalLines ?? [];

  const tableRows = lines.map((l) => maalLineToBillRow(l, prefs.kaatPercent));
  const goodsTotal = sumLineAmounts(tableRows);
  const misc = Number(invoice.miscAmount ?? 0);

  const lowerQty = Number(invoice.lowerBardanaQty ?? 0);
  const lowerRate = Number(invoice.lowerBardanaRate ?? 0);
  const lowerAmount = Number(invoice.lowerBardanaAmount ?? 0);
  const lowerMode = invoice.lowerBardanaMode;
  const lowerBori = lowerMode === 'BORI' ? lowerQty : 0;
  const lowerThela = lowerMode === 'THELA' ? lowerQty : 0;

  const deduction = computeKachiDeductions(lines, prefs).deduction;
  const deductionLabel = 'Deduction Of Bilty';

  const debit = invoice.debitAccount;
  const extraLine =
    lowerQty > 0 && lowerRate > 0
      ? formatBoriThelaLine(lowerBori, lowerRate, lowerThela, lowerRate)
      : formatBoriThelaLine(0, 0, 0, 0);

  const billFromParty = resolveMaalBillFromPartyName(invoice, lines);
  const billFrom =
    billFromParty != null
      ? computeMaalBillFromTotals(lines, tableRows, prefs, invoice.type)
      : null;

  return (
    <>
      <BillHeader title={title} prefs={prefs} />
      <MetaRow
        invoiceNo={parseInvoiceDisplayNumber(invoice.reference)}
        date={formatBillDate(invoiceBillDate(invoice))}
        billNo={invoice.billNo ?? ''}
        gariNo={invoice.gariNo ?? ''}
      />
      <PartyBlock
        billToLabel="Bill To:"
        partyCode={debit?.code}
        partyName={debit?.name ?? '—'}
        product={invoice.jins ?? ''}
      />
      <LineTable rows={tableRows} />
      <TotalsStack
        lines={[
          { label: 'Misc. Expanse:', value: formatBillAmount(misc) },
          { label: 'Total Amount:', value: formatBillAmount(goodsTotal), bold: true },
          { label: extraLine, value: formatBillAmount(lowerAmount) },
          { label: deductionLabel, value: formatBillAmount(deduction) },
        ]}
        netAmount={formatBillAmount(invoice.total)}
      />
      {billFromParty && billFrom ? (
        <BillFromSection
          supplierName={billFromParty}
          rows={tableRows}
          totals={billFrom.totals}
          netAmount={formatBillAmount(billFrom.purchaseNet)}
        />
      ) : null}
    </>
  );
}

type PurchaseMaalBillToRow = {
  totalBag: number;
  totalKg: number;
  rate: number;
  dammi: number;
  totalAmount: number;
};

type PurchaseMaalBillFromRow = {
  partyName: string;
  totalBag: number;
  totalKg: number;
  rate: number;
  amount: number;
  dammi: number;
  bardanaAmount: number;
  totalAmount: number;
};

function purchaseMaalToBillToRow(line: NonNullable<InvoiceDetail['purchaseMaalLines']>[number]): PurchaseMaalBillToRow {
  return {
    totalBag: Number(line.bagCount ?? 0),
    totalKg: Number(line.totalWeightKg ?? 0),
    rate: Number(line.ratePerMaund ?? 0),
    dammi: line.dammiChecked ? Number(line.dammiAmount ?? 0) : 0,
    totalAmount: Number(line.amount ?? 0),
  };
}

function purchaseMaalToBillFromRow(line: NonNullable<InvoiceDetail['purchaseMaalLines']>[number]): PurchaseMaalBillFromRow {
  return {
    partyName: line.partyAccount?.name?.trim() || '—',
    totalBag: Number(line.bagCount ?? 0),
    totalKg: Number(line.totalWeightKg ?? 0),
    rate: Number(line.ratePerMaund ?? 0),
    amount: Number(line.amount ?? 0),
    dammi: line.dammiChecked ? Number(line.dammiAmount ?? 0) : 0,
    bardanaAmount: Number(line.bardanaAmount ?? 0),
    totalAmount: Number(line.netCreditToParty ?? 0),
  };
}

function purchaseMaalProductLabel(invoice: InvoiceDetail, lines: NonNullable<InvoiceDetail['purchaseMaalLines']>) {
  const jins = (invoice.jins ?? lines[0]?.jins ?? '').trim();
  if (!jins) return 'Maal Khata';
  if (/^maal\s*khata/i.test(jins)) return jins;
  return `Maal Khata ${jins}`;
}

function PurchaseMaalBillToTable({ rows }: { rows: PurchaseMaalBillToRow[] }) {
  return (
    <table className="mt-3 w-full border-collapse text-[12px]">
      <thead>
        <tr className="border-b border-black">
          <th className="py-1.5 pr-2 text-right font-semibold">Total Bag</th>
          <th className="px-1 py-1.5 text-right font-semibold">Total Kg</th>
          <th className="px-1 py-1.5 text-right font-semibold">Rate</th>
          <th className="px-1 py-1.5 text-right font-semibold">Dammi</th>
          <th className="py-1.5 pl-1 text-right font-semibold">Total Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td className="py-1.5 pr-2 text-right tabular-nums">{row.totalBag || '0'}</td>
            <td className="px-1 py-1.5 text-right tabular-nums">{formatBillWeight(row.totalKg)}</td>
            <td className="px-1 py-1.5 text-right tabular-nums">{formatBillAmount(row.rate)}</td>
            <td className="px-1 py-1.5 text-right tabular-nums">{formatBillAmount(row.dammi)}</td>
            <td className="py-1.5 pl-1 text-right tabular-nums">{formatBillAmount(row.totalAmount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PurchaseMaalBillFromTable({ rows }: { rows: PurchaseMaalBillFromRow[] }) {
  return (
    <table className="mt-3 w-full border-collapse text-[12px]">
      <thead>
        <tr className="border-b border-black">
          <th className="py-1.5 pr-2 text-left font-semibold">Party Name</th>
          <th className="px-1 py-1.5 text-right font-semibold">Total Bag</th>
          <th className="px-1 py-1.5 text-right font-semibold">Total Kg</th>
          <th className="px-1 py-1.5 text-right font-semibold">Rate</th>
          <th className="px-1 py-1.5 text-right font-semibold">Amount</th>
          <th className="px-1 py-1.5 text-right font-semibold">Dammi</th>
          <th className="px-1 py-1.5 text-right font-semibold">Bardana Amount</th>
          <th className="py-1.5 pl-1 text-right font-semibold">Total Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td className="py-1.5 pr-2">{row.partyName}</td>
            <td className="px-1 py-1.5 text-right tabular-nums">{row.totalBag || '0'}</td>
            <td className="px-1 py-1.5 text-right tabular-nums">{formatBillWeight(row.totalKg)}</td>
            <td className="px-1 py-1.5 text-right tabular-nums">{formatBillAmount(row.rate)}</td>
            <td className="px-1 py-1.5 text-right tabular-nums">{formatBillAmount(row.amount)}</td>
            <td className="px-1 py-1.5 text-right tabular-nums">{formatBillAmount(row.dammi)}</td>
            <td className="px-1 py-1.5 text-right tabular-nums">{formatBillAmount(row.bardanaAmount)}</td>
            <td className="py-1.5 pl-1 text-right tabular-nums">{formatBillAmount(row.totalAmount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PurchaseMaalBillBody({
  invoice,
  prefs,
  title,
}: {
  invoice: InvoiceDetail;
  prefs: SystemPreferences;
  title: string;
}) {
  const lines = invoice.purchaseMaalLines ?? [];
  const billToRows = lines.map(purchaseMaalToBillToRow);
  const billFromRows = lines.map(purchaseMaalToBillFromRow);
  const debit = invoice.debitAccount;
  const productLabel = purchaseMaalProductLabel(invoice, lines);
  const billFromParty = resolveMaalBillFromPartyName(invoice, lines);

  const misc = Number(invoice.miscAmount ?? 0);
  const lowerBardana = Number(invoice.lowerBardanaAmount ?? 0);
  const showGrandTotal =
    Boolean(invoice.mazduriEnabled) || misc !== 0 || lowerBardana !== 0;

  const totalKg = billFromRows.reduce((sum, row) => sum + row.totalKg, 0);
  const baseAmount = billFromRows.reduce((sum, row) => sum + row.amount, 0);
  const dammiTotal = billFromRows.reduce((sum, row) => sum + row.dammi, 0);
  const bardanaTotal = billFromRows.reduce((sum, row) => sum + row.bardanaAmount, 0);
  const invoiceExpenseTotals = computePurchaseMaalInvoiceTotals(
    lines.map((line) => ({
      amount: Number(line.amount ?? 0),
      totalWeightKg: Number(line.totalWeightKg ?? 0),
      bhartii: Number(line.bhartii ?? 0),
      dammiAmount: line.dammiChecked ? Number(line.dammiAmount ?? 0) : 0,
    })),
    {
      daamiPercent: prefs.daamiPercent,
      mazduriPercent: prefs.mazduriPercent,
      marketFeeRate: prefs.marketFeeRate,
    },
    {
      marketFeeEnabled: Boolean(invoice.marketFeeEnabled),
      mazduriEnabled: Boolean(invoice.mazduriEnabled),
    },
  );
  const otherExpenses =
    misc
    + lowerBardana
    + invoiceExpenseTotals.marketFeeAmount
    + invoiceExpenseTotals.mazduriAmount;
  const withExpenseAmount = baseAmount + dammiTotal + bardanaTotal + otherExpenses;
  const avgRateWithoutExpense = totalKg > 0 ? baseAmount / totalKg : 0;
  const avgRateWithExpense = totalKg > 0 ? withExpenseAmount / totalKg : 0;

  return (
    <>
      <BillHeader title={title} prefs={prefs} />
      <MetaRow
        invoiceNo={parseInvoiceDisplayNumber(invoice.reference)}
        date={formatBillDate(invoiceBillDate(invoice))}
        billNo={invoice.billNo ?? ''}
        gariNo={invoice.gariNo ?? ''}
      />
      <PartyBlock
        billToLabel="Bill To:"
        partyCode={debit?.code}
        partyName={debit?.name ?? '—'}
        product=""
      />
      <p className="mt-3 text-[12px] font-semibold">{productLabel}</p>
      <PurchaseMaalBillToTable
        rows={
          billToRows.length
            ? billToRows
            : [{ totalBag: 0, totalKg: 0, rate: 0, dammi: 0, totalAmount: 0 }]
        }
      />
      {showGrandTotal ? (
        <div className="mt-4 flex justify-end">
          <div className="min-w-[280px] text-[12px]">
            <div className="flex items-center justify-between gap-4 pt-2">
              <span className="font-bold">Grand Total:</span>
              <span className="border-2 border-black px-3 py-0.5 text-[13px] font-bold tabular-nums">
                {formatBillAmount(invoice.total)}
              </span>
            </div>
          </div>
        </div>
      ) : null}
      {billFromParty ? (
        <section className="mt-8">
          <p className="text-[12px] font-semibold">Bill From:&nbsp;{billFromParty}</p>
          <PurchaseMaalBillFromTable
            rows={
              billFromRows.length
                ? billFromRows
                : [{
                    partyName: billFromParty,
                    totalBag: 0,
                    totalKg: 0,
                    rate: 0,
                    amount: 0,
                    dammi: 0,
                    bardanaAmount: 0,
                    totalAmount: 0,
                  }]
            }
          />
        </section>
      ) : null}
      <div className="mt-4 flex justify-end">
        <div className="min-w-[280px] space-y-1 text-[12px]">
          <div className="flex justify-between gap-8">
            <span>Avg Rate with Expense</span>
            <span className="tabular-nums">{formatBillAmount(avgRateWithExpense)}</span>
          </div>
          <div className="flex justify-between gap-8">
            <span>Avg Rate without Expense</span>
            <span className="tabular-nums">{formatBillAmount(avgRateWithoutExpense)}</span>
          </div>
        </div>
      </div>
    </>
  );
}

function SalePaunchBillBody({
  invoice,
  prefs,
}: {
  invoice: InvoiceDetail;
  prefs: SystemPreferences;
}) {
  const lines = invoice.salePaunchLines ?? [];
  const emptyRow: BillLineRow = {
    variety: '',
    bori: 0,
    thela: 0,
    compWeight: 0,
    kaat: 0,
    netWeight: 0,
    rate: 0,
    amount: 0,
  };

  const saleRows = lines.length ? lines.map(salePaunchLowerToBillRow) : [emptyRow];
  const maalRows = lines.length ? lines.map(salePaunchUpperToBillRow) : [emptyRow];
  const goodsTotal = sumLineAmounts(saleRows);
  const misc = Number(invoice.miscAmount ?? 0);
  const bilty = Number(invoice.biltyKirayaAmount ?? 0);

  const lowerQty = Number(invoice.lowerBardanaQty ?? 0);
  const lowerRate = Number(invoice.lowerBardanaRate ?? 0);
  const lowerAmount = Number(invoice.lowerBardanaAmount ?? 0);
  const lowerMode = invoice.lowerBardanaMode;
  const lowerBori = lowerMode === 'BORI' ? lowerQty : 0;
  const lowerThela = lowerMode === 'THELA' ? lowerQty : 0;
  const bardanaLine =
    lowerQty > 0 && lowerRate > 0
      ? formatBoriThelaLine(lowerBori, lowerRate, lowerThela, lowerRate)
      : formatBoriThelaLine(0, 0, 0, 0);

  const debit = invoice.debitAccount;
  const product = invoice.jins ?? lines[0]?.jins ?? '';
  const billFrom =
    lines.length > 0 ? computeSalePaunchBillFromTotals(lines, prefs) : null;

  return (
    <>
      <BillHeader title="Sale Bill" prefs={prefs} />
      <MetaRow
        invoiceNo={parseInvoiceDisplayNumber(invoice.reference)}
        date={formatBillDate(invoiceBillDate(invoice))}
        billNo={invoice.billNo ?? ''}
        gariNo={invoice.gariNo ?? ''}
      />
      <PartyBlock
        billToLabel="Bill To:"
        partyCode={debit?.code}
        partyName={debit?.name ?? '—'}
        product={product}
      />
      <LineTable rows={saleRows} />
      <TotalsStack
        lines={[
          { label: 'Misc. Expanse:', value: formatBillAmount(misc) },
          { label: 'Total Amount:', value: formatBillAmount(goodsTotal), bold: true },
          { label: bardanaLine, value: formatBillAmount(lowerAmount) },
          { label: 'Deduction Of Bilty', value: formatBillAmount(bilty) },
        ]}
        netAmount={formatBillAmount(invoice.total)}
      />
      {billFrom ? (
        <BillFromSection
          supplierName={resolveSalePaunchBillFromLabel(lines, product)}
          rows={maalRows}
          totals={billFrom.totals}
          netAmount={formatBillAmount(billFrom.purchaseNet)}
        />
      ) : null}
    </>
  );
}

function CommissionLineTable({ rows }: { rows: CommissionBillRow[] }) {
  const totals = sumCommissionBillRows(rows);
  return (
    <table className="mt-3 w-full border-collapse text-[12px]">
      <thead>
        <tr className="border-b border-black">
          <th className="py-1.5 pr-2 text-left font-semibold">Variety</th>
          <th className="px-1 py-1.5 text-right font-semibold">Bori</th>
          <th className="px-1 py-1.5 text-right font-semibold">Thela</th>
          <th className="px-1 py-1.5 text-right font-semibold">Weight</th>
          <th className="px-1 py-1.5 text-right font-semibold">Rate</th>
          <th className="py-1.5 pl-1 text-right font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td className="py-1 pr-2">{row.variety || '\u00A0'}</td>
            <td className="px-1 py-1 text-right tabular-nums">{row.bori || '0'}</td>
            <td className="px-1 py-1 text-right tabular-nums">{row.thela || '0'}</td>
            <td className="px-1 py-1 text-right tabular-nums">{formatBillWeight(row.weight)}</td>
            <td className="px-1 py-1 text-right tabular-nums">{formatBillAmount(row.rate)}</td>
            <td className="py-1 pl-1 text-right tabular-nums">{formatBillAmount(row.amount)}</td>
          </tr>
        ))}
        <tr className="border-t border-black font-semibold">
          <td className="py-1.5 pr-2">{'\u00A0'}</td>
          <td className="px-1 py-1.5 text-right tabular-nums">{totals.bori || '0'}</td>
          <td className="px-1 py-1.5 text-right tabular-nums">{totals.thela || '0'}</td>
          <td className="px-1 py-1.5 text-right tabular-nums">{formatBillWeight(totals.weight)}</td>
          <td className="px-1 py-1.5" />
          <td className="py-1.5 pl-1 text-right tabular-nums">{formatBillAmount(totals.amount)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function CommissionTotalsStack({
  lines,
  bardanaLabel,
  bardanaValue,
  netAmount,
}: {
  lines: Array<{ label: string; value: string; bold?: boolean }>;
  bardanaLabel: string;
  bardanaValue: string;
  netAmount: string;
}) {
  return (
    <div className="mt-4 flex justify-end">
      <div className="min-w-[300px] space-y-0.5 text-[12px]">
        {lines.map((line) => (
          <div key={line.label} className="flex justify-between gap-10">
            <span className={line.bold ? 'font-bold' : ''}>{line.label}</span>
            <span className={`tabular-nums ${line.bold ? 'font-bold' : ''}`}>{line.value}</span>
          </div>
        ))}
        <div className="flex justify-between gap-10 pt-1">
          <span>{bardanaLabel}</span>
          <span className="tabular-nums">{bardanaValue}</span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-2">
          <span className="font-bold">Net Amount:</span>
          <span className="border-2 border-black px-3 py-0.5 text-[13px] font-bold tabular-nums">
            {netAmount}
          </span>
        </div>
      </div>
    </div>
  );
}

function BillSignature() {
  return (
    <div className="mt-16 flex justify-end text-[12px]">
      <div className="w-[160px]">
        <div>Signature</div>
        <div className="mt-1 border-b border-black" />
      </div>
    </div>
  );
}

type GeneralGoodsBillRow = {
  product: string;
  quantity: number;
  unit: string;
  rate: number;
  lineTotal: number;
};

function GeneralGoodsLineTable({ rows }: { rows: GeneralGoodsBillRow[] }) {
  const qtyTotal = rows.reduce((s, r) => s + r.quantity, 0);
  const amountTotal = rows.reduce((s, r) => s + r.lineTotal, 0);
  return (
    <table className="mt-3 w-full border-collapse text-[12px]">
      <thead>
        <tr className="border-b border-black">
          <th className="py-1.5 pr-2 text-left font-semibold">Product</th>
          <th className="px-1 py-1.5 text-right font-semibold">Qty</th>
          <th className="px-1 py-1.5 text-right font-semibold">Unit</th>
          <th className="px-1 py-1.5 text-right font-semibold">Rate</th>
          <th className="py-1.5 pl-1 text-right font-semibold">Line Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td className="py-1.5 pr-2">{row.product || '\u00A0'}</td>
            <td className="px-1 py-1.5 text-right tabular-nums">{row.quantity || '0'}</td>
            <td className="px-1 py-1.5 text-right">{row.unit || '—'}</td>
            <td className="px-1 py-1.5 text-right tabular-nums">{formatBillAmount(row.rate)}</td>
            <td className="py-1.5 pl-1 text-right tabular-nums">{formatBillAmount(row.lineTotal)}</td>
          </tr>
        ))}
        <tr className="border-t border-black font-semibold">
          <td className="py-1.5 pr-2">{'\u00A0'}</td>
          <td className="px-1 py-1.5 text-right tabular-nums">{qtyTotal || '0'}</td>
          <td className="px-1 py-1.5" />
          <td className="px-1 py-1.5" />
          <td className="py-1.5 pl-1 text-right tabular-nums">{formatBillAmount(amountTotal)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function generalGoodsProductLabel(lines: Array<{ product?: { name?: string | null } | null }>) {
  const names = lines.map((l) => l.product?.name?.trim()).filter(Boolean) as string[];
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return 'Multiple';
}

function PurchaseGeneralBillBody({
  invoice,
  prefs,
}: {
  invoice: InvoiceDetail;
  prefs: SystemPreferences;
}) {
  const lines = invoice.generalPurchaseLines ?? [];
  const rows: GeneralGoodsBillRow[] = lines.map((line) => ({
    product: line.product?.name ?? '—',
    quantity: Number(line.quantity),
    unit: line.product?.unit?.trim() || '—',
    rate: Number(line.rate),
    lineTotal: Number(line.lineTotal),
  }));
  const goodsTotal = rows.reduce((s, r) => s + r.lineTotal, 0);
  const mazduriTotal = lines.reduce((s, line) => s + Math.max(0, Number(line.mazduriAmount ?? 0)), 0);
  const party = invoice.partyAccount;
  const totalLines: Array<{ label: string; value: string; bold?: boolean }> = [
    { label: 'Goods Total:', value: formatBillAmount(goodsTotal), bold: true },
  ];
  if (mazduriTotal > 0) {
    totalLines.push({
      label: 'Mazduri (paid separately):',
      value: formatBillAmount(mazduriTotal),
    });
  }

  return (
    <>
      <BillHeader title={BILL_TITLES.PURCHASE_GENERAL ?? 'Purchase Bill'} prefs={prefs} />
      <MetaRow
        invoiceNo={parseInvoiceDisplayNumber(invoice.reference)}
        date={formatBillDate(invoiceBillDate(invoice))}
        billNo={invoice.billNo ?? ''}
        gariNo={invoice.gariNo ?? ''}
      />
      <PartyBlock
        billToLabel="Bill From:"
        partyCode={party?.code}
        partyName={party?.name ?? '—'}
        product={generalGoodsProductLabel(lines)}
      />
      <GeneralGoodsLineTable rows={rows.length ? rows : [{ product: '', quantity: 0, unit: '', rate: 0, lineTotal: 0 }]} />
      <TotalsStack
        lines={totalLines}
        netAmount={formatBillAmount(Number(invoice.total))}
        netLabel="Net Payable to Supplier:"
      />
      <BillSignature />
    </>
  );
}

function SaleGeneralBillBody({
  invoice,
  prefs,
}: {
  invoice: InvoiceDetail;
  prefs: SystemPreferences;
}) {
  const lines = invoice.generalSaleLines ?? [];
  const rows: GeneralGoodsBillRow[] = lines.map((line) => ({
    product: line.product?.name ?? '—',
    quantity: Number(line.quantity),
    unit: line.product?.unit?.trim() || '—',
    rate: Number(line.rate),
    lineTotal: Number(line.lineTotal),
  }));
  const goodsTotal = rows.reduce((s, r) => s + r.lineTotal, 0);
  const party = invoice.salePartyAccount;

  return (
    <>
      <BillHeader title={BILL_TITLES.SALE_GENERAL ?? 'Sale Bill'} prefs={prefs} />
      <MetaRow
        invoiceNo={parseInvoiceDisplayNumber(invoice.reference)}
        date={formatBillDate(invoiceBillDate(invoice))}
        billNo={invoice.billNo ?? ''}
        gariNo={invoice.gariNo ?? ''}
      />
      <PartyBlock
        billToLabel="Bill To:"
        partyCode={party?.code}
        partyName={party?.name ?? '—'}
        product={generalGoodsProductLabel(lines)}
      />
      <GeneralGoodsLineTable rows={rows.length ? rows : [{ product: '', quantity: 0, unit: '', rate: 0, lineTotal: 0 }]} />
      <TotalsStack
        lines={[{ label: 'Total Amount:', value: formatBillAmount(goodsTotal), bold: true }]}
        netAmount={formatBillAmount(Number(invoice.total))}
      />
      <BillSignature />
    </>
  );
}

function GeneralTradeBillBody({
  invoice,
  prefs,
}: {
  invoice: InvoiceDetail;
  prefs: SystemPreferences;
}) {
  const purchaseLines = invoice.generalPurchaseLines ?? [];
  const saleLines = invoice.generalSaleLines ?? [];

  const saleRows = saleLines.map((sale, index) => {
    const purchase = purchaseLines[index];
    return {
      product: sale.product?.name?.trim() || purchase?.product?.name?.trim() || '—',
      rate: Number(sale.rate),
      quantity: Number(sale.quantity),
      amount: Number(sale.lineTotal),
    };
  });

  const purchaseRows = purchaseLines.map((purchase) => ({
    product: purchase.product?.name?.trim() || '—',
    rate: Number(purchase.rate),
    quantity: Number(purchase.quantity),
    amount: Number(purchase.lineTotal),
  }));

  const saleTotal = saleRows.reduce((s, r) => s + r.amount, 0);
  const purchaseTotal = purchaseRows.reduce((s, r) => s + r.amount, 0);
  const difference = Math.round((saleTotal - purchaseTotal) * 100) / 100;

  const emptyTradeRow = { product: '—', rate: 0, quantity: 0, amount: 0 };
  const saleTableRows = saleRows.length ? saleRows : [emptyTradeRow];
  const purchaseTableRows = purchaseRows.length ? purchaseRows : [emptyTradeRow];

  return (
    <>
      <BillHeader title={BILL_TITLES.GENERAL_TRADE ?? 'General Trade Bill'} prefs={prefs} />
      <MetaRow
        invoiceNo={parseInvoiceDisplayNumber(invoice.reference)}
        date={formatBillDate(invoiceBillDate(invoice))}
        billNo={invoice.billNo ?? ''}
        gariNo={invoice.gariNo ?? ''}
      />

      <PartyBlock
        billToLabel="Bill To:"
        partyCode={invoice.salePartyAccount?.code}
        partyName={invoice.salePartyAccount?.name ?? '—'}
        product=""
      />
      <table className="mt-3 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-black">
            <th className="py-1.5 pr-2 text-left font-semibold">Product</th>
            <th className="px-1 py-1.5 text-right font-semibold">Sale Rate</th>
            <th className="px-1 py-1.5 text-right font-semibold">Qty</th>
            <th className="py-1.5 pl-1 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {saleTableRows.map((row, i) => (
            <tr key={i}>
              <td className="py-1.5 pr-2">{row.product}</td>
              <td className="px-1 py-1.5 text-right tabular-nums">{formatBillAmount(row.rate)}</td>
              <td className="px-1 py-1.5 text-right tabular-nums">{row.quantity || '0'}</td>
              <td className="py-1.5 pl-1 text-right tabular-nums">{formatBillAmount(row.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex justify-end text-[12px]">
        <div className="flex min-w-[280px] justify-between gap-8 font-semibold">
          <span>Sale Goods Total</span>
          <span className="tabular-nums">{formatBillAmount(saleTotal)}</span>
        </div>
      </div>

      <section className="mt-8">
        <p className="text-[12px] font-semibold">
          Bill From:&nbsp;{invoice.partyAccount?.name ?? '—'}
        </p>
        <table className="mt-3 w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-black">
              <th className="py-1.5 pr-2 text-left font-semibold">Product</th>
              <th className="px-1 py-1.5 text-right font-semibold">Purchase Rate</th>
              <th className="px-1 py-1.5 text-right font-semibold">Qty</th>
              <th className="py-1.5 pl-1 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {purchaseTableRows.map((row, i) => (
              <tr key={i}>
                <td className="py-1.5 pr-2">{row.product}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{formatBillAmount(row.rate)}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{row.quantity || '0'}</td>
                <td className="py-1.5 pl-1 text-right tabular-nums">{formatBillAmount(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex justify-end text-[12px]">
          <div className="flex min-w-[280px] justify-between gap-8 font-semibold">
            <span>Purchase Total</span>
            <span className="tabular-nums">{formatBillAmount(purchaseTotal)}</span>
          </div>
        </div>
      </section>

      <TotalsStack
        lines={[
          { label: 'Sale Total:', value: formatBillAmount(saleTotal), bold: true },
          { label: 'Purchase Total:', value: formatBillAmount(purchaseTotal), bold: true },
        ]}
        netAmount={formatBillAmount(difference)}
        netLabel="Difference (Revenue):"
      />
      <BillSignature />
    </>
  );
}

function SaleCommissionBillBody({
  invoice,
  prefs,
}: {
  invoice: InvoiceDetail;
  prefs: SystemPreferences;
}) {
  const lines = invoice.saleCommissionLines ?? [];
  const emptyRow: CommissionBillRow = {
    variety: '',
    bori: 0,
    thela: 0,
    weight: 0,
    rate: 0,
    amount: 0,
  };
  const tableRows = lines.length ? lines.map(saleCommissionLineToBillRow) : [emptyRow];

  const totals = computeSaleCommissionInvoiceTotals(
    lines.map((line) => ({
      amount: Number(line.amount),
      dammiAmount: Number(line.dammiAmount ?? 0),
      bagCount: Number(line.bagCount),
    })),
    {
      daamiPercent: prefs.daamiPercent,
      commissionPercent: prefs.commissionPercent,
      dalaliPercent: prefs.dalaliPercent,
      sutliRate: prefs.sutliRate,
      mazduriPerBagRate: prefs.mazduriPerBagRate,
      marketFeeRate: prefs.marketFeeRate,
    },
    {
      munshianaAmount: Number(invoice.munshianaAmount ?? 0),
      miscAmount: Number(invoice.miscAmount ?? 0),
      lowerBardanaQty: invoice.lowerBardanaQty != null ? Number(invoice.lowerBardanaQty) : null,
      lowerBardanaRate: invoice.lowerBardanaRate != null ? Number(invoice.lowerBardanaRate) : null,
    },
  );

  const feeTotalExBardana = Math.max(
    0,
    totals.netSalePartyDebit - (totals.settlementBardanaAmount ?? 0),
  );

  const lowerMode = invoice.lowerBardanaMode;
  const bardanaQty =
    invoice.lowerBardanaQty != null && Number(invoice.lowerBardanaQty) > 0
      ? Number(invoice.lowerBardanaQty)
      : totals.totalBagCount;
  const bardanaRate = Number(invoice.lowerBardanaRate ?? 0);
  const lowerBori = lowerMode === 'BORI' ? bardanaQty : 0;
  const lowerThela = lowerMode === 'THELA' ? bardanaQty : 0;
  const bardanaLine =
    totals.settlementBardanaAmount != null && totals.settlementBardanaAmount > 0
      ? formatCommissionBardanaLine(
          lowerBori,
          lowerMode === 'BORI' ? bardanaRate : 0,
          lowerThela,
          lowerMode === 'THELA' ? bardanaRate : 0,
        )
      : formatCommissionBardanaLine(0, 0, 0, 0);

  const debit = invoice.debitAccount;
  const product = invoice.jins ?? lines[0]?.jins ?? '';

  return (
    <>
      <BillHeader title="Sale Bill" prefs={prefs} />
      <MetaRow
        invoiceNo={parseInvoiceDisplayNumber(invoice.reference)}
        date={formatBillDate(invoiceBillDate(invoice))}
        billNo={invoice.billNo ?? ''}
        gariNo={invoice.gariNo ?? ''}
      />
      <PartyBlock
        billToLabel="Bill To:"
        partyCode={debit?.code}
        partyName={debit?.name ?? '—'}
        product={product}
        productInsideBox
      />
      <CommissionLineTable rows={tableRows} />
      <CommissionTotalsStack
        lines={[
          { label: 'Daami:', value: formatBillAmount(totals.totalDammiAmount) },
          { label: 'Commission:', value: formatBillAmount(totals.commissionAmount) },
          { label: 'Market Fee:', value: formatBillAmount(totals.marketFeeAmount) },
          { label: 'Accountant:', value: formatBillAmount(totals.munshianaAmount) },
          { label: 'Dalali:', value: formatBillAmount(totals.dalaliAmount) },
          { label: 'Labour:', value: formatBillAmount(totals.mazduriAmount) },
          { label: 'Sutli:', value: formatBillAmount(totals.sutliAmount) },
          { label: 'Misc. Expanse:', value: formatBillAmount(totals.miscAmount) },
          { label: 'Total Amount:', value: formatBillAmount(feeTotalExBardana), bold: true },
        ]}
        bardanaLabel={bardanaLine}
        bardanaValue={formatBillAmount(totals.settlementBardanaAmount ?? 0)}
        netAmount={formatBillAmount(invoice.total)}
      />
      <BillSignature />
    </>
  );
}

const DEFAULT_PREFS: SystemPreferences = {
  daamiPercent: 0,
  paleDariPercent: 0,
  brokeryPercent: 0,
  marketFeeRate: 0,
  bardanaRate: 0,
  taxPercent: 0,
  kaatPercent: 0,
  mazduriPercent: 0,
  mazduriPerBagRate: 0,
  commissionPercent: 0,
  dalaliPercent: 0,
  sutliRate: 0,
  markeetFeeRate: 0,
  kantaRate: 0,
  closingDate: null,
  businessName: DEFAULT_BUSINESS_INFO.businessName,
  proprietorName: DEFAULT_BUSINESS_INFO.proprietorName,
  phone: DEFAULT_BUSINESS_INFO.phone,
  mobile: DEFAULT_BUSINESS_INFO.mobile ?? null,
  email: DEFAULT_BUSINESS_INFO.email ?? null,
  address: DEFAULT_BUSINESS_INFO.address ?? null,
  ntnNumber: DEFAULT_BUSINESS_INFO.ntnNumber ?? null,
  updatedAt: '',
};

export function InvoiceBillView({
  invoice,
  prefs,
}: {
  invoice: InvoiceDetail;
  prefs?: SystemPreferences | null;
}) {
  const p = prefs ?? DEFAULT_PREFS;
  const title = BILL_TITLES[invoice.type] ?? 'Bill';

  return (
    <div className={`${billFont} bg-white px-6 py-8`}>
      {invoice.type === 'KACHI_MAAL' ? (
        <MaalBillBody invoice={invoice} prefs={p} title={title} />
      ) : null}
      {invoice.type === 'PURCHASE_MAAL' ? (
        <PurchaseMaalBillBody invoice={invoice} prefs={p} title={title} />
      ) : null}
      {invoice.type === 'SALE_PAUNCH' ? (
        <SalePaunchBillBody invoice={invoice} prefs={p} />
      ) : null}
      {invoice.type === 'SALE_COMMISSION' ? (
        <SaleCommissionBillBody invoice={invoice} prefs={p} />
      ) : null}
      {invoice.type === 'PURCHASE_GENERAL' ? (
        <PurchaseGeneralBillBody invoice={invoice} prefs={p} />
      ) : null}
      {invoice.type === 'SALE_GENERAL' ? <SaleGeneralBillBody invoice={invoice} prefs={p} /> : null}
      {invoice.type === 'GENERAL_TRADE' ? (
        <GeneralTradeBillBody invoice={invoice} prefs={p} />
      ) : null}
    </div>
  );
}
