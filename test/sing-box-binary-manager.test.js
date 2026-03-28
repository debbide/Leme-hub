import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import AdmZip from 'adm-zip';

import { SingBoxBinaryManager } from '../app/proxy/SingBoxBinaryManager.js';
import { DEFAULT_MANAGED_SINGBOX_VERSION } from '../app/shared/constants.js';
import { resolveProjectPaths } from '../app/shared/paths.js';

const createProjectRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'local-proxy-client-project-'));

const createZipBuffer = (files) => {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.from(content));
  }
  return zip.toBuffer();
};

const createFetchStub = ({ release, archivePath }) => async (url) => {
  if (url.includes('/releases/')) {
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
  const configuredPath = path.join(projectRoot, 'custom-sing-box.exe');
  fs.writeFileSync(configuredPath, 'binary');

  const manager = new SingBoxBinaryManager(paths, {
    fetch: async () => {
      throw new Error('fetch should not be called');
    }
  });

  const result = await manager.ensureAvailable(configuredPath);

  assert.equal(result.executablePath, configuredPath);
  assert.equal(result.installed, false);
  assert.equal(result.source, 'configured');
});

test('downloads managed binary when no binary exists', async () => {
  const projectRoot = createProjectRoot();
  const paths = resolveProjectPaths(projectRoot);
  const version = '1.13.4';
  const archiveName = `sing-box-${version}-windows-amd64.zip`;
  const executablePath = `sing-box-${version}-windows-amd64/sing-box.exe`;
  const zipBuffer = createZipBuffer({ [executablePath]: 'downloaded-binary' });
  const archivePath = path.join(projectRoot, archiveName);
  fs.writeFileSync(archivePath, zipBuffer);
  const digest = crypto.createHash('sha256').update(zipBuffer).digest('hex');

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

test('fails on checksum mismatch and leaves no managed binary', async () => {
  const projectRoot = createProjectRoot();
  const paths = resolveProjectPaths(projectRoot);
  const version = '1.13.4';
  const archiveName = `sing-box-${version}-windows-amd64.zip`;
  const executablePath = `sing-box-${version}-windows-amd64/sing-box.exe`;
  const zipBuffer = createZipBuffer({ [executablePath]: 'downloaded-binary' });
  const archivePath = path.join(projectRoot, archiveName);
  fs.writeFileSync(archivePath, zipBuffer);

  const manager = new SingBoxBinaryManager(paths, {
    fetch: createFetchStub({
      release: {
        tag_name: `v${version}`,
        assets: [{
          name: archiveName,
          browser_download_url: 'https://example.com/sing-box.zip',
          digest: 'sha256:deadbeef'
        }]
      },
      archivePath
    })
  });

  await assert.rejects(() => manager.ensureAvailable(path.join(paths.binDir, 'missing.exe')), /checksum/i);
  assert.equal(fs.existsSync(manager.getManagedBinaryPath()), false);
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
