import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

/**
 * 编译真实FgtGetCmdRng，验证原版关闭资源脚本时也能进入已安装的攻击范围Hook。
 *
 * 夹具仅替代资源和Hook入口；范围生成、核心调用条件及原有兵种/技能回退均来自
 * 已应用项目补丁的源码。配合增强脚本回归验证玩家7×7、敌方与开关关闭时的行为。
 * @param {string} process.argv[2] 已应用项目补丁的iBaye源码目录。
 */
const directory = resolve(process.argv[2] || '.');
const source = readFileSync(join(directory, 'src/FgtPkAi.c'), 'utf8');
const start = source.indexOf('FAR void FgtGetCmdRng(');
assert.ok(start >= 0, '缺少核心攻击范围生成函数');
const opening = source.indexOf('{', start);
let depth = 1, end = opening + 1;
while (depth && end < source.length) {
  if (source[end] === '{') depth++;
  if (source[end] === '}') depth--;
  end++;
}
assert.equal(depth, 0, '核心攻击范围函数结构不完整');
const fixture = readFileSync(new URL('fixtures/sgby_attack_range_test.c', import.meta.url), 'utf8');
const temporary = mkdtempSync(join(tmpdir(), 'sgby-attack-range-'));
try {
  const filename = join(temporary, 'attack-range.c');
  const executable = join(temporary, 'attack-range');
  writeFileSync(filename, fixture.replace('/* ENGINE_ATTACK_RANGE */', source.slice(start, end)));
  const compilation = spawnSync(process.env.CC || 'cc', [
    '-std=c99', '-Wall', '-Wextra', '-Werror', '-Wno-unused-parameter', filename, '-o', executable,
  ], {encoding: 'utf8'});
  assert.equal(compilation.status, 0, compilation.stdout + compilation.stderr);
  const execution = spawnSync(executable, [], {encoding: 'utf8'});
  assert.equal(execution.status, 0, execution.stdout + execution.stderr);
  process.stdout.write(execution.stdout);
} finally {
  rmSync(temporary, {recursive: true, force: true});
}
