import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const defaultSource = path.join(
  projectRoot,
  'assets/games/sgby/libs/SGBY-Reset.lib',
);
const defaultOutput = path.join(
  projectRoot,
  'assets/games/sgby/libs/SGBY-Reset-4X.lib',
);

/** 精修版内需要从2X提升至4X的静态图片资源。 */
export const staticGraphicIds = new Set([
  4, 5, 7, 8, 9, 15, 16, 26, 28, 29, 30, 31, 32, 33, 34,
  44, 45, 46, 47, 48, 49, 50, 51, 54, 55, 56, 69, 75, 76,
]);

/** 精修版内需要从2X提升至4X的动画和特效资源。 */
export const animationGraphicIds = new Set([
  3, 6, 19, 20, 21, 22, 23, 24, 25, 27, 35, 36, 37, 38, 39,
  40, 41, 42, 43, 100, 101, 102, 103, 104, 105, 106, 107,
]);

/**
 * 解析LIB资源表，并保留资源17的倍率魔数等特殊索引值。
 *
 * @param {Buffer} buffer 完整资源库。
 * @return {{slotCount:number, entries:Array<Object|null>}} 资源表。
 */
export function parseLibrary(buffer) {
  const tableBytes = buffer.readUInt32LE(0);
  if (tableBytes <= 0 || tableBytes % 4 !== 0 || tableBytes > buffer.length) {
    throw new Error('LIB资源索引无效');
  }
  const slotCount = tableBytes / 4;
  const entries = new Array(slotCount + 1).fill(null);
  for (let id = 1; id <= slotCount; id += 1) {
    const offset = buffer.readUInt32LE((id - 1) * 4);
    if (offset === 0xffffffff) continue;
    if (offset + 14 > buffer.length) {
      entries[id] = {id, special: offset};
      continue;
    }
    const resourceLength = buffer.readUInt32LE(offset);
    const resourceId = buffer.readUInt16LE(offset + 4);
    if (
      resourceId !== id || resourceLength < 14 ||
      offset + resourceLength > buffer.length
    ) {
      entries[id] = {id, special: offset};
      continue;
    }
    entries[id] = {
      id,
      resourceLength,
      itemCount: buffer.readUInt16LE(offset + 6),
      itemLength: buffer.readUInt32LE(offset + 8),
      raw: Buffer.from(buffer.subarray(offset, offset + resourceLength)),
    };
  }
  return {slotCount, entries};
}

/**
 * 解码一张按行对齐的1bpp图片平面。
 *
 * @param {Buffer} source 图片组正文。
 * @param {number} offset 平面起点。
 * @param {number} width 宽度。
 * @param {number} height 高度。
 * @return {Uint8Array} 逐像素二值数据。
 */
function decodePlane(source, offset, width, height) {
  const stride = Math.ceil(width / 8);
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = source[offset + y * stride + Math.floor(x / 8)];
      pixels[y * width + x] = (value >> (7 - (x % 8))) & 1;
    }
  }
  return pixels;
}

/**
 * 使用Scale2x根据上下左右邻域补齐斜线和拐角。
 *
 * @param {Uint8Array} source 原像素。
 * @param {number} width 原宽度。
 * @param {number} height 原高度。
 * @return {Uint8Array} 宽高各两倍的像素。
 */
export function scale2x(source, width, height) {
  const outputWidth = width * 2;
  const output = new Uint8Array(outputWidth * height * 2);
  const pixel = (x, y) => source[
    Math.max(0, Math.min(height - 1, y)) * width +
    Math.max(0, Math.min(width - 1, x))
  ];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const top = pixel(x, y - 1);
      const left = pixel(x - 1, y);
      const center = pixel(x, y);
      const right = pixel(x + 1, y);
      const bottom = pixel(x, y + 1);
      let p0 = center;
      let p1 = center;
      let p2 = center;
      let p3 = center;
      if (top !== bottom && left !== right) {
        p0 = left === top ? left : center;
        p1 = top === right ? right : center;
        p2 = left === bottom ? left : center;
        p3 = bottom === right ? right : center;
      }
      const outputOffset = y * 2 * outputWidth + x * 2;
      output[outputOffset] = p0;
      output[outputOffset + 1] = p1;
      output[outputOffset + outputWidth] = p2;
      output[outputOffset + outputWidth + 1] = p3;
    }
  }
  return output;
}

/** 编码行对齐1bpp图片平面。 */
function encodePlane(pixels, width, height) {
  const stride = Math.ceil(width / 8);
  const output = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[y * width + x]) {
        output[y * stride + Math.floor(x / 8)] |= 1 << (7 - (x % 8));
      }
    }
  }
  return output;
}

