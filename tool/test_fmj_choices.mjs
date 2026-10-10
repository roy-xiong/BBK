import assert from 'node:assert/strict';
import { createFmjBrowser,delay } from './fmj_browser_session.mjs';

const browser=await createFmjBrowser({accelerated:true});
const ev=browser.evaluate;
try{
  await browser.cdp('Emulation.setDeviceMetricsOverride',{width:390,height:234,deviceScaleFactor:3,mobile:true});
  await browser.cdp('Emulation.setTouchEmulationEnabled',{enabled:true});
  await ev(`(()=>{const c=window['fmj.core'].fmj;c.scene.SaveLoadGame.startNewGame=true;c.game.changeScreen_gacx6e$(c.ScreenViewType.SCREEN_MAIN_GAME);})()`);
  await delay(200);
  async function openWang(){
    await ev(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene;s.scriptProcess.stop();if(!s.player)s.createActor_qt1dr2$(1,4,3);c.script.ScriptResources.globalEvents[210]=true;c.script.ScriptResources.globalEvents[211]=false;c.script.ScriptResources.globalEvents[213]=false;s.loadMap_tjonv8$(2,4,2,10);s.player.setPosInMap_vux9f0$(6,13);s.setMapScreenPos_vux9f0$(2,10);s.startChapter_vux9f0$(5,18);})()`);
    for(let i=0;i<100;i++){if(await ev('FmjGuide.state().busy===false'))break;await delay(10)}
    await ev("window['fmj.core'].fmj.game.mainScene.triggerEvent_za3lpa$(1)");
    for(let i=0;i<150;i++){
      const choice=await ev('FmjChoice.inspect()');if(choice)return choice;
      await ev('bbkSendInput("confirm")');await delay(10);
    }
    throw Error('没有进入老王的原选择事件');
  }
  const release=await openWang();
  assert.deepEqual(release.options,['放走','杀死']);
  assert.equal(await ev('FmjChoice.isOpen()'),true,'原选择操作应显示提示层并等待玩家输入');
  assert.ok(await ev('document.querySelector("#fmj-choice-layer") != null'));
  assert.equal(await ev('fmj.updateInterval===null'),false,'说明提示不能暂停或接管原游戏');
  assert.equal(await ev('document.querySelectorAll("#fmj-choice-layer button").length'),0,'提示里不能出现替代原游戏的选项按钮');
  await ev('bbkSendInput("confirm")');
  for(let i=0;i<400;i++){if(await ev("window['fmj.core'].fmj.script.ScriptResources.globalEvents[211]"))break;await ev('bbkSendInput("confirm")');await delay(10);}
  assert.equal(await ev("window['fmj.core'].fmj.script.ScriptResources.globalEvents[211]"),true,'原确认键必须执行放走分支');
  assert.equal(await ev("window['fmj.core'].fmj.script.ScriptResources.globalEvents[213]"),false);
  assert.equal(await ev('FmjChoice.isOpen()'),false);
  assert.equal((await ev(`FmjChoice.answer(${release.id},1)`)).ok,false,'过期选择不能改写已完成的分支');
  const kill=await openWang();
  assert.equal((await ev(`FmjChoice.answer(${kill.id},1)`)).ok,true);
  await delay(120);
  const nextText=await ev(`(()=>{const o=window['fmj.core'].fmj.game.mainScene.scriptProcess.curOp_0;return o?.closure$text?sysGbkDecode(o.closure$text):''})()`);
  assert.ok(nextText.includes('不要听他的鬼话'),'杀死选项必须回到原脚本的另一条对白');
  assert.equal(await ev('FmjChoice.isOpen()'),false);

  await ev("bbkApplyCheat('fmj_invincible');bbkApplyCheat('fmj_one_hit_kill');");
  for(let i=0;i<1000;i++){
    if(await ev("window['fmj.core'].fmj.script.ScriptResources.globalEvents[213]"))break;
    await ev(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene,b=c.combat.Combat.Companion.sInstance_0;if(s.scriptProcess.running)bbkSendInput('confirm');else if(c.combat.Combat.Companion.IsActive()){if(b.mCombatState_0.name==='SelectAction')b.onAutoAttack();else if(b.mCombatState_0.name==='Win')b.onKeyUp_za3lpa$(c.Global.KEY_ENTER);}})()`);await delay(10);
  }
  assert.equal(await ev("window['fmj.core'].fmj.script.ScriptResources.globalEvents[213]"),true,'杀死老王应正常经过原战斗进入对应完成分支');
  assert.equal(await ev("window['fmj.core'].fmj.script.ScriptResources.globalEvents[211]"),false);

  // 三选一使用原菜单指令和原返回变量，验证确认与取消两种输入。
  async function menu(){
    await ev(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene;s.scriptProcess.stop();s.scriptProcess.curOp_0=null;const words=sysGbkEncode('第一项 第二项 第三项'),code=new Int8Array(2+words.length+1);code[0]=42;code.set(words,2);const command=c.game.vm.instructions_0[64](code,0),op=command.run_fhed9o$(c.game.vm);s.scriptProcess.curOp_0=op;})()`);
    return ev('FmjChoice.inspect()');
  }
  const third=await menu();assert.deepEqual(third.options,['第一项','第二项','第三项']);
  assert.equal((await ev(`FmjChoice.answer(${third.id},2)`)).ok,true);
  assert.equal(await ev("window['fmj.core'].fmj.script.ScriptResources.variables[42]"),3);
  const cancelled=await menu();
  assert.equal((await ev(`FmjChoice.answer(${cancelled.id},-1)`)).ok,true);
  assert.equal(await ev("window['fmj.core'].fmj.script.ScriptResources.variables[42]"),0);
  assert.deepEqual(browser.exceptions,[]);
  console.log('剧情选择提示通过：原游戏确认交互、提示层不暂停、过期回应拒绝、三选一及取消原返回值。');
}finally{browser.close()}
