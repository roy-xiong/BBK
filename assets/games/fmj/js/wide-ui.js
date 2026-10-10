;(function (global) {
    'use strict';
    var module = global['fmj.core'], core = module && module.fmj, wide = global.FmjWideView;
    if (!core || !wide) return;
    var projected = wide.drawing.projected, canvas = wide.drawing.native, blit = wide.drawing.blit;
    var textRender = core.graphics.TextRender, util = core.graphics.Util, Rect = module.graphics.Rect;
    var backgrounds = new WeakSet(), descriptions = new WeakMap(), combatBackgrounds = new WeakMap(), combatScreens = new WeakSet();
    var worldOffset = 0, animationDrawing = false;
    var battleGround = core.lib.DatLib.Companion.getRes_2et8c9$(core.lib.DatLib.ResType.PIC, 4, 2, true);
    var battleGroundBitmap = battleGround && battleGround.mBitmaps_0[0];
    var fillPaint = new module.graphics.Paint(), strokePaint = new module.graphics.Paint();
    fillPaint.style = module.graphics.Paint.Style.FILL;
    strokePaint.style = module.graphics.Paint.Style.STROKE;
    strokePaint.color = core.Global.COLOR_BLACK;

    /**
     * 远视野 UI 使用真实 320×192 坐标、16 像素字形和原尺寸人物。
     *
     * 仅替换绘制和列表可见窗口，继续使用原来的选项索引、回调和剧情/战斗输入。
     * 不能统一把旧画面放大，否则每页对白和战斗视野仍然只有 160×96 的容量。
     * @param {Object} target 当前绘制画布。
     * @return {boolean} 是否正在绘制远视野。
     */
    function isWide(target) { return target === projected && wide.state().enabled; }
    canvas.drawBitmap_t8cslu$ = function (bitmap, x, y) { blit(bitmap, x, y, 1); };
    canvas.drawBitmap_2map2q$ = canvas.drawBitmap_t8cslu$;
    projected.drawBitmap_t8cslu$ = function (bitmap, x, y) {
        if (!bitmap) return;
        if (animationDrawing || backgrounds.has(bitmap) || (bitmap.width === 160 && bitmap.height === 96)) blit(bitmap, x * 2, y * 2, 2);
        else blit(bitmap, x * 2 + bitmap.width / 2, y * 2 + bitmap.height / 2 + worldOffset, 1);
    };
    projected.drawBitmap_2map2q$ = projected.drawBitmap_t8cslu$;

    /** 字形位图是原引擎复用的可变对象，每次立即绘制，禁止按对象缓存像素。 */
    ['drawText_pbrmiz$', 'drawText_tz7kd0$', 'drawText_sfexxe$'].forEach(function (name) {
        var original = textRender[name];
        textRender[name] = function (target, text, a, b) {
            if (!isWide(target)) return original.apply(this, arguments);
            if (name === 'drawText_pbrmiz$') return original.call(this, canvas, text, a * 2, b * 2 + worldOffset);
            if (name === 'drawText_tz7kd0$') return original.call(this, canvas, text, a, new Rect(b.left * 2, b.top * 2, b.right * 2, b.bottom * 2));
            return original.call(this, canvas, text, new Rect(a.left * 2, a.top * 2, a.right * 2, a.bottom * 2), b * 2);
        };
    });
    var originalFrame = util.getFrameBitmap_vux9f0$;
    util.getFrameBitmap_vux9f0$ = function (w, h) {
        var bitmap = originalFrame.call(this, w, h);
        backgrounds.add(bitmap);
        return bitmap;
    };
    util.bmpInformationBg_0.forEach(function (bitmap) { backgrounds.add(bitmap); });
    backgrounds.add(util.bmpSideFrame_0);
    var originalNumber = util.drawSmallNum_tj1hu5$;
    util.drawSmallNum_tj1hu5$ = function (target, number, x, y) {
        return isWide(target) ? originalNumber.call(this, canvas, number, x * 2, y * 2) : originalNumber.apply(this, arguments);
    };

    function frame(left, top, right, bottom, selected) {
        fillPaint.color = selected ? core.Global.COLOR_BLACK : core.Global.COLOR_WHITE;
        canvas.drawRect_x3aj6j$(left, top, right, bottom, fillPaint);
        canvas.drawRect_x3aj6j$(left, top, right, bottom, strokePaint);
    }
    function text(value, x, y, selected) {
        if (typeof value === 'string') textRender[selected ? 'drawSelText_kkuqvh$' : 'drawText_kkuqvh$'](canvas, value, x, y);
        else if (value) textRender[selected ? 'drawSelText_pbrmiz$' : 'drawText_pbrmiz$'](canvas, value, x, y);
    }
    function image(resource, index, x, y) {
        if (resource) resource.draw_tj1hu5$(canvas, index, x, y);
    }
    function list(items, selected, left, top, right, rowHeight) {
        frame(left, top, right, top + items.length * rowHeight + 8);
        items.forEach(function (item, i) {
            var y = top + 5 + i * rowHeight;
            if (i === selected) frame(left + 3, y - 2, right - 3, y + rowHeight - 3, true);
            text(item, left + 8, y, i === selected);
        });
    }
    function patchDraw(type, draw) {
        if (!type) return;
        var original = type.prototype.draw_9in0vv$;
        type.prototype.draw_9in0vv$ = function (target) {
            if (isWide(target)) draw.call(this);
            else original.call(this, target);
        };
    }
    function visibleFirst(selected, first, rows, length) {
        return Math.max(0, Math.min(Math.max(0, length - rows), selected < first ? selected : selected >= first + rows ? selected - rows + 1 : first));
    }

    /** 对话分页仍写入原操作的 next 索引，按键推进与剧情跳转都由原脚本持有。 */
    function drawDialogue(op) {
        if (!core.combat.Combat.Companion.IsActive()) core.game.mainScene.drawScene_9in0vv$(projected);
        var r = op.closure$headImg ? op.closure$rWithPic : op.closure$rWithoutPic;
        var left = Math.round(r.left * 2), top = Math.round(r.top * 2);
        var right = Math.min(320, Math.round(r.right * 2)), bottom = Math.min(192, Math.round(r.bottom * 2));
        frame(left, top, right, bottom);
        canvas.drawRect_x3aj6j$(left + 2, top + 2, right - 2, bottom - 2, strokePaint);
        var topText = op.closure$headImg ? op.closure$rWithTextT : op.closure$rWithoutTextT;
        var bottomText = op.closure$headImg ? op.closure$rWithTextB : op.closure$rWithoutTextB;
        var next = 0;
        if (op.closure$headImg) {
            op.closure$headImg.draw_tj1hu5$(canvas, 1, 26, 92);
            canvas.drawLine_x3aj6j$(76, 100, 88, 112, strokePaint);
            canvas.drawLine_gwdwo5$(87, 112, right, 112, strokePaint);
        }
        var first = new Rect(topText.left * 2, topText.top * 2, topText.right * 2, topText.bottom * 2);
        var second = new Rect(bottomText.left * 2, bottomText.top * 2, bottomText.right * 2, bottomText.bottom * 2);
        next = textRender.drawText_tz7kd0$(canvas, op.closure$text, op.closure$iOfText.v, first);
        op.closure$iOfNext.v = textRender.drawText_tz7kd0$(canvas, op.closure$text, next, second);
    }
    var originalLoad = core.script.ScriptVM.prototype.loadGut_0;
    core.script.ScriptVM.prototype.loadGut_0 = function () {
        var process = originalLoad.apply(this, arguments);
        process.commands_0.toArray().forEach(function (command) {
            var run = command.run_fhed9o$;
            command.run_fhed9o$ = function () {
                var op = run.apply(this, arguments);
                if (!op || !op.draw_9in0vv$) return op;
                var original = op.draw_9in0vv$;
                op.draw_9in0vv$ = function (target) {
                    if (isWide(target) && this.closure$iOfText && this.closure$iOfNext && this.closure$text) drawDialogue(this);
                    else if (isWide(target) && this.closure$choice1 && this.closure$choice2) {
                        core.game.mainScene.drawScene_9in0vv$(projected);
                        list([this.closure$choice1.v, this.closure$choice2.v], this.curChoice_0, 48, 56, 272, 28);
                    } else original.call(this, target);
                };
                return op;
            };
        });
        return process;
    };

    patchDraw(core.gamemenu.ScreenGameMainMenu, function () {
        frame(12, 8, 160, 38);
        text('金钱:' + core.characters.Player.Companion.sMoney, 20, 15);
        list(this.menuItemsS_0, this.mSelIndex_0, 12, 44, 160, 30);
    });
    patchDraw(core.gamemenu.ScreenMenuSystem, function () { list(this.str_0, this.index_0, 80, 24, 248, 34); });
    [core.gamemenu.ScreenMenuGoods, core.gamemenu.ScreenMenuProperties].forEach(function (type) {
        patchDraw(type, function () { list(this.strs_0, this.mSelId_0, 80, 56, 240, 28); });
    });
    patchDraw(core.gamemenu.ScreenCommonMenu, function () {
        var items = this.paddedItems_0.toArray(), rows = Math.min(8, items.length);
        var first = visibleFirst(this.curSel_0, 0, rows, items.length);
        list(items.slice(first, first + rows), this.curSel_0 - first, 40, Math.max(8, (192 - rows * 20 - 8) / 2), 280, 20);
    });
    patchDraw(core.views.ScreenMenu, function () {
        canvas.drawColor_we4i00$(core.Global.COLOR_WHITE);
        text('伏魔记', 136, 24);
        list(['新的故事', '继续故事'], this.mCurSelect_0, 64, 64, 256, 40);
    });
    patchDraw(core.views.ScreenAnimation, function () {
        canvas.drawColor_we4i00$(core.Global.COLOR_WHITE);
        animationDrawing = true;
        try { this.mResSrs_0.draw_2g4tob$(projected, 0, 0); }
        finally { animationDrawing = false; }
    });
    patchDraw(core.views.ScreenMessageBox, function () {
        frame(40, 32, 280, 160);
        textRender.drawText_8xt01w$(canvas, this.mMsg_0, 0, new Rect(52, 44, 268, 104));
        frame(64, 120, 136, 148); frame(184, 120, 256, 148);
        text('是', 92, 126, this.index_0 === 0); text('否', 212, 126, this.index_0 === 1);
    });
    patchDraw(core.views.ScreenSaveLoadGame, function () {
        canvas.drawColor_we4i00$(core.Global.COLOR_WHITE);
        text(this.mOperate_0 === core.views.ScreenSaveLoadGame.Operate.SAVE ? '存储进度' : '读入进度', 128, 8);
        for (var i = 0; i < 3; i++) {
            var top = 36 + i * 50;
            var selected = i === this.index_0;
            frame(8, top, 312, top + 44, selected);
            text(String(i + 1), 16, top + 14, selected);
            var heads = this.mHeadImgs_0.get_za3lpa$(i);
            for (var j = 0; j < heads.size; j++) image(heads.get_za3lpa$(j), 7, 32 + j * 24, top + 8);
            text(this.mText_0[i].replace(/\0/g, ''), 116, top + 14, selected);
        }
    });
    patchDraw(core.gamemenu.ScreenActorState, function () {
        canvas.drawColor_we4i00$(core.Global.COLOR_WHITE);
        for (var i = 0; i < this.mPlayerList_0.size; i++) {
            var player = this.mPlayerList_0.get_za3lpa$(i);
            frame(8, 8 + i * 54, 72, 56 + i * 54);
            player.drawHead_2g4tob$(canvas, 12, 12 + i * 54);
            text(player.name, 12, 36 + i * 54, i === this.mCurPlayer_0);
        }
        var p = this.mPlayerList_0.get_za3lpa$(this.mCurPlayer_0);
        var masks = core.characters.FightingCharacter.Companion;
        var immunity = [[masks.BUFF_MASK_DU, '毒'], [masks.BUFF_MASK_LUAN, '乱'], [masks.BUFF_MASK_FENG, '封'], [masks.BUFF_MASK_MIAN, '眠']]
            .filter(function (entry) { return p.hasBuff_za3lpa$(entry[0]); }).map(function (entry) { return entry[1]; }).join('') || '无';
        ['等级 ' + p.level, '生命 ' + p.hp + '/' + p.maxHP, '真气 ' + p.mp + '/' + p.maxMP,
            '攻击力 ' + p.attack, '防御力 ' + p.defend, '经验 ' + p.currentExp + '/' + p.levelupChain.getNextLevelExp_za3lpa$(p.level),
            '身法 ' + p.speed, '灵力 ' + p.lingli, '幸运 ' + p.luck, '免疫 ' + immunity].forEach(function (value, i) { text(value, 84, 6 + i * 18); });
    });
    patchDraw(core.gamemenu.ScreenActorWearing, function () {
        canvas.drawColor_we4i00$(core.Global.COLOR_WHITE);
        var p = this.game.playerList.get_za3lpa$(this.mActorIndex_0);
        p.drawHead_2g4tob$(canvas, 8, 4); text(p.name, 44, 8); text('穿戴', 260, 8);
        for (var i = 0; i < 8; i++) {
            var x = 8 + (i >= 4 ? 156 : 0), y = 36 + i % 4 * 38;
            frame(x, y, x + 148, y + 34);
            var item = this.mEquipments_0[i];
            if (item) item.draw_2g4tob$(canvas, x + 4, y + 4);
            text(item ? item.name : this.mItemName_0[i], x + 34, y + 9, i === this.mCurItem_0);
        }
        if (this.showingDesc_0) {
            frame(16, 24, 304, 168);
            text(this.mTextName_0, 24, 32);
            this.mNextToDraw_0 = textRender.drawText_tz7kd0$(canvas, this.mTextDesc_0, this.mToDraw_0, new Rect(24, 60, 296, 160));
        }
    });
    patchDraw(core.gamemenu.ScreenGoodsList, function () {
        canvas.drawColor_we4i00$(core.Global.COLOR_WHITE);
        var size = this.goodsList_0.size;
        if (!size) { text('没有物品', 128, 88); return; }
        this.curItemIndex_0 = Math.max(0, Math.min(this.curItemIndex_0, size - 1));
        this.firstDisplayItemIndex_0 = visibleFirst(this.curItemIndex_0, this.firstDisplayItemIndex_0, 8, size);
        var goods = this.goodsList_0.get_za3lpa$(this.curItemIndex_0);
        frame(4, 4, 148, 188); frame(152, 4, 316, 80); frame(152, 84, 316, 188);
        for (var row = 0; row < 8 && row + this.firstDisplayItemIndex_0 < size; row++) {
            var item = this.goodsList_0.get_za3lpa$(row + this.firstDisplayItemIndex_0);
            item.draw_2g4tob$(canvas, 12, 10 + row * 22);
            text(item.name, 40, 10 + row * 22, row + this.firstDisplayItemIndex_0 === this.curItemIndex_0);
        }
        text(goods.name, 160, 12);
        text('价格:' + (this.mode_0 === core.gamemenu.ScreenGoodsList.Mode.Buy ? goods.buyPrice : goods.sellPrice), 160, 34);
        text(this.mode_0 === core.gamemenu.ScreenGoodsList.Mode.Buy ? '金钱:' + core.characters.Player.Companion.sMoney : '数量:' + goods.goodsNum, 160, 56);
        this.nextToDraw_0 = textRender.drawText_tz7kd0$(canvas, this.description_0, this.toDraw_0, new Rect(160, 92, 308, 180));
    });

    /** 法术列表可见八项，说明单独分页；不改变学会的法术、耗气或选中回调。 */
    patchDraw(core.magic.ScreenMagic, function () {
        canvas.drawColor_we4i00$(core.Global.COLOR_WHITE);
        var size = this.magics_0.length;
        if (!size) return;
        this.mFirstItemIndex_0 = visibleFirst(this.mCurItemIndex_0, this.mFirstItemIndex_0, 8, size);
        frame(4, 4, 148, 188); frame(152, 4, 316, 188);
        for (var row = 0; row < 8 && row + this.mFirstItemIndex_0 < size; row++) {
            text(this.magics_0[row + this.mFirstItemIndex_0].magicName, 12, 12 + row * 21, row + this.mFirstItemIndex_0 === this.mCurItemIndex_0);
        }
        var magic = this.magics_0[this.mCurItemIndex_0], page = descriptions.get(this);
        if (!page || page.source !== this.description_0) {
            page = { source: this.description_0, bytes: new Int8Array(global.sysGbkEncode(magic.magicDescription)), start: 0, next: 0, previous: [] };
            descriptions.set(this, page);
        }
        text(magic.magicName, 160, 12); text('耗真气:' + magic.costMp, 160, 36);
        page.next = textRender.drawText_tz7kd0$(canvas, page.bytes, page.start, new Rect(160, 64, 308, 180));
    });
    var originalMagicKey = core.magic.ScreenMagic.prototype.onKeyDown_za3lpa$;
    core.magic.ScreenMagic.prototype.onKeyDown_za3lpa$ = function (key) {
        var page = descriptions.get(this);
        if (wide.state().enabled && page && key === core.Global.KEY_PAGEDOWN) {
            if (page.next < page.bytes.length) { page.previous.push(page.start); page.start = page.next; }
        } else if (wide.state().enabled && page && key === core.Global.KEY_PAGEUP) {
            if (page.previous.length) page.start = page.previous.pop();
        } else originalMagicKey.call(this, key);
    };

    /** 战斗位置只在绘制时映射，攻击移动、目标选择、伤害和随机数仍用原坐标。 */
    patchDraw(core.characters.FightingSprite, function () {
        var resource = this.mImage_0;
        if (resource) {
            image(resource, this.currentFrame, this.combatX * 2 - resource.width / 2, this.combatY * 2 - resource.height / 2 + worldOffset);
        }
    });
    var originalFrameDraw = core.combat.anim.FrameAnimation.prototype.draw_2g4tob$;
    core.combat.anim.FrameAnimation.prototype.draw_2g4tob$ = function (target, x, y) {
        if (isWide(target) && this.mImage_0 && this.mImage_0.mBitmaps_0) {
            var bitmap = this.mImage_0.mBitmaps_0[this.mCurFrame_0 - 1] || this.mImage_0.mBitmaps_0[this.mCurFrame_0];
            if (bitmap) return blit(bitmap, x * 2 + bitmap.width / 2, y * 2 + bitmap.height / 2 - 16, 1);
        }
        return originalFrameDraw.apply(this, arguments);
    };
    /**
     * 以原战斗背景为中央锚点，用 30×16 原始菱形网格铺满扩展区域。
     * 相邻半格按 15×8 交错；中央原图覆盖在同相位网格上，边界不会拉直或错缝。
     * @param {Object} combat 原引擎战斗实例。
     */
    function drawCombatBackground(combat) {
        var cached = combatBackgrounds.get(combat), source = combat.mBackground_8be2vx$;
        if (!cached || cached.source !== source || cached.grid !== battleGroundBitmap) {
            var sourceWidth = source.width, sourceHeight = source.height;
            var left = Math.floor((320 - sourceWidth) / 2), top = Math.floor((192 - sourceHeight) / 2);
            var grid = battleGroundBitmap;
            if (!grid || grid.width < 30 || grid.height < 16) throw new Error('原始战斗菱形地面资源不可用');
            for (var y = 0; y < 192; y++) {
                var gridY = ((y - top) % 16 + 16) % 16;
                for (var x = 0; x < 320; x++) {
                    var gridX = ((x - left) % 30 + 30) % 30;
                    var color = grid.buffer[gridY * grid.width + gridX];
                    if (color && color.a > 0) canvas.buffer[y * 320 + x] = color;
                }
            }
            for (var y = 0; y < sourceHeight; y++) {
                for (var x = 0; x < sourceWidth; x++) {
                    var pixel = source.buffer[y * sourceWidth + x];
                    if (pixel && pixel.a > 0) canvas.buffer[(top + y) * 320 + left + x] = pixel;
                }
            }
            cached = { source: source, grid: grid, pixels: canvas.buffer.slice() }; combatBackgrounds.set(combat, cached);
        } else {
            for (var i = 0; i < cached.pixels.length; i++) canvas.buffer[i] = cached.pixels[i];
        }
    }
    /** 血魔边框、头像和数字使用同一原尺寸布局；只在 320×192 中移动整体位置。 */
    function drawCombatVitals(ui, player, background) {
        if (!player) return;
        image(background, 1, 98, 162);
        image(ui.mHeadsImg_0[player.index - 1], 1, 99, 159);
        originalNumber.call(util, canvas, player.hp, 128, 168);
        originalNumber.call(util, canvas, player.maxHP, 153, 168);
        originalNumber.call(util, canvas, player.mp, 128, 179);
        originalNumber.call(util, canvas, player.maxMP, 153, 179);
    }
    /** 原战斗操作仍绘制原圆形菜单；各子页面继续由原 ScreenStack 管理输入和顺序。 */
    function prepareCombatScreens(ui) {
        var screens = ui.mScreenStack_0.mScreenStack_0.iterator();
        while (screens.hasNext()) {
            var screen = screens.next();
            if (combatScreens.has(screen)) continue;
            combatScreens.add(screen);
            if (screen.mMenuIcon_0) {
                var original = screen.draw_9in0vv$;
                screen.draw_9in0vv$ = (function (classic) { return function (target) {
                    if (!isWide(target)) return classic.call(this, target);
                    var ui = this.$outer, position = core.combat.ui.CombatUI.Companion.sPlayerIndicatorPos_0[ui.mCurPlayerIndex_0];
                    image(this.mMenuIcon_0, this.mCurIconIndex_0, 14, 192 - this.mMenuIcon_0.height);
                    drawCombatVitals(ui, ui.selectedPlayer_0, this.mPlayerInfoBg_0);
                    if (position) ui.mPlayerIndicator_0.draw_2g4tob$(projected, position.x, position.y);
                }; })(original);
            } else if (screen.mIndicatorPos_0 && screen.mList_0) {
                var originalTarget = screen.draw_9in0vv$;
                screen.draw_9in0vv$ = (function (classic) { return function (target) {
                    if (!isWide(target)) return classic.call(this, target);
                    var position = this.mIndicatorPos_0[this.mCurSel_0];
                    if (position) this.mIndicator_0.draw_2g4tob$(projected, position.x, position.y);
                    if (this.mIndicator_0 === this.$outer.mTargetIndicator_0) {
                        drawCombatVitals(this.$outer, this.mList_0.get_za3lpa$(this.mCurSel_0), core.lib.DatLib.Companion.getRes_2et8c9$(core.lib.DatLib.ResType.PIC, 2, 2));
                    }
                }; })(originalTarget);
            }
        }
    }
    /** 战斗操作阶段沿用原状态机，HUD 与结算独立于战场坐标映射。 */
    var originalCombat = core.combat.Combat.prototype.draw_9in0vv$;
    core.combat.Combat.prototype.draw_9in0vv$ = function (target) {
        if (!isWide(target)) return originalCombat.call(this, target);
        drawCombatBackground(this);
        worldOffset = -16;
        try {
            for (var i = 0; i < this.mMonsterList_0.size; i++) {
                var monster = this.mMonsterList_0.get_za3lpa$(i);
                if (monster.isVisiable && monster.fightingSprite) monster.fightingSprite.draw_9in0vv$(projected);
            }
            for (var j = this.mPlayerList_0.size - 1; j >= 0; j--) {
                var sprite = this.mPlayerList_0.get_za3lpa$(j).fightingSprite;
                if (sprite) sprite.draw_9in0vv$(projected);
            }
            if (this.mCombatState_0.name === 'PerformAction') this.mActionExecutor_0.draw_9in0vv$(projected);
        } finally { worldOffset = 0; }
        if (this.mCombatState_0.name === 'SelectAction' && !this.mIsAutoAttack_0) {
            prepareCombatScreens(this.mCombatUI_0);
            this.mCombatUI_0.draw_9in0vv$(projected);
        }
        else if (this.mCombatState_0.name === 'Win' && this.mCombatSuccess_0) this.mCombatSuccess_0.draw_9in0vv$(projected);
        else if (this.mCombatState_0.name === 'Loss' && core.combat.Combat.Companion.sIsRandomFight_0) this.mFlyPeach_0.draw_2g4tob$(projected, 0, 0);
    };
    ['showMessage_2yb3jp$', 'showInformation_g6cl4j$'].forEach(function (method) {
        var original = util[method];
        util[method] = function (target, message) {
            if (!isWide(target)) return original.apply(this, arguments);
            var bytes = typeof message === 'string' ? global.sysGbkEncode(message) : message;
            var height = Math.min(152, textRender.textHeightForWitdh_ir89t6$(bytes, 280) + 16);
            var top = Math.round((192 - height) / 2);
            frame(12, top, 308, top + height);
            textRender.drawText_tz7kd0$(canvas, bytes, 0, new Rect(20, top + 8, 300, top + height - 8));
        };
    });

    /** 模式切换同步原列表的可见数量；静态配置不写入存档。 */
    var originalSet = wide.setEnabled, originalToggle = global.bbkToggleWideView;
    function syncRows() {
        var on = wide.state().enabled;
        core.gamemenu.ScreenGoodsList.Companion.itemNumberPerPage_0 = on ? 8 : 4;
        core.magic.ScreenMagic.Companion.ITEM_NUM_0 = on ? 8 : 2;
    }
    wide.setEnabled = function (value) { var result = originalSet(value); syncRows(); return result; };
    global.bbkToggleWideView = function () { var result = originalToggle(); syncRows(); return result; };
    syncRows();
})(window);
