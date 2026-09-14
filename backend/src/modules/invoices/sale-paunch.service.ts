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
  createSalePaunchVoucherInTx,
  ensureSalePaunchAccounts,
  getActiveFinancialYearId,
  KACHI_MAAL_CATEGORY_NAMES,
  type SalePaunchSystemAccounts,
  type VoucherLeg,
} from '../accounting/accounting.service';
import { isMaalKhataCategoryName } from '../products/maal-khata';
import { getSystemPreferences } from '../preferences/preferences.service';
import {
  bardanaAgainstInvoiceDescription,
  salePaunchCreditLegDescription,
  salePaunchDebitLegDescription,
  salePaunchFeeLegDescription,
  type InvoiceVoucherHeader,
  voucherReferenceFromBillNo,
} from './invoice-voucher-descriptions';
import {
  computeSalePaunchInvoiceTotals,
  computeSalePaunchRow,
  roundMoney,
} from './sale-paunch.calculations';
import { postSalePaunchEmptyBardanaOut } from '../inventory/bardana.service';
import { postSalePaunchStockOut } from '../stock/stock.service';
import { allocateNextInvoiceReference } from './invoice-reference';

export async function getNextSalePaunchReference() {
  return prisma.$transaction(async (tx) => {
    await ensureSalePaunchAccounts(tx);
    const { reference } = await allocateNextInvoiceReference(tx, InvoiceType.SALE_PAUNCH);
    return { reference };
  });
}

export type SalePaunchLineInput = {
  maalKhataAccountId: number;
  jins?: string;
  qism?: string;
  boriOrThelaMode: BoriThelaMode;
  bagCount: number;
  thelaCount?: number;
  /** Computer weight in kg — primary weight input. */
  compWeightKg: number;
  kaatKg?: number;
  lowerKaatKg?: number;
  upperRatePerMaund: number;
  lowerRatePerMaund: number;
  kanta?: number;
  bardanaQty?: number | null;
  bardanaRate?: number | null;
  dammiChecked?: boolean;
};

export type CreateSalePaunchInput = {
  invoiceDate: string;
  salePartyAccountId: number;
  billNo?: string;
  gariNo?: string;
  jins?: string;
  qism?: string;
  tafseel?: string;
  taxAmount?: number;
  biltyKirayaAmount?: number;
  miscAmount?: number;
  lowerBardanaMode?: BoriThelaMode | null;
  lowerBardanaQty?: number | null;
  lowerBardanaRate?: number | null;
  lines: SalePaunchLineInput[];
  createdById: number;
};

export type UpdateSalePaunchInput = Omit<CreateSalePaunchInput, 'createdById'>;

function bardanaAccountId(
  mode: BoriThelaMode,
  accounts: SalePaunchSystemAccounts,
) {
  return mode === BoriThelaMode.BORI ? accounts.bori.id : accounts.thela.id;
}

async function assertSalePartyAccount(tx: Prisma.TransactionClient, accountId: number) {
  const account = await tx.account.findFirst({
    where: { id: accountId, isActive: true, status: RecordStatus.ACTIVE },
    include: { category: true },
  });
  if (!account) throw new AppError(400, 'Invalid sale party account');
  const name = account.category.name;
  if (
    name !== KACHI_MAAL_CATEGORY_NAMES.INT_PURCHASE
    && name !== KACHI_MAAL_CATEGORY_NAMES.EXT_PURCHASE
    && name !== KACHI_MAAL_CATEGORY_NAMES.SALE_PARTY
  ) {
    throw new AppError(
      400,
      'Settlement party must be an Int. Purchase Party, Ext. Purchase Party, or Sale Party account',
    );
  }
  return account;
}

