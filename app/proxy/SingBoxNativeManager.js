import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import {
  DEFAULT_NATIVE_ABI_VERSION,
  DEFAULT_NATIVE_RUNTIME_VERSION,
  DEFAULT_NATIVE_SINGBOX_VERSION,
  SINGBOX_NATIVE_REPOSITORY
} from '../shared/constants.js';

const RELEASE_DOWNLOAD_BASE_URL = `https://github.com/${SINGBOX_NATIVE_REPOSITORY.owner}/${SINGBOX_NATIVE_REPOSITORY.repo}/releases/download`;

const assetMap = {
  'linux-arm64': 'libleme-singbox-linux-arm64.so',
  'linux-x64': 'libleme-singbox-linux-x64.so',
  'win32-x64': 'leme-singbox-win32-x64.dll'
};

const installedFileMap = {
  'linux-arm64': 'libleme-singbox.so',
  'linux-x64': 'libleme-singbox.so',
  'win32-x64': 'leme-singbox.dll'
};

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const normalizeDigest = (value = '') => String(value).trim().toLowerCase().replace(/^sha256:/u, '');

export class SingBoxNativeManager {
  constructor(paths, options = {}) {
    this.paths = paths;
    this.fetch = options.fetch || globalThis.fetch;
    this.log = options.log || console;
    this.runtimeVersion = options.runtimeVersion || DEFAULT_NATIVE_RUNTIME_VERSION;
    this.singBoxVersion = options.singBoxVersion || DEFAULT_NATIVE_SINGBOX_VERSION;
    this.abiVersion = options.abiVersion || DEFAULT_NATIVE_ABI_VERSION;
    this.platform = options.platform || process.platform;
    this.arch = options.arch || process.arch;

    if (!this.fetch) {
      throw new Error('Global fetch is not available in this Node.js runtime');
    }
  }

  getPlatformKey() {
    return `${this.platform}-${this.arch}`;
  }

  getAssetName() {
    const assetName = assetMap[this.getPlatformKey()];
    if (!assetName) {
      throw new Error(`Unsupported native sing-box platform: ${this.platform}/${this.arch}`);
    }
    return assetName;
  }

  getInstallDir() {
    return path.join(this.paths.binDir, 'native', this.runtimeVersion, this.getPlatformKey());
  }

  getManagedLibraryPath() {
    const installedName = installedFileMap[this.getPlatformKey()];
    if (!installedName) {
      throw new Error(`Unsupported native sing-box platform: ${this.platform}/${this.arch}`);
    }
    return path.join(this.getInstallDir(), installedName);
  }

  getBundledLibraryPath() {
    const installedName = installedFileMap[this.getPlatformKey()];
    if (!installedName) {
      return null;
    }

    const roots = [
      process.resourcesPath ? path.join(process.resourcesPath, 'native') : null,
      process.pkg?.entrypoint ? path.join(path.dirname(process.pkg.entrypoint), 'native-assets') : null,
      path.join(this.paths.root, 'native-assets')
    ].filter(Boolean);

    for (const root of roots) {
      const manifestPath = path.join(root, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        continue;
      }

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const runtimeVersion = String(manifest.runtimeVersion || this.runtimeVersion);
        const bundledPath = path.join(root, runtimeVersion, this.getPlatformKey(), installedName);
        if (fs.existsSync(bundledPath)) {
          return bundledPath;
        }
      } catch (error) {
        this.log.warn?.(`[SingBoxNativeManager] Invalid bundled native manifest: ${error.message}`);
      }
    }

