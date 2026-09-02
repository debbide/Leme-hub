import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { app, BrowserWindow, dialog, ipcMain, Menu, Tray } from 'electron';

import { createAppServer } from '../app/server/createServer.js';
import { resolveProjectPaths } from '../app/shared/paths.js';
import {
  buildSecondInstanceRelaunchArgs,
  resolveSecondInstanceExecutablePath,
  shouldHandoffToNewExecutable
} from './instance-handoff.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const WINDOW_PRELOAD_PATH = path.join(__dirname, 'window-preload.cjs');
const BACKGROUND_ARG = '--background';
const WINDOW_BACKGROUND_COLOR = '#0a0a0e';
const DESKTOP_NET_TRACE_ENABLED = String(process.env.LEME_DESKTOP_NET_TRACE || '').trim() === '1';
const DESKTOP_NET_TRACE_HOSTS = [
  'chatgpt.com',
  'openai.com',
  'oaistatic.com',
  'oaiusercontent.com'
];
const DESKTOP_NET_TRACE_RESOURCE_TYPES = new Set(['Document', 'Fetch', 'XHR']);
const DESKTOP_NET_TRACE_HEADER_NAMES = [
  'content-type',
  'content-length',
  'location',
  'server',
  'cf-ray',
  'cf-cache-status',
  'alt-svc'
];

let serverContext = null;
let mainWindow = null;
let tray = null;
let isQuitting = false;

function getWindowForIpcEvent(event) {
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  if (!targetWindow || targetWindow.isDestroyed()) {
    return null;
  }

  return targetWindow;
}

function buildWindowState(targetWindow) {
  return {
    isMaximized: Boolean(targetWindow && !targetWindow.isDestroyed() && targetWindow.isMaximized())
  };
}

function emitWindowState(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  targetWindow.webContents.send('desktop-window:maximized-change', buildWindowState(targetWindow));
}

function registerDesktopWindowIpc() {
  ipcMain.handle('desktop-window:minimize', (event) => {
    const targetWindow = getWindowForIpcEvent(event);
    if (!targetWindow) {
      return { ok: false };
    }

    targetWindow.minimize();
    return { ok: true, ...buildWindowState(targetWindow) };
  });

  ipcMain.handle('desktop-window:toggle-maximize', (event) => {
    const targetWindow = getWindowForIpcEvent(event);
    if (!targetWindow) {
      return { ok: false, isMaximized: false };
    }

    if (targetWindow.isMaximized()) {
      targetWindow.unmaximize();
    } else {
      targetWindow.maximize();
    }

    return { ok: true, ...buildWindowState(targetWindow) };
  });

  ipcMain.handle('desktop-window:close', (event) => {
    const targetWindow = getWindowForIpcEvent(event);
    if (!targetWindow) {
      return { ok: false };
    }

    targetWindow.close();
    return { ok: true };
  });

  ipcMain.handle('desktop-window:get-state', (event) => {
    const targetWindow = getWindowForIpcEvent(event);
    return buildWindowState(targetWindow);
  });
}

registerDesktopWindowIpc();

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

function logDesktopEvent(context, message, level = 'log') {
  const line = `[desktop] ${message}`;
  context?.store?.appendLog?.(line);
  const logger = level === 'error' ? console.error : console.log;
  logger(line);
}

function logDesktopNet(context, message) {
  const line = `[DesktopNet] ${message}`;
  context?.store?.appendLog?.(line);
  console.error(line);
}

function shouldTraceDesktopUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const hostname = String(parsed.hostname || '').toLowerCase();
    return DESKTOP_NET_TRACE_HOSTS.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

function pickDesktopResponseHeaders(headers = {}) {
  const normalized = Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [String(key).toLowerCase(), value]));
  const picked = {};
  DESKTOP_NET_TRACE_HEADER_NAMES.forEach((name) => {
    if (normalized[name] !== undefined) {
      picked[name] = name === 'location' ? redactDesktopUrl(String(normalized[name])) : normalized[name];
    }
  });
  return picked;
}