async function assertSalePaunchLineAccount(tx: Prisma.TransactionClient, accountId: number) {
  const account = await tx.account.findFirst({
    where: { id: accountId, isActive: true, status: RecordStatus.ACTIVE },
    include: { category: true, ledger: true },
  });
  if (!account) throw new AppError(400, 'Invalid line account');
  const name = account.category.name;
  const allowed =
    isMaalKhataCategoryName(name)
    || name === KACHI_MAAL_CATEGORY_NAMES.INT_PURCHASE
    || name === KACHI_MAAL_CATEGORY_NAMES.EXT_PURCHASE;
  if (!allowed) {
    throw new AppError(
      400,
      'Line account must be a Maal Khata, Int. Purchase Party, or Ext. Purchase Party account',
    );
  }
  if (!account.ledger) {
    await tx.ledger.create({ data: { accountId: account.id, balance: 0 } });
  }
  return account;
}

type ComputedLine = SalePaunchLineInput & ReturnType<typeof computeSalePaunchRow>;

function buildComputedLines(
  lines: SalePaunchLineInput[],
  prefs: { daamiPercent: number },
): ComputedLine[] {
  return lines.map((line) => {
    const computed = computeSalePaunchRow(line, prefs);
    if (!(line.compWeightKg > 0)) {
      throw new AppError(400, 'Computer weight must be greater than zero on every line');
    }
    if (computed.kaatKg > computed.totalWeightKg) {
      throw new AppError(400, 'Upper kaat cannot exceed computer weight on any row');
    }
    if (computed.lowerKaatKg > computed.totalWeightKg) {
      throw new AppError(400, 'Lower kaat cannot exceed computer weight on any row');
    }
    if (!(computed.netUpperAmount > 0)) {
      throw new AppError(400, 'Each line must have a positive net upper amount after kanta');
    }
    if (!(computed.netWeightKg > 0)) {
      throw new AppError(400, 'Each line must have positive net weight after upper kaat');
    }
    if (!(computed.lowerNetWeightKg > 0)) {
      throw new AppError(400, 'Each line must have positive net weight after lower kaat');
    }
    if (!(computed.lowerAmount > 0)) {
      throw new AppError(400, 'Each line must have a positive lower sale amount');
    }
    return {
      ...line,
      ...computed,
      thelaCount: line.thelaCount ?? 0,
      dammiChecked: line.dammiChecked ?? false,
    };
  });
}

