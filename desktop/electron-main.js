import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { app, BrowserWindow, Menu, Tray } from 'electron';

import { createAppServer } from '../app/server/createServer.js';
import { resolveProjectPaths } from '../app/shared/paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const BACKGROUND_ARG = '--background';
const WINDOW_BACKGROUND_COLOR = '#0a0a0e';

let serverContext = null;
let mainWindow = null;
let tray = null;
let isQuitting = false;

function getDesktopCacheMarkerPath(context) {
  const dataDir = context?.store?.paths?.dataDir || path.join(resolveDesktopRuntimeRoot(), 'data');
  return path.join(dataDir, 'desktop-shell-cache-marker.txt');
}

function buildDesktopCacheMarkerValue(executablePath) {
  const targetPath = path.resolve(executablePath || process.execPath);
  let stamp = '';

  try {
    const stat = fs.statSync(targetPath);
    stamp = String(stat.mtimeMs);
  } catch {
    stamp = 'missing';
  }

  return `${targetPath}|${stamp}`;
}

async function refreshWindowCacheIfNeeded(window, context) {
  const executablePath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const markerPath = getDesktopCacheMarkerPath(context);
  const nextMarker = buildDesktopCacheMarkerValue(executablePath);

  let previousMarker = '';
  try {
    previousMarker = fs.readFileSync(markerPath, 'utf8').trim();
  } catch {
    previousMarker = '';
  }

  if (previousMarker === nextMarker) {
    return;
  }

  try {
    await window.webContents.session.clearCache();
  } catch {
    // ignore cache clear failures and continue loading
  }

  try {
    fs.writeFileSync(markerPath, nextMarker);
  } catch {
    // ignore marker write failures and continue loading
  }
}

function isBackgroundLaunch(argv = process.argv) {
  return Array.isArray(argv) && argv.includes(BACKGROUND_ARG);
}

function getTrayIconPath() {
  return path.join(projectRoot, 'desktop', 'resources', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
}

function resolveDesktopRuntimeRoot() {
  if (process.env.LEME_RUNTIME_ROOT) {
    return path.resolve(process.env.LEME_RUNTIME_ROOT);
  }

  // Windows packaged builds (zip/portable): store data next to the .exe
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return path.resolve(process.env.PORTABLE_EXECUTABLE_DIR);
  }

  if (process.env.PORTABLE_EXECUTABLE_FILE) {
    return path.dirname(path.resolve(process.env.PORTABLE_EXECUTABLE_FILE));
  }

  if (app.isPackaged && process.platform === 'win32') {
    return path.dirname(path.resolve(process.execPath));
  }

  // Installed builds (deb, etc.): binary dir is read-only,
  // use user-writable data directory instead (~/.config/Leme Hub/)
  if (app.isPackaged) {
    return app.getPath('userData');
  }

  return projectRoot;
}

async function startBackend() {
  if (serverContext) {
    return serverContext;
  }

  const autoStartExecutable = process.env.PORTABLE_EXECUTABLE_FILE
    || process.execPath;
  const runtimeRoot = resolveDesktopRuntimeRoot();
  const paths = resolveProjectPaths(projectRoot, { runtimeRoot });
  const server = createAppServer(paths, {
    ...process.env,
    LEME_AUTOSTART_EXECUTABLE: autoStartExecutable,
    LEME_MODE: 'desktop',
    LEME_UI_HOST: '127.0.0.1'
  });

  serverContext = await server.start();
  return serverContext;
}

async function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  const context = serverContext || await startBackend();

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    autoHideMenuBar: true,
    backgroundColor: WINDOW_BACKGROUND_COLOR,
    webPreferences: {
      contextIsolation: true,
      sandbox: false
    },
    title: 'Leme Hub'
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) {
      return;
    }
    console.error(`[desktop] failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[desktop] renderer exited: ${details.reason}`);
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error(`[renderer] ${message} (${sourceId}:${line})`);
    }
  });

  await refreshWindowCacheIfNeeded(mainWindow, context);

  await mainWindow.loadURL(context.runtime.publicOrigin);
  return mainWindow;
}

async function restoreOrCreateWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  return createWindow();
}

function createTray() {
  if (tray) {
    return tray;
  }

  tray = new Tray(getTrayIconPath());
  tray.setToolTip('Leme Hub');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: '打开主界面',
      click: () => {
        restoreOrCreateWindow().catch(() => null);
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
  tray.on('click', () => {
    restoreOrCreateWindow().catch(() => null);
  });
  tray.on('double-click', () => {
    restoreOrCreateWindow().catch(() => null);
  });

  return tray;
}

async function shutdownBackend() {
  if (tray) {
    tray.destroy();
    tray = null;
  }

  if (!serverContext) {
    return;
  }

  try {
    await serverContext.coreManager.stop();
  } catch {
    // ignore shutdown races
  }

  await new Promise((resolve) => {
    serverContext.server.close(() => resolve());
  });
  serverContext = null;
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', async (_event, argv) => {
    if (isBackgroundLaunch(argv)) {
      return;
    }

    await app.whenReady();
    await restoreOrCreateWindow();
  });

  app.whenReady().then(async () => {
    await startBackend();
    createTray();
    if (!isBackgroundLaunch()) {
      await createWindow();
    }
  });

  app.on('activate', async () => {
    await restoreOrCreateWindow();
  });

  app.on('before-quit', async (event) => {
    if (!serverContext && !tray) {
      return;
    }

    if (isQuitting && !serverContext) {
      return;
    }

    event.preventDefault();
    isQuitting = true;
    await shutdownBackend();
    app.exit(0);
  });

  app.on('window-all-closed', () => {
    if (process.platform === 'darwin' && !isQuitting) {
      return;
    }

    if (isQuitting) {
      app.quit();
    }
  });
}
