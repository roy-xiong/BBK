import assert from 'node:assert/strict';
import { createFmjBrowser, delay } from './fmj_browser_session.mjs';

/**
 * 用原网页和原事件验证一键前往的最后一步，不再由测试补按确认或方向键。
 * 对话、战斗和分支出现后立即停止，确认导航没有替玩家连续确认或作选择。
 */
for (const gameId of ['fmj', 'jyqxz']) {
  const browser = await createFmjBrowser({ accelerated: true, gameId });
  try {
    const stages = gameId === 'fmj'
      ? ['stage-001', 'stage-013', 'stage-017', 'stage-034', 'stage-042', 'stage-043', 'stage-087']
      : ['scene-11:26'];
    for (const stage of stages) {
      await browser.evaluate(`(() => {
        const c = window['fmj.core'].fmj, scene = c.game.mainScene;
        c.combat.Combat.Companion.FightDisable();
        if (scene) {
          scene.scriptProcess.stop(); scene.scriptProcess.curOp_0 = null; scene.scriptProcess.prev = null;
          c.game.screenStack_0.changeScreen_2o7n0o$(scene);
        }
        FmjChoice.clear();
        FmjPreferences.set('storyScope', 'complete');
        if (!JSON.parse(bbkGetCheatState()).randomBattleDisabled) bbkApplyCheat('fmj_random_battle');
      })()`);
      const selected = JSON.parse(await browser.evaluate(`bbkSelectFmjStage(${JSON.stringify(stage)})`));
      assert.equal(selected.ok, true, JSON.stringify(selected));
      for (let i = 0; i < 200; i++) {
        if (!await browser.evaluate('FmjGuide.state()?.busy')) break;
        await browser.evaluate('bbkSendInput("confirm")');
        await delay(10);
      }
      const before = await browser.evaluate('FmjGuide.state()');
      assert.equal(before.busy, false, stage + ' 应处于可操作状态');
      // 金庸该场景包含支线委托，让真实任务规划选中此委托，而不是跨城主线。
      if (gameId === 'jyqxz') await browser.evaluate(`(() => {
        FmjGuide.engine.nextGoal = () => ({ label: '药品委托', scriptId: '11:26', event: 1 });
      })()`);
      const observed = await browser.evaluate(`(async () => {
        const scene = window['fmj.core'].fmj.game.mainScene, process = scene.scriptProcess;
        const original = process.triggerEvent_za3lpa$, events = [];
        process.triggerEvent_za3lpa$ = function (id) { events.push(id); return original.call(this, id); };
        try {
          const goal = FmjGuide.engine.nextGoal(FmjGuide.state());
          const result = await bbkGoToFmjNextGoal();
          return { goal, result, events, running: FmjGuide.state().busy,
            operation: process.curOp_0?.constructor?.name,
            choice: FmjChoice.inspect() };
        } finally { process.triggerEvent_za3lpa$ = original; }
      })()`);
      assert.equal(observed.result.ok, true, JSON.stringify({ stage, observed }));
      assert.ok(observed.events.includes(observed.goal.event), stage + ' 到达后应自动触发原目标事件：' + JSON.stringify(observed));
      assert.ok(observed.result.stopped === 'story' || observed.result.stopped === 'battle' || observed.running,
        stage + ' 应在原剧情开始时交还操作');
      if (observed.choice) assert.equal(observed.choice.answered, undefined, '导航不能选择分支');
      console.log(gameId + ' ' + stage + ' 自动触发原事件 ' + observed.goal.event + '，停在剧情/战斗。');
    }
    assert.deepEqual(browser.exceptions, []);
  } finally { browser.close(); }
}
