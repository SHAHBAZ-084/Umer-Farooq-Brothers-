import { afterEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';
import { errorHandler } from '../../middleware/errorHandler';
import * as invoicesService from './invoices.service';

describe('cancelInvoice timeout surfaces cleanly', () => {
  afterEach(() => {
    invoicesService.cancelInvoiceTestHooks.holdMs = 0;
    invoicesService.cancelInvoiceTxOptions.timeout = 15_000;
    invoicesService.cancelInvoiceTxOptions.maxWait = 5_000;
  });

  it('maps Prisma transaction timeout to AppError with a clear message', async () => {
    invoicesService.cancelInvoiceTxOptions.timeout = 400;
    invoicesService.cancelInvoiceTxOptions.maxWait = 200;
    invoicesService.cancelInvoiceTestHooks.holdMs = 1_200;

    const user = await prisma.user.findFirst();
    if (!user) throw new Error('Seed admin user first');

    const invoice = await prisma.invoice.findFirst({
      where: { status: { not: 'CANCELLED' } },
      orderBy: { id: 'desc' },
      select: { id: true, status: true },
    });
    if (!invoice) return;

    const statusBefore = invoice.status;

    await expect(invoicesService.cancelInvoice(invoice.id, user.id)).rejects.toMatchObject({
      name: 'AppError',
      statusCode: 504,
      code: 'CANCEL_TIMEOUT',
      message: expect.stringContaining('timed out'),
    } satisfies Partial<AppError>);

    const still = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(still.status).toBe(statusBefore);
  }, 15_000);

  it('errorHandler returns AppError.message for ViewInvoicePage setError path', () => {
    const err = new AppError(
      504,
      'Delete timed out. The invoice was not cancelled — please try again.',
      'CANCEL_TIMEOUT',
    );
    let body: { error?: string; code?: string } = {};
    const res = {
      status() {
        return this;
      },
      json(payload: { error: string; code?: string }) {
        body = payload;
        return this;
      },
    };
    errorHandler(
      err,
      { method: 'POST', path: '/api/invoices/1/cancel' } as never,
      res as never,
      (() => {}) as never,
    );
    expect(body.error).toContain('timed out');
    expect(body.code).toBe('CANCEL_TIMEOUT');
  });
});
