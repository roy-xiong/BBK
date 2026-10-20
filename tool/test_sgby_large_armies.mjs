import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

/** 对真实32位兵力、伤害、LIB读取和完整双文件存读档函数运行边界回归；--prepare不编译。 */
const directory = resolve(process.argv[2] || '.');
const read = name => readFileSync(join(directory, 'src', name), 'utf8');
function extract(source, name) {
  const masked = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, value => ' '.repeat(value.length));
  const match = new RegExp(`(?:static\\s+)?(?:FAR\\s+)?(?:U8|U16|U32|bool|void)\\s*\\*?\\s*${name}\\s*\\([^)]*\\)\\s*\\{`).exec(masked);
  assert.ok(match, `缺少真实引擎函数：${name}`);
  let end = match.index + match[0].length, depth = 1;
  while (depth && end < masked.length) {
    if (masked[end] === '{') depth++;
    if (masked[end] === '}') depth--;
    end++;
  }
  assert.equal(depth, 0);
  return source.slice(match.index, end);
}
const attributes = read('baye/attribute.h');
const person = attributes.match(/typedef struct Person\b[\s\S]*?}PersonType;/)?.[0];
const city = attributes.match(/typedef struct City\b[\s\S]*?}CityType;/)?.[0];
assert.ok(person && city);
const count = read('FgtCount.c');
const coefficients = count.slice(count.indexOf('static float SubduModu'), count.indexOf('FAR U32 CountAtkHurt'));
assert.ok(coefficients.length > 0);
const core = [
  extract(read('tactic.c'), 'LoadLegacyPerson'),
  ...['PlcArmsLimit', 'PlcArmsMaxP'].map(name => extract(read('PublicFun.c'), name)),
  coefficients,
  ...['CountArmsSub', 'CountArmsAdd', 'CountAtkHurt', 'FgtAllArms'].map(name => extract(count, name)),
  extract(read('gamEng.c'), 'GamSaveRcd'),
  extract(read('gamEng.c'), 'GamLoadRcd'),
].join('\n\n');
const fixture = readFileSync(new URL('fixtures/sgby_large_armies_test.c', import.meta.url), 'utf8')
  .replace('/* ENGINE_TYPES */', person + '\n' + city + '\n' + read('baye/order.h'))
  .replace('/* ENGINE_FUNCTIONS */', core);
const temporary = mkdtempSync(join(tmpdir(), 'sgby-large-armies-'));
const filename = join(temporary, 'large-armies.c'), executable = join(temporary, 'large-armies');
writeFileSync(filename, fixture);
if (process.argv.includes('--prepare')) {
  console.log(`32位兵力与双文件存档回归已准备，未编译：${filename}`);
} else {
  try {
    const compilation = spawnSync(process.env.CC || 'cc', ['-std=c99', '-Wall', '-Wextra', '-Werror',
      '-Wno-unused-parameter', filename, '-o', executable], {encoding: 'utf8'});
    assert.equal(compilation.status, 0, compilation.stdout + compilation.stderr);
    const execution = spawnSync(executable, [], {encoding: 'utf8'});
    assert.equal(execution.status, 0, execution.stdout + execution.stderr);
    process.stdout.write(execution.stdout);
  } finally {rmSync(temporary, {recursive: true, force: true});}
}
