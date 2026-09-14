import { ReminderStatus } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, param, validateBody } from '../../utils/helpers';
import * as remindersService from './reminders.service';

export const remindersRouter = Router();
remindersRouter.use(requireAuth);

remindersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const raw = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : 'PENDING';
    let status: ReminderStatus | undefined = ReminderStatus.PENDING;
    if (raw === 'ALL') status = undefined;
    else if (raw === 'SETTLED') status = ReminderStatus.SETTLED;
    else if (raw === 'PENDING') status = ReminderStatus.PENDING;
    else {
      res.status(400).json({ error: 'status must be PENDING, SETTLED, or ALL' });
      return;
    }
    res.json(await remindersService.listReminders(status));
  }),
);

remindersRouter.post(
  '/',
  validateBody(
    z.object({
      accountId: z.number().int().positive(),
      amount: z.number().positive(),
      reminderAt: z.string().min(1),
      note: z.string().optional().nullable(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const created = await remindersService.createReminder({
      ...req.body,
      createdById: req.session.userId!,
    });
    res.status(201).json(created);
  }),
);

remindersRouter.post(
  '/:id/settle',
  asyncHandler(async (req, res) => {
    const id = Number(param(req.params.id));
    if (!Number.isFinite(id) || id < 1) {
      res.status(400).json({ error: 'Invalid reminder id' });
      return;
    }
    res.json(await remindersService.settleReminder(id, req.session.userId!));
  }),
);

remindersRouter.post(
  '/:id/notify',
  validateBody(
    z.object({
      notifyCount: z.number().int().min(0).max(9).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const id = Number(param(req.params.id));
    if (!Number.isFinite(id) || id < 1) {
      res.status(400).json({ error: 'Invalid reminder id' });
      return;
    }
    res.json(await remindersService.recordReminderNotification(id, req.body));
  }),
);
