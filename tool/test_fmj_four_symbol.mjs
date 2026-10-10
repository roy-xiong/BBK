import assert from 'node:assert/strict';
import { createFmjBrowser, delay } from './fmj_browser_session.mjs';

/** 四象阵柱子：一键到达后自动面对并触发原 NPC 事件。 */
const browser = await createFmjBrowser({ accelerated: true });
try {
  await browser.evaluate(`(()=>{const c=window['fmj.core'].fmj;c.scene.SaveLoadGame.startNewGame=true;c.game.changeScreen_gacx6e$(c.ScreenViewType.SCREEN_MAIN_GAME);localStorage.setItem('bbk/fmj_story_scope','main');})()`);
  await delay(100);
  await browser.evaluate(`(()=>{
    const c=window['fmj.core'].fmj,s=c.game.mainScene;
    if(!s.player)s.createActor_qt1dr2$(1,4,3);s.scriptProcess.stop();
    const f=c.script.ScriptResources.globalEvents;
    [19,21,25,31,202,203,204,208,209,210,215,216,217,218,219,220,221,224,225,226,227,228,229,230,231,232,233,234,235,236,238,239,240,241,243,244,245,246,247,248,249,250,251,252,253,254,2000,2001,2002].forEach(i=>f[i]=true);
    s.loadMap_tjonv8$(1,9,11,9);s.player.setPosInMap_vux9f0$(15,12);s.setMapScreenPos_vux9f0$(11,9);s.startChapter_vux9f0$(2,32);
  })()`);
  for(let i=0;i<100;i++){if(!await browser.evaluate('FmjGuide.state()?.busy'))break;await delay(10);}
  const before=await browser.evaluate(`(()=>{const s=FmjGuide.state(),g=FmjGuide.engine.nextGoal(s);return {goal:g,position:[s.x,s.y]}})()`);
  assert.equal(before.goal.scriptId,'2:32');assert.equal(before.goal.event,7);
  const result=await browser.evaluate('bbkGoToFmjNextGoal()');await delay(30);
  const after=await browser.evaluate(`(()=>{const c=window['fmj.core'].fmj,s=FmjGuide.state();return {position:[s.x,s.y],running:s.busy||c.game.mainScene.scriptProcess.running}})()`);
  assert.equal(result.stopped,'story');assert.deepEqual(after.position,[15,12]);assert.equal(after.running,true);
  assert.deepEqual(browser.exceptions,[]);
  console.log('四象阵回归通过：一键到柱前并自动触发原柱子事件。');
} finally { browser.close(); }
