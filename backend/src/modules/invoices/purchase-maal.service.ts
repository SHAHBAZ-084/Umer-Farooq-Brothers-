import {
  BoriThelaMode,
  InvoiceStatus,
  InvoiceType,
  LedgerEntryType,
  Prisma,
  RecordStatus,
  VoucherType,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';
import {
  createMultiLegVoucherInTx,
  ensureKachiMaalAccounts,
  getActiveFinancialYearId,
  KACHI_MAAL_CATEGORY_NAMES,
  type VoucherLeg,
} from '../accounting/accounting.service';
import { resolveMaalKhataAccountForProduct } from '../products/maal-khata';
import { getSystemPreferences } from '../preferences/preferences.service';
import {
  computePurchaseMaalInvoiceTotals,
  computePurchaseMaalRow,
  roundMoney,
  splitMazduriByParty,
} from './purchase-maal.calculations';
import {
  bardanaAgainstInvoiceDescription,
  blendedLegDescription,
  purchaseMaalBlendedLegDescription,
  rowLegDescription,
  type InvoiceVoucherHeader,
  voucherReferenceFromBillNo,
} from './invoice-voucher-descriptions';
import { postPurchaseMaalStockIn } from '../stock/stock.service';
import { allocateNextInvoiceReference } from './invoice-reference';

export async function getNextPurchaseMaalReference() {
  return prisma.$transaction(async (tx) => {
    await ensureKachiMaalAccounts(tx);
    const { reference } = await allocateNextInvoiceReference(tx, InvoiceType.PURCHASE_MAAL);
    return { reference };
  });
}

export type PurchaseMaalLineInput = {
  partyAccountId: number;
  jins?: string;
  qism?: string;
  boriOrThelaMode: BoriThelaMode;
  bagCount: number;
  bhartii: number;
  dharanCount: number;
  looseKg: number;
  ratePerMaund: number;
  bardanaQty?: number | null;
  bardanaRate?: number | null;
  dammiChecked?: boolean;
};

export type CreatePurchaseMaalInput = {
  invoiceDate: string;
  productId: number;
  billNo?: string;
  gariNo?: string;
  jins?: string;
  qism?: string;
  tafseel?: string;
  marketFeeEnabled?: boolean;
  mazduriEnabled?: boolean;
  lowerBardanaMode?: BoriThelaMode | null;
  lowerBardanaQty?: number | null;
  lowerBardanaRate?: number | null;
  lines: PurchaseMaalLineInput[];
  createdById: number;
};

export type UpdatePurchaseMaalInput = Omit<CreatePurchaseMaalInput, 'createdById'>;

function bardanaAccountId(
  mode: BoriThelaMode,
  accounts: Awaited<ReturnType<typeof ensureKachiMaalAccounts>>,
) {
  return mode === BoriThelaMode.BORI ? accounts.bori.id : accounts.thela.id;
}

async function assertPurchasePartyAccount(tx: Prisma.TransactionClient, accountId: number) {
  const account = await tx.account.findFirst({
    where: { id: accountId, isActive: true, status: RecordStatus.ACTIVE },
    include: { category: true },
  });
  if (!account) throw new AppError(400, 'Invalid purchase party account');
  const name = account.category.name;
  if (
    name !== KACHI_MAAL_CATEGORY_NAMES.INT_PURCHASE
    && name !== KACHI_MAAL_CATEGORY_NAMES.EXT_PURCHASE
    && name !== KACHI_MAAL_CATEGORY_NAMES.SALE_PARTY
  ) {
    throw new AppError(
      400,
      'Party must be an Int. Purchase Party, Ext. Purchase Party, or Sale Party account',
    );
  }
  return account;
}

type ComputedLine = PurchaseMaalLineInput & {
  totalWeightKg: number;
  amount: number;
  bardanaAmount: number | null;
  dammiAmount: number;
  netCreditToParty: number;
};

function buildComputedLines(
  lines: PurchaseMaalLineInput[],
  prefs: { daamiPercent: number },
): ComputedLine[] {
  return lines.map((line) => {
    const computed = computePurchaseMaalRow(line, prefs);
    if (!(computed.amount > 0)) {
      throw new AppError(400, 'Each line must have a positive goods amount');
    }
    if (!(line.bhartii > 0)) {
      throw new AppError(400, 'Bhartii must be greater than zero on every line');
    }
    return { ...line, ...computed, dammiChecked: line.dammiChecked ?? false };
  });
}

function buildLedgerLegs(
  maalKhataAccountId: number,
  computedLines: ComputedLine[],
  totals: ReturnType<typeof computePurchaseMaalInvoiceTotals>,
  systemAccounts: Awaited<ReturnType<typeof ensureKachiMaalAccounts>>,
  lowerBardanaMode: BoriThelaMode | null | undefined,
  mazduriEnabled: boolean,
  header: InvoiceVoucherHeader,
  invoiceReference: string,
) {
  const legs: VoucherLeg[] = [];
  const allLines = computedLines;
  const bardanaDesc = bardanaAgainstInvoiceDescription(invoiceReference);

  const totalBardanaAmount = roundMoney(
    computedLines.reduce((sum, line) => sum + (line.bardanaAmount ?? 0), 0),
  );
  const invoiceExpenses = {
    totalGoodsAmount: totals.totalGoodsAmount,
    totalDammiAmount: totals.totalDammiAmount,
    totalBardanaAmount,
    marketFeeAmount: totals.marketFeeAmount,
    mazduriAmount: totals.mazduriAmount,
  };

  if (totals.totalDebitAmount > 0) {
    legs.push({
      accountId: maalKhataAccountId,
      type: LedgerEntryType.DEBIT,
      amount: totals.totalDebitAmount,
      description: purchaseMaalBlendedLegDescription(allLines, header, invoiceExpenses),
    });
  }

  const mazduriShares = mazduriEnabled
    ? splitMazduriByParty(computedLines, totals.mazduriAmount, totals.totalGoodsAmount)
    : new Map<number, number>();

  // One credit per dheri (row) on the purchase party — per-row rate in description.
  // Mazduri (if any) is allocated across that party's rows proportional to goods amount.
  const linesByParty = new Map<number, ComputedLine[]>();
  for (const line of computedLines) {
    const list = linesByParty.get(line.partyAccountId) ?? [];
    list.push(line);
    linesByParty.set(line.partyAccountId, list);
  }

  for (const [partyAccountId, partyLines] of linesByParty) {
    const partyMazduri = mazduriShares.get(partyAccountId) ?? 0;
    const partyGoods = roundMoney(partyLines.reduce((sum, line) => sum + line.amount, 0));
    let mazduriAllocated = 0;

    for (let i = 0; i < partyLines.length; i += 1) {
      const line = partyLines[i]!;
      let lineMazduri = 0;
      if (partyMazduri > 0 && partyGoods > 0) {
        if (i === partyLines.length - 1) {
          lineMazduri = roundMoney(partyMazduri - mazduriAllocated);
        } else {
          lineMazduri = roundMoney((partyMazduri * line.amount) / partyGoods);
          mazduriAllocated = roundMoney(mazduriAllocated + lineMazduri);
        }
      }
      const net = roundMoney(line.amount + line.dammiAmount - lineMazduri);
      if (net <= 0) {
        throw new AppError(500, 'Party net settlement must be positive');
      }
      legs.push({
        accountId: partyAccountId,
        type: LedgerEntryType.CREDIT,
        amount: net,
        description: rowLegDescription(
          { totalWeightKg: line.totalWeightKg, ratePerMaund: line.ratePerMaund },
          header,
        ),
      });
    }
  }

  for (let i = 0; i < computedLines.length; i += 1) {
    const line = computedLines[i]!;
    if (line.bardanaAmount != null && line.bardanaAmount > 0) {
      legs.push(
        {
          accountId: bardanaAccountId(line.boriOrThelaMode, systemAccounts),
          type: LedgerEntryType.DEBIT,
          amount: line.bardanaAmount,
          description: bardanaDesc,
        },
        {
          accountId: line.partyAccountId,
          type: LedgerEntryType.CREDIT,
          amount: line.bardanaAmount,
          description: bardanaDesc,
        },
      );
    }
  }

  if (totals.lowerBardanaAmount != null && totals.lowerBardanaAmount > 0) {
    if (!lowerBardanaMode) {
      throw new AppError(400, 'Lower bardana requires Bori/Thela selection');
    }
    legs.push(
      {
        accountId: maalKhataAccountId,
        type: LedgerEntryType.DEBIT,
        amount: totals.lowerBardanaAmount,
        description: bardanaDesc,
      },
      {
        accountId: bardanaAccountId(lowerBardanaMode, systemAccounts),
        type: LedgerEntryType.CREDIT,
        amount: totals.lowerBardanaAmount,
        description: bardanaDesc,
      },
    );
  }

  if (totals.mazduriAmount > 0) {
    legs.push({
      accountId: systemAccounts.mazduri.id,
      type: LedgerEntryType.CREDIT,
      amount: totals.mazduriAmount,
      description: blendedLegDescription(allLines, header),
    });
  }

  if (totals.marketFeeAmount > 0) {
    legs.push({
      accountId: systemAccounts.marketFee.id,
      type: LedgerEntryType.CREDIT,
      amount: totals.marketFeeAmount,
      description: blendedLegDescription(allLines, header),
    });
  }

  const totalDebits = roundMoney(
    legs
      .filter((leg) => leg.type === LedgerEntryType.DEBIT)
      .reduce((sum, leg) => sum + leg.amount, 0),
  );
  const totalCredits = roundMoney(
    legs
      .filter((leg) => leg.type === LedgerEntryType.CREDIT)
      .reduce((sum, leg) => sum + leg.amount, 0),
  );

  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new AppError(500, 'Purchase Maal voucher debits and credits do not balance');
  }

  return { legs, totalDebits, totalCredits };
}

