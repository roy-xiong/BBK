import assert from 'node:assert/strict';
import { createFmjBrowser, delay } from './fmj_browser_session.mjs';

const browser = await createFmjBrowser({ accelerated: true });
try {
  await browser.evaluate(`(()=>{const c=window['fmj.core'].fmj;c.scene.SaveLoadGame.startNewGame=true;c.game.changeScreen_gacx6e$(c.ScreenViewType.SCREEN_MAIN_GAME);})()`);
  await delay(120);
  const result = await browser.evaluate(`(()=>{
    const c=window['fmj.core'].fmj,s=c.game.mainScene;
    if(!s.player)s.createActor_qt1dr2$(1,4,3);s.scriptProcess.stop();s.scriptProcess.curOp_0=null;
    const player=c.game.playerList.get_za3lpa$(0);
    const inv=JSON.parse(bbkApplyCheat('fmj_invincible'));
    player.hp=1;
    const key=JSON.parse(bbkApplyCheat('fmj_master_key'));
    const level=JSON.parse(bbkApplyCheat('fmj_level'));
    c.combat.Combat.Companion.EnterFight_dnhp7$(c.game.vm,0,new Int32Array([1,0,0]),new Int32Array([1,1,1]),new Int32Array([0,0,0]),new Int32Array([0,0,0]),0,0);
    const force=JSON.parse(bbkApplyCheat('fmj_force_win'));
    return {inv,key,level,force,hp:player.hp,maxHP:player.maxHP,levelNow:player.level,levelMax:player.levelupChain.maxLevel,learned:player.magicChain.learnNum,learnable:player.magicChain.magicSum_0,keys:c.characters.Player.Companion.sGoodsList.getGoodsNum_vux9f0$(14,2),monsters:c.combat.Combat.Companion.sInstance_0.mMonsterList_0.toArray().map(m=>m.hp)};
  })()`);
  await delay(40);
  assert.equal(result.inv.ok,true);assert.equal(result.key.ok,true);assert.equal(result.level.ok,true);assert.equal(result.force.ok,true);
  assert.equal(result.hp,result.maxHP);assert.equal(result.levelNow,result.levelMax);assert.equal(result.learned,result.learnable);
  assert.ok(result.keys>=99);assert.ok(result.monsters.every(hp=>hp===0));
  assert.deepEqual(browser.exceptions,[]);
  console.log('作弊回归通过：无敌监控、满级与成长链法术、先手排序、战斗胜利、99 把万能钥匙。');
} finally { browser.close(); }
