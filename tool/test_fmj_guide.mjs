import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = { window: {} };
vm.createContext(context);
for (const name of ['guide-data.js', 'guide-engine.js', 'quest-engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/games/fmj/js', name), 'utf8'), context);
}
const data = context.window.FmjGuideData;
const Engine = context.window.FmjGuideEngine;
const engine = new Engine(data);
function state(scriptId, mapId, x, y, flags = []) {
  const result = { scriptId, mapId, x, y, flags: Array(2401).fill(false), vars: Array(240).fill(0), npcs: [] };
  flags.forEach(f => result.flags[f] = true);
  return result;
}
function initialized(...args) { return engine.simulate(state(...args), 0).state; }

// 首次拜师应使用真实地图出入口，不能只切换当前地图 ID。
const opening = initialized('2:12', '1:2', 19, 3, [1]);
const before = JSON.stringify(opening);
const master = engine.route(opening, { scriptId: '2:2', event: 9 });
assert.equal(master.steps.length, 2);
assert.equal(master.state.scriptId, '2:2');
assert.equal(master.state.mapId, '2:7');
assert.equal(JSON.stringify(opening), before, '只读路线计算不能修改当前存档');

// 八盏灯未完成时可以抵达各护灯关口，机关门仍不能被导航越过。
const early = initialized('2:1', '1:1', 5, 6);
for (let i = 0; i < 8; i++) {
  const lamp = engine.route(early, { scriptId: `2:${19 + i}`, event: 1 });
  assert.equal(lamp.unavailable, undefined, `护灯关口 ${i + 1} 应可达`);
}
const locked = engine.route(early, { scriptId: '3:9', event: 1 });
assert.equal(locked.unavailable, true, '取剑复命前不能下山');

// 首次获准下山会播放山门对话，应送到该入口并停止，而非绕过对白。
const firstDescent = initialized('2:1', '1:1', 5, 6, [19, 21]);
const descent = engine.route(firstDescent, { scriptId: '3:9', event: 1, allowBoundary: true });
assert.equal(descent.boundary, true);
assert.equal(descent.exit.event, 41);
assert.equal(firstDescent.flags[25], false, '预测对白之后的路线不能提前设置离山标记');
const subsequent = initialized('2:1', '1:1', 5, 6, [19, 21, 25]);
assert.equal(engine.route(subsequent, { scriptId: '3:9', event: 1 }).state.scriptId, '3:9');
const region = engine.region(subsequent);
assert.ok(region.cards.length > 1, '已开放室外道路应按真实出入口展开');
for (const card of region.cards) {
  assert.equal(card.width, card.map.width * 16);
  assert.equal(card.height, card.map.height * 16);
}
for (const link of region.links.filter(l => !l.portal)) {
  assert.ok(Math.hypot(link.start.x - link.end.x, link.start.y - link.end.y) <= 20, '连续道路必须在入口格处对齐');
}

// 原地图里玩家四周的边界属于画面留白，不能把它当成可传送的道路。
assert.equal(engine.walkable(opening, 0, 0, true), false);
assert.equal(engine.walkable(opening, 23, 14, true), false);

// 20 格竖线与 40 格横线的绘制坐标及步数都必须保持 1:2。
const synthetic = new Engine({ maps: [{ id: 'test', width: 50, height: 30, cells: Array(1500).fill(128) }], scripts: [], objects: [] });
const grid = synthetic.flood(state('', 'test', 4, 3));
assert.equal(grid.distance[23 * 50 + 44], 60);
assert.equal((20 * 16) / (40 * 16), 0.5);
synthetic.maps.get('test').cells.forEach((_, i, cells) => { if (i % 50 === 24) cells[i] = 0; });
assert.equal(synthetic.flood(state('', 'test', 4, 3)).distance[23 * 50 + 44], -1, '地图测距不能穿墙');

// 进度与读档快照同步，不能把之前一局的历史勾选写回当前进度。
const late = state('14:11', '3:11', 9, 10, [21, 202, 254]);
assert.equal(engine.progress(late).find(p => p.flag === 254).done, true);
assert.equal(engine.progress(opening).find(p => p.flag === 254).done, false);

