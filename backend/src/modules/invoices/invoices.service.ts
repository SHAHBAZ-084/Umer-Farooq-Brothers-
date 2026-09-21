import { InvoiceStatus, InvoiceType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';
import { PaginatedResult } from '../../utils/pagination';
import { USER_VISIBLE_INVOICE_STATUS } from '../approvals/record-status';
import {
  cancelActiveVouchersByReferenceInTx,
  getActiveFinancialYearId,
} from '../accounting/accounting.service';
import { reverseEmptyBardanaForInvoiceInTx } from '../inventory/bardana.service';
import {
  deleteInvoiceStockMovementsInTx,
  recomputeAverageCostInTx,
} from '../stock/quantity-stock.service';
import { recomputeMaalStockForProductInTx } from '../stock/stock.service';
import {
  allocateNextInvoiceReference,
  buildInvoiceReference,
  INVOICE_TYPE_PREFIX,
} from './invoice-reference';
import { voucherReferenceFromBillNo } from './invoice-voucher-descriptions';

export { INVOICE_TYPE_PREFIX, buildInvoiceReference };

export async function listInvoices(
  filters?: { type?: InvoiceType; status?: InvoiceStatus },
  pagination?: { limit: number; offset: number },
): Promise<PaginatedResult<Awaited<ReturnType<typeof fetchInvoiceListPage>>[number]>> {
  const where = {
    status: filters?.status ?? USER_VISIBLE_INVOICE_STATUS,
    ...(filters?.type && { type: filters.type }),
  };

  const limit = pagination?.limit ?? 200;
  const offset = pagination?.offset ?? 0;

  const [items, total] = await Promise.all([
    fetchInvoiceListPage(where, limit, offset),
    prisma.invoice.count({ where }),
  ]);

  return { items, total, limit, offset };
}

function fetchInvoiceListPage(
  where: Prisma.InvoiceWhereInput,
  limit: number,
  offset: number,
) {
  return prisma.invoice.findMany({
    where,
    include: {
      customer: true,
      supplier: true,
      items: true,
      createdBy: { select: { id: true, displayName: true, username: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });
}

const invoiceDetailInclude = {
  customer: true,
  supplier: true,
  items: { include: { product: true } },
  kachiMaalLines: { include: { partyAccount: true }, orderBy: { sortOrder: 'asc' as const } },
  purchaseMaalLines: { include: { partyAccount: true }, orderBy: { sortOrder: 'asc' as const } },
  salePaunchLines: {
    include: { maalKhataAccount: true },
    orderBy: { sortOrder: 'asc' as const },
  },
  saleCommissionLines: { include: { partyAccount: true }, orderBy: { sortOrder: 'asc' as const } },
  generalPurchaseLines: { include: { product: true }, orderBy: { sortOrder: 'asc' as const } },
  generalSaleLines: { include: { product: true }, orderBy: { sortOrder: 'asc' as const } },
  vouchers: {
    include: {
      voucher: {
        include: {
          debitAccount: true,
          creditAccount: true,
          ledgerEntries: {
            where: { isReversal: false },
            orderBy: { id: 'asc' as const },
            include: {
              ledger: {
                include: {
                  account: { select: { id: true, name: true, code: true } },
                },
              },
            },
          },
        },
      },
    },
  },
  debitAccount: true,
  partyAccount: true,
  salePartyAccount: true,
  product: { include: { account: true } },
  createdBy: { select: { id: true, displayName: true, username: true } },
} as const;

function assertInvoiceVisibleForBill(invoice: { status: InvoiceStatus }) {
  if (
    invoice.status !== InvoiceStatus.POSTED
    && invoice.status !== InvoiceStatus.PENDING_APPROVAL
    && invoice.status !== InvoiceStatus.CANCELLED
  ) {
    throw new AppError(404, 'Invoice not found');
  }
}

/** Match the reference each invoice type uses when creating its voucher(s). */
export function invoiceVoucherReference(invoice: {
  type: InvoiceType;
  reference: string;
  billNo?: string | null;
}): string {
  switch (invoice.type) {
    case InvoiceType.GENERAL_TRADE:
    case InvoiceType.PURCHASE_GENERAL:
    case InvoiceType.SALE_GENERAL:
      return invoice.reference;
    case InvoiceType.KACHI_MAAL:
    case InvoiceType.PURCHASE_MAAL:
    case InvoiceType.SALE_COMMISSION:
    case InvoiceType.SALE_PAUNCH:
      return voucherReferenceFromBillNo(invoice.billNo);
    default:
      return invoice.reference;
  }
}

async function reverseInvoiceStockAfterCancelInTx(
  tx: Prisma.TransactionClient,
  invoice: {
    id: number;
    type: InvoiceType;
    productId: number | null;
    generalPurchaseLines?: { productId: number }[];
    generalSaleLines?: { productId: number }[];
  },
) {
  switch (invoice.type) {
    case InvoiceType.PURCHASE_GENERAL:
    case InvoiceType.GENERAL_TRADE: {
      const productIds = await deleteInvoiceStockMovementsInTx(tx, invoice.id);
      const fromLines = [
        ...(invoice.generalPurchaseLines ?? []).map((line) => line.productId),
        ...productIds,
      ];
      for (const productId of [...new Set(fromLines)]) {
        await recomputeAverageCostInTx(tx, productId);
      }
      return;
    }
    case InvoiceType.SALE_GENERAL: {
      await deleteInvoiceStockMovementsInTx(tx, invoice.id);
      return;
    }
    case InvoiceType.PURCHASE_MAAL: {
      if (invoice.productId == null) {
        throw new AppError(400, 'Purchase Maal invoice missing product');
      }
      await recomputeMaalStockForProductInTx(tx, invoice.productId);
      return;
    }
    case InvoiceType.SALE_PAUNCH: {
      await deleteInvoiceStockMovementsInTx(tx, invoice.id);
      await reverseEmptyBardanaForInvoiceInTx(tx, invoice.id);
      return;
    }
    case InvoiceType.KACHI_MAAL:
    case InvoiceType.SALE_COMMISSION:
    default:
      return;
  }
}

export async function cancelInvoice(invoiceId: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        generalPurchaseLines: { select: { productId: true } },
        generalSaleLines: { select: { productId: true } },
      },
    });
    if (!invoice) throw new AppError(404, 'Invoice not found');
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new AppError(400, 'Invoice is already cancelled');
    }

    const wasPosted = invoice.status === InvoiceStatus.POSTED;

    if (wasPosted) {
      await cancelActiveVouchersByReferenceInTx(
        tx,
        invoiceVoucherReference(invoice),
        userId,
      );
    }

    // Cancel first so POSTED-only stock recomputes exclude this invoice.
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.CANCELLED },
      include: invoiceDetailInclude,
    });

    if (wasPosted) {
      await reverseInvoiceStockAfterCancelInTx(tx, invoice);
    }

    return updated;
  });
}

