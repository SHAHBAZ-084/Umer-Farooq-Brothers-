"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
const electron_updater_1 = require("electron-updater");
const database_path_1 = require("./database-path");
const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === '1';
const BACKEND_PORT = process.env.PORT ?? '3847';
const APP_ICON = path_1.default.join(__dirname, '../build/icon.png');
let mainWindow = null;
function registerIpcHandlers() {
    electron_1.ipcMain.handle('dialog:pick-backup-folder', async () => {
        const win = electron_1.BrowserWindow.getFocusedWindow() ?? mainWindow;
        const result = win
            ? await electron_1.dialog.showOpenDialog(win, {
                title: 'Choose backup folder',
                properties: ['openDirectory', 'createDirectory'],
            })
            : await electron_1.dialog.showOpenDialog({
                title: 'Choose backup folder',
                properties: ['openDirectory', 'createDirectory'],
            });
        if (result.canceled || result.filePaths.length === 0) {
            return { ok: false, path: null };
        }
        return { ok: true, path: result.filePaths[0] };
    });
    electron_1.ipcMain.handle('db:backup', async (_event, destFolder) => {
        if (typeof destFolder !== 'string' || !destFolder.trim()) {
            return { ok: false, error: 'No backup folder selected.' };
        }
        const folder = destFolder.trim();
        try {
            const stat = await fs_1.default.promises.stat(folder).catch(() => null);
            if (!stat?.isDirectory()) {
                return { ok: false, error: 'Backup folder does not exist or is not accessible.' };
            }
            const dbPath = (0, database_path_1.getDatabaseFilePath)();
            if (!fs_1.default.existsSync(dbPath)) {
                return {
                    ok: false,
                    error: 'Database file not found. Use the app at least once before backing up.',
                };
            }
            const filename = (0, database_path_1.formatBackupFilename)(new Date());
            const destPath = path_1.default.join(folder, filename);
            await fs_1.default.promises.copyFile(dbPath, destPath);
            return { ok: true, path: destPath };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Backup failed';
            return { ok: false, error: message };
        }
    });
}
/** Writable DB + env for packaged Electron (asar is read-only). */
function prepareProductionEnvironment() {
    process.env.GRAIN_POS_ELECTRON = '1';
    process.env.NODE_ENV = 'production';
    process.env.PORT = BACKEND_PORT;
    process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'umer-farooq-brothers-pos';
    process.env.DEFAULT_ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
    process.env.DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    const dataDir = path_1.default.join(electron_1.app.getPath('userData'), 'data');
    fs_1.default.mkdirSync(dataDir, { recursive: true });
    const dbFile = path_1.default.join(dataDir, 'umer-farooq-pos.db');
    // Prisma SQLite URL on Windows
    process.env.DATABASE_URL = (0, url_1.pathToFileURL)(dbFile).href;
    // Make `require('.prisma/client/default')` resolve outside the asar.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Module = require('module');
    const prismaRoots = [
        path_1.default.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules'),
        path_1.default.join(process.resourcesPath, 'node_modules'),
        path_1.default.join(process.resourcesPath, 'backend', 'node_modules'),
    ].filter((dir) => fs_1.default.existsSync(path_1.default.join(dir, '.prisma', 'client')));
    if (prismaRoots.length > 0) {
        process.env.NODE_PATH = [...prismaRoots, process.env.NODE_PATH].filter(Boolean).join(path_1.default.delimiter);
        Module._initPaths();
    }
    const engineCandidates = prismaRoots.map((root) => path_1.default.join(root, '.prisma', 'client', 'query_engine-windows.dll.node'));
    for (const engine of engineCandidates) {
        if (fs_1.default.existsSync(engine)) {
            process.env.PRISMA_QUERY_ENGINE_LIBRARY = engine;
            break;
        }
    }
}
async function startBackend() {
    if (isDev) {
        return;
    }
    prepareProductionEnvironment();
    const backendEntry = path_1.default.join(__dirname, '../backend/dist/index.js');
    if (!fs_1.default.existsSync(backendEntry)) {
        throw new Error(`Backend entry not found: ${backendEntry}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const backend = require(backendEntry);
    if (typeof backend.startGrainPosServer !== 'function') {
        throw new Error('Backend startGrainPosServer() export missing — rebuild backend.');
    }
    const result = await backend.startGrainPosServer();
    if (!result.ok) {
        throw new Error(result.error || 'Backend failed to start');
    }
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 700,
        title: 'Umer Farooq & Brothers',
        icon: fs_1.default.existsSync(APP_ICON) ? APP_ICON : undefined,
        show: false,
        backgroundColor: '#E3E3E8',
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false,
        },
    });
    mainWindow.webContents.setBackgroundThrottling(false);
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        console.error('Window failed to load:', errorCode, errorDescription);
    });
    if (isDev) {
        mainWindow.loadURL('http://127.0.0.1:5173');
        mainWindow.once('ready-to-show', () => {
            mainWindow?.show();
            mainWindow?.focus();
        });
        if (process.env.ELECTRON_DEVTOOLS === '1') {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
    }
    else {
        mainWindow.loadURL(`http://127.0.0.1:${BACKEND_PORT}`);
        mainWindow.once('ready-to-show', () => {
            mainWindow?.show();
            mainWindow?.focus();
        });
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
async function showStartupError(message) {
    try {
        const logPath = path_1.default.join(electron_1.app.getPath('userData'), 'startup-error.log');
        fs_1.default.mkdirSync(path_1.default.dirname(logPath), { recursive: true });
        fs_1.default.writeFileSync(logPath, `[${new Date().toISOString()}]\n${message}\n\nDATABASE_URL=${process.env.DATABASE_URL ?? ''}\nPRISMA_QUERY_ENGINE_LIBRARY=${process.env.PRISMA_QUERY_ENGINE_LIBRARY ?? ''}\n`, 'utf8');
    }
    catch {
        // ignore log failures
    }
    await electron_1.dialog.showMessageBox({
        type: 'error',
        title: 'Umer Farooq & Brothers — Startup failed',
        message: 'The application could not start safely.',
        detail: message,
    });
    electron_1.app.quit();
}
function configureAutoUpdater() {
    if (isDev)
        return;
    electron_updater_1.autoUpdater.autoDownload = false;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = false;
    electron_updater_1.autoUpdater.on('error', (err) => {
        console.warn('Auto-update check failed:', err.message);
    });
    // Publish is disabled for local builds — ignore failures quietly.
    electron_updater_1.autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.warn('Could not check for updates:', err instanceof Error ? err.message : err);
    });
}
electron_1.app.whenReady().then(async () => {
    try {
        registerIpcHandlers();
        await startBackend();
        if (!isDev) {
            const health = await waitForBackendHealth();
            if (!health.ok) {
                const detail = health.database?.error ??
                    (health.database && !health.database.integrityOk
                        ? 'Database integrity check failed.'
                        : 'Backend health check failed.');
                await showStartupError(detail);
                return;
            }
        }
        createWindow();
        configureAutoUpdater();
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await showStartupError(message);
        return;
    }
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
async function waitForBackendHealth(maxAttempts = 60) {
    const url = `http://127.0.0.1:${BACKEND_PORT}/api/health`;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                return (await response.json());
            }
        }
        catch {
            // Server not ready yet.
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('Backend failed to start (health check timed out on port ' + BACKEND_PORT + ')');
}
