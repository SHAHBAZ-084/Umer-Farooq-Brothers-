import fs from 'fs';
import path from 'path';
import { getDatabaseFilePath } from '../database-path';
import { walCheckpointTruncate } from '../database-maintenance';
import { prisma } from '../prisma';
import { logger } from '../logger';
import { hasInternetConnectivity } from './connectivity';
import { getGoogleOAuthConfigStatus } from './credentials';
import { createGoogleDriveClient, resolveBackupFolderId } from './drive-client';
import { GOOGLE_DRIVE_RECONNECT_MESSAGE, isInvalidGrantError } from './errors';
import { googleDriveStagingDirectory } from './paths';
import { patchGoogleDriveBackupState, readGoogleDriveBackupState } from './state';
import { isGoogleDriveConnected, deleteGoogleDriveTokens } from './tokens';
import { BACKUP_FILENAME_PREFIX } from '../backup-filename';

export type GoogleDriveBackupResult = {
  ok: boolean;
  uploadedAt?: string;
  error?: string;
};

function formatDriveBackupFilename(date: Date): string {
  const stamp = date.toISOString().replace(/[:.]/g, '-');
  return `${BACKUP_FILENAME_PREFIX}-${stamp}.db`;
}

export async function runGoogleDriveBackup(): Promise<GoogleDriveBackupResult> {
  const state = readGoogleDriveBackupState();
  if (!isGoogleDriveConnected()) {
    return { ok: false, error: 'Google Drive is not connected' };
  }
  if (state.needsReconnect) {
    return { ok: false, error: GOOGLE_DRIVE_RECONNECT_MESSAGE };
  }
  if (!(await hasInternetConnectivity())) {
    return { ok: false, error: 'No internet connection. Check your network and try again.' };
  }

  const dbPath = getDatabaseFilePath();
  if (!fs.existsSync(dbPath)) {
    return { ok: false, error: 'Database file does not exist yet' };
  }

  const attemptAt = new Date().toISOString();
  patchGoogleDriveBackupState({ lastAttemptAt: attemptAt });

  const stagingDir = googleDriveStagingDirectory();
  if (!fs.existsSync(stagingDir)) {
    fs.mkdirSync(stagingDir, { recursive: true });
  }

  const stagingPath = path.join(stagingDir, formatDriveBackupFilename(new Date()));

  try {
    try {
      await walCheckpointTruncate(prisma);
    } catch (err) {
      logger.warn('WAL checkpoint before Google Drive backup failed; continuing with file copy', {
        err: String(err),
      });
    }

    await fs.promises.copyFile(dbPath, stagingPath);

    const drive = createGoogleDriveClient();
    const folderId = await resolveBackupFolderId(drive);

    await drive.files.create({
      requestBody: {
        name: path.basename(stagingPath),
        parents: [folderId],
      },
      media: {
        mimeType: 'application/x-sqlite3',
        body: fs.createReadStream(stagingPath),
      },
      fields: 'id',
    });

    const uploadedAt = new Date().toISOString();
    patchGoogleDriveBackupState({
      lastSuccessAt: uploadedAt,
      lastError: null,
      needsReconnect: false,
    });

    return { ok: true, uploadedAt };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isInvalidGrantError(err)) {
      patchGoogleDriveBackupState({
        lastError: GOOGLE_DRIVE_RECONNECT_MESSAGE,
        needsReconnect: true,
      });
      return { ok: false, error: GOOGLE_DRIVE_RECONNECT_MESSAGE };
    }

    patchGoogleDriveBackupState({ lastError: message });
    return { ok: false, error: message };
  } finally {
    if (fs.existsSync(stagingPath)) {
      await fs.promises.unlink(stagingPath).catch(() => undefined);
    }
  }
}

export function disconnectGoogleDrive(): void {
  deleteGoogleDriveTokens();
  patchGoogleDriveBackupState({
    needsReconnect: false,
    lastError: null,
  });
}

export function getGoogleDriveBackupStatus() {
  const oauth = getGoogleOAuthConfigStatus();
  const state = readGoogleDriveBackupState();
  return {
    connected: isGoogleDriveConnected(),
    needsReconnect: state.needsReconnect,
    lastSuccessAt: state.lastSuccessAt,
    lastAttemptAt: state.lastAttemptAt,
    lastError: state.lastError,
    oauthConfigured: oauth.configured,
    oauthClientIdHint: oauth.clientIdHint,
  };
}
