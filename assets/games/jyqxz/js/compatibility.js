;(function(global){
    'use strict';
    var core=global['fmj.core']&&global['fmj.core'].fmj;
    if(!core||!core.combat)return;
    var prototype=core.combat.Combat.prototype,original=prototype.generateAutoActionQueue_0;
    /**
     * 立即胜利或一击必杀后，旧自动攻击入口会对空的存活目标强制解包。
     * 空队列交回原 PerformAction 状态机，保留金钱、经验、掉落、对白和胜负地址。
     * 不直接调用 FightDisable，避免跳过原剧情的战后分支。
     */
    prototype.generateAutoActionQueue_0=function(){
        if(this.isAllMonsterDead_0){this.mActionQueue_0.clear();return;}
        return original.apply(this,arguments);
    };
})(window);
