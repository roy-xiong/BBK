import assert from 'node:assert/strict';
import {createFmjBrowser, delay} from './fmj_browser_session.mjs';

/** 核查原对白 A 键输入和可由原读档界面恢复的第一档；使用独立浏览器存储。 */
for (const gameId of ['fmj','jyqxz']) {
  const b=await createFmjBrowser({gameId,accelerated:true});
  try {
    await b.evaluate(`window.__autoSaveWrites=[];window.BbkSaveChannel={postMessage:value=>__autoSaveWrites.push(JSON.parse(value))};`);
    await b.evaluate(`bbkSelectFmjStage(${JSON.stringify(gameId==='fmj'?'stage-001':'scene-11:26')})`);
    for(let i=0;i<100;i++){if(!await b.evaluate('FmjGuide.state()?.busy'))break;await b.evaluate("bbkSendInput('confirm')");await delay(10);}
    if(gameId==='jyqxz')await b.evaluate(`localStorage.setItem('bbk/jyqxz_goal',JSON.stringify({label:'药品委托',scriptId:'11:26',event:1,flag:2350}));window['fmj.core'].fmj.characters.Player.Companion.sGoodsList.addGoods_qt1dr2$(9,1,1);`);
    await b.evaluate('bbkGoToFmjNextGoal()');
    let input;
    for(let i=0;i<100&&!input;i++){
      input=await b.evaluate(`(async()=>{
      const scene=window['fmj.core'].fmj.game.mainScene, op=scene.scriptProcess.curOp_0;
      if(!op||!scene.scriptProcess.running)return null;
      const original=op.onKeyDown_za3lpa$;
      let keys=[];op.onKeyDown_za3lpa$=function(key){keys.push(key);return original.call(this,key);};
      try {const result=await bbkGoToFmjNextGoal();return {keys,result};} finally {op.onKeyDown_za3lpa$=original;}
      })()`);
      if(!input)await delay(10);
    }
    assert.ok(input,gameId+' 应出现原对白');
    assert.deepEqual(input.keys,[7],gameId+' 对话中点击一键前往必须等同一次 A 键');
    assert.equal(input.result.ok,true);
    const checkpoint=await b.evaluate("sysStorageGet('sav/fmjsave0')");
    assert.ok(checkpoint,gameId+' 遇到任务必须保存第一档');
    assert.ok(/^[0-9a-f]+$/i.test(checkpoint)&&checkpoint.length>200,'第一档必须使用原版二进制的十六进制编码');
    assert.equal(await b.evaluate('BbkRpgAutoSave.checkpoint()'),false,'对白中不能保存半成品');
    await b.evaluate(`sysStorageSet('sav/fmjsave1',${JSON.stringify(checkpoint)});sysStorageSet('sav/fmjsave2',${JSON.stringify(checkpoint)});`);
    for(let i=0;i<250;i++){if(!await b.evaluate('FmjGuide.state().busy'))break;await b.evaluate("bbkSendInput('confirm')");await delay(10);}
    for(let i=0;i<100;i++){if(await b.evaluate("sysStorageGet('sav/fmjsave0')")!==checkpoint)break;await delay(10);}
    assert.notEqual(await b.evaluate("sysStorageGet('sav/fmjsave0')"),checkpoint,'对白结束后的真实进展必须更新第一档');
    assert.equal(await b.evaluate("sysStorageGet('sav/fmjsave1')"),checkpoint);
    assert.equal(await b.evaluate("sysStorageGet('sav/fmjsave2')"),checkpoint);
    assert.ok(await b.evaluate("__autoSaveWrites.some(x=>x.entries['sav/fmjsave0'])"),'自动档必须同步 Flutter 文件镜像');
    const expectedFlags=await b.evaluate('FmjGuide.state().flags');
    await b.evaluate("window['fmj.core'].fmj.Global.disableSave=true");
    assert.equal(await b.evaluate('BbkRpgAutoSave.checkpoint()'),false,'原版禁止存档状态不能强行写入');
    await b.evaluate("window['fmj.core'].fmj.Global.disableSave=false");
    const restored=await b.evaluate(`(()=>{
      const m=window['fmj.core'],c=m.fmj,scene=c.game.mainScene;
      scene.scriptProcess.stop();scene.scriptProcess.curOp_0=null;
      const screen=new c.views.ScreenSaveLoadGame(scene,c.views.ScreenSaveLoadGame.Operate.LOAD,1);
      const ok=screen.loadGame_0(new m.java.File('sav/fmjsave0'));
      c.scene.SaveLoadGame.startNewGame=false;c.game.changeScreen_gacx6e$(c.ScreenViewType.SCREEN_MAIN_GAME);return ok;
    })()`);
    assert.equal(restored,true,'原版读取界面必须接受自动档');
    assert.deepEqual(await b.evaluate('FmjGuide.state().flags'),expectedFlags,'读回第一档必须恢复真实任务进展');
    assert.deepEqual(b.exceptions,[]);
    console.log(gameId+'：对话按钮等同 A 键，第一档自动覆盖、原引擎读档和 Flutter 备份同步通过，第二/三档保留。');
  }finally{b.close();}
}
