export function isInvalidGrantError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const response = (err as { response?: { data?: { error?: string } } }).response;
  if (response?.data?.error === 'invalid_grant') return true;
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('invalid_grant');
}

export const GOOGLE_DRIVE_RECONNECT_MESSAGE =
  'Google Drive access token expired or revoked. Please reconnect.';
