;(function(global){
    'use strict';
    var module=global['fmj.core'],c=module&&module.fmj,data=global.FmjGuideData,q=global.JyqxzQuests;
    if(!c||!data||!q)return;
    var mainFlags=q.main.map(function(t){return t.flag;}),stages=[];
    q.main.forEach(function(task,index){stages.push({id:'story-'+task.flag,title:task.label,chapter:'射雕主线',scene:task.label.split('：')[0],kind:'主线',scriptId:task.scriptId,flags:mainFlags.slice(0,index),level:Math.min(90,10+index*10),goods:task.item?[{id:task.item,count:1}]:[],preparation:'准备此前主线旗标与等级，由原引擎继续本节点剧情'});});
    q.schools.forEach(function(school){stages.push({id:'school-'+school[0],title:school[1]+'入门',chapter:'门派与武学',scene:school[1],kind:'门派',scriptId:school[2],flags:[],actor:school[3],level:10,goods:[],preparation:'建立符合原版性别条件的 10 级主角，入门仍由你选择'});});
    q.sides.filter(function(t){return t.after;}).forEach(function(task){stages.push({id:task.id,title:task.label,chapter:'门派与支线',scene:task.label.split('：')[0],kind:'支线',scriptId:task.scriptId,flags:[task.after],level:task.level?task.level+1:50,goods:task.item?[{id:task.item,count:1}]:[],preparation:'只准备该节点明确前置，门派和后续对话保持原规则'});});
    stages.filter(function(stage){return stage.id.startsWith('huashan-')||stage.id.startsWith('beggar-');}).forEach(function(stage){stage.actor=1;stage.preparation='按原门派条件准备男主及节点前置，当前局另存备份';});
    data.scripts.filter(function(s){return s.id!=='1:1'&&data.incoming[s.id]?.length;}).forEach(function(s){stages.push({id:'scene-'+s.id,title:s.name,chapter:'场景自由选择',scene:s.name+' ['+s.id+']',kind:'探索',scriptId:s.id,flags:[],level:10,goods:[],preparation:'从所选场景的真实入口开始；其他剧情旗标保持未完成'});});
    var restoring=false;
    function close(){global.sysSetGameLoopPaused(false);}
    function backup(){
        var out=new module.java.ObjectOutputStream(new module.java.File('sav/jyqxz-stage-backup'));
        c.scene.SaveLoadGame.write_bvlcvx$(c.game,out);c.script.ScriptResources.write_vcd9jg$(out);out.close();
    }
    /** 选关列表与正常存档分离；切换前另存完整序列化备份，不覆盖档位。 */
    global.bbkOpenFmjStages=function(){
        if(global.FmjGuide)global.FmjGuide.close();global.sysSetGameLoopPaused(true);
        var list=stages.map(function(s){return {id:s.id,title:s.title,chapter:s.chapter,scene:s.scene,kind:s.kind,preparation:s.preparation};});
        if(global.sysStorageHas('sav/jyqxz-stage-backup'))list.unshift({id:'restore-backup',title:'恢复选关前进度',chapter:'进度恢复',scene:'选关前的当前局',kind:'备份',preparation:'读取独立选关备份，不覆盖三个正常档位'});
        return JSON.stringify({ok:true,stages:list});
    };
    global.bbkCloseFmjStages=close;
    /**
     * 按 ROM 的入口坐标和原初始化脚本创建独立节点；主线和门派保持各自前置。
     * 加载时恢复角色的男女身份，禁止并入另一主角造成共用成长链混乱。
     * @param {string} id 已登记的节点编号。
     * @return {string} 切换结果。
     */
    global.bbkSelectFmjStage=function(id){
        if(id==='restore-backup'){
            try{
                restoring=true;global.FmjGuide.close();global.FmjChoice.clear();c.combat.Combat.Companion.FightDisable();
                var input=new module.java.ObjectInputStream(new module.java.File('sav/jyqxz-stage-backup'));
                if(!c.scene.SaveLoadGame.read_r7hctu$(c.game,input))throw Error('备份版本不兼容');
                c.script.ScriptResources.read_setnfj$(input);input.close();c.scene.SaveLoadGame.startNewGame=false;c.game.changeScreen_gacx6e$(c.ScreenViewType.SCREEN_MAIN_GAME);close();
                return JSON.stringify({ok:true,message:'已恢复选关前进度'});
            }catch(error){close();return JSON.stringify({ok:false,message:'恢复失败：'+String(error)});}finally{restoring=false;}
        }
        var stage=stages.find(function(s){return s.id===id;});
        if(!stage||restoring)return JSON.stringify({ok:false,message:'关卡不存在或仍在准备'});
        var before=global.FmjGuide.state(),entry=data.incoming[stage.scriptId]?.[0];
        if(!entry)return JSON.stringify({ok:false,message:'该场景没有可核验入口'});
        try{
            if(before?.busy){close();return JSON.stringify({ok:false,message:'请先完成当前对话、菜单或战斗'});}
            if(before)backup();
            global.FmjChoice?.clear();global.FmjGuide.close();
            var actor=stage.actor||(before&&before.actor)||1;
            c.combat.Combat.Companion.FightDisable();c.scene.SaveLoadGame.startNewGame=true;
            c.game.changeScreen_gacx6e$(c.ScreenViewType.SCREEN_MAIN_GAME);
            var scene=c.game.mainScene;scene.scriptProcess.stop();scene.scriptProcess.curOp_0=null;scene.scriptProcess.prev=null;scene.deleteAllNpc();
            scene.playerList.clear();
            var flags=c.script.ScriptResources.globalEvents;for(var i=0;i<flags.length;i++)flags[i]=false;
            flags[actor===2?2:1]=true;stage.flags.forEach(function(flag){flags[flag]=true;});
            // 门派链的前置仅补同一门派已完成的步骤，不能同时加入互斥门派。
            var family=stage.id.startsWith('huashan-')?101:stage.id.startsWith('beggar-')?151:0;
            if(family){flags[family]=true;var prefix=family===101?'huashan-':'beggar-';for(var task of q.sides.filter(function(t){return t.id.startsWith(prefix);})){if(task.id===stage.id)break;flags[task.flag]=true;}}
            c.script.ScriptResources.variables.fill(0);
            var map=entry.mapId.split(':').map(Number);scene.loadMap_tjonv8$(map[0],map[1],entry.x-4,entry.y-3);scene.createActor_qt1dr2$(actor,4,3);scene.setControlPlayer_za3lpa$(actor);
            scene.player.levelUp_za3lpa$(Math.min(stage.level,scene.player.levelupChain.maxLevel));scene.player.hp=scene.player.maxHP;scene.player.mp=scene.player.maxMP;
            var bag=c.characters.Player.Companion.sGoodsList;bag.addGoods_qt1dr2$(13,1,1);
            stage.goods.forEach(function(g){var key=g.id.split(':').map(Number);bag.addGoods_qt1dr2$(key[0],key[1],g.count);});
            c.characters.Player.Companion.sMoney=5000;c.Global.disableSave=false;
            try{global.localStorage.removeItem('bbk/jyqxz_goal');}catch(_){}
            var script=stage.scriptId.split(':').map(Number);scene.startChapter_vux9f0$(script[0],script[1]);
            close();return JSON.stringify({ok:true,message:'已进入「'+stage.title+'」，正常档位未覆盖'});
        }catch(error){close();return JSON.stringify({ok:false,message:'选关失败：'+String(error)});}
    };
    global.JyqxzStages={data:stages};
})(window);
