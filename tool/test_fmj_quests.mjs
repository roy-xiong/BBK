import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createFmjBrowser, delay } from './fmj_browser_session.mjs';

const context={window:{}};
for(const name of ['guide-data','guide-engine','quest-engine'])vm.runInNewContext(fs.readFileSync(`assets/games/fmj/js/${name}.js`,'utf8'),context);
const engine=new context.window.FmjGuideEngine(context.window.FmjGuideData);
const flags=Array(2401).fill(false),state={scriptId:'3:5',mapId:'2:11',x:16,y:5,flags,vars:Array(240).fill(0),npcs:[],questMode:'complete',goods:{'14:3':1}};
[19,21,25,31,201,202].forEach(f=>flags[f]=true);
assert.equal(engine.nextGoal(state).id,'daughter-dong','寻女支线需先问东东，不能直接导航到未开放的蔡婆家');
flags[205]=true;assert.equal(engine.nextGoal(state).id,'daughter-xia');
flags[206]=true;assert.equal(engine.nextGoal(state).id,'daughter-accept');
flags[207]=true;flags[210]=true;flags[213]=true;
assert.equal(engine.questTasks(state).find(q=>q.id==='wang-wife').status,'skipped','处置老王后，妻子的互斥分支不能显示为待完成');
flags[254]=true;flags[264]=true;flags[234]=true;flags[252]=true;
assert.equal(engine.questTasks(state).find(q=>q.id==='violet-lamp').status,'expired','袁姑娘离队后的紫瞳对白不能冒充仍可完成');
flags[229]=true;
assert.equal(engine.questTasks(state).find(q=>q.id==='worm-card').status,'locked','无钥匙不能假装能打开锁箱');
state.goods['14:2']=1;flags[2330]=true;
assert.equal(engine.questTasks(state).find(q=>q.id==='worm-card').status,'deferred');
const original=JSON.stringify(state);engine.questTasks(state);assert.equal(JSON.stringify(state),original);
const usedFlags=new Set(context.window.FmjGuideData.scripts.flatMap(s=>s.commands.filter(c=>[11,26,27].includes(c.op)).map(c=>c.a[0])));
for(const flag of [2301,2302,2303,2313,2314,2315,2316,2330,2331,2332,2333,2334,2335])assert.equal(usedFlags.has(flag),false,'支线记录不能覆盖原剧情标记');
const keyRewards=context.window.FmjGuideData.scripts.flatMap(s=>s.commands.filter(c=>c.op===34&&c.a[0]===14&&c.a[1]===2));
assert.equal(keyRewards.length,3,'钥匙预算应来自全部原脚本奖励');
for(const script of context.window.FmjGuideData.scripts)for(const shop of script.commands.filter(c=>c.op===28)){
  for(let i=0;i<shop.a.length;i+=2)assert.ok(shop.a[i]!==2||shop.a[i+1]!==14,'有商店售卖万能钥匙时必须重新判断预算');
}

