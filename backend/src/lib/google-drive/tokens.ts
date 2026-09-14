import {
  deleteEncryptedFile,
  readEncryptedFile,
  writeEncryptedFile,
} from '../secure-storage';
import { googleDriveTokensPath } from './paths';

export type GoogleDriveTokens = {
  refresh_token: string;
};

export function loadGoogleDriveRefreshToken(): string | null {
  const raw = readEncryptedFile(googleDriveTokensPath());
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GoogleDriveTokens;
    return parsed.refresh_token?.trim() || null;
  } catch {
    return null;
  }
}

export function saveGoogleDriveRefreshToken(refreshToken: string): void {
  writeEncryptedFile(
    googleDriveTokensPath(),
    JSON.stringify({ refresh_token: refreshToken.trim() }),
  );
}

export function deleteGoogleDriveTokens(): void {
  deleteEncryptedFile(googleDriveTokensPath());
}

export function isGoogleDriveConnected(): boolean {
  return loadGoogleDriveRefreshToken() != null;
}