function previewDesktopResponseBody(body = '', limit = 240) {
  return String(body || '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, limit);
}

// Query params whose values may carry OAuth codes / tokens / session secrets.
const DESKTOP_NET_TRACE_SENSITIVE_PARAMS = new Set([
  'code', 'access_token', 'id_token', 'refresh_token', 'token', 'state',
  'session', 'session_token', 'client_secret', 'password', 'auth', 'authorization',
  'sig', 'signature', 'key', 'api_key'
]);

// Path fragments that indicate an auth/token exchange whose body must not be captured.
const DESKTOP_NET_TRACE_SENSITIVE_PATHS = ['/oauth', '/authorize', '/callback', '/token', '/backend-api/', '/session'];

function redactDesktopUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    let redacted = false;
    for (const key of parsed.searchParams.keys()) {
      if (DESKTOP_NET_TRACE_SENSITIVE_PARAMS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, 'REDACTED');
        redacted = true;
      }
    }
    if (redacted) {
      return parsed.toString();
    }
    return rawUrl;
  } catch {
    // Not a parseable URL: strip anything after ? defensively.
    const idx = String(rawUrl).indexOf('?');
    return idx >= 0 ? `${String(rawUrl).slice(0, idx)}?REDACTED` : String(rawUrl);
  }
}

function isDesktopSensitiveUrl(rawUrl) {
  const lower = String(rawUrl || '').toLowerCase();
  return DESKTOP_NET_TRACE_SENSITIVE_PATHS.some((fragment) => lower.includes(fragment));
}

async function installDesktopNetworkDiagnostics(window, context) {
  const debuggerApi = window.webContents.debugger;
  const requests = new Map();

  if (debuggerApi.isAttached()) {
    return;
  }

  try {
    debuggerApi.attach('1.3');
    await debuggerApi.sendCommand('Network.enable');
  } catch (error) {
    logDesktopNet(context, `failed to attach debugger: ${error.message}`);
    return;
  }

  logDesktopNet(context, 'attached Chromium network diagnostics');

  debuggerApi.on('detach', (_event, reason) => {
    logDesktopNet(context, `debugger detached: ${reason}`);
  });

  debuggerApi.on('message', async (_event, method, params) => {
    try {
      if (method === 'Network.requestWillBeSent') {
        const requestId = params.requestId;
        const url = params.request?.url || '';
        const resourceType = params.type || '';
        if (!shouldTraceDesktopUrl(url) || !DESKTOP_NET_TRACE_RESOURCE_TYPES.has(resourceType)) {
          return;
        }

        const meta = {
          url,
          method: params.request?.method || 'GET',
          resourceType,
          status: null
        };
        requests.set(requestId, meta);

        if (params.redirectResponse) {
          logDesktopNet(
            context,
            `redirect ${meta.method} ${redactDesktopUrl(url)} from_status=${params.redirectResponse.status} headers=${JSON.stringify(pickDesktopResponseHeaders(params.redirectResponse.headers))}`
          );
        }

        logDesktopNet(context, `request ${resourceType} ${meta.method} ${redactDesktopUrl(url)}`);
        return;
      }

      if (method === 'Network.responseReceived') {
        const requestId = params.requestId;
        const existing = requests.get(requestId);
        const url = params.response?.url || existing?.url || '';
        const resourceType = params.type || existing?.resourceType || '';
        if (!shouldTraceDesktopUrl(url) || !DESKTOP_NET_TRACE_RESOURCE_TYPES.has(resourceType)) {
          return;
        }

        const meta = {
          ...(existing || {}),
          url,
          resourceType,
          status: params.response?.status ?? null
        };
        requests.set(requestId, meta);

        const shouldLogResponse = meta.status >= 400 || url.includes('/backend-api/') || url.includes('/oauth') || url.includes('/authorize') || url.includes('/callback');
        if (shouldLogResponse) {
          logDesktopNet(
            context,
            `response ${resourceType} status=${meta.status} url=${redactDesktopUrl(url)} headers=${JSON.stringify(pickDesktopResponseHeaders(params.response?.headers))}`
          );
        }
        return;
      }

      if (method === 'Network.loadingFailed') {
        const requestId = params.requestId;
        const meta = requests.get(requestId);
        if (!meta || !shouldTraceDesktopUrl(meta.url)) {
          return;
        }

        logDesktopNet(
          context,
          `failed ${meta.resourceType} ${meta.method} ${redactDesktopUrl(meta.url)} error=${params.errorText} canceled=${params.canceled ? 'true' : 'false'} blocked=${params.blockedReason || 'none'}`
        );
        requests.delete(requestId);
        return;
      }

      if (method === 'Network.loadingFinished') {
        const requestId = params.requestId;
        const meta = requests.get(requestId);
        if (!meta || !shouldTraceDesktopUrl(meta.url)) {
          return;
        }

        if (meta.status >= 400 && !isDesktopSensitiveUrl(meta.url)) {
          try {
            const bodyResult = await debuggerApi.sendCommand('Network.getResponseBody', { requestId });
            const bodyText = bodyResult?.base64Encoded
              ? Buffer.from(bodyResult.body || '', 'base64').toString('utf8')
              : bodyResult?.body || '';
            logDesktopNet(
              context,
              `body status=${meta.status} url=${redactDesktopUrl(meta.url)} preview=${JSON.stringify(previewDesktopResponseBody(bodyText))}`
            );
          } catch (error) {
            logDesktopNet(context, `body-read-failed status=${meta.status} url=${redactDesktopUrl(meta.url)} error=${error.message}`);
          }
        }

        requests.delete(requestId);
      }
    } catch (error) {
      logDesktopNet(context, `diagnostic-handler-error method=${method} error=${error.message}`);
    }
  });

  window.on('closed', () => {
    requests.clear();
    if (debuggerApi.isAttached()) {
      try {
        debuggerApi.detach();
      } catch {
        // ignore detach races
      }
    }
  });
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
    frame: false,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: WINDOW_BACKGROUND_COLOR,
    webPreferences: {
      contextIsolation: true,
      preload: WINDOW_PRELOAD_PATH,
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
  mainWindow.on('maximize', () => emitWindowState(mainWindow));
  mainWindow.on('unmaximize', () => emitWindowState(mainWindow));
  mainWindow.on('restore', () => emitWindowState(mainWindow));

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.show();
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) {
      return;
    }
    logDesktopEvent(context, `failed to load ${validatedURL}: ${errorCode} ${errorDescription}`, 'error');
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logDesktopEvent(context, `renderer exited: ${details.reason}`, 'error');
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      const rendered = `[renderer] ${message} (${sourceId}:${line})`;
      context?.store?.appendLog?.(rendered);
      console.error(rendered);
    }
  });

  if (DESKTOP_NET_TRACE_ENABLED) {
    await installDesktopNetworkDiagnostics(mainWindow, context);
  }
  await refreshWindowCacheIfNeeded(mainWindow, context);

  await mainWindow.loadURL(context.runtime.publicOrigin);
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
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

