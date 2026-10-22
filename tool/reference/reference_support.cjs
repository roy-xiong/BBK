const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

/** 采集前校验旧仓库的固定版本；防止新金图掩盖来源变更。 */
async function verifySource(projectRoot, sourceRoot) {
  const manifest = JSON.parse(await fs.readFile(path.join(projectRoot, 'tool/baseline/source_manifest.json')));
  const repository = path.resolve(sourceRoot, '../..');
  for (const file of manifest.files) {
    const bytes = await fs.readFile(path.join(repository, file.path));
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
      throw new Error('参考文件版本变化，停止覆盖金图：' + file.path);
    }
  }
}

function crc32(bytes) {
  let result = 0xffffffff;
  for (const byte of bytes) {
    result ^= byte;
    for (let i = 0; i < 8; i++) result = (result >>> 1) ^ (result & 1 ? 0xedb88320 : 0);
  }
  return (result ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const kind = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([kind, data])));
  return Buffer.concat([size, kind, data, crc]);
}
/** PNG始终从参与像素比较的同一份RGBA生成，避免截图时动画已走到下一帧。 */
async function refreshPngs(directory) {
  for (const file of await fs.readdir(directory)) {
    if (!file.endsWith('.rgba.gz')) continue;
    const raw = zlib.gunzipSync(await fs.readFile(path.join(directory, file)));
    const width = 960, height = 576;
    if (raw.length !== width * height * 4) throw new Error('Invalid RGBA size: ' + file);
    const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
    header[8] = 8; header[9] = 6;
    const rows = [];
    for (let y = 0; y < height; y++) rows.push(Buffer.from([0]), raw.subarray(y * width * 4, (y + 1) * width * 4));
    await fs.writeFile(path.join(directory, file.replace('.rgba.gz', '.png')), Buffer.concat([
      Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header),
      chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0)),
    ]));
  }
}
module.exports = { verifySource, refreshPngs };
