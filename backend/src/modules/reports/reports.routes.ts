import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../utils/helpers';
import { parsePagination } from '../../utils/pagination';
import * as dailyReport from './daily-report.service';
import * as salePurchaseReport from './sale-purchase-report.service';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

reportsRouter.get(
  '/daily',
  asyncHandler(async (req, res) => {
    const date = String(req.query.date ?? '');
    if (!date) {
      res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
      return;
    }
    const filterKeyRaw = String(req.query.filterKey ?? '').trim();
    const filterKey =
      filterKeyRaw && filterKeyRaw !== 'all'
        ? (filterKeyRaw as dailyReport.DailyReportFilterKey)
        : undefined;
    const hasPagination = req.query.limit != null || req.query.offset != null;
    const pagination = hasPagination
      ? parsePagination(
          {
            limit: req.query.limit as string | undefined,
            offset: req.query.offset as string | undefined,
          },
          { limit: 30, max: 500 },
        )
      : null;
    res.json(
      await dailyReport.getDailyReport(date, {
        filterKey,
        pagination,
      }),
    );
  }),
);

reportsRouter.get(
  '/sale-purchase',
  asyncHandler(async (req, res) => {
    const mode = z.enum(['SALE', 'PURCHASE']).parse(String(req.query.mode ?? 'SALE').toUpperCase());
    const typeFilter = z
      .enum(['ALL', 'COMMISSION', 'PAUNCH', 'MAAL'])
      .parse(String(req.query.typeFilter ?? 'ALL').toUpperCase());
    const fromDate = String(req.query.fromDate ?? '');
    const toDate = String(req.query.toDate ?? '');
    if (!fromDate || !toDate) {
      res.status(400).json({ error: 'fromDate and toDate are required' });
      return;
    }

    const partyRaw = req.query.partyAccountId;
    const productRaw = req.query.productId;
    const partyAccountId = partyRaw != null && String(partyRaw) !== ''
      ? Number(partyRaw)
      : null;
    const productId = productRaw != null && String(productRaw) !== ''
      ? Number(productRaw)
      : null;

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

    res.json(
      await salePurchaseReport.getSalePurchaseReport({
        mode,
        typeFilter,
        fromDate,
        toDate,
        partyAccountId: Number.isFinite(partyAccountId) && (partyAccountId as number) > 0
          ? partyAccountId
          : null,
        productId: Number.isFinite(productId) && (productId as number) > 0 ? productId : null,
        pagination,
      }),
    );
  }),
);
