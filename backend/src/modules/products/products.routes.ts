import { Router } from 'express';
import { ProductStockMode } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import { asyncHandler, param, validateBody } from '../../utils/helpers';
import * as productsService from './products.service';
import * as productCategories from './product-categories';

export const productsRouter = Router();
productsRouter.use(requireAuth);

productsRouter.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const stockModeRaw = req.query.stockMode as string | undefined;
    const stockMode = stockModeRaw
      ? z.nativeEnum(ProductStockMode).parse(stockModeRaw)
      : undefined;
    res.json(await productCategories.listProductCategories({ stockMode }));
  }),
);

productsRouter.post(
  '/categories',
  validateBody(
    z.object({
      name: z.string().min(1),
      stockMode: z.nativeEnum(ProductStockMode),
    }),
  ),
  asyncHandler(async (req, res) => {
    const category = await productCategories.createProductCategory(req.body);
    res.status(201).json(category);
  }),
);

productsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const stockModeRaw = req.query.stockMode as string | undefined;
    const stockMode = stockModeRaw
      ? z.nativeEnum(ProductStockMode).parse(stockModeRaw)
      : undefined;
    const categoryIdRaw = req.query.categoryId as string | undefined;
    const categoryId = categoryIdRaw ? Number(categoryIdRaw) : undefined;
    res.json(
      await productsService.listProducts({
        stockMode,
        categoryId:
          categoryId != null && Number.isFinite(categoryId) && categoryId > 0
            ? categoryId
            : undefined,
      }),
    );
  }),
);

productsRouter.post(
  '/',
  validateBody(
    z.object({
      name: z.string().min(1),
      unit: z.string().optional(),
      code: z.string().optional(),
      categoryId: z.number().int().positive().optional(),
      openingBalance: z.number().min(0).optional(),
      openingBalanceSide: z.enum(['DR', 'CR']).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const product = await productsService.createProduct({
      ...req.body,
      createdById: req.session.userId!,
    });
    res.status(201).json(product);
  }),
);

productsRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await productsService.removeProduct(parseInt(param(req.params.id), 10)));
  }),
);
