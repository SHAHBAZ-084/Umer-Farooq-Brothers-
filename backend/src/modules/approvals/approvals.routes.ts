import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import { asyncHandler, param, validateBody } from '../../utils/helpers';
import { APPROVAL_KINDS, parseApprovalKind } from './approval-types';
import * as approvalsService from './approvals.service';

export const approvalsRouter = Router();

function parseKindParam(raw: string) {
  try {
    return parseApprovalKind(raw);
  } catch {
    return null;
  }
}

approvalsRouter.get(
  '/pending',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const items = await approvalsService.listPendingApprovals();
    res.json(items);
  }),
);

approvalsRouter.get(
  '/:type/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const kind = parseKindParam(param(req.params.type));
    const id = Number(param(req.params.id));
    if (!kind || !Number.isFinite(id) || id < 1) {
      res.status(400).json({ error: 'Invalid approval type or id' });
      return;
    }
    const detail = await approvalsService.getPendingApprovalDetail(kind, id);
    res.json(detail);
  }),
);

approvalsRouter.patch(
  '/:type/:id',
  requireAuth,
  validateBody(z.object({}).passthrough()),
  asyncHandler(async (req, res) => {
    const kind = parseKindParam(param(req.params.type));
    const id = Number(param(req.params.id));
    if (!kind || !Number.isFinite(id) || id < 1) {
      res.status(400).json({ error: 'Invalid approval type or id' });
      return;
    }

    const user = await import('../auth/auth.service').then((m) =>
      m.getUserById(req.session.userId!),
    );
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const updated = await approvalsService.patchPendingApproval(kind, id, user, req.body);
    res.json(updated);
  }),
);

approvalsRouter.post(
  '/:type/:id/approve',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const kind = parseKindParam(param(req.params.type));
    const id = Number(param(req.params.id));
    if (!kind || !Number.isFinite(id) || id < 1) {
      res.status(400).json({ error: 'Invalid approval type or id' });
      return;
    }
    const record = await approvalsService.approvePendingRecord(kind, id);
    res.json({ ok: true, record });
  }),
);

approvalsRouter.post(
  '/:type/:id/reject',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const kind = parseKindParam(param(req.params.type));
    const id = Number(param(req.params.id));
    if (!kind || !Number.isFinite(id) || id < 1) {
      res.status(400).json({ error: 'Invalid approval type or id' });
      return;
    }
    const record = await approvalsService.rejectPendingRecord(kind, id);
    res.json({ ok: true, record });
  }),
);

export { APPROVAL_KINDS };