export async function createPurchaseMaalInvoice(data: CreatePurchaseMaalInput) {
  if (data.lines.length === 0) {
    throw new AppError(400, 'At least one line is required');
  }

  const prefs = await getSystemPreferences();
  const computedLines = buildComputedLines(data.lines, prefs);
  const marketFeeEnabled = data.marketFeeEnabled ?? false;
  const mazduriEnabled = data.mazduriEnabled ?? false;
  const totals = computePurchaseMaalInvoiceTotals(computedLines, prefs, {
    marketFeeEnabled,
    mazduriEnabled,
    lowerBardanaQty: data.lowerBardanaQty,
    lowerBardanaRate: data.lowerBardanaRate,
  });

  return prisma.$transaction(async (tx) => {
    await getActiveFinancialYearId(tx);
    const systemAccounts = await ensureKachiMaalAccounts(tx);
    const { product, maalKhataAccountId } = await resolveMaalKhataAccountForProduct(tx, data.productId);
    const { assertProductApprovedForPosting } = await import('../approvals/approval-guards');
    await assertProductApprovedForPosting(tx, product.id);
    for (const line of computedLines) {
      await assertPurchasePartyAccount(tx, line.partyAccountId);
    }

    const voucherHeader: InvoiceVoucherHeader = {
      tafseel: data.tafseel,
      gariNo: data.gariNo,
    };

    const { number, reference } = await allocateNextInvoiceReference(tx, InvoiceType.PURCHASE_MAAL);
    const { legs, totalDebits, totalCredits } = buildLedgerLegs(
      maalKhataAccountId,
      computedLines,
      totals,
      systemAccounts,
      data.lowerBardanaMode,
      mazduriEnabled,
      voucherHeader,
      reference,
    );

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new AppError(500, 'Invoice debits and credits do not balance — save aborted');
    }

    const financialYearId = await getActiveFinancialYearId(tx);
    const invoiceDate = new Date(data.invoiceDate);

    const invoice = await tx.invoice.create({
      data: {
        type: InvoiceType.PURCHASE_MAAL,
        status: InvoiceStatus.PENDING_APPROVAL,
        number,
        reference,
        invoiceDate,
        billNo: data.billNo?.trim() || null,
        gariNo: data.gariNo?.trim() || null,
        jins: data.jins?.trim() || product.name,
        qism: data.qism?.trim() || null,
        tafseel: data.tafseel?.trim() || null,
        notes: data.tafseel?.trim() || null,
        productId: product.id,
        legacyInventoryPosting: false,
        debitAccountId: maalKhataAccountId,
        marketFeeEnabled,
        mazduriEnabled,
        lowerBardanaMode: data.lowerBardanaMode ?? null,
        lowerBardanaQty: data.lowerBardanaQty ?? null,
        lowerBardanaRate: data.lowerBardanaRate ?? null,
        lowerBardanaAmount: totals.lowerBardanaAmount,
        total: totals.totalDebitAmount,
        financialYearId,
        createdById: data.createdById,
        purchaseMaalLines: {
          create: computedLines.map((line, index) => ({
            partyAccountId: line.partyAccountId,
            jins: line.jins?.trim() || null,
            qism: line.qism?.trim() || null,
            boriOrThelaMode: line.boriOrThelaMode,
            bagCount: line.bagCount,
            bhartii: line.bhartii,
            dharanCount: line.dharanCount,
            looseKg: line.looseKg,
            totalWeightKg: line.totalWeightKg,
            ratePerMaund: line.ratePerMaund,
            amount: line.amount,
            bardanaQty: line.bardanaQty ?? null,
            bardanaRate: line.bardanaRate ?? null,
            bardanaAmount: line.bardanaAmount,
            dammiChecked: line.dammiChecked ?? false,
            dammiAmount: line.dammiAmount,
            netCreditToParty: line.netCreditToParty,
            sortOrder: index,
          })),
        },
      },
    });

    return tx.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: {
        purchaseMaalLines: { include: { partyAccount: true }, orderBy: { sortOrder: 'asc' } },
        product: { include: { account: true } },
        debitAccount: true,
        createdBy: { select: { id: true, displayName: true, username: true } },
      },
    });
  });
}

