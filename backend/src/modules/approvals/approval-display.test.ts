import { describe, expect, it } from 'vitest';
import {
  invoiceTypeLabel,
  joinApprovalAccounts,
  sideAccounts,
  voucherApprovalAccounts,
  voucherApprovalTypeLabel,
} from './approval-display';

describe('approval-display', () => {
  it('labels receipt linked to sale invoice', () => {
    expect(
      voucherApprovalTypeLabel({
        type: 'RECEIPT',
        invoiceLink: { invoice: { type: 'SALE_COMMISSION' } },
      }),
    ).toBe('Receipt (Sale)');
  });

  it('labels payment linked to purchase invoice', () => {
    expect(
      voucherApprovalTypeLabel({
        type: 'PAYMENT',
        invoiceLink: { invoice: { type: 'PURCHASE_MAAL' } },
      }),
    ).toBe('Payment (Purchase)');
  });

  it('maps debit and credit accounts for standard voucher', () => {
    const accounts = voucherApprovalAccounts(
      {
        type: 'PAYMENT',
        debitAccount: { name: 'Expense', code: 'EXP-1' },
        creditAccount: { name: 'Cash', code: '1' },
      },
      1500,
    );
    expect(accounts.debitAccount?.name).toBe('Expense');
    expect(accounts.debitAccount?.amount).toBe(1500);
    expect(accounts.creditAccount?.name).toBe('Cash');
    expect(accounts.creditAccount?.amount).toBe(1500);
  });

  it('places opening balance on debit side', () => {
    const { debitAccount, creditAccount } = sideAccounts(
      'DR',
      { name: 'Cash in Hand', code: '1' },
      5000,
    );
    expect(debitAccount?.name).toBe('Cash in Hand');
    expect(debitAccount?.amount).toBe(5000);
    expect(creditAccount?.name).toBe('Opening Balance Equity');
    expect(creditAccount?.amount).toBe(5000);
  });

  it('formats invoice type labels', () => {
    expect(invoiceTypeLabel('KACHI_MAAL')).toBe('Kachi Maal');
  });

  it('joins multi-account labels with per-account amounts', () => {
    const joined = joinApprovalAccounts([
      { name: 'Wheat Maal Khata', code: '105001', amount: 50000 },
      { name: 'Paddy Maal Khata', code: '105002', amount: 20000 },
    ]);
    expect(joined?.name).toBe(
      'Wheat Maal Khata: 50,000; Paddy Maal Khata: 20,000',
    );
    expect(joined?.amount).toBe(70000);
  });
});
