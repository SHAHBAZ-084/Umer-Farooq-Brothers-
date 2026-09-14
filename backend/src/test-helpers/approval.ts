import { prisma } from '../lib/prisma';
import { approvePendingRecord } from '../modules/approvals/approvals.service';

export async function approveAccount(id: number) {
  return approvePendingRecord('account', id);
}

export async function approveProduct(id: number) {
  return approvePendingRecord('product', id);
}

export async function approveVoucher(id: number) {
  return approvePendingRecord('voucher', id);
}

export async function approveInvoice(id: number) {
  return approvePendingRecord('invoice', id);
}

export async function loadInvoiceWithVouchers(id: number) {
  return prisma.invoice.findUniqueOrThrow({
    where: { id },
    include: {
      kachiMaalLines: { include: { partyAccount: true }, orderBy: { sortOrder: 'asc' } },
      purchaseMaalLines: { include: { partyAccount: true }, orderBy: { sortOrder: 'asc' } },
      salePaunchLines: { include: { maalKhataAccount: true }, orderBy: { sortOrder: 'asc' } },
      saleCommissionLines: { include: { partyAccount: true }, orderBy: { sortOrder: 'asc' } },
      vouchers: { include: { voucher: { include: { ledgerEntries: true } } } },
      debitAccount: true,
      product: { include: { account: true } },
      createdBy: { select: { id: true, displayName: true, username: true } },
    },
  });
}
