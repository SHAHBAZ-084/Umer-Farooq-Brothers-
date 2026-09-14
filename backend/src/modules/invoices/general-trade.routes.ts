import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validateBody } from '../../utils/helpers';
import * as generalTradeService from './general-trade.service';

const lineSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().positive(),
  purchaseRate: z.number().positive(),
  saleRate: z.number().positive(),
  mazduriAmount: z.number().min(0).optional(),
});

const createSchema = z.object({
  invoiceDate: z.string().min(1),
  partyAccountId: z.number().int().positive(),
  salePartyAccountId: z.number().int().positive(),
  billNo: z.string().optional(),
  tafseel: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

export function registerGeneralTradeRoutes(router: Router) {
  router.get(
    '/general-trade/next-reference',
    asyncHandler(async (_req, res) => {
      res.json(await generalTradeService.getNextGeneralTradeReference());
    }),
  );

  router.post(
    '/general-trade',
    validateBody(createSchema),
    asyncHandler(async (req, res) => {
      const invoice = await generalTradeService.createGeneralTradeInvoice({
        ...req.body,
        createdById: req.session.userId!,
      });
      res.status(201).json(invoice);
    }),
  );

  router.patch(
    '/general-trade/:id',
    validateBody(createSchema),
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const invoice = await generalTradeService.updatePendingGeneralTradeInvoice(
        id,
        req.body,
        req.session.userId!,
      );
      res.json(invoice);
    }),
  );
}
