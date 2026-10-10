;(function (global) {
    'use strict';
    var core = global['fmj.core'] && global['fmj.core'].fmj;
    if (!core || !core.game || !core.game.vm) return;
    var pending = null, layer = null, sequence = 0, lastDialogue = '';

    function decode(bytes) { return global.sysGbkDecode(bytes).replace(/\0[\s\S]*$/, '').trim(); }
    function remove() { if (layer) layer.remove(); layer = null; pending = null; }

    /**
     * 选择结果仅在原游戏的确认/取消操作已执行后记录。
     * 不写剧情跳转或道具；通知攻略记录玩家实际选择的分支。
     * @param {Object} request 当前原选择事件。
     * @param {number} index 原选项索引，-1 代表原菜单取消。
     * @return {Object} 本次选择通知。
     */
    function finish(request, index) {
        var result = {ok:true,id:request.id,index:index,script:request.script,at:request.at,
            label:index < 0 ? '取消' : request.options[index]};
        if (pending === request) remove();
        global.dispatchEvent(new CustomEvent('fmj-choice-result', {detail:result}));
        return result;
    }

    /** 显示不接管输入的说明，原游戏仍以方向键和确认键决定给不给。 */
    function show(operation, opcode, offset) {
        if (pending) remove();
        var menu = operation.closure$menu || null;
        var options = menu ? menu.paddedItems_0.toArray().map(decode) :
            [decode(operation.closure$choice1.v), decode(operation.closure$choice2.v)];
        var process = core.game.mainScene && core.game.mainScene.scriptProcess;
        var request = {id:++sequence,operation:operation,menu:menu,options:options,opcode:opcode,
            script:process ? process.name_0.replace('-', ':') : '',at:offset + (process && process.mHeaderCnt_0 || 0),
            context:lastDialogue};
        pending = request;
        var input = menu || operation, originalKeyUp = input.onKeyUp_za3lpa$;
        input.onKeyUp_za3lpa$ = function (key) {
            var selected = menu ? menu.curSel_0 : operation.curChoice_0;
            var result = originalKeyUp.apply(this, arguments);
            if (pending === request && (menu && (key === core.Global.KEY_ENTER || key === core.Global.KEY_CANCEL) ||
                    !menu && operation.hasSelect_0)) finish(request, key === core.Global.KEY_CANCEL ? -1 : selected);
            return result;
        };
        layer = document.createElement('aside'); layer.id = 'fmj-choice-layer'; layer.setAttribute('role', 'status');
        var box = document.createElement('div'); box.className = 'choice-dialog';
        var note = document.createElement('p'); note.className = 'choice-context';
        note.textContent = '方向键选择，A 确认；' + options.join(' / ');
        if (options.some(function (label) { return label.indexOf('万能钥匙') >= 0; })) {
            note.textContent += '。当前钥匙 ' + core.characters.Player.Companion.sGoodsList.getGoodsNum_vux9f0$(14,2) + ' 把';
        }
        box.appendChild(note); layer.appendChild(box); document.body.appendChild(layer);
        global.dispatchEvent(new CustomEvent('fmj-choice-open', {detail:{id:request.id,script:request.script,at:request.at,options:options.slice()}}));
    }

    /**
     * 测试/桥接入口也通过原游戏按键操作选择，拒绝过期结果。
     * @param {number} id 当前提示编号。
     * @param {number} index 原菜单选项索引。
     * @return {Object} 选择结果。
     */
    function answer(id, index) {
        var request = pending, scene = core.game.mainScene;
        if (!request || request.id !== id || !Number.isInteger(index) || !scene) return {ok:false,reason:'stale'};
        if (index < (request.menu ? -1 : 0) || index >= request.options.length) return {ok:false,reason:'invalid'};
        if (scene.scriptProcess.curOp_0 !== request.operation && core.game.getCurScreen() !== request.menu) return {ok:false,reason:'stale'};
        var input = request.menu || request.operation;
        if (index < 0) input.onKeyUp_za3lpa$(core.Global.KEY_CANCEL);
        else {
            if (request.menu) {
                // 菜单长度上限控制循环，避免损坏索引导致输入死循环。
                for (var i = 0; request.menu.curSel_0 !== index && i < request.options.length; i++) input.onKeyDown_za3lpa$(core.Global.KEY_DOWN);
            } else if (request.operation.curChoice_0 !== index) input.onKeyDown_za3lpa$(core.Global.KEY_DOWN);
            input.onKeyDown_za3lpa$(core.Global.KEY_ENTER); input.onKeyUp_za3lpa$(core.Global.KEY_ENTER);
        }
        return {ok:true,id:id,index:index};
    }

    [13,31,64].forEach(function (opcode) {
        var vm = core.game.vm, maker = vm.instructions_0[opcode]; if (!maker) return;
        vm.instructions_0[opcode] = function (code, start) {
            var command = maker(code, start), run = command.run_fhed9o$;
            command.run_fhed9o$ = function () {
                var operation = run.apply(this, arguments);
                if (opcode === 13 && operation && operation.closure$text) lastDialogue = decode(operation.closure$text);
                else if (operation && (operation.closure$choice1 || operation.closure$menu)) show(operation, opcode, start - 1);
                return operation;
            };
            return command;
        };
    });
    global.FmjChoice = {answer:answer,clear:remove,isOpen:function(){return !!pending;},inspect:function(){
        return pending ? {id:pending.id,options:pending.options.slice(),selected:pending.menu ? pending.menu.curSel_0 : pending.operation.curChoice_0,
            script:pending.script,at:pending.at,opcode:pending.opcode,context:pending.context} : null;
    }};
    global.bbkChooseFmjOption = function (id,index) { return JSON.stringify(answer(id,index)); };
    global.addEventListener('pagehide', remove);
})(window);
