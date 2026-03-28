import fs from 'fs';
import http from 'http';
import path from 'path';

import { ConfigStore } from './services/ConfigStore.js';
import { CoreManager } from './services/CoreManager.js';
import { createCoreRoutes } from './routes/core.js';
import { createNodeRoutes } from './routes/nodes.js';
import { createSystemRoutes } from './routes/system.js';
import { ensureRuntimeDirs } from '../shared/paths.js';
import { resolveServerRuntime } from './runtime.js';

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const sendJson = (response, status, body) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
};

const readJsonBody = async (request) => {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return null;
  }

  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
  }

  if (!raw.trim()) {
    return null;
  }

  return JSON.parse(raw);
};

const sendFile = (response, filePath) => {
  if (!fs.existsSync(filePath)) {
    sendJson(response, 404, { ok: false, error: 'Not found' });
    return;
  }

  const ext = path.extname(filePath);
  response.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
};

export function createAppServer(paths, env = process.env) {
  ensureRuntimeDirs(paths);

  const store = new ConfigStore(paths);
  const coreManager = new CoreManager(paths, store);
  const runtime = resolveServerRuntime(store.getSettings(), env);
  const routes = {
    ...createSystemRoutes({ store, coreManager, paths }),
    ...createCoreRoutes({ coreManager }),
    ...createNodeRoutes({ store, coreManager })
  };

  const resolveStaticPath = (pathname) => {
    const requestedPath = pathname === '/'
      ? 'index.html'
      : pathname.replace(/^\/+/u, '');
    const normalizedPath = path.normalize(requestedPath);
    const resolvedPath = path.resolve(paths.publicDir, normalizedPath);
    const publicRoot = path.resolve(paths.publicDir) + path.sep;

    if (resolvedPath !== path.resolve(paths.publicDir) && !resolvedPath.startsWith(publicRoot)) {
      return null;
    }

    return resolvedPath;
  };

  const server = http.createServer(async (request, response) => {
    const method = request.method || 'GET';
    const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
    const routeKey = `${method} ${url.pathname}`;
    const route = routes[routeKey];

    if (route) {
      try {
        const body = await readJsonBody(request);
        const result = await route({ request, url, body });
        sendJson(response, result.status || 200, result.body);
      } catch (error) {
        const status = error instanceof SyntaxError ? 400 : 500;
        sendJson(response, status, { ok: false, error: error.message });
      }
      return;
    }

    const safePath = resolveStaticPath(url.pathname);
    if (!safePath) {
      sendJson(response, 403, { ok: false, error: 'Forbidden' });
      return;
    }

    sendFile(response, safePath);
  });

  server.on('error', (error) => {
    if (error?.code === 'EADDRINUSE') {
      console.error(`Port ${runtime.port} is already in use on ${runtime.host}. Stop the existing process or change the configured host/port.`);
      process.exit(1);
    }

    console.error(error);
    process.exit(1);
  });

  const start = () => new Promise((resolve) => {
    server.listen(runtime.port, runtime.host, () => {
      console.log(`[${runtime.mode}] local-proxy-client listening on ${runtime.publicOrigin}`);
      resolve({ server, store, coreManager, runtime });
    });
  });

  return {
    server,
    store,
    coreManager,
    runtime,
    start
  };
}
