import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createFmjBrowser,delay} from './fmj_browser_session.mjs';

const b=await createFmjBrowser({gameId:'jyqxz',accelerated:true}),records=[];
const actor=process.argv.includes('--female')?2:1;
async function finishStory(){
  for(let i=0;i<600;i++){
    if(await b.evaluate('FmjGuide.state()&&!FmjGuide.state().busy'))return;
    await b.evaluate(`(()=>{const c=window['fmj.core'].fmj,choice=FmjChoice.inspect();if(c.combat.Combat.Companion.IsActive())bbkApplyCheat('fmj_force_win');if(choice){const goal=FmjGuide.state()&&FmjGuide.engine.nextGoal(FmjGuide.state()),city=goal?.scriptId.startsWith('12:')?'扬州':goal?.scriptId.startsWith('11:')?'大理':goal?.scriptId.startsWith('10:')?'西夏':'京城',index=choice.options.findIndex(s=>s.includes(city));FmjChoice.answer(choice.id,choice.options.includes('紫灵儿')?${actor-1}:index>=0?index:0);}else bbkSendInput('confirm');})()`);
    await delay(10);
  }
  throw Error('剧情未结束');
}
try{
  await b.evaluate(`(()=>{const c=window['fmj.core'].fmj;c.scene.SaveLoadGame.startNewGame=true;c.game.changeScreen_gacx6e$(c.ScreenViewType.SCREEN_MAIN_GAME);FmjPreferences.set('storyScope','main');})()`);
  await finishStory();
  assert.equal(await b.evaluate('FmjGuide.state().actor'),actor);
  await b.evaluate(`(()=>{const bag=window['fmj.core'].fmj.characters.Player.Companion.sGoodsList;for(let i=1;i<=12;i++)bag.addGoods_qt1dr2$(14,i,1);bag.addGoods_qt1dr2$(9,11,1);bbkApplyCheat('fmj_invincible');bbkApplyCheat('fmj_random_battle');bbkSetFmjRunSpeed(4);})()`);
  for(let i=0;i<60;i++){
    const before=await b.evaluate(`(()=>{const s=FmjGuide.state();return {script:s.scriptId,map:s.mapId,flags:JyqxzQuests.main.filter(t=>s.flags[t.flag]).map(t=>t.flag),goal:FmjGuide.engine.nextGoal(s)}})()`);
    if(before.flags.length===9)break;
    const result=await b.evaluate('bbkGoToFmjNextGoal()');
    if(result.ok&&!result.stopped)await b.evaluate(`(()=>{const s=FmjGuide.state(),goal=FmjGuide.engine.nextGoal(s);if(goal.event>40){const plan=FmjGuide.engine.route(s,goal),direction=plan.arrival?.direction;if(direction!=null)bbkSendInput(['up','right','down','left'][direction]);}else if(goal.event)bbkSendInput('confirm');})()`);
    await finishStory();
    const after=await b.evaluate(`(()=>{const s=FmjGuide.state();return {script:s.scriptId,map:s.mapId,flags:JyqxzQuests.main.filter(t=>s.flags[t.flag]).map(t=>t.flag)}})()`);
    const record={step:i,before,result,after};records.push(record);console.log(JSON.stringify(record));
    if(records.slice(-3).length===3&&records.slice(-3).every(r=>r.after.script===before.script&&r.after.flags.join(',')===before.flags.join(',')))throw Error('主线连续三次没有推进');
  }
  assert.equal(await b.evaluate('JyqxzQuests.main.every(t=>FmjGuide.state().flags[t.flag])'),true);
  assert.deepEqual(b.exceptions,[]);
  fs.writeFileSync('/tmp/jyqxz-main-story-audit-'+actor+'.json',JSON.stringify({actor,records,exceptions:b.exceptions},null,2));
  console.log('金庸原主线连续通过：从原开场经真实路线、原对白和真实战斗到华山论剑。测试补车票与毒龙涎，并用胜利作弊、关闭随机战斗加速，没有写入主线旗标。');
}finally{b.close();}