export async function getInvoice(id: number) {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: invoiceDetailInclude,
  });
  if (!invoice) throw new AppError(404, 'Invoice not found');
  assertInvoiceVisibleForBill(invoice);
  return invoice;
}

export async function getInvoiceByReference(reference: string) {
  const trimmed = reference.trim();
  if (!trimmed) throw new AppError(400, 'Reference is required');

  const invoice = await prisma.invoice.findFirst({
    where: { reference: trimmed },
    include: invoiceDetailInclude,
  });
  if (!invoice) {
    throw new AppError(404, `No invoice found for ${trimmed}.`);
  }
  assertInvoiceVisibleForBill(invoice);
  return invoice;
}

/** Draft invoice shell — posting with balanced vouchers comes next per invoice type. */
export async function createInvoiceDraft(data: {
  type: InvoiceType;
  customerId?: number;
  supplierId?: number;
  notes?: string;
  items: { productId?: number; label: string; quantity: number; unitPrice: number }[];
  createdById: number;
}) {
  if (data.items.length === 0) throw new AppError(400, 'At least one line item is required');

  const total = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  if (total <= 0) throw new AppError(400, 'Invoice total must be greater than zero');

  return prisma.$transaction(async (tx) => {
    const financialYearId = await getActiveFinancialYearId(tx);
    const { number, reference } = await allocateNextInvoiceReference(tx, data.type);

    return tx.invoice.create({
      data: {
        type: data.type,
        status: InvoiceStatus.DRAFT,
        number,
        reference,
        customerId: data.customerId ?? null,
        supplierId: data.supplierId ?? null,
        total,
        notes: data.notes?.trim() || null,
        financialYearId,
        createdById: data.createdById,
        items: {
          create: data.items.map((item) => ({
            productId: item.productId ?? null,
            label: item.label,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
          })),
        },
      },
      include: { items: true, customer: true, supplier: true },
    });
  });
}
