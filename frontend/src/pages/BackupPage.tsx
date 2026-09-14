import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { BACKUP_FILENAME_PREFIX } from '../config/brand';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import {
  FieldLabel,
  PageShell,
  Panel,
  PrimaryButton,
  SecondaryButton,
  TextInput,
  Tile,
} from '../components/ui/PageShell';

const BACKUP_FOLDER_KEY = 'grain-pos-backup-folder';

type DriveStatus = Awaited<ReturnType<typeof api.getGoogleDriveBackupStatus>>;

function readStoredBackupFolder(): string {
  try {
    return localStorage.getItem(BACKUP_FOLDER_KEY) ?? '';
  } catch {
    return '';
  }
}

function storeBackupFolder(folder: string): void {
  try {
    if (folder) {
      localStorage.setItem(BACKUP_FOLDER_KEY, folder);
    } else {
      localStorage.removeItem(BACKUP_FOLDER_KEY);
    }
  } catch {
    // Ignore storage errors.
  }
}

function formatTimestamp(value: string | null) {
  if (!value) return '—';
  return formatDate(value);
}

function GoogleDriveBackupPanel() {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingOAuth, setSavingOAuth] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const row = await api.getGoogleDriveBackupStatus();
      setStatus(row);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : 'Failed to load Google Drive status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  async function onSaveOAuth(event: FormEvent) {
    event.preventDefault();
    setSavingOAuth(true);
    setError('');
    setMessage('');
    try {
      const row = await api.saveGoogleOAuthConfig({
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
      });
      setStatus((prev) =>
        prev
          ? { ...prev, oauthConfigured: row.configured, oauthClientIdHint: row.clientIdHint }
          : null,
      );
      setClientSecret('');
      setMessage('Google OAuth credentials saved.');
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save OAuth credentials');
    } finally {
      setSavingOAuth(false);
    }
  }

  async function onConnect() {
    setConnecting(true);
    setError('');
    setMessage('');
    try {
      await api.connectGoogleDrive();
      setMessage('Google Drive connected.');
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Drive connection failed');
      await refreshStatus();
    } finally {
      setConnecting(false);
    }
  }

  async function onBackup() {
    setBackingUp(true);
    setError('');
    setMessage('');
    try {
      const result = await api.backupToGoogleDrive();
      setMessage(`Backup uploaded at ${formatTimestamp(result.uploadedAt ?? null)}`);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Drive backup failed');
      await refreshStatus();
    } finally {
      setBackingUp(false);
    }
  }

  async function onDisconnect() {
    if (!window.confirm('Disconnect Google Drive on this computer?')) return;
    setDisconnecting(true);
    setError('');
    setMessage('');
    try {
      await api.disconnectGoogleDrive();
      setMessage('Google Drive disconnected.');
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect Google Drive');
    } finally {
      setDisconnecting(false);
    }
  }

  const oauthReady = status?.oauthConfigured ?? false;
  const connected = status?.connected ?? false;
  const needsReconnect = status?.needsReconnect ?? false;

  return (
    <Panel className="max-w-2xl">
      <h2 className="mb-1 text-base font-semibold text-textPrimary">Google Drive Backup</h2>
      <p className="mb-4 text-sm text-textSecondary">
        Back up your database to your own Google Drive. Backups run only when you click the button
        — there is no automatic schedule.
      </p>

      {loading ? <p className="text-sm text-textMuted">Loading…</p> : null}

      {status?.needsReconnect ? (
        <Tile className="mb-4 border-danger bg-bgDanger text-sm text-danger">
          Google Drive access token expired or revoked. Please reconnect.
        </Tile>
      ) : null}

      <form className="mb-6 space-y-3 border-b border-border pb-6" onSubmit={onSaveOAuth}>
        <h3 className="text-sm font-semibold text-textPrimary">OAuth setup</h3>
        <p className="text-xs text-textMuted">
          Create a <strong>Desktop</strong> OAuth client in Google Cloud Console, then paste your
          Client ID and Client Secret here. Never commit these values to source control.
        </p>
        {status?.oauthClientIdHint ? (
          <p className="text-xs text-textSecondary">
            Saved client ID: <span className="font-mono">{status.oauthClientIdHint}</span>
          </p>
        ) : null}
        <div>
          <FieldLabel>Client ID</FieldLabel>
          <TextInput
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="….apps.googleusercontent.com"
            autoComplete="off"
          />
        </div>
        <div>
          <FieldLabel>Client Secret</FieldLabel>
          <TextInput
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="OAuth client secret"
            autoComplete="new-password"
          />
        </div>
        <SecondaryButton type="submit" disabled={savingOAuth || !clientId.trim() || !clientSecret.trim()}>
          {savingOAuth ? 'Saving…' : 'Save OAuth credentials'}
        </SecondaryButton>
      </form>

      <div className="mb-4 space-y-1 text-sm text-textSecondary">
        <p>
          Connection:{' '}
          <span className="font-medium text-textPrimary">
            {connected ? 'Connected' : 'Not connected'}
          </span>
        </p>
        <p>Last successful backup: {formatTimestamp(status?.lastSuccessAt ?? null)}</p>
        <p>Last backup attempt: {formatTimestamp(status?.lastAttemptAt ?? null)}</p>
        {status?.lastError ? (
          <p className="text-danger">Last error: {status.lastError}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <SecondaryButton
          type="button"
          disabled={!oauthReady || connecting}
          onClick={() => void onConnect()}
        >
          {connecting ? 'Connecting…' : needsReconnect ? 'Reconnect Google Drive' : 'Connect Google Drive'}
        </SecondaryButton>
        <PrimaryButton
          type="button"
          disabled={!connected || needsReconnect || backingUp}
          onClick={() => void onBackup()}
        >
          {backingUp ? 'Uploading…' : 'Backup to Google Drive'}
        </PrimaryButton>
        <SecondaryButton
          type="button"
          disabled={!connected || disconnecting}
          onClick={() => void onDisconnect()}
        >
          {disconnecting ? 'Disconnecting…' : 'Disconnect Google Drive'}
        </SecondaryButton>
      </div>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-success">{message}</p> : null}
    </Panel>
  );
}

export function BackupPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [backupFolder, setBackupFolder] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const isDesktop = Boolean(window.grainPos?.pickBackupFolder && window.grainPos?.backupDatabase);

  useEffect(() => {
    setBackupFolder(readStoredBackupFolder());
  }, []);

  async function onChooseFolder() {
    if (!window.grainPos?.pickBackupFolder) {
      setError('Folder selection is only available in the desktop app.');
      return;
    }

    setPicking(true);
    setError('');
    setMessage('');

    try {
      const result = await window.grainPos.pickBackupFolder();
      if (result.ok && result.path) {
        setBackupFolder(result.path);
        storeBackupFolder(result.path);
        setMessage('Backup folder selected.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open folder picker.');
    } finally {
      setPicking(false);
    }
  }

  async function onBackupNow() {
    if (!backupFolder.trim()) {
      setError('Choose a backup folder first.');
      return;
    }

    if (!window.grainPos?.backupDatabase) {
      setError('Backup is only available in the desktop app.');
      return;
    }

    setBackingUp(true);
    setError('');
    setMessage('');

    try {
      const result = await window.grainPos.backupDatabase(backupFolder.trim());
      if (result.ok) {
        setMessage(`Backup saved to ${result.path}`);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed.');
    } finally {
      setBackingUp(false);
    }
  }

  return (
    <PageShell subtitle="Copy the database locally or upload a manual backup to Google Drive">
      {isAdmin ? (
        <div className="mb-6">
          <GoogleDriveBackupPanel />
        </div>
      ) : null}

      <Panel className="max-w-2xl">
        <h2 className="mb-1 text-base font-semibold text-textPrimary">Local folder backup</h2>
        <p className="mb-4 text-sm text-textSecondary">
          Copy the database file to a folder on this computer.
        </p>

        {!isDesktop ? (
          <Tile className="mb-4 border-status-warning/40 bg-status-warning/10 text-sm text-status-warning">
            Run the Electron desktop app to choose a folder and create backups. Browser-only mode
            cannot access the file system.
          </Tile>
        ) : null}

        <div className="space-y-4">
          <div>
            <FieldLabel>Backup Location</FieldLabel>
            <TextInput
              readOnly
              value={backupFolder}
              placeholder="No folder selected"
              className="font-mono text-xs"
            />
            <p className="mt-1 text-xs text-textMuted">
              Backups are saved as timestamped files (e.g. {BACKUP_FILENAME_PREFIX}-2026-08-20_14-30-00.db).
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <SecondaryButton type="button" onClick={onChooseFolder} disabled={picking || !isDesktop}>
              {picking ? 'Opening…' : 'Choose Folder'}
            </SecondaryButton>
            <PrimaryButton
              type="button"
              onClick={onBackupNow}
              disabled={!backupFolder.trim() || backingUp || !isDesktop}
            >
              {backingUp ? 'Backing up…' : 'Backup Now'}
            </PrimaryButton>
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {message ? <p className="text-sm text-success">{message}</p> : null}
        </div>
      </Panel>
    </PageShell>
  );
}
