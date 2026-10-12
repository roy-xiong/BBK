import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

/**
 * 直接编译已应用项目补丁的真实定时器和战略主循环，验证显示刷新与游戏推进的边界。
 *
 * 夹具替代浏览器调度API并记录它们的调用，不复制核心定时器实现。测试覆盖LCD使用
 * 独立定时器、最小刷新间隔、重复开关清理，以及战略月份之间的异步让步。
 */
const directory = resolve(process.argv[2] || '.');
const timerSource = readFileSync(join(directory, 'src/platform/js/timer.c'), 'utf8')
  .replace(/^#include[^\n]*\n/gm, '')
  .replace(/^#define NULL[^\n]*\n/gm, '');
const tacticSource = readFileSync(join(directory, 'src/tactic.c'), 'utf8');
const start = tacticSource.indexOf('FAR U8 GameDevDrv(void)');
assert.ok(start >= 0, '缺少战略主循环');
const opening = tacticSource.indexOf('{', start);
let depth = 1;
let end = opening + 1;
while (depth && end < tacticSource.length) {
  if (tacticSource[end] === '{') depth++;
  if (tacticSource[end] === '}') depth--;
  end++;
}
assert.equal(depth, 0, '战略主循环结构不完整');
const fixture = readFileSync(new URL('fixtures/sgby_core_timing_test.c', import.meta.url), 'utf8');
const temporary = mkdtempSync(join(tmpdir(), 'sgby-core-timing-'));
try {
  const filename = join(temporary, 'core-timing.c');
  const executable = join(temporary, 'core-timing');
  writeFileSync(filename, fixture.replace('/* ENGINE_TIMER */', timerSource)
    .replace('/* ENGINE_TACTIC */', tacticSource.slice(start, end)));
  const compilation = spawnSync(process.env.CC || 'cc', [
    '-std=c99', '-Wall', '-Wextra', '-Werror', '-Wno-unused-parameter',
    filename, '-o', executable,
  ], {encoding: 'utf8'});
  assert.equal(compilation.error, undefined, compilation.error?.message);
  assert.equal(compilation.status, 0, compilation.stdout + compilation.stderr);
  const execution = spawnSync(executable, [], {encoding: 'utf8'});
  assert.equal(execution.error, undefined, execution.error?.message);
  assert.equal(execution.status, 0, execution.stdout + execution.stderr);
  process.stdout.write(execution.stdout);
} finally {
  rmSync(temporary, {recursive: true, force: true});
}