// 洞内第一战结束后仍要通过出口触发回村剧情，不能提前把目标判成回师门复命。
const snakeCave = initialized('4:8', '3:8', 8, 4, [19, 21, 202, 203, 204, 208, 209, 210, 2000, 2001, 215]);
assert.equal(engine.nextGoal(snakeCave).scriptId, '4:9', '应引导前往蛇窟出口，而非跳过村长遇害剧情');
assert.equal(engine.nextGoal(snakeCave).event, 42);

// 真机李府客厅复现：两件护甲已经装备，规划器仍必须能沿原道路找到蛇窟。
const equippedLifu = initialized('5:15', '2:20', 11, 10,
  [11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 25, 31, 202, 203, 204, 208, 209, 210, 2000, 2001]);
const equippedLifuBefore = JSON.stringify(equippedLifu);
const returnToSnake = engine.taskPlan(equippedLifu);
assert.equal(returnToSnake.unavailable, undefined, '李府取得并装备芦藤甲后，蛇窟路线不能被空事件耗尽搜索预算');
assert.equal(returnToSnake.state.scriptId, '4:8');
assert.ok(returnToSnake.steps.some(step => step.scriptId === '5:15'), '必须通过李府的真实出口');
assert.ok(returnToSnake.steps.some(step => step.scriptId === '4:1'), '必须通过瘴气林的装备检查');
assert.equal(JSON.stringify(equippedLifu), equippedLifuBefore, '寻路不能改变装备标记、剧情或玩家位置');
const armorMissing = engine.copy(equippedLifu);
armorMissing.flags[2001] = false;
assert.equal(engine.nextGoal(armorMissing).event, 0, '未满足护甲条件时仍应正常提示装备');

// 无效果事件已属于普通道路，不能因移动到其旁边而额外生成场景搜索节点。
const passiveCells = Array(24 * 15).fill(0);
for (let x = 4; x < 20; x++) passiveCells[8 * 24 + x] = 128;
passiveCells[8 * 24 + 13] = 128 | (1 << 8);
const passiveScript = { id: 'passive', events: Array(41).fill(0), commands: [{ at: 85, op: 9, a: [] }], maps: ['passive-map'] };
passiveScript.events[40] = 85;
const passiveEngine = new Engine({ maps: [{ id: 'passive-map', width: 24, height: 15, cells: passiveCells }], scripts: [passiveScript], objects: [] });
const passiveRoute = passiveEngine.route(state('passive', 'passive-map', 5, 8), { scriptId: 'absent' });
assert.equal(passiveRoute.visited, 1, '无效果事件不能重复入队消耗搜索预算');

// 镇长许可不等于门口守卫已经让路，需再到老宅门口执行原放行对白。
const whitewaterPermit = initialized('9:4', '2:10', 14, 11,
  [11,12,13,14,15,16,17,18,19,21,25,31,202,203,204,208,209,210,215,216,217,218,219,220,221,224,225,226,227,228,2000,2001]);
assert.equal(engine.nextGoal(whitewaterPermit).scriptId, '9:1');
assert.equal(engine.nextGoal(whitewaterPermit).event, 3, '应先找门口镇长让守卫移动');
const permissionBefore = JSON.stringify(whitewaterPermit);
assert.equal(engine.taskPlan(whitewaterPermit).unavailable, undefined);
assert.equal(JSON.stringify(whitewaterPermit), permissionBefore, '导航不能提前移动守卫或设置放行标记');
const whitewaterReleased = initialized('9:1', '1:42', 11, 19, whitewaterPermit.flags.map((v, i) => v ? i : -1).filter(i => i >= 0).concat(229));
assert.equal(engine.nextGoal(whitewaterReleased).scriptId, '9:11', '井口尚未显露时必须先查看老宅主房');
assert.equal(engine.nextGoal(whitewaterReleased).event, 1);
// 白水镇后期旧档不能把已错过的情书接受节点重新排到当前目标前面。
const whitewaterLate = initialized('9:1', '1:42', 7, 3,
  [11,12,13,14,15,16,17,18,19,21,25,31,202,203,204,208,209,210,211,215,216,217,218,219,220,221,224,225,226,227,228,229,230,231,232,233,234,2000,2001]);
whitewaterLate.questMode = 'complete';
assert.notEqual(engine.nextGoal(whitewaterLate).id, 'letter-accept', '已离开白水镇主线阶段后，情书接受节点应标记为错过');
assert.equal(engine.questTasks(whitewaterLate).find(q => q.id === 'letter-accept').status, 'expired');
assert.notEqual(engine.nextGoal(whitewaterLate).id, 'wang-wife', '已完成蛇窟主线后，早期李府支线不能把白水镇旧档拉回李府');

