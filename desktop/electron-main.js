import path from 'path';
import { fileURLToPath } from 'url';

import { app, BrowserWindow } from 'electron';

import { createAppServer } from '../app/server/createServer.js';
import { resolveProjectPaths } from '../app/shared/paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

let serverContext = null;
let mainWindow = null;

async function startBackend() {
  const runtimeRoot = path.join(app.getPath('userData'), 'runtime');
  const paths = resolveProjectPaths(projectRoot, { runtimeRoot });
  const server = createAppServer(paths, {
    ...process.env,
    LEME_MODE: 'desktop',
    LEME_UI_HOST: '127.0.0.1'
  });

  serverContext = await server.start();
  return serverContext;
}

async function createWindow() {
  const context = serverContext || await startBackend();

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: false
    },
    title: 'Leme Hub'
  });

  await mainWindow.loadURL(context.runtime.publicOrigin);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function shutdownBackend() {
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

app.whenReady().then(createWindow);

app.on('activate', async () => {
  if (!BrowserWindow.getAllWindows().length) {
    await createWindow();
  }
});

app.on('before-quit', async (event) => {
  if (!serverContext) {
    return;
  }

  event.preventDefault();
  const currentContext = serverContext;
  serverContext = null;
  try {
    await currentContext.coreManager.stop();
  } catch {
    // ignore shutdown races
  }
  await new Promise((resolve) => {
    currentContext.server.close(() => resolve());
  });
  app.exit(0);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
