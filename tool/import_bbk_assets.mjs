import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

/**
 * 从本地目录导入原机游戏与 ROM。只匹配固定的 84 个标题，不根据文件名猜测其他游戏。
 *
 * --catalog-only 仅生成目录；--source 指向包含 GAM 和 a4980/a4988 ROM 子目录的资产目录。
 * --covers 下载固定上游提交的菜单截图；--check 检查已生成目录及本地资产，不编译项目。
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(root, 'assets/bbk');
const upstream = '09bc66de868c8d2d6e1e1a6339552baf0c778b34';
const names = [
  '一中传奇', '一中传奇2', '七剑', '三国霸业', '仙三外传', '仙剑三',
  '仙剑奇侠传二之虎啸飞剑', '仙剑奇侠传四回梦游仙', '仙界传说', '伏魔记',
  '伏魔记(有声版)', '伏魔记 加秘籍', '伏魔记-伏魔记外传', '伏魔记-新护神记',
  '伏魔记-清风传', '伏魔记-游戏王', '伏魔记-王柱人传奇', '伏魔记-魔道传奇',
  '伏魔记之圆梦间奏曲v0.1', '伏魔记圆梦前奏曲(公测版)', '伏魔记怀旧终曲v1.0(原版精修)',
  '伏魔迷宫', '侠客行', '侠客行4988(终曲版)', '剑缘-第一部', '十字之门',
  '同福奇缘', '地牢围攻', '基督山传奇', '天之骄子', '天之骄子终曲版',
  '妖 传说', '妖·传说终曲版', '封魔录', '将门风云', '少年行', '屠魔', '异世大陆',
  '异时空游记', '异时空游记2-纵横之旅', '志在青云', '恶龙传说', '战国争霸',
  '新仙剑奇侠传', '新仙剑奇侠传终曲版', '新伏魔记', '新伏魔S终曲版', '末日传说',
  '校园传奇', '梦幻校园', '梦幻西游', '武林新传', '洛特传奇', '海盗船', '混战三国',
  '热血传奇', '牛妞历险记', '王氏传', '生命女神之暗之诅咒', '诸神黄昏', '豪斯',
  '金庸群侠传', '金庸群侠传终曲版', '金庸群侠黑暗时代终曲版', '阶梯小子',
  '英雄剑', '英雄剑1', '英雄剑2', '英雄坛', '英雄坛说', '英雄坛说终曲版',
  '英雄战士', '落世沉浮', '蓝色天际', '魔塔', '魔塔BT版', '魔塔超级版',
  '魔法学院', '黑暗之心', '白中传奇', '紫璇刀', '纯蓝记', '老观寺传奇 加秘籍', '老观寺传奇终曲版',
];
const warn = new Set([13, 18, 22, 28, 32, 33, 60]);
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const normalized = name => name.normalize('NFC').toLowerCase();
const allFiles = [];
const sourceIndex = process.argv.indexOf('--source');
const source = sourceIndex >= 0 ? process.argv[sourceIndex + 1] : null;

/** 不遍历符号链接，避免导入目录意外跨越磁盘或形成环。 */
function collect(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(file);
    else if (entry.isFile()) allFiles.push(file);
  }
}
if (source) collect(path.resolve(source));
if (sourceIndex >= 0 && !source) throw Error('--source 缺少目录参数');
if (names.length !== 84 || new Set(names).size !== 84) throw Error('84 款目录不完整或存在重复标题');
const checkOnly = process.argv.includes('--check');
const copyTasks = [];
if (!checkOnly) {
  for (const dir of ['games', 'covers', 'roms/a4980', 'roms/a4988']) {
    fs.mkdirSync(path.join(base, dir), {recursive: true});
  }
}
const old = fs.existsSync(path.join(base, 'catalog.json'))
  ? JSON.parse(fs.readFileSync(path.join(base, 'catalog.json'), 'utf8')) : null;
