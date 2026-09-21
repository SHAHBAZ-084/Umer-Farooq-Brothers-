import path from 'path';
import dotenv from 'dotenv';
import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { initializeDatabase, shutdownDatabase } from './lib/startup';
import { logger } from './lib/logger';
import {
  startScheduleRunner,
  stopScheduleRunner,
} from './modules/schedules/schedules.service';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

let startupStatus: Awaited<ReturnType<typeof initializeDatabase>> | null = null;
let httpServer: ReturnType<ReturnType<typeof createApp>['listen']> | null = null;

/** Start API + static UI. Used by Electron production and by `node backend/dist/index.js`. */
export async function startGrainPosServer(): Promise<{
  ok: boolean;
  error?: string;
  port: number;
}> {
  startupStatus = await initializeDatabase(prisma);
  if (!startupStatus.ok) {
    logger.error('Startup aborted — database not ready', startupStatus);
    return {
      ok: false,
      error: startupStatus.error ?? 'Database not ready',
      port: env.port,
    };
  }

  const app = createApp(() => startupStatus);

  await new Promise<void>((resolve, reject) => {
    httpServer = app.listen(env.port, '127.0.0.1', () => {
      logger.info(`Umer Farooq & Brothers API listening on http://127.0.0.1:${env.port}`);
      resolve();
    });
    httpServer.on('error', (err) => reject(err));
  });

  startScheduleRunner();

  return { ok: true, port: env.port };
}

export async function stopGrainPosServer(): Promise<void> {
  stopScheduleRunner();
  if (httpServer) {
    await new Promise<void>((resolve) => {
      httpServer?.close(() => resolve());
    });
    httpServer = null;
  }
  await shutdownDatabase(prisma);
}

async function main() {
  const result = await startGrainPosServer();
  if (!result.ok) {
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down…`);
    await stopGrainPosServer();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

// Auto-start when this file is the process entry (Node CLI or Electron-as-Node child).
// Electron main used to require() this module; it now spawns a child so require.main
// is this file even with GRAIN_POS_ELECTRON=1.
if (require.main === module) {
  main().catch((err) => {
    logger.error('Fatal startup error', { err: String(err) });
    process.exit(1);
  });
}

export default createApp;
