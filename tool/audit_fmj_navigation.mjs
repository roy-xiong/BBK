import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const context = { window: {} };
vm.createContext(context);
for (const name of ['guide-data.js', 'guide-engine.js']) vm.runInContext(fs.readFileSync(new URL('../assets/games/fmj/js/' + name, import.meta.url), 'utf8'), context);
export const engine = new context.window.FmjGuideEngine(context.window.FmjGuideData);
export const data = engine.data;
export function profile(scriptId, mapId, x, y, beforeFlag, extra = []) {
  const flags = Array(2401).fill(false);
  [19,21,25,31,2000,2001,202,203,204,208,209,210,215,216,217,218,219,220,221,224,225,226,227,228,229,230,232,231,233,234,235,236,237,238,239,240,241,243,244,245,246,247,248,249,250,251,252,1100,253,254,2002,255,256,257,258,259,260].forEach(f => { if (f < beforeFlag || f >= 1000) flags[f] = true; });
  extra.forEach(f => flags[Math.abs(f)] = f > 0);
  const seed = { scriptId, mapId, x, y, flags, vars: Array(240).fill(0), npcs: [], escapeItem: true };
  return engine.simulate(seed, 0, true).state;
}

if (process.argv.includes('--tiger')) {
  const state = profile('12:3', '3:8', 4, 25, 238), before = JSON.stringify(state), plan = engine.taskPlan(state);
  console.log(JSON.stringify({ goal: plan.goal, unavailable: plan.unavailable, boundary: plan.boundary, blockedAt: plan.blockedAt, arrival: plan.arrival, visited: plan.visited }));
  assert.equal(plan.unavailable, undefined, '南山虎穴入口应能定位到白虎或沿途必须处理的真实事件');
  assert.equal(JSON.stringify(state), before, '导航不能修改剧情状态');
  assert.equal(plan.boundary, true, '应先到白虎前面的原道路对白格，不能穿过剧情');
  const after = { ...state, x: plan.exit.x, y: plan.exit.y };
  const arrived = engine.taskPlan(after);
  assert.equal(arrived.unavailable, undefined);
  assert.equal(arrived.boundary, undefined, '原对白读完后应直接抵达白虎旁边');
  assert.equal(arrived.arrival.eventX, 4);
  assert.equal(arrived.arrival.eventY, 20);
}

if (process.argv.includes('--scenes')) {
  for (const id of ['12:3','10:1','10:2','7:2','9:5','9:1','8:2','8:10','6:13']) {
    const s = engine.scripts.get(id), end = s.commands.findIndex(c => c.op === 9);
    console.log(JSON.stringify({ id, maps: s.maps, init: s.commands.slice(0,end+1).map(c=>[c.at,c.op,c.a,c.text]), events: s.events.map((at,i)=>at?[i+1,...s.commands.slice(s.byAddress.get(at),s.byAddress.get(at)+3).map(c=>[c.op,c.a,c.text])]:null).filter(Boolean) }));
  }
}
