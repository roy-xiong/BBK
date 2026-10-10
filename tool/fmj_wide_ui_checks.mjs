import assert from 'node:assert/strict';

/** 验证真实逻辑空间与原始素材尺寸，避免把旧画面上采样误判为远视野。 */
export async function checkWideUi(evaluate, delay) {
  const glyph = await evaluate(`(()=>{window.sysSetGameLoopPaused(true);const c=window['fmj.core'],v=c.fmj.game.canvas_0;v.drawColor_we4i00$(c.fmj.Global.COLOR_WHITE);c.fmj.graphics.TextRender.drawText_kkuqvh$(v,'HH',10,10);const ink=[];for(let y=0;y<192;y++)for(let x=0;x<320;x++)if(v.buffer[y*320+x].r===0)ink.push([x,y]);return {minX:Math.min(...ink.map(p=>p[0])),maxX:Math.max(...ink.map(p=>p[0])),minY:Math.min(...ink.map(p=>p[1])),maxY:Math.max(...ink.map(p=>p[1]))};})()`);
  assert.ok(glyph.maxY < 36 && glyph.maxX < 36, '2× 逻辑画布应使用原始 16 像素字体，不能把旧界面文字再次放大');

  const menus = await evaluate(`(()=>{const c=window['fmj.core'].fmj,v=c.game.canvas_0,s=c.game.mainScene,system=new c.gamemenu.ScreenMenuSystem(s),texts=[],render=c.graphics.TextRender,methods=['drawText_kkuqvh$','drawSelText_kkuqvh$'],originals=methods.map(m=>render[m]);methods.forEach((method,i)=>{render[method]=function(canvas,text,x,y){texts.push({text,x,y});return originals[i].apply(this,arguments)}});try{system.draw_9in0vv$(v);system.onKeyDown_za3lpa$(c.Global.KEY_DOWN);system.onKeyDown_za3lpa$(c.Global.KEY_DOWN);system.onKeyDown_za3lpa$(c.Global.KEY_DOWN);system.draw_9in0vv$(v);return {texts,index:system.index_0};}finally{methods.forEach((m,i)=>render[m]=originals[i]);}})()`);
  assert.equal(menus.index, 3, '系统菜单选择必须保持原引擎行为');
  assert.ok(menus.texts.filter(t => t.text === '结束游戏').length >= 2, '320×192 系统菜单应同时展示全部四项');

  const dialogue = await evaluate(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene;s.scriptProcess.stop();s.startChapter_vux9f0$(2,2);s.scriptProcess.stop();const cmd=s.scriptProcess.commands_0.toArray().find(c=>(c.description||'').startsWith('say ')),op=cmd.run_fhed9o$(c.game.vm);op.closure$text=new Int8Array([...sysGbkEncode('这是用来验证远视野对话文字布局和翻页行为的测试内容每一页都应该显示更多文字并且不会遗漏后面的故事内容'.repeat(3)),0]);op.draw_9in0vv$(c.game.canvas_0);const first=op.closure$iOfNext.v;op.onKeyDown_za3lpa$(c.Global.KEY_ENTER);const go=op.update_s8cxhz$(kotlin.Long.fromInt(40));op.draw_9in0vv$(c.game.canvas_0);const second=op.closure$iOfNext.v;return {first,second,start:op.closure$iOfText.v,go};})()`);
  assert.ok(dialogue.first >= 80, '对话应按 320×192 重新分页，每页容量应明显增加');
  assert.equal(dialogue.start, dialogue.first, '翻页不能跳过或重复对白');
  assert.ok(dialogue.second > dialogue.first && dialogue.go, '长对白应继续翻页');
  const inventory = await evaluate(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene,v=c.game.canvas_0,list=kotlin.kotlin.collections.ArrayList_init_287e2$();for(let i=1;i<=10;i++){const item=c.lib.DatLib.Companion.getRes_2et8c9$(c.lib.DatLib.ResType.GRS,9,i,true);if(item)list.add_11rb$(item)}let selected=null;const screen=new c.gamemenu.ScreenGoodsList(s,list,{onItemSelected_6xxg66$:g=>selected=g},c.gamemenu.ScreenGoodsList.Mode.Use);screen.willAppear();screen.draw_9in0vv$(v);for(let i=0;i<8;i++)screen.onKeyDown_za3lpa$(c.Global.KEY_DOWN);screen.draw_9in0vv$(v);screen.onKeyDown_za3lpa$(c.Global.KEY_ENTER);screen.onKeyUp_za3lpa$(c.Global.KEY_ENTER);const result={size:list.size,index:screen.curItemIndex_0,first:screen.firstDisplayItemIndex_0,selected:selected===list.get_za3lpa$(screen.curItemIndex_0),rows:c.gamemenu.ScreenGoodsList.Companion.itemNumberPerPage_0};bbkToggleWideView();screen.draw_9in0vv$(c.game.canvas_0);result.classicRows=c.gamemenu.ScreenGoodsList.Companion.itemNumberPerPage_0;bbkToggleWideView();screen.draw_9in0vv$(c.game.canvas_0);return result;})()`);
  assert.ok(inventory.size >= 9 && inventory.index === 8);
  assert.equal(inventory.first, 1, '物品窗口应在第九项出现时才滚动');
  assert.equal(inventory.rows, 8);
  assert.equal(inventory.classicRows, 4);
  assert.equal(inventory.selected, true, '物品选择必须回调原来选中的物品');

  const magic = await evaluate(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene,list=kotlin.kotlin.collections.ArrayList_init_287e2$();for(let i=1;i<=30&&list.size<10;i++){const m=c.lib.DatLib.Companion.getRes_2et8c9$(c.lib.DatLib.ResType.MRS,1,i,true);if(m)list.add_11rb$(m)}let selected=null;const screen=new c.magic.ScreenMagic(s,list,99999,{onItemSelected_3fncnk$:m=>selected=m});for(let i=0;i<8;i++)screen.onKeyDown_za3lpa$(c.Global.KEY_DOWN);screen.draw_9in0vv$(c.game.canvas_0);screen.onKeyUp_za3lpa$(c.Global.KEY_ENTER);screen.onKeyDown_za3lpa$(c.Global.KEY_PAGEDOWN);screen.draw_9in0vv$(c.game.canvas_0);screen.onKeyDown_za3lpa$(c.Global.KEY_PAGEUP);screen.draw_9in0vv$(c.game.canvas_0);return {size:list.size,index:screen.mCurItemIndex_0,first:screen.mFirstItemIndex_0,selected:selected===screen.magics_0[screen.mCurItemIndex_0]};})()`);
  assert.ok(magic.size >= 9 && magic.index === 8 && magic.first === 1);
  assert.equal(magic.selected, true, '法术选择必须回调原来选中的法术');
  await evaluate(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene,v=c.game.canvas_0,menus=[new c.gamemenu.ScreenGameMainMenu(s),new c.gamemenu.ScreenMenuProperties(s),new c.gamemenu.ScreenMenuGoods(s),new c.gamemenu.ScreenActorState(s),new c.gamemenu.ScreenActorWearing(s),new c.views.ScreenMessageBox(s,'确认操作？',null),new c.views.ScreenSaveLoadGame(s,c.views.ScreenSaveLoadGame.Operate.SAVE,1),new c.gamemenu.ScreenCommonMenu(s,['第一项','第二项','第三项'],()=>{})];menus.forEach(menu=>{menu.draw_9in0vv$(v);menu.onKeyDown_za3lpa$(c.Global.KEY_DOWN);menu.draw_9in0vv$(v);bbkToggleWideView();menu.draw_9in0vv$(c.game.canvas_0);bbkToggleWideView();menu.draw_9in0vv$(c.game.canvas_0)});})()`);
  await evaluate('window.sysSetGameLoopPaused(false)');
  await delay(80);
  console.log('真实 2× UI 验证通过：原尺寸字体、系统四项同屏、对白连续翻页、物品/法术八项滚动与选择、菜单无损切换。');
}

