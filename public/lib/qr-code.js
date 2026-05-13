const TOTAL_CODEWORDS = [
  0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346,
  404, 466, 532, 581, 655, 733, 815, 901, 991, 1085,
  1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185,
  2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706
];

const ECC_CODEWORDS_PER_BLOCK_LOW = [
  0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18,
  20, 24, 26, 30, 22, 24, 28, 30, 28, 28,
  28, 28, 30, 30, 26, 28, 30, 30, 30, 30,
  30, 30, 30, 30, 30, 30, 30, 30, 30, 30
];

const ERROR_CORRECTION_BLOCKS_LOW = [
  0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4,
  4, 4, 4, 4, 6, 6, 6, 6, 7, 8,
  8, 9, 9, 10, 12, 12, 12, 13, 14, 15,
  16, 17, 18, 19, 19, 20, 21, 22, 24, 25
];

const BYTE_MODE = 0b0100;
const FORMAT_ECL_LOW = 1;
const PAD_CODEWORDS = [0xec, 0x11];

const cloneModules = (modules) => modules.map((row) => row.slice());

const appendBits = (bits, value, length) => {
  for (let i = length - 1; i >= 0; i -= 1) {
    bits.push((value >>> i) & 1);
  }
};

const getByteCountBits = (version) => (version <= 9 ? 8 : 16);

const getAlignmentPositions = (version) => {
  if (version === 1) {
    return [];
  }

  const size = version * 4 + 17;
  const count = Math.floor(version / 7) + 2;
  const step = version === 32
    ? 26
    : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const positions = [6];
  for (let pos = size - 7; positions.length < count; pos -= step) {
    positions.splice(1, 0, pos);
  }
  return positions;
};

const getDataCodewordCount = (version) =>
  TOTAL_CODEWORDS[version]
  - ECC_CODEWORDS_PER_BLOCK_LOW[version] * ERROR_CORRECTION_BLOCKS_LOW[version];

const encodeTextBytes = (text) => new TextEncoder().encode(String(text ?? ''));

const chooseVersion = (bytes, minVersion = 1, maxVersion = 40) => {
  for (let version = minVersion; version <= maxVersion; version += 1) {
    const countBits = getByteCountBits(version);
    if (bytes.length >= (1 << countBits)) {
      continue;
    }

    const capacityBits = getDataCodewordCount(version) * 8;
    const usedBits = 4 + countBits + bytes.length * 8;
    if (usedBits <= capacityBits) {
      return version;
    }
  }

  throw new Error('分享链接太长，无法生成二维码');
};

const createDataCodewords = (bytes, version) => {
  const capacityBits = getDataCodewordCount(version) * 8;
  const bits = [];
  appendBits(bits, BYTE_MODE, 4);
  appendBits(bits, bytes.length, getByteCountBits(version));
  for (const byte of bytes) {
    appendBits(bits, byte, 8);
  }

  if (bits.length > capacityBits) {
    throw new Error('分享链接太长，无法生成二维码');
  }

  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const dataCodewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j += 1) {
      value = (value << 1) | bits[i + j];
    }
    dataCodewords.push(value);
  }

  for (let i = 0; dataCodewords.length < getDataCodewordCount(version); i += 1) {
    dataCodewords.push(PAD_CODEWORDS[i % 2]);
  }

  return dataCodewords;
};

const gfMultiply = (left, right) => {
  let x = left;
  let y = right;
  let result = 0;

  while (y !== 0) {
    if ((y & 1) !== 0) {
      result ^= x;
    }
    x <<= 1;
    if ((x & 0x100) !== 0) {
      x ^= 0x11d;
    }
    y >>>= 1;
  }

  return result & 0xff;
};

const reedSolomonDivisor = (degree) => {
  const result = Array(degree).fill(0);
  result[degree - 1] = 1;

  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) {
        result[j] ^= result[j + 1];
      }
    }
    root = gfMultiply(root, 0x02);
  }

  return result;
};

const reedSolomonRemainder = (data, divisor) => {
  const result = Array(divisor.length).fill(0);

  for (const byte of data) {
    const factor = byte ^ result.shift();
    result.push(0);
    for (let i = 0; i < result.length; i += 1) {
      result[i] ^= gfMultiply(divisor[i], factor);
    }
  }

  return result;
};

