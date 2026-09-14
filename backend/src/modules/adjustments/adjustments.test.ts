import { describe, expect, it } from 'vitest';
import { bootstrapChartOfAccounts, getTrialBalance } from '../accounting/accounting.service';
import { createProduct } from '../products/products.service';
import {
  approvePendingAccountAdjustmentInTx,
  createAccountAdjustment,
  createStockAdjustment,
} from './adjustments.service';
import { approveAccount, approveProduct } from '../../test-helpers/approval';
import { prisma } from '../../lib/prisma';

describe('adjustments', () => {
  it('blocks account adjustment on Maal Khata-linked account', async () => {
    await bootstrapChartOfAccounts();
    const product = await createProduct({
      name: `Adj Block ${Date.now()}`,
      openingBalance: 0,
      createdById: 1,
    });
    await approveProduct(product.id);

    const maalAccount = await prisma.account.findFirstOrThrow({
      where: { id: product.accountId },
    });

    await expect(
      createAccountAdjustment({
        accountId: maalAccount.id,
        amount: 1000,
        side: 'DR',
        adjustmentDate: new Date().toISOString().slice(0, 10),
        createdById: 1,
      }),
    ).rejects.toThrow(/Stock Adjustment/i);
  });

  it('posts approved account adjustment and keeps trial balance balanced', async () => {
    await bootstrapChartOfAccounts();
    const expenseCat = await prisma.accountCategory.findFirst({ where: { name: 'Expenses' } });
    if (!expenseCat) throw new Error('Expenses category missing');

    const { createAccount } = await import('../accounting/accounting.service');
    const account = await createAccount({
      categoryId: expenseCat.id,
      name: `Adj TB ${Date.now()}`,
      createdById: 1,
    });
    await approveAccount(account.id);

    const pending = await createAccountAdjustment({
      accountId: account.id,
      amount: 2500,
      side: 'DR',
      adjustmentDate: new Date().toISOString().slice(0, 10),
      notes: 'Test correction',
      createdById: 1,
    });

    await prisma.$transaction((tx) => approvePendingAccountAdjustmentInTx(tx, pending.id));

    const updated = await prisma.account.findUniqueOrThrow({
      where: { id: account.id },
      include: { ledger: true },
    });
    expect(Number(updated.ledger!.balance)).toBeCloseTo(2500, 2);

    const tb = await getTrialBalance();
    const row = tb.accounts.find((a) => a.accountId === account.id);
    expect(row?.debit).toBeCloseTo(2500, 2);
  });

  it('posts approved stock adjustment IN with stock movement', async () => {
    await bootstrapChartOfAccounts();
    const product = await createProduct({
      name: `Adj Stock ${Date.now()}`,
      openingBalance: 0,
      createdById: 1,
    });
    await approveProduct(product.id);

    const pending = await createStockAdjustment({
      productId: product.id,
      bagType: 'BORI',
      direction: 'IN',
      bags: 5,
      amount: 10000,
      adjustmentDate: new Date().toISOString().slice(0, 10),
      createdById: 1,
    });

    const { approvePendingStockAdjustmentInTx } = await import('./adjustments.service');
    await prisma.$transaction((tx) => approvePendingStockAdjustmentInTx(tx, pending.id));

    const movement = await prisma.stockMovement.findFirst({
      where: { stockAdjustmentId: pending.id },
    });
    expect(movement).toBeTruthy();
    expect(Number(movement!.bags)).toBe(5);
  });
});
