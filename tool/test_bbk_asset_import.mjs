import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

/** 用独立临时目录验证资源冲突、损坏数据与缺失 ROM，不触碰真实游戏资产。 */
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'bbk-import-regression-'));
try {
  fs.mkdirSync(path.join(fixture, 'tool'));
  fs.copyFileSync(path.join(project, 'tool/import_bbk_assets.mjs'), path.join(fixture, 'tool/import_bbk_assets.mjs'));
  const run = (...args) => spawnSync(process.execPath, ['tool/import_bbk_assets.mjs', ...args], {cwd:fixture, encoding:'utf8'});
  assert.equal(run('--catalog-only').status, 0);
  let catalog = JSON.parse(fs.readFileSync(path.join(fixture, 'assets/bbk/catalog.json'), 'utf8'));
  assert.equal(catalog.games.length, 84);
  assert.equal(catalog.games.filter(game => game.upstreamStatus === 'warn').length, 7);
  assert.equal(run('--check').status, 0);

  const source = path.join(fixture, 'input');
  fs.mkdirSync(path.join(source, 'a4980'), {recursive:true});
  const gam = Buffer.alloc(256);
  gam.writeUInt16LE(0x5000, 0x40);
  gam.writeUInt32LE(0x46, 0x42);
  fs.writeFileSync(path.join(source, '伏魔记.gam'), gam);
  fs.writeFileSync(path.join(source, 'a4980/8.BIN'), Buffer.alloc(0x200000, 1));
  fs.writeFileSync(path.join(source, 'a4980/E.BIN'), Buffer.alloc(0x200000, 2));
  assert.equal(run('--source', source).status, 0);
  catalog = JSON.parse(fs.readFileSync(path.join(fixture, 'assets/bbk/catalog.json'), 'utf8'));
  assert.equal(catalog.games.filter(game => game.sha256).length, 1);
  assert.equal(catalog.roms.length, 2);
  assert.equal(run('--check').status, 0);

  const duplicate = path.join(source, 'duplicate');
  fs.mkdirSync(duplicate);
  const different = Buffer.from(gam);
  different[100] = 5;
  fs.writeFileSync(path.join(duplicate, '伏魔记.gam'), different);
  assert.notEqual(run('--source', source).status, 0, '同名不同内容不能静默覆盖');
  const imported = fs.readFileSync(path.join(fixture, 'assets/bbk/games/rpg-010.gam'));
  assert.deepEqual(imported, gam);
  fs.unlinkSync(path.join(duplicate, '伏魔记.gam'));

  fs.writeFileSync(path.join(source, '魔塔.gam'), Buffer.alloc(30));
  assert.notEqual(run('--source', source).status, 0, '损坏 GAM 必须拒绝');
  fs.unlinkSync(path.join(source, '魔塔.gam'));
  fs.writeFileSync(path.join(source, 'a4980/8.BIN'), Buffer.alloc(1024));
  assert.notEqual(run('--source', source).status, 0, 'ROM 大小必须校验');
  console.log('BBK 资源导入回归通过：84目录、7 Warn、哈希、同名冲突、损坏GAM、ROM长度。');
} finally {
  fs.rmSync(fixture, {recursive:true, force:true});
}