const addEccAndInterleave = (dataCodewords, version) => {
  const rawCodewords = TOTAL_CODEWORDS[version];
  const blockEccLength = ECC_CODEWORDS_PER_BLOCK_LOW[version];
  const blockCount = ERROR_CORRECTION_BLOCKS_LOW[version];
  const shortBlockCount = blockCount - (rawCodewords % blockCount);
  const shortBlockLength = Math.floor(rawCodewords / blockCount);
  const shortDataLength = shortBlockLength - blockEccLength;
  const divisor = reedSolomonDivisor(blockEccLength);
  const blocks = [];
  let offset = 0;

  for (let i = 0; i < blockCount; i += 1) {
    const dataLength = shortDataLength + (i < shortBlockCount ? 0 : 1);
    const data = dataCodewords.slice(offset, offset + dataLength);
    offset += dataLength;

    const ecc = reedSolomonRemainder(data, divisor);
    if (i < shortBlockCount) {
      data.push(0);
    }
    blocks.push(data.concat(ecc));
  }

  const result = [];
  for (let i = 0; i < blocks[0].length; i += 1) {
    for (let j = 0; j < blocks.length; j += 1) {
      if (i === shortDataLength && j < shortBlockCount) {
        continue;
      }
      if (i < blocks[j].length) {
        result.push(blocks[j][i]);
      }
    }
  }

  return result;
};

const setFunctionModule = (modules, functionModules, x, y, isBlack) => {
  modules[y][x] = Boolean(isBlack);
  functionModules[y][x] = true;
};

const drawFinderPattern = (modules, functionModules, centerX, centerY) => {
  const size = modules.length;
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const x = centerX + dx;
      const y = centerY + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) {
        continue;
      }
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setFunctionModule(modules, functionModules, x, y, distance !== 2 && distance !== 4);
    }
  }
};

const drawAlignmentPattern = (modules, functionModules, centerX, centerY) => {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setFunctionModule(modules, functionModules, centerX + dx, centerY + dy, distance !== 1);
    }
  }
};

const setFormatModule = (modules, functionModules, x, y, isBlack, markFunction) => {
  modules[y][x] = Boolean(isBlack);
  if (markFunction) {
    functionModules[y][x] = true;
  }
};

const drawFormatBits = (modules, functionModules, mask, markFunction = true) => {
  const size = modules.length;
  const data = (FORMAT_ECL_LOW << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) * 0x537);
  }
  const bits = ((data << 10) | remainder) ^ 0x5412;
  const bit = (index) => ((bits >>> index) & 1) !== 0;

  for (let i = 0; i <= 5; i += 1) {
    setFormatModule(modules, functionModules, 8, i, bit(i), markFunction);
  }
  setFormatModule(modules, functionModules, 8, 7, bit(6), markFunction);
  setFormatModule(modules, functionModules, 8, 8, bit(7), markFunction);
  setFormatModule(modules, functionModules, 7, 8, bit(8), markFunction);
  for (let i = 9; i < 15; i += 1) {
    setFormatModule(modules, functionModules, 14 - i, 8, bit(i), markFunction);
  }
  for (let i = 0; i < 8; i += 1) {
    setFormatModule(modules, functionModules, size - 1 - i, 8, bit(i), markFunction);
  }
  for (let i = 8; i < 15; i += 1) {
    setFormatModule(modules, functionModules, 8, size - 15 + i, bit(i), markFunction);
  }
  setFormatModule(modules, functionModules, 8, size - 8, true, markFunction);
};

const drawVersionInfo = (modules, functionModules, version) => {
  if (version < 7) {
    return;
  }

  const size = modules.length;
  let remainder = version;
  for (let i = 0; i < 12; i += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 11) & 1) * 0x1f25);
  }
  const bits = (version << 12) | remainder;

  for (let i = 0; i < 18; i += 1) {
    const isBlack = ((bits >>> i) & 1) !== 0;
    const x = size - 11 + (i % 3);
    const y = Math.floor(i / 3);
    setFunctionModule(modules, functionModules, x, y, isBlack);
    setFunctionModule(modules, functionModules, y, x, isBlack);
  }
};

const drawFunctionPatterns = (modules, functionModules, version) => {
  const size = modules.length;
  drawFinderPattern(modules, functionModules, 3, 3);
  drawFinderPattern(modules, functionModules, size - 4, 3);
  drawFinderPattern(modules, functionModules, 3, size - 4);

  for (let i = 0; i < size; i += 1) {
    if (!functionModules[6][i]) {
      setFunctionModule(modules, functionModules, i, 6, i % 2 === 0);
    }
    if (!functionModules[i][6]) {
      setFunctionModule(modules, functionModules, 6, i, i % 2 === 0);
    }
  }

  const alignmentPositions = getAlignmentPositions(version);
  for (const y of alignmentPositions) {
    for (const x of alignmentPositions) {
      const overlapsTopLeft = x === 6 && y === 6;
      const overlapsTopRight = x === size - 7 && y === 6;
      const overlapsBottomLeft = x === 6 && y === size - 7;
      if (!overlapsTopLeft && !overlapsTopRight && !overlapsBottomLeft) {
        drawAlignmentPattern(modules, functionModules, x, y);
      }
    }
  }

  setFunctionModule(modules, functionModules, 8, size - 8, true);
  drawFormatBits(modules, functionModules, 0);
  drawVersionInfo(modules, functionModules, version);
};