export async function updatePendingPurchaseMaalInvoice(
  invoiceId: number,
  data: UpdatePurchaseMaalInput,
  userId: number,
) {
  void userId;
  if (data.lines.length === 0) {
    throw new AppError(400, 'At least one line is required');
  }

  const prefs = await getSystemPreferences();
  const computedLines = buildComputedLines(data.lines, prefs);
  const marketFeeEnabled = data.marketFeeEnabled ?? false;
  const mazduriEnabled = data.mazduriEnabled ?? false;
  const totals = computePurchaseMaalInvoiceTotals(computedLines, prefs, {
    marketFeeEnabled,
    mazduriEnabled,
    lowerBardanaQty: data.lowerBardanaQty,
    lowerBardanaRate: data.lowerBardanaRate,
  });

  return prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findFirst({
      where: {
        id: invoiceId,
        type: InvoiceType.PURCHASE_MAAL,
        status: InvoiceStatus.PENDING_APPROVAL,
      },
      select: { id: true, reference: true },
    });
    if (!existing) throw new AppError(404, 'Pending Purchase Maal invoice not found');

    await getActiveFinancialYearId(tx);
    const systemAccounts = await ensureKachiMaalAccounts(tx);
    const { product, maalKhataAccountId } = await resolveMaalKhataAccountForProduct(tx, data.productId);
    const { assertProductApprovedForPosting } = await import('../approvals/approval-guards');
    await assertProductApprovedForPosting(tx, product.id);
    for (const line of computedLines) {
      await assertPurchasePartyAccount(tx, line.partyAccountId);
    }

    const voucherHeader: InvoiceVoucherHeader = {
      tafseel: data.tafseel,
      gariNo: data.gariNo,
    };

    const { legs, totalDebits, totalCredits } = buildLedgerLegs(
      maalKhataAccountId,
      computedLines,
      totals,
      systemAccounts,
      data.lowerBardanaMode,
      mazduriEnabled,
      voucherHeader,
      existing.reference,
    );

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new AppError(500, 'Invoice debits and credits do not balance — save aborted');
    }

    await tx.purchaseMaalLine.deleteMany({ where: { invoiceId: existing.id } });
    await tx.invoice.update({
      where: { id: existing.id },
      data: {
        invoiceDate: new Date(data.invoiceDate),
        billNo: data.billNo?.trim() || null,
        gariNo: data.gariNo?.trim() || null,
        jins: data.jins?.trim() || product.name,
        qism: data.qism?.trim() || null,
        tafseel: data.tafseel?.trim() || null,
        notes: data.tafseel?.trim() || null,
        productId: product.id,
        legacyInventoryPosting: false,
        debitAccountId: maalKhataAccountId,
        marketFeeEnabled,
        mazduriEnabled,
        lowerBardanaMode: data.lowerBardanaMode ?? null,
        lowerBardanaQty: data.lowerBardanaQty ?? null,
        lowerBardanaRate: data.lowerBardanaRate ?? null,
        lowerBardanaAmount: totals.lowerBardanaAmount,
        total: totals.totalDebitAmount,
        purchaseMaalLines: {
          create: computedLines.map((line, index) => ({
            partyAccountId: line.partyAccountId,
            jins: line.jins?.trim() || null,
            qism: line.qism?.trim() || null,
            boriOrThelaMode: line.boriOrThelaMode,
            bagCount: line.bagCount,
            bhartii: line.bhartii,
            dharanCount: line.dharanCount,
            looseKg: line.looseKg,
            totalWeightKg: line.totalWeightKg,
            ratePerMaund: line.ratePerMaund,
            amount: line.amount,
            bardanaQty: line.bardanaQty ?? null,
            bardanaRate: line.bardanaRate ?? null,
            bardanaAmount: line.bardanaAmount,
            dammiChecked: line.dammiChecked ?? false,
            dammiAmount: line.dammiAmount,
            netCreditToParty: line.netCreditToParty,
            sortOrder: index,
          })),
        },
      },
    });

    void legs;

    return tx.invoice.findUniqueOrThrow({
      where: { id: existing.id },
      include: {
        purchaseMaalLines: { include: { partyAccount: true }, orderBy: { sortOrder: 'asc' } },
        product: { include: { account: true } },
        debitAccount: true,
        createdBy: { select: { id: true, displayName: true, username: true } },
      },
    });
  });
}

