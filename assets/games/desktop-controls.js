;(function (global) {
    'use strict';
    // 在原游戏键盘监听之前捕获事件，避免硬编码方向键与自定义映射同时执行。
    // 输入框保留打字功能；Flutter 路由负责区分游戏、设置弹窗与按键录入。
    function capture(event) {
        var target = event.target;
        event.stopImmediatePropagation();
        // 输入框与系统快捷键保留浏览器默认操作，但不再传给底层游戏硬编码监听。
        if (event.ctrlKey || event.metaKey || event.altKey ||
            target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
        event.preventDefault();
        if (event.type !== 'keydown') return;
        if (global.BbkSystemChannel) global.BbkSystemChannel.postMessage(JSON.stringify({
            type: 'desktop_key', data: { code: event.code, repeat: event.repeat }
        }));
    }
    global.addEventListener('keydown', capture, true);
    global.addEventListener('keyup', capture, true);
})(window);
