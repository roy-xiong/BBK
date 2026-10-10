import assert from 'node:assert/strict';
import {createFmjBrowser,delay} from './fmj_browser_session.mjs';
const b=await createFmjBrowser({accelerated:true});
try{
  await b.evaluate(`(()=>{const c=window['fmj.core'].fmj;c.scene.SaveLoadGame.startNewGame=true;c.game.changeScreen_gacx6e$(c.ScreenViewType.SCREEN_MAIN_GAME)})()`);
  await delay(120);
  const r=await b.evaluate(`(()=>{
    sysSetGameLoopPaused(true);
    const c=window['fmj.core'].fmj,s=c.game.mainScene;if(!s.player)s.createActor_qt1dr2$(1,4,3);s.scriptProcess.stop();s.scriptProcess.curOp_0=null;
    c.combat.Combat.Companion.EnterFight_dnhp7$(c.game.vm,0,new Int32Array([1,0,0]),new Int32Array([2,2,2]),new Int32Array([0,0,0]),new Int32Array([0,0,0]),0,0);
    const combat=c.combat.Combat.Companion.sInstance_0,ui=combat.mCombatUI_0,menu=ui.getCurScreen(),native=FmjWideView.drawing.native;
    const draws=[],images=c.lib.ResImage.prototype.draw_tj1hu5$,rect=native.drawRect_x3aj6j$;
    c.lib.ResImage.prototype.draw_tj1hu5$=function(target,frame,x,y){draws.push({type:this.type,index:this.index,w:this.width,h:this.height,frame,x,y,native:target===native});return images.apply(this,arguments)};
    const whiteRects=[];native.drawRect_x3aj6j$=function(x,y,r,b,paint){if(paint.color===c.Global.COLOR_WHITE)whiteRects.push([x,y,r,b]);return rect.apply(this,arguments)};
    try{combat.draw_9in0vv$(c.game.canvas_0);return {draws,whiteRects,width:c.game.canvas_0.width,height:c.game.canvas_0.height};}finally{c.lib.ResImage.prototype.draw_tj1hu5$=images;native.drawRect_x3aj6j$=rect;}
  })()`);
  assert.equal(r.width,320);assert.equal(r.height,192);
  assert.equal(r.whiteRects.some(rect=>rect.join(',')==='45,62,130,96'),false,'战斗背景不能被旧 HUD 的白色擦除矩形覆盖');
  assert.ok(r.draws.some(x=>x.type===2&&x.index===1&&x.native&&x.y>=150),'圆形战斗菜单应以原图尺寸绘在远视野底部');
  assert.ok(r.draws.some(x=>x.type===2&&x.index===2&&x.native&&x.y>=150),'血魔面板应以原图尺寸绘在远视野底部');
  assert.deepEqual(b.exceptions,[]);
  console.log('远视野战斗布局通过：圆形菜单、原边框血魔面板、无旧位置白块。');
}finally{b.close()}
