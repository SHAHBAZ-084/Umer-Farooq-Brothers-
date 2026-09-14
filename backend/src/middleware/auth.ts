import type { NextFunction, Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session.userId) {
    next();
    return;
  }

  res.status(401).json({ error: 'Not authenticated' });
}

/** Requires an authenticated user with ADMIN role. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: { role: true },
    });
    if (!user || user.role !== UserRole.ADMIN) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
