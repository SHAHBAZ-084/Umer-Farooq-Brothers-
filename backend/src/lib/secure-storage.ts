import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

const SAFE_PREFIX = 'SAFE:';
const FALL_PREFIX = 'FALL:';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getFallbackKey(): Buffer {
  const secret = env.sessionSecret;
  if (secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters for encrypted storage');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

type ElectronSafeStorage = {
  isEncryptionAvailable: () => boolean;
  encryptString: (plainText: string) => Buffer;
  decryptString: (encrypted: Buffer) => string;
};

/** Electron safeStorage when backend runs inside the Electron main process. */
function getElectronSafeStorage(): ElectronSafeStorage | null {
  if (process.env.GRAIN_POS_ELECTRON !== '1') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { safeStorage } = require('electron') as { safeStorage?: ElectronSafeStorage };
    if (!safeStorage?.isEncryptionAvailable?.()) return null;
    return safeStorage;
  } catch {
    return null;
  }
}

function encryptWithFallback(plaintext: string): Buffer {
  const key = getFallbackKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from(FALL_PREFIX, 'utf8'), iv, authTag, encrypted]);
}

export function encryptString(plaintext: string): Buffer {
  const safeStorage = getElectronSafeStorage();
  if (safeStorage) {
    const encrypted = safeStorage.encryptString(plaintext);
    return Buffer.concat([Buffer.from(SAFE_PREFIX, 'utf8'), encrypted]);
  }
  return encryptWithFallback(plaintext);
}

export function decryptString(data: Buffer): string {
  const text = data.toString('utf8', 0, Math.min(5, data.length));
  if (text.startsWith(SAFE_PREFIX)) {
    const safeStorage = getElectronSafeStorage();
    if (!safeStorage) {
      throw new Error('Encrypted with Electron safeStorage but decryption is unavailable in this process');
    }
    return safeStorage.decryptString(data.subarray(SAFE_PREFIX.length));
  }

  if (!text.startsWith(FALL_PREFIX)) {
    throw new Error('Unrecognized encrypted storage format');
  }

  const payload = data.subarray(FALL_PREFIX.length);
  if (payload.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Corrupt encrypted storage blob');
  }

  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const key = getFallbackKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function writeEncryptedFile(filePath: string, plaintext: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, encryptString(plaintext));
}

export function readEncryptedFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return decryptString(fs.readFileSync(filePath));
}

export function deleteEncryptedFile(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
