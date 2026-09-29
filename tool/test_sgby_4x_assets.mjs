import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  animationGraphicIds,
  parseLibrary,
  staticGraphicIds,
} from './generate_sgby_4x_assets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = parseLibrary(fs.readFileSync(path.join(
  root,
  'assets/games/sgby/libs/SGBY-Reset.lib',
)));
const outputBuffer = fs.readFileSync(path.join(
  root,
  'assets/games/sgby/libs/SGBY-Reset-4X.lib',
));
const output = parseLibrary(outputBuffer);

assert.equal(source.slotCount, output.slotCount);
assert.equal(source.entries[17].special, 2);
assert.equal(output.entries[17].special, 4);
assert.ok(outputBuffer.length > 2_000_000 && outputBuffer.length < 3_000_000);

let changedGraphics = 0;
for (let id = 1; id <= source.slotCount; id += 1) {
  const before = source.entries[id];
  const after = output.entries[id];
  if (!before || before.special !== undefined) continue;
  assert.ok(after?.raw, `缺少资源${id}`);
  if (!staticGraphicIds.has(id) && !animationGraphicIds.has(id)) {
    assert.deepEqual(after.raw, before.raw, `非图形资源${id}被修改`);
    continue;
  }
  changedGraphics += 1;
  assert.ok(after.resourceLength > before.resourceLength);
}
assert.equal(changedGraphics, 56);

for (const id of staticGraphicIds) {
  const before = source.entries[id].raw.subarray(14);
  const after = output.entries[id].raw.subarray(14);
  assert.equal(after.readUInt16LE(0), before.readUInt16LE(0) * 2);
  assert.equal(after.readUInt16LE(2), before.readUInt16LE(2) * 2);
  assert.equal(after.readUInt16LE(4), before.readUInt16LE(4));
  assert.equal(after[6], before[6]);
}

for (const id of animationGraphicIds) {
  const before = source.entries[id].raw.subarray(14);
  const after = output.entries[id].raw.subarray(14);
  const metadataLength = 6 + before[2] * 5;
  assert.deepEqual(after.subarray(0, metadataLength), before.subarray(0, metadataLength));
  assert.equal(after.readUInt16LE(metadataLength), before.readUInt16LE(metadataLength) * 2);
  assert.equal(after.readUInt16LE(metadataLength + 2), before.readUInt16LE(metadataLength + 2) * 2);
}

assert.deepEqual(output.entries[77].raw, source.entries[77].raw);
console.log('三国霸业4X资源校验通过');
