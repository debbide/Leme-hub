import fs from 'fs';
import http from 'http';
import path from 'path';

import { AuthStore } from './services/AuthStore.js';
import { AuthService } from './services/AuthService.js';
import { ConfigStore } from './services/ConfigStore.js';
import { CoreManager } from './services/CoreManager.js';
import { UwpLoopbackManager } from './services/UwpLoopbackManager.js';
import { createAuthRoutes } from './routes/auth.js';
import { createCoreRoutes } from './routes/core.js';
import { createNodeGroupRoutes } from './routes/node-groups.js';
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

const sendJson = (response, status, body, headers = {}) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(body));
};

const MAX_BODY_SIZE = 1 * 1024 * 1024; // 1MB

const readJsonBody = async (request) => {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return null;
  }

  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (Buffer.byteLength(raw) > MAX_BODY_SIZE) {
      const err = new Error('Request body too large');
      err.status = 413;
      throw err;
    }
  }

  if (!raw.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error('Invalid JSON');
    err.status = 400;
    throw err;
  }
};

const sendFile = (response, filePath) => {
  if (!fs.existsSync(filePath)) {
    sendJson(response, 404, { ok: false, error: 'Not found' });
    return;
  }

  const ext = path.extname(filePath);
  response.writeHead(200, {
    'Content-Type': contentTypes[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(filePath).pipe(response);
};

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);

const isLoopbackHostname = (hostname) => {
  const normalized = String(hostname || '').toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (LOOPBACK_HOSTNAMES.has(normalized)) {
    return true;
  }
  // 127.0.0.0/8 is entirely loopback.
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/u.test(normalized);
};

// For the local desktop control API, reject state-changing requests whose
// browser-supplied Origin is not this machine's loopback. This blocks CSRF /
// DNS-rebinding from web pages without introducing a token. Same-origin
// fetch()/XHR from the bundled UI always send a loopback Origin (or none, for
// non-browser callers), so legitimate traffic is unaffected. Server mode (a
// deliberately hosted panel, possibly remote) is intentionally exempt.
export const isForbiddenCrossOrigin = (request, runtime) => {
  if (runtime.mode !== 'desktop') {
    return false;
  }
  const method = request.method || 'GET';
  if (SAFE_HTTP_METHODS.has(method)) {
    return false;
  }
  const origin = request.headers.origin;
  if (!origin) {
    return false;
  }
  try {
    return !isLoopbackHostname(new URL(origin).hostname);
  } catch {
    // Unparseable Origin header on a write request: treat as forbidden.
    return true;
  }
};

// The login page and its static assets must stay public, otherwise an
// unauthenticated visit to /login.html would 302 back to
// /login.html?next=... creating an infinite redirect loop.
const PUBLIC_STATIC_PATHS = new Set(['/login.html', '/styles.css', '/favicon.png']);

export const requiresAuth = (pathname, { enabled }) => {
  if (!enabled) {
    return false;
  }
  if (pathname.startsWith('/api/auth/')) {
    return false;
  }
  return !PUBLIC_STATIC_PATHS.has(pathname);
};

export function createAppServer(paths, env = process.env) {
  ensureRuntimeDirs(paths);

  const runtimeMode = env.LEME_MODE === 'server' ? 'server' : 'desktop';
  const store = new ConfigStore(paths, { env, mode: runtimeMode });
  const coreManager = new CoreManager(paths, store, {
    env,
    autoStartExecutablePath: env.LEME_AUTOSTART_EXECUTABLE
  });
  const uwpLoopbackManager = new UwpLoopbackManager();
  const runtime = resolveServerRuntime(store.getSettings(), env);
  const authStore = new AuthStore(paths);
  const authService = new AuthService({ store: authStore, runtime });
  const routes = {
    ...createAuthRoutes({ authService }),
    ...createSystemRoutes({ store, coreManager, paths, uwpLoopbackManager }),
    ...createCoreRoutes({ coreManager }),
    ...createNodeGroupRoutes({ coreManager }),
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

    if (isForbiddenCrossOrigin(request, runtime)) {
      sendJson(response, 403, { ok: false, error: 'Cross-origin request rejected' });
      return;
    }

    // Server mode: every non-auth API requires a logged-in session; page
    // requests redirect to the login page (original path preserved in ?next=).
    if (requiresAuth(url.pathname, { enabled: authService.enabled })) {
      const user = authService.resolveUserFromRequest(request);
      if (!user) {
        if (url.pathname.startsWith('/api/')) {
          sendJson(response, 401, { ok: false, error: '未登录或会话已过期' });
          return;
        }
        const next = encodeURIComponent(url.pathname + url.search);
        response.writeHead(302, { Location: `/login.html?next=${next}` });
        response.end();
        return;
      }
    }

    if (route) {
      try {
        const body = await readJsonBody(request);
        const result = await route({ request, response, url, body });
        if (!result?.handled && !response.writableEnded) {
          sendJson(response, result.status || 200, result.body, result.headers);
        }
      } catch (error) {
        const status = error.status || (error instanceof SyntaxError ? 400 : 500);
        if (!response.headersSent) {
          sendJson(response, status, { ok: false, error: error.message });
        } else if (!response.writableEnded) {
          response.end();
        }
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

  let handleListenError = null;

  server.on('error', (error) => {
    if (error?.code === 'EADDRINUSE') {
      error.message = `Port ${runtime.port} is already in use on ${runtime.host}. Stop the existing process or change the configured host/port.`;
    }

    // During startup, surface the error to the start() caller so it can decide
    // how to handle it (e.g. the desktop app shows a dialog and shuts down
    // cleanly instead of hard-killing the process and skipping proxy cleanup).
    if (handleListenError) {
      handleListenError(error);
      return;
    }

    // No startup handler is listening (post-listen runtime error): log it.
    // Callers that need to react can attach their own 'error' listener.
    console.error(error);
  });

  const start = () => new Promise((resolve, reject) => {
    let settled = false;
    handleListenError = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      handleListenError = null;
      reject(error);
    };

    server.listen(runtime.port, runtime.host, () => {
      settled = true;
      handleListenError = null;
      coreManager.refreshAutoStartState().catch(() => null);
      coreManager.initializeGeoIp().catch(() => null);
      coreManager.initializeRulesetDatabase().catch(() => null);
      // Auto-start core when either system-proxy entry or TUN capture is enabled.
      // TUN-only users previously saw the mode selected but core never started.
      const bootSettings = store.getSettings();
      if (bootSettings.systemProxyEnabled || bootSettings.tunEnabled) {
        coreManager.start().catch((error) => {
          console.error(`[server] failed to auto-start proxy core: ${error.message}`);
        });
      }
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
