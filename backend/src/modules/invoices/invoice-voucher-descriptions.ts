export type InvoiceVoucherHeader = {
  tafseel?: string | null;
  gariNo?: string | null;
};

export type InvoiceVoucherLine = {
  totalWeightKg: number;
  ratePerMaund: number;
};

export function voucherReferenceFromBillNo(billNo?: string | null): string {
  return billNo?.trim() ?? '';
}

function formatWeightKg(kg: number) {
  const n = Number(kg);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n)
    ? String(n)
    : n.toLocaleString('en-PK', { maximumFractionDigits: 2 });
}

function formatRate(rate: number) {
  return Number(rate).toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function invoiceVoucherHeaderSuffix(header: InvoiceVoucherHeader): string {
  const parts: string[] = [];
  if (header.tafseel?.trim()) parts.push(`Tafseel: ${header.tafseel.trim()}`);
  if (header.gariNo?.trim()) parts.push(`Gari#: ${header.gariNo.trim()}`);
  if (parts.length === 0) return '';
  return ` — ${parts.join(', ')}`;
}

export function rowLegDescription(line: InvoiceVoucherLine, header: InvoiceVoucherHeader): string {
  const core = `${formatWeightKg(line.totalWeightKg)} kg @ Rs ${formatRate(line.ratePerMaund)}/maund`;
  return core + invoiceVoucherHeaderSuffix(header);
}

export function blendedLegDescription(
  lines: InvoiceVoucherLine[],
  header: InvoiceVoucherHeader,
  product?: string | null,
): string {
  const totalWeightKg = lines.reduce((sum, line) => sum + Number(line.totalWeightKg), 0);
  if (totalWeightKg <= 0) {
    const suffix = invoiceVoucherHeaderSuffix(header);
    return suffix ? suffix.replace(/^ — /, '') : '—';
  }

  let weightedRateSum = 0;
  for (const line of lines) {
    weightedRateSum += Number(line.totalWeightKg) * Number(line.ratePerMaund);
  }
  const blendedRate = weightedRateSum / totalWeightKg;
  const core = `${formatWeightKg(totalWeightKg)} kg @ Rs ${formatRate(blendedRate)}/maund`;
  const withProduct = product?.trim() ? `${product.trim()} ${core}` : core;
  return withProduct + invoiceVoucherHeaderSuffix(header);
}

/** Purchase Maal settlement text — goods rate + all-in rate (Dammi/Bardana + optional Mazduri/Market Fee). */
export type PurchaseMaalExpenseRatesInput = {
  totalGoodsAmount: number;
  totalDammiAmount: number;
  totalBardanaAmount: number;
  marketFeeAmount: number;
  mazduriAmount: number;
};

export type PurchaseMaalDescriptionLine = InvoiceVoucherLine & {
  amount?: number;
  dammiAmount?: number;
  bardanaAmount?: number | null;
};

function withoutExpenseRateFromLines(lines: InvoiceVoucherLine[], totalWeightKg: number): number {
  let weightedRateSum = 0;
  for (const line of lines) {
    weightedRateSum += Number(line.totalWeightKg) * Number(line.ratePerMaund);
  }
  return weightedRateSum / totalWeightKg;
}

/**
 * Format:
 * `{kg} kg — with expense = Rs {allIn}/maund — without expense = Rs {goods}/maund — Gari#: …`
 */
export function purchaseMaalBlendedLegDescription(
  lines: PurchaseMaalDescriptionLine[],
  header: InvoiceVoucherHeader,
  expenses: PurchaseMaalExpenseRatesInput,
  product?: string | null,
): string {
  const totalWeightKg = lines.reduce((sum, line) => sum + Number(line.totalWeightKg), 0);
  if (totalWeightKg <= 0) {
    const suffix = invoiceVoucherHeaderSuffix(header);
    return suffix ? suffix.replace(/^ — /, '') : '—';
  }

  const withoutExpenseRate = withoutExpenseRateFromLines(lines, totalWeightKg);

  const goods = Number(expenses.totalGoodsAmount) || 0;
  const dammi = Number(expenses.totalDammiAmount) || 0;
  const bardana = Number(expenses.totalBardanaAmount) || 0;
  const marketFee = Math.max(0, Number(expenses.marketFeeAmount) || 0);
  const mazduri = Math.max(0, Number(expenses.mazduriAmount) || 0);
  const allInAmount = goods + dammi + bardana + marketFee + mazduri;
  // Rate is Rs/maund: (amount / kg) * 40
  const withExpenseRate = (allInAmount / totalWeightKg) * 40;

  const core =
    `${formatWeightKg(totalWeightKg)} kg`
    + ` with expense = Rs ${formatRate(withExpenseRate)}/maund`
    + ` without expense = Rs ${formatRate(withoutExpenseRate)}/maund`;
  const withProduct = product?.trim() ? `${product.trim()} ${core}` : core;
  const suffix = invoiceVoucherHeaderSuffix(header).replace(/^ — /, ' ');
  return withProduct + suffix;
}

export function salePaunchRowLegDescription(
  line: InvoiceVoucherLine & { kanta?: number; upperRatePerMaund?: number; lowerRatePerMaund?: number },
  header: InvoiceVoucherHeader,
): string {
  const rate = line.upperRatePerMaund ?? line.ratePerMaund;
  let core = `${formatWeightKg(line.totalWeightKg)} kg @ Rs ${formatRate(rate)}/maund`;
  if (line.kanta != null && line.kanta > 0) {
    core += ` — less kanta ${formatRate(line.kanta)}`;
  }
  if (line.lowerRatePerMaund != null && line.lowerRatePerMaund > 0) {
    core += ` / sale Rs ${formatRate(line.lowerRatePerMaund)}/maund`;
  }
  return core + invoiceVoucherHeaderSuffix(header);
}

function formatMoneyAmount(amount: number) {
  return Number(amount).toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export type SalePaunchCreditDescLine = {
  netWeightKg: number;
  upperRatePerMaund: number;
  netUpperAmount: number;
  kanta?: number;
};

export type SalePaunchDebitDescLine = {
  lowerNetWeightKg: number;
  lowerRatePerMaund: number;
  lowerAmount: number;
};

/**
 * Maal Khata (credit) goods text:
 * `Wheat 980 kg @ Rs 4,200/maund = Rs 102,900 — less kanta 500 — Tafseel: …`
 */
export function salePaunchCreditLegDescription(
  lines: SalePaunchCreditDescLine[],
  header: InvoiceVoucherHeader,
  product?: string | null,
): string {
  const totalNetKg = lines.reduce((sum, line) => sum + Number(line.netWeightKg), 0);
  const totalAmount = lines.reduce((sum, line) => sum + Number(line.netUpperAmount), 0);
  const totalKanta = lines.reduce((sum, line) => sum + Math.max(0, Number(line.kanta ?? 0)), 0);

  if (totalNetKg <= 0) {
    const suffix = invoiceVoucherHeaderSuffix(header);
    const fallback = product?.trim() || (suffix ? suffix.replace(/^ — /, '') : '—');
    return fallback;
  }

  let weightedRateSum = 0;
  for (const line of lines) {
    weightedRateSum += Number(line.netWeightKg) * Number(line.upperRatePerMaund);
  }
  const blendedRate = weightedRateSum / totalNetKg;

  let core =
    `${formatWeightKg(totalNetKg)} kg @ Rs ${formatRate(blendedRate)}/maund`
    + ` = Rs ${formatMoneyAmount(totalAmount)}`;
  if (totalKanta > 0) {
    core += ` — less kanta ${formatMoneyAmount(totalKanta)}`;
  }
  const withProduct = product?.trim() ? `${product.trim()} ${core}` : core;
  return withProduct + invoiceVoucherHeaderSuffix(header);
}

/**
 * Sale party (debit) goods text:
 * `Wheat 990 kg @ Rs 4,500/maund = Rs 111,375 — Tafseel: …`
 */
export function salePaunchDebitLegDescription(
  lines: SalePaunchDebitDescLine[],
  header: InvoiceVoucherHeader,
  product?: string | null,
  debitAmount?: number,
): string {
  const totalNetKg = lines.reduce((sum, line) => sum + Number(line.lowerNetWeightKg), 0);
  const amount =
    debitAmount != null && Number.isFinite(debitAmount)
      ? Number(debitAmount)
      : lines.reduce((sum, line) => sum + Number(line.lowerAmount), 0);

  if (totalNetKg <= 0) {
    const suffix = invoiceVoucherHeaderSuffix(header);
    const fallback = product?.trim() || (suffix ? suffix.replace(/^ — /, '') : '—');
    return fallback;
  }

  let weightedRateSum = 0;
  for (const line of lines) {
    weightedRateSum += Number(line.lowerNetWeightKg) * Number(line.lowerRatePerMaund);
  }
  const blendedRate = weightedRateSum / totalNetKg;

  const core =
    `${formatWeightKg(totalNetKg)} kg @ Rs ${formatRate(blendedRate)}/maund`
    + ` = Rs ${formatMoneyAmount(amount)}`;
  const withProduct = product?.trim() ? `${product.trim()} ${core}` : core;
  return withProduct + invoiceVoucherHeaderSuffix(header);
}

/** Fee / plug legs that post to their own account (debit or credit side). */
export function salePaunchFeeLegDescription(
  label: string,
  amount: number,
  header: InvoiceVoucherHeader,
  product?: string | null,
): string {
  const core = `${label} Rs ${formatMoneyAmount(amount)}`;
  const withProduct = product?.trim() ? `${product.trim()} — ${core}` : core;
  return withProduct + invoiceVoucherHeaderSuffix(header);
}

/** Separate bardana ledger legs — not weight/rate settlement text. */
export function bardanaAgainstInvoiceDescription(invoiceReference: string): string {
  const ref = invoiceReference.trim();
  return ref ? `Bardana against ${ref}` : 'Bardana';
}

export function isBardanaLedgerNote(notes?: string | null): boolean {
  const n = notes?.trim().toLowerCase() ?? '';
  if (!n) return false;
  return n === 'bardana' || n.startsWith('bardana against') || n.startsWith('bardana ');
}
