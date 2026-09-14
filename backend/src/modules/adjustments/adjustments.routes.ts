import { Router } from 'express';
import { OpeningBalanceSide } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, validateBody } from '../../utils/helpers';
import * as adjustmentsService from './adjustments.service';

export const adjustmentsRouter = Router();
adjustmentsRouter.use(requireAuth);

adjustmentsRouter.post(
  '/account',
  validateBody(
    z.object({
      accountId: z.number().int().positive(),
      amount: z.number().positive(),
      side: z.nativeEnum(OpeningBalanceSide),
      adjustmentDate: z.string().min(1),
      notes: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const row = await adjustmentsService.createAccountAdjustment({
      ...req.body,
      createdById: req.session.userId!,
    });
    res.status(201).json(row);
  }),
);

adjustmentsRouter.post(
  '/stock',
  validateBody(
    z.object({
      productId: z.number().int().positive(),
      bagType: z.enum(['BORI', 'THELA']),
      direction: z.enum(['IN', 'OUT']),
      bags: z.number().positive(),
      amount: z.number().positive(),
      adjustmentDate: z.string().min(1),
      notes: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const row = await adjustmentsService.createStockAdjustment({
      ...req.body,
      createdById: req.session.userId!,
    });
    res.status(201).json(row);
  }),
);
