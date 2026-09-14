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
import {
  applyPurchaseWeightedAverageCost,
  postGeneralPurchaseQuantityIn,
} from '../stock/quantity-stock.service';
import {
  combinedGeneralGoodsLineDescription,
  formatLineSnippet,
} from './general-goods-descriptions';
import { allocateNextInvoiceReference } from './invoice-reference';

export async function getNextPurchaseGeneralReference() {
  return prisma.$transaction(async (tx) => {
    await ensureGeneralGoodsAccounts(tx);
    const { reference } = await allocateNextInvoiceReference(tx, InvoiceType.PURCHASE_GENERAL);
    return { reference };
  });
}

export type PurchaseGeneralLineInput = {
  productId: number;
  quantity: number;
  rate: number;
  mazduriAmount?: number;
};

export type CreatePurchaseGeneralInput = {
  invoiceDate: string;
  partyAccountId: number;
  billNo?: string;
  tafseel?: string;
  lines: PurchaseGeneralLineInput[];
  createdById: number;
};

export type UpdatePurchaseGeneralInput = Omit<CreatePurchaseGeneralInput, 'createdById'>;

export type ComputedPurchaseGeneralLine = {
  productId: number;
  productName: string;
  accountId: number;
  quantity: number;
  rate: number;
  lineTotal: number;
  mazduriAmount: number;
  inventoryDebit: number;
};

export async function assertPurchasePartyAccount(tx: Prisma.TransactionClient, accountId: number) {
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

export async function resolveQuantityProduct(tx: Prisma.TransactionClient, productId: number) {
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

export function buildPurchaseGeneralComputedLines(
  lines: Array<PurchaseGeneralLineInput & { productName: string; accountId: number }>,
): ComputedPurchaseGeneralLine[] {
  return lines.map((line) => {
    const quantity = Number(line.quantity);
    const rate = Number(line.rate);
    const mazduriAmount = roundMoney(Math.max(0, Number(line.mazduriAmount ?? 0)));
    if (!(quantity > 0)) throw new AppError(400, 'Quantity must be greater than zero');
    if (!(rate > 0)) throw new AppError(400, 'Rate must be greater than zero');
    const lineTotal = roundMoney(quantity * rate);
    return {
      productId: line.productId,
      productName: line.productName,
      accountId: line.accountId,
      quantity,
      rate,
      lineTotal,
      mazduriAmount,
      inventoryDebit: roundMoney(lineTotal + mazduriAmount),
    };
  });
}

export function buildPurchaseGeneralLedgerLegs(
  computedLines: ComputedPurchaseGeneralLine[],
  partyAccountId: number,
  mazduriAccountId: number,
  invoiceReference: string,
) {
  const legs: VoucherLeg[] = [];
  const goodsTotal = roundMoney(computedLines.reduce((sum, line) => sum + line.lineTotal, 0));
  const mazduriTotal = roundMoney(computedLines.reduce((sum, line) => sum + line.mazduriAmount, 0));

  for (const line of computedLines) {
    legs.push({
      accountId: line.accountId,
      type: LedgerEntryType.DEBIT,
      amount: line.inventoryDebit,
      description: formatLineSnippet(line.productName, line.quantity, line.rate),
    });
  }

  const combinedDesc = combinedGeneralGoodsLineDescription(computedLines, invoiceReference);

  legs.push({
    accountId: partyAccountId,
    type: LedgerEntryType.CREDIT,
    amount: goodsTotal,
    description: combinedDesc,
  });

  if (mazduriTotal > 0) {
    legs.push({
      accountId: mazduriAccountId,
      type: LedgerEntryType.CREDIT,
      amount: mazduriTotal,
      description: `Mazduri ${invoiceReference}`,
    });
  }

  const totalDebits = roundMoney(
    legs.filter((l) => l.type === LedgerEntryType.DEBIT).reduce((s, l) => s + l.amount, 0),
  );
  const totalCredits = roundMoney(
    legs.filter((l) => l.type === LedgerEntryType.CREDIT).reduce((s, l) => s + l.amount, 0),
  );
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new AppError(500, 'Purchase General voucher debits and credits do not balance');
  }

  return { legs, totalDebits, totalCredits, goodsTotal, mazduriTotal };
}

export async function createPurchaseGeneralInvoice(data: CreatePurchaseGeneralInput) {
  if (!data.lines.length) throw new AppError(400, 'At least one line is required');

  return prisma.$transaction(async (tx) => {
    await getActiveFinancialYearId(tx);
    const systemAccounts = await ensureGeneralGoodsAccounts(tx);
    await assertPurchasePartyAccount(tx, data.partyAccountId);

    const { assertProductApprovedForPosting } = await import('../approvals/approval-guards');
    const resolved: Array<PurchaseGeneralLineInput & { productName: string; accountId: number }> = [];
    for (const line of data.lines) {
      await assertProductApprovedForPosting(tx, line.productId);
      const product = await resolveQuantityProduct(tx, line.productId);
      resolved.push({
        ...line,
        productName: product.name,
        accountId: product.accountId,
      });
    }

    const computedLines = buildPurchaseGeneralComputedLines(resolved);
    const { number, reference } = await allocateNextInvoiceReference(tx, InvoiceType.PURCHASE_GENERAL);
    const { legs, totalDebits, totalCredits, goodsTotal } = buildPurchaseGeneralLedgerLegs(
      computedLines,
      data.partyAccountId,
      systemAccounts.mazduri.id,
      reference,
    );

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new AppError(500, 'Invoice debits and credits do not balance — save aborted');
    }

    const financialYearId = await getActiveFinancialYearId(tx);
    const invoiceDate = new Date(data.invoiceDate);

    const invoice = await tx.invoice.create({
      data: {
        type: InvoiceType.PURCHASE_GENERAL,
        status: InvoiceStatus.PENDING_APPROVAL,
        number,
        reference,
        invoiceDate,
        billNo: data.billNo?.trim() || null,
        tafseel: data.tafseel?.trim() || null,
        notes: data.tafseel?.trim() || null,
        partyAccountId: data.partyAccountId,
        total: goodsTotal,
        financialYearId,
        createdById: data.createdById,
        generalPurchaseLines: {
          create: computedLines.map((line, index) => ({
            productId: line.productId,
            quantity: line.quantity,
            rate: line.rate,
            lineTotal: line.lineTotal,
            mazduriAmount: line.mazduriAmount,
            sortOrder: index,
          })),
        },
      },
    });

    // Validate legs only — posting happens on approval
    void legs;

    return tx.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: {
        generalPurchaseLines: { include: { product: true }, orderBy: { sortOrder: 'asc' } },
        partyAccount: true,
        createdBy: { select: { id: true, displayName: true, username: true } },
      },
    });
  });
}