const hasSingleInstanceLock = app.requestSingleInstanceLock({
  execPath: process.execPath
});

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', async (_event, argv, workingDirectory, additionalData) => {
    const nextExecPath = resolveSecondInstanceExecutablePath({
      argv,
      workingDirectory,
      additionalData
    });

    if (shouldHandoffToNewExecutable(process.execPath, nextExecPath)) {
      isQuitting = true;
      app.relaunch({
        execPath: nextExecPath,
        args: buildSecondInstanceRelaunchArgs(argv)
      });
      app.quit();
      return;
    }

    if (isBackgroundLaunch(argv)) {
      return;
    }

    await app.whenReady();
    await restoreOrCreateWindow();
  });

  app.whenReady().then(async () => {
    try {
      await startBackend();
      createTray();
      if (!isBackgroundLaunch()) {
        await createWindow();
      }
    } catch (error) {
      const detail = error?.message || String(error);
      try {
        dialog.showErrorBox('Leme Hub 无法启动', `本地服务启动失败：\n${detail}`);
      } catch {
        console.error(`[desktop] backend failed to start: ${detail}`);
      }
      isQuitting = true;
      app.quit();
      return;
    }
  }).catch((error) => {
    const detail = error?.stack || error?.message || String(error);
    console.error(`[desktop] startup failed: ${detail}`);
    try {
      dialog.showErrorBox('Leme Hub 无法启动', `桌面程序启动失败：\n${detail}`);
    } catch {
      // The native dialog itself may be unavailable during very early startup.
    }
    isQuitting = true;
    app.quit();
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
