import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { FinancialYearStatus, PrismaClient } from '@prisma/client';
import {
  configureSqlitePragmas,
  createDatabaseBackup,
  databaseFileExists,
  isDatabaseReadable,
  scheduleWalCheckpoint,
  verifyDatabaseIntegrity,
  walCheckpointTruncate,
} from './database-maintenance';
import { applyPendingSqlMigrations } from './apply-sql-migrations';
import { ensureDatabaseDirectoryExists } from './database-path';
import { logger } from './logger';

export type StartupStatus = {
  ok: boolean;
  databaseExists: boolean;
  migrationsApplied: boolean;
  integrityOk: boolean;
  error?: string;
};

let checkpointTimer: NodeJS.Timeout | null = null;

function backendRootFromDist(): string {
  // __dirname = …/backend/dist/lib  → backend package root
  return path.resolve(__dirname, '../..');
}

function findPrismaCliJs(): string | null {
  const candidates = [
    path.join(backendRootFromDist(), '..', 'node_modules', 'prisma', 'build', 'index.js'),
    path.join(backendRootFromDist(), 'node_modules', 'prisma', 'build', 'index.js'),
    path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function runPrismaCliMigrateDeploy(): Promise<void> {
  const backendRoot = backendRootFromDist();
  const schemaPath = path.join(backendRoot, 'prisma', 'schema.prisma');
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Prisma schema not found at ${schemaPath}`);
  }

  const prismaCli = findPrismaCliJs();
  if (!prismaCli) {
    throw new Error('Prisma CLI not found (node_modules/prisma/build/index.js)');
  }

  logger.info('Running prisma migrate deploy…');
  try {
    // Avoid shell:true — paths with spaces (e.g. "Grain Market") break argument parsing on Windows.
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schemaPath], {
      cwd: backendRoot,
      stdio: 'pipe',
      env: process.env,
      timeout: 120_000,
    });
  } catch (err) {
    const detail =
      err && typeof err === 'object' && 'stderr' in err
        ? String((err as { stderr?: Buffer | string }).stderr ?? '')
        : err instanceof Error
          ? err.message
          : String(err);
    throw new Error(`prisma migrate deploy failed: ${(detail || 'unknown error').slice(0, 2000)}`);
  }

  logger.info('Database migrations up to date');
}

export async function runMigrations(db: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV === 'test' || process.env.SKIP_MIGRATIONS === '1') {
    return;
  }

  // Packaged Electron: apply SQL in-process (Prisma CLI + ELECTRON_RUN_AS_NODE is fragile).
  if (process.env.GRAIN_POS_ELECTRON === '1') {
    await applyPendingSqlMigrations(db);
    return;
  }

  try {
    await runPrismaCliMigrateDeploy();
  } catch (err) {
    logger.warn('Prisma CLI migrate failed — falling back to in-process SQL apply', {
      err: err instanceof Error ? err.message : String(err),
    });
    await applyPendingSqlMigrations(db);
  }
}

/** Create admin user + active year if this is a fresh database. */
async function ensureBootstrapData(db: PrismaClient): Promise<void> {
  const username = process.env.DEFAULT_ADMIN_USERNAME ?? 'admin';
  const password = process.env.DEFAULT_ADMIN_PASSWORD ?? 'admin123';

  const existing = await db.user.findUnique({ where: { username } });
  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);
    await db.user.create({
      data: {
        username,
        passwordHash,
        displayName: 'Shop Owner',
        role: 'ADMIN',
      },
    });
    logger.info(`Created default user "${username}"`);
  }

  const activeYear = await db.financialYear.findFirst({
    where: { status: FinancialYearStatus.ACTIVE },
  });
  if (!activeYear) {
    const { fiscalYearLabelForDate } = await import('../modules/accounting/accounting.service');
    const { label, startDate } = fiscalYearLabelForDate(new Date());
    await db.financialYear.create({
      data: {
        label,
        startDate,
        status: FinancialYearStatus.ACTIVE,
      },
    });
    logger.info(`Created active financial year "${label}"`);
  }

  // Chart of accounts — lazy import to avoid circular deps at module load
  try {
    const { bootstrapChartOfAccounts } = await import('../modules/accounting/accounting.service');
    await bootstrapChartOfAccounts();
  } catch (err) {
    logger.warn('Chart of accounts bootstrap skipped/failed', { err: String(err) });
  }
}

export async function initializeDatabase(db: PrismaClient): Promise<StartupStatus> {
  ensureDatabaseDirectoryExists();

  const status: StartupStatus = {
    ok: false,
    databaseExists: databaseFileExists(),
    migrationsApplied: false,
    integrityOk: true,
  };

  try {
    await runMigrations(db);
    status.migrationsApplied = true;

    await configureSqlitePragmas(db);

    const { backfillLegacyActiveRecordStatus } = await import('../modules/approvals/approval-backfill');
    await backfillLegacyActiveRecordStatus(db);

    const {
      ensureProductCategorySeed,
      backfillProductAverageCosts,
    } = await import('../modules/products/average-cost-backfill');
    await ensureProductCategorySeed(db);
    await backfillProductAverageCosts(db);

    await ensureBootstrapData(db);

    if (status.databaseExists && process.env.NODE_ENV === 'production') {
      await createDatabaseBackup();
      const integrity = await verifyDatabaseIntegrity(db);
      status.integrityOk = integrity.ok;
      if (!integrity.ok) {
        logger.warn('Database integrity check failed on startup', { results: integrity.results });
      }
    } else if (status.databaseExists && process.env.NODE_ENV !== 'test') {
      const integrity = await verifyDatabaseIntegrity(db);
      status.integrityOk = integrity.ok;
    }

    const readable = status.databaseExists ? await isDatabaseReadable() : true;
    if (!readable) {
      status.error = 'Database file is not readable';
      return status;
    }

    if (checkpointTimer) clearInterval(checkpointTimer);
    checkpointTimer = scheduleWalCheckpoint(db);

    status.ok = true;
    return status;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Database initialization failed', { error: message });
    status.error = message;
    return status;
  }
}

export async function shutdownDatabase(db: PrismaClient): Promise<void> {
  if (checkpointTimer) {
    clearInterval(checkpointTimer);
    checkpointTimer = null;
  }
  try {
    await walCheckpointTruncate(db);
  } catch (err) {
    logger.warn('WAL checkpoint on shutdown failed', { err: String(err) });
  }
  await db.$disconnect();
}
