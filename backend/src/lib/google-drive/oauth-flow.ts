import http from 'http';
import { URL } from 'url';
import { google } from 'googleapis';
import { openInDefaultBrowser } from './browser';
import { getEffectiveGoogleOAuthCredentials } from './credentials';
import { saveGoogleDriveRefreshToken } from './tokens';
import { patchGoogleDriveBackupState } from './state';
import { hasInternetConnectivity } from './connectivity';

const OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FLOW_TIMEOUT_MS = 5 * 60 * 1000;

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Connected</title></head>
<body style="font-family:sans-serif;padding:2rem;text-align:center">
<h1>Connected successfully</h1>
<p>You can close this window and return to the app.</p>
</body></html>`;

export async function runGoogleDriveOAuthLoopbackFlow(): Promise<void> {
  const credentials = getEffectiveGoogleOAuthCredentials();
  if (!credentials) {
    throw new Error('Google OAuth credentials are not configured');
  }

  if (!(await hasInternetConnectivity())) {
    throw new Error('No internet connection. Check your network and try again.');
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let timeout: NodeJS.Timeout | null = null;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      fn();
    };

    const server = http.createServer(async (req, res) => {
      try {
        if (!req.url?.startsWith('/oauth2callback')) {
          res.writeHead(404);
          res.end();
          return;
        }

        const url = new URL(req.url, 'http://127.0.0.1');
        const oauthError = url.searchParams.get('error');
        if (oauthError) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<p>Google sign-in was cancelled or denied. You can close this window.</p>');
          server.close();
          finish(() => reject(new Error('Google sign-in was cancelled or denied')));
          return;
        }

        const code = url.searchParams.get('code');
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<p>Missing authorization code.</p>');
          return;
        }

        const address = server.address();
        if (!address || typeof address === 'string') {
          throw new Error('Could not read OAuth redirect server address');
        }

        const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
        const oauth2Client = new google.auth.OAuth2(
          credentials.clientId,
          credentials.clientSecret,
          redirectUri,
        );

        const { tokens } = await oauth2Client.getToken(code);
        if (!tokens.refresh_token) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<p>No refresh token received. Try again after revoking app access in Google Account settings.</p>');
          server.close();
          finish(() =>
            reject(
              new Error(
                'No refresh token received from Google. Revoke this app in your Google Account and connect again.',
              ),
            ),
          );
          return;
        }

        saveGoogleDriveRefreshToken(tokens.refresh_token);
        patchGoogleDriveBackupState({ needsReconnect: false, lastError: null });

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(SUCCESS_HTML);
        server.close();
        finish(() => resolve());
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<p>Connection failed. Return to the app and try again.</p>');
        server.close();
        finish(() => reject(err instanceof Error ? err : new Error(String(err))));
      }
    });

    server.on('error', (err) => {
      server.close();
      finish(() => reject(err));
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        finish(() => reject(new Error('Failed to start OAuth redirect server')));
        return;
      }

      const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
      const oauth2Client = new google.auth.OAuth2(
        credentials.clientId,
        credentials.clientSecret,
        redirectUri,
      );

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [OAUTH_SCOPE],
      });

      openInDefaultBrowser(authUrl);
    });

    timeout = setTimeout(() => {
      server.close();
      finish(() => reject(new Error('Google sign-in timed out after 5 minutes')));
    }, FLOW_TIMEOUT_MS);
  });
}
