;(function (global) {
    'use strict';
    var data = global.FmjGuideData, Engine = global.FmjGuideEngine;
    if (!data || !Engine) return;
    var main = [
        {flag:1001,label:'雁门关：帮助华筝击退金兵',scriptId:'5:1',event:0},
        {flag:1002,label:'扬州：拜访江南七怪',scriptId:'12:29',event:1},
        {flag:1003,label:'雁门关：营救郭靖',scriptId:'5:1',event:0},
        {flag:1004,label:'京城：比武招亲与完颜康',scriptId:'9:16',event:0},
        {flag:1005,label:'京城客栈：了解王处一中毒',scriptId:'9:14',event:0},
        {flag:1006,label:'京城客栈：将毒龙涎交给王处一',scriptId:'9:14',event:0,item:'9:11'},
        {flag:1007,label:'大理：陆乘风居与梅超风',scriptId:'11:28',event:1},
        {flag:1008,label:'桃花岛洞：拜访周伯通',scriptId:'5:12',event:1},
        {flag:1009,label:'华山：华山论剑与九阴真经',scriptId:'4:7',event:0}
    ];
    var schools = [
        [101,'华山派','13:1',1], [151,'丐帮','7:1',1], [171,'武当派','10:1',1],
        [181,'全真教','12:1',1], [191,'少林寺','8:1',1], [192,'血刀门','16:1',1],
        [193,'星宿派','15:1',1], [194,'峨嵋派','17:1',2], [195,'古墓派','11:1',2],
        [196,'灵鹫宫','14:1',2], [197,'恒山派','9:1',2]
    ];
    var sides = [
        {id:'huashan-bandits',label:'华山：帮助梁发剿匪',after:101,flag:104,scriptId:'13:2',event:1,start:102,target:'5:2',targetEvent:0,level:20},
        {id:'huashan-tiger',label:'华山：帮陆大有寻找虎皮',after:104,flag:106,scriptId:'13:3',event:1,start:105,item:'14:26',shopTarget:'5:8',level:30},
        {id:'huashan-poison',label:'华山：为英白罗取得毒龙涎',after:106,flag:108,scriptId:'13:4',event:1,start:107,item:'9:11',level:40},
        {id:'huashan-clue',label:'华山：向岳不群打听剑宗',after:108,flag:109,scriptId:'13:1',event:1},
        {id:'huashan-inn',label:'京城客栈：调查剑宗线索',after:109,flag:110,scriptId:'9:14',event:42},
        {id:'huashan-key',label:'华山：向岳不群领取秘洞线索',after:110,flag:111,scriptId:'13:1',event:1},
        {id:'huashan-cave',label:'华山秘洞：拜访风清扬',after:111,flag:112,scriptId:'13:5',event:1},
        {id:'huashan-sword',label:'华山：寻找岳王剑',after:112,flag:116,scriptId:'13:4',event:1,start:113,target:'11:11',targetEvent:6,level:50,follow:[114,'9:11',52,115,'13:4',1]},
        {id:'huashan-spy',label:'华山：调查劳德诺与紫霞秘籍',after:116,flag:121,scriptId:'13:1',event:1,start:117,target:'12:26',targetEvent:1,level:60,follow:[118,'13:1',1,119,'12:26',1,120]},
        {id:'beggar-wine',label:'丐帮：为传功长老寻找五种名酒',after:151,flag:154,scriptId:'7:2',event:1,start:152,target:'12:14',targetEvent:42,level:20},
        {id:'beggar-dali',label:'丐帮：收集大理情报',after:154,flag:157,scriptId:'7:3',event:1,start:155,target:'11:11',targetEvent:2,level:30,follow:[156,'7:3',1]},
        {id:'beggar-letter',label:'丐帮：通知京城弟子',after:157,flag:160,scriptId:'7:3',event:1,start:158,target:'9:11',targetEvent:8,level:40,follow:[159,'7:3',1]},
        {id:'beggar-stick',label:'丐帮：向黄蓉学习打狗棒法',after:160,flag:162,scriptId:'7:1',event:1,start:161,target:'6:5',targetEvent:1,level:50},
        {id:'beggar-map',label:'丐帮：将北方地图交给朝廷',after:162,flag:165,scriptId:'7:1',event:1,start:163,target:'9:11',targetEvent:52,level:50,follow:[164,'7:1',1]},
        {id:'earring',label:'京城：阿芳的嫁妆',flag:2351,scriptId:'9:11',event:9,start:25,target:'9:13',targetEvent:42},
        {id:'tiger-boy',label:'京城：虎子的弹弓',flag:2352,scriptId:'9:27',event:1,start:29,target:'9:19',targetEvent:42,follow:[30,'9:27',1]},
        {id:'boy-teacher',label:'京城：替虎子拜师',flag:2353,scriptId:'9:26',event:1,start:31,target:'9:16',targetEvent:42,follow:[32,'9:26',1]},
        {id:'medicine',label:'大理：王老先生求药',flag:2350,scriptId:'11:26',event:1,item:'9:1',shopTarget:'11:15',shopEvent:42},
        {id:'family-letter',label:'扬州：阿鸿的家书',flag:2354,scriptId:'12:27',event:1,start:36,target:'11:27',targetEvent:1,follow:[37,'12:27',1]},
        {id:'tiger-hunt',label:'大理：武介山收集虎皮',flag:2355,scriptId:'11:11',event:1,item:'14:26',shopTarget:'5:8'}
    ];

    /**
     * 从当前角色、等级、物品及真实旗标计算提示目标，不替玩家写旗标或领取奖励。
     * 学武和门派任务按原等级限制提示；男女主角和互斥门派保持原规则。
     * @param {Object} state 原引擎快照。
     * @return {Array<Object>} 独立任务状态。
     */
    Engine.prototype.questTasks = function (state) {
        var f=state.flags, school=schools.find(function(s){return f[s[0]];});
        var rows=sides.map(function(task,index){
            var requiredLevel=task.level?task.level+1:0;
            var done=!!f[task.flag],ready=(!task.after||f[task.after])&&(!requiredLevel||state.level>=requiredLevel);
            var target=Object.assign({kind:'side',hint:'按原对话完成任务；分支由你决定。'},task);
            if(task.start&&f[task.start]&&task.target){target.scriptId=task.target;target.event=task.targetEvent;}
            if(task.follow){for(var i=0;i+2<task.follow.length;i+=3){if(f[task.follow[i]]){target.scriptId=task.follow[i+1];target.event=task.follow[i+2];}}}
            if(task.item&&state.goods[task.item]<1){target.scriptId=task.shopTarget||'10:13';target.event=task.shopEvent||(!task.shopTarget?42:0);target.hint='需要「'+(data.goods.find(function(g){return g.id===task.item;})||{name:task.item}).name+'」，购买或战斗取得后交还任务人物。';}
            if(requiredLevel&&state.level<requiredLevel)target.hint='原版要求至少 '+requiredLevel+' 级；先练级再完成对话。';
            var deferFlag=2370+index,deferred=!!f[deferFlag];
            return Object.assign(target,{deferFlag:deferFlag,status:done?'done':deferred?'deferred':ready?'ready':'pending',statusLabel:done?'已完成':deferred?'已暂缓':ready?'可前往':'前置未完成',detail:target.hint});
        });
        if(school&&![101,151].includes(school[0])){
            var script=this.scripts.get(school[2]),learning=script.commands.filter(function(c){return c.op===26&&c.a[0]>=182&&c.a[0]<=186;}).filter(function(c,i,all){return all.findIndex(function(other){return other.a[0]===c.a[0];})===i;});
            learning.forEach(function(command,index){
                var threshold=script.commands.filter(function(c){return c.at<command.at&&c.op===58&&c.a[1]===0;}).slice(-1)[0];if(!threshold)return;var level=threshold.a[2];
                rows.push({id:'school-'+command.a[0],label:school[1]+'：学习第 '+(index+1)+' 阶武功',scriptId:school[2],event:1,kind:'side',status:f[command.a[0]]?'done':state.level>=level?'ready':'pending',statusLabel:f[command.a[0]]?'已完成':'至少 '+level+' 级',detail:'由本 ROM 等级检查 '+level+' 级及旗标 '+command.a[0]+' 判断。',hint:'达到 '+level+' 级后与掌门对话。'});
            });
        }
        return rows;
    };
    Engine.prototype.progress=function(state){return main.map(function(t){return {flag:t.flag,title:t.label,detail:'由本游戏原旗标 '+t.flag+' 判断，读档同步回退。',done:!!state.flags[t.flag]};});};
    Engine.prototype.nextGoal=function(state){
        var selected;try{selected=JSON.parse(global.localStorage.getItem('bbk/jyqxz_goal')||'null');}catch(_){}
        if(selected&&this.scripts.has(selected.scriptId)&&(!selected.flag||!state.flags[selected.flag])&&(!selected.deferFlag||!state.flags[selected.deferFlag]))return selected;
        if(selected)try{global.localStorage.removeItem('bbk/jyqxz_goal');}catch(_){}
        if(state.questMode==='complete'){
            var school=schools.find(function(s){return state.flags[s[0]];});
            var tasks=this.questTasks(state);
            var task=tasks.find(function(t){return t.status==='ready'&&(school?(school[0]===101&&t.id.startsWith('huashan-')||school[0]===151&&t.id.startsWith('beggar-')||t.id.startsWith('school-')):false);})||tasks.find(function(t){return t.status==='ready'&&!t.id.startsWith('huashan-')&&!t.id.startsWith('beggar-')&&!t.id.startsWith('school-');});
            if(task)return task;
        }
        var next=main.find(function(t){return !state.flags[t.flag];})||{label:'主线已完成，自由探索江湖',scriptId:state.scriptId,event:0};
        if(next.item&&!state.goods[next.item])return {label:'西夏杂货铺：为王处一购买毒龙涎',scriptId:'10:13',event:42,hint:'到杂货铺购买毒龙涎后再返回京城客栈。'};
        return Object.assign({hint:next.event?'到达后按确认与人物交互。':'沿真实入口进入场景，开场剧情由原引擎执行。'},next);
    };
    /**
     * 一些主线在场景初始化执行；同场景的下一阶段必须沿出口离开再正常进入。
     * 只拼接真实的往返路线，不直接重放初始化、重建场景或修改任务旗标。
     * @param {Object} initial 真实状态。
     * @return {Object} 正常道路计划。
     */
    Engine.prototype.taskPlan=function(initial){
        var goal=this.nextGoal(initial),target=Object.assign({},goal,{allowBoundary:true});
        if(!goal.event&&goal.flag&&initial.scriptId===goal.scriptId){
            var flood=this.flood(initial);
            if(flood)for(var exit of this.navigationExits(initial,flood)){
                if(exit.kind==='item')continue;
                var input=this.copy(initial);input.x=exit.anchorX;input.y=exit.anchorY;
                var outcome=this.simulate(input,exit.event);
                if(!outcome.stable||outcome.state.scriptId===initial.scriptId)continue;
                var back=this.route(outcome.state,target);
                if(!back.unavailable){back.steps=[{scriptId:initial.scriptId,mapId:initial.mapId,exit:exit,toScriptId:outcome.state.scriptId,toMapId:outcome.state.mapId}].concat(back.steps||[]);back.goal=goal;return back;}
            }
            return {unavailable:true,goal:goal};
        }
        return Object.assign(this.route(initial,target),{goal:goal});
    };
    global.JyqxzQuests={main:main,schools:schools,sides:sides};
    var core=global['fmj.core']&&global['fmj.core'].fmj;
    if(core&&core.game&&core.game.vm){
        var originalLoad=core.script.ScriptVM.prototype.loadGut_0;
        var markers={'11:26/400':[41,2350],'9:11/1618':[41,2351],'9:27/323':[27,2352],'9:26/390':[27,2353],'12:27/729':[41,2354],'11:11/781':[41,2355]};
        /**
         * 原版接受委托的旗标会在交付时清除。仅在真实交付/奖励指令执行后记录辅助完成位，
         * 随原存档序列化；不会领取物品、发金钱、消费道具或改变原条件。
         */
        core.script.ScriptVM.prototype.loadGut_0=function(gut,print){
            var process=originalLoad.call(this,gut,print),id=(gut.type&255)+':'+(gut.index&255),script=data.scripts.find(function(s){return s.id===id;});
            if(script)script.commands.forEach(function(entry,index){
                var marker=markers[id+'/'+entry.at];if(!marker||entry.op!==marker[0])return;
                var command=process.commands_0.get_za3lpa$(index),run=command.run_fhed9o$;
                command.run_fhed9o$=function(){var result=run.apply(this,arguments);core.script.ScriptResources.globalEvents[marker[1]]=true;return result;};
            });
            return process;
        };
        /** 只记录玩家实际拒绝的支线选择；完整流程暂缓该任务，不替玩家选分支。 */
        global.addEventListener('fmj-choice-result',function(event){
            var choice=event.detail;if(!choice||!(/不|难担|无能|拒绝|取消/.test(choice.label)||choice.index<0))return;
            var state=global.FmjGuide&&global.FmjGuide.state();if(!state)return;
            var current=global.FmjGuide.engine.nextGoal(state);
            if(current&&current.kind==='side'&&current.scriptId===choice.script&&current.deferFlag)core.script.ScriptResources.globalEvents[current.deferFlag]=true;
        });
    }
})(window);
