import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { decryptString, encryptString } from '../secure-storage';

describe('secure-storage', () => {
  it('round-trips plaintext with FALL prefix', () => {
    const encrypted = encryptString('{"refresh_token":"abc"}');
    expect(encrypted.toString('utf8', 0, 5)).toBe('FALL:');
    expect(decryptString(encrypted)).toBe('{"refresh_token":"abc"}');
  });

  it('writes distinct ciphertext for same plaintext', () => {
    const a = encryptString('same');
    const b = encryptString('same');
    expect(a.equals(b)).toBe(false);
    expect(decryptString(a)).toBe('same');
    expect(decryptString(b)).toBe('same');
  });
});

describe('google oauth credentials masking', () => {
  it('masks client id for display', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-creds-'));
    const prevDb = process.env.DATABASE_URL;
    process.env.DATABASE_URL = `file:${path.join(tmp, 'grain-pos.db').replace(/\\/g, '/')}`;

    const { saveGoogleOAuthCredentials, getGoogleOAuthConfigStatus, clearGoogleOAuthCredentialsFile } =
      await import('../google-drive/credentials');

    saveGoogleOAuthCredentials({
      clientId: '123456789012345678901234567890.apps.googleusercontent.com',
      clientSecret: 'secret-value',
    });

    const status = getGoogleOAuthConfigStatus();
    expect(status.configured).toBe(true);
    expect(status.clientIdHint).toContain('…');
    expect(status.clientIdHint).not.toContain('secret');

    clearGoogleOAuthCredentialsFile();
    process.env.DATABASE_URL = prevDb;
  });
});
