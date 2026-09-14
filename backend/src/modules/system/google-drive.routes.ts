import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middleware/auth';
import { asyncHandler, AppError } from '../../utils/helpers';
import {
  getGoogleOAuthConfigStatus,
  saveGoogleOAuthCredentials,
} from '../../lib/google-drive/credentials';
import {
  disconnectGoogleDrive,
  getGoogleDriveBackupStatus,
  runGoogleDriveBackup,
} from '../../lib/google-drive/backup-service';
import { runGoogleDriveOAuthLoopbackFlow } from '../../lib/google-drive/oauth-flow';

export const googleDriveRouter = Router();

googleDriveRouter.use(requireAdmin);

googleDriveRouter.get(
  '/backup-status',
  asyncHandler(async (_req, res) => {
    res.json(getGoogleDriveBackupStatus());
  }),
);

googleDriveRouter.get(
  '/google-drive/oauth-config',
  asyncHandler(async (_req, res) => {
    res.json(getGoogleOAuthConfigStatus());
  }),
);

const oauthConfigSchema = z.object({
  clientId: z.string().trim().min(1, 'Client ID is required'),
  clientSecret: z.string().trim().min(1, 'Client secret is required'),
});

googleDriveRouter.post(
  '/google-drive/oauth-config',
  asyncHandler(async (req, res) => {
    const body = oauthConfigSchema.parse(req.body);
    saveGoogleOAuthCredentials({
      clientId: body.clientId,
      clientSecret: body.clientSecret,
    });
    res.json(getGoogleOAuthConfigStatus());
  }),
);

googleDriveRouter.post(
  '/google-drive/connect',
  asyncHandler(async (_req, res) => {
    await runGoogleDriveOAuthLoopbackFlow();
    res.json({ ok: true, ...getGoogleDriveBackupStatus() });
  }),
);

googleDriveRouter.post(
  '/google-drive/disconnect',
  asyncHandler(async (_req, res) => {
    disconnectGoogleDrive();
    res.json({ ok: true, ...getGoogleDriveBackupStatus() });
  }),
);

googleDriveRouter.post(
  '/google-drive/backup-now',
  asyncHandler(async (_req, res) => {
    const result = await runGoogleDriveBackup();
    if (!result.ok) {
      throw new AppError(400, result.error ?? 'Google Drive backup failed');
    }
    res.json(result);
  }),
);
