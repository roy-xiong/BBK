;(function (global) {
    'use strict';
    // 在原游戏键盘监听之前捕获事件，避免硬编码方向键与自定义映射同时执行。
    // 输入框保留打字功能；Flutter 路由负责区分游戏、设置弹窗与按键录入。
    global.addEventListener('keydown', function (event) {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        var target = event.target;
        if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
        event.stopImmediatePropagation();
        event.preventDefault();
        if (global.BbkSystemChannel) global.BbkSystemChannel.postMessage(JSON.stringify({
            type: 'desktop_key', data: { code: event.code, repeat: event.repeat }
        }));
    }, true);
})(window);
