;(function (global) {
    'use strict';
    var module = global['fmj.core'], core = module && module.fmj;
    if (!core || !core.game) return;
    var enabled = global.FmjPreferences ? global.FmjPreferences.get('autoBattle') : false, timer = null;

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

    /** 恢复时不重写设置；用户切换时即时持久化，并只在开启期间保留检测定时器。 */
    function setEnabled(value, persist) {
        enabled = !!value;
        if (persist !== false && global.FmjPreferences) global.FmjPreferences.set('autoBattle', enabled);
        if (enabled && !timer) timer = global.setInterval(tick, 80);
        if (!enabled && timer) { global.clearInterval(timer); timer = null; }
        return JSON.stringify({ ok: true, enabled: enabled });
    }

    global.bbkSetFmjAutoBattle = setEnabled;
    global.bbkGetFmjAutoBattle = function () { return JSON.stringify({ enabled: enabled }); };
    global.addEventListener('pagehide', function () {
        if (timer) global.clearInterval(timer);
        timer = null;
    });
    global.addEventListener('pageshow', function () { setEnabled(enabled, false); });
    setEnabled(enabled, false);
})(window);