// 不可通行的迷宫不能通过任务按钮直接跨过；可通行的出口应送到其交互点旁。
const stranded = state('5:20', '2:15', 8, 3, [1]);
assert.equal(engine.flood(stranded).exits.length, 0, '隔离区域没有可接近的原出口');
const strandedBefore = JSON.stringify(stranded);
const assisted = engine.taskPlan(stranded);
assert.equal(assisted.unavailable, true);
assert.equal(JSON.stringify(stranded), strandedBefore, '任务传送规划必须保持存档只读');
const caveExit = engine.taskPlan(snakeCave);
assert.equal(caveExit.unavailable, undefined);
assert.equal(caveExit.state.scriptId, '4:9');

// 通路中的 NPC 阻路时只能抵达阻挡者之前，不能跳过它直接到任务人物。
const corridorCells = Array(24 * 15).fill(0);
for (let x = 4; x < 20; x++) corridorCells[8 * 24 + x] = 128;
const guarded = new Engine({ maps: [{ id: 'corridor', width: 24, height: 15, cells: corridorCells }], scripts: [{ id: 'guard', events: [], commands: [], maps: ['corridor'] }], objects: [] });
const guardedState = state('guard', 'corridor', 5, 8);
guardedState.npcs = [{ id: 1, x: 17, y: 8 }, { id: 2, x: 10, y: 8 }];
const nearby = guarded.route(guardedState, { scriptId: 'guard', event: 1 });
assert.equal(nearby.blockedAt, 2);
assert.equal(nearby.arrival.x, 9);
// 行人堵住通向其他地图的唯一小路，应识别临时阻挡，不能谎报剧情未开放。
guardedState.npcs[1].moving = true;
guardedState.npcs = [guardedState.npcs[1]];
const nextScript = { id: 'beyond', events: [], commands: [{ at: 3, op: 9, a: [] }], maps: ['corridor'] };
guarded.scripts.set('beyond', nextScript);
guarded.scripts.get('guard').events = Array(41).fill(0);
guarded.scripts.get('guard').events[40] = 85;
guarded.scripts.get('guard').commands = [{ at: 85, op: 14, a: [0, 1] }];
guarded.scripts.get('guard').byAddress = new Map([[85, 0]]);
guarded.scripts.set('0:1', { ...nextScript, id: '0:1', byAddress: new Map([[3,0]]) });
guarded.maps.get('corridor').cells[8 * 24 + 18] |= 256;
const temporary = guarded.route(guardedState, { scriptId: '0:1' });
assert.equal(temporary.mobileBlocker, true, '可让路的行人必须保留为动态阻挡');
assert.equal(temporary.unavailable, undefined);

// 南山虎穴没有普通返回门，而使用引路石事件 255；持有且脚本允许时应纳入导航。
const tiger = initialized('12:3', '3:8', 4, 25, [238]);
tiger.escapeItem = true;
const tigerExit = engine.exitPlan(tiger);
assert.equal(tigerExit.unavailable, undefined, '南山虎穴应能通过原引路石逻辑离开');
assert.ok(tigerExit.steps.some(s => s.exit.kind === 'item'));
assert.equal(tigerExit.state.mapId, '1:35');
const noStone = { ...tiger, escapeItem: false };
assert.equal(engine.exitPlan(noStone).unavailable, true, '没有道具时不能伪造引路石返回');

// 校验全体原图及图块的尺寸，防止图集漏图或把房屋/迷宫缩成等大方框。
assert.equal(data.maps.length, 83);
assert.equal(data.maps.reduce((n, m) => n + m.cells.length, 0), 41292);
for (const map of data.maps) {
  assert.equal(map.cells.length, map.width * map.height);
  const tiles = data.tiles.find(t => t.id === map.tiles);
  assert.ok(tiles, `地图 ${map.id} 缺少原始图块`);
  assert.equal(tiles.hex.length, tiles.count * 32 * 2);
}
console.log('伏魔记帮助验证通过：真实跨图、八灯通路、剧情阻断、条件只读、步数比例、穿墙限制、读档进度和完整图块。');
