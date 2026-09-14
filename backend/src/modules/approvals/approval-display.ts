import {
  InvoiceType,
  OpeningBalanceSide,
  VoucherType,
} from '@prisma/client';
import { logger } from '../../lib/logger';
import { OPENING_BALANCE_EQUITY_ACCOUNT_NAME } from '../accounting/accounting.service';
import {
  generalPurchaseApprovalDescription,
  generalSaleApprovalDescription,
  type GeneralGoodsLineDescInput,
} from '../invoices/general-goods-descriptions';
import type { ApprovalKind } from './approval-types';

export type ApprovalAccountRef = {
  name: string;
  code: string;
  /** Ledger amount posted (or to be posted) for this account on this side, when known. */
  amount?: number;
};

const EQUITY_REF: ApprovalAccountRef = {
  name: OPENING_BALANCE_EQUITY_ACCOUNT_NAME,
  code: '',
};

const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  SALE_COMMISSION: 'Sale on Commission',
  SALE_PAUNCH: 'Sale on Paunch',
  PURCHASE_MAAL: 'Purchase to Maal',
  KACHI_MAAL: 'Kachi Maal',
  PURCHASE_GENERAL: 'Purchase Invoice (General)',
  SALE_GENERAL: 'Sale Invoice (General)',
  GENERAL_TRADE: 'General Trade',
};

const SALE_INVOICE_TYPES: InvoiceType[] = ['SALE_COMMISSION', 'SALE_PAUNCH', 'SALE_GENERAL', 'GENERAL_TRADE'];
const PURCHASE_INVOICE_TYPES: InvoiceType[] = ['PURCHASE_MAAL', 'KACHI_MAAL', 'PURCHASE_GENERAL', 'GENERAL_TRADE'];

const MULTI_LEG_VOUCHER_TYPES: VoucherType[] = [
  'KACHI',
  'PURCHASE_MAAL',
  'SALE_PAUNCH',
  'SALE_COMMISSION',
  'PURCHASE_GENERAL',
  'SALE_GENERAL',
  'GENERAL_TRADE',
];

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatApprovalAmount(amount: number): string {
  return roundMoney(amount).toLocaleString('en-PK');
}

export function accountRef(name: string, code: string, amount?: number): ApprovalAccountRef {
  if (amount != null && Number.isFinite(amount)) {
    return { name, code, amount: roundMoney(amount) };
  }
  return { name, code };
}