/** 将一个PictureHeadType图片组从2X细化到4X。 */
function scalePictureGroup(source) {
  if (source.length < 7) throw new Error('图片组头长度不足');
  const width = source.readUInt16LE(0);
  const height = source.readUInt16LE(2);
  const count = source.readUInt16LE(4);
  const mask = source[6];
  const planes = (mask & 1) + 1;
  const planeLength = Math.ceil(width / 8) * height;
  const consumed = 7 + planeLength * planes * count;
  if (!width || !height || !count || consumed > source.length) {
    throw new Error(`图片组无效：${width}x${height}，数量${count}`);
  }
  const outputWidth = width * 2;
  const outputHeight = height * 2;
  const header = Buffer.alloc(7);
  header.writeUInt16LE(outputWidth, 0);
  header.writeUInt16LE(outputHeight, 2);
  header.writeUInt16LE(count, 4);
  header[6] = mask;
  const chunks = [header];
  for (let image = 0; image < count; image += 1) {
    for (let plane = 0; plane < planes; plane += 1) {
      const planeOffset = 7 + (image * planes + plane) * planeLength;
      const decoded = decodePlane(source, planeOffset, width, height);
      chunks.push(encodePlane(scale2x(decoded, width, height), outputWidth, outputHeight));
    }
  }
  return {buffer: Buffer.concat(chunks), consumed, pictureCount: count};
}

/** 将动画资源内全部图片从2X细化到4X，帧元数据保持原样。 */
function scaleAnimation(source) {
  const frameCount = source[2];
  const pictureCount = source[3];
  const metadataLength = 6 + frameCount * 5;
  if (metadataLength > source.length) throw new Error('动画帧元数据越界');
  const chunks = [Buffer.from(source.subarray(0, metadataLength))];
  let offset = metadataLength;
  let totalPictures = 0;
  for (let index = 0; index < pictureCount; index += 1) {
    const scaled = scalePictureGroup(source.subarray(offset));
    chunks.push(scaled.buffer);
    offset += scaled.consumed;
    totalPictures += scaled.pictureCount;
  }
  if (offset !== source.length) {
    throw new Error(`动画正文未完全解析：${offset}/${source.length}`);
  }
  return {buffer: Buffer.concat(chunks), pictureCount: totalPictures};
}

/** 细化一条图形资源并重写资源头长度。 */
function scaleGraphicResource(entry, animation) {
  if (entry.itemCount !== 1 || entry.itemLength !== entry.resourceLength - 14) {
    throw new Error(`资源${entry.id}不是单条定长图形资源`);
  }
  const body = entry.raw.subarray(14);
  const scaled = animation ? scaleAnimation(body) : scalePictureGroup(body);
  if (!animation && scaled.consumed !== body.length) {
    throw new Error(`静态资源${entry.id}未完全解析`);
  }
  const header = Buffer.from(entry.raw.subarray(0, 14));
  header.writeUInt32LE(14 + scaled.buffer.length, 0);
  header.writeUInt32LE(scaled.buffer.length, 8);
  return {
    raw: Buffer.concat([header, scaled.buffer]),
    pictureCount: scaled.pictureCount,
  };
}

/**
 * 生成4X精修库。除图形资源和倍率魔数外，其余资源逐字节保留。
 */
export function generateLibrary(sourcePath, outputPath) {
  const source = fs.readFileSync(sourcePath);
  const parsed = parseLibrary(source);
  const table = Buffer.alloc(parsed.slotCount * 4, 0xff);
  const chunks = [table];
  let outputOffset = table.length;
  let graphicResourceCount = 0;
  let pictureCount = 0;
  for (let id = 1; id <= parsed.slotCount; id += 1) {
    const entry = parsed.entries[id];
    if (!entry) continue;
    if (entry.special !== undefined) {
      table.writeUInt32LE(id === 17 ? 4 : entry.special, (id - 1) * 4);
      continue;
    }
    let raw = entry.raw;
    if (staticGraphicIds.has(id) || animationGraphicIds.has(id)) {
      const scaled = scaleGraphicResource(entry, animationGraphicIds.has(id));
      raw = scaled.raw;
      graphicResourceCount += 1;
      pictureCount += scaled.pictureCount;
    }
    table.writeUInt32LE(outputOffset, (id - 1) * 4);
    chunks.push(raw);
    outputOffset += raw.length;
  }
  const output = Buffer.concat(chunks);
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, output);
  return {
    sourcePath,
    outputPath,
    sourceBytes: source.length,
    outputBytes: output.length,
    sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
    outputSha256: crypto.createHash('sha256').update(output).digest('hex'),
    graphicResourceCount,
    pictureCount,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourcePath = path.resolve(process.argv[2] || defaultSource);
  const outputPath = path.resolve(process.argv[3] || defaultOutput);
  console.log(JSON.stringify(generateLibrary(sourcePath, outputPath), null, 2));
}
