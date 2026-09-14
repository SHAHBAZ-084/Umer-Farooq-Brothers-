import { RecordStatus, VoucherStatus, InvoiceStatus } from '@prisma/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma';
import { backfillLegacyActiveRecordStatus } from './approval-backfill';

describe('approval schema (Phase 1)', () => {
  beforeAll(async () => {
    await backfillLegacyActiveRecordStatus(prisma);
  });
  it('exposes RecordStatus enum values on Account and Product', async () => {
    const account = await prisma.account.findFirst({
      select: { id: true, status: true, pendingOpeningBalance: true, pendingOpeningBalanceSide: true },
    });
    expect(account).toBeTruthy();
    expect(Object.values(RecordStatus)).toContain(account!.status);

    const product = await prisma.product.findFirst({
      select: { id: true, status: true, createdById: true },
    });
    if (product) {
      expect(Object.values(RecordStatus)).toContain(product.status);
    }
  });

  it('legacy rows with ledger activity remain ACTIVE after migration', async () => {
    const accountsWithEntries = await prisma.account.findMany({
      where: { ledger: { entries: { some: {} } } },
      select: { id: true, status: true },
    });

    for (const account of accountsWithEntries) {
      expect(account.status).toBe(RecordStatus.ACTIVE);
    }

    const productsLinkedToActiveAccounts = await prisma.product.findMany({
      where: { account: { ledger: { entries: { some: {} } } } },
      select: { status: true },
    });
    for (const product of productsLinkedToActiveAccounts) {
      expect(product.status).toBe(RecordStatus.ACTIVE);
    }
  });

  it('supports new voucher and invoice approval status values', () => {
    expect(VoucherStatus.PENDING_APPROVAL).toBe('PENDING_APPROVAL');
    expect(VoucherStatus.REJECTED).toBe('REJECTED');
    expect(InvoiceStatus.PENDING_APPROVAL).toBe('PENDING_APPROVAL');
    expect(InvoiceStatus.REJECTED).toBe('REJECTED');
  });

  it('can persist pending opening balance fields on Account', async () => {
    const category = await prisma.accountCategory.findFirst({ where: { isActive: true } });
    if (!category) return;

    const code = `OB-PENDING-${Date.now()}`;
    const account = await prisma.account.create({
      data: {
        categoryId: category.id,
        name: `Pending OB Test ${code}`,
        code,
        type: 'EXPENSE',
        status: RecordStatus.PENDING_APPROVAL,
        pendingOpeningBalance: 12500,
        pendingOpeningBalanceSide: 'DR',
      },
    });

    expect(account.status).toBe(RecordStatus.PENDING_APPROVAL);
    expect(Number(account.pendingOpeningBalance)).toBe(12500);
    expect(account.pendingOpeningBalanceSide).toBe('DR');

    await prisma.account.delete({ where: { id: account.id } });
  });
});
