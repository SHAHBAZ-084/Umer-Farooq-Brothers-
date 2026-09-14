import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/** Resolve the on-disk SQLite file from DATABASE_URL (file:…). */
export function getDatabaseFilePath(): string {
  const url = process.env.DATABASE_URL ?? 'file:./data/grain-pos.db';

  if (url.startsWith('file:')) {
    try {
      // Handles file:///C:/... and file:/C:/... correctly on Windows.
      return fileURLToPath(url);
    } catch {
      const raw = url.replace(/^file:/, '');
      if (path.isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) {
        return path.normalize(raw);
      }
      const backendRoot = path.resolve(__dirname, '../..');
      return path.resolve(backendRoot, raw);
    }
  }

  if (path.isAbsolute(url) || /^[A-Za-z]:[\\/]/.test(url)) {
    return path.normalize(url);
  }

  const backendRoot = path.resolve(__dirname, '../..');
  return path.resolve(backendRoot, url);
}

export function getBackupDirectory(): string {
  const dbPath = getDatabaseFilePath();
  return path.join(path.dirname(dbPath), 'backups');
}

export function getLogDirectory(): string {
  const dbPath = getDatabaseFilePath();
  return path.join(path.dirname(dbPath), 'logs');
}

export function ensureDatabaseDirectoryExists(): void {
  const dbPath = getDatabaseFilePath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
