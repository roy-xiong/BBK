import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createFmjBrowser,delay} from './fmj_browser_session.mjs';

const b=await createFmjBrowser({gameId:'jyqxz',accelerated:true});
const report={game:'jyqxz',checks:[],stageFailures:[]};
async function stable(limit=200){
  for(let i=0;i<limit;i++){
    const state=await b.evaluate('FmjGuide.state()');if(state&&!state.busy)return;
    await b.evaluate(`(()=>{const choice=FmjChoice.inspect();if(choice)FmjChoice.answer(choice.id,0);else bbkSendInput('confirm');if(window['fmj.core'].fmj.combat.Combat.Companion.IsActive())bbkApplyCheat('fmj_force_win');})()`);
    await delay(10);
  }
  throw Error('原剧情未在预期内回到主场景：'+JSON.stringify(await b.evaluate(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene,f=c.combat.Combat.Companion.sInstance_0;return {screen:c.game.getCurScreen().constructor.name,run:s.scriptProcess.running,op:s.scriptProcess.curOp_0?.constructor.name,fighting:c.combat.Combat.Companion.IsActive(),combat:f?.mCombatState_0.name,errors:__fmjAuditNotices.slice(-3)};})()`))+' exceptions='+JSON.stringify(b.exceptions));
}
async function select(id){
  // 场景索引检查允许在测试环境中结束上一节点；不把此动作加入产品选关实现。
  await b.evaluate(`(()=>{const c=window['fmj.core'].fmj;c.combat.Combat.Companion.FightDisable();if(c.game.mainScene){c.game.mainScene.scriptProcess.stop();c.game.mainScene.scriptProcess.curOp_0=null;c.game.mainScene.scriptProcess.prev=null;c.game.screenStack_0.changeScreen_2o7n0o$(c.game.mainScene);}FmjChoice.clear();})()`);
  const result=JSON.parse(await b.evaluate(`bbkSelectFmjStage(${JSON.stringify(id)})`));
  assert.equal(result.ok,true,JSON.stringify({id,result}));await delay(40);return result;
}
try{
  const ready=await b.evaluate(`({ready:document.body.dataset.gameReady,wide:FmjWideView.state(),maps:FmjGuideData.maps.length,world:FmjGuideData.world,stages:JyqxzStages.data.length})`);
  assert.equal(ready.ready,'true');assert.equal(ready.wide.width,320);assert.equal(ready.wide.height,192);assert.equal(ready.maps,32);
  assert.ok(ready.world.links.length>0);assert.ok(ready.world.components.some(c=>c.nodes.length>10));
  report.checks.push('离线资源、320×192 远视野、世界真实连接');
  await b.evaluate(`localStorage.setItem('sav/fmjsave0','fmj-sentinel');`);
  assert.equal(await b.evaluate(`sysStorageHas('sav/fmjsave0')`),false);
  await b.evaluate(`sysStorageSet('sav/jyqxz-isolation-test','jyqxz-sentinel')`);
  const isolation=await b.evaluate(`({fmj:localStorage.getItem('sav/fmjsave0'),jy:localStorage.getItem('jyqxz:sav/jyqxz-isolation-test'),exported:JSON.parse(bbkExportState())})`);
  assert.equal(isolation.fmj,'fmj-sentinel');assert.equal(isolation.jy,'jyqxz-sentinel');assert.equal(isolation.exported['sav/fmjsave0'],undefined);
  // 删除哨兵，避免正常档位格式检查将测试字符串当作原存档。
  await b.evaluate(`localStorage.removeItem('sav/fmjsave0');`);
  report.checks.push('同 Origin 的 FMJ/JYQXZ 存档不串档');

  // 正常新游戏走原对白和角色选择，不通过选关伪造开场。
  await b.evaluate(`(()=>{const c=window['fmj.core'].fmj;c.scene.SaveLoadGame.startNewGame=true;c.game.changeScreen_gacx6e$(c.ScreenViewType.SCREEN_MAIN_GAME);})()`);
  await stable();
  assert.equal(await b.evaluate('FmjGuide.state().actor'),1);
  assert.equal(await b.evaluate('FmjGuide.state().scriptId'),'9:11');
  const cover=await b.evaluate(`(()=>{const game=window['fmj.core'].fmj.game;game.draw();FmjHdRenderer.draw(document.getElementById('lcd'),game.canvas_0.buffer,game.canvas_0.width,game.canvas_0.height);return document.getElementById('lcd').toDataURL('image/png').split(',')[1]})()`);
  if(process.argv.includes('--capture'))fs.writeFileSync('assets/images/jyqxz_cover.png',Buffer.from(cover,'base64'));
  report.checks.push('原开场、角色选择、男主京城起点');

  await select('school-195');await stable();
  assert.equal(await b.evaluate('FmjGuide.state().actor'),2);
  assert.equal(await b.evaluate('FmjGuide.state().scriptId'),'11:1');
  report.checks.push('女主与女性门派节点');
  await select('scene-9:11');await stable();
  const switches=await b.evaluate(`(()=>{const first=JSON.parse(bbkToggleWideView()),second=JSON.parse(bbkToggleWideView());const hd=JSON.parse(bbkSetHighDefinition(true));const speed=[JSON.parse(bbkGetFmjRunSpeed()).multiplier,...[1,2,3,4].map(()=>JSON.parse(bbkCycleFmjRunSpeed()).multiplier)];return {first,second,hd,speed}})()`);
  assert.equal(switches.first.width,160);assert.equal(switches.second.width,320);assert.equal(switches.hd.ok,true);assert.deepEqual(switches.speed,[1,2,3,4,1]);
  report.checks.push('1×/2× 视角切换、高清、跑路 1～4×');

  const walk=await b.evaluate(`(async()=>{const c=window['fmj.core'].fmj;c.combat.Combat.Companion.FightDisable();const state=FmjGuide.state(),flood=FmjGuide.engine.flood(state),index=flood.distance.findIndex(d=>d>=8&&d<=12);if(index<0)throw Error('测试地图没有可行走路线');const x=index%flood.map.width,y=Math.floor(index/flood.map.width),flags=JSON.stringify(state.flags),money=c.characters.Player.Companion.sMoney;bbkSetFmjRunSpeed(4);const result=await FmjGuide.travel({scriptId:state.scriptId,x,y});const after=FmjGuide.state();return {result,target:[x,y],actual:[after.x,after.y],flagsSame:flags===JSON.stringify(after.flags),moneySame:money===c.characters.Player.Companion.sMoney};})()`);
  assert.equal(walk.result.ok,true);assert.deepEqual(walk.actual,walk.target);assert.equal(walk.flagsSame,true);assert.equal(walk.moneySame,true);
  report.checks.push('真实地图逐格寻路，旗标与金钱保持一致');

  // 商店正常出口必须回到城镇，而不是把 type=1 店铺误判为室外。
  await select('scene-9:13');await stable();
  const exit=await b.evaluate(`(async()=>{const s=FmjGuide.state(),plan=FmjGuide.engine.exitPlan(s),result=await bbkGoToFmjExit();return {before:s.mapId,planUnavailable:plan.unavailable||false,result,after:FmjGuide.state().mapId}})()`);
  assert.equal(exit.planUnavailable,false);assert.equal(exit.result.ok,true);assert.equal(exit.after,'9:1');
  report.checks.push('店铺沿原出口返回京城');

  const mainRoute=await b.evaluate(`(()=>{FmjPreferences.set('storyScope','main');const s=FmjGuide.state(),p=FmjGuide.engine.taskPlan(s);return {goal:p.goal,unavailable:p.unavailable||false,steps:p.steps?.length,boundary:!!p.boundary}})()`);
  assert.equal(mainRoute.goal.flag,1001);assert.equal(mainRoute.unavailable,false);
  report.checks.push('京城至雁门关主线跨图规划');

  const blockedMenu=JSON.parse(await b.evaluate('bbkOpenSaveMenu()'));assert.equal(blockedMenu.ok,false);assert.match(blockedMenu.message,/不能存档/);
  await select('scene-2:1');await stable();
  const menu=JSON.parse(await b.evaluate('bbkOpenSaveMenu()'));assert.equal(menu.ok,true,JSON.stringify(menu));
  await b.evaluate(`bbkSendInput('confirm')`);await delay(60);
  const save=await b.evaluate(`({raw:sysStorageGet('sav/fmjsave0'),fmj:localStorage.getItem('sav/fmjsave0'),jy:localStorage.getItem('jyqxz:sav/fmjsave0')})`);
  assert.ok(save.raw?.length>1000);assert.equal(save.fmj,null);assert.equal(save.jy,save.raw);
  await b.evaluate(`window.__jyTestSave=sysStorageGet('sav/fmjsave0');`);
  await select('scene-11:11');await stable();
  const backupRestored=JSON.parse(await b.evaluate(`bbkSelectFmjStage('restore-backup')`));assert.equal(backupRestored.ok,true,JSON.stringify(backupRestored));await stable();assert.equal(await b.evaluate('FmjGuide.state().mapId'),'2:1');
  await select('scene-11:11');await stable();
  const restored=await b.evaluate(`(()=>{const m=window['fmj.core'],c=m.fmj,screen=new c.views.ScreenSaveLoadGame(c.game.mainScene,c.views.ScreenSaveLoadGame.Operate.LOAD,1);const ok=screen.loadGame_0(new m.java.File('sav/fmjsave0'));c.scene.SaveLoadGame.startNewGame=false;c.game.changeScreen_gacx6e$(c.ScreenViewType.SCREEN_MAIN_GAME);return ok;})()`);
  assert.equal(restored,true);await stable();assert.equal(await b.evaluate('FmjGuide.state().mapId'),'2:1');
  report.checks.push('原档位保存、原引擎读档、地图恢复、选关备份');

  const cheats=await b.evaluate(`(()=>{const c=window['fmj.core'].fmj,results=['fmj_invincible','fmj_one_hit_kill','fmj_normal_attack_all','fmj_restore','fmj_money','fmj_stats','fmj_level','fmj_master_key','jyqxz_all_goods','fmj_random_battle'].map(a=>[a,JSON.parse(bbkApplyCheat(a))]);const p=c.game.playerList.toArray()[0];bbkSetFmjAutoBattle(true);return {results,level:p.level,max:p.levelupChain.maxLevel,learned:p.getAllMagics().size,all:FmjGuideData.skills.filter(s=>s.actors.includes(p.index)).length,goods:FmjGuideData.goods.every(g=>{const k=g.id.split(':').map(Number);return c.characters.Player.Companion.sGoodsList.getGoodsNum_vux9f0$(k[0],k[1])>=99;})};})()`);
  assert.ok(cheats.results.every(([,r])=>r.ok),JSON.stringify(cheats.results));assert.equal(cheats.level,cheats.max);assert.ok(cheats.learned>=cheats.all);assert.equal(cheats.goods,true);
  await select('story-1001');
  for(let i=0;i<200&&!await b.evaluate("window['fmj.core'].fmj.combat.Combat.Companion.IsActive()");i++){
    await b.evaluate("bbkSendInput('confirm')");await delay(10);
  }
  assert.equal(await b.evaluate("window['fmj.core'].fmj.combat.Combat.Companion.IsActive()"),true);
  const force=JSON.parse(await b.evaluate("bbkApplyCheat('fmj_force_win')"));assert.equal(force.ok,true);
  await stable();assert.equal(await b.evaluate('FmjGuide.state().flags[1001]'),true);
  report.checks.push('11 项作弊、主角武功、自动战斗、真实剧情战胜利结算');

  await select('scene-11:26');await stable();
  const medicine=await b.evaluate(`(async()=>{const c=window['fmj.core'].fmj;c.characters.Player.Companion.sGoodsList.addGoods_qt1dr2$(9,1,1);const before=c.characters.Player.Companion.sMoney,result=await FmjGuide.travel({scriptId:'11:26',event:1});bbkSendInput('confirm');return {before,result};})()`);
  assert.equal(medicine.result.ok,true);await stable();
  // 第一段只接受委托；第二次原确认才完成实际交药，不能将接受旗标报为完成。
  if(!await b.evaluate('FmjGuide.state().flags[2350]')){await b.evaluate("bbkSendInput('confirm')");await stable();}
  const delivery=await b.evaluate(`({done:FmjGuide.state().flags[2350],accepted:FmjGuide.state().flags[38],money:window['fmj.core'].fmj.characters.Player.Companion.sMoney,goods:FmjGuide.state().goods['9:1']})`);
  assert.equal(delivery.done,true);assert.equal(delivery.accepted,false);assert.equal(delivery.money,medicine.before+120);assert.equal(delivery.goods,0);
  report.checks.push('支线交付后才标记完成，保留原道具消费与 120 两奖励');

  await select('scene-9:11');await stable();
  await b.evaluate(`FmjPreferences.set('storyScope','complete');`);
  const optional=await b.evaluate(`FmjGuide.travel({scriptId:'9:11',event:9})`);assert.equal(optional.ok,true);
  await b.evaluate(`bbkSendInput('confirm')`);
  for(let i=0;i<200&&!await b.evaluate('!!FmjChoice.inspect()');i++){await b.evaluate("if(!FmjChoice.inspect())bbkSendInput('confirm')");await delay(10);}
  const declined=await b.evaluate(`(()=>{const choice=FmjChoice.inspect();if(!choice)throw Error('未出现原二选一');const index=choice.options.findIndex(s=>s.includes('不帮'));if(index<0)throw Error('原选项未找到');return FmjChoice.answer(choice.id,index);})()`);
  assert.equal(declined.ok,true);await stable();
  const deferred=await b.evaluate(`(()=>{const s=FmjGuide.state(),row=FmjGuide.engine.questTasks(s).find(t=>t.id==='earring');return {status:row.status,accepted:s.flags[25],next:FmjGuide.engine.nextGoal(s).id};})()`);
  assert.equal(deferred.status,'deferred');assert.equal(deferred.accepted,false);assert.notEqual(deferred.next,'earring');
  report.checks.push('原分支拒绝后支线暂缓，完整流程不重复强迫接受');

  const listing=JSON.parse(await b.evaluate('bbkOpenFmjStages()'));
  assert.equal(await b.evaluate('fmj.updateInterval===null'),true);await b.evaluate('bbkCloseFmjStages()');
  for(const stage of listing.stages.filter(s=>s.id!=='restore-backup')){
    try{await select(stage.id);const state=await b.evaluate(`(()=>{const s=FmjGuide.state();return {map:s?.mapId,actor:s?.actor,script:s?.scriptId,navigation:!!FmjGuide.engine.maps.get(s?.mapId)}})()`);assert.ok(state.map&&state.actor&&state.navigation);}
    catch(error){report.stageFailures.push({id:stage.id,title:stage.title,error:String(error)});}
  }
  assert.deepEqual(report.stageFailures,[]);report.checks.push('全部 '+listing.stages.filter(s=>s.id!=='restore-backup').length+' 个节点加载与原地图身份检查');
  await select('scene-9:11');await stable();
  const guide=JSON.parse(await b.evaluate('bbkOpenFmjGuide()'));assert.equal(guide.ok,true);
  assert.equal(await b.evaluate('fmj.updateInterval===null'),true);assert.equal(await b.evaluate('document.querySelector("#fmj-guide h1").textContent'),'金庸群侠传 · 剧情与世界地图');
  assert.equal(await b.evaluate('document.querySelectorAll("[data-jy-goal]").length>10'),true);
  const mobile=await b.cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(80);
  if(process.argv.includes('--capture')){const shot=await b.cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/Users/xiongjian/Downloads/JYQXZ-地图与任务.png',Buffer.from(shot.data,'base64'));}
  await b.evaluate('FmjGuide.close()');assert.equal(await b.evaluate('fmj.updateInterval!=null'),true);
  report.checks.push('地图 DOM、任务与门派入口、手机尺寸、暂停恢复');
  const savedState=await b.evaluate(`sysStorageGet('sav/fmjsave0')`);
  await b.evaluate(`bbkSetFmjRunSpeed(3);bbkSetFmjAutoBattle(true);FmjWideView.setEnabled(false);FmjPreferences.set('storyScope','main');`);
  const preferences=await b.evaluate(`JSON.parse(bbkExportState())['bbk/jyqxz_controls']`);assert.ok(preferences);
  for(const id of ['fmj','jyqxz']){
    await b.cdp('Page.navigate',{url:b.baseUrl+'/'+id+'/index.html?graphics=classic'});
    for(let i=0;i<100;i++){if(await b.evaluate(`location.pathname.startsWith('/${id}/')&&document.body?.dataset.gameReady==='true'`))break;await delay(50);}
    assert.equal(await b.evaluate(`sysStorageHas('sav/fmjsave0')`),id==='jyqxz');
    if(id==='fmj')assert.equal(await b.evaluate('JSON.parse(bbkGetFmjRunSpeed()).multiplier'),1,'FMJ 不能继承 JYQXZ 的奔跑设置');
  }
  assert.equal(await b.evaluate(`sysStorageGet('sav/fmjsave0')`),savedState);
  const settings=await b.evaluate(`({speed:JSON.parse(bbkGetFmjRunSpeed()).multiplier,auto:JSON.parse(bbkGetFmjAutoBattle()).enabled,wide:FmjWideView.state().enabled,controls:JSON.parse(bbkExportState())['bbk/jyqxz_controls']})`);
  assert.equal(settings.speed,3);assert.equal(settings.auto,true);assert.equal(settings.wide,false);assert.equal(settings.controls,preferences);
  const backup=await b.evaluate('JSON.parse(bbkExportState())');
  const restore=await b.cdp('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const open=XMLHttpRequest.prototype.open,send=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(method,url){this.__jyBackup=url==='/__state__/jyqxz';return open.apply(this,arguments);};XMLHttpRequest.prototype.send=function(){if(!this.__jyBackup)return send.apply(this,arguments);Object.defineProperty(this,'status',{value:200});Object.defineProperty(this,'responseText',{value:${JSON.stringify(JSON.stringify({entries:backup}))}});};})()`});
  await b.evaluate('localStorage.clear();window.__jyOldPage=true');await b.cdp('Page.reload');
  for(let i=0;i<100;i++){if(await b.evaluate('!window.__jyOldPage&&document.body?.dataset.gameReady===\'true\''))break;await delay(50);}
  assert.equal(await b.evaluate('JSON.parse(bbkGetFmjRunSpeed()).multiplier'),3);assert.equal(await b.evaluate(`sysStorageGet('sav/fmjsave0')`),savedState);assert.equal(await b.evaluate(`JSON.parse(bbkExportState())['bbk/jyqxz_controls']`),preferences);
  await b.cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier:restore.identifier});
  report.checks.push('视野、自动战斗、跑路与作弊开关独立持久化，并从 Flutter 镜像恢复');
  report.checks.push('同浏览器 FMJ→JYQXZ 切换、页面重建后原档仍可见');
  assert.deepEqual(b.exceptions,[],'原引擎或增强脚本不能抛异常');
  report.stages=listing.stages.filter(s=>s.id!=='restore-backup').length;report.browserExceptions=b.exceptions.length;
  fs.writeFileSync('/tmp/jyqxz-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{b.close();}
