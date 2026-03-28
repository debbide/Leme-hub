import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const JimpModule = require('jimp');
const Jimp = JimpModule.Jimp || JimpModule.default || JimpModule;
const pngToIco = require('png-to-ico');

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
const resourcesDir = path.join(projectRoot, 'desktop', 'resources');
const sourcePath = fs.existsSync(path.join(projectRoot, 'app_icon.png'))
  ? path.join(projectRoot, 'app_icon.png')
  : path.join(resourcesDir, 'icon.png');
const pngPath = path.join(resourcesDir, 'icon.png');
const icoPath = path.join(resourcesDir, 'icon.ico');

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing icon source: ${sourcePath}`);
}

const image = await Jimp.read(sourcePath);
await image.resize({ w: 1024, h: 1024 }).write(pngPath);
const icoBuffer = await pngToIco(pngPath);
fs.writeFileSync(icoPath, icoBuffer);
console.log(`Prepared desktop icons: ${path.relative(projectRoot, sourcePath)} -> ${path.relative(projectRoot, pngPath)} + ${path.relative(projectRoot, icoPath)}`);
