;(function(global){
    'use strict';
    var module=global['fmj.core'],core=module&&module.fmj,data=global.FmjStageData;
    if(!core||!data)return;
    var opened=false;
    function close(){opened=false;if(global.sysSetGameLoopPaused)global.sysSetGameLoopPaused(false);}
    function snapshot(){
        var bytes,out=new module.java.ObjectOutputStream({wholeWrite_fqrh44$:function(buffer){bytes=Array.from(buffer);},close:function(){}});
        core.scene.SaveLoadGame.write_bvlcvx$(core.game,out);core.script.ScriptResources.write_vcd9jg$(out);out.close();return bytes;
    }
    /** 只暂停选关列表；正常存档档位保持独立，切换前另存一份可恢复的当前局。 */
    global.bbkOpenFmjStages=function(){
        opened=true;if(global.FmjGuide)global.FmjGuide.close();
        global.sysSetGameLoopPaused(true);
        return JSON.stringify({ok:true,stages:data.map(function(s){return {id:s.id,title:s.title,chapter:s.chapter,scene:s.scene,kind:s.kind,preparation:s.preparation};})});
    };
    global.bbkCloseFmjStages=close;
    /**
     * 创建独立节点状态，由原引擎负责初始化人物、机关及剧情事件。
     * 所有准备仅在玩家明确选关后执行；不会覆盖三份正常存档。
     * @param {string} id 细分故事节点编号。
     * @return {string} 供 Flutter 显示的结果。
     */
    global.bbkSelectFmjStage=function(id){
        var stage=data.find(function(s){return s.id===id;});if(!stage)return JSON.stringify({ok:false,message:'关卡不存在'});
        try{
            var current=global.FmjGuide&&global.FmjGuide.state();
            if(current&&!current.busy){var backup=snapshot();try{global.localStorage.setItem('sav/fmj-stage-backup',JSON.stringify(backup));}catch(_){}}
            if(global.FmjChoice&&global.FmjChoice.clear)global.FmjChoice.clear();
            core.combat.Combat.Companion.FightDisable();
            var save=core.scene.SaveLoadGame;save.startNewGame=true;
            core.game.changeScreen_gacx6e$(core.ScreenViewType.SCREEN_MAIN_GAME);
            var scene=core.game.mainScene;scene.scriptProcess.stop();scene.scriptProcess.curOp_0=null;
            var resources=core.script.ScriptResources;
            stage.flags.forEach(function(flag){resources.globalEvents[flag]=true;});resources.variables[1]=stage.variable;
            var map=stage.mapId.split(':').map(Number);scene.loadMap_tjonv8$(map[0],map[1],stage.x-4,stage.y-3);
            stage.actors.forEach(function(actor){scene.createActor_qt1dr2$(actor,4,3);});
            scene.player.setPosInMap_vux9f0$(stage.x,stage.y);scene.setMapScreenPos_vux9f0$(stage.x-4,stage.y-3);
            var bag=core.characters.Player.Companion.sGoodsList;
            stage.goods.forEach(function(g){var key=g.id.split(':').map(Number),count=bag.getGoodsNum_vux9f0$(key[0],key[1]);if(count<g.count)bag.addGoods_qt1dr2$(key[0],key[1],g.count-count);});
            stage.equipment.forEach(function(e){var actor=scene.getPlayer_za3lpa$(e.actor),key=e.id.split(':').map(Number);if(!actor)return;var previous=actor.equipmentsArray[e.slot];if(previous)actor.takeOff_6sxnot$(previous.type,previous.index);var item=core.lib.DatLib.Companion.getRes_2et8c9$(core.lib.DatLib.ResType.GRS,key[0],key[1]);actor.putOn_sp4jd8$(item,e.slot);});
            core.game.playerList.toArray().forEach(function(p){p.levelUp_za3lpa$(Math.min(stage.level,p.levelupChain.maxLevel));p.hp=p.maxHP;p.mp=p.maxMP;p.resetDebuff();});
            core.characters.Player.Companion.sMoney=5000;
            core.Global.disableSave=false;
            var script=stage.scriptId.split(':').map(Number);scene.startChapter_vux9f0$(script[0],script[1]);
            // 摄魂阵的进度由计数器和“已经移除的石头”共同保存。按原关卡初始化
            // 完成点恢复这些碰撞物，不能只给全局标记后让八块石头全部重新出现。
            if(stage.scriptId==='9:13'){
                var definition=global.FmjGuideData.scripts.find(function(s){return s.id===stage.scriptId;});
                var end=definition&&definition.commands.findIndex(function(command){return command.op===9;});
                if(end>=0){var command=scene.scriptProcess.commands_0.get_za3lpa$(end),run=command.run_fhed9o$;
                    command.run_fhed9o$=function(){
                        var result=run.apply(this,arguments),completed=resources.globalEvents[231]?8:stage.event>=1&&stage.event<=8?stage.event-1:0;
                        resources.variables[1]=completed;
                        for(var stone=1;stone<=completed;stone++)scene.deleteNpc_za3lpa$(stone);
                        return result;
                    };
                }
            }
            if(stage.direction!=null)scene.player.walkStay_rtfsey$([core.characters.Direction.North,core.characters.Direction.East,core.characters.Direction.South,core.characters.Direction.West][stage.direction]);
            close();return JSON.stringify({ok:true,message:'已进入「'+stage.title+'」，前置物品和装备已准备'});
        }catch(error){close();return JSON.stringify({ok:false,message:'选关失败：'+String(error)});}
    };
    global.addEventListener('pagehide',function(){opened=false;});
})(window);
