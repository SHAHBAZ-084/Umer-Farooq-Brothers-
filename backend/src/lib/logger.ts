import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { getLogDirectory } from './database-path';

type LogLevel = 'info' | 'warn' | 'error';

let ensuredLogDir: string | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function ensureLogDir(): Promise<string> {
  const dir = getLogDirectory();
  if (ensuredLogDir === dir) return dir;
  await fsp.mkdir(dir, { recursive: true });
  ensuredLogDir = dir;
  return dir;
}

function todayLogFile(dir: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(dir, `grain-pos-${date}.log`);
}

/** Queue file writes so order is preserved without blocking the event loop. */
function enqueueLogWrite(formatted: string): void {
  writeChain = writeChain
    .then(async () => {
      const dir = await ensureLogDir();
      await fsp.appendFile(todayLogFile(dir), formatted, 'utf8');
    })
    .catch(() => {
      // Logging must never crash the app.
    });
}

function write(level: LogLevel, message: string, meta?: unknown): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta !== undefined ? { meta } : {}),
  });

  const formatted = `${line}\n`;
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](message, meta ?? '');
  enqueueLogWrite(formatted);
}

export const logger = {
  info(message: string, meta?: unknown) {
    write('info', message, meta);
  },
  warn(message: string, meta?: unknown) {
    write('warn', message, meta);
  },
  error(message: string, meta?: unknown) {
    write('error', message, meta);
  },
};

/** Flush pending log writes (tests / shutdown). */
export function flushLogger(): Promise<void> {
  return writeChain;
}

// Silence unused sync import warning if tree-shaken — keep fs for type-only consumers none.
void fs;
