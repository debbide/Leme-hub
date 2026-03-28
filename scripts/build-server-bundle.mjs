import { build } from 'esbuild';

await build({
  entryPoints: ['app/server/start.js'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: 'dist/server/server-bundle.cjs',
  banner: {
    js: "const path = require('path'); process.env.LEME_MODE = process.env.LEME_MODE || 'server'; process.env.LEME_PROJECT_ROOT = process.env.LEME_PROJECT_ROOT || path.resolve(__dirname, '../..');"
  },
  footer: {
    js: "module.exports.startServer(process.env).catch((error) => { console.error(error); process.exit(1); });"
  }
});