/** Merge duplicate account refs (same name+code) by summing amounts. */
export function aggregateAccountRefs(refs: ApprovalAccountRef[]): ApprovalAccountRef[] {
  const map = new Map<string, ApprovalAccountRef>();
  for (const ref of refs) {
    if (!ref.name.trim()) continue;
    const key = `${ref.code}\0${ref.name}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...ref });
      continue;
    }
    if (ref.amount != null || existing.amount != null) {
      existing.amount = roundMoney((existing.amount ?? 0) + (ref.amount ?? 0));
    }
  }
  return Array.from(map.values());
}

export function sumAccountRefAmounts(refs: ApprovalAccountRef[]): number | null {
  if (refs.length === 0) return null;
  if (!refs.every((ref) => ref.amount != null && Number.isFinite(ref.amount))) return null;
  return roundMoney(refs.reduce((sum, ref) => sum + (ref.amount ?? 0), 0));
}

function sideAccounts(
  side: OpeningBalanceSide,
  primary: ApprovalAccountRef,
  amount: number,
): { debitAccount: ApprovalAccountRef | null; creditAccount: ApprovalAccountRef | null } {
  const primaryWithAmount =
    amount > 0 ? accountRef(primary.name, primary.code, amount) : accountRef(primary.name, primary.code);
  const equityWithAmount =
    amount > 0 ? accountRef(EQUITY_REF.name, EQUITY_REF.code, amount) : { ...EQUITY_REF };

  if (!(amount > 0)) {
    return { debitAccount: primaryWithAmount, creditAccount: null };
  }
  if (side === 'DR') {
    return { debitAccount: primaryWithAmount, creditAccount: equityWithAmount };
  }
  return { debitAccount: equityWithAmount, creditAccount: primaryWithAmount };
}

function voucherBaseTypeLabel(type: VoucherType): string {
  switch (type) {
    case 'PAYMENT':
      return 'Payment';
    case 'RECEIPT':
      return 'Receipt';
    case 'JOURNAL':
      return 'Journal';
    case 'KACHI':
      return 'Kachi';
    case 'PURCHASE_MAAL':
      return 'Purchase Maal';
    case 'SALE_PAUNCH':
      return 'Sale Paunch';
    case 'SALE_COMMISSION':
      return 'Sale Commission';
    case 'PURCHASE_GENERAL':
      return 'Purchase General';
    case 'SALE_GENERAL':
      return 'Sale General';
    case 'GENERAL_TRADE':
      return 'General Trade';
    default:
      return type;
  }
}

export function voucherApprovalTypeLabel(voucher: {
  type: VoucherType;
  invoiceLink?: { invoice?: { type: InvoiceType } | null } | null;
}): string {
  const base = voucherBaseTypeLabel(voucher.type);
  const invoiceType = voucher.invoiceLink?.invoice?.type;
  if (invoiceType && SALE_INVOICE_TYPES.includes(invoiceType) && voucher.type === 'RECEIPT') {
    return 'Receipt (Sale)';
  }
  if (invoiceType && PURCHASE_INVOICE_TYPES.includes(invoiceType) && voucher.type === 'PAYMENT') {
    return 'Payment (Purchase)';
  }
  return base;
}

export function voucherApprovalAccounts(
  voucher: {
    type: VoucherType;
    debitAccount?: { name: string; code: string } | null;
    creditAccount?: { name: string; code: string } | null;
  },
  amount?: number | null,
): { debitAccount: ApprovalAccountRef | null; creditAccount: ApprovalAccountRef | null } {
  if (MULTI_LEG_VOUCHER_TYPES.includes(voucher.type)) {
    return { debitAccount: null, creditAccount: null };
  }
  const amt = amount != null && Number.isFinite(Number(amount)) ? Number(amount) : undefined;
  return {
    debitAccount: voucher.debitAccount
      ? accountRef(voucher.debitAccount.name, voucher.debitAccount.code, amt)
      : null,
    creditAccount: voucher.creditAccount
      ? accountRef(voucher.creditAccount.name, voucher.creditAccount.code, amt)
      : null,
  };
}

export function kindDisplayLabel(kind: ApprovalKind): string {
  switch (kind) {
    case 'account':
      return 'Account';
    case 'product':
      return 'Product';
    case 'voucher':
      return 'Voucher';
    case 'invoice':
      return 'Invoice';
    case 'account-adjustment':
      return 'Acct Adj.';
    case 'stock-adjustment':
      return 'Stock Adj.';
    default:
      return kind;
  }
}

export function invoiceTypeLabel(type: InvoiceType): string {
  return INVOICE_TYPE_LABELS[type] ?? type;
}

/** Display names for General Goods system accounts (must match ensureGeneralGoodsAccounts). */
export const GENERAL_GOODS_MAZDURI_ACCOUNT_NAME = 'General Goods Mazduri';
export const GENERAL_GOODS_SALE_REVENUE_ACCOUNT_NAME = 'General Goods Sale Revenue';
export const GENERAL_TRADE_REVENUE_ACCOUNT_NAME = 'General Trade Revenue';

export function joinApprovalAccounts(refs: ApprovalAccountRef[]): ApprovalAccountRef | null {
  const cleaned = aggregateAccountRefs(refs);
  if (cleaned.length === 0) return null;
  if (cleaned.length === 1) return cleaned[0];
  const total = sumAccountRefAmounts(cleaned);
  // Embed amounts in the joined label — single amount field cannot represent multiple legs.
  return {
    name: cleaned
      .map((ref) => {
        return ref.amount != null ? `${ref.name}: ${formatApprovalAmount(ref.amount)}` : ref.name;
      })
      .join('; '),
    code: '',
    ...(total != null ? { amount: total } : {}),
  };
}

type ProductAccountLine = {
  quantity?: unknown;
  rate?: unknown;
  lineTotal?: unknown;
  mazduriAmount?: unknown;
  unitCost?: unknown;
  product?: {
    name?: string | null;
    code?: string | null;
    account?: { name: string; code: string } | null;
  } | null;
};

type SalePaunchAccountLine = {
  netUpperAmount?: unknown;
  maalKhataAccount?: { name: string; code: string } | null;
};

function productLedgerRef(line: ProductAccountLine, amount?: number): ApprovalAccountRef | null {
  const account = line.product?.account;
  if (account?.name) return accountRef(account.name, account.code, amount);
  if (line.product?.name) return accountRef(line.product.name, line.product.code ?? '', amount);
  return null;
}

export type InvoiceApprovalAccountsResult = {
  debitAccount: ApprovalAccountRef | null;
  creditAccount: ApprovalAccountRef | null;
  debitAmount: number | null;
  creditAmount: number | null;
};

/**
 * Debit/credit preview for Pending Approvals.
 * Grain invoices use invoice.debitAccount + invoice.product.account (or Sale Paunch Maal Khata lines).
 * General Goods preview the real multi-leg posting (product ↔ party ± mazduri/revenue).
 */
export function invoiceApprovalAccounts(invoice: {
  type: InvoiceType;
  total?: unknown;
  debitAccount?: { name: string; code: string } | null;
  product?: {
    name: string;
    code: string;
    account?: { name: string; code: string } | null;
  } | null;
  partyAccount?: { name: string; code: string } | null;
  salePartyAccount?: { name: string; code: string } | null;
  generalPurchaseLines?: Array<ProductAccountLine>;
  generalSaleLines?: Array<ProductAccountLine>;
  salePaunchLines?: Array<SalePaunchAccountLine>;
}): InvoiceApprovalAccountsResult {
  if (invoice.type === 'PURCHASE_GENERAL') {
    const lines = invoice.generalPurchaseLines ?? [];
    const debitRefs = lines
      .map((line) => {
        const lineTotal = Math.max(0, Number(line.lineTotal ?? Number(line.quantity ?? 0) * Number(line.rate ?? 0)));
        const mazduri = Math.max(0, Number(line.mazduriAmount ?? 0));
        const inventoryDebit = roundMoney(lineTotal + mazduri);
        return productLedgerRef(line, inventoryDebit > 0 ? inventoryDebit : undefined);
      })
      .filter((ref): ref is ApprovalAccountRef => ref != null);
    const creditRefs: ApprovalAccountRef[] = [];
    const goodsTotal = roundMoney(
      lines.reduce(
        (sum, line) =>
          sum + Math.max(0, Number(line.lineTotal ?? Number(line.quantity ?? 0) * Number(line.rate ?? 0))),
        0,
      ),
    );
    if (invoice.partyAccount) {
      creditRefs.push(
        accountRef(
          invoice.partyAccount.name,
          invoice.partyAccount.code,
          goodsTotal > 0 ? goodsTotal : undefined,
        ),
      );
    }
    const mazduriTotal = roundMoney(
      lines.reduce((sum, line) => sum + Math.max(0, Number(line.mazduriAmount ?? 0)), 0),
    );
    if (mazduriTotal > 0) {
      creditRefs.push(accountRef(GENERAL_GOODS_MAZDURI_ACCOUNT_NAME, 'GG-MAZ', mazduriTotal));
    }
    const debitAccount = joinApprovalAccounts(debitRefs);
    const creditAccount = joinApprovalAccounts(creditRefs);
    return withSideTotals(debitAccount, creditAccount, 'PURCHASE_GENERAL');
  }

  if (invoice.type === 'SALE_GENERAL') {
    const lines = invoice.generalSaleLines ?? [];
    const debitRefs: ApprovalAccountRef[] = [];
    const creditRefs: ApprovalAccountRef[] = [];
    let saleTotal = 0;
    let revenueCredit = 0;
    let revenueDebit = 0;
    for (const line of lines) {
      const qty = Number(line.quantity ?? 0);
      const rate = Number(line.rate ?? 0);
      const unitCost = Math.max(0, Number(line.unitCost ?? 0));
      const lineTotal = roundMoney(qty * rate);
      const costAmount = roundMoney(qty * unitCost);
      const profitAmount = roundMoney(lineTotal - costAmount);
      saleTotal = roundMoney(saleTotal + lineTotal);
      if (costAmount > 0) {
        const productRef = productLedgerRef(line, costAmount);
        if (productRef) creditRefs.push(productRef);
      }
      if (profitAmount > 0) revenueCredit = roundMoney(revenueCredit + profitAmount);
      if (profitAmount < 0) revenueDebit = roundMoney(revenueDebit + Math.abs(profitAmount));
    }
    if (invoice.salePartyAccount) {
      debitRefs.push(
        accountRef(
          invoice.salePartyAccount.name,
          invoice.salePartyAccount.code,
          saleTotal > 0 ? saleTotal : undefined,
        ),
      );
    }
    if (revenueCredit > 0) {
      creditRefs.push(accountRef(GENERAL_GOODS_SALE_REVENUE_ACCOUNT_NAME, 'GG-PREV', revenueCredit));
    }
    if (revenueDebit > 0) {
      debitRefs.push(accountRef(GENERAL_GOODS_SALE_REVENUE_ACCOUNT_NAME, 'GG-PREV', revenueDebit));
    }
    const debitAccount = joinApprovalAccounts(debitRefs);
    const creditAccount = joinApprovalAccounts(creditRefs);
    return withSideTotals(debitAccount, creditAccount, 'SALE_GENERAL');
  }

  if (invoice.type === 'GENERAL_TRADE') {
    const purchaseLines = invoice.generalPurchaseLines ?? [];
    const saleLines = invoice.generalSaleLines ?? [];
    const purchaseTotal = roundMoney(
      purchaseLines.reduce(
        (sum, line) =>
          sum + Math.max(0, Number(line.lineTotal ?? Number(line.quantity ?? 0) * Number(line.rate ?? 0))),
        0,
      ),
    );
    const saleTotal = roundMoney(
      saleLines.reduce(
        (sum, line) =>
          sum + Math.max(0, Number(line.lineTotal ?? Number(line.quantity ?? 0) * Number(line.rate ?? 0))),
        0,
      ),
    );
    const margin = roundMoney(saleTotal - purchaseTotal);
    const debitRefs: ApprovalAccountRef[] = [];
    const creditRefs: ApprovalAccountRef[] = [];
    if (invoice.salePartyAccount) {
      debitRefs.push(
        accountRef(
          invoice.salePartyAccount.name,
          invoice.salePartyAccount.code,
          saleTotal > 0 ? saleTotal : undefined,
        ),
      );
    }
    if (invoice.partyAccount) {
      creditRefs.push(
        accountRef(
          invoice.partyAccount.name,
          invoice.partyAccount.code,
          purchaseTotal > 0 ? purchaseTotal : undefined,
        ),
      );
    }
    if (margin > 0) {
      creditRefs.push(accountRef(GENERAL_TRADE_REVENUE_ACCOUNT_NAME, 'GT-PREV', margin));
    } else if (margin < 0) {
      debitRefs.push(accountRef(GENERAL_TRADE_REVENUE_ACCOUNT_NAME, 'GT-PREV', Math.abs(margin)));
    }
    return withSideTotals(
      joinApprovalAccounts(debitRefs),
      joinApprovalAccounts(creditRefs),
      'GENERAL_TRADE',
    );
  }

  if (invoice.type === 'SALE_PAUNCH') {
    const lines = invoice.salePaunchLines ?? [];
    const creditRefs = lines
      .map((line) => {
        const account = line.maalKhataAccount;
        if (!account?.name) return null;
        const netUpper = Math.max(0, Number(line.netUpperAmount ?? 0));
        return accountRef(account.name, account.code, netUpper > 0 ? netUpper : undefined);
      })
      .filter((ref): ref is ApprovalAccountRef => ref != null);

    const saleParty = invoice.salePartyAccount ?? invoice.debitAccount;
    const invoiceTotal = Number(invoice.total ?? 0);
    const debitAccount = saleParty
      ? accountRef(
          saleParty.name,
          saleParty.code,
          invoiceTotal > 0 ? invoiceTotal : undefined,
        )
      : null;
    const creditAccount = joinApprovalAccounts(creditRefs);
    return withSideTotals(debitAccount, creditAccount, 'SALE_PAUNCH');
  }

  const invoiceTotal = Number(invoice.total ?? 0);
  const amt = invoiceTotal > 0 ? invoiceTotal : undefined;
  const debitAccount = invoice.debitAccount
    ? accountRef(invoice.debitAccount.name, invoice.debitAccount.code, amt)
    : null;
  const creditAccount = invoice.product?.account
    ? accountRef(invoice.product.account.name, invoice.product.account.code, amt)
    : invoice.product
      ? accountRef(invoice.product.name, invoice.product.code, amt)
      : null;
  return withSideTotals(debitAccount, creditAccount, invoice.type);
}

function withSideTotals(
  debitAccount: ApprovalAccountRef | null,
  creditAccount: ApprovalAccountRef | null,
  context: string,
): InvoiceApprovalAccountsResult {
  const debitAmount = debitAccount?.amount ?? null;
  const creditAmount = creditAccount?.amount ?? null;
  if (
    debitAmount != null &&
    creditAmount != null &&
    Math.abs(debitAmount - creditAmount) > 0.01
  ) {
    logger.warn('Pending approval debit/credit amounts do not balance', {
      context,
      debitAmount,
      creditAmount,
    });
  }
  return { debitAccount, creditAccount, debitAmount, creditAmount };
}

/**
 * Resolve list-row debit/credit totals for any approval kind.
 * Simple 2-leg records use the shared `amount` on both sides.
 */
export function resolveApprovalSideAmounts(input: {
  kind: ApprovalKind;
  amount?: number | null;
  debitAccount?: ApprovalAccountRef | null;
  creditAccount?: ApprovalAccountRef | null;
  /** Precomputed from invoiceApprovalAccounts when available. */
  invoiceDebitAmount?: number | null;
  invoiceCreditAmount?: number | null;
}): { debitAmount: number | null; creditAmount: number | null } {
  if (input.kind === 'invoice') {
    const debitAmount = input.invoiceDebitAmount ?? input.debitAccount?.amount ?? input.amount ?? null;
    const creditAmount =
      input.invoiceCreditAmount ?? input.creditAccount?.amount ?? input.amount ?? null;
    const intentionalSides =
      input.invoiceDebitAmount != null && input.invoiceCreditAmount != null;
    if (
      !intentionalSides &&
      debitAmount != null &&
      creditAmount != null &&
      Math.abs(debitAmount - creditAmount) > 0.01
    ) {
      logger.warn('Pending approval list debit/credit amounts do not balance', {
        kind: input.kind,
        debitAmount,
        creditAmount,
      });
    }
    return {
      debitAmount: debitAmount != null ? roundMoney(debitAmount) : null,
      creditAmount: creditAmount != null ? roundMoney(creditAmount) : null,
    };
  }

  const amount =
    input.amount != null && Number.isFinite(Number(input.amount))
      ? roundMoney(Number(input.amount))
      : null;
  return { debitAmount: amount, creditAmount: amount };
}

/** Readable pending-approval description for General Goods invoices (else tafseel/notes). */
export function invoiceApprovalDescription(invoice: {
  type: InvoiceType;
  tafseel?: string | null;
  notes?: string | null;
  partyAccount?: { name: string } | null;
  salePartyAccount?: { name: string } | null;
  generalPurchaseLines?: Array<{
    quantity: unknown;
    rate: unknown;
    product?: { name: string } | null;
  }>;
  generalSaleLines?: Array<{
    quantity: unknown;
    rate: unknown;
    product?: { name: string } | null;
  }>;
}): string | null {
  if (invoice.type === 'PURCHASE_GENERAL') {
    const lines: GeneralGoodsLineDescInput[] = (invoice.generalPurchaseLines ?? [])
      .filter((line) => line.product?.name)
      .map((line) => ({
        productName: line.product!.name,
        quantity: Number(line.quantity),
        rate: Number(line.rate),
      }));
    return generalPurchaseApprovalDescription(lines, invoice.partyAccount?.name);
  }
  if (invoice.type === 'SALE_GENERAL') {
    const lines: GeneralGoodsLineDescInput[] = (invoice.generalSaleLines ?? [])
      .filter((line) => line.product?.name)
      .map((line) => ({
        productName: line.product!.name,
        quantity: Number(line.quantity),
        rate: Number(line.rate),
      }));
    return generalSaleApprovalDescription(lines, invoice.salePartyAccount?.name);
  }
  if (invoice.type === 'GENERAL_TRADE') {
    const purchaseLines: GeneralGoodsLineDescInput[] = (invoice.generalPurchaseLines ?? [])
      .filter((line) => line.product?.name)
      .map((line) => ({
        productName: line.product!.name,
        quantity: Number(line.quantity),
        rate: Number(line.rate),
      }));
    const saleLines: GeneralGoodsLineDescInput[] = (invoice.generalSaleLines ?? [])
      .filter((line) => line.product?.name)
      .map((line) => ({
        productName: line.product!.name,
        quantity: Number(line.quantity),
        rate: Number(line.rate),
      }));
    const purchaseDesc = generalPurchaseApprovalDescription(
      purchaseLines,
      invoice.partyAccount?.name,
    );
    const saleDesc = generalSaleApprovalDescription(saleLines, invoice.salePartyAccount?.name);
    return [purchaseDesc, saleDesc].filter(Boolean).join(' · ') || null;
  }
  return invoice.tafseel ?? invoice.notes ?? null;
}

export { sideAccounts };