export async function updatePendingPurchaseGeneralInvoice(
  invoiceId: number,
  data: UpdatePurchaseGeneralInput,
  userId: number,
) {
  void userId;
  if (!data.lines.length) throw new AppError(400, 'At least one line is required');

  return prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findFirst({
      where: {
        id: invoiceId,
        type: InvoiceType.PURCHASE_GENERAL,
        status: InvoiceStatus.PENDING_APPROVAL,
      },
      select: { id: true, reference: true },
    });
    if (!existing) throw new AppError(404, 'Pending Purchase General invoice not found');

    await getActiveFinancialYearId(tx);
    const systemAccounts = await ensureGeneralGoodsAccounts(tx);
    await assertPurchasePartyAccount(tx, data.partyAccountId);

    const { assertProductApprovedForPosting } = await import('../approvals/approval-guards');
    const resolved: Array<PurchaseGeneralLineInput & { productName: string; accountId: number }> = [];
    for (const line of data.lines) {
      await assertProductApprovedForPosting(tx, line.productId);
      const product = await resolveQuantityProduct(tx, line.productId);
      resolved.push({
        ...line,
        productName: product.name,
        accountId: product.accountId,
      });
    }

    const computedLines = buildPurchaseGeneralComputedLines(resolved);
    const { legs, totalDebits, totalCredits, goodsTotal } = buildPurchaseGeneralLedgerLegs(
      computedLines,
      data.partyAccountId,
      systemAccounts.mazduri.id,
      existing.reference,
    );

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new AppError(500, 'Invoice debits and credits do not balance — save aborted');
    }

    await tx.generalPurchaseLine.deleteMany({ where: { invoiceId: existing.id } });
    await tx.invoice.update({
      where: { id: existing.id },
      data: {
        invoiceDate: new Date(data.invoiceDate),
        billNo: data.billNo?.trim() || null,
        tafseel: data.tafseel?.trim() || null,
        notes: data.tafseel?.trim() || null,
        partyAccountId: data.partyAccountId,
        total: goodsTotal,
        generalPurchaseLines: {
          create: computedLines.map((line, index) => ({
            productId: line.productId,
            quantity: line.quantity,
            rate: line.rate,
            lineTotal: line.lineTotal,
            mazduriAmount: line.mazduriAmount,
            sortOrder: index,
          })),
        },
      },
    });

    void legs;

    return tx.invoice.findUniqueOrThrow({
      where: { id: existing.id },
      include: {
        generalPurchaseLines: { include: { product: true }, orderBy: { sortOrder: 'asc' } },
        partyAccount: true,
        createdBy: { select: { id: true, displayName: true, username: true } },
      },
    });
  });
}

