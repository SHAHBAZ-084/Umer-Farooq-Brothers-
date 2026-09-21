/**
 * Profiling harness: cancel a middle PURCHASE_MAAL among ~20 posted invoices
 * while concurrent reads probe SQLite lock wait times.
 *
 * Run: npx vitest run src/modules/invoices/cancel-invoice-hang.profile.test.ts
 */
import { AccountType, BoriThelaMode, RecordStatus } from '@prisma/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma';
import { approveInvoice, approveProduct } from '../../test-helpers/approval';
import { voucherDateInActiveYear } from '../../test-helpers/financial-year';
import {
  ensureKachiMaalAccounts,
  KACHI_MAAL_CATEGORY_NAMES,
} from '../accounting/accounting.service';
import { createProduct } from '../products/products.service';
import { cancelInvoice } from './invoices.service';
import { createPurchaseMaalInvoice } from './purchase-maal.service';

async function ensureAccountInCategory(
  categoryName: string,
  accountName: string,
  type: AccountType,
  code: string,
) {
  const category = await prisma.accountCategory.findFirst({
    where: { isActive: true, name: categoryName },
  });
  if (!category) throw new Error(`Category missing: ${categoryName}`);

  let account = await prisma.account.findFirst({
    where: { isActive: true, name: accountName, categoryId: category.id },
    include: { ledger: true },
  });
  if (!account) {
    account = await prisma.account.create({
      data: { categoryId: category.id, name: accountName, code, type, status: RecordStatus.ACTIVE },
      include: { ledger: true },
    });
    await prisma.ledger.create({ data: { accountId: account.id, balance: 0 } });
  } else if (!account.ledger) {
    await prisma.ledger.create({ data: { accountId: account.id, balance: 0 } });
  }
  return account;
}

describe('cancelInvoice hang profile (PURCHASE_MAAL × 20)', () => {
  let userId: number;
  let invoiceDate: string;
  let partyId: number;
  let productId: number;

  beforeAll(async () => {
    invoiceDate = await voucherDateInActiveYear();
    const user = await prisma.user.findFirst();
    if (!user) throw new Error('Seed admin user first');
    userId = user.id;

    await prisma.$transaction(async (tx) => {
      await ensureKachiMaalAccounts(tx);
    });

    const stamp = Date.now();
    partyId = (
      await ensureAccountInCategory(
        KACHI_MAAL_CATEGORY_NAMES.EXT_PURCHASE,
        `HangProfile Party ${stamp}`,
        AccountType.LIABILITY,
        `HANG-PM-${stamp}`,
      )
    ).id;

    const product = await createProduct({ name: `HangProfile Wheat ${stamp}` });
    await approveProduct(product.id);
    productId = product.id;
  }, 60_000);

  it('times cancel of middle invoice and concurrent read latency', async () => {
    const COUNT = 20;
    const createdIds: number[] = [];

    const setupStarted = Date.now();
    for (let i = 0; i < COUNT; i += 1) {
      const pending = await createPurchaseMaalInvoice({
        invoiceDate,
        billNo: `HANG-BILL-${Date.now()}-${i}`,
        productId,
        marketFeeEnabled: false,
        mazduriEnabled: false,
        lowerBardanaMode: null,
        lowerBardanaQty: null,
        lowerBardanaRate: null,
        lines: [
          {
            partyAccountId: partyId,
            boriOrThelaMode: BoriThelaMode.BORI,
            bagCount: 2 + (i % 3),
            bhartii: 100,
            dharanCount: 0,
            looseKg: 10 + i,
            ratePerMaund: 2000,
          },
        ],
        createdById: userId,
      });
      await approveInvoice(pending.id);
      createdIds.push(pending.id);
    }
    console.log('[hang-profile] setup create+approve', {
      count: COUNT,
      ms: Date.now() - setupStarted,
    });

    const middleId = createdIds[Math.floor(COUNT / 2)]!;
    const readLatencies: number[] = [];
    let probing = true;

    const probe = (async () => {
      while (probing) {
        const t0 = Date.now();
        try {
          await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
          readLatencies.push(Date.now() - t0);
        } catch (err) {
          readLatencies.push(Date.now() - t0);
          console.log('[hang-profile] concurrent read error', {
            ms: Date.now() - t0,
            message: err instanceof Error ? err.message : String(err),
          });
        }
        await new Promise((r) => setTimeout(r, 50));
      }
    })();

    // Let probe collect a baseline
    await new Promise((r) => setTimeout(r, 200));
    const baseline = [...readLatencies];
    readLatencies.length = 0;

    const cancelStarted = Date.now();
    await cancelInvoice(middleId, userId);
    const cancelMs = Date.now() - cancelStarted;
    probing = false;
    await probe;

    const duringCancel = readLatencies;
    const maxDuring = duringCancel.length ? Math.max(...duringCancel) : 0;
    const avgDuring =
      duringCancel.length > 0
        ? Math.round(duringCancel.reduce((a, b) => a + b, 0) / duringCancel.length)
        : 0;
    const maxBaseline = baseline.length ? Math.max(...baseline) : 0;

    console.log('[hang-profile] RESULT', {
      cancelMs,
      postedSiblings: COUNT - 1,
      baselineReadMaxMs: maxBaseline,
      concurrentReadCount: duringCancel.length,
      concurrentReadMaxMs: maxDuring,
      concurrentReadAvgMs: avgDuring,
      concurrentReadSamples: duringCancel.slice(0, 30),
    });

    expect(cancelMs).toBeGreaterThan(0);
    // Soft assertion: document whether concurrent reads stall (> busy_timeout 5000)
    if (maxDuring >= 4000) {
      console.warn(
        '[hang-profile] concurrent reads approached/exceeded busy_timeout — write lock contention confirmed',
      );
    }
  }, 300_000);
});
