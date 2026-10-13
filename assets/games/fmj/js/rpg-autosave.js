;(function (global) {
    'use strict';
    var module = global['fmj.core'], c = module && module.fmj, guide = global.FmjGuide;
    if (!c || !guide || global.BbkRpgAutoSave) return;
    var lastNode = null, lastCheckpoint = '', lastSavedAt = 0, lastCheck = 0;
    var active = true, count = 0, lastError = null, retryAfter = 0;

    /** @return {Object|null} 原游戏可正常存档的主场景状态，不在对白/战斗中截取半成品。 */
    function safeState() {
        if (!active || c.Global.disableSave) return null;
        var scene = c.game.mainScene;
        if (!scene || !scene.player || c.game.getCurScreen() !== scene ||
            scene.scriptProcess.running || scene.scriptProcess.prev || c.combat.Combat.Companion.IsActive()) return null;
        return guide.state();
    }
    function nodeKey(state) {
        var goal = guide.engine.nextGoal(state);
        // 同一人物可能先接受、再交付任务。记录真实剧情位，不能只比较目标名称。
        // FMJ 的 100～114 位仅表示道路实例，不把普通跨图当成任务进展。
        var story = state.flags.map(function (done, index) {
            return done && (global.BbkRpgGameId === 'jyqxz' || index < 100 || index > 114) ? index : '';
        }).filter(String).join(',');
        return [goal.id || goal.label, goal.scriptId, goal.event || 0, !!goal.noTarget, story].join('/');
    }

    /**
     * 按原二进制序列化顺序覆盖第一档，并沿既有存储桥同步 Flutter 文件镜像。
     * 所有字节准备完成后才写入，不创建存档菜单，不修改第二、三档和选关备份。
     * @param {Object} state 可存档的原游戏状态。
     * @param {string} key 当前任务标识。
     * @return {boolean} 是否完成原格式存档写入。
     */
    function save(state, key) {
        var checkpoint = key + '/' + state.scriptId + '/' + state.mapId + '/' + state.x + ',' + state.y;
        if (checkpoint === lastCheckpoint && Date.now() - lastSavedAt < 250) return true;
        try {
            var out = new module.java.ObjectOutputStream(new module.java.File('sav/fmjsave0'));
            c.scene.SaveLoadGame.write_bvlcvx$(c.game, out);
            c.script.ScriptResources.write_vcd9jg$(out); out.close();
            lastNode = key; lastCheckpoint = checkpoint; lastSavedAt = Date.now();
            lastError = null; count++; return true;
        } catch (error) {
            // 原场景继续运行，稍后在稳定状态重试；每轮失败只提示一次。
            if (!lastError && global.BbkSystemChannel) global.BbkSystemChannel.postMessage(JSON.stringify({
                type: 'fmj_notice', data: { ok: false, message: '自动存档失败，请使用存档按钮重试。' }
            }));
            lastError = String(error); retryAfter = Date.now() + 1000; return false;
        }
    }
    /** 导航在必须处理的剧情边界前请求检查点，仍遵守原版禁止存档条件。 */
    function checkpoint() {
        var state = safeState();
        return !!state && save(state, nodeKey(state));
    }

    var trigger = c.script.ScriptProcess.prototype.triggerEvent_za3lpa$;
    c.script.ScriptProcess.prototype.triggerEvent_za3lpa$ = function (event) {
        var state = c.game.mainScene && this === c.game.mainScene.scriptProcess && safeState();
        if (state) {
            var goal = guide.engine.nextGoal(state), rows = guide.engine.questTasks(state);
            if (goal.scriptId === state.scriptId && goal.event === event || rows.some(function (row) {
                return row.scriptId === state.scriptId && row.event === event && row.status === 'ready';
            })) save(state, nodeKey(state));
        }
        return trigger.call(this, event);
    };
    var update = c.game.update_s8cxhz$;
    c.game.update_s8cxhz$ = function (delta) {
        var result = update.call(this, delta), now = Date.now();
        // 只观察任务变更，每秒最多检查四次；没有自己的计时器或额外导航计算。
        if (active && now - lastCheck >= 250 && now >= retryAfter) {
            lastCheck = now;
            var state = safeState();
            if (state) {
                var key = nodeKey(state);
                if (key !== lastNode) save(state, key);
            }
        }
        return result;
    };
    global.BbkRpgAutoSave = { checkpoint: checkpoint, inspect: function () {
        return { slot: 0, count: count, node: lastNode, error: lastError };
    } };
    global.addEventListener('pagehide', function () { active = false; });
    global.addEventListener('pageshow', function () { active = true; });
})(window);
