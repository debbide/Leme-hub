import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import process from 'process';

const repository = 'debbide/leme-singbox-native';
const projectRoot = process.cwd();
const requestedTargets = String(process.env.LEME_NATIVE_TARGETS || `${process.platform}-${process.arch}`)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const assetMap = {
  'win32-x64': {
    assetName: 'leme-singbox-win32-x64.dll',
    installedName: 'leme-singbox.dll'
  },
  'linux-x64': {
    assetName: 'libleme-singbox-linux-x64.so',
    installedName: 'libleme-singbox.so'
  },
  'linux-arm64': {
    assetName: 'libleme-singbox-linux-arm64.so',
    installedName: 'libleme-singbox.so'
  }
};

const request = async (url) => {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'leme-hub-build'
    },
    redirect: 'follow'
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} (${url})`);
  }
  return response;
};

const releaseResponse = await request(`https://api.github.com/repos/${repository}/releases/latest`);
const release = await releaseResponse.json();
const checksumAsset = release.assets.find((asset) => asset.name === 'checksums.txt');
if (!checksumAsset) {
  throw new Error(`Release ${release.tag_name} does not contain checksums.txt`);
}

const checksumResponse = await request(checksumAsset.browser_download_url);
const checksumText = await checksumResponse.text();
const checksums = new Map(checksumText
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/u);
    if (!match) {
      throw new Error(`Invalid checksum line: ${line}`);
    }
    return [match[2], match[1].toLowerCase()];
  }));

const runtimeVersion = String(release.tag_name || '').replace(/^v/u, '');
if (!runtimeVersion) {
  throw new Error('Latest native release has no valid tag');
}

const prepared = [];
for (const target of requestedTargets) {
  const definition = assetMap[target];
  if (!definition) {
    throw new Error(`Unsupported native target: ${target}`);
  }

  const asset = release.assets.find((candidate) => candidate.name === definition.assetName);
  if (!asset) {
    throw new Error(`Release ${release.tag_name} does not contain ${definition.assetName}`);
  }
  const expectedDigest = checksums.get(definition.assetName);
  if (!expectedDigest) {
    throw new Error(`checksums.txt does not contain ${definition.assetName}`);
  }

  const response = await request(asset.browser_download_url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const actualDigest = crypto.createHash('sha256').update(buffer).digest('hex');
  if (actualDigest !== expectedDigest) {
    throw new Error(`Checksum verification failed for ${definition.assetName}`);
  }

  const destinationDir = path.join(projectRoot, 'native-assets', runtimeVersion, target);
  const destinationPath = path.join(destinationDir, definition.installedName);
  fs.mkdirSync(destinationDir, { recursive: true });
  fs.writeFileSync(destinationPath, buffer);
  prepared.push({ asset: definition.assetName, destinationPath, target });
}

fs.mkdirSync(path.join(projectRoot, 'native-assets'), { recursive: true });
fs.writeFileSync(path.join(projectRoot, 'native-assets', 'manifest.json'), JSON.stringify({
  releaseTag: release.tag_name,
  runtimeVersion,
  targets: prepared
}, null, 2) + '\n');

console.log(JSON.stringify({ releaseTag: release.tag_name, runtimeVersion, prepared }, null, 2));