;(function (global) {
    'use strict';
    var module = global['fmj.core'], core = module && module.fmj;
    if (!core || !core.game) return;
    var enabled = false, timer = null;

    /** 战斗对白、战斗事件和用户打开的子菜单都优先于自动攻击。 */
    function storyBusy(scene) {
        var process = scene && scene.scriptProcess;
        return !!(process && (process.running || process.curOp_0));
    }

    /** 只调用原自动攻击入口，不修改伤害、随机数、法术或剧情状态。 */
    function tick() {
        if (!enabled) return;
        try {
            var combat = core.combat.Combat.Companion, instance = combat.sInstance_0, scene = core.game.mainScene;
            if (!combat.IsActive() || !instance || instance.mCombatState_0.name !== 'SelectAction' || instance.mIsAutoAttack_0 || storyBusy(scene)) return;
            var screen = instance.mCombatUI_0.getCurScreen();
            if (!screen || screen.constructor.name !== 'CombatUI$MainMenu') return;
            instance.onAutoAttack();
        } catch (_) {
            // 场景刚切换时对象可能尚未完整建立，下一轮继续检查。
        }
    }

    function setEnabled(value) {
        enabled = !!value;
        if (!timer) timer = global.setInterval(tick, 80);
        return JSON.stringify({ ok: true, enabled: enabled });
    }

    global.bbkSetFmjAutoBattle = setEnabled;
    global.bbkGetFmjAutoBattle = function () { return JSON.stringify({ enabled: enabled }); };
    global.addEventListener('pagehide', function () {
        if (timer) global.clearInterval(timer);
        timer = null; enabled = false;
    });
})(window);