const drawCodewords = (modules, functionModules, codewords) => {
  const size = modules.length;
  let bitIndex = 0;
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right = 5;
    }

    for (let vertical = 0; vertical < size; vertical += 1) {
      const y = upward ? size - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        if (functionModules[y][x]) {
          continue;
        }

        const byteIndex = bitIndex >>> 3;
        const bitOffset = 7 - (bitIndex & 7);
        modules[y][x] = byteIndex < codewords.length
          ? ((codewords[byteIndex] >>> bitOffset) & 1) !== 0
          : false;
        bitIndex += 1;
      }
    }

    upward = !upward;
  }
};

const getMaskBit = (mask, x, y) => {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: throw new Error('Invalid QR mask');
  }
};

const applyMask = (modules, functionModules, mask) => {
  for (let y = 0; y < modules.length; y += 1) {
    for (let x = 0; x < modules.length; x += 1) {
      if (!functionModules[y][x] && getMaskBit(mask, x, y)) {
        modules[y][x] = !modules[y][x];
      }
    }
  }
};

const countRunPenalty = (modules, vertical) => {
  const size = modules.length;
  let penalty = 0;

  for (let outer = 0; outer < size; outer += 1) {
    let runColor = false;
    let runLength = 0;
    for (let inner = 0; inner < size; inner += 1) {
      const color = vertical ? modules[inner][outer] : modules[outer][inner];
      if (inner === 0 || color !== runColor) {
        if (runLength >= 5) {
          penalty += runLength - 2;
        }
        runColor = color;
        runLength = 1;
      } else {
        runLength += 1;
      }
    }
    if (runLength >= 5) {
      penalty += runLength - 2;
    }
  }

  return penalty;
};

const hasFinderLikePattern = (values) => {
  const pattern = [true, false, true, true, true, false, true, false, false, false, false];
  const reverse = [false, false, false, false, true, false, true, true, true, false, true];
  return pattern.every((value, index) => values[index] === value)
    || reverse.every((value, index) => values[index] === value);
};

const getPenaltyScore = (modules) => {
  const size = modules.length;
  let penalty = countRunPenalty(modules, false) + countRunPenalty(modules, true);

  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const color = modules[y][x];
      if (color === modules[y][x + 1]
        && color === modules[y + 1][x]
        && color === modules[y + 1][x + 1]) {
        penalty += 3;
      }
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x <= size - 11; x += 1) {
      if (hasFinderLikePattern(modules[y].slice(x, x + 11))) {
        penalty += 40;
      }
    }
  }
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y <= size - 11; y += 1) {
      const values = [];
      for (let i = 0; i < 11; i += 1) {
        values.push(modules[y + i][x]);
      }
      if (hasFinderLikePattern(values)) {
        penalty += 40;
      }
    }
  }

  let black = 0;
  for (const row of modules) {
    for (const value of row) {
      if (value) {
        black += 1;
      }
    }
  }
  const total = size * size;
  penalty += Math.floor(Math.abs((black * 100) / total - 50) / 5) * 10;

  return penalty;
};

export const createQrMatrix = (text, options = {}) => {
  const bytes = encodeTextBytes(text);
  const version = chooseVersion(bytes, options.minVersion || 1, options.maxVersion || 40);
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => Array(size).fill(false));
  const functionModules = Array.from({ length: size }, () => Array(size).fill(false));

  drawFunctionPatterns(modules, functionModules, version);
  drawCodewords(modules, functionModules, addEccAndInterleave(createDataCodewords(bytes, version), version));

  const unmaskedModules = cloneModules(modules);
  let bestModules = null;
  let bestMask = 0;
  let bestPenalty = Number.POSITIVE_INFINITY;

  for (let mask = 0; mask < 8; mask += 1) {
    const trial = cloneModules(unmaskedModules);
    applyMask(trial, functionModules, mask);
    drawFormatBits(trial, functionModules, mask, false);
    const penalty = getPenaltyScore(trial);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
      bestModules = trial;
    }
  }

  return {
    version,
    size,
    mask: bestMask,
    modules: bestModules
  };
};

export const renderQrCodeToCanvas = (canvas, text, options = {}) => {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new Error('二维码画布不可用');
  }

  const qr = createQrMatrix(text, options);
  const margin = Number.isFinite(options.margin) ? Math.max(0, Math.floor(options.margin)) : 4;
  const maxSize = Number.isFinite(options.maxSize) ? Math.max(180, Math.floor(options.maxSize)) : 320;
  const fullModuleSize = qr.size + margin * 2;
  const scale = Math.max(1, Math.floor(maxSize / fullModuleSize));
  const pixelSize = fullModuleSize * scale;
  const context = canvas.getContext('2d');

  canvas.width = pixelSize;
  canvas.height = pixelSize;
  context.fillStyle = options.background || '#ffffff';
  context.fillRect(0, 0, pixelSize, pixelSize);
  context.fillStyle = options.foreground || '#111827';
  for (let y = 0; y < qr.size; y += 1) {
    for (let x = 0; x < qr.size; x += 1) {
      if (qr.modules[y][x]) {
        context.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale);
      }
    }
  }

  return qr;
};