function buildLedgerLegs(
  salePartyAccountId: number,
  computedLines: ComputedLine[],
  totals: ReturnType<typeof computeSalePaunchInvoiceTotals>,
  systemAccounts: SalePaunchSystemAccounts,
  lowerBardanaMode: BoriThelaMode | null | undefined,
  header: InvoiceVoucherHeader,
  taxAmount: number,
  biltyKirayaAmount: number,
  miscAmount: number,
  invoiceReference: string,
  product?: string | null,
) {
  const legs: VoucherLeg[] = [];
  const allLines = computedLines;
  const bardanaDesc = bardanaAgainstInvoiceDescription(invoiceReference);
  const jins = product?.trim() || null;

  const maalKhataByAccount = new Map<number, number>();
  for (const line of computedLines) {
    const current = maalKhataByAccount.get(line.maalKhataAccountId) ?? 0;
    maalKhataByAccount.set(
      line.maalKhataAccountId,
      roundMoney(current + line.netUpperAmount),
    );
  }

  for (const [accountId, amount] of maalKhataByAccount) {
    const rowLines = allLines.filter((line) => line.maalKhataAccountId === accountId);
    legs.push({
      accountId,
      type: LedgerEntryType.CREDIT,
      amount,
      description: salePaunchCreditLegDescription(
        rowLines.map((line) => ({
          netWeightKg: line.netWeightKg,
          upperRatePerMaund: line.upperRatePerMaund,
          netUpperAmount: line.netUpperAmount,
          kanta: line.kanta,
        })),
        header,
        jins,
      ),
    });
  }

  if (totals.totalDammiAmount > 0) {
    legs.push({
      accountId: systemAccounts.commission.id,
      type: LedgerEntryType.CREDIT,
      amount: totals.totalDammiAmount,
      description: salePaunchFeeLegDescription('Dammi', totals.totalDammiAmount, header, jins),
    });
  }

  for (const line of computedLines) {
    if (line.bardanaAmount != null && line.bardanaAmount > 0) {
      legs.push(
        {
          accountId: salePartyAccountId,
          type: LedgerEntryType.DEBIT,
          amount: line.bardanaAmount,
          description: bardanaDesc,
        },
        {
          accountId: bardanaAccountId(line.boriOrThelaMode, systemAccounts),
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
        accountId: bardanaAccountId(lowerBardanaMode, systemAccounts),
        type: LedgerEntryType.DEBIT,
        amount: totals.lowerBardanaAmount,
        description: bardanaDesc,
      },
      {
        accountId: salePartyAccountId,
        type: LedgerEntryType.CREDIT,
        amount: totals.lowerBardanaAmount,
        description: bardanaDesc,
      },
    );
  }

  if (taxAmount > 0) {
    const taxDesc = salePaunchFeeLegDescription('Tax', taxAmount, header, jins);
    legs.push(
      {
        accountId: systemAccounts.taxDeduction.id,
        type: LedgerEntryType.DEBIT,
        amount: taxAmount,
        description: taxDesc,
      },
      {
        accountId: salePartyAccountId,
        type: LedgerEntryType.CREDIT,
        amount: taxAmount,
        description: taxDesc,
      },
    );
  }

  if (biltyKirayaAmount > 0) {
    // Bilty Kiraya posts Dr on Bilty account — keep description on that debit side.
    const biltyDesc = salePaunchFeeLegDescription('Bilty Kiraya', biltyKirayaAmount, header, jins);
    legs.push(
      {
        accountId: systemAccounts.biltyKiraya.id,
        type: LedgerEntryType.DEBIT,
        amount: biltyKirayaAmount,
        description: biltyDesc,
      },
      {
        accountId: salePartyAccountId,
        type: LedgerEntryType.CREDIT,
        amount: biltyKirayaAmount,
        description: biltyDesc,
      },
    );
  }

  if (miscAmount > 0) {
    legs.push({
      accountId: systemAccounts.misc.id,
      type: LedgerEntryType.CREDIT,
      amount: miscAmount,
      description: salePaunchFeeLegDescription('Misc', miscAmount, header, jins),
    });
  }

  if (totals.lowerNetTotal > 0) {
    legs.push({
      accountId: salePartyAccountId,
      type: LedgerEntryType.DEBIT,
      amount: totals.lowerNetTotal,
      description: salePaunchDebitLegDescription(
        allLines.map((line) => ({
          lowerNetWeightKg: line.lowerNetWeightKg,
          lowerRatePerMaund: line.lowerRatePerMaund,
          lowerAmount: line.lowerAmount,
        })),
        header,
        jins,
        totals.totalLowerAmount,
      ),
    });
  }

  const revenueDiff = totals.paunchRevenueDifference;
  if (Math.abs(revenueDiff) > 0) {
    // Spec: Dr Paunch Revenue when lowerNetTotal > upperNetTotal (profitable).
    // Standard REVENUE accounts increase on CREDIT — we post CREDIT here so the
    // voucher balances; confirm trial-balance display convention for "Revenue Earn".
    legs.push({
      accountId: systemAccounts.paunchRevenue.id,
      type: revenueDiff > 0 ? LedgerEntryType.CREDIT : LedgerEntryType.DEBIT,
      amount: Math.abs(revenueDiff),
      description: salePaunchFeeLegDescription(
        'Paunch revenue plug',
        Math.abs(revenueDiff),
        header,
        jins,
      ),
    });
  }

  const totalDebits = roundMoney(
    legs.filter((leg) => leg.type === LedgerEntryType.DEBIT).reduce((sum, leg) => sum + leg.amount, 0),
  );
  const totalCredits = roundMoney(
    legs.filter((leg) => leg.type === LedgerEntryType.CREDIT).reduce((sum, leg) => sum + leg.amount, 0),
  );

  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new AppError(500, 'Sale Paunch voucher debits and credits do not balance');
  }

  return { legs, totalDebits, totalCredits };
}

