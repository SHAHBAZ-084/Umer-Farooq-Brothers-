import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InvoiceBillView } from './InvoiceBillView';
import type { InvoiceDetail } from '../../lib/api';

describe('InvoiceBillView General Goods', () => {
  it('renders purchase bill with multi lines and separate mazduri', () => {
    const invoice: InvoiceDetail = {
      id: 1,
      type: 'PURCHASE_GENERAL',
      status: 'POSTED',
      reference: 'PG-00099',
      total: 1500,
      createdAt: new Date().toISOString(),
      invoiceDate: '2026-09-08',
      billNo: 'B-1',
      partyAccount: { id: 10, name: 'Supplier A', code: 'P-1' },
      generalPurchaseLines: [
        {
          id: 1,
          productId: 1,
          quantity: 2,
          rate: 500,
          lineTotal: 1000,
          mazduriAmount: 50,
          product: { id: 1, name: 'Urea', code: 'U1', unit: 'bag', accountId: 1 },
        },
        {
          id: 2,
          productId: 2,
          quantity: 1,
          rate: 500,
          lineTotal: 500,
          mazduriAmount: 0,
          product: { id: 2, name: 'DAP', code: 'D1', unit: 'bag', accountId: 2 },
        },
      ],
    };
    const html = renderToStaticMarkup(createElement(InvoiceBillView, { invoice, prefs: null }));
    expect(html).toContain('Purchase Bill');
    expect(html).toContain('Urea');
    expect(html).toContain('DAP');
    expect(html).toContain('Mazduri (paid separately)');
    expect(html).toContain('Net Payable to Supplier');
    expect(html).toContain('Supplier A');
    expect(html).not.toContain('Avg. Cost');
    expect(html).not.toContain('Profit');
  });

  it('renders sale bill without cost or profit', () => {
    const invoice: InvoiceDetail = {
      id: 2,
      type: 'SALE_GENERAL',
      status: 'POSTED',
      reference: 'SG-00088',
      total: 800,
      createdAt: new Date().toISOString(),
      invoiceDate: '2026-09-08',
      salePartyAccount: { id: 20, name: 'Customer B', code: 'S-1' },
      generalSaleLines: [
        {
          id: 1,
          productId: 1,
          quantity: 2,
          rate: 400,
          lineTotal: 800,
          unitCost: 200,
          product: { id: 1, name: 'Urea', code: 'U1', unit: 'bag', accountId: 1 },
        },
      ],
    };
    const html = renderToStaticMarkup(createElement(InvoiceBillView, { invoice, prefs: null }));
    expect(html).toContain('Sale Bill');
    expect(html).toContain('Customer B');
    expect(html).toContain('Urea');
    expect(html).toContain('400.00');
    expect(html).not.toContain('Avg. Cost');
    expect(html).not.toContain('Profit');
    expect(html).not.toContain('Mazduri');
    expect(html).not.toContain('200.00');
  });

  it('still renders grain kachi bill and not general goods table', () => {
    const invoice: InvoiceDetail = {
      id: 3,
      type: 'KACHI_MAAL',
      status: 'POSTED',
      reference: 'KM-00001',
      total: 100,
      createdAt: new Date().toISOString(),
      invoiceDate: '2026-09-08',
      debitAccount: { id: 1, name: 'Cash', code: '1' },
      kachiMaalLines: [],
    };
    const html = renderToStaticMarkup(createElement(InvoiceBillView, { invoice, prefs: null }));
    expect(html).toContain('Kachi Maal Bill');
    expect(html).toContain('Variety');
    expect(html).not.toContain('Line Total');
  });
});
