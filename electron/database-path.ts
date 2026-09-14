import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { fileURLToPath } from 'url';

function readDatabaseUrlFromEnv(backendRoot: string): string {
  const envPath = path.join(backendRoot, '.env');
  if (!fs.existsSync(envPath)) {
    return 'file:./data/grain-pos.db';
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^DATABASE_URL=(?:"([^"]+)"|'([^']+)'|(\S+))/m);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? 'file:./data/grain-pos.db';
}

function resolveSqliteFileUrl(url: string): string {
  if (url.startsWith('file:')) {
    try {
      return fileURLToPath(url);
    } catch {
      const raw = url.replace(/^file:/, '');
      if (path.isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) return raw;
      return path.resolve(raw);
    }
  }
  if (path.isAbsolute(url) || /^[A-Za-z]:[\\/]/.test(url)) return url;
  return path.resolve(url);
}

/** Resolve the on-disk SQLite file (mirrors backend/src/lib/database-path.ts). */
export function getDatabaseFilePath(): string {
  if (process.env.DATABASE_URL) {
    return resolveSqliteFileUrl(process.env.DATABASE_URL);
  }

  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'data', 'grain-pos.db');
  }

  const backendRoot = path.join(app.getAppPath(), 'backend');
  const url = readDatabaseUrlFromEnv(backendRoot);
  const raw = url.replace(/^file:/, '');

  if (path.isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) {
    return raw;
  }

  return path.resolve(backendRoot, raw);
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { BACKUP_FILENAME_PREFIX } = require(
  path.resolve(__dirname, '../shared/backup-constants.cjs'),
) as { BACKUP_FILENAME_PREFIX: string };

export function formatBackupFilename(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-');
  const time = [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('-');
  return `${BACKUP_FILENAME_PREFIX}-${stamp}_${time}.db`;
}
