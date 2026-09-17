import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import {
  FINANCIAL_YEAR_CLOSE_PASSCODE_KEY,
  findAppSecret,
  verifyAppSecretPasscode,
} from '../../lib/app-secrets';
import { asyncHandler, validateBody } from '../../utils/helpers';
import { prisma } from '../../lib/prisma';
import {
  createDatabaseBackup,
  verifyDatabaseIntegrity,
  walCheckpointTruncate,
} from '../../lib/database-maintenance';
import { getBackupDirectory, getDatabaseFilePath } from '../../lib/database-path';
import type { StartupStatus } from '../../lib/startup';

export const systemRouter = Router();

systemRouter.use(requireAuth);

systemRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json({
      databasePath: getDatabaseFilePath(),
      backupDirectory: getBackupDirectory(),
    });
  }),
);

systemRouter.post(
  '/verify-database',
  asyncHandler(async (_req, res) => {
    const result = await verifyDatabaseIntegrity(prisma);
    res.json(result);
  }),
);

systemRouter.post(
  '/backup-database',
  asyncHandler(async (_req, res) => {
    const path = await createDatabaseBackup();
    res.json({ ok: true, path });
  }),
);

systemRouter.post(
  '/wal-checkpoint',
  asyncHandler(async (_req, res) => {
    await walCheckpointTruncate(prisma);
    res.json({ ok: true });
  }),
);

/**
 * Admin-only gate for the hidden Close Financial Year entry point.
 * Compares the submitted passcode against the bcrypt hash in AppSecret.
 * Does not return the hash or the passcode.
 */
systemRouter.post(
  '/financial-year/verify-passcode',
  requireAdmin,
  validateBody(
    z.object({
      passcode: z.string().min(1, 'Passcode is required'),
    }),
  ),
  asyncHandler(async (req, res) => {
    const secret = await findAppSecret(prisma, FINANCIAL_YEAR_CLOSE_PASSCODE_KEY);
    if (!secret) {
      res.status(503).json({ error: 'Close-year passcode is not configured' });
      return;
    }

    const matched = await verifyAppSecretPasscode(
      prisma,
      FINANCIAL_YEAR_CLOSE_PASSCODE_KEY,
      req.body.passcode,
    );
    if (!matched) {
      res.status(403).json({ error: 'Invalid passcode' });
      return;
    }

    res.json({ verified: true });
  }),
);

export function createSystemHealthHandler(getStartupStatus?: () => StartupStatus | null) {
  return (_req: import('express').Request, res: import('express').Response) => {
    const startup = getStartupStatus?.();
    res.json({
      ok: startup?.ok ?? true,
      app: 'grain-market-pos',
      database: startup
        ? {
            exists: startup.databaseExists,
            migrationsApplied: startup.migrationsApplied,
            integrityOk: startup.integrityOk,
            error: startup.error ?? null,
          }
        : undefined,
    });
  };
}