export async function approvePendingPurchaseGeneralInvoice(
  tx: Prisma.TransactionClient,
  invoiceId: number,
) {
  const invoice = await tx.invoice.findFirst({
    where: {
      id: invoiceId,
      type: InvoiceType.PURCHASE_GENERAL,
      status: InvoiceStatus.PENDING_APPROVAL,
    },
    include: {
      generalPurchaseLines: {
        include: { product: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  if (!invoice) throw new AppError(404, 'Pending Purchase General invoice not found');
  if (!invoice.partyAccountId) throw new AppError(400, 'Invoice missing party account');
  if (!invoice.invoiceDate) throw new AppError(400, 'Invoice missing date');

  const existingLink = await tx.invoiceVoucher.findFirst({ where: { invoiceId } });
  if (existingLink) throw new AppError(400, 'Invoice already posted');

  const { assertProductApprovedForPosting } = await import('../approvals/approval-guards');
  const systemAccounts = await ensureGeneralGoodsAccounts(tx);
  await assertPurchasePartyAccount(tx, invoice.partyAccountId);

  const resolved: Array<PurchaseGeneralLineInput & { productName: string; accountId: number }> = [];
  for (const line of invoice.generalPurchaseLines) {
    await assertProductApprovedForPosting(tx, line.productId);
    const product = await resolveQuantityProduct(tx, line.productId);
    resolved.push({
      productId: line.productId,
      quantity: Number(line.quantity),
      rate: Number(line.rate),
      mazduriAmount: Number(line.mazduriAmount),
      productName: product.name,
      accountId: product.accountId,
    });
  }

  const computedLines = buildPurchaseGeneralComputedLines(resolved);
  const { legs, goodsTotal } = buildPurchaseGeneralLedgerLegs(
    computedLines,
    invoice.partyAccountId,
    systemAccounts.mazduri.id,
    invoice.reference,
  );

  // Update WAC before posting quantity IN so on-hand reflects pre-purchase qty
  for (const line of computedLines) {
    await applyPurchaseWeightedAverageCost(
      tx,
      line.productId,
      line.quantity,
      line.inventoryDebit,
    );
  }

  const voucher = await createMultiLegVoucherInTx(tx, {
    type: VoucherType.PURCHASE_GENERAL,
    legs,
    amount: goodsTotal,
    date: invoice.invoiceDate,
    description: `Purchase General ${invoice.reference}`,
    reference: invoice.reference,
    createdById: invoice.createdById,
  });

  await tx.invoiceVoucher.create({
    data: { invoiceId: invoice.id, voucherId: voucher.id },
  });

  await postGeneralPurchaseQuantityIn(tx, {
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
    data: { status: InvoiceStatus.POSTED, total: goodsTotal },
    include: {
      generalPurchaseLines: { include: { product: true }, orderBy: { sortOrder: 'asc' } },
      partyAccount: true,
      vouchers: { include: { voucher: true } },
    },
  });
}