export async function createSalePaunchInvoice(data: CreateSalePaunchInput) {
  if (data.lines.length === 0) {
    throw new AppError(400, 'At least one line is required');
  }

  const prefs = await getSystemPreferences();
  const computedLines = buildComputedLines(data.lines, prefs);
  const taxAmount = roundMoney(Math.max(0, data.taxAmount ?? 0));
  const biltyKirayaAmount = roundMoney(Math.max(0, data.biltyKirayaAmount ?? 0));
  const miscAmount = roundMoney(Math.max(0, data.miscAmount ?? 0));
  const totals = computeSalePaunchInvoiceTotals(computedLines, {
    taxAmount,
    biltyKirayaAmount,
    miscAmount,
    lowerBardanaQty: data.lowerBardanaQty,
    lowerBardanaRate: data.lowerBardanaRate,
  });

  return prisma.$transaction(async (tx) => {
    await getActiveFinancialYearId(tx);
    const systemAccounts = await ensureSalePaunchAccounts(tx);
    await assertSalePartyAccount(tx, data.salePartyAccountId);
    for (const line of computedLines) {
      await assertSalePaunchLineAccount(tx, line.maalKhataAccountId);
    }

    const voucherHeader: InvoiceVoucherHeader = {
      tafseel: data.tafseel,
      gariNo: data.gariNo,
    };

    const { number, reference } = await allocateNextInvoiceReference(tx, InvoiceType.SALE_PAUNCH);
    const product = data.jins?.trim() || computedLines[0]?.jins?.trim() || null;
    const { legs, totalDebits, totalCredits } = buildLedgerLegs(
      data.salePartyAccountId,
      computedLines,
      totals,
      systemAccounts,
      data.lowerBardanaMode,
      voucherHeader,
      taxAmount,
      biltyKirayaAmount,
      miscAmount,
      reference,
      product,
    );

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new AppError(500, 'Invoice debits and credits do not balance — save aborted');
    }

    const financialYearId = await getActiveFinancialYearId(tx);
    const invoiceDate = new Date(data.invoiceDate);

    const invoice = await tx.invoice.create({
      data: {
        type: InvoiceType.SALE_PAUNCH,
        status: InvoiceStatus.PENDING_APPROVAL,
        number,
        reference,
        invoiceDate,
        billNo: data.billNo?.trim() || null,
        gariNo: data.gariNo?.trim() || null,
        jins: data.jins?.trim() || null,
        qism: data.qism?.trim() || null,
        tafseel: data.tafseel?.trim() || null,
        notes: data.tafseel?.trim() || null,
        debitAccountId: data.salePartyAccountId,
        miscAmount,
        taxAmount,
        biltyKirayaAmount,
        lowerBardanaMode: data.lowerBardanaMode ?? null,
        lowerBardanaQty: data.lowerBardanaQty ?? null,
        lowerBardanaRate: data.lowerBardanaRate ?? null,
        lowerBardanaAmount: totals.lowerBardanaAmount,
        total: totals.lowerNetTotal,
        financialYearId,
        createdById: data.createdById,
        salePaunchLines: {
          create: computedLines.map((line, index) => ({
            maalKhataAccountId: line.maalKhataAccountId,
            jins: line.jins?.trim() || data.jins?.trim() || null,
            qism: line.qism?.trim() || data.qism?.trim() || null,
            boriOrThelaMode: line.boriOrThelaMode,
            bagCount: line.bagCount,
            thelaCount: line.thelaCount ?? 0,
            bhartii: 0,
            dharanCount: 0,
            looseKg: 0,
            totalWeightKg: line.totalWeightKg,
            kaatKg: line.kaatKg,
            netWeightKg: line.netWeightKg,
            lowerKaatKg: line.lowerKaatKg,
            lowerNetWeightKg: line.lowerNetWeightKg,
            upperRatePerMaund: line.upperRatePerMaund,
            upperAmount: line.upperAmount,
            kanta: line.kanta,
            netUpperAmount: line.netUpperAmount,
            lowerRatePerMaund: line.lowerRatePerMaund,
            lowerAmount: line.lowerAmount,
            rowRevenue: line.rowRevenue,
            bardanaQty: line.bardanaQty ?? null,
            bardanaRate: line.bardanaRate ?? null,
            bardanaAmount: line.bardanaAmount,
            dammiChecked: line.dammiChecked ?? false,
            dammiAmount: line.dammiAmount,
            sortOrder: index,
          })),
        },
      },
    });

    return tx.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: {
        salePaunchLines: { include: { maalKhataAccount: true }, orderBy: { sortOrder: 'asc' } },
        debitAccount: true,
        createdBy: { select: { id: true, displayName: true, username: true } },
      },
    });
  });
}

