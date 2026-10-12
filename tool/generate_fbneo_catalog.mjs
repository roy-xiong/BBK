import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * 从官方 Arcade DAT 提取 ROM set 名称与父档，取与当前固定 WASM 字符串表的交集。
 * 此索引只用于名称/父档识别，不宣称 DAT 的最新 CRC 与旧内核完全一致；最终由 FBNeo 校验。
 * 用法：node tool/generate_fbneo_catalog.mjs /path/to/official-arcade.dat
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datPath = process.argv[2];
if (!datPath) throw Error('请指定官方 FBNeo Arcade DAT 文件');
const archive = path.join(root, 'assets/games/emulator/data/cores/fbneo-legacy-wasm.data');
const wasm = execFileSync('bsdtar', ['-xOf', archive, 'fbneo_libretro.wasm'], { maxBuffer: 64 * 1024 * 1024 });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bbk-fbneo-catalog-'));
const wasmPath = path.join(temporary, 'fbneo.wasm');
fs.writeFileSync(wasmPath, wasm);
const strings = new Set(execFileSync('strings', ['-n', '2', wasmPath], { maxBuffer: 32 * 1024 * 1024 }).toString().split('\n'));
// LLVM 会共享字符串后缀（例如 sf2 可能位于 ssf2 结尾），名称匹配也要包含这些后缀。
const suffixes = new Set();
for (const word of strings) {
  if (!/^[A-Za-z0-9_+-]{2,100}$/.test(word)) continue;
  for (let i = 0; i < word.length - 1; i++) suffixes.add(word.slice(i));
}
const dat = fs.readFileSync(datPath, 'utf8');
const games = {};
for (const match of dat.matchAll(/<game\s+name="([A-Za-z0-9_+-]+)"([^>]*)>/g)) {
  const [, name, attributes] = match;
  if (!strings.has(name) && !suffixes.has(name) || /isbios="yes"/.test(attributes)) continue;
  games[name] = /cloneof="([^"]+)"/.exec(attributes)?.[1] || null;
}
if (!Object.hasOwn(games, 'mslug')) throw Error('索引缺少 mslug，请检查 DAT 与 WASM');
const result = { version: 1, source: 'https://github.com/libretro/FBNeo/tree/master/dats',
  note: '仅名称索引，固定 WASM 字符串交集；ROM 内容与 CRC 由 FBNeo 校验',
  wasmSha256: createHash('sha256').update(wasm).digest('hex'), games };
fs.writeFileSync(path.join(root, 'assets/games/emulator/fbneo-romsets.json'), JSON.stringify(result));
console.log(`已生成 ${Object.keys(games).length} 个固定内核 ROM set 名称与父档关系。`);
