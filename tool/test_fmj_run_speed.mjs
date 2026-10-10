import assert from 'node:assert/strict';
import {createFmjBrowser,delay} from './fmj_browser_session.mjs';
const b=await createFmjBrowser();
try{
  await b.evaluate(`(()=>{const c=window['fmj.core'].fmj;c.scene.SaveLoadGame.startNewGame=true;c.game.changeScreen_gacx6e$(c.ScreenViewType.SCREEN_MAIN_GAME);window.sysDrawScreen=function(){}})()`);
  await delay(100);
  await b.evaluate(`(()=>{
    const c=window['fmj.core'].fmj,s=c.game.mainScene;s.scriptProcess.stop();s.scriptProcess.curOp_0=null;if(!s.player)s.createActor_qt1dr2$(1,4,3);
    s.startChapter_vux9f0$(2,12);
  })()`);
  for(let i=0;i<60;i++){if(!await b.evaluate('FmjGuide.state()?.busy'))break;await delay(10)}
  await b.evaluate(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene;s.scriptProcess.stop();s.loadMap_tjonv8$(2,11,1,5);s.deleteAllNpc();s.player.setPosInMap_vux9f0$(5,8);s.setMapScreenPos_vux9f0$(1,5);c.combat.Combat.Companion.FightDisable();const map=s.currentMap;for(let i=0;i<map.mData_0.length;i+=2){map.mData_0[i]=-128;map.mData_0[i+1]=0}FmjGuide.engine.maps.get('2:11').cells.fill(128)})()`);
  const cycles=await b.evaluate(`(()=>{sysSetGameLoopPaused(true);const before=fmj.updateIntervalPeriod;const cycles=[1,2,3,4,1].map((_,i)=>JSON.parse(i?bbkCycleFmjRunSpeed():bbkGetFmjRunSpeed()).multiplier);const paused=fmj.updateInterval===null;sysSetGameLoopPaused(false);return {cycles,before,after:fmj.updateIntervalPeriod,paused}})()`);
  assert.deepEqual(cycles.cycles,[1,2,3,4,1]);assert.equal(cycles.paused,true);assert.equal(cycles.after,cycles.before);
  async function walk(speed){return b.evaluate(`(async()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene;s.player.setPosInMap_vux9f0$(5,8);s.setMapScreenPos_vux9f0$(1,5);bbkSetFmjRunSpeed(${speed});const flags=JSON.stringify(FmjGuide.state().flags),start=performance.now(),result=await FmjGuide.travel({scriptId:'2:12',x:15,y:8});return {elapsed:performance.now()-start,result,pos:[s.player.posInMap.x,s.player.posInMap.y],same:flags===JSON.stringify(FmjGuide.state().flags)}})()`)}
  const normal=await walk(1),fast=await walk(4);
  for(const r of [normal,fast]){assert.equal(r.result.ok,true);assert.deepEqual(r.pos,[15,8]);assert.equal(r.same,true)}
  assert.ok(fast.elapsed<normal.elapsed*.65,'4× 应实际缩短相同路径的跑路时间');
  assert.deepEqual(b.exceptions,[]);console.log(JSON.stringify({test:'自动跑路倍速',cycle:cycles.cycles,oneMs:Math.round(normal.elapsed),fourMs:Math.round(fast.elapsed),storyClock:cycles.after}));
}finally{b.close()}
