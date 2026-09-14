import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../utils/helpers';
import { parsePagination } from '../../utils/pagination';
import * as stockService from './stock.service';

export const stockRouter = Router();
stockRouter.use(requireAuth);

stockRouter.get(
  '/report',
  asyncHandler(async (req, res) => {
    const productId = Number(req.query.productId);
    if (!Number.isFinite(productId) || productId < 1) {
      res.status(400).json({ error: 'productId is required' });
      return;
    }
    const bagTypeRaw = String(req.query.bagType ?? 'BORI').toUpperCase();
    const bagType = z.enum(['BORI', 'THELA']).parse(bagTypeRaw);
    const hasPagination = req.query.limit != null || req.query.offset != null;
    const pagination = hasPagination
      ? parsePagination(
          {
            limit: req.query.limit as string | undefined,
            offset: req.query.offset as string | undefined,
          },
          { limit: 100, max: 500 },
        )
      : null;
    res.json(await stockService.getStockReport({ productId, bagType, pagination }));
  }),
);
