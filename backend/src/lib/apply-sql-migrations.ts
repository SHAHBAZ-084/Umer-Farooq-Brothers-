import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

function backendRootFromDist(): string {
  return path.resolve(__dirname, '../..');
}

function migrationsDir(): string {
  return path.join(backendRootFromDist(), 'prisma', 'migrations');
}

function checksum(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/** Split migration SQL into executable statements (SQLite). */
function splitSqlStatements(sql: string): string[] {
  const withoutLineComments = sql
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('--')) return '';
      return line;
    })
    .join('\n');

  return withoutLineComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function ensureMigrationsTable(db: PrismaClient): Promise<void> {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )
  `);
}

async function appliedMigrationNames(db: PrismaClient): Promise<Set<string>> {
  const rows = await db.$queryRawUnsafe<Array<{ migration_name: string }>>(
    `SELECT "migration_name" FROM "_prisma_migrations"
     WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`,
  );
  return new Set(rows.map((r) => r.migration_name));
}

function listMigrationFolders(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** Run one SQL statement; SQLite forbids result-returning SQL via executeRaw. */
async function runSqlStatement(db: PrismaClient, statement: string): Promise<void> {
  try {
    await db.$executeRawUnsafe(statement);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // e.g. bare `SELECT 1` / some PRAGMAs — must use queryRaw on SQLite.
    if (/returned results|not allowed in SQLite/i.test(message)) {
      await db.$queryRawUnsafe(statement);
      return;
    }
    throw err;
  }
}

/**
 * Apply pending Prisma migration SQL in-process (no Prisma CLI).
 * Used in packaged Electron where spawning `prisma migrate deploy` is unreliable.
 */
export async function applyPendingSqlMigrations(db: PrismaClient): Promise<void> {
  const dir = migrationsDir();
  if (!fs.existsSync(dir)) {
    throw new Error(`Prisma migrations folder not found at ${dir}`);
  }

  // Ensure the SQLite file exists before the first statement.
  const url = process.env.DATABASE_URL ?? '';
  if (url.startsWith('file:')) {
    const { getDatabaseFilePath, ensureDatabaseDirectoryExists } = await import('./database-path');
    ensureDatabaseDirectoryExists();
    const filePath = getDatabaseFilePath();
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '');
    }
  }

  await ensureMigrationsTable(db);
  const applied = await appliedMigrationNames(db);
  const folders = listMigrationFolders(dir);

  for (const name of folders) {
    if (applied.has(name)) continue;

    const sqlPath = path.join(dir, name, 'migration.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`Missing migration.sql for ${name}`);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    const statements = splitSqlStatements(sql);
    const id = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    logger.info(`Applying migration ${name}…`);

    await db.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
       VALUES (?, ?, NULL, ?, NULL, NULL, ?, 0)`,
      id,
      checksum(sql),
      name,
      startedAt,
    );

    try {
      for (const statement of statements) {
        await runSqlStatement(db, statement);
      }
      await db.$executeRawUnsafe(
        `UPDATE "_prisma_migrations" SET "finished_at" = ?, "applied_steps_count" = ? WHERE "id" = ?`,
        new Date().toISOString(),
        statements.length,
        id,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.$executeRawUnsafe(
        `UPDATE "_prisma_migrations" SET "logs" = ?, "rolled_back_at" = ? WHERE "id" = ?`,
        message.slice(0, 4000),
        new Date().toISOString(),
        id,
      );
      throw new Error(`Migration ${name} failed: ${message}`);
    }
  }

  logger.info('Database migrations up to date (SQL apply)');
}

