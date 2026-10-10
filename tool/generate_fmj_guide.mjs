import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildWorldAtlas } from './build_fmj_world_atlas.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const game = path.join(root, 'assets/games/fmj');
const rom = fs.readFileSync(path.join(game, 'rom/rom.js'), 'utf8');
const binary = Buffer.from(rom.match(/fmj\.rom\["DAT\.LIB"\]\s*=\s*"([0-9A-F]+)"/)?.[1] ?? '', 'hex');
if (!binary.length) throw new Error('未找到伏魔记 DAT.LIB');
const decoder = new TextDecoder('gbk');
const string = (at) => decoder.decode(binary.subarray(at, binary.indexOf(0, at)));
const resources = [];
for (let h = 16, p = 8192; binary[h] !== 255; h += 3, p += 3) {
  resources.push({ kind: binary[h], type: binary[h + 1], index: binary[h + 2], offset: binary[p] * 16384 + binary.readUInt16LE(p + 1) });
}
const source = fs.readFileSync(path.join(root, 'tool/generate_fmj_world_map.mjs'), 'utf8');
// 复用原解析器的指令长度，避免两套资源格式出现漂移。
const fixed = new Function(source.match(/const fixedLengths = new Map\([\s\S]*?\);/)[0] + '\nreturn fixedLengths;')();
function cLength(code, at) {
  const end = code.indexOf(0, at);
  if (end < 0) throw new Error('剧情字符串没有结束标记');
  return end - at + 1;
}
function argumentLength(code, op, at) {
  if (fixed.has(op)) return fixed.get(op);
  if ([13, 64, 69].includes(op)) return 2 + cLength(code, at + 2);
  if ([28, 47, 54].includes(op)) return cLength(code, at);
  if (op === 61) return 4 + cLength(code, at + 4);
  if (op === 31) { const n = cLength(code, at); return n + cLength(code, at + n) + 2; }
  throw new Error(`无法解析指令 ${op}`);
}
const maps = resources.filter(r => r.kind === 2).map(r => {
  const width = binary[r.offset + 16], height = binary[r.offset + 17];
  return { id: `${r.type}:${r.index}`, name: string(r.offset + 3), type: r.type, index: r.index, width, height, tiles: binary[r.offset + 2], cells: Array.from({ length: width * height }, (_, i) => binary.readUInt16LE(r.offset + 18 + i * 2)) };
});
const tiles = resources.filter(r => r.kind === 7).map(r => {
  const width = binary[r.offset + 2], height = binary[r.offset + 3], count = binary[r.offset + 4], format = binary[r.offset + 5];
  if (width !== 16 || height !== 16 || format !== 1) throw new Error('地图图块格式与当前引擎不一致');
  return { id: r.index, width, height, count, hex: binary.subarray(r.offset + 6, r.offset + 6 + count * 32).toString('hex') };
});
const objects = resources.filter(r => r.kind === 3 && [2, 4].includes(r.type)).map(r => ({ id: `${r.type}:${r.index}`, name: string(r.offset + 9), sprite: binary[r.offset + 22], moving: r.type === 2 && binary[r.offset + 21] > 0 && [2,3].includes(binary[r.offset + 4]) }));
const scripts = resources.filter(r => r.kind === 1).map(r => {
  const count = binary[r.offset + 26], header = count * 2 + 3, length = binary.readUInt16LE(r.offset + 24);
  const events = Array.from({ length: count }, (_, i) => binary.readUInt16LE(r.offset + 27 + i * 2));
  const code = binary.subarray(r.offset + 24 + header, r.offset + 24 + length), commands = [];
  for (let p = 0; p < code.length;) {
    const op = code[p], at = p + 1, length = argumentLength(code, op, at), args = [];
    let text;
    if ([13, 61, 64, 69].includes(op)) {
      const prefix = op === 61 ? 4 : 2;
      for (let i = 0; i < prefix; i += 2) args.push(code.readUInt16LE(at + i));
      text = decoder.decode(code.subarray(at + prefix, code.indexOf(0, at + prefix)));
    } else if ([28, 47, 54].includes(op)) {
      if (op === 28) args.push(...code.subarray(at, code.indexOf(0, at)));
      else text = decoder.decode(code.subarray(at, code.indexOf(0, at)));
    } else if (op === 31) {
      const first = cLength(code, at), second = cLength(code, at + first);
      text = [decoder.decode(code.subarray(at, at + first - 1)), decoder.decode(code.subarray(at + first, at + first + second - 1))];
      args.push(code.readUInt16LE(at + first + second));
    } else {
      for (let i = 0; i < length; i += 2) args.push(code.readUInt16LE(at + i));
    }
    if (at + length > code.length) throw new Error('剧情指令越界');
    commands.push({ at: p + header, op, a: args, ...(text === undefined ? {} : { text }) });
    p += length + 1;
  }
  const addresses = new Set(commands.map(c => c.at));
  if (events.some(e => e && !addresses.has(e))) throw new Error('事件入口没有对应的指令');
  return { id: `${r.type}:${r.index}`, events, commands };
});
// 地图身份来自实际 loadmap → startchapter 组合，而不是相邻资源编号或加载顺序。
const incoming = new Map();
for (const script of scripts) {
  let map = null;
  for (const cmd of script.commands) {
    if (cmd.op === 1) {
      map = cmd.a.slice(0, 2).join(':');
    }
    if ([14, 66].includes(cmd.op) && map) {
      const id = cmd.a.slice(0, 2).join(':'), set = incoming.get(id) ?? new Set();
      set.add(map); incoming.set(id, set);
    }
  }
}
for (const script of scripts) {
  script.maps = [...(incoming.get(script.id) ?? [])];
  if (!script.maps.length) script.maps = [...new Set(script.commands.filter(c => c.op === 1).map(c => c.a.slice(0, 2).join(':')))];
  script.name = script.commands.find(c => c.op === 54)?.text ?? (script.id === '1:1' ? '开场' : `剧情 ${script.id}`);
}
const data = { version: 1, sha256: crypto.createHash('sha256').update(binary).digest('hex'), maps, tiles, objects, scripts };
data.world = buildWorldAtlas(data);
const js = `/* 此文件由 tool/generate_fmj_guide.mjs 从原始 ROM 生成。 */\nwindow.FmjGuideData=${JSON.stringify(data)};\n`;
fs.writeFileSync(path.join(game, 'js/guide-data.js'), js);
if (process.argv.includes('--export')) {
  const css = fs.readFileSync(path.join(game, 'guide.css'), 'utf8');
  const engine = fs.readFileSync(path.join(game, 'js/guide-engine.js'), 'utf8');
  const quests = fs.readFileSync(path.join(game, 'js/quest-engine.js'), 'utf8');
  const ui = fs.readFileSync(path.join(game, 'js/guide-ui.js'), 'utf8');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>伏魔记 · 游戏世界地图</title><style>${css}</style></head><body data-fmj-atlas="standalone"><script>${[js, engine, quests, ui].join('\n').replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
  for (const name of ['伏魔记-完整等比例地图.html','伏魔记-游戏世界地图.html']) {
    const file='/Users/xiongjian/Downloads/'+name;fs.writeFileSync(file,html);console.log(`已导出 ${file}`);
  }
}
console.log(`伏魔记：${maps.length} 张原图、${scripts.length} 个剧情脚本、${maps.reduce((n, m) => n + m.cells.length, 0)} 个真实格子。`);
