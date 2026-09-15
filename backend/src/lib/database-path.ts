import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function backendRoot(): string {
  // __dirname = …/backend/src/lib or …/backend/dist/lib
  return path.resolve(__dirname, '../..');
}

/** Prisma resolves relative SQLite `file:` paths against the schema directory. */
function prismaDir(): string {
  return path.join(backendRoot(), 'prisma');
}

function resolveRelativeDbPath(raw: string): string {
  return path.resolve(prismaDir(), raw);
}

/** Resolve the on-disk SQLite file from DATABASE_URL (file:…). */
export function getDatabaseFilePath(): string {
  const url = process.env.DATABASE_URL ?? 'file:./data/umer-farooq-pos.db';

  if (url.startsWith('file:')) {
    const raw = url.replace(/^file:/, '');
    // Absolute Windows / POSIX paths (packaged Electron sets these).
    if (path.isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) {
      return path.normalize(raw);
    }
    // Relative paths like ./data/umer-farooq-pos.db — match Prisma (schema dir).
    return resolveRelativeDbPath(raw);
  }

  if (path.isAbsolute(url) || /^[A-Za-z]:[\\/]/.test(url)) {
    return path.normalize(url);
  }

  return resolveRelativeDbPath(url);
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