export async function updatePendingSalePaunchInvoice(
  invoiceId: number,
  data: UpdateSalePaunchInput,
  userId: number,
) {
  void userId;
  if (data.lines.length === 0) {
    throw new AppError(400, 'At least one line is required');
  }

  const prefs = await getSystemPreferences();
  const computedLines = buildComputedLines(data.lines, prefs);
  const taxAmount = roundMoney(Math.max(0, data.taxAmount ?? 0));
  const biltyKirayaAmount = roundMoney(Math.max(0, data.biltyKirayaAmount ?? 0));
  const miscAmount = roundMoney(Math.max(0, data.miscAmount ?? 0));
  const totals = computeSalePaunchInvoiceTotals(computedLines, {
    taxAmount,
    biltyKirayaAmount,
    miscAmount,
    lowerBardanaQty: data.lowerBardanaQty,
    lowerBardanaRate: data.lowerBardanaRate,
  });

  return prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findFirst({
      where: {
        id: invoiceId,
        type: InvoiceType.SALE_PAUNCH,
        status: InvoiceStatus.PENDING_APPROVAL,
      },
      select: { id: true, reference: true },
    });
    if (!existing) throw new AppError(404, 'Pending Sale Paunch invoice not found');

    await getActiveFinancialYearId(tx);
    const systemAccounts = await ensureSalePaunchAccounts(tx);
    await assertSalePartyAccount(tx, data.salePartyAccountId);
    for (const line of computedLines) {
      await assertSalePaunchLineAccount(tx, line.maalKhataAccountId);
    }

    const voucherHeader: InvoiceVoucherHeader = {
      tafseel: data.tafseel,
      gariNo: data.gariNo,
    };

    const product = data.jins?.trim() || computedLines[0]?.jins?.trim() || null;
    const { legs, totalDebits, totalCredits } = buildLedgerLegs(
      data.salePartyAccountId,
      computedLines,
      totals,
      systemAccounts,
      data.lowerBardanaMode,
      voucherHeader,
      taxAmount,
      biltyKirayaAmount,
      miscAmount,
      existing.reference,
      product,
    );

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new AppError(500, 'Invoice debits and credits do not balance — save aborted');
    }

    await tx.salePaunchLine.deleteMany({ where: { invoiceId: existing.id } });
    await tx.invoice.update({
      where: { id: existing.id },
      data: {
        invoiceDate: new Date(data.invoiceDate),
        billNo: data.billNo?.trim() || null,
        gariNo: data.gariNo?.trim() || null,
        jins: data.jins?.trim() || null,
        qism: data.qism?.trim() || null,
        tafseel: data.tafseel?.trim() || null,
        notes: data.tafseel?.trim() || null,
        debitAccountId: data.salePartyAccountId,
        salePartyAccountId: data.salePartyAccountId,
        miscAmount,
        taxAmount,
        biltyKirayaAmount,
        lowerBardanaMode: data.lowerBardanaMode ?? null,
        lowerBardanaQty: data.lowerBardanaQty ?? null,
        lowerBardanaRate: data.lowerBardanaRate ?? null,
        lowerBardanaAmount: totals.lowerBardanaAmount,
        total: totals.lowerNetTotal,
        salePaunchLines: {
          create: computedLines.map((line, index) => ({
            maalKhataAccountId: line.maalKhataAccountId,
            jins: line.jins?.trim() || data.jins?.trim() || null,
            qism: line.qism?.trim() || data.qism?.trim() || null,
            boriOrThelaMode: line.boriOrThelaMode,
            bagCount: line.bagCount,
            thelaCount: line.thelaCount ?? 0,
            bhartii: 0,
            dharanCount: 0,
            looseKg: 0,
            totalWeightKg: line.totalWeightKg,
            kaatKg: line.kaatKg,
            netWeightKg: line.netWeightKg,
            lowerKaatKg: line.lowerKaatKg,
            lowerNetWeightKg: line.lowerNetWeightKg,
            upperRatePerMaund: line.upperRatePerMaund,
            upperAmount: line.upperAmount,
            kanta: line.kanta,
            netUpperAmount: line.netUpperAmount,
            lowerRatePerMaund: line.lowerRatePerMaund,
            lowerAmount: line.lowerAmount,
            rowRevenue: line.rowRevenue,
            bardanaQty: line.bardanaQty ?? null,
            bardanaRate: line.bardanaRate ?? null,
            bardanaAmount: line.bardanaAmount,
            dammiChecked: line.dammiChecked ?? false,
            dammiAmount: line.dammiAmount,
            sortOrder: index,
          })),
        },
      },
    });

    void legs;

    return tx.invoice.findUniqueOrThrow({
      where: { id: existing.id },
      include: {
        salePaunchLines: { include: { maalKhataAccount: true }, orderBy: { sortOrder: 'asc' } },
        debitAccount: true,
        salePartyAccount: true,
        createdBy: { select: { id: true, displayName: true, username: true } },
      },
    });
  });
}

