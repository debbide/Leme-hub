import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import AdmZip from 'adm-zip';
import { x as extractTar } from 'tar';

import {
  DEFAULT_MANAGED_SINGBOX_VERSION,
  SINGBOX_REPOSITORY
} from '../shared/constants.js';

const RELEASES_BASE_URL = `https://api.github.com/repos/${SINGBOX_REPOSITORY.owner}/${SINGBOX_REPOSITORY.repo}/releases`;

const archMap = {
  arm64: 'arm64',
  ia32: '386',
  x64: 'amd64'
};

const platformMap = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'windows'
};

const executableName = process.platform === 'win32' ? 'sing-box.exe' : 'sing-box';

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const removeIfExists = (targetPath) => {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { force: true, recursive: true });
  }
};

const toHex = (digest = '') => digest.startsWith('sha256:') ? digest.slice('sha256:'.length) : digest;

export class SingBoxBinaryManager {
  constructor(paths, options = {}) {
    this.paths = paths;
    this.fetch = options.fetch || globalThis.fetch;
    this.log = options.log || console;
    this.version = options.version || DEFAULT_MANAGED_SINGBOX_VERSION;

    if (!this.fetch) {
      throw new Error('Global fetch is not available in this Node.js runtime');
    }
  }

  getManagedBinaryPath() {
    return path.join(this.paths.binDir, executableName);
  }

  getStatus(configuredPath) {
    const managedPath = this.getManagedBinaryPath();
    const resolvedConfiguredPath = configuredPath ? path.resolve(configuredPath) : null;
    const configuredExists = resolvedConfiguredPath ? fs.existsSync(resolvedConfiguredPath) : false;
    const managedExists = fs.existsSync(managedPath);

    return {
      configuredPath: resolvedConfiguredPath,
      configuredExists,
      managedPath,
      managedExists,
      ready: configuredExists || managedExists,
      source: configuredExists
        ? 'configured'
        : managedExists
          ? 'managed'
          : 'missing'
    };
  }

  async ensureAvailable(configuredPath) {
    const status = this.getStatus(configuredPath);
    if (status.configuredExists) {
      return {
        executablePath: status.configuredPath,
        installed: false,
        source: 'configured'
      };
    }

    if (status.managedExists) {
      return {
        executablePath: status.managedPath,
        installed: false,
        source: 'managed'
      };
    }

    return this.installManagedBinary();
  }

  getPlatformTarget() {
    const platform = platformMap[process.platform];
    const arch = archMap[process.arch];

    if (!platform || !arch) {
      throw new Error(`Unsupported platform for automatic sing-box download: ${process.platform}/${process.arch}`);
    }

    return {
      arch,
      extension: platform === 'windows' ? '.zip' : '.tar.gz',
      platform
    };
  }

  buildAssetName(version, target) {
    return `sing-box-${version}-${target.platform}-${target.arch}${target.extension}`;
  }

  async fetchRelease() {
    const url = this.version === 'latest'
      ? `${RELEASES_BASE_URL}/latest`
      : `${RELEASES_BASE_URL}/tags/${this.version.startsWith('v') ? this.version : `v${this.version}`}`;
    const response = await this.fetch(url, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'local-proxy-client'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch sing-box release metadata: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async installManagedBinary() {
    ensureDir(this.paths.binDir);

    const target = this.getPlatformTarget();
    const release = await this.fetchRelease();
    const version = String(release.tag_name || '').replace(/^v/, '');
    const assetName = this.buildAssetName(version, target);
    const asset = (release.assets || []).find((item) => item.name === assetName);

    if (!asset) {
      throw new Error(`Unable to find a matching sing-box release asset for ${target.platform}/${target.arch}`);
    }

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'local-proxy-client-singbox-'));
    const archivePath = path.join(tempRoot, asset.name);
    const extractDir = path.join(tempRoot, 'extract');

    try {
      await this.downloadAsset(asset.browser_download_url, archivePath);

      if (asset.digest) {
        await this.verifyDigest(archivePath, asset.digest);
      }

      ensureDir(extractDir);
      await this.extractArchive(archivePath, extractDir, target.extension);

      const extractedBinary = this.findExecutable(extractDir);
      const managedPath = this.getManagedBinaryPath();
      const tempBinaryPath = path.join(this.paths.binDir, `${executableName}.tmp`);

      removeIfExists(tempBinaryPath);
      fs.copyFileSync(extractedBinary, tempBinaryPath);
      if (process.platform !== 'win32') {
        fs.chmodSync(tempBinaryPath, 0o755);
      }
      fs.renameSync(tempBinaryPath, managedPath);

      return {
        executablePath: managedPath,
        installed: true,
        source: 'managed',
        version
      };
    } catch (error) {
      removeIfExists(path.join(this.paths.binDir, `${executableName}.tmp`));
      throw error;
    } finally {
      removeIfExists(tempRoot);
    }
  }

  async downloadAsset(url, destinationPath) {
    const response = await this.fetch(url, {
      headers: {
        'Accept': 'application/octet-stream',
        'User-Agent': 'local-proxy-client'
      },
      redirect: 'follow'
    });

    if (!response.ok || !response.body) {
      throw new Error(`Failed to download sing-box archive: ${response.status} ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(destinationPath, buffer);
  }

  async verifyDigest(filePath, expectedDigest) {
    const hash = crypto.createHash('sha256');

    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', resolve);
    });

    const actualDigest = hash.digest('hex');
    if (actualDigest !== toHex(expectedDigest)) {
      throw new Error('Downloaded sing-box archive failed checksum verification');
    }
  }

  async extractArchive(archivePath, extractDir, extension) {
    if (extension === '.zip') {
      const zip = new AdmZip(archivePath);
      zip.extractAllTo(extractDir, true);
      return;
    }

    await extractTar({
      cwd: extractDir,
      file: archivePath
    });
  }

  findExecutable(rootDir) {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        try {
          return this.findExecutable(fullPath);
        } catch (error) {
          continue;
        }
      }

      if (entry.isFile() && entry.name === executableName) {
        return fullPath;
      }
    }

    throw new Error('Downloaded sing-box archive did not contain the executable');
  }
}
