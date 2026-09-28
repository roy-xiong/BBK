import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, '..');
const inputPath = process.argv[2] ?? path.join(
  projectDirectory,
  'assets',
  'games',
  'fmj',
  'rom',
  'rom.js',
);
const outputPath = process.argv[3] ?? path.join(
  projectDirectory,
  'assets',
  'games',
  'fmj',
  'world-map.json',
);

const input = fs.readFileSync(inputPath);
const buffer = inputPath.endsWith('.js')
  ? Buffer.from(
      input
        .toString('utf8')
        .match(/fmj\.rom\["DAT\.LIB"\]\s*=\s*"([0-9A-F]+)"/)?.[1] ?? '',
      'hex',
    )
  : input;
if (buffer.length === 0) {
  throw new Error(`DAT.LIB data not found in ${inputPath}`);
}
const decoder = new TextDecoder('gbk');

function readUInt16(offset) {
  return buffer[offset] | (buffer[offset + 1] << 8);
}

function cStringLength(data, offset) {
  let length = 0;
  while (offset + length < data.length && data[offset + length] !== 0) {
    length += 1;
  }
  return length + 1;
}

const resources = [];
let headerOffset = 0x10;
let pointerOffset = 0x2000;
while (headerOffset < buffer.length && buffer[headerOffset] !== 0xff) {
  const resourceType = buffer[headerOffset++];
  const type = buffer[headerOffset++];
  const index = buffer[headerOffset++];
  const block = buffer[pointerOffset++];
  const low = buffer[pointerOffset++];
  const high = buffer[pointerOffset++];
  resources.push({
    resourceType,
    type,
    index,
    offset: block * 0x4000 + (high << 8) + low,
  });
}

const mapResources = resources.filter((resource) => resource.resourceType === 2);
const maps = mapResources.map((resource) => {
  let nameEnd = resource.offset + 3;
  while (nameEnd < buffer.length && buffer[nameEnd] !== 0) nameEnd += 1;
  return {
    id: `${resource.type}:${resource.index}`,
    type: resource.type,
    index: resource.index,
    name: decoder.decode(buffer.subarray(resource.offset + 3, nameEnd)),
    width: buffer[resource.offset + 0x10],
    height: buffer[resource.offset + 0x11],
  };
});
const mapIds = new Set(maps.map((map) => map.id));

const fixedLengths = new Map([
  [0, 4], [1, 8], [2, 6], [3, 2], [6, 6], [9, 0], [10, 2],
  [11, 4], [12, 4], [14, 4], [16, 4], [20, 0], [21, 6], [22, 4],
  [23, 4], [24, 2], [26, 2], [27, 2], [29, 4], [30, 10], [32, 8],
  [33, 2], [34, 4], [35, 22], [36, 0], [37, 0], [38, 8], [39, 30],
  [40, 2], [41, 4], [42, 4], [43, 4], [44, 6], [45, 0], [46, 4],
  [48, 6], [49, 4], [50, 4], [51, 2], [52, 0], [53, 6], [55, 0],
  [56, 0], [57, 6], [58, 10], [59, 6], [60, 6], [62, 8], [63, 4],
  [65, 6], [66, 4], [67, 8], [68, 0], [70, 0], [71, 0], [72, 0],
  [73, 4], [74, 0], [75, 0], [76, 4], [77, 10], [78, 2], [79, 2],
]);

function commandLength(code, opcode, start) {
  if (fixedLengths.has(opcode)) return fixedLengths.get(opcode);
  switch (opcode) {
    case 13:
      return 2 + cStringLength(code, start + 2);
    case 28:
    case 47:
    case 54:
      return cStringLength(code, start);
    case 31: {
      const firstLength = cStringLength(code, start);
      const secondLength = cStringLength(code, start + firstLength);
      return firstLength + secondLength + 2;
    }
    case 61:
      return 4 + cStringLength(code, start + 4);
    case 64:
      return 2 + cStringLength(code, start + 2);
    case 69:
      return 2 + cStringLength(code, start + 2);
    default:
      throw new Error(`Unsupported opcode ${opcode}`);
  }
}

function readGut(resource) {
  const length = readUInt16(resource.offset + 24);
  const eventCount = buffer[resource.offset + 26];
  const codeOffset = resource.offset + 27 + eventCount * 2;
  const codeLength = length - eventCount * 2 - 3;
  return buffer.subarray(codeOffset, codeOffset + codeLength);
}

const scripts = new Map();
for (const resource of resources.filter((item) => item.resourceType === 1)) {
  const code = readGut(resource);
  const loadMaps = [];
  const chapterCalls = [];
  let pointer = 0;
  while (pointer < code.length) {
    const opcode = code[pointer];
    const start = pointer + 1;
    if (opcode === 1) {
      loadMaps.push({
        pointer,
        id: `${code[start] | (code[start + 1] << 8)}:${code[start + 2] | (code[start + 3] << 8)}`,
      });
    } else if (opcode === 14 || opcode === 66) {
      chapterCalls.push({
        pointer,
        target: `${code[start] | (code[start + 1] << 8)}:${code[start + 2] | (code[start + 3] << 8)}`,
      });
    }
    pointer += commandLength(code, opcode, start) + 1;
  }
  scripts.set(`${resource.type}:${resource.index}`, { loadMaps, chapterCalls });
}

const edgeMap = new Map();
function addEdge(from, to, source) {
  if (!mapIds.has(from) || !mapIds.has(to) || from === to) return;
  const pair = [from, to].sort();
  const key = `${pair[0]}|${pair[1]}`;
  const edge = edgeMap.get(key) ?? { from: pair[0], to: pair[1], sources: [] };
  if (!edge.sources.includes(source)) edge.sources.push(source);
  edgeMap.set(key, edge);
}

for (const [scriptId, script] of scripts) {
  for (let index = 1; index < script.loadMaps.length; index += 1) {
    addEdge(script.loadMaps[index - 1].id, script.loadMaps[index].id, scriptId);
  }
  for (const chapterCall of script.chapterCalls) {
    const targetScript = scripts.get(chapterCall.target);
    const targetMap = targetScript?.loadMaps[0]?.id;
    const sourceMap = script.loadMaps
      .filter((loadMap) => loadMap.pointer < chapterCall.pointer)
      .at(-1)?.id ?? script.loadMaps[0]?.id;
    if (sourceMap && targetMap) addEdge(sourceMap, targetMap, scriptId);
  }
}

const payload = {
  version: 1,
  generatedFrom: path.relative(projectDirectory, inputPath),
  notes: 'Edges are inferred from loadmap order and chapter calls in original scripts.',
  maps,
  edges: [...edgeMap.values()],
};
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Generated ${maps.length} maps and ${payload.edges.length} edges at ${outputPath}`);
