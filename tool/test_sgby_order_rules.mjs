import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

/**
 * 提取真实出征、提交及外交结算入口，夹具仅替代界面、队列与各命令的后续执行器。
 *
 * --prepare只生成源码，不编译；实际C回归由云端执行。命令结算函数仅移除与测试无关
 * 的脚本绑定元数据块，保留保护判断、归队、switch分发和返回值。
 */
const directory = resolve(process.argv[2] || '.');
function extract(filename, name) {
  const source = readFileSync(join(directory, 'src', filename), 'utf8');
  const mask = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    value => ' '.repeat(value.length));
  const signature = new RegExp(`(?:static\\s+)?(?:FAR\\s+)?(?:U8|U32)\\s+${name}\\s*\\([^)]*\\)\\s*\\{`).exec(mask);
  assert.ok(signature, `缺少真实核心函数：${name}`);
  let end = signature.index + signature[0].length, depth = 1;
  while (depth && end < mask.length) {
    if (mask[end] === '{') depth++;
    if (mask[end] === '}') depth--;
    end++;
  }
  assert.equal(depth, 0);
  return source.slice(signature.index, end);
}
const order = extract('citycmd.c', 'OrderExec');
const bindingStart = order.indexOf('    {\n#define _ST OrderType');
const dispatchStart = order.indexOf('    switch (Order->OrderId)');
assert.ok(bindingStart > 0 && dispatchStart > bindingStart);
const dispatch = order.slice(0, bindingStart) + order.slice(dispatchStart);
const drivers = [...new Set([...dispatch.matchAll(/\b(\w+Drv)\(Order\);/g)].map(match => match[1]))];
const fixture = readFileSync(new URL('fixtures/sgby_order_rules_test.c', import.meta.url), 'utf8');
const code = fixture.replace('/* ENGINE_ORDER_CONSTANTS */', readFileSync(join(directory, 'src/baye/order.h'), 'utf8'))
  .replace('/* ENGINE_FIGHTERS */', extract('cityedit.c', 'GetCityFighters'))
  .replace('/* ENGINE_BATTLE */', extract('citycmdd.c', 'AddFightOrder') + '\n' + extract('citycmdd.c', 'BattleMake'))
  .replace('/* ENGINE_DIPLOMACY */',
    drivers.map(name => `static U8 ${name}(OrderType *order) { driverCalls++; return 1; }`).join('\n') + '\n' +
    extract('citycmd.c', 'IsProtectedPlayerDiplomacy') + '\n' + dispatch);
const temporary = mkdtempSync(join(tmpdir(), 'sgby-order-rules-'));
const filename = join(temporary, 'order-rules.c');
const executable = join(temporary, 'order-rules');
writeFileSync(filename, code);
if (process.argv.includes('--prepare')) {
  console.log(`核心出征与外交回归已准备，未编译：${filename}`);
} else {
  try {
    const compilation = spawnSync(process.env.CC || 'cc', ['-std=c99', '-Wall', '-Wextra', '-Werror',
      '-Wno-unused-parameter', filename, '-o', executable], {encoding: 'utf8'});
    assert.equal(compilation.status, 0, compilation.stdout + compilation.stderr);
    const execution = spawnSync(executable, [], {encoding: 'utf8'});
    assert.equal(execution.status, 0, execution.stdout + execution.stderr);
    process.stdout.write(execution.stdout);
  } finally { rmSync(temporary, {recursive: true, force: true}); }
}
