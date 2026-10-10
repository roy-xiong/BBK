import assert from 'node:assert/strict';
import { createFmjBrowser, delay } from './fmj_browser_session.mjs';

/** 自动战斗只调用原攻击流程，并在对白/子菜单期间让出控制。 */
const browser = await createFmjBrowser({ accelerated: true });
try {
  await browser.evaluate(`(()=>{const c=window['fmj.core'].fmj;c.scene.SaveLoadGame.startNewGame=true;c.game.changeScreen_gacx6e$(c.ScreenViewType.SCREEN_MAIN_GAME);})()`);
  await delay(100);
  const result = await browser.evaluate(`(()=>{
    const c=window['fmj.core'].fmj,s=c.game.mainScene;
    if(!s.player)s.createActor_qt1dr2$(1,4,3);s.scriptProcess.stop();s.scriptProcess.curOp_0=null;s.scriptProcess.prev=null;
    c.combat.Combat.Companion.EnterFight_dnhp7$(c.game.vm,0,new Int32Array([1,0,0]),new Int32Array([1,1,1]),new Int32Array([0,0,0]),new Int32Array([0,0,0]),0,0);
    bbkSetFmjAutoBattle(true);return {enabled:JSON.parse(bbkGetFmjAutoBattle()).enabled};
  })()`);
  assert.equal(result.enabled, true);
  let state = null;
  for(let i=0;i<100;i++){ await delay(10); state=await browser.evaluate(`(()=>{const b=window['fmj.core'].fmj.combat.Combat.Companion.sInstance_0;return {combat:b.mCombatState_0.name,auto:b.mIsAutoAttack_0,queue:b.mActionQueue_0.size}})()`);if(state.combat==='PerformAction')break; }
  assert.equal(state.combat,'PerformAction','自动战斗应进入原攻击行动阶段');
  assert.equal(state.auto,true);
  assert.ok(state.queue>0);
  await browser.evaluate('bbkSetFmjAutoBattle(false)');
  assert.deepEqual(browser.exceptions,[]);
  console.log('自动战斗回归通过：按钮状态、原攻击队列与战斗状态机。');
} finally { browser.close(); }
