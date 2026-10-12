import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createFmjBrowser, delay } from './fmj_browser_session.mjs';

/**
 * 回放真机的主线结束状态，检查实际一键前往入口、系统提示和地图按钮。
 * 仅在独立浏览器中准备状态，不读写手机或正常玩家档位。
 */
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/jyqxz_no_target_state.json', import.meta.url), 'utf8'));
const browser = await createFmjBrowser({ gameId: 'jyqxz', accelerated: true });
try {
  const selected = JSON.parse(await browser.evaluate(`bbkSelectFmjStage('scene-${fixture.scriptId}')`));
  assert.equal(selected.ok, true);
  for (let i = 0; i < 100; i++) {
    if (await browser.evaluate('FmjGuide.state()?.busy === false')) break;
    await delay(10);
  }
  await browser.evaluate(`(() => {
    const fixture = ${JSON.stringify(fixture)}, core = window['fmj.core'].fmj, scene = core.game.mainScene;
    sysSetGameLoopPaused(true);
    if (FmjGuide.state().busy) throw Error('场景初始化未结束');
    core.script.ScriptResources.globalEvents.fill(false);
    fixture.flags.forEach(flag => core.script.ScriptResources.globalEvents[flag] = true);
    scene.player.levelUp_za3lpa$(fixture.level);
    scene.player.setPosInMap_vux9f0$(fixture.x, fixture.y);
    for (const [id, count] of Object.entries(fixture.goods)) {
      const key = id.split(':').map(Number), bag = core.characters.Player.Companion.sGoodsList;
      bag.addGoods_qt1dr2$(key[0], key[1], count - bag.getGoodsNum_vux9f0$(key[0], key[1]));
    }
    FmjPreferences.set('storyScope', fixture.questMode);
    localStorage.removeItem('bbk/jyqxz_goal');
    window.__fmjAuditNotices.length = 0;
  })()`);
  const before = await browser.evaluate('FmjGuide.state()');
  assert.equal(before.scriptId, fixture.scriptId);
  assert.equal(before.mapId, fixture.mapId);
  const result = await browser.evaluate('bbkGoToFmjNextGoal()');
  const notices = await browser.evaluate('__fmjAuditNotices.filter(n => n.type === "fmj_notice")');
  const notice = notices.at(-1)?.data;
  console.log(JSON.stringify({scenario:'真机主线9/9、五条支线暂缓、未入门派',result,notice}));
  assert.ok(notice?.message.includes('主线已完成'), '主线结束必须说明已完成，不能让玩家反复重新进场');
  assert.ok(!/沿真实入口|开场剧情|重新进入/.test(notice.message), '无目标状态不能提示触发新的入场剧情');
  assert.match(notice.message, /5 条支线已暂缓/);
  assert.match(notice.message, /尚未加入门派/);
  assert.equal(notice.ok, true, '正常结束提示不能被标为寻路失败');
  assert.equal(result.reason, 'no_target');
  assert.deepEqual(await browser.evaluate('FmjGuide.state()'), before, '提示不应改位置、剧情标记、物品和等级');
  assert.equal(await browser.evaluate('!!document.getElementById("fmj-guide")'), false, '游戏按钮提示不应自动展开地图');
  const plan = await browser.evaluate('FmjGuide.engine.taskPlan(FmjGuide.state())');
  assert.equal(plan.reason, 'no_target', '规划入口也应识别无目标，不能生成零步的假路线');

  await browser.evaluate('FmjGuide.open()');
  const panel = await browser.evaluate(`(() => {
    const card = document.querySelector('#fmj-guide .goal-card'), button = card.querySelector('[data-action="next"]');
    return { title: card.querySelector('h2').textContent, hint: card.querySelector('h2 + p').textContent, disabled: button.disabled, button: button.textContent, text: document.querySelector('[data-id="story"]').textContent };
  })()`);
  assert.match(panel.title, /主线已完成.*暂无/);
  assert.equal(panel.hint, notice.message, '地图提示和游戏按钮提示必须同源');
  assert.equal(panel.disabled, true);
  assert.equal(panel.button, '暂无可前往目标');
  assert.match(panel.text, /状态：已暂缓/);
  assert.match(panel.text, /状态：前置未完成/);

  // 恢复一条暂缓支线时立即恢复可前往状态，不能把“主线结束”写成永久禁用。
  await browser.evaluate(`window['fmj.core'].fmj.script.ScriptResources.globalEvents[2384] = false; FmjGuide.open()`);
  const resumed = await browser.evaluate(`(() => {
    const state = FmjGuide.state(), goal = FmjGuide.engine.nextGoal(state);
    return { id: goal.id, noTarget: !!goal.noTarget, disabled: document.querySelector('.goal-card [data-action="next"]').disabled, routeAvailable: !FmjGuide.engine.taskPlan(state).unavailable };
  })()`);
  assert.equal(resumed.id, 'earring');
  assert.equal(resumed.noTarget, false);
  assert.equal(resumed.disabled, false);
  assert.equal(resumed.routeAvailable, true);

  // 仅主线结束与完整流程结束分别提示；显式选择门派时仍应尊重导航意图。
  await browser.evaluate(`FmjPreferences.set('storyScope', 'main'); FmjGuide.open()`);
  const mainOnly = await browser.evaluate('FmjGuide.engine.nextGoal(FmjGuide.state())');
  assert.equal(mainOnly.noTarget, true);
  assert.match(mainOnly.hint, /仅主线/);
  assert.match(mainOnly.hint, /完整流程/);
  assert.ok(!mainOnly.hint.includes('5 条支线已暂缓'), '仅主线提示不能把未排入流程的支线说成导致卡住');
  await browser.evaluate(`localStorage.setItem('bbk/jyqxz_goal', JSON.stringify({label:'拜访华山派掌门',scriptId:'13:1',event:1,hint:'原版入门要求和互斥门派由原对话检查。'})); FmjGuide.open()`);
  const explicit = await browser.evaluate('({goal:FmjGuide.engine.nextGoal(FmjGuide.state()),disabled:document.querySelector(".goal-card [data-action=next]").disabled})');
  assert.equal(explicit.goal.scriptId, '13:1');
  assert.equal(explicit.disabled, false);

  // 未完成的真实入场节点仍显示入口提示，防止此次修复吞掉正常主线。
  await browser.evaluate(`localStorage.removeItem('bbk/jyqxz_goal'); window['fmj.core'].fmj.script.ScriptResources.globalEvents[1009] = false; FmjGuide.open()`);
  const active = await browser.evaluate('({goal:FmjGuide.engine.nextGoal(FmjGuide.state()),disabled:document.querySelector(".goal-card [data-action=next]").disabled})');
  assert.equal(active.goal.flag, 1009);
  assert.equal(active.goal.noTarget, undefined);
  assert.match(active.goal.hint, /真实入口/);
  assert.equal(active.disabled, false);
  assert.deepEqual(browser.exceptions, []);
  console.log('金庸目标提示通过：真机结束状态、地图与按钮一致、暂缓/前置状态、仅主线提示、恢复支线、手选门派和正常入场主线。');
} finally {
  browser.close();
}
