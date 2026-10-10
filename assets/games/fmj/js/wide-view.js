;(function (global) {
    'use strict';
    var module = global['fmj.core'], core = module && module.fmj;
    if (!core || !core.game) return;
    var game = core.game, originalCanvas = game.canvas_0;
    var nativeCanvas = module.graphics.Canvas_init_vux9f0$(320, 192);
    var projected = Object.create(module.graphics.Canvas.prototype);
    projected.bg_0 = nativeCanvas.bg_0;
    var enabled = true, camera = null, terrain = null, terrainKey = '', empty = new module.graphics.Color(28, 41, 40, 255);
    var tileCache = new Map();
    try { enabled = global.localStorage.getItem('bbk/fmj_wide_view') !== 'false'; } catch (_) {}

    /**
     * 有边界和透明通道保护的像素绘制。
     *
     * 扩大后的视野可能包含屏幕边缘 NPC，原 Bitmap 对负坐标没有完整裁剪；这里逐行
     * 裁剪到真实 320×192 缓冲区，避免边缘精灵写到上一行或数组外。
     * @param {Object} bitmap 原游戏位图。
     * @param {number} left 目标逻辑像素横坐标。
     * @param {number} top 目标逻辑像素纵坐标。
     * @param {number} scale 素材比例；地形、人物和字形保持 1，旧背景图可延展为 2。
     */
    function blit(bitmap, left, top, scale) {
        if (!bitmap || !bitmap.buffer) return;
        left = Math.round(left); top = Math.round(top);
        var width = bitmap.width * scale, height = bitmap.height * scale;
        var x0 = Math.max(0, left), y0 = Math.max(0, top), x1 = Math.min(320, left + width), y1 = Math.min(192, top + height);
        var target = nativeCanvas.buffer, source = bitmap.buffer;
        for (var y = y0; y < y1; y++) {
            var sourceY = Math.floor((y - top) / scale) * bitmap.width;
            for (var x = x0; x < x1; x++) {
                var color = source[sourceY + Math.floor((x - left) / scale)];
                if (color && color.a > 0) target[y * 320 + x] = color;
            }
        }
    }

    /** 旧绘图入口由 wide-ui 接管布局；此处保留背景和几何图形的坐标转换。 */
    projected.drawBitmap_t8cslu$ = function (bitmap, left, top) { blit(bitmap, left * 2, top * 2, 2); };
    projected.drawBitmap_2map2q$ = projected.drawBitmap_t8cslu$;
    projected.drawColor_we4i00$ = function (color) { nativeCanvas.buffer.fill(color); };
    function line(x0, y0, x1, y1, paint) {
        x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
        var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, error = dx + dy;
        for (var budget = 0; budget < 10000; budget++) {
            for (var yy = 0; yy < 2; yy++) for (var xx = 0; xx < 2; xx++) {
                var x = x0 * 2 + xx, y = y0 * 2 + yy;
                if (x >= 0 && x < 320 && y >= 0 && y < 192) nativeCanvas.buffer[y * 320 + x] = paint.color;
            }
            if (x0 === x1 && y0 === y1) break;
            var doubled = error * 2;
            if (doubled >= dy) { error += dy; x0 += sx; }
            if (doubled <= dx) { error += dx; y0 += sy; }
        }
    }
    projected.drawLine_x3aj6j$ = line;
    projected.drawLine_gwdwo5$ = line;
    projected.drawR_0 = function (x, y, width, height, paint, color) {
        if (paint.style.name === 'STROKE') {
            line(x, y, x + width, y, paint); line(x + width, y, x + width, y + height, paint);
            line(x + width, y + height, x, y + height, paint); line(x, y + height, x, y, paint);
        } else {
            var left = Math.max(0, Math.floor(x * 2)), top = Math.max(0, Math.floor(y * 2));
            var right = Math.min(320, Math.ceil((x + width) * 2)), bottom = Math.min(192, Math.ceil((y + height) * 2));
            for (var row = top; row < bottom; row++) nativeCanvas.buffer.fill(color, row * 320 + left, row * 320 + right);
        }
    };
    projected.drawRect_x3aj6j$ = function (x, y, right, bottom, paint) { this.drawR_0(x, y, right - x, bottom - y, paint, paint.color); };
    projected.drawRect_ed5hcw$ = function (rect, paint) { this.drawRect_x3aj6j$(rect.left, rect.top, rect.right, rect.bottom, paint); };
    projected.drawRect_mw38p4$ = projected.drawRect_ed5hcw$;
    projected.drawLines_ffeagz$ = function (dots, paint) { for (var i = 0; i + 3 < dots.length; i += 4) line(dots[i], dots[i + 1], dots[i + 2], dots[i + 3], paint); };

    /**
     * 绘制独立远景，原脚本镜头、人物地图坐标、碰撞与存档完全由原引擎持有。
     *
     * 320×192 画布以 20×12 格绘满，不再预留两侧纯色条。对话背景也使用此镜头。
     * 小地图外侧仅延展原地图边缘地形，不创建额外可行走格，不改原地图或碰撞边界。
     * 只缓存当前地形，NPC 动画独立绘制，避免保存全场景大位图造成内存增长。
     */
    function drawScene(scene) {
        var map = scene.currentMap;
        if (!map) { nativeCanvas.buffer.fill(empty); return; }
        var left = Math.max(0, Math.min(Math.max(0, map.mapWidth - 20), scene.mMapScreenPos_0.x - 5));
        var top = Math.max(0, Math.min(Math.max(0, map.mapHeight - 12), scene.mMapScreenPos_0.y - 3));
        var key = map.type + ':' + map.index + '/' + left + '/' + top;
        if (key !== terrainKey) {
            nativeCanvas.buffer.fill(empty);
            var resource = tileCache.get(map.mTilIndex_0);
            if (!resource) {
                resource = core.lib.DatLib.Companion.getRes_2et8c9$(core.lib.DatLib.ResType.TIL, 1, map.mTilIndex_0);
                tileCache.set(map.mTilIndex_0, resource);
            }
            for (var y = 0; y < 12; y++) for (var x = 0; x < 20; x++) {
                var mapX = Math.min(map.mapWidth - 1, left + x), mapY = Math.min(map.mapHeight - 1, top + y);
                var tile = map.mData_0[(mapY * map.mapWidth + mapX) * 2] & 127;
                var bitmap = resource.mBitmaps_0[tile] || resource.mBitmaps_0[0];
                blit(bitmap, x * 16, y * 16, 1);
            }
            terrain = nativeCanvas.buffer.slice(); terrainKey = key;
        } else {
            for (var i = 0; i < terrain.length; i++) nativeCanvas.buffer[i] = terrain[i];
        }
        camera = { left: left, top: top, columns: 20, rows: 12 };
        var characters = [];
        for (var id = 1; id <= 40; id++) { var npc = scene.getNPC_za3lpa$(id); if (npc && !npc.isEmpty) characters.push(npc); }
        if (scene.player) characters.push(scene.player);
        characters.sort(function (a, b) { return a.posInMap.y - b.posInMap.y; });
        characters.forEach(function (actor) {
            var sprite = actor.mWalkingSprite_l2rv79$_0;
            if (!sprite || !sprite.resImage_0) return;
            var image = sprite.resImage_0, frame = sprite.offset_0 + [0, 1, 2, 1][sprite.step] - 1;
            var x = (actor.posInMap.x - left) * 16, y = (actor.posInMap.y - top) * 16 + 16 - image.height;
            blit(image.mBitmaps_0[frame] || image.mBitmaps_0[0], x, y, 1);
        });
    }
    var originalScene = core.scene.ScreenMainGame.prototype.drawScene_9in0vv$;
    core.scene.ScreenMainGame.prototype.drawScene_9in0vv$ = function (canvas) {
        if (enabled && canvas === projected) drawScene(this);
        else originalScene.call(this, canvas);
    };
    function apply(value, persist) {
        enabled = !!value; game.canvas_0 = enabled ? projected : originalCanvas;
        if (persist) try { global.localStorage.setItem('bbk/fmj_wide_view', String(enabled)); } catch (_) {}
        return JSON.stringify({ ok: true, enabled: enabled, width: game.canvas_0.width, height: game.canvas_0.height });
    }
    apply(enabled, false);
    global.FmjWideView = {
        setEnabled: function (value) { return apply(value, true); },
        state: function () { return { enabled: enabled, width: game.canvas_0.width, height: game.canvas_0.height, camera: camera }; },
        /** 与 UI 适配共享同一缓冲区，避免创建第二张显示画布或复制整帧。 */
        drawing: { projected: projected, native: nativeCanvas, blit: blit }
    };
    global.bbkToggleWideView = function () { return apply(!enabled, true); };
    global.bbkGetWideViewState = function () { return JSON.stringify(global.FmjWideView.state()); };
})(window);
