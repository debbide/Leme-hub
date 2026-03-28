import path from 'path';
import { fileURLToPath } from 'url';

import { createAppServer } from './createServer.js';
import { resolveDefaultRuntimeRoot, resolveProjectPaths } from '../shared/paths.js';

export async function startServer(env = process.env) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const projectRoot = path.resolve(__dirname, '..', '..');
  const runtimeRoot = resolveDefaultRuntimeRoot(projectRoot, env);
  const paths = resolveProjectPaths(projectRoot, { runtimeRoot });

  const app = createAppServer(paths, env);
  return app.start();
}
