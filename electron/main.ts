import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { autoUpdater } from 'electron-updater';
import { formatBackupFilename, getDatabaseFilePath } from './database-path';

const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === '1';
const BACKEND_PORT = process.env.PORT ?? '3847';

/** Backend runs out-of-process so cancel/delete cannot freeze Electron's UI thread. */
let backendChild: ChildProcess | null = null;

/** Resolve Umer Farooq & Brothers icon for window/taskbar (prefer .ico on Windows). */
function resolveAppIcon(): string | undefined {
  const names = process.platform === 'win32' ? ['icon.ico', 'icon.png'] : ['icon.png', 'icon.ico'];
  const roots = [
    path.join(__dirname, '..', 'build'),
    path.join(app.getAppPath(), 'build'),
    // Packaged: extraResources copies icons next to the asar
    path.join(process.resourcesPath, 'build'),
    path.join(process.cwd(), 'build'),
  ];
  for (const name of names) {
    for (const root of roots) {
      const candidate = path.join(root, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

/** Append startup diagnostics to userData (same folder pattern as startup-error.log). */
function logStartupInfo(lines: string[]): void {
  try {
    const logPath = path.join(app.getPath('userData'), 'startup.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const body = `[${new Date().toISOString()}]\n${lines.join('\n')}\n\n`;
    fs.appendFileSync(logPath, body, 'utf8');
  } catch {
    // ignore log failures
  }
}

function resolveAppIconImage() {
  const iconPath = resolveAppIcon();
  const msg = iconPath
    ? `[resolveAppIcon] using ${iconPath}`
    : '[resolveAppIcon] no icon file found (checked build/ under __dirname, appPath, resourcesPath, cwd)';
  console.log(msg);
  logStartupInfo([
    msg,
    `isDev=${isDev}`,
    `appPath=${app.getAppPath()}`,
    `resourcesPath=${process.resourcesPath}`,
    `__dirname=${__dirname}`,
  ]);
  if (!iconPath) return undefined;
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    console.warn(`[resolveAppIcon] nativeImage empty for ${iconPath}`);
    logStartupInfo([`[resolveAppIcon] nativeImage.empty for ${iconPath}`]);
    return undefined;
  }
  return image;
}

let mainWindow: BrowserWindow | null = null;
function registerIpcHandlers(): void {
  ipcMain.handle('dialog:pick-backup-folder', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Choose backup folder',
          properties: ['openDirectory', 'createDirectory'],
        })
      : await dialog.showOpenDialog({
          title: 'Choose backup folder',
          properties: ['openDirectory', 'createDirectory'],
        });

    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, path: null };
    }

    return { ok: true, path: result.filePaths[0] };
  });

  ipcMain.handle('db:backup', async (_event, destFolder: unknown) => {
    if (typeof destFolder !== 'string' || !destFolder.trim()) {
      return { ok: false, error: 'No backup folder selected.' };
    }

    const folder = destFolder.trim();

    try {
      const stat = await fs.promises.stat(folder).catch(() => null);
      if (!stat?.isDirectory()) {
        return { ok: false, error: 'Backup folder does not exist or is not accessible.' };
      }

      const dbPath = getDatabaseFilePath();
      if (!fs.existsSync(dbPath)) {
        return {
          ok: false,
          error: 'Database file not found. Use the app at least once before backing up.',
        };
      }

      const filename = formatBackupFilename(new Date());
      const destPath = path.join(folder, filename);
      await fs.promises.copyFile(dbPath, destPath);

      return { ok: true, path: destPath };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Backup failed';
      return { ok: false, error: message };
    }
  });
}

/** Writable DB + env for packaged Electron (asar is read-only). */
function prepareProductionEnvironment(): void {
  process.env.GRAIN_POS_ELECTRON = '1';
  process.env.GRAIN_POS_USER_DATA = app.getPath('userData');
  process.env.NODE_ENV = 'production';
  process.env.PORT = BACKEND_PORT;
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'umer-farooq-brothers-pos';
  process.env.DEFAULT_ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
  process.env.DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';

  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const dbFile = path.join(dataDir, 'umer-farooq-pos.db');
  // Prisma on Windows: file:C:/... (avoid file:/// which some path parsers mishandle)
  process.env.DATABASE_URL = `file:${dbFile.replace(/\\/g, '/')}`;

  // Make `require('.prisma/client/default')` resolve outside the asar.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Module = require('module') as typeof import('module') & {
    globalPaths: string[];
    _initPaths: () => void;
  };
  const prismaRoots = [
    path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules'),
    path.join(process.resourcesPath, 'node_modules'),
    path.join(process.resourcesPath, 'backend', 'node_modules'),
  ].filter((dir) => fs.existsSync(path.join(dir, '.prisma', 'client')));

  if (prismaRoots.length > 0) {
    process.env.NODE_PATH = [...prismaRoots, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
    Module._initPaths();
  }

  const engineCandidates = prismaRoots.map((root) =>
    path.join(root, '.prisma', 'client', 'query_engine-windows.dll.node'),
  );
  for (const engine of engineCandidates) {
    if (fs.existsSync(engine)) {
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = engine;
      break;
    }
  }
}

