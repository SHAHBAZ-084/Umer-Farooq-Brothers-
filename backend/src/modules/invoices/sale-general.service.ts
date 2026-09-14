import {
  InvoiceStatus,
  InvoiceType,
  LedgerEntryType,
  Prisma,
  ProductStockMode,
  RecordStatus,
  VoucherType,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';
import {
  createMultiLegVoucherInTx,
  ensureGeneralGoodsAccounts,
  getActiveFinancialYearId,
  KACHI_MAAL_CATEGORY_NAMES,
  type VoucherLeg,
} from '../accounting/accounting.service';
import { roundMoney } from './purchase-maal.calculations';
import { postGeneralSaleQuantityOut } from '../stock/quantity-stock.service';
import {
  combinedGeneralGoodsLineDescription,
  formatLineSnippet,
} from './general-goods-descriptions';
import { allocateNextInvoiceReference } from './invoice-reference';

export async function getNextSaleGeneralReference() {
  return prisma.$transaction(async (tx) => {
    await ensureGeneralGoodsAccounts(tx);
    const { reference } = await allocateNextInvoiceReference(tx, InvoiceType.SALE_GENERAL);
    return { reference };
  });
}

export type SaleGeneralLineInput = {
  productId: number;
  quantity: number;
  rate: number;
};

export type CreateSaleGeneralInput = {
  invoiceDate: string;
  salePartyAccountId: number;
  billNo?: string;
  tafseel?: string;
  lines: SaleGeneralLineInput[];
  createdById: number;
};

export type UpdateSaleGeneralInput = Omit<CreateSaleGeneralInput, 'createdById'>;

export type ComputedSaleGeneralLine = {
  productId: number;
  productName: string;
  accountId: number;
  quantity: number;
  rate: number;
  lineTotal: number;
  unitCost: number;
  costAmount: number;
  profitAmount: number;
};

export async function assertSalePartyAccount(tx: Prisma.TransactionClient, accountId: number) {
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

async function resolveQuantityProduct(tx: Prisma.TransactionClient, productId: number) {
  const product = await tx.product.findFirst({
    where: { id: productId, isActive: true, status: RecordStatus.ACTIVE },
    include: { category: true, account: { include: { ledger: true } } },
  });
  if (!product) throw new AppError(400, 'Invalid product');
  if (product.category.stockMode !== ProductStockMode.QUANTITY) {
    throw new AppError(400, `Product "${product.name}" is not a general-goods (quantity) product`);
  }
  if (!product.account.isActive) {
    throw new AppError(400, `Product "${product.name}" ledger is inactive`);
  }
  if (!product.account.ledger) {
    await tx.ledger.create({ data: { accountId: product.accountId, balance: 0 } });
  }
  return product;
}

export function buildSaleGeneralComputedLines(
  lines: Array<
    SaleGeneralLineInput & { productName: string; accountId: number; unitCost: number }
  >,
): ComputedSaleGeneralLine[] {
  return lines.map((line) => {
    const quantity = Number(line.quantity);
    const rate = Number(line.rate);
    const unitCost = roundMoney(Math.max(0, Number(line.unitCost ?? 0)));
    if (!(quantity > 0)) throw new AppError(400, 'Quantity must be greater than zero');
    if (!(rate > 0)) throw new AppError(400, 'Rate must be greater than zero');
    const lineTotal = roundMoney(quantity * rate);
    const costAmount = roundMoney(quantity * unitCost);
    const profitAmount = roundMoney(lineTotal - costAmount);
    return {
      productId: line.productId,
      productName: line.productName,
      accountId: line.accountId,
      quantity,
      rate,
      lineTotal,
      unitCost,
      costAmount,
      profitAmount,
    };
  });
}

export function buildSaleGeneralLedgerLegs(
  computedLines: ComputedSaleGeneralLine[],
  salePartyAccountId: number,
  saleRevenueAccountId: number,
  invoiceReference: string,
) {
  const legs: VoucherLeg[] = [];
  const invoiceTotal = roundMoney(computedLines.reduce((sum, line) => sum + line.lineTotal, 0));

  for (const line of computedLines) {
    if (line.costAmount > 0) {
      legs.push({
        accountId: line.accountId,
        type: LedgerEntryType.CREDIT,
        amount: line.costAmount,
        description: formatLineSnippet(line.productName, line.quantity, line.rate),
      });
    }

    if (line.profitAmount > 0) {
      legs.push({
        accountId: saleRevenueAccountId,
        type: LedgerEntryType.CREDIT,
        amount: line.profitAmount,
        description: `Profit ${formatLineSnippet(line.productName, line.quantity, line.rate)}`,
      });
    } else if (line.profitAmount < 0) {
      legs.push({
        accountId: saleRevenueAccountId,
        type: LedgerEntryType.DEBIT,
        amount: Math.abs(line.profitAmount),
        description: `Loss ${formatLineSnippet(line.productName, line.quantity, line.rate)}`,
      });
    }
  }

  const combinedDesc = combinedGeneralGoodsLineDescription(computedLines, invoiceReference);

  legs.push({
    accountId: salePartyAccountId,
    type: LedgerEntryType.DEBIT,
    amount: invoiceTotal,
    description: combinedDesc,
  });

  const totalDebits = roundMoney(
    legs.filter((l) => l.type === LedgerEntryType.DEBIT).reduce((s, l) => s + l.amount, 0),
  );
  const totalCredits = roundMoney(
    legs.filter((l) => l.type === LedgerEntryType.CREDIT).reduce((s, l) => s + l.amount, 0),
  );
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new AppError(500, 'Sale General voucher debits and credits do not balance');
  }

  return { legs, totalDebits, totalCredits, invoiceTotal };
}

export async function createSaleGeneralInvoice(data: CreateSaleGeneralInput) {
  if (!data.lines.length) throw new AppError(400, 'At least one line is required');

  return prisma.$transaction(async (tx) => {
    await getActiveFinancialYearId(tx);
    await ensureGeneralGoodsAccounts(tx);
    await assertSalePartyAccount(tx, data.salePartyAccountId);

    const { assertProductApprovedForPosting } = await import('../approvals/approval-guards');
    const resolved: Array<
      SaleGeneralLineInput & { productName: string; accountId: number; unitCost: number }
    > = [];
    for (const line of data.lines) {
      await assertProductApprovedForPosting(tx, line.productId);
      const product = await resolveQuantityProduct(tx, line.productId);
      resolved.push({
        ...line,
        productName: product.name,
        accountId: product.accountId,
        unitCost: product.averageCost != null ? Number(product.averageCost) : 0,
      });
    }

    const computedLines = buildSaleGeneralComputedLines(resolved);
    const { number, reference } = await allocateNextInvoiceReference(tx, InvoiceType.SALE_GENERAL);
    const systemAccounts = await ensureGeneralGoodsAccounts(tx);
    const { legs, totalDebits, totalCredits, invoiceTotal } = buildSaleGeneralLedgerLegs(
      computedLines,
      data.salePartyAccountId,
      systemAccounts.saleRevenue.id,
      reference,
    );

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new AppError(500, 'Invoice debits and credits do not balance — save aborted');
    }

    const financialYearId = await getActiveFinancialYearId(tx);
    const invoiceDate = new Date(data.invoiceDate);

    const invoice = await tx.invoice.create({
      data: {
        type: InvoiceType.SALE_GENERAL,
        status: InvoiceStatus.PENDING_APPROVAL,
        number,
        reference,
        invoiceDate,
        billNo: data.billNo?.trim() || null,
        tafseel: data.tafseel?.trim() || null,
        notes: data.tafseel?.trim() || null,
        salePartyAccountId: data.salePartyAccountId,
        total: invoiceTotal,
        financialYearId,
        createdById: data.createdById,
        generalSaleLines: {
          create: computedLines.map((line, index) => ({
            productId: line.productId,
            quantity: line.quantity,
            rate: line.rate,
            lineTotal: line.lineTotal,
            unitCost: line.unitCost,
            sortOrder: index,
          })),
        },
      },
    });

    void legs;

    return tx.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: {
        generalSaleLines: { include: { product: true }, orderBy: { sortOrder: 'asc' } },
        salePartyAccount: true,
        createdBy: { select: { id: true, displayName: true, username: true } },
      },
    });
  });
}

