import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validateBody } from '../../utils/helpers';
import * as saleGeneralService from './sale-general.service';

const lineSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().positive(),
  rate: z.number().positive(),
});

const createSchema = z.object({
  invoiceDate: z.string().min(1),
  salePartyAccountId: z.number().int().positive(),
  billNo: z.string().optional(),
  tafseel: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

export function registerSaleGeneralRoutes(router: Router) {
  router.get(
    '/sale-general/next-reference',
    asyncHandler(async (_req, res) => {
      res.json(await saleGeneralService.getNextSaleGeneralReference());
    }),
  );

  router.post(
    '/sale-general',
    validateBody(createSchema),
    asyncHandler(async (req, res) => {
      const invoice = await saleGeneralService.createSaleGeneralInvoice({
        ...req.body,
        createdById: req.session.userId!,
      });
      res.status(201).json(invoice);
    }),
  );

  router.patch(
    '/sale-general/:id',
    validateBody(createSchema),
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const invoice = await saleGeneralService.updatePendingSaleGeneralInvoice(
        id,
        req.body,
        req.session.userId!,
      );
      res.json(invoice);
    }),
  );
}
