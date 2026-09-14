import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import { asyncHandler, param, validateBody } from '../../utils/helpers';
import * as authService from './auth.service';

export const authRouter = Router();

authRouter.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };

    if (!username?.trim() || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const user = await authService.login(username.trim(), password);

    if (!user) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    req.session.userId = user.id;
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await authService.getUserById(req.session.userId!);

    if (!user) {
      req.session.destroy(() => {
        res.status(401).json({ error: 'Not authenticated' });
      });
      return;
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
});

authRouter.get(
  '/users',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const users = await authService.listUsers();
    res.json(users);
  }),
);

authRouter.post(
  '/users',
  requireAuth,
  requireAdmin,
  validateBody(
    z.object({
      username: z.string().min(1),
      password: z.string().min(1),
      displayName: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = await authService.createUser(req.body);
    res.status(201).json({ user });
  }),
);

authRouter.delete(
  '/users/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(param(req.params.id));
    if (!Number.isFinite(id) || id < 1) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const result = await authService.deleteUser(id, req.session.userId!);
    res.json(result);
  }),
);

authRouter.patch(
  '/users/:id',
  requireAuth,
  requireAdmin,
  validateBody(
    z.object({
      username: z.string().min(1).optional(),
      displayName: z.string().optional().nullable(),
      role: z.enum(['ADMIN', 'USER']).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const id = Number(param(req.params.id));
    if (!Number.isFinite(id) || id < 1) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const user = await authService.updateUser(id, req.body);
    res.json({ user });
  }),
);

authRouter.post(
  '/users/:id/reset-password',
  requireAuth,
  requireAdmin,
  validateBody(
    z.object({
      newPassword: z.string().min(1),
    }),
  ),
  asyncHandler(async (req, res) => {
    const id = Number(param(req.params.id));
    if (!Number.isFinite(id) || id < 1) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const result = await authService.resetUserPassword(id, req.body);
    res.json(result);
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  validateBody(
    z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(1),
    }),
  ),
  asyncHandler(async (req, res) => {
    const result = await authService.changePassword(req.session.userId!, req.body);
    res.json(result);
  }),
);
