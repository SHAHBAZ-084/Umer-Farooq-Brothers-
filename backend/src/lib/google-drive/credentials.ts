import {
  deleteEncryptedFile,
  readEncryptedFile,
  writeEncryptedFile,
} from '../secure-storage';
import { googleOAuthCredentialsPath } from './paths';

export type GoogleOAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

function maskClientId(clientId: string): string {
  if (clientId.length <= 20) return `${clientId.slice(0, 4)}…`;
  return `${clientId.slice(0, 8)}…${clientId.slice(-12)}`;
}

export function getEffectiveGoogleOAuthCredentials(): GoogleOAuthCredentials | null {
  const envId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const envSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  if (envId && envSecret) {
    return { clientId: envId, clientSecret: envSecret };
  }

  const raw = readEncryptedFile(googleOAuthCredentialsPath());
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as GoogleOAuthCredentials;
    if (!parsed.clientId?.trim() || !parsed.clientSecret?.trim()) return null;
    return { clientId: parsed.clientId.trim(), clientSecret: parsed.clientSecret.trim() };
  } catch {
    return null;
  }
}

export function saveGoogleOAuthCredentials(credentials: GoogleOAuthCredentials): void {
  const payload = JSON.stringify({
    clientId: credentials.clientId.trim(),
    clientSecret: credentials.clientSecret.trim(),
  });
  writeEncryptedFile(googleOAuthCredentialsPath(), payload);
  process.env.GOOGLE_DRIVE_CLIENT_ID = credentials.clientId.trim();
  process.env.GOOGLE_DRIVE_CLIENT_SECRET = credentials.clientSecret.trim();
}

export function getGoogleOAuthConfigStatus(): {
  configured: boolean;
  clientIdHint: string | null;
} {
  const creds = getEffectiveGoogleOAuthCredentials();
  return {
    configured: creds != null,
    clientIdHint: creds ? maskClientId(creds.clientId) : null,
  };
}

export function clearGoogleOAuthCredentialsFile(): void {
  deleteEncryptedFile(googleOAuthCredentialsPath());
}
