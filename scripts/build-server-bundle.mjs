import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const serverDistDir = 'dist/server';
const serverPackageJsonPath = path.join(serverDistDir, 'package.json');

await build({
  entryPoints: ['app/server/start.js'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: path.join(serverDistDir, 'server-bundle.cjs'),
  banner: {
    js: "const path = require('path'); process.env.LEME_MODE = process.env.LEME_MODE || 'server'; process.env.LEME_PROJECT_ROOT = process.env.LEME_PROJECT_ROOT || path.resolve(__dirname, '..');"
  },
  footer: {
    js: "module.exports.startServer(process.env).catch((error) => { console.error(error); process.exit(1); });"
  }
});

// Copy public/ alongside the bundle so pkg can embed it reliably
fs.cpSync('public', path.join(serverDistDir, 'public'), { recursive: true });
fs.writeFileSync(serverPackageJsonPath, JSON.stringify({
  name: 'leme-hub-server',
  version: packageJson.version,
  private: true,
  bin: 'server-bundle.cjs',
  pkg: {
    assets: ['public/**/*']
  }
}, null, 2) + '\n');
console.log('Prepared dist/server bundle assets and pkg manifest');
