import { describe, expect, it } from 'vitest';
import {
  combinedGeneralGoodsLineDescription,
  formatLineSnippet,
  generalPurchaseApprovalDescription,
  generalSaleApprovalDescription,
} from '../invoices/general-goods-descriptions';
import { invoiceApprovalAccounts, invoiceApprovalDescription } from './approval-display';

describe('general-goods-descriptions', () => {
  it('formats a single line snippet', () => {
    expect(formatLineSnippet('Urea', 5, 4500)).toBe('Urea 5@4500');
  });

  it('joins combined line descriptions', () => {
    expect(
      combinedGeneralGoodsLineDescription([
        { productName: 'Urea', quantity: 5, rate: 4500 },
        { productName: 'DAP', quantity: 3, rate: 6200 },
      ]),
    ).toBe('Urea 5@4500; DAP 3@6200');
  });

  it('builds purchase and sale approval descriptions with party', () => {
    const lines = [
      { productName: 'Urea', quantity: 5, rate: 4500 },
      { productName: 'DAP', quantity: 3, rate: 6200 },
    ];
    expect(generalPurchaseApprovalDescription(lines, 'Supplier A')).toBe(
      'Purchase: Urea 5@4500; DAP 3@6200 from Supplier A',
    );
    expect(generalSaleApprovalDescription([{ productName: 'Fert X', quantity: 10, rate: 800 }], 'Customer B')).toBe(
      'Sale: Fert X 10@800 to Customer B',
    );
  });
});

describe('invoiceApprovalAccounts', () => {
  it('maps purchase general product debits and party/mazduri credits', () => {
    const { debitAccount, creditAccount, debitAmount, creditAmount } = invoiceApprovalAccounts({
      type: 'PURCHASE_GENERAL',
      partyAccount: { name: 'Supplier A', code: 'P-1' },
      generalPurchaseLines: [
        {
          quantity: 2,
          rate: 100,
          mazduriAmount: 50,
          product: {
            name: 'Urea',
            code: 'U1',
            account: { name: 'Urea Inv', code: 'INV-U' },
          },
        },
        {
          quantity: 1,
          rate: 200,
          mazduriAmount: 0,
          product: {
            name: 'DAP',
            code: 'D1',
            account: { name: 'DAP Inv', code: 'INV-D' },
          },
        },
      ],
    });
    expect(debitAccount?.name).toContain('Urea Inv');
    expect(debitAccount?.name).toContain('250');
    expect(debitAccount?.name).toContain('DAP Inv');
    expect(debitAccount?.name).toContain('200');
    expect(creditAccount?.name).toContain('Supplier A');
    expect(creditAccount?.name).toContain('400');
    expect(creditAccount?.name).toContain('General Goods Mazduri');
    expect(creditAccount?.name).toContain('50');
    expect(debitAmount).toBe(450);
    expect(creditAmount).toBe(450);
  });

  it('maps sale general party debit and product/revenue credits', () => {
    const { debitAccount, creditAccount, debitAmount, creditAmount } = invoiceApprovalAccounts({
      type: 'SALE_GENERAL',
      salePartyAccount: { name: 'Customer B', code: 'S-1' },
      generalSaleLines: [
        {
          quantity: 2,
          rate: 100,
          unitCost: 40,
          product: {
            name: 'Urea',
            code: 'U1',
            account: { name: 'Urea Inv', code: 'INV-U' },
          },
        },
      ],
    });
    expect(debitAccount?.name).toBe('Customer B');
    expect(debitAccount?.code).toBe('S-1');
    expect(debitAccount?.amount).toBe(200);
    expect(creditAccount?.name).toContain('Urea Inv');
    expect(creditAccount?.name).toContain('80');
    expect(creditAccount?.name).toContain('General Goods Sale Revenue');
    expect(creditAccount?.name).toContain('120');
    expect(debitAmount).toBe(200);
    expect(creditAmount).toBe(200);
  });

  it('maps general trade debit=sale party, credit=purchase party + General Trade Revenue', () => {
    const { debitAccount, creditAccount, debitAmount, creditAmount } = invoiceApprovalAccounts({
      type: 'GENERAL_TRADE',
      partyAccount: { name: 'Supplier A', code: 'P-1' },
      salePartyAccount: { name: 'Customer B', code: 'S-1' },
      generalPurchaseLines: [
        {
          quantity: 10,
          rate: 100,
          lineTotal: 1000,
          product: { name: 'Urea', code: 'U1', account: { name: 'Urea Inv', code: 'INV-U' } },
        },
      ],
      generalSaleLines: [
        {
          quantity: 10,
          rate: 150,
          lineTotal: 1500,
          unitCost: 100,
          product: { name: 'Urea', code: 'U1', account: { name: 'Urea Inv', code: 'INV-U' } },
        },
      ],
    });
    expect(debitAccount?.name).toBe('Customer B');
    expect(debitAccount?.amount).toBe(1500);
    expect(creditAccount?.name).toContain('Supplier A');
    expect(creditAccount?.name).toContain('1,000');
    expect(creditAccount?.name).toContain('General Trade Revenue');
    expect(creditAccount?.name).toContain('500');
    expect(debitAmount).toBe(1500);
    expect(creditAmount).toBe(1500);
  });

  it('aggregates Sale Paunch Maal Khata credits with netUpperAmount per account', () => {
    const { debitAccount, creditAccount, debitAmount, creditAmount } = invoiceApprovalAccounts({
      type: 'SALE_PAUNCH',
      total: 70000,
      debitAccount: { name: 'Sale Party', code: 'SP-1' },
      salePaunchLines: [
        {
          netUpperAmount: 30000,
          maalKhataAccount: { name: 'Wheat Maal Khata', code: '105001' },
        },
        {
          netUpperAmount: 20000,
          maalKhataAccount: { name: 'Wheat Maal Khata', code: '105001' },
        },
        {
          netUpperAmount: 20000,
          maalKhataAccount: { name: 'Paddy Maal Khata', code: '105002' },
        },
      ],
    });
    expect(debitAccount?.name).toBe('Sale Party');
    expect(debitAccount?.amount).toBe(70000);
    expect(creditAccount?.name).toContain('Wheat Maal Khata: 50,000');
    expect(creditAccount?.name).toContain('Paddy Maal Khata: 20,000');
    expect(creditAmount).toBe(70000);
    expect(debitAmount).toBe(70000);
  });
});

describe('invoiceApprovalDescription', () => {
  it('uses general goods helpers for PURCHASE_GENERAL / SALE_GENERAL', () => {
    expect(
      invoiceApprovalDescription({
        type: 'PURCHASE_GENERAL',
        partyAccount: { name: 'GG Supplier' },
        generalPurchaseLines: [
          { quantity: 2, rate: 100, product: { name: 'Bag' } },
        ],
      }),
    ).toBe('Purchase: Bag 2@100 from GG Supplier');

    expect(
      invoiceApprovalDescription({
        type: 'SALE_GENERAL',
        salePartyAccount: { name: 'GG Customer' },
        generalSaleLines: [
          { quantity: 1, rate: 200, product: { name: 'Bottle' } },
        ],
      }),
    ).toBe('Sale: Bottle 1@200 to GG Customer');
  });

  it('falls back to tafseel for other invoice types', () => {
    expect(
      invoiceApprovalDescription({
        type: 'PURCHASE_MAAL',
        tafseel: 'Wheat load',
        notes: 'ignored when tafseel set',
      }),
    ).toBe('Wheat load');
  });
});
