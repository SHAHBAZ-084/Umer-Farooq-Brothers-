import fs from 'fs';
import { googleDriveBackupStatePath } from './paths';

export type GoogleDriveBackupState = {
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  needsReconnect: boolean;
};

const DEFAULT_STATE: GoogleDriveBackupState = {
  lastSuccessAt: null,
  lastAttemptAt: null,
  lastError: null,
  needsReconnect: false,
};

export function readGoogleDriveBackupState(): GoogleDriveBackupState {
  const filePath = googleDriveBackupStatePath();
  if (!fs.existsSync(filePath)) return { ...DEFAULT_STATE };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<GoogleDriveBackupState>;
    return {
      lastSuccessAt: parsed.lastSuccessAt ?? null,
      lastAttemptAt: parsed.lastAttemptAt ?? null,
      lastError: parsed.lastError ?? null,
      needsReconnect: Boolean(parsed.needsReconnect),
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function writeGoogleDriveBackupState(state: GoogleDriveBackupState): void {
  const filePath = googleDriveBackupStatePath();
  const dir = filePath.replace(/[\\/][^\\/]+$/, '');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
}

export function patchGoogleDriveBackupState(
  patch: Partial<GoogleDriveBackupState>,
): GoogleDriveBackupState {
  const next = { ...readGoogleDriveBackupState(), ...patch };
  writeGoogleDriveBackupState(next);
  return next;
}