/** 在原剧情触发的战斗中验证原尺寸角色、目标选择、其他菜单与实际攻击绘制。 */
export async function checkWideCombat(evaluate) {
  await evaluate(`(()=>{const c=window['fmj.core'].fmj,b=c.combat.Combat.Companion.sInstance_0;window.sysSetGameLoopPaused(true);b.onKeyDown_za3lpa$(c.Global.KEY_DOWN);b.onKeyUp_za3lpa$(c.Global.KEY_ENTER);for(let i=0;i<4;i++)b.onKeyDown_za3lpa$(c.Global.KEY_DOWN);b.onKeyUp_za3lpa$(c.Global.KEY_ENTER);b.draw_9in0vv$(c.game.canvas_0);b.onKeyDown_za3lpa$(c.Global.KEY_RIGHT);b.draw_9in0vv$(c.game.canvas_0);b.onKeyUp_za3lpa$(c.Global.KEY_CANCEL);b.onKeyUp_za3lpa$(c.Global.KEY_CANCEL);})()`);
  const result = await evaluate(`(()=>{window.sysSetGameLoopPaused(true);const c=window['fmj.core'].fmj,v=c.game.canvas_0,battle=c.combat.Combat.Companion.sInstance_0,native=FmjWideView.drawing.native,original=native.drawBitmap_t8cslu$,bitmaps=[];native.drawBitmap_t8cslu$=function(bitmap,x,y){bitmaps.push({width:bitmap.width,height:bitmap.height,x,y});return original.apply(this,arguments)};try{battle.draw_9in0vv$(v);const sprite=battle.mPlayerList_0.get_za3lpa$(0).fightingSprite,player=bitmaps.find(p=>p.width===sprite.width&&p.height===sprite.height&&Math.abs(p.x-(sprite.combatX*2-sprite.width/2))<1);battle.onKeyDown_za3lpa$(c.Global.KEY_DOWN);battle.onKeyUp_za3lpa$(c.Global.KEY_ENTER);battle.draw_9in0vv$(v);const misc=battle.mCombatUI_0.mScreenStack_0.getCurScreen();battle.onKeyUp_za3lpa$(c.Global.KEY_CANCEL);battle.onKeyDown_za3lpa$(c.Global.KEY_UP);battle.onKeyUp_za3lpa$(c.Global.KEY_ENTER);battle.draw_9in0vv$(v);const target=battle.mCombatUI_0.mScreenStack_0.getCurScreen();const targetValid=target.mList_0?.size>0;battle.onKeyUp_za3lpa$(c.Global.KEY_ENTER);for(let i=0;i<24;i++){battle.update_s8cxhz$(kotlin.Long.fromInt(40));battle.draw_9in0vv$(v)}return {player:!!player,miscItems:misc.mItemText_0.length,targetValid,buffer:v.buffer.length,extra:Object.keys(v.buffer).some(k=>Number(k)<0||Number(k)>=320*192),state:battle.mCombatState_0.name};}finally{native.drawBitmap_t8cslu$=original;window.sysSetGameLoopPaused(false)}})()`);
  assert.equal(result.player, true, '战斗人物应按原尺寸出现在扩展后的战场位置');
  assert.equal(result.miscItems, 5, '战斗其他菜单必须完整显示五个选项');
  assert.equal(result.targetValid, true, '攻击应继续进入原目标选择流程');
  assert.equal(result.buffer, 320 * 192);
  assert.equal(result.extra, false, '攻击和特效不能越界写入画布');
  console.log('真实 2× 战斗验证通过：原尺寸角色、其他五项、目标选择与攻击/特效绘制。');
}