export async function updatePendingSaleGeneralInvoice(
  invoiceId: number,
  data: UpdateSaleGeneralInput,
  userId: number,
) {
  void userId;
  if (!data.lines.length) throw new AppError(400, 'At least one line is required');

  return prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findFirst({
      where: {
        id: invoiceId,
        type: InvoiceType.SALE_GENERAL,
        status: InvoiceStatus.PENDING_APPROVAL,
      },
      select: { id: true, reference: true },
    });
    if (!existing) throw new AppError(404, 'Pending Sale General invoice not found');

    await getActiveFinancialYearId(tx);
    const systemAccounts = await ensureGeneralGoodsAccounts(tx);
    await assertSalePartyAccount(tx, data.salePartyAccountId);

    const { assertProductApprovedForPosting } = await import('../approvals/approval-guards');
    const resolved: Array<
      SaleGeneralLineInput & { productName: string; accountId: number; unitCost: number }
    > = [];
    for (const line of data.lines) {
      await assertProductApprovedForPosting(tx, line.productId);
      const product = await resolveQuantityProduct(tx, line.productId);
      resolved.push({
        ...line,
        productName: product.name,
        accountId: product.accountId,
        unitCost: product.averageCost != null ? Number(product.averageCost) : 0,
      });
    }

    const computedLines = buildSaleGeneralComputedLines(resolved);
    const { legs, totalDebits, totalCredits, invoiceTotal } = buildSaleGeneralLedgerLegs(
      computedLines,
      data.salePartyAccountId,
      systemAccounts.saleRevenue.id,
      existing.reference,
    );

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new AppError(500, 'Invoice debits and credits do not balance — save aborted');
    }

    await tx.generalSaleLine.deleteMany({ where: { invoiceId: existing.id } });
    await tx.invoice.update({
      where: { id: existing.id },
      data: {
        invoiceDate: new Date(data.invoiceDate),
        billNo: data.billNo?.trim() || null,
        tafseel: data.tafseel?.trim() || null,
        notes: data.tafseel?.trim() || null,
        salePartyAccountId: data.salePartyAccountId,
        total: invoiceTotal,
        generalSaleLines: {
          create: computedLines.map((line, index) => ({
            productId: line.productId,
            quantity: line.quantity,
            rate: line.rate,
            lineTotal: line.lineTotal,
            unitCost: line.unitCost,
            sortOrder: index,
          })),
        },
      },
    });

    void legs;

    return tx.invoice.findUniqueOrThrow({
      where: { id: existing.id },
      include: {
        generalSaleLines: { include: { product: true }, orderBy: { sortOrder: 'asc' } },
        salePartyAccount: true,
        createdBy: { select: { id: true, displayName: true, username: true } },
      },
    });
  });
}