export async function previewPurchaseMaalTotals(data: {
  lines: PurchaseMaalLineInput[];
  marketFeeEnabled?: boolean;
  mazduriEnabled?: boolean;
  lowerBardanaQty?: number | null;
  lowerBardanaRate?: number | null;
}) {
  const prefs = await getSystemPreferences();
  const computedLines = data.lines.map((line) => ({
    ...computePurchaseMaalRow(line, prefs),
    bhartii: line.bhartii,
    dammiAmount: computePurchaseMaalRow(line, prefs).dammiAmount,
  }));
  return computePurchaseMaalInvoiceTotals(computedLines, prefs, {
    marketFeeEnabled: data.marketFeeEnabled ?? false,
    mazduriEnabled: data.mazduriEnabled ?? false,
    lowerBardanaQty: data.lowerBardanaQty,
    lowerBardanaRate: data.lowerBardanaRate,
  });
}

export async function approvePendingPurchaseMaalInvoice(
  tx: Prisma.TransactionClient,
  invoiceId: number,
) {
  const invoice = await tx.invoice.findFirst({
    where: {
      id: invoiceId,
      type: InvoiceType.PURCHASE_MAAL,
      status: InvoiceStatus.PENDING_APPROVAL,
    },
    include: {
      purchaseMaalLines: { orderBy: { sortOrder: 'asc' } },
      product: true,
    },
  });
  if (!invoice) throw new AppError(404, 'Pending Purchase Maal invoice not found');
  if (!invoice.productId) throw new AppError(400, 'Invoice missing product');

  const existingLink = await tx.invoiceVoucher.findFirst({ where: { invoiceId } });
  if (existingLink) throw new AppError(400, 'Invoice already posted');

  const { assertProductApprovedForPosting } = await import('../approvals/approval-guards');
  await assertProductApprovedForPosting(tx, invoice.productId);

  const { product, maalKhataAccountId } = await resolveMaalKhataAccountForProduct(tx, invoice.productId);

  const prefs = await getSystemPreferences();
  const lineInputs: PurchaseMaalLineInput[] = invoice.purchaseMaalLines.map((line) => ({
    partyAccountId: line.partyAccountId,
    jins: line.jins ?? undefined,
    qism: line.qism ?? undefined,
    boriOrThelaMode: line.boriOrThelaMode,
    bagCount: Number(line.bagCount),
    bhartii: Number(line.bhartii),
    dharanCount: Number(line.dharanCount),
    looseKg: Number(line.looseKg),
    ratePerMaund: Number(line.ratePerMaund),
    bardanaQty: line.bardanaQty != null ? Number(line.bardanaQty) : null,
    bardanaRate: line.bardanaRate != null ? Number(line.bardanaRate) : null,
    dammiChecked: line.dammiChecked,
  }));

  const computedLines = buildComputedLines(lineInputs, prefs);
  const marketFeeEnabled = invoice.marketFeeEnabled;
  const mazduriEnabled = invoice.mazduriEnabled;
  const totals = computePurchaseMaalInvoiceTotals(computedLines, prefs, {
    marketFeeEnabled,
    mazduriEnabled,
    lowerBardanaQty: invoice.lowerBardanaQty != null ? Number(invoice.lowerBardanaQty) : null,
    lowerBardanaRate: invoice.lowerBardanaRate != null ? Number(invoice.lowerBardanaRate) : null,
  });

  const systemAccounts = await ensureKachiMaalAccounts(tx);
  const voucherHeader: InvoiceVoucherHeader = {
    tafseel: invoice.tafseel,
    gariNo: invoice.gariNo,
  };

  const { legs, totalDebits, totalCredits } = buildLedgerLegs(
    maalKhataAccountId,
    computedLines,
    totals,
    systemAccounts,
    invoice.lowerBardanaMode,
    mazduriEnabled,
    voucherHeader,
    invoice.reference,
  );

  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new AppError(500, 'Invoice debits and credits do not balance');
  }

  const voucher = await createMultiLegVoucherInTx(tx, {
    type: VoucherType.PURCHASE_MAAL,
    legs,
    amount: totalDebits,
    date: invoice.invoiceDate ?? invoice.createdAt,
    description: `Purchase Maal Invoice ${invoice.reference}`,
    reference: voucherReferenceFromBillNo(invoice.billNo),
    createdById: invoice.createdById,
  });

  await tx.invoiceVoucher.create({
    data: { invoiceId: invoice.id, voucherId: voucher.id },
  });

  const invoiceDate = invoice.invoiceDate ?? invoice.createdAt;
  await postPurchaseMaalStockIn(tx, {
    productId: product.id,
    invoiceId: invoice.id,
    invoiceReference: invoice.reference,
    invoiceDate,
    lines: computedLines.map((line) => ({
      boriOrThelaMode: line.boriOrThelaMode,
      bagCount: line.bagCount,
      bhartii: line.bhartii,
      dharanCount: line.dharanCount,
      looseKg: line.looseKg,
    })),
  });

  return tx.invoice.update({
    where: { id: invoice.id },
    data: { status: InvoiceStatus.POSTED },
    include: {
      purchaseMaalLines: { include: { partyAccount: true }, orderBy: { sortOrder: 'asc' } },
      product: { include: { account: true } },
      vouchers: { include: { voucher: { include: { ledgerEntries: true } } } },
      debitAccount: true,
      createdBy: { select: { id: true, displayName: true, username: true } },
    },
  });
}
