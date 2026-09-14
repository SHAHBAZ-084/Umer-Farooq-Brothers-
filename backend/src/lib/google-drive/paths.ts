import path from 'path';
import { getDatabaseFilePath } from '../database-path';

export const GOOGLE_DRIVE_FOLDER_NAMES = [
  'Umer Farooq & Brothers Backups',
  'Grain Market POS Backups',
] as const;

export function getGoogleDriveDataDirectory(): string {
  return path.join(path.dirname(getDatabaseFilePath()), 'google-drive');
}

export function googleOAuthCredentialsPath(): string {
  return path.join(getGoogleDriveDataDirectory(), 'google-oauth-credentials.dat');
}

export function googleDriveTokensPath(): string {
  return path.join(getGoogleDriveDataDirectory(), 'google-drive-tokens.dat');
}

export function googleDriveBackupStatePath(): string {
  return path.join(getGoogleDriveDataDirectory(), 'google-drive-backup-state.json');
}

export function googleDriveStagingDirectory(): string {
  return path.join(getGoogleDriveDataDirectory(), 'staging');
}
