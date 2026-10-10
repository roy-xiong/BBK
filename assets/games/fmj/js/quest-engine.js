;(function (global) {
    'use strict';
    var Engine = global.FmjGuideEngine;
    if (!Engine) return;
    var mainGoal = Engine.prototype.nextGoal;
    var keyLocks = [
        { id: 'worm-card', label: '白水镇：取得虫子卡片', scriptId: '9:1', event: 21, flag: 1077, after: 229, defer: 2330 },
        { id: 'violet-lamp', label: '南北村：紫瞳魔灯与袁姑娘的往事', scriptId: '10:1', event: 21, flag: 1114, after: 234, defer: 2331, expires: 252 },
        { id: 'ghost-card', label: '酆都客栈：取得小鬼卡片', scriptId: '11:4', event: 21, flag: 1095, after: 247, defer: 2332 },
        { id: 'point-card', label: '鹤鸣山洞：取得不点卡片', scriptId: '14:9', event: 21, flag: 1099, after: 253, defer: 2333 },
        { id: 'star-weapon', label: '观星亭：开启后期宝箱', scriptId: '2:33', event: 1, flag: 1104, after: 260, defer: 2334 }
    ];
    var statusNames = { done: '已完成', ready: '可前往', pending: '前置未完成', skipped: '未选分支', deferred: '已暂缓', locked: '条件不足', expired: '已错过时机' };
    function count(state, index) { return state.goods && state.goods['14:' + index] || 0; }

    /**
     * 把支线拆成真实事件节点；只读取存档和物品，不替玩家领取奖励或选择分支。
     * 原版三把万能钥匙无法同时打开五处锁箱，未开启的箱子必须显示实际资源限制。
     * @param {Object} state 原游戏快照。
     * @return {Array<Object>} 完成状态、条件说明及真实交互目标。
     */
    Engine.prototype.questTasks = function (state) {
        var f = state.flags, rows = [];
        function add(id, label, scriptId, event, done, ready, detail, other) {
            var row = Object.assign({ id: id, label: label, scriptId: scriptId, event: event, kind: 'side', status: done ? 'done' : ready ? 'ready' : 'pending', detail: detail }, other);
            if (!done && row.skip) row.status = 'skipped';
            else if (!done && row.expired) row.status = 'expired';
            else if (!done && row.deferred) row.status = 'deferred';
            else if (!done && ready && row.missing) row.status = 'locked';
            row.statusLabel = statusNames[row.status];
            row.hint = row.detail + '。到达后正常交互，分支由你决定。';
            rows.push(row);
        }
        add('letter-accept', '情书：接受老孟托付', '3:5', 1, f[201], f[202] && !f[216], '老孟位于忘忧村，收信后前往建业', { expired: f[216] && !f[201] });
        add('daughter-dong', '寻女：向东东打听蔡婆婆', '3:4', 1, f[205], f[202], '先取得蔡婆婆闭门不出的线索', { expired: f[216] });
        add('daughter-xia', '寻女：向阿霞打听小画家', '3:7', 1, f[206], f[205], '东东的线索之后，阿霞会开放蔡婆婆家入口', { expired: f[216] && !f[205] });
        add('daughter-accept', '寻女：接受蔡婆婆委托', '3:8', 1, f[207], f[206], '了解小画家被李虎掳走的经过', { expired: f[216] && !f[205] });
        add('wang-choice', '李府：决定老王去留', '5:18', 1, f[211] || f[213], f[210] && !f[215], f[213] ? '已选择处置老王' : f[211] ? '已选择放走老王，开放妻子的密道线索' : '放走与处置是互斥分支', { expired: f[215] && !f[211] && !f[213] });
        add('daughter-rescue', '寻女：救出李府东厢房的小画家', f[214] || state.scriptId === '5:16' ? '5:16' : '5:1', state.scriptId === '5:16' ? 1 : 56, f[214], f[210] && f[207] && !f[215], '用李虎留下的金色钥匙进入东厢房', { expired: f[215] && !f[214], deferred: f[2335], missing: state.scriptId !== '5:16' && !count(state, 4) });
        add('wang-wife', '老王妻子：打听李府密道', '5:2', 1, f[212], f[211] && !f[215], '放走老王后，他的妻子会告知密道', { skip: f[213], expired: f[215] && !f[212] });
        var vaultFlags = [65,66,67,68,69,70], vaultAt = vaultFlags.findIndex(function (flag) { return !f[flag]; });
        add('lifu-vault', '李府密道：探索宝库六处宝藏', '5:21', vaultAt < 0 ? 2 : vaultAt + 2, vaultAt < 0, f[212] && !f[215], '经真实密道楼梯抵达，已取 ' + (6 - vaultFlags.filter(function (flag) { return !f[flag]; }).length) + '/6', { skip: f[213] && !f[212], expired: f[215] && vaultAt >= 0 });
        add('daughter-thanks', '寻女：回蔡婆婆家领取答谢', '3:8', 1, f[222], f[214] && !f[216], '救人后回村，领取七星灯', { expired: f[216] && !f[222] });
        add('letter-deliver', '情书：向建业阿军交信', '7:9', 1, f[264], f[201] && f[217] && !f[219], '交信获得三把万能钥匙', { expired: f[219] && !f[264], missing: !count(state, 3) });
        add('money-bag', '建业钱袋：决定归还或留下', '7:1', 21, f[1117] || f[1118], f[218] && !f[219], f[1117] ? '已选择归还钱袋' : f[1118] ? '已选择留下钱袋并完成战斗' : '触发街头钱袋事件，由你决定去留', { expired: f[219] && !f[1117] && !f[1118] });
        keyLocks.forEach(function (lock) {
            add(lock.id, lock.label, lock.scriptId, lock.event, f[lock.flag], f[lock.after] && f[264], '消耗一把万能钥匙；当前剩余 ' + count(state, 2) + ' 把', {
                deferred: f[lock.defer], expired: lock.expires && f[lock.expires], missing: !count(state, 2), deferFlag: lock.defer
            });
        });
        add('worm-return', '愚人居：通宵虫的卡片与衣服分支', '2:52', 30, f[2301] || f[263] || state.wormResolved, f[254] && f[2008], f[263] ? '已选择不交换；原版不再开放交易' : '可还卡学法术，或用身上全部金钱换衣服');
        add('point-return', '愚人居：不点点的隐藏商店', '2:52', 31, f[2302], f[254] && f[2010], f[2313] ? '已选择不给卡片，商人离开' : '交出不点卡片后按原版打开商店，购物后退出', { missing: !count(state, 7) });
        add('ghost-return', '愚人居：南方小鬼的绝世武功', '2:52', 32, f[2303] || f[261] || state.ghostResolved, f[254] && f[2009], f[261] ? '已选择不归还；原版不再接受卡片' : '归还小鬼卡片学习武功', { missing: !count(state, 6) });
        add('sword-rematch', '伏魔洞：护剑神再比试', '2:18', 17, f[2314] || state.endingSeen, f[260], f[2314] ? (f[2315] ? '已选择欠扁，继续原版战斗与结局' : '已选择免战，继续原版结局') : '结局必经的二选一：免战或欠扁');
        return rows;
    };

    /** 完整模式按剧情阶段补齐可进行的支线，未开放道路及资源不足仍遵守原版。 */
    Engine.prototype.nextGoal = function (state) {
        if (state.questMode === 'complete' && !state.endingSeen) {
            var next = this.questTasks(state).find(function (row) { return row.status === 'ready'; });
            if (next) return next;
        }
        return mainGoal.call(this, state);
    };
    global.FmjQuests = { keyLocks: keyLocks, statusNames: statusNames };

    var c = global['fmj.core'] && global['fmj.core'].fmj;
    if (!c || !c.game || !c.game.vm) return;
    var originalLoad = c.script.ScriptVM.prototype.loadGut_0;
    c.script.ScriptVM.prototype.loadGut_0 = function (gut, print) {
        var process = originalLoad.call(this, gut, print), id = (gut.type & 255) + ':' + (gut.index & 255);
        var script = global.FmjGuideData.scripts.find(function (entry) { return entry.id === id; });
        if (!script) return process;
        script.commands.forEach(function (entry, index) {
            // 原 ROM 的小鬼事件误用了 14:7；只替换这一个已确认的物品消费操作。
            if (id === '2:52' && entry.at === 1072 && entry.op === 57 && entry.a.join(',') === '14,7,1181') {
                process.commands_0.set_wxm5ur$(index, c.game.vm.instructions_0[57](new Int8Array([14,0,6,0,157,4]), 0));
            }
            // 原卡片支线没有完成标记。记录原脚本实际执行到的结束节点，标记随原存档保存，
            // 既不修改奖励，也不改变道路条件；读取旧档可由已学法术补充识别。
            var marker = id === '2:52' && entry.op === 3 ? ({465:2301,536:2301,765:2302,865:2302,1131:2303})[entry.at] : id === '2:18' && entry.at === 1527 && entry.op === 20 ? 2316 : 0;
            if (!marker) return;
            var command = process.commands_0.get_za3lpa$(index), run = command.run_fhed9o$;
            command.run_fhed9o$ = function () {
                var result = run.apply(this, arguments);
                c.script.ScriptResources.globalEvents[marker] = true;
                if (entry.at === 765) c.script.ScriptResources.globalEvents[2313] = true;
                return result;
            };
        });
        return process;
    };
    global.addEventListener('fmj-choice-result', function (event) {
        var choice = event.detail, flags = c.script.ScriptResources.globalEvents;
        var lock = keyLocks.find(function (entry) { return entry.scriptId === choice.script; });
        if (lock && choice.index === 0) flags[lock.defer] = true;
        if (choice.script === '5:1' && choice.at === 512 && choice.index === 0) flags[2335] = true;
        if (choice.script === '2:18' && choice.at === 866) { flags[2314] = true; flags[2315] = choice.index === 1; }
    });
})(window);
