import path from 'path';
import { fileURLToPath } from 'url';

import { createAppServer } from './createServer.js';
import { resolveDefaultRuntimeRoot, resolveProjectPaths } from '../shared/paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const runtimeRoot = resolveDefaultRuntimeRoot(projectRoot, process.env);
const paths = resolveProjectPaths(projectRoot, { runtimeRoot });

const app = createAppServer(paths, process.env);
await app.start();
