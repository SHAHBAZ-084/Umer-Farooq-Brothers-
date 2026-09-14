import { InvoiceStatus, InvoiceType, Prisma } from '@prisma/client';
import { AppError } from '../../utils/helpers';

/** Keep in sync with frontend/src/lib/invoiceReference.ts */
export const INVOICE_TYPE_PREFIX: Record<InvoiceType, string> = {
  SALE_COMMISSION: 'SC',
  SALE_PAUNCH: 'SP',
  PURCHASE_MAAL: 'PM',
  KACHI_MAAL: 'KM',
  PURCHASE_GENERAL: 'PG',
  SALE_GENERAL: 'SG',
  GENERAL_TRADE: 'GT',
};

export function buildInvoiceReference(type: InvoiceType, number: number): string {
  const prefix = INVOICE_TYPE_PREFIX[type];
  return `${prefix}-${String(number).padStart(5, '0')}`;
}

/** Parse the integer sequence from a reference like `PG-00003`. */
export function parseInvoiceNumberFromReference(
  type: InvoiceType,
  reference: string,
): number | null {
  const prefix = INVOICE_TYPE_PREFIX[type];
  const match = new RegExp(`^${prefix}-(\\d+)$`, 'i').exec(reference.trim());
  if (!match) return null;
  const n = parseInt(match[1]!, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Next invoice sequence number for a type: MAX(number)+1 among non-cancelled rows.
 * PENDING_APPROVAL / POSTED / DRAFT / REJECTED still reserve their numbers.
 */
export async function allocateNextInvoiceReference(
  tx: Prisma.TransactionClient,
  type: InvoiceType,
): Promise<{ number: number; reference: string }> {
  const { _max } = await tx.invoice.aggregate({
    where: {
      type,
      status: { not: InvoiceStatus.CANCELLED },
    },
    _max: { number: true },
  });
  const number = (_max.number ?? 0) + 1;
  if (!(number > 0)) {
    throw new AppError(500, 'Failed to allocate invoice number');
  }
  return { number, reference: buildInvoiceReference(type, number) };
}
