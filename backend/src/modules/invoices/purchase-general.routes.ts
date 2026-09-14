import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validateBody } from '../../utils/helpers';
import * as purchaseGeneralService from './purchase-general.service';

const lineSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().positive(),
  rate: z.number().positive(),
  mazduriAmount: z.number().min(0).optional(),
});

const createSchema = z.object({
  invoiceDate: z.string().min(1),
  partyAccountId: z.number().int().positive(),
  billNo: z.string().optional(),
  tafseel: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

export function registerPurchaseGeneralRoutes(router: Router) {
  router.get(
    '/purchase-general/next-reference',
    asyncHandler(async (_req, res) => {
      res.json(await purchaseGeneralService.getNextPurchaseGeneralReference());
    }),
  );

  router.post(
    '/purchase-general',
    validateBody(createSchema),
    asyncHandler(async (req, res) => {
      const invoice = await purchaseGeneralService.createPurchaseGeneralInvoice({
        ...req.body,
        createdById: req.session.userId!,
      });
      res.status(201).json(invoice);
    }),
  );

  router.patch(
    '/purchase-general/:id',
    validateBody(createSchema),
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const invoice = await purchaseGeneralService.updatePendingPurchaseGeneralInvoice(
        id,
        req.body,
        req.session.userId!,
      );
      res.json(invoice);
    }),
  );
}
