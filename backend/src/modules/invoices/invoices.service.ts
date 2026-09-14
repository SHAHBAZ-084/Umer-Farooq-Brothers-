import { InvoiceStatus, InvoiceType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';
import { PaginatedResult } from '../../utils/pagination';
import { USER_VISIBLE_INVOICE_STATUS } from '../approvals/record-status';
import { getActiveFinancialYearId } from '../accounting/accounting.service';
import {
  allocateNextInvoiceReference,
  buildInvoiceReference,
  INVOICE_TYPE_PREFIX,
} from './invoice-reference';

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
  ) {
    throw new AppError(404, 'Invoice not found');
  }
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
