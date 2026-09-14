import { google, type drive_v3 } from 'googleapis';
import { getEffectiveGoogleOAuthCredentials } from './credentials';
import { loadGoogleDriveRefreshToken, saveGoogleDriveRefreshToken } from './tokens';
import { GOOGLE_DRIVE_FOLDER_NAMES } from './paths';

export function createGoogleDriveClient(): drive_v3.Drive {
  const credentials = getEffectiveGoogleOAuthCredentials();
  const refreshToken = loadGoogleDriveRefreshToken();
  if (!credentials) {
    throw new Error('Google OAuth credentials are not configured');
  }
  if (!refreshToken) {
    throw new Error('Google Drive is not connected');
  }

  const oauth2Client = new google.auth.OAuth2(credentials.clientId, credentials.clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  oauth2Client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      saveGoogleDriveRefreshToken(tokens.refresh_token);
    }
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

export async function resolveBackupFolderId(drive: drive_v3.Drive): Promise<string> {
  for (const folderName of GOOGLE_DRIVE_FOLDER_NAMES) {
    const escaped = folderName.replace(/'/g, "\\'");
    const list = await drive.files.list({
      q: `name='${escaped}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id,name)',
      spaces: 'drive',
      pageSize: 1,
    });
    const existing = list.data.files?.[0];
    if (existing?.id) return existing.id;
  }

  const created = await drive.files.create({
    requestBody: {
      name: GOOGLE_DRIVE_FOLDER_NAMES[0],
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });

  if (!created.data.id) {
    throw new Error('Failed to create Google Drive backup folder');
  }
  return created.data.id;
}