const entries = names.map((title, i) => {
  const id = 'rpg-' + String(i + 1).padStart(3, '0');
  const assetPath = `assets/bbk/games/${id}.gam`;
  const matches = allFiles.filter(file => normalized(path.basename(file)) === normalized(title + '.gam'));
  const hashes = new Set(matches.map(file => sha256(fs.readFileSync(file))));
  if (hashes.size > 1) throw Error(`${title} 存在内容不同的同名 GAM，请先选择正确版本`);
  const previous = old?.games?.find(game => game.id === id);
  const candidate = matches[0] ?? (fs.existsSync(path.join(root, assetPath)) ? path.join(root, assetPath) : null);
  let hash = null;
  let byteLength = null;
  if (candidate) {
    const bytes = fs.readFileSync(candidate);
    if (bytes.length < 0x46 || bytes.length > 0x1e0000) throw Error(`${title}: GAM 大小无效`);
    const entryPoint = bytes.readUInt16LE(0x40);
    const dataOffset = bytes.readUInt32LE(0x42);
    if (entryPoint < 0x5000 || entryPoint >= 0xd000 || dataOffset >= bytes.length) {
      throw Error(`${title}: GAM 入口或数据偏移无效，请核对原始文件`);
    }
    hash = sha256(bytes);
    byteLength = bytes.length;
    if (!checkOnly && path.resolve(candidate) !== path.join(root, assetPath)) {
      copyTasks.push({candidate, output: path.join(root, assetPath)});
    }
    if (checkOnly && previous?.sha256 !== hash) throw Error(`${title}: catalog 与资源哈希不一致`);
  }
  return {
    id, title, fileName: title + '.gam', assetPath,
    coverAsset: `assets/bbk/covers/${id}.png`,
    model: title.includes('4988') ? 'a4988' : 'a4980',
    modelVerified: false,
    upstreamStatus: warn.has(i + 1) ? 'warn' : 'pass',
    verification: 'unverified', sha256: hash, byteLength,
  };
});
const roms = [];
for (const model of ['a4980', 'a4988']) {
  for (const fileName of ['8.BIN', 'E.BIN']) {
    const assetPath = `assets/bbk/roms/${model}/${fileName}`;
    const matches = allFiles.filter(file => normalized(path.basename(file)) === normalized(fileName)
      && path.relative(path.resolve(source ?? '.'), file).split(path.sep).some(part => normalized(part) === model || part === model.slice(1)));
    if (new Set(matches.map(file => sha256(fs.readFileSync(file)))).size > 1) throw Error(`${model}/${fileName}: 多个 ROM 内容不同`);
    const candidate = matches[0] ?? (fs.existsSync(path.join(root, assetPath)) ? path.join(root, assetPath) : null);
    if (candidate) {
      const bytes = fs.readFileSync(candidate);
      if (bytes.length !== 0x200000) throw Error(`${model}/${fileName}: ROM 必须为 2MiB`);
      if (!checkOnly && path.resolve(candidate) !== path.join(root, assetPath)) copyTasks.push({candidate, output: path.join(root, assetPath)});
      roms.push({model, fileName, assetPath, sha256: sha256(bytes), byteLength: bytes.length});
    }
  }
}
const catalog = {version: 1, upstream, games: entries, roms};
if (!checkOnly) {
  // 所有 GAM/ROM 校验结束后才开始替换，发现后续文件冲突不能提前覆盖旧资产。
  for (const task of copyTasks) {
    fs.copyFileSync(task.candidate, task.output + '.tmp');
    fs.renameSync(task.output + '.tmp', task.output);
  }
  const file = path.join(base, 'catalog.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(catalog, null, 2) + '\n');
  fs.renameSync(file + '.tmp', file);
}
if (checkOnly && JSON.stringify(old?.games) !== JSON.stringify(entries)) throw Error('catalog 条目与固定 84 款清单不一致');
if (process.argv.includes('--covers') && !checkOnly) {
  // 使用固定提交，菜单截图只作为封面，不表示游戏在本项目中已经通过验证。
  for (let index = 0; index < entries.length; index += 6) {
    await Promise.all(entries.slice(index, index + 6).map(async game => {
      const output = path.join(root, game.coverAsset);
      if (fs.existsSync(output)) return;
      const url = `https://raw.githubusercontent.com/AloysHF/BBKEmu/${upstream}/docs/images/${encodeURIComponent(game.title)}.png`;
      const response = await fetch(url);
      if (!response.ok) throw Error(`封面下载失败: ${game.title} (${response.status})`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw Error('封面不是 PNG');
      fs.writeFileSync(output, bytes);
    }));
  }
}
console.log(JSON.stringify({total: entries.length, bundledGames: entries.filter(game => game.sha256).length,
  roms: roms.length, missingGames: entries.filter(game => !game.sha256).map(game => game.title)}, null, 2));
