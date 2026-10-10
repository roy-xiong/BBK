;(function (global) {
    'use strict';
    var data = global.FmjGuideData;
    if (!data || !global.FmjGuideEngine) return;
    var isJyqxz = data.gameId === 'jyqxz', gameTitle = data.title || '伏魔记';
    var scopeKey = 'bbk/' + (data.gameId || 'fmj') + '_story_scope';
    var engine = new global.FmjGuideEngine(data), standalone = document.body.dataset.fmjAtlas === 'standalone';
    var root = null, canvas = null, context = null, snapshot = null, goal = null, selected = null;
    var camera = { x: 0, y: 0, zoom: 0.3 }, cards = [], layer = 'world', query = '', grid = false, measureMode = false;
    var measure = null, drawPending = false, open = false, travelToken = 0, resizeObserver = null;
    var bitmapCache = new Map(), tileCache = new Map(), pointer = null, pointers = new Map(), links = [], navigating = false;
    var scriptNamesByMap = new Map(), tileResources = new Map(), regionCache = new Map();
    var originalTravelInput = null, sendingTravelInput = false;
    var travelStepDelay = 105;
    /** 一步的方向输入间隔，倍速只用于自动跑路。 */
    function runStepDelay() { return travelStepDelay / Math.max(1, Math.min(4, global.fmj && global.fmj.runSpeed || 1)); }
    var storySignature = '', layoutSignature = '', lastWidth = 0, lastHeight = 0;
    var worldComponent = data.world && data.world.main;
    data.tiles.forEach(function (t) { tileResources.set(t.id, t); });
    data.scripts.forEach(function (s) {
        s.maps.forEach(function (id) {
            var names = scriptNamesByMap.get(id) || [];
            names.push(s.name); scriptNamesByMap.set(id, names);
        });
    });
    var directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    var esc = function (text) { return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
    var core = function () { return global['fmj.core'] && global['fmj.core'].fmj; };
    var element = function (id) { return root.querySelector('[data-id="' + id + '"]'); };

    /**
     * 获取真实存档事件、剧情、碰撞物和位置；未开局时不伪造已完成记录。
     *
     * @return {Object|null} 当前运行状态。
     */
    function readState() {
        var c = core(), scene = c && c.game && c.game.mainScene;
        if (!scene || !scene.currentMap || !scene.player) return null;
        var save = c.scene.SaveLoadGame, process = scene.scriptProcess, npcs = [];
        for (var i = 1; i <= 40; i++) {
            var npc = scene.getNPC_za3lpa$(i);
            if (npc && !npc.isEmpty && npc.posInMap) npcs.push({ id: i, x: npc.posInMap.x, y: npc.posInMap.y, name: npc.name || '机关 ' + i, moving: npc.mDelay > 0 && npc.state && ['WALKING','PAUSE'].includes(npc.state.name) });
        }
        var scriptId = save.ScriptType + ':' + save.ScriptIndex;
        var active = c.game.getCurScreen() === scene;
        var script = engine.scripts.get(scriptId), command = script && process && script.commands[process.mCurExeOperateIndex_0];
        var goods = {}, bag = c.characters.Player.Companion.sGoodsList;
        for (var index = 2; index <= 7; index++) goods['14:' + index] = bag.getGoodsNum_vux9f0$(14, index);
        if (isJyqxz) data.goods.forEach(function (item) { var key = item.id.split(':').map(Number); goods[item.id] = bag.getGoodsNum_vux9f0$(key[0], key[1]); });
        var player = isJyqxz ? c.game.playerList.toArray()[0] : scene.getPlayer_za3lpa$(1), learnt = player && player.privateLearntMagics ? player.privateLearntMagics.toArray() : [];
        var questMode = 'complete';
        try { questMode = global.FmjPreferences ? global.FmjPreferences.get('storyScope') : global.localStorage.getItem(scopeKey) || questMode; } catch (_) { /* 不支持存储时仍提供完整流程。 */ }
        return {
            scriptId: scriptId, mapId: scene.currentMap.type + ':' + scene.currentMap.index,
            sceneName: scene.sceneName, x: scene.player.posInMap.x, y: scene.player.posInMap.y,
            flags: Array.from(c.script.ScriptResources.globalEvents), vars: Array.from(c.script.ScriptResources.variables), npcs: npcs,
            goods: goods, questMode: questMode, level: player ? player.level : 0, actor: player ? player.index : null,
            wormResolved: learnt.some(function (magic) { return magic.type === 1 && magic.index === 11; }) || bag.getGoodsNum_vux9f0$(2, 18) > 0,
            ghostResolved: learnt.some(function (magic) { return magic.type === 3 && magic.index === 8; }),
            escapeItem: c.characters.Player.Companion.sGoodsList.getGoodsNum_vux9f0$(13, 1) > 0,
            busy: !active || !!(process && (process.running || process.prev)) || c.combat.Combat.Companion.IsActive(),
            endingSeen: !!c.script.ScriptResources.globalEvents[isJyqxz ? 1009 : 2316]
        };
    }

    /**
     * 面板显示期间暂停游戏更新，避免阅读时发生敌情或自动推进对话。
     *
     * 此处保留原有更新与输入函数，仅在面板打开时阻止游戏输入；关闭即恢复。
     */
    function installPause() {
        var c = core();
        if (!c || !c.game || c.game.__fmjGuidePauseInstalled) return;
        var originalUpdate = c.game.update_s8cxhz$;
        c.game.update_s8cxhz$ = function (delta) { if (!open) return originalUpdate.call(this, delta); };
        var originalInput = global.bbkSendInput;
        if (originalInput) {
            originalTravelInput = originalInput;
            global.bbkSendInput = function (action) {
                if (open) return;
                if (navigating && !sendingTravelInput) travelToken++;
                return originalInput(action);
            };
        }
        var originalLoad = c.script.ScriptVM.prototype.loadGut_0;
        c.script.ScriptVM.prototype.loadGut_0 = function (gut, print) {
            var process = originalLoad.call(this, gut, print), script = engine.scripts.get((gut.type & 255) + ':' + (gut.index & 255));
            if (script) script.commands.forEach(function (command, index) {
                if (command.op !== 55) return;
                var cmd = process.commands_0.get_za3lpa$(index), original = cmd.run_fhed9o$;
                cmd.run_fhed9o$ = function (p) { return navigating ? null : original.call(this, p); };
            });
            return process;
        };
        c.game.__fmjGuidePauseInstalled = true;
    }

    function message(text) {
        if (root && open) element('message').textContent = text || '';
        else if (text && global.BbkSystemChannel) global.BbkSystemChannel.postMessage(JSON.stringify({ type: 'fmj_notice', data: { ok: false, message: text } }));
    }

    /**
     * 原始图块仅解码一次。横纵坐标始终使用相同的 16 像素格距。
     *
     * @param {number} id 图块资源编号。
     * @return {HTMLCanvasElement} 原游戏黑白图块。
     */
    function tileSheet(id) {
        if (tileCache.has(id)) return tileCache.get(id);
        var resource = tileResources.get(id);
        var sheet = document.createElement('canvas'); sheet.width = 16 * 16; sheet.height = Math.ceil(resource.count / 16) * 16;
        var ctx = sheet.getContext('2d'), img = ctx.createImageData(sheet.width, sheet.height);
        for (var tile = 0; tile < resource.count; tile++) {
            for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
                var byte = parseInt(resource.hex.substr((tile * 32 + y * 2 + (x >> 3)) * 2, 2), 16);
                var black = !!(byte & (128 >> (x & 7))), px = (tile % 16) * 16 + x, py = Math.floor(tile / 16) * 16 + y;
                var offset = (py * sheet.width + px) * 4, value = black ? 0 : 180;
                img.data[offset] = value; img.data[offset + 1] = value; img.data[offset + 2] = value; img.data[offset + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0); tileCache.set(id, sheet); return sheet;
    }

    /**
     * 低倍使用八分之一预览，高倍缓存最近的 8 张原图，限制 WebView 峰值内存。
     *
     * @param {Object} map 地图格子。
     * @param {boolean} detail 是否绘制完整原始图块。
     * @return {HTMLCanvasElement} 与游戏宽高比例一致的地图位图。
     */
    function mapBitmap(map, detail) {
        var key = map.id + (detail ? ':full' : ':small');
        if (bitmapCache.has(key)) { var existing = bitmapCache.get(key); bitmapCache.delete(key); bitmapCache.set(key, existing); return existing; }
        var result = document.createElement('canvas'), unit = detail ? 16 : 2;
        result.width = map.width * unit; result.height = map.height * unit;
        var ctx = result.getContext('2d'), tiles = tileSheet(map.tiles), resource = tileResources.get(map.tiles); ctx.imageSmoothingEnabled = false;
        map.cells.forEach(function (cell, i) {
            var tile = cell & 127;
            if (tile >= resource.count) tile = 0;
            ctx.drawImage(tiles, tile % 16 * 16, Math.floor(tile / 16) * 16, 16, 16, i % map.width * unit, Math.floor(i / map.width) * unit, unit, unit);
        });
        bitmapCache.set(key, result);
        var full = [...bitmapCache.keys()].filter(function (k) { return k.endsWith(':full'); });
        while (full.length > 8) { var oldest = full.shift(), old = bitmapCache.get(oldest); bitmapCache.delete(oldest); old.width = 0; old.height = 0; }
        return result;
    }

    /** 将所有场景按真实宽高放入统一比例图集，排版留白不计为游戏距离。 */
    function layoutCards() {
        var signature = layer + '/' + worldComponent + '/' + query + '/' + (layer === 'current' ? snapshot && snapshot.mapId : layer === 'region' ? snapshot && engine.key(snapshot) : '');
        if (cards.length && signature === layoutSignature) { scheduleDraw(); return; }
        layoutSignature = signature;
        links = [];
        if (layer === 'world' && data.world) {
            var component = data.world.components.find(function (c) { return c.id === worldComponent; }) || data.world.components[0];
            cards = component.nodes.filter(function (node) { return !query || (node.name + ' ' + node.mapId).includes(query); }).map(function (node) {
                var map = engine.maps.get(node.mapId);
                return { map: map, world: node, x: node.x * 16, y: node.y * 16, width: map.width * 16, height: map.height * 16 };
            });
            var byId = new Map(cards.map(function (card) { return [card.world.id, card]; }));
            links = component.links.filter(function (l) { return byId.has(l.from) && byId.has(l.to); }).map(function (l) {
                var from = byId.get(l.from), to = byId.get(l.to);
                var start = { x: from.x + (l.source.x + 0.5) * 16, y: from.y + (l.source.y + 0.5) * 16 };
                var end = { x: to.x + (l.landing.x + 0.5) * 16, y: to.y + (l.landing.y + 0.5) * 16 };
                return { from: from, to: to, start: start, end: end, portal: Math.hypot(start.x - end.x, start.y - end.y) > 48, direction: l.direction };
            });
            message(data.world.atlasLayout ? '所有场景使用原始图块和等比例格距；图集排版间距不代表游戏距离。实时区域拼接与寻路遵循原出口。' : '上北下南、左西右东。桥梁与道路按原出口方向展开；建筑、洞穴从真实入口打开独立层。');
            fit(); return;
        }
        if (layer === 'region') {
            var state = snapshot;
            if (!state) {
                var entrance = isJyqxz && data.incoming['2:1'][0];
                state = entrance ? Object.assign({}, entrance, { scriptId:'2:1', flags:Array(2401).fill(false), vars:Array(240).fill(0), npcs:[] }) : { scriptId: '2:1', mapId: '1:1', x: 5, y: 6, flags: Array(2401).fill(false), vars: Array(240).fill(0), npcs: [] };
                (isJyqxz ? [1] : [19,21,25,31]).forEach(function (f) { state.flags[f] = true; });
                state = engine.simulate(state, 0).state;
            }
            var regionKey = engine.key(state), region = regionCache.get(regionKey);
            if (!region) {
                region = engine.region(state); regionCache.set(regionKey, region);
                if (regionCache.size > 3) regionCache.delete(regionCache.keys().next().value);
            }
            cards = region.cards; links = region.links;
            message('按真实入口与落点拼接。蓝色虚线表示独立图层连接，其屏幕长度不代表步数。' + (standalone ? isJyqxz ? '当前展示京城初始剧情状态的开放道路。' : '当前展示三清山取剑后的开放道路。' : '当前展示本局已经开放的室外通路。'));
            fit(); return;
        }
        var sceneNodes = !isJyqxz && data.world && ['2','3'].includes(layer) ? data.world.interiors.filter(function (n) { return String(n.type) === layer && (!query || (n.name + ' ' + n.mapId).includes(query)); }) : null;
        var maps = sceneNodes ? sceneNodes.map(function (n) { return engine.maps.get(n.mapId); }) : data.maps.filter(function (m) {
            return (layer === 'all' || layer === 'current' && snapshot && m.id === snapshot.mapId || String(m.type) === layer) &&
                (!query || (m.name + ' ' + m.id + ' ' + (scriptNamesByMap.get(m.id) || []).join(' ')).includes(query));
        });
        cards = []; var x = 0, y = 40, rowHeight = 0, rowWidth = 250 * 16;
        maps.forEach(function (map, index) {
            var width = map.width * 16, height = map.height * 16;
            if (x && x + width > rowWidth) { x = 0; y += rowHeight + 110; rowHeight = 0; }
            cards.push({ map: map, world: sceneNodes && sceneNodes[index], x: x, y: y, width: width, height: height });
            x += width + 80; rowHeight = Math.max(rowHeight, height);
        });
        fit();
    }

    function size() { var r = canvas.getBoundingClientRect(); return { width: r.width, height: r.height }; }
    function fit(card) {
        if (!canvas || !cards.length) return;
        var minX = Math.min.apply(null, cards.map(function (c) { return c.x; })), minY = Math.min.apply(null, cards.map(function (c) { return c.y; }));
        var viewport = size(), bounds = card || { x: minX, y: minY, width: Math.max.apply(null, cards.map(function (c) { return c.x + c.width; })) - minX, height: Math.max.apply(null, cards.map(function (c) { return c.y + c.height; })) - minY + 25 };
        camera.zoom = Math.min(2, (viewport.width - 40) / (bounds.width + 20), (viewport.height - 60) / (bounds.height + 45));
        camera.x = (viewport.width - bounds.width * camera.zoom) / 2 - bounds.x * camera.zoom;
        camera.y = (viewport.height - bounds.height * camera.zoom) / 2 - bounds.y * camera.zoom;
        scheduleDraw();
    }
    function scheduleDraw() { if (drawPending || !open) return; drawPending = true; requestAnimationFrame(function () { drawPending = false; draw(); }); }
    function circle(x, y, color, radius) { context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fillStyle = color; context.fill(); }

    /** 只渲染可见卡片；地图、路线、人物与格子都共用同一相机矩阵。 */
    function draw() {
        if (!open || !canvas) return;
        var viewport = size(), dpr = Math.min(2, global.devicePixelRatio || 1);
        if (canvas.width !== Math.round(viewport.width * dpr) || canvas.height !== Math.round(viewport.height * dpr)) { canvas.width = Math.round(viewport.width * dpr); canvas.height = Math.round(viewport.height * dpr); }
        context.setTransform(dpr, 0, 0, dpr, 0, 0); context.fillStyle = '#090d13'; context.fillRect(0, 0, viewport.width, viewport.height);
        context.translate(camera.x, camera.y); context.scale(camera.zoom, camera.zoom); context.imageSmoothingEnabled = false;
        for (var card of cards) {
            var sx = card.x * camera.zoom + camera.x, sy = card.y * camera.zoom + camera.y;
            if (sx > viewport.width || sy > viewport.height || sx + card.width * camera.zoom < 0 || sy + card.height * camera.zoom < 0) continue;
            if (layer === 'world' && !data.world.atlasLayout) { context.save(); context.beginPath(); context.rect(card.x + 64, card.y + 48, card.width - 128, card.height - 80); context.clip(); }
            context.drawImage(mapBitmap(card.map, camera.zoom > 0.45), card.x, card.y, card.width, card.height);
            if (layer === 'world' && !data.world.atlasLayout) context.restore();
            context.font = Math.max(15, 11 / camera.zoom) + 'px sans-serif'; context.fillStyle = '#d1dff2';
            var label = card.world ? card.world.name : card.state ? card.state.sceneName : card.map.name;
            if (layer === 'world' && camera.zoom < 0.3) {
                if (!card.world.navFlags && /宫|村|城|镇|院|入口|北海|鹤鸣山|周处|村长|老宅/.test(label)) {
                    context.font = (12 / camera.zoom) + 'px sans-serif'; context.fillStyle = '#ffe6a4';
                    context.fillText(label, card.x + card.width / 2 - context.measureText(label).width / 2, card.y + 40);
                }
            } else {
            if (card.width * camera.zoom < 55 && !card.world) label = String(data.maps.findIndex(function (m) { return m.id === card.map.id; }) + 1).padStart(2, '0');
            else if (camera.zoom > 0.4) label += ' · ' + card.map.width + '×' + card.map.height + ' 步';
            while (context.measureText(label).width > card.width && label.length > 2) label = label.slice(0, -2) + '…';
            context.fillText(label, card.x, card.y - Math.max(8, 6 / camera.zoom));
            }
            if (grid && camera.zoom >= 0.45) {
                context.strokeStyle = '#62ba9960'; context.lineWidth = 0.5 / camera.zoom; context.beginPath();
                for (var x = 0; x <= card.map.width; x++) { context.moveTo(card.x + x * 16, card.y); context.lineTo(card.x + x * 16, card.y + card.height); }
                for (var y = 0; y <= card.map.height; y++) { context.moveTo(card.x, card.y + y * 16); context.lineTo(card.x + card.width, card.y + y * 16); }
                context.stroke();
            }
            if (camera.zoom >= 0.45) card.map.cells.forEach(function (cell, index) { if (cell >> 8) circle(card.x + (index % card.map.width + 0.5) * 16, card.y + (Math.floor(index / card.map.width) + 0.5) * 16, '#d59534b0', 3); });
            var matchesCurrent = snapshot && snapshot.mapId === card.map.id && (card.world ? card.world.scriptIds.includes(snapshot.scriptId) && (!card.world.navFlags || card.world.navFlags === snapshot.flags.slice(100,114).map(Number).join('')) : !card.state || card.state.scriptId === snapshot.scriptId && card.state.flags.slice(100, 114).map(Number).join('') === snapshot.flags.slice(100, 114).map(Number).join(''));
            if (card.world && !matchesCurrent && camera.zoom >= 0.6) card.world.npcs.forEach(function (npc) { circle(card.x + (npc.x + 0.5) * 16, card.y + (npc.y + 0.5) * 16, '#56a7e8', 4); });
            if (matchesCurrent) {
                snapshot.npcs.forEach(function (npc) { circle(card.x + (npc.x + 0.5) * 16, card.y + (npc.y + 0.5) * 16, '#56a7e8', 4); });
                circle(card.x + (snapshot.x + 0.5) * 16, card.y + (snapshot.y + 0.5) * 16, '#ff6868', 6);
            }
            if (measure && measure.mapId === card.map.id) {
                context.strokeStyle = '#ff6e73'; context.lineWidth = 3 / camera.zoom; context.beginPath();
                (measure.path || [measure.start]).forEach(function (p, i) { var x = card.x + (p.x + 0.5) * 16, y = card.y + (p.y + 0.5) * 16; if (i) context.lineTo(x, y); else context.moveTo(x, y); }); context.stroke();
                circle(card.x + (measure.start.x + 0.5) * 16, card.y + (measure.start.y + 0.5) * 16, '#70e6c9', 5);
                if (measure.end) circle(card.x + (measure.end.x + 0.5) * 16, card.y + (measure.end.y + 0.5) * 16, '#ff6e73', 5);
            }
        }
        context.strokeStyle = '#71b7ec'; context.lineWidth = 1.2 / camera.zoom;
        links.filter(function (l) { return l.portal; }).forEach(function (link) { context.setLineDash([6 / camera.zoom, 5 / camera.zoom]); context.beginPath(); context.moveTo(link.start.x, link.start.y); context.lineTo(link.end.x, link.end.y); context.stroke(); });
        context.setLineDash([]);
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        var steps = camera.zoom < 0.2 ? 40 : camera.zoom < 0.6 ? 10 : 5, length = steps * 16 * camera.zoom;
        context.strokeStyle = '#8bdcc8'; context.lineWidth = 2; context.beginPath(); context.moveTo(viewport.width - length - 20, viewport.height - 22); context.lineTo(viewport.width - 20, viewport.height - 22); context.stroke();
        context.font = '12px sans-serif'; context.fillStyle = '#c0dfd6'; context.fillText(steps + ' 步', viewport.width - length - 20, viewport.height - 32);
        if (layer === 'world') {
            context.fillStyle = '#101d2eee'; context.fillRect(viewport.width - 78, 10, 68, 62);
            context.fillStyle = '#8bdcc8'; context.textAlign = 'center'; context.fillText('北 ↑', viewport.width - 44, 27); context.fillText('西  ·  东', viewport.width - 44, 45); context.fillText('南', viewport.width - 44, 63); context.textAlign = 'left';
        }
        element('status').textContent = '1 格 = 1 步 · ' + Math.round(camera.zoom * 100) + '% · ' + cards.length + (layer === 'world' ? ' 个真实世界场景' : layer === 'region' ? ' 个道路场景' : ' 个场景');
    }

    function pointAt(clientX, clientY) {
        var rect = canvas.getBoundingClientRect(), x = (clientX - rect.left - camera.x) / camera.zoom, y = (clientY - rect.top - camera.y) / camera.zoom;
        var card = cards.slice().reverse().find(function (c) { return x >= c.x + (layer === 'world' ? 64 : 0) && y >= c.y + (layer === 'world' ? 48 : 0) && x < c.x + c.width - (layer === 'world' ? 64 : 0) && y < c.y + c.height - (layer === 'world' ? 32 : 0); });
        return card ? { card: card, x: Math.floor((x - card.x) / 16), y: Math.floor((y - card.y) / 16) } : null;
    }

    /** @return {Array<Object>|null} 使用原始格子与玩家边界计算最短四方向路径。 */
    function measuredPath(map, start, end) {
        var state = { mapId: map.id, x: start.x, y: start.y, npcs: [], flags: [], vars: [] };
        var flood = engine.flood(state), index = end.y * map.width + end.x;
        if (!flood || flood.distance[index] < 0) return null;
        var path = [];
        while (index >= 0) { path.push({ x: index % map.width, y: Math.floor(index / map.width) }); index = flood.previous[index]; }
        return path.reverse();
    }

    /** 显示原图上的人物、出口与其真实剧情场景选择。 */
    function selectPoint(point) {
        selected = point;
        if (measureMode) {
            if (!measure || measure.end || measure.mapId !== point.card.map.id) measure = { mapId: point.card.map.id, start: { x: point.x, y: point.y } };
            else {
                measure.end = { x: point.x, y: point.y }; measure.path = measuredPath(point.card.map, measure.start, measure.end);
                message(measure.path ? '这条地图内路径共 ' + (measure.path.length - 1) + ' 步；横纵格距相同。' : '这两个点之间没有不经过机关或出口的普通步行路径。');
            }
        }
        var map = point.card.map, cell = map.cells[point.y * map.width + point.x], scripts = data.scripts.filter(function (s) { return point.card.world ? point.card.world.scriptIds.includes(s.id) : s.maps.includes(map.id); });
        var npc = snapshot && snapshot.mapId === map.id && snapshot.npcs.find(function (n) { return n.x === point.x && n.y === point.y; });
        element('selected').innerHTML = '<p><b>' + esc(npc ? npc.name : point.card.world ? point.card.world.name : map.name) + '</b> · (' + point.x + ', ' + point.y + ')</p><p class="subtle">' + esc(npc ? '人物 / 机关' : cell >> 8 ? '场景出口或剧情入口' : cell & 128 ? '原始可行走格' : '障碍物') + ' · ' + esc(map.width + '×' + map.height) + ' 格</p>';
        var select = element('destination');
        select.innerHTML = scripts.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name + ' [' + s.id + ']') + '</option>'; }).join('');
        if (point.card.state) select.value = point.card.state.scriptId;
        else if (snapshot && scripts.some(function (s) { return s.id === snapshot.scriptId; })) select.value = snapshot.scriptId;
        select.hidden = !scripts.length || standalone;
        element('travel-point').hidden = standalone; element('travel-point').disabled = !snapshot || snapshot.busy || !scripts.length;
        var eventId = npc ? npc.id : (cell >> 8) ? (cell >> 8) + 40 : 0;
        element('ports').innerHTML = eventId ? describePortals(select.value, eventId).map(function (p) { return '<button data-portal="' + p.scriptId + '" data-map="' + esc(p.mapId || '') + '">入口 → ' + esc(engine.scripts.get(p.scriptId)?.name || p.scriptId) + '</button>'; }).join('') : '';
        scheduleDraw();
    }

    /**
     * 展开指定原游戏事件的条件分支，仅列出它真正切换到的场景。
     *
     * 不使用相邻 loadmap 推测连线；需要剧情/战斗的出口仍保留在入口说明中。
     * @return {Array<Object>} 真实章节切换目标。
     */
    function describePortals(scriptId, eventId) {
        var script = engine.scripts.get(scriptId);
        if (!script) return [];
        var start = script.byAddress.get(script.events[eventId - 1]);
        if (start == null) return [];
        var queue = [{ pc: start, mapId: null }], seen = new Set(), results = [];
        for (var count = 0; queue.length && count < 500; count++) {
            var node = queue.pop(), key = node.pc + '/' + node.mapId;
            if (seen.has(key)) continue; seen.add(key);
            var cmd = script.commands[node.pc]; if (!cmd || [9, 20, 68].includes(cmd.op)) continue;
            if (cmd.op === 1) node.mapId = cmd.a[0] + ':' + cmd.a[1];
            if ([14, 66].includes(cmd.op)) { results.push({ scriptId: cmd.a[0] + ':' + cmd.a[1], mapId: node.mapId }); continue; }
            if (cmd.op === 10) { queue.push({ pc: script.byAddress.get(cmd.a[0]), mapId: node.mapId }); continue; }
            if ([11, 21, 31].includes(cmd.op)) queue.push({ pc: script.byAddress.get(cmd.a[cmd.op === 11 ? 1 : cmd.op === 21 ? 2 : 0]), mapId: node.mapId });
            // 对战结果是同一事件的后续，按真实胜负地址继续，避免把无关脚本当出口。
            if (cmd.op === 39) { cmd.a.slice(13).forEach(function (at) { queue.push({ pc: script.byAddress.get(at), mapId: node.mapId }); }); continue; }
            queue.push({ pc: node.pc + 1, mapId: node.mapId });
        }
        return results.filter(function (r, i) { return results.findIndex(function (p) { return p.scriptId === r.scriptId && p.mapId === r.mapId; }) === i; });
    }

    /** 通过页面原输入入口发键，让原引擎处理碰撞、事件、朝向和镜头。 */
    function sendTravelInput(action) {
        if (!originalTravelInput) throw new Error('游戏输入尚未就绪');
        sendingTravelInput = true;
        try { originalTravelInput(action); }
        finally { sendingTravelInput = false; }
    }

    function actionForDirection(direction) { return ['up', 'right', 'down', 'left'][direction]; }

    function directionBetween(fromX, fromY, toX, toY) {
        if (toX === fromX && toY === fromY - 1) return 0;
        if (toX === fromX + 1 && toY === fromY) return 1;
        if (toX === fromX && toY === fromY + 1) return 2;
        if (toX === fromX - 1 && toY === fromY) return 3;
        return -1;
    }

    /**
     * 按原引擎的方向键逐格走到目标；BFS 只提供路线，不负责修改玩家坐标。
     *
     * 使用控制区长按的 105 毫秒重复间隔。每一步都重新读实时剧情和碰撞状态，
     * 碰到随机战斗或剧情时立即停下并把控制交还给玩家。
     * @return {Promise<Object>} 到达结果或原剧情中断原因。
     */
    async function walkTo(initial, targetX, targetY, token, reroutes) {
        reroutes = reroutes || 0;
        var flood = engine.flood(initial), width = flood && flood.map.width;
        if (!flood) throw new Error('当前地图不可寻路');
        var start = initial.y * width + initial.x, target = targetY * width + targetX;
        if (target < 0 || target >= flood.distance.length || flood.distance[target] < 0) {
            if (reroutes < 6) {
                await new Promise(function (resolve) { setTimeout(resolve, runStepDelay()); });
                if (token !== travelToken || open) throw new Error('已停止前往');
                var refreshed = readState();
                if (refreshed && !refreshed.busy && refreshed.scriptId === initial.scriptId && refreshed.mapId === initial.mapId) return walkTo(refreshed, targetX, targetY, token, reroutes + 1);
            }
            throw new Error('目标位置已被墙壁、人物或机关挡住，请先处理当前阻挡');
        }
        var reverse = [], at = target;
        while (at !== start) {
            if (at < 0 || reverse.length >= flood.distance.length) throw new Error('无法还原可行走路线');
            reverse.push({ x: at % width, y: Math.floor(at / width) });
            at = flood.previous[at];
        }
        reverse.reverse();
        var expected = { x: initial.x, y: initial.y };
        for (var point of reverse) {
            if (token !== travelToken || open) throw new Error('已停止前往');
            var before = readState();
            if (!before || before.busy || before.scriptId !== initial.scriptId || before.mapId !== initial.mapId) throw new Error('场景状态已变化，请重新前往');
            if (before.x !== expected.x || before.y !== expected.y) throw new Error('玩家位置已变化，请重新前往');
            // 游人等 NPC 会在计算路线之后移动。先按当前碰撞状态重算路线，
            // 避免连续撞向旧路径上的 NPC；不能移动、移除或穿过挡路角色。
            if (!engine.walkable(before, point.x, point.y, false)) {
                if (reroutes >= 6) {
                    var blocker = before.npcs.find(function (npc) { return npc.x === point.x && npc.y === point.y; });
                    throw new Error(blocker ? '「' + blocker.name + '」挡在路上，请先交互或等其离开' : '通路条件已变化，请先完成当前位置的互动');
                }
                return walkTo(before, targetX, targetY, token, reroutes + 1);
            }
            var direction = directionBetween(before.x, before.y, point.x, point.y);
            if (direction < 0) throw new Error('路线包含无效移动');
            sendTravelInput(actionForDirection(direction));
            await new Promise(function (resolve) { setTimeout(resolve, runStepDelay()); });
            if (token !== travelToken || open) throw new Error('已停止前往');
            var after = readState();
            if (!after) throw new Error('游戏场景已关闭');
            // 高倍速可能先于原 40ms 帧结束空地图事件。等待原事件完成，真实对白、
            // 选择与战斗仍立刻交还控制，不能把一个空事件误报为剧情中断。
            for (var settle = 0; after.busy && settle < 20; settle++) {
                var process = core().game.mainScene.scriptProcess, op = process && process.curOp_0;
                if (core().combat.Combat.Companion.IsActive() || core().game.getCurScreen() !== core().game.mainScene || op || process && process.prev) break;
                await new Promise(function (resolve) { setTimeout(resolve, 10); });
                if (token !== travelToken || open) throw new Error('已停止前往');
                after = readState(); if (!after) throw new Error('游戏场景已关闭');
            }
            if (core().combat.Combat.Companion.IsActive()) return { stopped: 'battle' };
            if (after.busy) return { stopped: 'story' };
            if (after.scriptId !== initial.scriptId || after.mapId !== initial.mapId) return { stopped: 'transition', state: after };
            if (after.x !== point.x || after.y !== point.y) {
                if (after.x === before.x && after.y === before.y && reroutes < 6) return walkTo(after, targetX, targetY, token, reroutes + 1);
                throw new Error('通路已改变，玩家无法继续前进');
            }
            expected = point;
        }
        return { state: readState() };
    }

    /** 到迷宫出口/NPC 楼梯时，使用原方向键或确认键触发真实游戏事件。 */
    function activateExit(exit) {
        var c = core(), scene = c.game.mainScene;
        if (exit.kind === 'item') {
            if (!readState().escapeItem) throw new Error('当前没有引路石，不能执行道具返回');
            scene.triggerEvent_za3lpa$(255);
            return;
        }
        if (exit.kind === 'object') {
            var direction = exit.direction;
            scene.player.walkStay_rtfsey$([c.characters.Direction.North, c.characters.Direction.East, c.characters.Direction.South, c.characters.Direction.West][direction]);
            sendTravelInput('confirm');
            return;
        }
        var movement = directionBetween(exit.anchorX, exit.anchorY, exit.x, exit.y);
        if (movement < 0) throw new Error('出口位置已改变');
        sendTravelInput(actionForDirection(movement));
    }

    /** 等待原出口脚本达到稳定场景，剧情/战斗边界保持玩家可操作。 */
    async function waitForExit(token, step) {
        for (var wait = 0; wait < 50; wait++) {
            await new Promise(function (resolve) { setTimeout(resolve, 40); });
            if (token !== travelToken || open) throw new Error('已停止前往');
            var current = readState(), process = core().game.mainScene.scriptProcess;
            if (!current) continue;
            if (core().combat.Combat.Companion.IsActive()) return { stopped: 'battle' };
            var command = engine.scripts.get(current.scriptId)?.commands[process.mCurExeOperateIndex_0];
            if (command && [13, 31, 39, 47, 61, 64, 69].includes(command.op) && process.curOp_0) return { stopped: 'story' };
            if (!current.busy) {
                // 原事件也可能只改变同场景的道路条件，按规划结果核对实际目的地。
                if (step.toScriptId && current.scriptId !== step.toScriptId || step.toMapId && current.mapId !== step.toMapId) throw new Error('原出口事件结果已变化，请重新前往');
                return { state: current };
            }
        }
        throw new Error('已到途中场景，请先完成该处剧情');
    }

    /**
     * 按原游戏速度沿真实道路行走，遇到剧情/战斗立即停止。
     *
     * 原引擎负责跨图后的 NPC 初始化、分支变量、队伍和存档，不直接改写剧情标记。
     * @param {Object} destination 用户选择的场景或交互点。
     * @return {Promise<Object>} 自动行走结果。
     */
    async function travel(destination) {
        if (navigating) { message('正在前往，请稍候；方向键可中断。'); return { ok: false, reason: 'in_progress' }; }
        installPause();
        var startedInPanel = open;
        var initial = readState();
        if (!initial || initial.busy) { message('请先完成当前对话、战斗或关闭游戏菜单。'); return { ok: false }; }
        var plan = destination.exitTask ? engine.exitPlan(initial) : destination.currentTask ? engine.taskPlan(initial) : engine.route(initial, destination);
        if (!plan || plan.unavailable) {
            message(plan && plan.reason === 'outside' ? '当前位置已经在室外。' : destination.exitTask ? '当前出口仍有条件限制；若此迷宫使用引路石返回，请先确认持有引路石。' : '尚无可通行路线到「' + (plan && plan.goal ? plan.goal.label : destination.label || '目标地点') + '」，请先处理当前道路或剧情条件。'); return { ok: false, reason: 'locked' };
        }
        var token = ++travelToken; close(false); navigating = true;
        try {
            var routeChanges = 0;
            navigation: while (routeChanges <= 6) {
                // 小路上的行人会暂时封住整张图的出口。持续读取真实碰撞并等待其自然
                // 移开，不能把普通路人当成任务人物让玩家反复交互，也不能穿过去。
                for (var waiting = 0; plan.mobileBlocker && waiting < 300; waiting++) {
                    if (waiting % 10 === 0) {
                        var yielding = readState(), blocker = yielding && yielding.npcs.find(function (npc) { return npc.id === plan.blockedAt; });
                        if (blocker && Math.abs(yielding.x - blocker.x) + Math.abs(yielding.y - blocker.y) === 1) {
                            var spaces = directions.map(function (dir, index) { return { x: yielding.x + dir[0], y: yielding.y + dir[1], direction: index }; }).filter(function (point) { return engine.walkable(yielding, point.x, point.y, false); });
                            spaces.sort(function (a, b) { return Math.abs(b.x - blocker.x) + Math.abs(b.y - blocker.y) - Math.abs(a.x - blocker.x) - Math.abs(a.y - blocker.y); });
                            if (spaces.length) sendTravelInput(actionForDirection(spaces[0].direction));
                        }
                    }
                    await new Promise(function (resolve) { setTimeout(resolve, 200); });
                    if (token !== travelToken || open) throw new Error('已停止前往');
                    var current = readState();
                    if (!current || current.busy) return { ok: true, stopped: 'story' };
                    var updated = destination.exitTask ? engine.exitPlan(current) : destination.currentTask ? engine.taskPlan(current) : engine.route(current, destination);
                    if (!updated.unavailable) plan = updated;
                }
                if (plan.mobileBlocker) throw new Error('行人暂时挡住唯一道路，等待让路后可继续前往');
                for (var stepIndex = 0; stepIndex < plan.steps.length; stepIndex++) {
                    var step = plan.steps[stepIndex];
                    if (token !== travelToken) throw new Error('已停止前往');
                    var state = readState();
                    if (!state || state.busy || state.scriptId !== step.scriptId || state.mapId !== step.mapId) throw new Error('场景状态已变化，请重新前往');
                    var liveExits = engine.navigationExits(state, engine.flood(state));
                    var liveExit = liveExits.find(function (exit) { return exit.event === step.exit.event && exit.kind === step.exit.kind; });
                    if (liveExit) step.exit = liveExit;
                    var walked;
                    try { walked = await walkTo(state, step.exit.anchorX, step.exit.anchorY, token); }
                    catch (error) {
                        var actual = readState();
                        if (routeChanges >= 6 || token !== travelToken || !actual || actual.busy) throw error;
                        // 有人停在唯一门口时，真实游戏可经其他建筑返回重建该场景。
                        // 重算整条合法路线，不能一直撞旧门口，也不能直接挪开行人。
                        var revised = destination.exitTask ? engine.exitPlan(actual) : destination.currentTask ? engine.taskPlan(actual) : engine.route(actual, destination);
                        if (!revised || revised.unavailable) throw error;
                        plan = revised; stepIndex = -1; routeChanges++; continue;
                    }
                    if (walked.stopped) return { ok: true, stopped: walked.stopped };
                    activateExit(step.exit);
                    var exitResult = await waitForExit(token, step);
                    if (exitResult.stopped) return { ok: true, stopped: exitResult.stopped };
                }
                var finalState = readState();
                if (finalState.scriptId !== plan.state.scriptId || finalState.mapId !== plan.state.mapId) throw new Error('目的地已发生变化');
                // 城镇中的目标人物会移动，跨图预测的接近点可能已经被本人占据。
                // 每次按真实位置重新找相邻道路，不能把 NPC 移开或继续面对旧坐标。
                var arrival, target = plan.goal || destination;
                for (var attempt = 0; attempt < 8; attempt++) {
                    if (!plan.boundary && !plan.blockedAt && target.event && finalState.scriptId === target.scriptId) {
                        var local = engine.route(finalState, target);
                        if (!local.unavailable) {
                            if (local.steps.length && routeChanges < 6) { plan = local; routeChanges++; continue navigation; }
                            if (local.mobileBlocker && routeChanges < 6) { plan = local; routeChanges++; continue navigation; }
                            plan.arrival = local.arrival; plan.blockedAt = local.blockedAt;
                        }
                    }
                    try { arrival = await walkTo(finalState, plan.arrival.x, plan.arrival.y, token); }
                    catch (error) {
                        if (!target.event || target.event > 40 || plan.boundary || attempt === 7 || token !== travelToken) throw error;
                        finalState = readState();
                        if (!finalState || finalState.busy || finalState.scriptId !== target.scriptId) throw error;
                        continue;
                    }
                    if (arrival.stopped || !target.event || target.event > 40 || plan.boundary || plan.blockedAt) break;
                    finalState = readState();
                    var nearby = engine.approaches(finalState, engine.flood(finalState), target.event);
                    var reached = nearby.find(function (point) { return point.x === finalState.x && point.y === finalState.y; });
                    if (reached) { plan.arrival = reached; break; }
                    if (attempt === 7) throw new Error('目标人物正在走动，请再点一次前往');
                }
                if (arrival.stopped) return { ok: true, stopped: arrival.stopped };
                if (plan.boundary) {
                    activateExit(plan.exit);
                    return { ok: true, stopped: 'story' };
                }
                if (plan.arrival.direction != null) {
                    core().game.mainScene.player.walkStay_rtfsey$([
                        core().characters.Direction.North, core().characters.Direction.East,
                        core().characters.Direction.South, core().characters.Direction.West
                    ][plan.arrival.direction]);
                }
                // 四象阵的四根阵柱是原 NPC 事件。站到柱前后直接执行一次
                // 正常确认，仍由原脚本处理精魄消耗、对白和后续分支。
                if (!isJyqxz && destination.currentTask && destination.scriptId === '2:32' && [1, 3, 5, 7].includes(destination.event)) {
                    core().game.mainScene.triggerSceneObjEvent_0();
                    return { ok: true, stopped: 'story' };
                }
                var arrived = plan.preparation ? '出口尚未开放，已到「' + plan.preparation + '」附近，完成互动后继续前往' : plan.blockedAt ? '已到阻路人物或机关旁，完成这里的互动后可继续前往' : destination.exitTask ? '已沿原出口到达迷宫或建筑外' : destination.event > 40 ? '已到出口或机关入口旁，向前走一步触发' : destination.event ? '已到目标旁，按确认键交互' : '已到达目的地';
                if (global.BbkSystemChannel) global.BbkSystemChannel.postMessage(JSON.stringify({ type: 'fmj_notice', data: { ok: true, message: arrived } }));
                else core().game.showMessage_61zpoe$(arrived);
                return { ok: true };
            }
        } catch (error) { if (startedInPanel) show(); message(error.message || '前往中断，请完成当前位置的剧情后重试'); return { ok: false }; }
        finally { navigating = false; }
    }

    /**
     * 游戏控制区与地图面板共享的前往当前目标入口。
     *
     * 每次重新读取真实存档；提示性任务（如装备护甲）留在游戏页给出说明，
     * 不创建地图 DOM，不假装传送已经完成装备或机关动作。
     * @return {Promise<Object>} 原引擎路线结果。
     */
    async function goToNextGoal() {
        var current = readState();
        if (!current) { message('请先开始或载入游戏。'); return { ok: false }; }
        if (current.busy) { message('请先完成当前对话、战斗或关闭游戏菜单。'); return { ok: false }; }
        var next = engine.nextGoal(current);
        if (!next.event && next.scriptId === current.scriptId && !(isJyqxz && next.flag)) { message(next.hint); return { ok: false, reason: 'interaction' }; }
        return travel(Object.assign({}, next, { allowBoundary: true, currentTask: true }));
    }
    /** @return {Promise<Object>} 沿合法出口返回室外，不跳过未完成的道具或剧情条件。 */
    function goToExit() { return travel({ exitTask: true }); }

    function renderStory() {
        snapshot = readState(); var aside = element('story');
        var signature = snapshot ? snapshot.scriptId + '/' + snapshot.sceneName + '/' + snapshot.busy + '/' + snapshot.endingSeen + '/' + snapshot.questMode + '/' + snapshot.level + '/' + (isJyqxz ? JSON.stringify(engine.nextGoal(snapshot)) : '') + '/' + JSON.stringify(snapshot.goods) + '/' + snapshot.flags.map(Number).join('') : 'standalone';
        if (signature === storySignature) return;
        storySignature = signature;
        if (isJyqxz) { renderJyqxzStory(aside); return; }
        if (!snapshot) {
            aside.innerHTML = '<h2>游戏世界地图</h2><p>按原出口方向展开全部城镇、山道、桥梁和道路实例。相同底图在不同地点重复使用时，分别标出实际位置。</p><p class="subtle">上北下南、左西右东；所有地图 1 格 = 1 步，横纵比例相同。可拖动、缩放、搜索地点和测量地图内的真实路径。</p><p class="subtle">点击建筑或洞口的原入口，打开其房屋、洞穴层。跨层转场和特殊闭环不虚构直线距离。</p><h2>地点</h2><div class="place-list">' + data.world.components.flatMap(function(c){return c.nodes.filter(function(n){return !n.navFlags && /宫|村|城|镇|院|北海|鹤鸣|南山|周处/.test(n.name);}).map(function(n){return '<button data-place="'+esc(n.id)+'" data-component="'+c.id+'">'+esc(n.name)+'</button>';});}).join('') + '</div>'; return;
        }
        goal = engine.nextGoal(snapshot);
        var progress = engine.progress(snapshot); progress.push({ title: '重新封魔', detail: '混元金斗正位与多年后的尾声', done: !!snapshot.endingSeen });
        aside.innerHTML = '<div class="goal-card"><p class="subtle">当前目标 · ' + esc(snapshot.sceneName) + '</p><h2>' + esc(goal.label) + '</h2><p>' + esc(goal.hint) + '</p><button class="primary" data-action="next"' + (snapshot.busy ? ' disabled' : '') + '>一键前往当前目标</button><p class="subtle">遇到剧情或战斗时交还控制。</p></div><div class="lamp-list">' + Array.from({ length: 8 }, function (_, i) { return '<span class="' + (snapshot.flags[11 + i] ? 'done' : '') + '">灯 ' + (i + 1) + (snapshot.flags[11 + i] ? ' ✓' : '') + '</span>'; }).join('') + '</div><h2>故事进度 · ' + progress.filter(function (p) { return p.done; }).length + ' / ' + progress.length + '</h2><p class="subtle">随当前游戏与读档同步；有些标记代表事件已开启。</p>' + progress.map(function (p) { return '<div class="stage ' + (p.done ? 'done' : '') + '"><span class="tick">' + (p.done ? '✓' : '○') + '</span><div><h3>' + esc(p.title) + '</h3><p class="subtle">' + esc(p.detail) + '</p></div></div>'; }).join('') + '<details><summary>已触发的沿途故事</summary>' + [[207,'蔡婆婆的寻女委托'],[214,'救出小画家'],[222,'蔡婆婆答谢'],[201,'老孟托送情书'],[264,'给阿军送信'],[211,'放走老王'],[213,'处置老王'],[212,'老王家密道线索']].filter(function (p) { return snapshot.flags[p[0]]; }).map(function (p) { return '<p>✓ ' + esc(p[1]) + '</p>'; }).join('') + '</details>';
        var scope = document.createElement('select'); scope.dataset.id = 'story-scope'; scope.setAttribute('aria-label', '流程范围');
        scope.innerHTML = '<option value="complete">完整流程：主线 + 支线</option><option value="main">仅主线</option>'; scope.value = snapshot.questMode;
        scope.addEventListener('change', function () { try { if (global.FmjPreferences) global.FmjPreferences.set('storyScope', this.value); else global.localStorage.setItem('bbk/fmj_story_scope', this.value); } catch (_) {} storySignature = ''; renderStory(); });
        aside.prepend(scope);
        if (engine.questTasks) {
            var quests = engine.questTasks(snapshot), section = document.createElement('section'); section.className = 'quest-list';
            section.innerHTML = '<h2>支线与分支 · ' + quests.filter(function (row) { return row.status === 'done' || row.status === 'skipped'; }).length + ' / ' + quests.length + '</h2><p class="subtle">钥匙剩余 ' + snapshot.goods['14:2'] + ' 把。原版共 3 把、5 处锁箱，取消开箱会暂缓该节点，可在此重新选择。</p>' + quests.map(function (row) {
                return '<div class="stage ' + (row.status === 'done' ? 'done' : '') + '"><span class="tick">' + (row.status === 'done' ? '✓' : '○') + '</span><div><h3>' + esc(row.label) + '</h3><p class="subtle">' + esc(row.statusLabel) + ' · ' + esc(row.detail) + '</p>' + (['ready','deferred'].includes(row.status) ? '<button data-quest="' + esc(row.id) + '"' + (snapshot.busy ? ' disabled' : '') + '>前往此支线</button>' : '') + '</div></div>';
            }).join(''); aside.appendChild(section);
        }
    }

    /**
     * 金庸剧情使用本 ROM 的主线与门派任务，选择目标仅保存导航意图。
     * 不写原旗标；临时缺物品、等级或道路条件时由原对话交还控制。
     * @param {HTMLElement} aside 地图侧栏。
     */
    function renderJyqxzStory(aside) {
        if (!snapshot) { aside.innerHTML='<h2>金庸群侠传 · 地图与剧情</h2><p>32 张原图、170 个场景脚本。图集排版不表示地图间的地理距离；可缩放、搜索和测距。</p>'; return; }
        goal=engine.nextGoal(snapshot);
        var rows=engine.progress(snapshot),quests=engine.questTasks(snapshot);
        aside.innerHTML='<div class="goal-card"><p class="subtle">'+esc(snapshot.sceneName)+' · '+snapshot.level+' 级</p><h2>'+esc(goal.label)+'</h2><p>'+esc(goal.hint)+'</p><button class="primary" data-action="next"'+(snapshot.busy?' disabled':'')+'>一键前往当前目标</button><p class="subtle">自动逐格行走，遇到剧情或战斗立即停止。</p></div>';
        var scope=document.createElement('select');scope.setAttribute('aria-label','流程范围');scope.dataset.id='story-scope';
        scope.innerHTML='<option value="complete">完整流程：主线 + 支线</option><option value="main">仅主线</option>';scope.value=snapshot.questMode;
        scope.addEventListener('change',function(){try{if(global.FmjPreferences)global.FmjPreferences.set('storyScope',this.value);else global.localStorage.setItem(scopeKey,this.value);global.localStorage.removeItem('bbk/jyqxz_goal');}catch(_){}storySignature='';renderStory();});aside.prepend(scope);
        function section(title,tasks){
            var node=document.createElement('section');node.innerHTML='<h2>'+esc(title)+'</h2>'+tasks.map(function(t){return '<div class="stage '+(t.done||t.status==='done'?'done':'')+'"><div><h3>'+esc(t.label||t.title)+'</h3><p class="subtle">'+esc(t.detail||t.hint||'原剧情由你正常操作')+'</p>'+(!t.done&&t.status!=='done'?'<button data-jy-goal="'+esc(t.id||'main-'+t.flag)+'"'+(snapshot.busy?' disabled':'')+'>设为目标并前往</button>':'<span>✓ 已完成</span>')+'</div></div>';}).join('');aside.appendChild(node);
        }
        section('主线 · '+rows.filter(function(r){return r.done;}).length+' / '+rows.length,global.JyqxzQuests.main.map(function(t){return Object.assign({},t,{done:!!snapshot.flags[t.flag]});}));
        section('门派与支线',quests);
        var schoolNode=document.createElement('details');schoolNode.innerHTML='<summary>门派入门导航</summary>'+global.JyqxzQuests.schools.filter(function(s){return s[3]===snapshot.actor;}).map(function(s){return '<button data-jy-school="'+s[0]+'">'+esc(s[1])+'</button>';}).join('');aside.appendChild(schoolNode);
    }

    function build() {
        root = document.createElement('section'); root.id = 'fmj-guide'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', '伏魔记剧情帮助与完整地图');
        root.innerHTML = '<header><h1>' + (standalone ? '伏魔记 · 完整等比例地图' : '伏魔记 · 剧情帮助与地图') + '</h1><button class="mobile-story" data-action="story">剧情 / 说明</button><button data-action="refresh">刷新</button>' + (standalone ? '' : '<button data-action="close">返回游戏</button>') + '</header><div class="guide-message" data-id="message"></div><div class="guide-layout"><aside data-id="story"></aside><div class="map-area"><div class="map-tools"><select data-id="layer" aria-label="地图分层"><option value="all">全部 83 张原图</option><option value="1">室外区域</option><option value="2">房屋内部</option><option value="3">洞穴迷宫</option>' + (standalone ? '' : '<option value="current">当前地图</option>') + '</select><input data-id="search" placeholder="搜索地点" aria-label="搜索地点"><button data-action="fit">全图</button><button data-action="current">定位</button><button data-action="zoom-in">＋</button><button data-action="zoom-out">－</button><button data-action="grid">格子</button><button data-action="measure">路线测距</button></div><div class="canvas-wrap"><canvas aria-label="游戏原始等比例地图"></canvas><div class="map-status" data-id="status"></div></div><div class="selection"><div class="description"><div data-id="selected"><p>点选地图查看坐标、人物和真实出入口</p><p class="subtle"><span class="legend-dot"></span>出口 / 剧情 <span class="legend-dot npc"></span>人物 <span class="legend-dot player"></span>玩家</p></div><div class="port-buttons" data-id="ports"></div></div><select data-id="destination" hidden aria-label="实际剧情目的地"></select><button class="primary" data-id="travel-point" hidden>前往此处</button></div></div></div>';
        document.body.appendChild(root); canvas = root.querySelector('canvas'); context = canvas.getContext('2d');
        root.querySelector('h1').textContent = standalone ? '伏魔记 · 游戏世界地图' : '伏魔记 · 剧情与世界地图';
        if (isJyqxz) {
            root.setAttribute('aria-label','金庸群侠传剧情帮助与地图');root.querySelector('h1').textContent=gameTitle+' · 剧情与世界地图';
            element('layer').innerHTML='<option value="all">全部 '+data.maps.length+' 张原图</option>'+[1,2,3,4,5,6,8,9].map(function(type){return '<option value="'+type+'">'+({1:'店铺与民居',2:'城市野外',3:'门派',4:'门派山道',5:'秘境与山洞',6:'总坛',8:'掌门与师叔阁',9:'四大城镇'})[type]+'</option>';}).join('')+(standalone?'':'<option value="current">当前地图</option>');
        }
        var worldOption = document.createElement('option'); worldOption.value = 'world'; worldOption.textContent = '游戏世界地图'; element('layer').prepend(worldOption);
        var regions = document.createElement('select'); regions.dataset.id = 'world-region'; regions.setAttribute('aria-label', '世界地图区域');
        regions.innerHTML = data.world.components.map(function(c){return '<option value="'+c.id+'">'+esc(c.id===data.world.main?'世界全图':c.nodes.filter(function(n){return !n.navFlags;}).map(function(n){return n.name;}).join(' / ')||'独立外景')+'</option>';}).join('');
        regions.value = worldComponent; element('layer').after(regions);
        regions.addEventListener('change',function(){worldComponent=this.value;layer='world';element('layer').value=layer;layoutCards();});
        root.addEventListener('click', function (event) {
            var button = event.target.closest('button'); if (!button) return;
            var action = button.dataset.action;
            if(isJyqxz&&(button.dataset.jyGoal||button.dataset.jySchool)){
                var current=readState(),chosen;
                if(current){chosen=engine.questTasks(current).concat(global.JyqxzQuests.main.map(function(t){return Object.assign({id:'main-'+t.flag,hint:'按原入口触发剧情，遇对白或战斗停下。'},t);})).find(function(t){return t.id===button.dataset.jyGoal;});
                    if(button.dataset.jySchool){var school=global.JyqxzQuests.schools.find(function(s){return String(s[0])===button.dataset.jySchool;});if(school)chosen={label:'拜访'+school[1]+'掌门',scriptId:school[2],event:1,hint:'原版入门要求和互斥门派由原对话检查。'};}
                }
                if(chosen){if(chosen.deferFlag)core().script.ScriptResources.globalEvents[chosen.deferFlag]=false;try{global.localStorage.setItem('bbk/jyqxz_goal',JSON.stringify(chosen));}catch(_){}travel(Object.assign({},chosen,{allowBoundary:true}));}return;
            }
            if (button.dataset.quest && engine.questTasks) {
                var current = readState(), quest = current && engine.questTasks(current).find(function (row) { return row.id === button.dataset.quest; });
                if (quest) { if (quest.deferFlag) core().script.ScriptResources.globalEvents[quest.deferFlag] = false; if (quest.id === 'daughter-rescue') core().script.ScriptResources.globalEvents[2335] = false; travel(Object.assign({}, quest, { allowBoundary: true })); } return;
            }
            if (button.dataset.place) { layer='world';worldComponent=button.dataset.component;regions.value=worldComponent;query='';element('search').value='';element('layer').value=layer;layoutCards();var place=cards.find(function(c){return c.world.id===button.dataset.place;});if(place)fit(place);return; }
            if (button.dataset.portal) {
                var nodes=data.world.components.flatMap(function(c){return c.nodes;}).concat(data.world.interiors);
                var destination=nodes.find(function(n){return n.mapId===button.dataset.map&&n.scriptIds.includes(button.dataset.portal);});
                var map=engine.maps.get(button.dataset.map);
                if(map){layer=engine.isOutdoor(map)?'world':String(map.type);if(destination&&engine.isOutdoor(map)){worldComponent=destination.component;regions.value=worldComponent;}element('layer').value=layer;query='';element('search').value='';layoutCards();var card=cards.find(function(c){return destination&&layer==='world'?c.world&&c.world.id===destination.id:c.map.id===map.id;});if(card)fit(card);message('原入口连接到 '+(destination?destination.name:engine.scripts.get(button.dataset.portal)?.name||'目标场景')+'。');}return;
            }
            if (action === 'close') close(true);
            if (action === 'story') element('story').classList.toggle('expanded');
            if (action === 'refresh') { renderStory(); scheduleDraw(); }
            if (action === 'next') goToNextGoal();
            if (action === 'exit') goToExit();
            if (action === 'fit') fit();
            if (action === 'current') { var card = cards.find(function (c) { return snapshot && c.map.id === snapshot.mapId && (!c.world || c.world.scriptIds.includes(snapshot.scriptId)&&(!c.world.navFlags||c.world.navFlags===snapshot.flags.slice(100,114).map(Number).join(''))); }); if (!card && snapshot) { layer = 'current'; element('layer').value = layer; query = ''; element('search').value = ''; layoutCards(); card = cards[0]; } if (card) fit(card); else message('点选一个世界地点即可放大。'); }
            if (action === 'zoom-in' || action === 'zoom-out') zoom(action === 'zoom-in' ? 1.4 : 1 / 1.4, size().width / 2, size().height / 2);
            if (action === 'grid') { grid = !grid; button.classList.toggle('active', grid); scheduleDraw(); }
            if (action === 'measure') { measureMode = !measureMode; measure = null; canvas.classList.toggle('measuring', measureMode); button.classList.toggle('active', measureMode); message(measureMode ? '在同一张地图中依次选择起点、终点，查看真实步数与路径。' : ''); scheduleDraw(); }
        });
        element('travel-point').addEventListener('click', function () {
            if (!selected) return;
            var map = selected.card.map, npc = (snapshot && snapshot.mapId === map.id ? snapshot.npcs : selected.card.world ? selected.card.world.npcs : []).find(function (n) { return n.x === selected.x && n.y === selected.y; });
            var cell = map.cells[selected.y * map.width + selected.x], event = npc ? npc.id : cell >> 8 ? (cell >> 8) + 40 : 0;
            travel({ scriptId: element('destination').value, navFlags: selected.card.world ? selected.card.world.navFlags : selected.card.state && selected.card.state.flags.slice(100, 114).map(Number).join(''), x: selected.x, y: selected.y, event: event, allowBoundary: true });
        });
        element('layer').addEventListener('change', function () { layer = this.value; selected = null; layoutCards(); });
        element('search').addEventListener('input', function () { query = this.value.trim(); selected = null; layoutCards(); });
        canvas.addEventListener('wheel', function (event) { event.preventDefault(); var rect = canvas.getBoundingClientRect(); zoom(Math.exp(-event.deltaY * 0.001), event.clientX - rect.left, event.clientY - rect.top); }, { passive: false });
        canvas.addEventListener('pointerdown', function (event) { canvas.setPointerCapture(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); pointer = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, dragged: false }; });
        canvas.addEventListener('pointermove', function (event) {
            if (!pointers.has(event.pointerId)) return;
            var old = pointers.get(event.pointerId);
            if (pointers.size === 2) { var other = [...pointers].find(function (p) { return p[0] !== event.pointerId; })[1]; var before = Math.hypot(old.x - other.x, old.y - other.y), after = Math.hypot(event.clientX - other.x, event.clientY - other.y), rect = canvas.getBoundingClientRect(); if (before > 4) zoom(after / before, (event.clientX + other.x) / 2 - rect.left, (event.clientY + other.y) / 2 - rect.top); pointer.dragged = true; }
            else { camera.x += event.clientX - old.x; camera.y += event.clientY - old.y; if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 5) pointer.dragged = true; scheduleDraw(); }
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        });
        canvas.addEventListener('pointerup', function (event) { pointers.delete(event.pointerId); if (pointer && !pointer.dragged) { var point = pointAt(event.clientX, event.clientY); if (point) { selectPoint(point); if (camera.zoom < 0.4) fit(point.card); } } if (!pointers.size) pointer = null; });
        canvas.addEventListener('pointercancel', function (event) { pointers.delete(event.pointerId); pointer = null; });
        root.addEventListener('keydown', function (event) { event.stopPropagation(); if (event.key === 'Escape' && !standalone) close(true); });
        root.addEventListener('keyup', function (event) { event.stopPropagation(); });
        if (!standalone) element('story').classList.add('expanded');
        element('layer').value = layer;
        var option = document.createElement('option'); option.value = 'region'; option.textContent = '室外道路拼接'; element('layer').appendChild(option);
        if (!standalone) {
            var exitButton = document.createElement('button'); exitButton.dataset.action = 'exit'; exitButton.textContent = '前往出口';
            root.querySelector('.map-tools').appendChild(exitButton);
        }
        resizeObserver = new ResizeObserver(function () {
            var viewport = size();
            if (viewport.width > 0 && viewport.height > 0 && (viewport.width !== lastWidth || viewport.height !== lastHeight)) {
                lastWidth = viewport.width; lastHeight = viewport.height; fit();
            }
        }); resizeObserver.observe(canvas);
    }
    function zoom(factor, x, y) { var old = camera.zoom, next = Math.max(0.015, Math.min(8, old * factor)); camera.x = x - (x - camera.x) * next / old; camera.y = y - (y - camera.y) * next / old; camera.zoom = next; scheduleDraw(); }
    function notifyVisibility(visible) {
        if (global.BbkSystemChannel) global.BbkSystemChannel.postMessage(JSON.stringify({ type: 'fmj_guide_visibility', data: { visible: visible } }));
    }
    function show() { if (navigating) travelToken++; if (global.sysSetGameLoopPaused) global.sysSetGameLoopPaused(true); if (!root) build(); installPause(); open = true; root.hidden = false; renderStory(); layoutCards(); notifyVisibility(true); return JSON.stringify({ ok: true }); }
    function close(cancelTravel) { open = false; if (cancelTravel) travelToken++; if (root) root.hidden = true; if (global.sysSetGameLoopPaused) global.sysSetGameLoopPaused(false); notifyVisibility(false); }
    global.FmjGuide = { open: show, close: function () { close(true); }, state: readState, travel: travel, next: goToNextGoal, engine: engine, describePortals: describePortals, measuredPath: measuredPath, inspect: function () { return { cards: cards.length, layer:layer, worldComponent:worldComponent, worldNodes:cards.filter(function(c){return c.world;}).map(function(c){return {id:c.world.id,name:c.world.name,mapId:c.map.id,x:c.x,y:c.y,scriptId:c.world.scriptId,navFlags:c.world.navFlags};}), camera: Object.assign({}, camera), selected: selected && { map: selected.card.map.id, x: selected.x, y: selected.y }, open: open }; } };
    global.bbkOpenFmjGuide = show;
    global.bbkGoToFmjNextGoal = goToNextGoal;
    global.bbkGoToFmjExit = goToExit;
    global.addEventListener('pagehide', function () { close(true); if (global.sysSetGameLoopPaused) global.sysSetGameLoopPaused(true); if (resizeObserver) resizeObserver.disconnect(); bitmapCache.clear(); tileCache.clear(); regionCache.clear(); });
    if (standalone) show();
})(window);
