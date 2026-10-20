(function (global) {
    'use strict';
    var native = global.BbkBackgroundClock;
    if (!native || global.BbkBackgroundRuntime) return;
    var browserTimeout = global.setTimeout.bind(global);
    var browserClear = global.clearTimeout.bind(global);
    var tasks = new Map();
    var nextId = -1, background = false, ticking = false;
    var now = function () { return global.performance.now(); };

    /** 后台只请求最近一次到期时间；一批回调只跨一次原生桥，避免高倍速下频繁通信。 */
    function schedule() {
        if (!background || ticking) return;
        var earliest = Infinity;
        tasks.forEach(function (task) { earliest = Math.min(earliest, task.due); });
        native.schedule(earliest === Infinity ? -1 : Math.max(4, Math.ceil(earliest - now())));
    }

    function armBrowser(task) {
        task.browserId = browserTimeout(function () {
            task.browserId = null;
            fire(task);
        }, Math.max(0, task.due - now()));
    }

    /** 单次回调先移除，interval允许在自身回调中取消；迟到时不补发积压的重复回调。 */
    function fire(task) {
        if (tasks.get(task.id) !== task) return;
        if (task.repeat) task.due = now() + (background ? Math.max(4, task.delay) : task.delay);
        else tasks.delete(task.id);
        try {
            task.callback.apply(global, task.args);
        } catch (error) {
            // 保留浏览器的异常报告方式，单个回调抛错不能停止其他游戏计时器。
            browserTimeout(function () { throw error; }, 0);
        }
        if (task.repeat && tasks.get(task.id) === task && !background) armBrowser(task);
    }

    function add(callback, delay, repeat, args) {
        delay = Number(delay);
        if (!Number.isFinite(delay) || delay < 0 || delay > 2147483647) delay = 0;
        var task = {
            id: nextId--,
            callback: typeof callback === 'function' ? callback : function () { global.eval(String(callback)); },
            delay: delay, repeat: repeat, args: args, due: now() + delay, browserId: null
        };
        tasks.set(task.id, task);
        if (background) schedule(); else armBrowser(task);
        return task.id;
    }

    /** 负数ID属于本适配层，浏览器及其他库已有的正数ID仍交回原生浏览器清理。 */
    function clear(id) {
        var task = tasks.get(id);
        if (!task) { browserClear(id); return; }
        tasks.delete(id);
        if (task.browserId !== null) browserClear(task.browserId);
        schedule();
    }

    global.setTimeout = function (callback, delay) {
        return add(callback, delay, false, Array.prototype.slice.call(arguments, 2));
    };
    global.setInterval = function (callback, delay) {
        return add(callback, delay, true, Array.prototype.slice.call(arguments, 2));
    };
    global.clearTimeout = global.clearInterval = clear;
    global.BbkBackgroundRuntime = {
        /** 由Activity切换，保留剩余延迟；前后台不能同时驱动同一任务。 */
        setBackground: function (enabled) {
            enabled = enabled === true;
            if (background === enabled) return;
            background = enabled;
            tasks.forEach(function (task) {
                if (task.browserId !== null) browserClear(task.browserId);
                task.browserId = null;
                if (!background) armBrowser(task);
            });
            schedule();
        },
        /** 只执行本次进入时已到期的任务，嵌套零延迟任务仍留给下一轮，避免同步重入WASM。 */
        tick: function () {
            if (!background || ticking) return;
            ticking = true;
            try {
                var timestamp = now();
                Array.from(tasks.values()).filter(function (task) { return task.due <= timestamp; })
                    .sort(function (left, right) { return left.due - right.due; })
                    .slice(0, 128).forEach(fire);
            } finally {
                ticking = false;
                schedule();
            }
        }
    };
    // 页面可能在后台才完成加载，不能只依赖此前的一次生命周期通知。
    global.BbkBackgroundRuntime.setBackground(native.isBackground());
})(window);
