import assert from 'node:assert/strict';
import {createFmjBrowser, delay} from './fmj_browser_session.mjs';

/** 战斗中的前往按钮沿原 A 键完成选择攻击和选择目标，不启动道路规划。 */
for (const gameId of ['fmj', 'jyqxz']) {
  const b = await createFmjBrowser({gameId, accelerated: true});
  try {
    const stage = gameId === 'fmj' ? 'stage-001' : 'scene-11:26';
    await b.evaluate(`bbkSelectFmjStage(${JSON.stringify(stage)})`);
    for (let i = 0; i < 100; i++) {
      if (!await b.evaluate('FmjGuide.state()?.busy')) break;
      await b.evaluate("bbkSendInput('confirm')"); await delay(10);
    }
    const observed = await b.evaluate(`(async () => {
      sysSetGameLoopPaused(true);
      const c = window['fmj.core'].fmj, scene = c.game.mainScene;
      scene.scriptProcess.stop(); scene.scriptProcess.curOp_0 = null; scene.scriptProcess.prev = null;
      c.combat.Combat.Companion.EnterFight_dnhp7$(c.game.vm, 0,
        new Int32Array([1, 0, 0]), new Int32Array([1, 1, 1]),
        new Int32Array([0, 0, 0]), new Int32Array([0, 0, 0]), 0, 0);
      const combat = c.combat.Combat.Companion.sInstance_0, original = combat.onKeyDown_za3lpa$;
      let keys = [], phases = [];
      combat.onKeyDown_za3lpa$ = function (key) { keys.push(key); return original.call(this, key); };
      FmjGuide.engine.taskPlan = () => { throw Error('战斗中不应寻路'); };
      for (let i = 0; i < 2; i++) {
        const result = await bbkGoToFmjNextGoal();
        phases.push({result, keys: keys.splice(0), state: combat.mCombatState_0.name,
          screen: combat.mCombatUI_0.mScreenStack_0.getCurScreen().constructor.name});
      }
      return {phases, queued: combat.mActionQueue_0.size};
    })()`);
    for (const phase of observed.phases) {
      assert.deepEqual(phase.keys, [7], gameId + ' 每次点击必须只发送一次原 A 键');
      assert.equal(phase.result.ok, true);
      assert.equal(phase.result.mode, 'confirm');
    }
    assert.equal(observed.phases[0].screen, 'CombatUI$MenuCharacterSelect');
    assert.equal(observed.phases[1].state, 'PerformAction');
    assert.ok(observed.queued > 0, '原攻击必须进入行动队列');
    assert.deepEqual(b.exceptions, []);
    console.log(gameId + ' 战斗前往按钮通过：原 A 键、攻击选择、目标确认与行动队列，不触发导航。');
  } finally { b.close(); }
}
