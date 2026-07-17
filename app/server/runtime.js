import { DEFAULT_UI_PORT } from '../shared/constants.js';
import { formatUrlWithHost, normalizeHost, resolvePublicOriginHost } from '../shared/network.js';

const toBool = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

const toPort = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
};

export function resolveServerRuntime(settings, env = process.env) {
  const mode = env.LEME_MODE === 'server' ? 'server' : 'desktop';
  const allowRemote = toBool(env.LEME_ALLOW_REMOTE);
  // Desktop control API is unauthenticated, so bind to loopback by default even
  // if an older settings.json persisted 0.0.0.0. Only expose on all interfaces
  // when the operator explicitly opts in (LEME_ALLOW_REMOTE / LEME_UI_HOST).
  const desktopHost = env.LEME_UI_HOST
    || (allowRemote ? settings.uiHost : '127.0.0.1');
  const host = normalizeHost(mode === 'server'
    ? (env.LEME_UI_HOST || '0.0.0.0')
    : desktopHost, mode === 'server' ? '0.0.0.0' : '127.0.0.1');
  const port = mode === 'server'
    ? toPort(env.LEME_UI_PORT, DEFAULT_UI_PORT)
    : toPort(env.LEME_UI_PORT, settings.uiPort);

  return {
    mode,
    allowRemote,
    host,
    port,
    publicOrigin: formatUrlWithHost('http', resolvePublicOriginHost(host), port)
  };
}
