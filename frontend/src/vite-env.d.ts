/// <reference types="vite/client" />

export {};

type PickBackupFolderResult =
  | { ok: true; path: string }
  | { ok: false; path: null; error?: string };

type BackupDatabaseResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

declare global {
  interface Window {
    grainPos?: {
      platform: NodeJS.Platform;
      pickBackupFolder: () => Promise<PickBackupFolderResult>;
      backupDatabase: (destFolder: string) => Promise<BackupDatabaseResult>;
    };
  }
}
