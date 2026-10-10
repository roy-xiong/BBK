import assert from 'node:assert/strict';

/**
 * 在独立浏览器中重放真机李府客厅状态，验证原引擎逐格走到蛇窟。
 * 不操作用户手机，不修改真实存档，随机战斗仅在此测试夹具中关闭。
 */
export async function checkLifuWalk(evaluate, delay) {
  await evaluate(`(()=>{
    const c=window['fmj.core'].fmj,s=c.game.mainScene;
    s.scriptProcess.stop();
    c.script.ScriptResources.initGlobalEvents();
    [11,12,13,14,15,16,17,18,19,21,25,31,202,203,204,208,209,210,2000,2001]
      .forEach(i=>c.script.ScriptResources.globalEvents[i]=true);
    if(c.game.playerList.size<2)s.createActor_qt1dr2$(2,4,3);
    c.game.playerList.get_za3lpa$(0).equipmentsArray[6]=c.lib.DatLib.Companion.getRes_2et8c9$(c.lib.DatLib.ResType.GRS,4,14);
    c.game.playerList.get_za3lpa$(1).equipmentsArray[6]=c.lib.DatLib.Companion.getRes_2et8c9$(c.lib.DatLib.ResType.GRS,4,13);
    c.combat.Combat.Companion.globalDisableFighting_0=true;
    s.loadMap_tjonv8$(2,20,7,7);
    s.player.setPosInMap_vux9f0$(11,10);
    s.setMapScreenPos_vux9f0$(7,7);
    s.startChapter_vux9f0$(5,15);
  })()`);
  for (let i=0;i<50;i++) {
    if(await evaluate('FmjGuide.state()?.busy===false'))break;
    await delay(100);
  }
  const initial=await evaluate('FmjGuide.state()');
  assert.equal(initial.scriptId,'5:15');
  assert.equal(initial.busy,false);
  console.log('开始原引擎行走回归：李府客厅（11,10）→ 蛇窟，按游戏原速度执行。');
  const result=await evaluate(`(async()=>{
    const c=window['fmj.core'].fmj,prototype=c.scene.ScreenMainGame.prototype,original=prototype.onKeyDown_za3lpa$;
    const movements=[],scenes=new Set(),storyFlags=[19,21,202,203,204,208,209,210,215,2000,2001];
    const before=storyFlags.map(i=>c.script.ScriptResources.globalEvents[i]);
    prototype.onKeyDown_za3lpa$=function(key){
      if(key<1||key>4||this.scriptProcess.running||c.combat.Combat.Companion.IsActive())return original.call(this,key);
      const p=this.player,from={x:p.posInMap.x,y:p.posInMap.y,map:this.currentMap.type+':'+this.currentMap.index};
      scenes.add(c.scene.SaveLoadGame.ScriptType+':'+c.scene.SaveLoadGame.ScriptIndex);
      const value=original.call(this,key),to={x:p.posInMap.x,y:p.posInMap.y,map:this.currentMap.type+':'+this.currentMap.index};
      if(from.map===to.map)movements.push(Math.abs(from.x-to.x)+Math.abs(from.y-to.y));
      return value;
    };
    try{
      const travel=await bbkGoToFmjNextGoal(),state=FmjGuide.state();
      scenes.add(state.scriptId);
      return {travel,script:state.scriptId,map:state.mapId,position:[state.x,state.y],scenes:[...scenes],
        movementCount:movements.filter(n=>n===1).length,maximumStep:Math.max(...movements),
        before,after:storyFlags.map(i=>c.script.ScriptResources.globalEvents[i]),
        armors:c.game.playerList.toArray().map(p=>p.equipmentsArray[6]?.index)};
    }finally{prototype.onKeyDown_za3lpa$=original;}
  })()`);
  assert.equal(result.travel.ok,true,JSON.stringify(result.travel));
  assert.equal(result.script,'4:8','一键必须真实抵达蛇窟目标场景');
  assert.ok(result.movementCount>100,'原引擎必须实际走过道路');
  assert.equal(result.maximumStep,1,'每次方向键只能走一个相邻格，不能闪移');
  for(const id of ['5:1','4:1','4:3','4:4','4:5','4:6','4:7','4:8']) {
    assert.ok(result.scenes.includes(id),'遗漏真实道路场景 '+id);
  }
  assert.deepEqual(result.before,result.after,'自动行走不能跳过主线事件或改变装备条件');
  assert.deepEqual(result.armors,[14,13]);
  console.log(JSON.stringify({lifuWalk:'通过',steps:result.movementCount,arrived:result.script,map:result.map,position:result.position}));
}
