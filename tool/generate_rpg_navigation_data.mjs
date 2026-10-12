import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

/**
 * 生成只供一键前往、剧情判断及选关使用的运行时数据。
 *
 * 保留原地图碰撞格、事件和道具定义；世界布局与图块位图只供离线攻略使用，
 * 不进入游戏网页。原生成器也调用此方法，避免重新生成资源后恢复完整图集加载。
 * @param {string} gameDirectory 游戏资源的绝对目录。
 * @param {Object} data 从当前 ROM 解析的完整数据。
 * @return {void}
 */
export function writeNavigationData(gameDirectory, data) {
  const { world, tiles, ...navigation } = data;
  navigation.navigationOnly = true;
  const source = '/* 由 tool/generate_rpg_navigation_data.mjs 生成，仅含导航数据，不加载世界图集。 */\n'
    + 'window.FmjGuideData=' + JSON.stringify(navigation) + ';\n';
  fs.writeFileSync(path.join(gameDirectory, 'js/navigation-data.js'), source);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  for (const gameId of ['fmj', 'jyqxz']) {
    const directory = path.join(root, 'assets/games', gameId), context = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(directory, 'js/guide-data.js'), 'utf8'), context);
    writeNavigationData(directory, context.window.FmjGuideData);
    console.log(gameId + '：已生成独立导航数据，世界布局与图块位图已排除。');
  }
}
