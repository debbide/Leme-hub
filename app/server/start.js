import path from 'path';

import { createAppServer } from './createServer.js';
import { resolveDefaultRuntimeRoot, resolveProjectPaths } from '../shared/paths.js';

export async function startServer(env = process.env, options = {}) {
  const projectRoot = path.resolve(options.projectRoot || env.LEME_PROJECT_ROOT || process.cwd());
  const runtimeRoot = resolveDefaultRuntimeRoot(projectRoot, env);
  const paths = resolveProjectPaths(projectRoot, { runtimeRoot });

  const app = createAppServer(paths, env);
  return app.start();
}
