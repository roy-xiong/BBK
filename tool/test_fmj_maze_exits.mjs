import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = { window: {} };
vm.createContext(context);
for (const name of ['guide-data.js', 'guide-engine.js']) vm.runInContext(fs.readFileSync(path.join(root, 'assets/games/fmj/js', name), 'utf8'), context);
const engine = new context.window.FmjGuideEngine(context.window.FmjGuideData);

// 使用原 loadmap → startchapter 的真实落点，避免把同一迷宫底图的其他区域当入口。
const entries = new Map();
for (const script of engine.data.scripts) {
  let position;
  for (const command of script.commands) {
    if (command.op === 1) position = { mapId: command.a.slice(0, 2).join(':'), x: command.a[2] + 4, y: command.a[3] + 3 };
    if (command.op === 14 && position) {
      const id = command.a.slice(0, 2).join(':'), positions = entries.get(id) || [];
      if (!positions.some(p => p.mapId === position.mapId && p.x === position.x && p.y === position.y)) positions.push({ ...position });
      entries.set(id, positions);
    }
  }
}
const report = [];
for (const script of engine.data.scripts.filter(s => s.maps.length === 1 && s.maps[0].startsWith('3:'))) {
  const entrances = (entries.get(script.id) || []).filter(p => p.mapId === script.maps[0]);
  assert.ok(entrances.length, `迷宫 ${script.id} 没有可复核的原入口`);
  for (const entrance of entrances) {
    // 此用例验证原通道和完成后出口。玄武机关及天师剧情的门必须单独保持未完成，
    // 验证助手会先抵达机关或原剧情门，而不是直接跳到外部场景。
    const flags = Array(2401).fill(true);
    flags[1] = false;
    for (let i = 100; i <= 113; i++) flags[i] = false;
    flags[100] = true;
    if (script.id === '14:9') { flags[253] = false; flags[254] = false; flags[1100] = false; }
    if (['14:10', '14:11'].includes(script.id)) flags[254] = false;
    const seed = { ...entrance, scriptId: script.id, flags, vars: Array(240).fill(0), npcs: [], escapeItem: true };
    const state = engine.simulate(seed, 0).state;
    const before = JSON.stringify(state), plan = engine.exitPlan(state);
    assert.equal(plan.unavailable, undefined, `迷宫 ${script.name} [${script.id}] 在入口 (${entrance.x},${entrance.y}) 无法定位出口或必要互动`);
    assert.equal(JSON.stringify(state), before, '出口规划不应修改真实剧情状态');
    if (!plan.boundary && !plan.preparation) assert.equal(engine.maps.get(plan.state.mapId).type, 1);
    report.push({ script: script.id, name: script.name, result: plan.preparation ? '到必要机关' : plan.boundary ? '到剧情出口' : '到室外', steps: plan.steps.length });
  }
}
const scenes = new Set(report.map(r => r.script));
assert.equal(scenes.size, 29);
console.log(JSON.stringify({ verifiedMazeScenes: scenes.size, actualEntrances: report.length, results: report }, null, 2));
