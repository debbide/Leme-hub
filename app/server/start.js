import path from 'path';

import { createAppServer } from './createServer.js';
import { resolveDefaultRuntimeRoot, resolveProjectPaths } from '../shared/paths.js';

export async function startServer(env = process.env, options = {}) {
  const projectRoot = path.resolve(options.projectRoot || env.LEME_PROJECT_ROOT || process.cwd());
  const runtimeRoot = resolveDefaultRuntimeRoot(projectRoot, env);
  const paths = resolveProjectPaths(projectRoot, { runtimeRoot });

  // --- Startup Diagnostics (remove after debugging) ---
  const fs = await import('fs');
  console.log('[DIAG] process.pkg:', !!process.pkg);
  console.log('[DIAG] __dirname:', __dirname);
  console.log('[DIAG] process.cwd():', process.cwd());
  console.log('[DIAG] process.execPath:', process.execPath);
  console.log('[DIAG] LEME_PROJECT_ROOT:', env.LEME_PROJECT_ROOT || '(not set)');
  console.log('[DIAG] paths.root:', paths.root);
  console.log('[DIAG] paths.publicDir:', paths.publicDir);
  console.log('[DIAG] publicDir exists:', fs.existsSync(paths.publicDir));
  console.log('[DIAG] index.html exists:', fs.existsSync(path.join(paths.publicDir, 'index.html')));
  try {
    const listing = fs.readdirSync(paths.publicDir);
    console.log('[DIAG] publicDir contents:', listing);
  } catch (e) {
    console.log('[DIAG] publicDir readdir FAILED:', e.message);
  }
  // --- End Diagnostics ---

  const app = createAppServer(paths, env);
  return app.start();
}
