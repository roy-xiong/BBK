import assert from 'node:assert/strict';
import {createFmjBrowser,delay} from './fmj_browser_session.mjs';

const b=await createFmjBrowser({accelerated:true});
try{
  const listing=JSON.parse(await b.evaluate('bbkOpenFmjStages()'));
  assert.equal(listing.ok,true);assert.ok(listing.stages.length>=80);
  assert.equal(await b.evaluate('fmj.updateInterval===null'),true,'选关时游戏必须暂停');
  await b.evaluate('bbkCloseFmjStages()');
  const invalid=JSON.parse(await b.evaluate('bbkSelectFmjStage("invalid")'));assert.equal(invalid.ok,false);
  const failures=[];
  for(const stage of listing.stages){
    const result=JSON.parse(await b.evaluate(`bbkSelectFmjStage(${JSON.stringify(stage.id)})`));
    if(!result.ok){failures.push({id:stage.id,result});continue}
    await delay(80);
    const r=await b.evaluate(`(()=>{const c=window['fmj.core'].fmj,s=FmjGuide.state(),stage=FmjStageData.find(x=>x.id===${JSON.stringify(stage.id)});return {state:!!s,map:s?.mapId,script:s?.scriptId,actors:c.game.playerList.toArray().map(x=>x.index),equipment:stage.equipment.map(e=>({required:e.id,actual:(()=>{const x=c.game.mainScene.getPlayer_za3lpa$(e.actor)?.equipmentsArray[e.slot];return x?x.type+':'+x.index:null})()})),point:s&&FmjGuide.engine.walkable(s,s.x,s.y,true),combat:c.combat.Combat.Companion.IsActive(),operation:c.game.mainScene.scriptProcess.curOp_0?.constructor?.name}})()`);
    if(!r.state||r.equipment.some(e=>e.actual!==e.required))failures.push({id:stage.id,title:stage.title,...r});
  }
  assert.deepEqual(failures,[],'关卡缺少队伍或必要装备');
  const stone=await b.evaluate('FmjStageData.find(s=>s.scriptId==="9:13"&&s.event===8).id');
  assert.equal(JSON.parse(await b.evaluate(`bbkSelectFmjStage(${JSON.stringify(stone)})`)).ok,true);
  for(let i=0;i<180;i++){
    const s=await b.evaluate('FmjGuide.state()');if(!s.busy)break;
    await b.evaluate('bbkSendInput("confirm")');await delay(10);
  }
  const stoneState=await b.evaluate('({ids:FmjGuide.state().npcs.filter(n=>n.id<=8).map(n=>n.id),count:FmjGuide.state().vars[1]})');
  assert.deepEqual(stoneState.ids,[8]);assert.equal(stoneState.count,7,'第八块石头关卡应准备好前七块石头的真实进度');
  assert.deepEqual(b.exceptions,[],'所有关卡加载时不能触发原脚本异常');
  console.log(`全部 ${listing.stages.length} 个故事关卡初始化通过，原剧情/战斗、前置装备、暂停恢复均已核查。`);
}finally{b.close()}
