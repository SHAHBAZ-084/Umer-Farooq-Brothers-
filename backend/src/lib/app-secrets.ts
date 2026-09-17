import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';

export const FINANCIAL_YEAR_CLOSE_PASSCODE_KEY = 'FINANCIAL_YEAR_CLOSE_PASSCODE';

/** Plaintext used only when seeding the bcrypt hash — never returned to clients. */
export const FINANCIAL_YEAR_CLOSE_PASSCODE_PLAIN = 'CUIVHR';

type AppSecretRow = { key: string; valueHash: string };

export async function findAppSecret(
  db: PrismaClient,
  key: string,
): Promise<AppSecretRow | null> {
  const rows = await db.$queryRawUnsafe<AppSecretRow[]>(
    `SELECT "key", "valueHash" FROM "AppSecret" WHERE "key" = ? LIMIT 1`,
    key,
  );
  return rows[0] ?? null;
}

/** Idempotent: insert hashed passcode if the key is missing. */
export async function ensureFinancialYearClosePasscode(db: PrismaClient): Promise<boolean> {
  const existing = await findAppSecret(db, FINANCIAL_YEAR_CLOSE_PASSCODE_KEY);
  if (existing) return false;
  const valueHash = await bcrypt.hash(FINANCIAL_YEAR_CLOSE_PASSCODE_PLAIN, 10);
  await db.$executeRawUnsafe(
    `INSERT INTO "AppSecret" ("key", "valueHash", "createdAt", "updatedAt")
     VALUES (?, ?, datetime('now'), datetime('now'))`,
    FINANCIAL_YEAR_CLOSE_PASSCODE_KEY,
    valueHash,
  );
  return true;
}

export async function verifyAppSecretPasscode(
  db: PrismaClient,
  key: string,
  passcode: string,
): Promise<boolean> {
  const secret = await findAppSecret(db, key);
  if (!secret) return false;
  return bcrypt.compare(passcode, secret.valueHash);
}
