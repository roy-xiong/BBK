;(function (global) {
    'use strict';
    var gameId = global.BbkRpgGameId || 'fmj', storageKey = 'bbk/' + gameId + '_controls';
    var defaults = {
        invincible: false, oneHitKill: false, normalAttackAll: false,
        randomBattleDisabled: false, runSpeed: 1, autoBattle: false,
        wideView: true, storyScope: 'complete'
    };
    var controls = Object.assign({}, defaults), restored = null;

    /**
     * 校验真实按钮值，拒绝损坏存储中的字符串布尔值、非法倍率及未知字段。
     * @param {string} name 按钮状态名称。
     * @param {*} value 待恢复或保存的值。
     * @return {boolean} 是否符合该按钮的类型和范围。
     */
    function valid(name, value) {
        if (!Object.prototype.hasOwnProperty.call(defaults, name)) return false;
        if (name === 'runSpeed') return Number.isInteger(value) && value >= 1 && value <= 4;
        if (name === 'storyScope') return value === 'main' || value === 'complete';
        return typeof value === 'boolean';
    }
    try {
        restored = JSON.parse(global.localStorage.getItem(storageKey));
        Object.keys(defaults).forEach(function (name) {
            if (restored && valid(name, restored[name])) controls[name] = restored[name];
        });
        // 迁移旧版本已有的视野和流程范围；以后以同一份按钮设置为准。
        if (!restored || !valid('wideView', restored.wideView)) {
            var oldView = global.localStorage.getItem('bbk/' + gameId + '_wide_view');
            if (oldView === 'true' || oldView === 'false') controls.wideView = oldView === 'true';
        }
        if (!restored || !valid('storyScope', restored.storyScope)) {
            var oldScope = global.localStorage.getItem('bbk/' + gameId + '_story_scope');
            if (valid('storyScope', oldScope)) controls.storyScope = oldScope;
        }
    } catch (_) {
        // 存储不可用或 JSON 损坏时使用本局有效默认值，不阻断引擎加载。
    }

    /**
     * 将按钮状态实时写入网页存储和 Flutter 文件镜像。
     *
     * 只存开关和设置，不存钩子安装状态，也不会重放金钱、升级或发放道具等
     * 一次性操作。整份设置作为一个键提交，快速连续切换时最后一次值完整。
     * @return {Object} 可随原游戏存档一起导出的设置键值。
     */
    function save() {
        var value = JSON.stringify(controls), entries = {};
        entries[storageKey] = value;
        try {
            global.localStorage.setItem(storageKey, value);
            global.localStorage.setItem('bbk/' + gameId + '_wide_view', String(controls.wideView));
            global.localStorage.setItem('bbk/' + gameId + '_story_scope', controls.storyScope);
        } catch (_) { /* 网页存储失效时仍保留本局状态，并尝试保存 Flutter 镜像。 */ }
        try {
            if (global.BbkSaveChannel) global.BbkSaveChannel.postMessage(JSON.stringify({ entries: entries }));
        } catch (_) { /* 页面销毁期间通道可能不可用，网页存储仍能恢复设置。 */ }
        return entries;
    }

    global.FmjPreferences = {
        get: function (name) { return controls[name]; },
        set: function (name, value) {
            if (!valid(name, value)) return false;
            controls[name] = value;
            save();
            return true;
        },
        export: function () { var entries = {}; entries[storageKey] = JSON.stringify(controls); return entries; },
        flush: save
    };
    global.addEventListener('pagehide', save);
})(window);