const browser=await createFmjBrowser({accelerated:true}),ev=browser.evaluate;
try{
  await ev(`(()=>{const c=window['fmj.core'].fmj;c.scene.SaveLoadGame.startNewGame=true;c.game.changeScreen_gacx6e$(c.ScreenViewType.SCREEN_MAIN_GAME);})()`);
  await delay(200);
  await ev(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene;s.scriptProcess.stop();if(!s.player)s.createActor_qt1dr2$(1,4,3);const f=c.script.ScriptResources.globalEvents;f[254]=true;f[2009]=true;f[2010]=true;const bag=c.characters.Player.Companion.sGoodsList;bag.addGoods_qt1dr2$(14,6,1);bag.addGoods_qt1dr2$(14,7,1);s.loadMap_tjonv8$(1,31,4,6);s.startChapter_vux9f0$(2,52);})()`);
  async function settleUntil(predicate){
    for(let i=0;i<500;i++){
      const r=await ev(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene;return {state:FmjGuide.state(),popup:FmjChoice.inspect(),screen:c.game.getCurScreen().constructor.name,running:s.scriptProcess.running}})()`);
      if(predicate(r))return r;
      if(r.popup)throw Error('意外出现选择框 '+JSON.stringify(r.popup));
      await ev(`bbkSendInput(${JSON.stringify(/ScreenGoodsList|BuyGoodsScreen/.test(r.screen)?'cancel':'confirm')})`);
      await delay(10);
    }
    throw Error('支线事件未完成');
  }
  await settleUntil(r=>!r.state.busy);
  await ev("window['fmj.core'].fmj.game.mainScene.triggerEvent_za3lpa$(32)");
  const ghost=await settleUntil(r=>!!r.popup);
  assert.deepEqual(ghost.popup.options,['不给','奉还']);assert.equal(ghost.popup.at,1018,'选择框必须使用原 ROM 地址，便于识别具体分支');
  await ev(`FmjChoice.answer(${ghost.popup.id},1)`);
  const afterGhost=await settleUntil(r=>!r.state.busy);
  assert.equal(afterGhost.state.goods['14:6'],0,'南方小鬼必须扣除小鬼卡片');
  assert.equal(afterGhost.state.goods['14:7'],1,'不能误扣不点卡片');
  assert.equal(afterGhost.state.flags[2303],true);assert.equal(afterGhost.state.ghostResolved,true);
  await ev("window['fmj.core'].fmj.game.mainScene.triggerEvent_za3lpa$(31)");
  const point=await settleUntil(r=>!!r.popup);await ev(`FmjChoice.answer(${point.popup.id},1)`);
  const afterPoint=await settleUntil(r=>!r.state.busy);
  assert.equal(afterPoint.state.goods['14:7'],0);assert.equal(afterPoint.state.flags[2302],true,'隐藏商店退出后应记录完成');
  assert.equal(afterPoint.state.flags[2313],false);
  // 通宵虫第二层选择同样必须经过原弹窗，兑换分支使用原版全部金钱。
  await ev(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene;c.script.ScriptResources.globalEvents[2008]=true;c.characters.Player.Companion.sGoodsList.addGoods_qt1dr2$(14,5,1);c.characters.Player.Companion.sMoney=2500;s.startChapter_vux9f0$(2,52);})()`);
  await settleUntil(r=>!r.state.busy);
  await ev("window['fmj.core'].fmj.game.mainScene.triggerEvent_za3lpa$(30)");
  const worm=await settleUntil(r=>!!r.popup);await ev(`FmjChoice.answer(${worm.popup.id},0)`);
  const trade=await settleUntil(r=>!!r.popup);assert.deepEqual(trade.popup.options,['不换','交换']);await ev(`FmjChoice.answer(${trade.popup.id},1)`);
  const afterTrade=await settleUntil(r=>!r.state.busy);
  assert.equal(afterTrade.state.flags[2301],true,'兑换衣服也属于已选择并完成的支线');
  assert.equal(await ev("window['fmj.core'].fmj.characters.Player.Companion.sMoney"),0);
  assert.equal(await ev("window['fmj.core'].fmj.characters.Player.Companion.sGoodsList.getGoodsNum_vux9f0$(2,18)"),1);
  const savedFlags=await ev(`(()=>{const c=window['fmj.core'].fmj,a=[];c.script.ScriptResources.write_vcd9jg$({writeBoolean_6taknv$(v){a.push(v)},writeInt_za3lpa$(v){a.push(v)}});c.script.ScriptResources.globalEvents[2302]=false;c.script.ScriptResources.globalEvents[2303]=false;let i=0;c.script.ScriptResources.read_setnfj$({readBoolean(){return a[i++]},readInt(){return a[i++]}});return [c.script.ScriptResources.globalEvents[2302],c.script.ScriptResources.globalEvents[2303]]})()`);
  assert.deepEqual(savedFlags,[true,true],'支线完成记录必须随原存档读取恢复');
  assert.deepEqual(browser.exceptions,[]);
  console.log('完整支线验证通过：寻女前置、互斥分支、错过时机、钥匙限制、小鬼正确交卡、隐藏商店、通宵虫两层选择与兑换、原存档恢复。');
}finally{browser.close()}
