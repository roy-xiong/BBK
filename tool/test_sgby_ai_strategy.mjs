import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

/**
 * 从已应用项目补丁的iBaye源码中提取真实函数，运行独立的C策略回归。
 *
 * 用法：node tool/test_sgby_ai_strategy.mjs /path/to/patched/iBaye
 * 此命令会调用CC（默认cc）编译测试程序；禁止自动编译时只执行--prepare。
 * 夹具只替代资源读取、人物队列和命令提交，不复制选城、寻路或出征算法。
 */
const engineDirectory = process.argv.slice(2).find((value) => value !== '--prepare');
assert.ok(engineDirectory, '请传入已应用当前项目补丁的iBaye源码目录');
const tacticSource = readFileSync(join(resolve(engineDirectory), 'src/tactic.c'), 'utf8');
const citySource = readFileSync(join(resolve(engineDirectory), 'src/cityedit.c'), 'utf8');

/** 提取完整函数体，忽略注释和字符串中的括号，保留原始源码字节。 */
function extractFunction(source, name) {
  const masked = source.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    (value) => ' '.repeat(value.length),
  );
  const signature = new RegExp(`(?:static\\s+)?(?:FAR\\s+)?(?:void|U8)\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const match = signature.exec(masked);
  assert.ok(match, `缺少核心函数：${name}`);
  let depth = 1;
  let end = match.index + match[0].length;
  while (end < masked.length && depth > 0) {
    if (masked[end] === '{') depth++;
    if (masked[end] === '}') depth--;
    end++;
  }
  assert.equal(depth, 0, `核心函数括号不完整：${name}`);
  return source.slice(match.index, end);
}

const functionNames = [
  'AiWorldActivity', 'AiWorldActivityBonus', 'AiTargetPriority',
  'AiPlayerCityDistances', 'AiSelectAttackTarget', 'AiFrontlineNextCity',
  'AiHasFriendlyExpedition', 'AiAdvanceStrategicFront',
  'ComputerTacticArmament', 'ComputerTactic',
];
const core = [
  extractFunction(citySource, 'GetRoundEnemyCity'),
  ...functionNames.map((name) => extractFunction(tacticSource, name)),
].join('\n\n');
const fixture = readFileSync(new URL('fixtures/sgby_ai_strategy_test.c', import.meta.url), 'utf8');
assert.equal(fixture.split('/* SGBY_ENGINE_FUNCTIONS */').length, 2);
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'sgby-ai-regression-'));
const sourcePath = join(temporaryDirectory, 'strategy-test.c');
const executablePath = join(temporaryDirectory, 'strategy-test');
writeFileSync(sourcePath, fixture.replace('/* SGBY_ENGINE_FUNCTIONS */', core));

if (process.argv.includes('--prepare')) {
  console.log(`已提取真实核心函数并生成回归源码（未编译、未执行）：${sourcePath}`);
} else {
  try {
    const compilation = spawnSync(process.env.CC || 'cc', [
      '-std=c99', '-Wall', '-Wextra', '-Werror', '-Wno-unused-parameter',
      sourcePath, '-o', executablePath,
    ], {encoding: 'utf8'});
    assert.equal(compilation.error, undefined, compilation.error?.message);
    assert.equal(compilation.status, 0, compilation.stdout + compilation.stderr);
    const execution = spawnSync(executablePath, [], {encoding: 'utf8'});
    assert.equal(execution.error, undefined, execution.error?.message);
    assert.equal(execution.status, 0, execution.stdout + execution.stderr);
    process.stdout.write(execution.stdout);
  } finally {
    rmSync(temporaryDirectory, {recursive: true, force: true});
  }
}
