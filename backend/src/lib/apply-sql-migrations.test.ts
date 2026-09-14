import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * Mirrors apply-sql-migrations runSqlStatement — SQLite rejects result-returning
 * SQL through $executeRawUnsafe (the bug that broke install on GENERAL_TRADE).
 */
async function runSqlStatement(db: PrismaClient, statement: string): Promise<void> {
  try {
    await db.$executeRawUnsafe(statement);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/returned results|not allowed in SQLite/i.test(message)) {
      await db.$queryRawUnsafe(statement);
      return;
    }
    throw err;
  }
}

describe('SQLite migration statement runner', () => {
  let db: PrismaClient;
  let dbPath: string;

  beforeAll(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grain-sql-'));
    dbPath = path.join(tmp, 'test.db');
    db = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
    await db.$connect();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('runs SELECT 1 without failing (former general_trade no-op)', async () => {
    await expect(runSqlStatement(db, 'SELECT 1')).resolves.toBeUndefined();
  });

  it('still runs DDL via executeRaw', async () => {
    await expect(
      runSqlStatement(db, 'CREATE TABLE IF NOT EXISTS "_mig_probe" ("id" INTEGER PRIMARY KEY)'),
    ).resolves.toBeUndefined();
  });
});
