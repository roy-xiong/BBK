import assert from 'node:assert/strict';
import { createFmjBrowser, delay } from './fmj_browser_session.mjs';

/** 白水镇晚期旧档：完整模式不得回跳已错过的早期支线。 */
const browser = await createFmjBrowser({ accelerated: true });
try {
  await browser.evaluate(`(()=>{const c=window['fmj.core'].fmj;c.scene.SaveLoadGame.startNewGame=true;c.game.changeScreen_gacx6e$(c.ScreenViewType.SCREEN_MAIN_GAME);})()`);
  await delay(100);
  await browser.evaluate(`(()=>{
    const c=window['fmj.core'].fmj,s=c.game.mainScene;
    if(!s.player)s.createActor_qt1dr2$(1,4,3);
    s.scriptProcess.stop();s.loadMap_tjonv8$(1,42,0,0);s.player.setPosInMap_vux9f0$(7,3);s.setMapScreenPos_vux9f0$(3,0);s.startChapter_vux9f0$(9,1);
    [11,12,13,14,15,16,17,18,19,21,25,31,202,203,204,208,209,210,211,214,215,216,217,218,219,220,221,224,225,226,227,228,229,230,231,232,233,234,2000,2001].forEach(i=>c.script.ScriptResources.globalEvents[i]=true);
  })()`);
  for(let i=0;i<100;i++){if(!await browser.evaluate('FmjGuide.state()?.busy'))break;await delay(10);}
  const result=await browser.evaluate(`(()=>{const s=FmjGuide.state(),e=FmjGuide.engine,n=e.nextGoal(s),p=e.taskPlan(s);return {goal:{id:n.id,scriptId:n.scriptId,event:n.event},plan:{unavailable:p.unavailable,steps:p.steps?.length,arrival:p.arrival},letter:e.questTasks(s).find(q=>q.id==='letter-accept').status,wang:e.questTasks(s).find(q=>q.id==='wang-wife').status}})()`);
  assert.equal(result.goal.id, undefined, '完整模式应回到主线目标，不应回跳旧支线');
  assert.equal(result.goal.scriptId, '10:1');
  assert.equal(result.goal.event, 5);
  assert.equal(result.plan.unavailable, undefined, '白水镇到南北村的真实道路应可达');
  assert.ok(result.plan.steps > 0);
  assert.equal(result.letter, 'expired');
  assert.equal(result.wang, 'expired');
  assert.deepEqual(browser.exceptions, []);
  console.log('白水镇晚期导航回归通过：不回跳过期支线，真实路线可到南北村。');
} finally { browser.close(); }
