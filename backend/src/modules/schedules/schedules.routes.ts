import { ScheduleFrequency, VoucherType } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, param, validateBody } from '../../utils/helpers';
import * as schedulesService from './schedules.service';

export const schedulesRouter = Router();
schedulesRouter.use(requireAuth);

const scheduleBodySchema = z.object({
  voucherType: z.enum([
    VoucherType.PAYMENT,
    VoucherType.RECEIPT,
    VoucherType.JOURNAL,
  ]),
  debitAccountId: z.number().int().positive(),
  creditAccountId: z.number().int().positive(),
  amount: z.number().positive(),
  description: z.string().optional().nullable(),
  frequency: z.nativeEnum(ScheduleFrequency),
  startAt: z.string().min(1),
  endAt: z.string().optional().nullable(),
  occurrenceLimit: z.number().int().positive().optional().nullable(),
});

schedulesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await schedulesService.listSchedules());
  }),
);

schedulesRouter.post(
  '/',
  validateBody(scheduleBodySchema),
  asyncHandler(async (req, res) => {
    const created = await schedulesService.createSchedule({
      ...req.body,
      createdById: req.session.userId!,
    });
    res.status(201).json(created);
  }),
);

schedulesRouter.patch(
  '/:id',
  validateBody(
    scheduleBodySchema.partial().extend({
      resetNextRun: z.boolean().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const id = Number(param(req.params.id));
    if (!Number.isFinite(id) || id < 1) {
      res.status(400).json({ error: 'Invalid schedule id' });
      return;
    }
    res.json(await schedulesService.updateSchedule(id, req.body));
  }),
);

schedulesRouter.post(
  '/:id/pause',
  asyncHandler(async (req, res) => {
    const id = Number(param(req.params.id));
    if (!Number.isFinite(id) || id < 1) {
      res.status(400).json({ error: 'Invalid schedule id' });
      return;
    }
    res.json(await schedulesService.pauseSchedule(id));
  }),
);

schedulesRouter.post(
  '/:id/resume',
  asyncHandler(async (req, res) => {
    const id = Number(param(req.params.id));
    if (!Number.isFinite(id) || id < 1) {
      res.status(400).json({ error: 'Invalid schedule id' });
      return;
    }
    res.json(await schedulesService.resumeSchedule(id));
  }),
);

schedulesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(param(req.params.id));
    if (!Number.isFinite(id) || id < 1) {
      res.status(400).json({ error: 'Invalid schedule id' });
      return;
    }
    res.json(await schedulesService.softDeleteSchedule(id));
  }),
);
