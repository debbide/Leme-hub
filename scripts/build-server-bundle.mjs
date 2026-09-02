import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { build } from 'esbuild';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const serverDistDir = 'dist/leme-hub-server';
const serverPackageJsonPath = path.join(serverDistDir, 'package.json');
const nativeTarget = process.env.LEME_SERVER_TARGET;

if (!['linux-x64', 'linux-arm64'].includes(nativeTarget)) {
  throw new Error('LEME_SERVER_TARGET must be linux-x64 or linux-arm64');
}

await build({
  entryPoints: ['app/server/start.js'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['koffi'],
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
fs.cpSync('node_modules/koffi', path.join(serverDistDir, 'node_modules', 'koffi'), { recursive: true });
fs.rmSync(path.join(serverDistDir, 'node_modules', '@koromix'), { recursive: true, force: true });
const packageName = nativeTarget === 'linux-arm64' ? 'koffi-linux-arm64' : 'koffi-linux-x64';
nativePackage: {
  const source = path.join('node_modules', '@koromix', packageName);
  if (fs.existsSync(source)) {
    fs.cpSync(source, path.join(serverDistDir, 'node_modules', '@koromix', packageName), { recursive: true });
    break nativePackage;
  }

  // npm only installs optional dependencies for the build host architecture.
  // Fetch the other Linux architecture explicitly so both pkg targets contain
  // the Koffi native addon they require at runtime.
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${packageName}-`));
  try {
    const packageSpec = `@koromix/${packageName}@${packageJson.dependencies.koffi}`;
    const packResult = JSON.parse(execFileSync('npm', ['pack', packageSpec, '--json'], {
      cwd: tempDir,
      encoding: 'utf8'
    }));
    const archivePath = path.join(tempDir, packResult[0].filename);
    execFileSync('tar', ['-xzf', archivePath, '-C', tempDir]);
    fs.cpSync(
      path.join(tempDir, 'package'),
      path.join(serverDistDir, 'node_modules', '@koromix', packageName),
      { recursive: true }
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
const nativeManifest = JSON.parse(fs.readFileSync('native-assets/manifest.json', 'utf8'));
const nativeRuntimeVersion = String(nativeManifest.runtimeVersion);
const nativeSourceDir = path.join('native-assets', nativeRuntimeVersion, nativeTarget);
const nativeDestinationDir = path.join(serverDistDir, 'native-assets', nativeRuntimeVersion, nativeTarget);
fs.rmSync(path.join(serverDistDir, 'native-assets'), { recursive: true, force: true });
fs.mkdirSync(nativeDestinationDir, { recursive: true });
fs.cpSync(nativeSourceDir, nativeDestinationDir, { recursive: true });
fs.writeFileSync(
  path.join(serverDistDir, 'native-assets', 'manifest.json'),
  JSON.stringify({
    ...nativeManifest,
    targets: nativeManifest.targets.filter((entry) => entry.target === nativeTarget)
  }, null, 2) + '\n'
);
fs.writeFileSync(path.join(serverDistDir, '.npmignore'), '');
fs.writeFileSync(serverPackageJsonPath, JSON.stringify({
  name: 'leme-hub-server',
  version: packageJson.version,
  private: true,
  type: 'commonjs',
  bin: 'server-bundle.cjs',
  dependencies: {
    koffi: packageJson.dependencies.koffi
  },
  pkg: {
    scripts: ['server-bundle.cjs'],
    assets: [
      'public/**/*',
      'node_modules/koffi/**/*',
      `node_modules/@koromix/${packageName}/**/*`,
      'native-assets/**/*'
    ]
  }
}, null, 2) + '\n');
console.log('Prepared dist/server bundle assets and pkg manifest');
