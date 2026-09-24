import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import AdmZip from 'adm-zip';
import { c as createTar } from 'tar';

import { SingBoxBinaryManager } from '../app/proxy/SingBoxBinaryManager.js';
import { DEFAULT_MANAGED_SINGBOX_VERSION } from '../app/shared/constants.js';
import { resolveProjectPaths } from '../app/shared/paths.js';

const createProjectRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'local-proxy-client-project-'));
const platform = process.platform === 'win32' ? 'windows' : process.platform;
const arch = process.arch === 'x64' ? 'amd64' : process.arch === 'ia32' ? '386' : process.arch;
const archiveExtension = platform === 'windows' ? '.zip' : '.tar.gz';
const executableName = process.platform === 'win32' ? 'sing-box.exe' : 'sing-box';

const createZipBuffer = (files) => {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.from(content));
  }
  return zip.toBuffer();
};

const createArchivePath = (projectRoot, version) => path.join(projectRoot, `sing-box-${version}-${platform}-${arch}${archiveExtension}`);

const createExecutablePath = (version) => `sing-box-${version}-${platform}-${arch}/${executableName}`;

const createArchiveFile = async (archivePath, version) => {
  const executablePath = createExecutablePath(version);

  if (archiveExtension === '.zip') {
    const zipBuffer = createZipBuffer({ [executablePath]: 'downloaded-binary' });
    fs.writeFileSync(archivePath, zipBuffer);
    return zipBuffer;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leme-hub-singbox-archive-'));
  const fullExecutablePath = path.join(tempDir, executablePath);
  fs.mkdirSync(path.dirname(fullExecutablePath), { recursive: true });
  fs.writeFileSync(fullExecutablePath, 'downloaded-binary');
  await createTar({ gzip: true, cwd: tempDir, file: archivePath }, [path.dirname(executablePath)]);
  const buffer = fs.readFileSync(archivePath);
  fs.rmSync(tempDir, { recursive: true, force: true });
  return buffer;
};

const createFetchStub = ({ release, archivePath }) => async (url) => {
  if (url.includes('/releases/latest') || url.includes('/releases/tags/')) {
    return {
      ok: true,
      json: async () => release,
      status: 200,
      statusText: 'OK'
    };
  }

  return {
    ok: true,
    body: true,
    arrayBuffer: async () => fs.readFileSync(archivePath),
    status: 200,
    statusText: 'OK'
  };
};

test('uses configured binary when it already exists', async () => {
  const projectRoot = createProjectRoot();
  const paths = resolveProjectPaths(projectRoot);
  // Configured binaries must live inside the managed bin directory; anything
  // else is rejected to prevent arbitrary-binary execution.
  const configuredPath = path.join(paths.binDir, 'custom-sing-box.exe');
  fs.mkdirSync(paths.binDir, { recursive: true });
  fs.writeFileSync(configuredPath, 'binary');

  const manager = new SingBoxBinaryManager(paths, {
    fetch: async () => {
      throw new Error('fetch should not be called');
    }
  });

  const result = await manager.ensureAvailable(configuredPath);

  assert.equal(result.executablePath, path.resolve(configuredPath));
  assert.equal(result.installed, false);
  assert.equal(result.source, 'configured');
});

test('rejects configured binary outside the managed bin directory', async () => {
  const projectRoot = createProjectRoot();
  const paths = resolveProjectPaths(projectRoot);
  const configuredPath = path.join(projectRoot, 'custom-sing-box.exe');
  fs.writeFileSync(configuredPath, 'binary');

  const manager = new SingBoxBinaryManager(paths, {
    fetch: async () => {
      throw new Error('fetch should not be called');
    }
  });

  await assert.rejects(
    () => manager.ensureAvailable(configuredPath),
    /outside the managed binary directory/
  );
});

test('downloads managed binary when no binary exists', async () => {
  const projectRoot = createProjectRoot();
  const paths = resolveProjectPaths(projectRoot);
  const version = DEFAULT_MANAGED_SINGBOX_VERSION;
  const archivePath = createArchivePath(projectRoot, version);
  const archiveName = path.basename(archivePath);
  const archiveBuffer = await createArchiveFile(archivePath, version);
  const digest = crypto.createHash('sha256').update(archiveBuffer).digest('hex');

  const manager = new SingBoxBinaryManager(paths, {
    fetch: createFetchStub({
      release: {
        tag_name: `v${version}`,
        assets: [{
          name: archiveName,
          browser_download_url: 'https://example.com/sing-box.zip',
          digest: `sha256:${digest}`
        }]
      },
      archivePath
    })
  });

  const result = await manager.ensureAvailable(path.join(paths.binDir, 'missing.exe'));

  assert.equal(result.installed, true);
  assert.equal(result.source, 'managed');
  assert.equal(result.version, version);
  assert.equal(fs.existsSync(result.executablePath), true);
});

test('downloads pinned binaries only with a verified release checksum', async () => {
  const projectRoot = createProjectRoot();
  const paths = resolveProjectPaths(projectRoot);
  const version = '1.13.4';
  const archivePath = createArchivePath(projectRoot, version);
  const archiveBuffer = await createArchiveFile(archivePath, version);
  const digest = crypto.createHash('sha256').update(archiveBuffer).digest('hex');

  const manager = new SingBoxBinaryManager(paths, {
    fetch: createFetchStub({
      release: {
        tag_name: `v${version}`,
        assets: [{
          name: path.basename(archivePath),
          browser_download_url: 'https://example.com/sing-box.zip',
          digest: `sha256:${digest}`
        }]
      },
      archivePath
    })
  });

  const result = await manager.ensureAvailable(path.join(paths.binDir, 'missing.exe'));
  assert.equal(result.installed, true);
  assert.equal(fs.existsSync(manager.getManagedBinaryPath()), true);
});

test('refuses pinned binaries when the release publishes no digest', async () => {
  const projectRoot = createProjectRoot();
  const paths = resolveProjectPaths(projectRoot);
  const version = '1.13.4';
  const archivePath = createArchivePath(projectRoot, version);
  await createArchiveFile(archivePath, version);

  const manager = new SingBoxBinaryManager(paths, {
    fetch: createFetchStub({
      release: {
        tag_name: `v${version}`,
        assets: [{
          name: path.basename(archivePath),
          browser_download_url: 'https://example.com/sing-box.zip'
          // no digest
        }]
      },
      archivePath
    })
  });

  await assert.rejects(
    () => manager.ensureAvailable(path.join(paths.binDir, 'missing.exe')),
    /no digest/
  );
  assert.equal(fs.existsSync(manager.getManagedBinaryPath()), false);
});

test('refuses pinned binaries with a mismatched digest', async () => {
  const projectRoot = createProjectRoot();
  const paths = resolveProjectPaths(projectRoot);
  const version = '1.13.4';
  const archivePath = createArchivePath(projectRoot, version);
  await createArchiveFile(archivePath, version);

  const manager = new SingBoxBinaryManager(paths, {
    fetch: createFetchStub({
      release: {
        tag_name: `v${version}`,
        assets: [{
          name: path.basename(archivePath),
          browser_download_url: 'https://example.com/sing-box.zip',
          digest: 'sha256:deadbeef'
        }]
      },
      archivePath
    })
  });

  await assert.rejects(
    () => manager.ensureAvailable(path.join(paths.binDir, 'missing.exe')),
    /checksum verification/
  );
  assert.equal(fs.existsSync(manager.getManagedBinaryPath()), false);
});

test('downloads pinned version via release metadata first', async () => {
  const projectRoot = createProjectRoot();
  const paths = resolveProjectPaths(projectRoot);
  const version = DEFAULT_MANAGED_SINGBOX_VERSION;
  const archivePath = createArchivePath(projectRoot, version);
  const archiveBuffer = await createArchiveFile(archivePath, version);
  const digest = crypto.createHash('sha256').update(archiveBuffer).digest('hex');
  const calls = [];

  const manager = new SingBoxBinaryManager(paths, {
    fetch: async (url) => {
      calls.push(url);
      if (url.includes('/releases/')) {
        return {
          ok: true,
          json: async () => ({
            tag_name: `v${version}`,
            assets: [{
              name: path.basename(archivePath),
              browser_download_url: 'https://example.com/sing-box.zip',
              digest: `sha256:${digest}`
            }]
          })
        };
      }
      return {
        ok: true,
        body: true,
        arrayBuffer: async () => fs.readFileSync(archivePath),
        status: 200,
        statusText: 'OK'
      };
    }
  });

  const result = await manager.ensureAvailable(path.join(paths.binDir, 'missing.exe'));

  assert.equal(result.installed, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].endsWith(`/tags/v${version}`), true);
  assert.equal(calls[1], 'https://example.com/sing-box.zip');
});

test('pins managed downloads to the default sing-box version', async () => {
  const projectRoot = createProjectRoot();
  const paths = resolveProjectPaths(projectRoot);
  const calls = [];

  const manager = new SingBoxBinaryManager(paths, {
    fetch: async (url) => {
      calls.push(url);
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found'
      };
    }
  });

  await assert.rejects(() => manager.fetchRelease(), /404 Not Found/);
  assert.equal(calls[0].endsWith(`/tags/v${DEFAULT_MANAGED_SINGBOX_VERSION}`), true);
});
