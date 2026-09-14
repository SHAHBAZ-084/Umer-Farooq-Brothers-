import { InvoiceStatus, RecordStatus, VoucherStatus } from '@prisma/client';

/**
 * Bootstrap/system accounts (cash, party ledgers, etc.) post immediately.
 * User-facing creates use RecordStatus.PENDING_APPROVAL and approve on admin sign-off.
 */
export const IMMEDIATE_ACTIVE_STATUS = RecordStatus.ACTIVE;

/** Pickers, reports, and dashboard — exclude pending/rejected rows. */
export const USER_VISIBLE_ACCOUNT_STATUS = RecordStatus.ACTIVE;

/** Voucher list/report — only posted (approved) vouchers. */
export const USER_VISIBLE_VOUCHER_STATUS = VoucherStatus.ACTIVE;

/** Invoice list/view — only posted bills (DRAFT/PENDING_APPROVAL hidden). */
export const USER_VISIBLE_INVOICE_STATUS = InvoiceStatus.POSTED;

/** Product pickers and stock reports. */
export const USER_VISIBLE_PRODUCT_STATUS = RecordStatus.ACTIVE;
