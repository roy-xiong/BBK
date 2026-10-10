import assert from 'node:assert/strict';
import { createFmjBrowser, delay } from './fmj_browser_session.mjs';

/** 通过和手机相同的 bbkSendInput 字符串，验证法术菜单到行动队列的完整链路。 */
const browser = await createFmjBrowser({ accelerated: true });
try {
  await browser.evaluate(`(()=>{const c=window['fmj.core'].fmj;c.scene.SaveLoadGame.startNewGame=true;c.game.changeScreen_gacx6e$(c.ScreenViewType.SCREEN_MAIN_GAME);})()`);
  await delay(120);
  const result = await browser.evaluate(`(()=>{
    const c=window['fmj.core'].fmj,s=c.game.mainScene;
    if(!s.player)s.createActor_qt1dr2$(1,4,3);
    s.scriptProcess.stop();
    const player=c.game.playerList.get_za3lpa$(0),magic=c.lib.DatLib.Companion.getMrs_vux9f0$(1,1);
    if(!magic)throw Error('测试法术资源不存在');
    player.mp=999;player.learnMagic_3fncnk$(magic);
    c.combat.Combat.Companion.EnterFight_dnhp7$(c.game.vm,0,new Int32Array([1,0,0]),new Int32Array([1,1,1]),new Int32Array([0,0,0]),new Int32Array([0,0,0]),0,0);
    bbkSendInput('left');bbkSendInput('confirm');
    const magicScreen=c.combat.Combat.Companion.sInstance_0.mCombatUI_0.mScreenStack_0.getCurScreen().constructor.name;
    bbkSendInput('confirm');
    const targetScreen=c.combat.Combat.Companion.sInstance_0.mCombatUI_0.mScreenStack_0.getCurScreen().constructor.name;
    bbkSendInput('confirm');
    const combat=c.combat.Combat.Companion.sInstance_0;
    return {magicScreen,targetScreen,state:combat.mCombatState_0.name,queued:combat.mActionQueue_0.size,mp:player.mp};
  })()`);
  assert.equal(result.magicScreen, 'ScreenMagic', '法术入口没有打开原法术列表');
  assert.equal(result.targetScreen, 'CombatUI$MenuCharacterSelect', '确认法术后没有进入原目标选择');
  assert.equal(result.state, 'PerformAction', '确认目标后没有生成战斗行动');
  assert.ok(result.queued > 0, '法术行动没有进入原行动队列');
  assert.equal(result.mp, 100, '测试法术没有按原规则扣除真气');
  assert.deepEqual(browser.exceptions, []);
  console.log('战斗法术回归通过：手机输入链路、原法术列表、目标选择、行动队列与真气扣除。');
} finally { browser.close(); }