function resolveBackendEntry(): string {
  const relative = path.join('backend', 'dist', 'index.js');
  const candidates = [
    // Packaged: asarUnpack copies backend/dist next to the asar
    path.join(process.resourcesPath, 'app.asar.unpacked', relative),
    // Unpackaged / local electron . after build
    path.join(__dirname, '..', relative),
    path.join(app.getAppPath(), relative),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Backend entry not found. Checked:\n${candidates.join('\n')}`);
}

function stopBackendChild(): void {
  if (!backendChild || backendChild.killed) {
    backendChild = null;
    return;
  }
  try {
    backendChild.kill('SIGTERM');
  } catch {
    // ignore
  }
  backendChild = null;
}

async function startBackend(): Promise<void> {
  if (isDev) {
    return;
  }

  prepareProductionEnvironment();

  const backendEntry = resolveBackendEntry();
  logStartupInfo([`[startBackend] spawning ${backendEntry}`]);

  // Run Node via Electron binary so the UI process never shares the API event loop.
  backendChild = spawn(process.execPath, [backendEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      // Keep GRAIN_POS_ELECTRON=1 (set in prepareProductionEnvironment) for migrations/paths.
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  backendChild.stdout?.on('data', (chunk: Buffer) => {
    console.log(`[backend] ${chunk.toString().trimEnd()}`);
  });
  backendChild.stderr?.on('data', (chunk: Buffer) => {
    console.error(`[backend] ${chunk.toString().trimEnd()}`);
  });
  backendChild.on('exit', (code, signal) => {
    console.error(`[backend] exited code=${code} signal=${signal}`);
    backendChild = null;
  });
  backendChild.on('error', (err) => {
    console.error('[backend] spawn error:', err);
  });
}

function createWindow(): void {
  const icon = resolveAppIconImage();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'Umer Farooq & Brothers',
    icon,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#E3E3E8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();

  mainWindow.webContents.setBackgroundThrottling(false);

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Window failed to load:', errorCode, errorDescription);
  });

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173');
    mainWindow.once('ready-to-show', () => {
      if (icon && process.platform === 'win32') {
        mainWindow?.setIcon(icon);
      }
      mainWindow?.show();
      mainWindow?.focus();
    });
    if (process.env.ELECTRON_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${BACKEND_PORT}`);
    mainWindow.once('ready-to-show', () => {
      if (icon && process.platform === 'win32') {
        mainWindow?.setIcon(icon);
      }
      mainWindow?.show();
      mainWindow?.focus();
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function showStartupError(message: string): Promise<void> {
  try {
    const logPath = path.join(app.getPath('userData'), 'startup-error.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(
      logPath,
      `[${new Date().toISOString()}]\n${message}\n\nDATABASE_URL=${process.env.DATABASE_URL ?? ''}\nPRISMA_QUERY_ENGINE_LIBRARY=${process.env.PRISMA_QUERY_ENGINE_LIBRARY ?? ''}\n`,
      'utf8',
    );
  } catch {
    // ignore log failures
  }

  await dialog.showMessageBox({
    type: 'error',
    title: 'Umer Farooq & Brothers — Startup failed',
    message: 'The application could not start safely.',
    detail: message,
  });
  app.quit();
}

function configureAutoUpdater(): void {
  if (isDev) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('error', (err: Error) => {
    console.warn('Auto-update check failed:', err.message);
  });

  // Publish is disabled for local builds — ignore failures quietly.
  autoUpdater.checkForUpdatesAndNotify().catch((err: unknown) => {
    console.warn('Could not check for updates:', err instanceof Error ? err.message : err);
  });
}

app.whenReady().then(async () => {
  try {
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.umerfarooqbrothers.pos');
    }
    Menu.setApplicationMenu(null);

    registerIpcHandlers();
    await startBackend();

    if (!isDev) {
      const health = await waitForBackendHealth();
      if (!health.ok) {
        const detail =
          health.database?.error ??
          (health.database && !health.database.integrityOk
            ? 'Database integrity check failed.'
            : 'Backend health check failed.');
        await showStartupError(detail);
        return;
      }
    }

    createWindow();
    configureAutoUpdater();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await showStartupError(message);
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackendChild();
});

app.on('will-quit', () => {
  stopBackendChild();
});

type HealthResponse = {
  ok: boolean;
  database?: {
    exists: boolean;
    migrationsApplied: boolean;
    integrityOk: boolean;
    error: string | null;
  };
};

async function waitForBackendHealth(maxAttempts = 60): Promise<HealthResponse> {
  const url = `http://127.0.0.1:${BACKEND_PORT}/api/health`;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return (await response.json()) as HealthResponse;
      }
    } catch {
      // Server not ready yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error('Backend failed to start (health check timed out on port ' + BACKEND_PORT + ')');
}
