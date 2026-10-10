import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFmjBrowser,delay } from './fmj_browser_session.mjs';

const mode=process.argv.includes('--main')?'main':'complete';
const alternative=process.argv.includes('--alternative');
const suffix=mode+(alternative?'-alternative':'');
const folder=path.join(os.tmpdir(),'bbk-fmj-flow-audit');
fs.mkdirSync(folder,{recursive:true});
const output=path.join(folder,'full-flow-'+suffix+'.json');
const checkpoint=path.join(folder,'full-flow-'+suffix+'-checkpoint.json');
const browser=await createFmjBrowser({accelerated:true});
const previousRun=process.argv.includes('--resume')?JSON.parse(fs.readFileSync(checkpoint,'utf8')):null;
const records=previousRun?.records||[],issues=[];
try{
  await browser.evaluate(`(()=>{
    const c=window['fmj.core'].fmj;
    localStorage.setItem('bbk/fmj_story_scope',${JSON.stringify(mode)});
    ${previousRun?`const bytes=new Int8Array(${JSON.stringify(previousRun.bytes)}),input=new window['fmj.core'].java.ObjectInputStream({readAll(){return bytes},close(){}});if(!c.scene.SaveLoadGame.read_r7hctu$(c.game,input))throw Error('审计检查点读取失败');c.script.ScriptResources.read_setnfj$(input);`:''}
    c.scene.SaveLoadGame.startNewGame=${!previousRun};
    c.game.changeScreen_gacx6e$(c.ScreenViewType.SCREEN_MAIN_GAME);
    bbkApplyCheat('fmj_invincible');bbkApplyCheat('fmj_one_hit_kill');
    c.combat.Combat.Companion.globalDisableFighting_0=true;
    window.__fmjAuditChoices=[];
    window.__fmjAuditInput=function(action){if(!c.script.ScriptResources.globalEvents[2316])bbkSendInput(action);};
    window.__fmjAuditStatus=function(){
      const s=c.game.mainScene,p=s?.scriptProcess,o=p?.curOp_0,b=c.combat.Combat.Companion.sInstance_0;
      const state=FmjGuide.state();
      return {state,screen:c.game.getCurScreen()?.constructor?.name,active:c.game.getCurScreen()===s,
        operation:o?.constructor?.name,running:!!p?.running,previous:!!p?.prev,
        choice:o?.closure$choice1&&[sysGbkDecode(o.closure$choice1.v),sysGbkDecode(o.closure$choice2.v)],
        choiceIndex:o?.curChoice_0,choiceAnswered:!!o?.hasSelect_0,popup:window.FmjChoice?.inspect(),combat:c.combat.Combat.Companion.IsActive()?b?.mCombatState_0?.name:null,
        scriptName:p?.name_0,index:p?.mCurExeOperateIndex_0,finished:!!state?.endingSeen,
        players:c.game.playerList.toArray().map(p=>({hp:p.hp,mp:p.mp,attack:p.attack})),monsters:b?.mMonsterList_0?.toArray().map(p=>({hp:p.hp})),cheats:bbkCheatState};
    };
  })()`);

  async function settle(){
    for(let i=0;i<1000;i++){
      await browser.evaluate(`(()=>{const c=window['fmj.core'].fmj;if(c.game.playerList.size){if(!bbkCheatState.invincible)bbkApplyCheat('fmj_invincible');if(!bbkCheatState.oneHitKill)bbkApplyCheat('fmj_one_hit_kill');}c.combat.Combat.Companion.globalDisableFighting_0=true;})()`);
      const r=await browser.evaluate('__fmjAuditStatus()');
      if(r.finished)return r;
      if(r.popup){
        const preferred=r.popup.options.findIndex(t=>/使用|奉还|交出|交换/.test(t));
        const selected=alternative&&['9:1','11:4'].includes(r.popup.script)?0:preferred>=0?preferred:0;
        records.push({type:'choice',script:r.scriptName,options:r.popup.options,selected});
        await browser.evaluate(`FmjChoice.answer(${r.popup.id},${selected})`);
      }else if(r.choice&&!r.choiceAnswered){
        const preferred=r.choice.findIndex(t=>/使用|奉还|交出|交换/.test(t));
        const selected=preferred>=0?preferred:0;
        records.push({type:'choice',script:r.scriptName,options:r.choice,selected});
        await browser.evaluate(`(()=>{const c=window['fmj.core'].fmj,o=c.game.mainScene.scriptProcess.curOp_0;if(o.curChoice_0!==${selected})o.onKeyDown_za3lpa$(c.Global.KEY_DOWN);o.onKeyDown_za3lpa$(c.Global.KEY_ENTER);o.onKeyUp_za3lpa$(c.Global.KEY_ENTER);})()`);
      }else if(/ScreenGoodsList|BuyGoodsScreen/.test(r.screen)){
        await browser.evaluate('__fmjAuditInput("cancel")');
      }else if(r.running){
        // 战斗回合也能插入原剧情对白，必须先读完，不能只反复选择攻击。
        await browser.evaluate('__fmjAuditInput("confirm")');
      }else if(r.combat){
        await browser.evaluate(`(()=>{const c=window['fmj.core'].fmj,b=c.combat.Combat.Companion.sInstance_0;if(b.mCombatState_0.name==='SelectAction')b.onAutoAttack();else if(b.mCombatState_0.name==='Win')b.onKeyUp_za3lpa$(c.Global.KEY_ENTER);})()`);
      }else if(!r.active){
        await browser.evaluate('__fmjAuditInput("confirm")');
      }else return r;
      await delay(10);
    }
    throw Error('原剧情长时间未回到可操作状态');
  }

  let previous='',same=0;
  for(let iteration=0;iteration<180;iteration++){
    const r=await settle();
    if(r.finished){records.push({type:'ending',script:r.state.scriptId});break}
    const bytes=await browser.evaluate(`(()=>{const c=window['fmj.core'].fmj;let bytes;const out=new window['fmj.core'].java.ObjectOutputStream({wholeWrite_fqrh44$(b){bytes=Array.from(b)},close(){}});c.scene.SaveLoadGame.write_bvlcvx$(c.game,out);c.script.ScriptResources.write_vcd9jg$(out);out.close();return bytes})()`);
    fs.writeFileSync(checkpoint,JSON.stringify({mode,records,bytes}));
    const info=await browser.evaluate(`(()=>{const s=FmjGuide.state(),e=FmjGuide.engine,g=e.nextGoal(s),p=e.taskPlan(s);return {state:{script:s.scriptId,map:s.mapId,x:s.x,y:s.y,flags:s.flags.map((v,i)=>v?i:null).filter(v=>v!==null),goods:s.goods},goal:g,plan:{unavailable:p.unavailable,visited:p.visited,boundary:p.boundary,blockedAt:p.blockedAt,arrival:p.arrival,exit:p.exit,steps:p.steps?.length}}})()`);
    const signature=JSON.stringify(info);
    same=signature===previous?same+1:0;previous=signature;
    console.log(JSON.stringify({iteration,script:info.state.script,goal:info.goal.label,unavailable:info.plan.unavailable,blockedAt:info.plan.blockedAt,boundary:info.plan.boundary}));
    if(same>=3||info.plan.unavailable){issues.push({type:'navigation',reason:same>=3?'同一目标没有进展':'目标不可达',...info});break}
    if(!info.goal.event&&info.goal.scriptId===info.state.script){
      if(/芦藤/.test(info.goal.label)){
        await browser.evaluate(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene;for(const [actorId,index]of [[1,14],[2,13]]){const actor=s.getPlayer_za3lpa$(actorId),goods=c.characters.Player.Companion.sGoodsList.getGoods_vux9f0$(4,index);if(!actor||!goods)throw Error('护甲或角色不存在');const screen=new c.gamemenu.ScreenChgEquipment(s,actor,goods,6);s.pushScreen_2o7n0o$(screen);bbkSendInput('confirm');}})()`);
        records.push({type:'equipment',item:'芦藤甲'});continue;
      }
      if(/天心灯/.test(info.goal.label)){
        await browser.evaluate(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene,actor=s.getPlayer_za3lpa$(1),goods=c.characters.Player.Companion.sGoodsList.getGoods_vux9f0$(6,14);if(!goods)throw Error('天心灯不存在');const screen=new c.gamemenu.ScreenChgEquipment(s,actor,goods,0);s.pushScreen_2o7n0o$(screen);bbkSendInput('confirm');})()`);
        records.push({type:'equipment',item:'天心灯'});continue;
      }
    }
    const result=await browser.evaluate('bbkGoToFmjNextGoal()');
    records.push({type:'navigation',...info,result});
    if(!result.ok){issues.push({type:'execution',...info,result,status:await browser.evaluate('__fmjAuditStatus()'),notices:await browser.evaluate('__fmjAuditNotices.slice(-5)')});break}
    const after=await settle();
    if(info.plan.boundary||result.stopped)continue;
    if(info.goal.event){
      await browser.evaluate(`(()=>{const c=window['fmj.core'].fmj,p=c.game.mainScene.player;${!info.plan.blockedAt&&info.goal.event>40?"bbkSendInput(({North:'up',East:'right',South:'down',West:'left'})[p.direction.name]);":"bbkSendInput('confirm');"}})()`);
    }else if(after.state.scriptId===info.goal.scriptId){
      await browser.evaluate('bbkSendInput("confirm")');
    }
  }
  if(!records.some(r=>r.type==='ending')&&!issues.length)issues.push({type:'limit',reason:'超过回放节点上限'});
  if(browser.exceptions.length)issues.push({type:'runtime',exceptions:browser.exceptions});
  const quests=await browser.evaluate('FmjGuide.engine.questTasks(FmjGuide.state())');
  if(mode==='complete'){
    const required=['letter-accept','daughter-dong','daughter-xia','daughter-accept','wang-choice','daughter-rescue','wang-wife','lifu-vault','daughter-thanks','letter-deliver','money-bag','violet-lamp',...(alternative?['point-card','point-return','star-weapon']:['worm-card','worm-return','ghost-card','ghost-return'])];
    for(const id of required)if(!quests.some(q=>q.id===id&&q.status==='done'))issues.push({type:'side_quest',reason:'测试所选择的支线没有完成',id});
  }
  fs.writeFileSync(output,JSON.stringify({mode,records,issues,quests},null,2));
  console.log(JSON.stringify({output,navigationAttempts:records.filter(x=>x.type==='navigation').length,issues,completed:records.some(x=>x.type==='ending')}));
  if(issues.length)process.exitCode=1;
}catch(error){
  const status=await browser.evaluate('__fmjAuditStatus()').catch(()=>null);
  issues.push({type:'runtime',message:String(error),status});
  fs.writeFileSync(output,JSON.stringify({records,issues},null,2));
  console.log(JSON.stringify({output,error:String(error),status:status&&{script:status.state?.scriptId,map:status.state?.mapId,running:status.running,operation:status.operation,combat:status.combat,index:status.index,popup:status.popup,players:status.players,monsters:status.monsters,cheats:status.cheats}}));
  process.exitCode=1;
}finally{browser.close()}