    return null;
  }

  extractBundledLibrary() {
    const bundledPath = this.getBundledLibraryPath();
    if (!bundledPath) {
      return null;
    }

    const manifestPath = path.join(path.dirname(path.dirname(path.dirname(bundledPath))), 'manifest.json');
    let runtimeVersion = this.runtimeVersion;
    try {
      runtimeVersion = String(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).runtimeVersion || runtimeVersion);
    } catch {
      runtimeVersion = path.basename(path.dirname(path.dirname(bundledPath)));
    }

    const installedName = installedFileMap[this.getPlatformKey()];
    const installDir = path.join(this.paths.binDir, 'native', runtimeVersion, this.getPlatformKey());
    const libraryPath = path.join(installDir, installedName);
    const temporaryPath = `${libraryPath}.tmp`;
    ensureDir(installDir);

    const sourceDigest = crypto.createHash('sha256').update(fs.readFileSync(bundledPath)).digest('hex');
    if (fs.existsSync(libraryPath)) {
      const installedDigest = crypto.createHash('sha256').update(fs.readFileSync(libraryPath)).digest('hex');
      if (installedDigest === sourceDigest) {
        return { libraryPath, runtimeVersion, source: 'embedded-native' };
      }
    }

    fs.copyFileSync(bundledPath, temporaryPath);
    fs.renameSync(temporaryPath, libraryPath);
    return { libraryPath, runtimeVersion, source: 'embedded-native' };
  }

  resolveInstalledLibrary() {
    const managedPath = this.getManagedLibraryPath();
    if (fs.existsSync(managedPath)) {
      return { libraryPath: managedPath, source: 'managed-native' };
    }

    const embedded = this.extractBundledLibrary();
    if (embedded) {
      return embedded;
    }

    return { libraryPath: managedPath, source: 'missing' };
  }

  getStatus() {
    const resolved = this.resolveInstalledLibrary();
    const exists = resolved.source !== 'missing';
    return {
      abiVersion: this.abiVersion,
      exists,
      libraryPath: resolved.libraryPath,
      ready: exists,
      runtimeVersion: resolved.runtimeVersion || this.runtimeVersion,
      singBoxVersion: this.singBoxVersion,
      source: resolved.source
    };
  }

  buildReleaseDownloadUrl(assetName) {
    const tag = this.runtimeVersion.startsWith('v') ? this.runtimeVersion : `v${this.runtimeVersion}`;
    return `${RELEASE_DOWNLOAD_BASE_URL}/${tag}/${assetName}`;
  }

  async downloadBuffer(assetName) {
    const response = await this.fetch(this.buildReleaseDownloadUrl(assetName), {
      headers: {
        Accept: 'application/octet-stream',
        'User-Agent': 'leme-hub'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`Failed to download native sing-box asset ${assetName}: ${response.status} ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  parseChecksums(content) {
    return new Map(String(content)
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/u);
        if (!match) {
          throw new Error(`Invalid native checksum entry: ${line}`);
        }
        return [match[2], match[1].toLowerCase()];
      }));
  }

  verifyBuffer(buffer, expectedDigest) {
    const actualDigest = crypto.createHash('sha256').update(buffer).digest('hex');
    if (actualDigest !== normalizeDigest(expectedDigest)) {
      throw new Error('Downloaded native sing-box library failed checksum verification');
    }
  }

  async installManagedLibrary() {
    const assetName = this.getAssetName();
    const [libraryBuffer, checksumsBuffer] = await Promise.all([
      this.downloadBuffer(assetName),
      this.downloadBuffer('checksums.txt')
    ]);
    const checksums = this.parseChecksums(checksumsBuffer.toString('utf8'));
    const expectedDigest = checksums.get(assetName);
    if (!expectedDigest) {
      throw new Error(`Native release checksums do not contain ${assetName}`);
    }
    this.verifyBuffer(libraryBuffer, expectedDigest);

    const installDir = this.getInstallDir();
    const libraryPath = this.getManagedLibraryPath();
    const temporaryPath = `${libraryPath}.tmp`;
    ensureDir(installDir);
    fs.writeFileSync(temporaryPath, libraryBuffer);
    fs.renameSync(temporaryPath, libraryPath);

    return {
      abiVersion: this.abiVersion,
      installed: true,
      libraryPath,
      runtimeVersion: this.runtimeVersion,
      singBoxVersion: this.singBoxVersion,
      source: 'managed-native'
    };
  }

  async ensureAvailable() {
    const status = this.getStatus();
    if (status.exists) {
      return {
        ...status,
        installed: false
      };
    }
    throw new Error('Embedded native sing-box library is missing from this build');
  }
}