import { contextBridge, ipcRenderer } from 'electron';

export type PickBackupFolderResult =
  | { ok: true; path: string }
  | { ok: false; path: null; error?: string };

export type BackupDatabaseResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

contextBridge.exposeInMainWorld('grainPos', {
  platform: process.platform,
  pickBackupFolder: (): Promise<PickBackupFolderResult> =>
    ipcRenderer.invoke('dialog:pick-backup-folder'),
  backupDatabase: (destFolder: string): Promise<BackupDatabaseResult> =>
    ipcRenderer.invoke('db:backup', destFolder),
});