export async function approvePendingSaleGeneralInvoice(
  tx: Prisma.TransactionClient,
  invoiceId: number,
) {
  const invoice = await tx.invoice.findFirst({
    where: {
      id: invoiceId,
      type: InvoiceType.SALE_GENERAL,
      status: InvoiceStatus.PENDING_APPROVAL,
    },
    include: {
      generalSaleLines: {
        include: { product: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  if (!invoice) throw new AppError(404, 'Pending Sale General invoice not found');
  if (!invoice.salePartyAccountId) throw new AppError(400, 'Invoice missing sale party account');
  if (!invoice.invoiceDate) throw new AppError(400, 'Invoice missing date');

  const existingLink = await tx.invoiceVoucher.findFirst({ where: { invoiceId } });
  if (existingLink) throw new AppError(400, 'Invoice already posted');

  // Intentionally skip negative-stock guards for SALE_GENERAL (scoped exception).

  const { assertProductApprovedForPosting } = await import('../approvals/approval-guards');
  const systemAccounts = await ensureGeneralGoodsAccounts(tx);
  await assertSalePartyAccount(tx, invoice.salePartyAccountId);

  const resolved: Array<
    SaleGeneralLineInput & { productName: string; accountId: number; unitCost: number }
  > = [];
  for (const line of invoice.generalSaleLines) {
    await assertProductApprovedForPosting(tx, line.productId);
    const product = await resolveQuantityProduct(tx, line.productId);
    // Prefer snapshot stored at create time; fall back to current averageCost
    const snapshotCost = Number(line.unitCost);
    const unitCost =
      snapshotCost > 0 || line.unitCost != null
        ? snapshotCost
        : product.averageCost != null
          ? Number(product.averageCost)
          : 0;
    resolved.push({
      productId: line.productId,
      quantity: Number(line.quantity),
      rate: Number(line.rate),
      productName: product.name,
      accountId: product.accountId,
      unitCost,
    });
  }

  const computedLines = buildSaleGeneralComputedLines(resolved);
  const { legs, invoiceTotal } = buildSaleGeneralLedgerLegs(
    computedLines,
    invoice.salePartyAccountId,
    systemAccounts.saleRevenue.id,
    invoice.reference,
  );

  const voucher = await createMultiLegVoucherInTx(tx, {
    type: VoucherType.SALE_GENERAL,
    legs,
    amount: invoiceTotal,
    date: invoice.invoiceDate,
    description: `Sale General ${invoice.reference}`,
    reference: invoice.reference,
    createdById: invoice.createdById,
  });

  await tx.invoiceVoucher.create({
    data: { invoiceId: invoice.id, voucherId: voucher.id },
  });

  await postGeneralSaleQuantityOut(tx, {
    invoiceId: invoice.id,
    invoiceReference: invoice.reference,
    invoiceDate: invoice.invoiceDate,
    lines: computedLines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
    })),
  });

  return tx.invoice.update({
    where: { id: invoice.id },
    data: { status: InvoiceStatus.POSTED, total: invoiceTotal },
    include: {
      generalSaleLines: { include: { product: true }, orderBy: { sortOrder: 'asc' } },
      salePartyAccount: true,
      vouchers: { include: { voucher: true } },
    },
  });
}