export async function previewSalePaunchTotals(data: {
  lines: SalePaunchLineInput[];
  taxAmount?: number;
  biltyKirayaAmount?: number;
  miscAmount?: number;
  lowerBardanaQty?: number | null;
  lowerBardanaRate?: number | null;
}) {
  const prefs = await getSystemPreferences();
  const computedLines = data.lines.map((line) => computeSalePaunchRow(line, prefs));
  return computeSalePaunchInvoiceTotals(computedLines, {
    taxAmount: data.taxAmount,
    biltyKirayaAmount: data.biltyKirayaAmount,
    miscAmount: data.miscAmount,
    lowerBardanaQty: data.lowerBardanaQty,
    lowerBardanaRate: data.lowerBardanaRate,
  });
}

export async function approvePendingSalePaunchInvoice(
  tx: Prisma.TransactionClient,
  invoiceId: number,
) {
  const invoice = await tx.invoice.findFirst({
    where: {
      id: invoiceId,
      type: InvoiceType.SALE_PAUNCH,
      status: InvoiceStatus.PENDING_APPROVAL,
    },
    include: { salePaunchLines: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!invoice) throw new AppError(404, 'Pending Sale Paunch invoice not found');
  if (!invoice.debitAccountId) throw new AppError(400, 'Invoice missing sale party account');

  const existingLink = await tx.invoiceVoucher.findFirst({ where: { invoiceId } });
  if (existingLink) throw new AppError(400, 'Invoice already posted');

  const { assertAccountsApprovedForPosting } = await import('../approvals/approval-guards');
  await assertAccountsApprovedForPosting(tx, [invoice.debitAccountId]);

  const prefs = await getSystemPreferences();
  const lineInputs: SalePaunchLineInput[] = invoice.salePaunchLines.map((line) => ({
    maalKhataAccountId: line.maalKhataAccountId,
    jins: line.jins ?? undefined,
    qism: line.qism ?? undefined,
    boriOrThelaMode: line.boriOrThelaMode,
    bagCount: Number(line.bagCount),
    thelaCount: Number(line.thelaCount),
    compWeightKg: Number(line.totalWeightKg),
    kaatKg: Number(line.kaatKg),
    lowerKaatKg: Number(line.lowerKaatKg),
    upperRatePerMaund: Number(line.upperRatePerMaund),
    lowerRatePerMaund: Number(line.lowerRatePerMaund),
    kanta: Number(line.kanta),
    bardanaQty: line.bardanaQty != null ? Number(line.bardanaQty) : null,
    bardanaRate: line.bardanaRate != null ? Number(line.bardanaRate) : null,
    dammiChecked: line.dammiChecked,
  }));

  const computedLines = buildComputedLines(lineInputs, prefs);
  const taxAmount = roundMoney(Math.max(0, Number(invoice.taxAmount)));
  const biltyKirayaAmount = roundMoney(Math.max(0, Number(invoice.biltyKirayaAmount)));
  const miscAmount = roundMoney(Math.max(0, Number(invoice.miscAmount)));
  const totals = computeSalePaunchInvoiceTotals(computedLines, {
    taxAmount,
    biltyKirayaAmount,
    miscAmount,
    lowerBardanaQty: invoice.lowerBardanaQty != null ? Number(invoice.lowerBardanaQty) : null,
    lowerBardanaRate: invoice.lowerBardanaRate != null ? Number(invoice.lowerBardanaRate) : null,
  });

  const systemAccounts = await ensureSalePaunchAccounts(tx);
  const voucherHeader: InvoiceVoucherHeader = {
    tafseel: invoice.tafseel,
    gariNo: invoice.gariNo,
  };

  const { legs, totalDebits, totalCredits } = buildLedgerLegs(
    invoice.debitAccountId,
    computedLines,
    totals,
    systemAccounts,
    invoice.lowerBardanaMode,
    voucherHeader,
    taxAmount,
    biltyKirayaAmount,
    miscAmount,
    invoice.reference,
    invoice.jins?.trim()
      || invoice.salePaunchLines[0]?.jins?.trim()
      || null,
  );

  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new AppError(500, 'Invoice debits and credits do not balance');
  }

  const stockLines = computedLines.map((line) => ({
    maalKhataAccountId: line.maalKhataAccountId,
    boriOrThelaMode: line.boriOrThelaMode,
    bagCount: line.bagCount,
    thelaCount: line.thelaCount ?? 0,
  }));

  const { assertStockAvailableForSalePaunchOut } = await import('../approvals/stock-approval-guards');
  await assertStockAvailableForSalePaunchOut(tx, stockLines);

  const voucher = await createSalePaunchVoucherInTx(tx, {
    legs,
    amount: totalDebits,
    date: invoice.invoiceDate ?? invoice.createdAt,
    description: `Sale Paunch Invoice ${invoice.reference}`,
    reference: voucherReferenceFromBillNo(invoice.billNo),
    createdById: invoice.createdById,
  });

  await tx.invoiceVoucher.create({
    data: { invoiceId: invoice.id, voucherId: voucher.id },
  });

  const invoiceDate = invoice.invoiceDate ?? invoice.createdAt;
  await postSalePaunchStockOut(tx, {
    invoiceId: invoice.id,
    invoiceReference: invoice.reference,
    invoiceDate,
    lines: stockLines,
  });

  await postSalePaunchEmptyBardanaOut(tx, {
    invoiceId: invoice.id,
    invoiceReference: invoice.reference,
    invoiceDate,
    lines: stockLines,
  });

  return tx.invoice.update({
    where: { id: invoice.id },
    data: { status: InvoiceStatus.POSTED },
    include: {
      salePaunchLines: { include: { maalKhataAccount: true }, orderBy: { sortOrder: 'asc' } },
      vouchers: { include: { voucher: { include: { ledgerEntries: true } } } },
      debitAccount: true,
      createdBy: { select: { id: true, displayName: true, username: true } },
    },
  });
}
