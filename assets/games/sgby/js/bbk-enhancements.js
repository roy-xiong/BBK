;(function (global) {
    'use strict';

    var ARM_NAMES = ['骑兵', '步兵', '弓兵', '水兵', '极兵', '玄兵'];
    var MAX_BATTLE_MOVE = 8;
    var PLAYER_GENERAL_LIMIT = 10;
    var TOTAL_GENERAL_LIMIT = 20;
    var STATE_NORMAL = 0;
    var STATE_DEAD = 8;
    var BATTLE_RUNNING = 0;
    var BATTLE_WIN = 1;
    var FACTION_COLOR_STORAGE_KEY = 'bbk/sgbyFactionColors';

    var cheatState = {
        invincible: false,
        oneHitKill: false,
        factionColors: loadFactionColorSetting(),
        hooksInstalled: false,
        quickSavePending: false,
        initializationTimer: null,
        mainMapVisible: false
    };

    /**
     * 构造供 Flutter 解析的统一返回值。
     *
     * @param {boolean} ok 操作是否成功。
     * @param {string} message 用户提示。
     * @return {string} JSON 字符串。
     */
    function result(ok, message) {
        return JSON.stringify({ok: ok, message: message});
    }

    /**
     * 读取阵营着色偏好。首次使用默认开启。
     *
     * @return {boolean} 是否启用阵营着色。
     */
    function loadFactionColorSetting() {
        try {
            return global.localStorage.getItem(FACTION_COLOR_STORAGE_KEY) !== '0';
        } catch (_) {
            return true;
        }
    }

    /**
     * 写入阵营着色偏好。失败不会影响游戏本体。
     *
     * @param {boolean} enabled 是否启用。
     */
    function saveFactionColorSetting(enabled) {
        try {
            global.localStorage.setItem(FACTION_COLOR_STORAGE_KEY, enabled ? '1' : '0');
        } catch (_) {
            // localStorage 不可用时只保留当前页面内状态。
        }
    }

    /**
     * 获取当前有效战局上下文。
     *
     * 年份在部分版本开局阶段可能为 0，不能作为唯一开局标志。这里改为验证玩家君主、
     * 武将数组以及至少一座我方城池，兼容新开局、旧存档和不同资源版本。
     *
     * @return {Object|null} 有效上下文；未开局时返回 null。
     */
    function gameContext() {
        try {
            if (!global.baye || !baye.data) return null;
            var data = baye.data;
            var people = data.g_Persons;
            var cities = data.g_Cities;
            var playerKing = data.g_PlayerKing;
            if (!people || !cities || typeof playerKing !== 'number') return null;
            if (playerKing < 0 || playerKing >= people.length) return null;

            var ruler = playerKing + 1;
            var ownedCities = [];
            for (var cityIndex = 0; cityIndex < cities.length; cityIndex++) {
                if (cities[cityIndex].Belong === ruler) {
                    ownedCities.push({index: cityIndex, value: cities[cityIndex]});
                }
            }
            if (!ownedCities.length) return null;

            var ownedPeople = [];
            for (var personIndex = 0; personIndex < people.length; personIndex++) {
                if (people[personIndex].Belong === ruler) {
                    ownedPeople.push({index: personIndex, value: people[personIndex]});
                }
            }
            return {
                data: data,
                people: people,
                cities: cities,
                playerKing: playerKing,
                ruler: ruler,
                ownedCities: ownedCities,
                ownedPeople: ownedPeople
            };
        } catch (_) {
            return null;
        }
    }

    /**
     * 判断当前是否处于包含敌我双方的战斗。
     *
     * @param {Object} data 引擎全局数据。
     * @return {boolean} 是否正在战斗。
     */
    function isBattleActive(data) {
        if (!data.g_FgtParam || !data.g_FgtParam.GenArray || !data.g_GenPos) {
            return false;
        }
        if (data.g_FgtOver !== BATTLE_RUNNING) return false;
        var playerFound = false;
        var enemyFound = false;
        for (var index = 0; index < TOTAL_GENERAL_LIMIT; index++) {
            if (!data.g_FgtParam.GenArray[index]) continue;
            if (index < PLAYER_GENERAL_LIMIT) {
                playerFound = true;
            } else {
                enemyFound = true;
            }
        }
        return playerFound && enemyFound;
    }

    /**
     * 查找人物在当前战场中的序号。
     *
     * @param {Object} data 引擎全局数据。
     * @param {number} personIndex 人物数组序号。
     * @return {number} 战场序号；不在战场时返回 -1。
     */
    function battleIndexOf(data, personIndex) {
        if (!isBattleActive(data)) return -1;
        var personId = personIndex + 1;
        for (var index = 0; index < TOTAL_GENERAL_LIMIT; index++) {
            if (data.g_FgtParam.GenArray[index] === personId) return index;
        }
        return -1;
    }

    /**
     * 获取人物所在城池序号表。
     *
     * @param {Object} context 当前游戏上下文。
     * @return {Object<string, number>} 人物序号到城池序号的映射。
     */
    function personCityIndexes(context) {
        var mapping = {};
        var queue = context.data.g_PersonsQueue;
        if (!queue) return mapping;
        for (var cityIndex = 0; cityIndex < context.cities.length; cityIndex++) {
            var city = context.cities[cityIndex];
            var start = city.PersonQueue;
            var end = start + city.Persons;
            for (var offset = start; offset < end; offset++) {
                mapping[queue[offset]] = cityIndex;
            }
        }
        return mapping;
    }

    /**
     * 返回当前我方武将及可编辑属性。
     *
     * @return {string} JSON 数据。
     */
    function getCheatData() {
        var context = gameContext();
        if (!context) return result(false, '请先开始或载入一局游戏');
        try {
            var cityIndexes = personCityIndexes(context);
            var maxLevel = context.data.g_engineConfig.maxLevel || 20;
            var generals = context.ownedPeople.map(function (entry) {
                var person = entry.value;
                var cityIndex = cityIndexes[entry.index];
                var battleIndex = battleIndexOf(context.data, entry.index);
                var position = battleIndex >= 0
                    ? context.data.g_GenPos[battleIndex]
                    : null;
                return {
                    index: entry.index,
                    name: baye.getPersonName(entry.index) || ('武将 ' + (entry.index + 1)),
                    cityName: cityIndex == null ? '城外' : (baye.getCityName(cityIndex) || '未知城池'),
                    level: person.Level,
                    force: person.Force,
                    iq: person.IQ,
                    devotion: person.Devotion,
                    thew: person.Thew,
                    experience: person.Experience,
                    arms: person.Arms,
                    baseArmsType: person.ArmsType,
                    effectiveArmsType: baye.getArmType(entry.index),
                    inBattle: battleIndex >= 0,
                    battleMove: position ? position.move : 0,
                    battleHp: position ? position.hp : 0,
                    battleMp: position ? position.mp : 0,
                    battleState: position ? position.state : 0,
                    canAct: position ? position.active === 0 : false
                };
            });
            generals.sort(function (left, right) {
                return left.name.localeCompare(right.name, 'zh-CN');
            });
            return JSON.stringify({ok: true, maxLevel: maxLevel, generals: generals});
        } catch (_) {
            return result(false, '读取武将数据失败，请回到主地图后重试');
        }
    }

    /**
     * 读取并校验 Flutter 传入的我方武将序号。
     *
     * @param {Object} context 当前游戏上下文。
     * @param {Object|null|undefined} parameters 操作参数。
     * @return {{index:number, value:Object}|null} 我方武将。
     */
    function selectedGeneral(context, parameters) {
        var index = parameters ? Number(parameters.generalIndex) : NaN;
        if (!Number.isInteger(index) || index < 0 || index >= context.people.length) {
            return null;
        }
        var person = context.people[index];
        if (!person || person.Belong !== context.ruler) return null;
        return {index: index, value: person};
    }

    /**
     * 安装一个可与游戏模组原 Hook 共存的覆盖 Hook。
     *
     * @param {Object} hooks Hook 集合。
     * @param {string} name Hook 名称。
     * @param {function(Object): boolean} override 返回 true 时采用作弊结果。
     */
    function installOverrideHook(hooks, name, override) {
        var original = hooks[name];
        hooks[name] = function (context) {
            try {
                if (override(context)) return 0;
            } catch (_) {
                // 作弊 Hook 失败时继续执行原版计算。
            }
            return original ? original(context) : 1;
        };
    }

    /**
     * 根据敌我方向覆盖普通攻击或技能伤害。
     *
     * 战场数组前 10 位始终为玩家方，后 10 位为敌方。无敌仅拦截敌方向我方造成的
     * 伤害；一击必杀仅覆盖我方向敌方造成的伤害，避免影响治疗和同阵营技能。
     *
     * @param {Object} context 伤害 Hook 上下文。
     * @param {boolean} skill 是否为技能伤害。
     * @return {boolean} 是否已覆盖原版结果。
     */
    function overrideDamage(context, skill) {
        if (!global.baye || !baye.data || !baye.data.g_GenAtt) return false;
        var attacker = baye.data.g_GenAtt[0].generalIndex;
        var defender = baye.data.g_GenAtt[1].generalIndex;
        if (typeof attacker !== 'number' || typeof defender !== 'number') return false;

        if (
            cheatState.invincible &&
            attacker >= PLAYER_GENERAL_LIMIT &&
            defender < PLAYER_GENERAL_LIMIT
        ) {
            context.hurt = 0;
            if (skill && context.state != null) context.state = STATE_NORMAL;
            return true;
        }
        if (
            cheatState.oneHitKill &&
            attacker < PLAYER_GENERAL_LIMIT &&
            defender >= PLAYER_GENERAL_LIMIT
        ) {
            context.hurt = 65535;
            return true;
        }
        return false;
    }

    /**
     * 将 HSL 颜色转换为 RGB。
     *
     * @param {number} hue 色相角度。
     * @param {number} saturation 饱和度 0~1。
     * @param {number} lightness 亮度 0~1。
     * @return {number[]} RGB 数组。
     */
    function hslToRgb(hue, saturation, lightness) {
        var chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
        var section = hue / 60;
        var intermediate = chroma * (1 - Math.abs(section % 2 - 1));
        var red = 0;
        var green = 0;
        var blue = 0;
        if (section < 1) {
            red = chroma; green = intermediate;
        } else if (section < 2) {
            red = intermediate; green = chroma;
        } else if (section < 3) {
            green = chroma; blue = intermediate;
        } else if (section < 4) {
            green = intermediate; blue = chroma;
        } else if (section < 5) {
            red = intermediate; blue = chroma;
        } else {
            red = chroma; blue = intermediate;
        }
        var match = lightness - chroma / 2;
        return [
            Math.round((red + match) * 255),
            Math.round((green + match) * 255),
            Math.round((blue + match) * 255)
        ];
    }

    /**
     * 为阵营生成稳定且具有区分度的颜色。
     *
     * @param {number} belong 城池归属，0 表示空城。
     * @param {number} playerRuler 玩家阵营。
     * @return {number[]} RGB 数组。
     */
    function factionColor(belong, playerRuler) {
        if (belong === 0) return [126, 132, 138];
        if (belong === playerRuler) return [35, 166, 92];
        return hslToRgb((belong * 137.508) % 360, 0.72, 0.52);
    }

    /**
     * 获取地图着色所需的轻量上下文。
     *
     * 与作弊上下文不同，这里不扫描 2000 个武将槽位，避免 LCD 周期刷新时产生无效工作。
     *
     * @return {Object|null} 地图数据上下文。
     */
    function mapContext() {
        try {
            if (!global.baye || !baye.data) return null;
            var data = baye.data;
            if (
                !data.g_Cities || !data.g_CityPositions || !data.g_CityPos ||
                typeof data.g_PlayerKing !== 'number'
            ) {
                return null;
            }
            return {
                data: data,
                cities: data.g_Cities,
                ruler: data.g_PlayerKing + 1
            };
        } catch (_) {
            return null;
        }
    }

    /**
     * 在 RGBA 像素数组内为可见城池图标着色。
     *
     * @param {Uint8ClampedArray} pixels RGBA 像素数组。
     * @param {number} pixelWidth 像素宽度。
     * @param {number} pixelHeight 像素高度。
     * @param {number} scaleX 逻辑坐标到像素的横向比例。
     * @param {number} scaleY 逻辑坐标到像素的纵向比例。
     * @return {number} 实际替换的像素数量。
     */
    function colorizePixelData(pixels, pixelWidth, pixelHeight, scaleX, scaleY) {
        var context = mapContext();
        if (!context) return 0;
        var visibleColumns = Math.floor((global.lcdWidth + 1) / 16) - 2;
        var visibleRows = Math.floor(global.lcdHeight / 16);
        var viewport = context.data.g_CityPos;
        var coloredPixels = 0;

        for (var cityIndex = 0; cityIndex < context.cities.length; cityIndex++) {
            var position = context.data.g_CityPositions[cityIndex];
            var relativeX = position.x - viewport.x;
            var relativeY = position.y - viewport.y;
            if (
                relativeX < 0 || relativeY < 0 ||
                relativeX >= visibleColumns || relativeY >= visibleRows
            ) {
                continue;
            }

            var rgb = factionColor(context.cities[cityIndex].Belong, context.ruler);
            var startX = Math.round((relativeX * 16 + 4) * scaleX);
            var startY = Math.round((relativeY * 16 + 4) * scaleY);
            var endX = Math.min(pixelWidth, Math.round(startX + 8 * scaleX));
            var endY = Math.min(pixelHeight, Math.round(startY + 8 * scaleY));
            for (var y = startY; y < endY; y++) {
                for (var x = startX; x < endX; x++) {
                    var offset = (y * pixelWidth + x) * 4;
                    if (
                        pixels[offset] < 32 &&
                        pixels[offset + 1] < 32 &&
                        pixels[offset + 2] < 32 &&
                        pixels[offset + 3] > 160
                    ) {
                        pixels[offset] = rgb[0];
                        pixels[offset + 1] = rgb[1];
                        pixels[offset + 2] = rgb[2];
                        pixels[offset + 3] = 255;
                        coloredPixels++;
                    }
                }
            }
        }
        return coloredPixels;
    }

    /**
     * 按城池归属为当前主地图中的 8×8 城池图标着色。
     *
     * 地图底图使用深灰色，城池图标使用纯黑色；这里只替换图标范围内接近纯黑的像素，
     * 不修改文字、地图纹理或右侧信息栏。地图 Hook 仅在重绘时触发，不参与逐帧循环。
     */
    function colorizeCityIcons() {
        if (!cheatState.factionColors || !cheatState.mainMapVisible) return;
        var canvas = document.getElementById('lcd');
        if (!canvas || !canvas.getContext || !global.lcdWidth || !global.lcdHeight) return;

        try {
            var drawing = canvas.getContext('2d');
            var image = drawing.getImageData(0, 0, canvas.width, canvas.height);
            var scaleX = canvas.width / global.lcdWidth;
            var scaleY = canvas.height / global.lcdHeight;
            colorizePixelData(
                image.data,
                canvas.width,
                canvas.height,
                scaleX,
                scaleY
            );
            drawing.putImageData(image, 0, 0);
        } catch (_) {
            // Canvas 读取失败时保留原版黑白地图。
        }
    }

    /**
     * 安装 LCD 输出和输入状态桥。
     *
     * 主地图后续的周期刷新会在写入 Canvas 前直接处理 WASM RGBA 缓冲，避免先着色后又
     * 被黑白帧覆盖。非方向键和触摸先标记离开主地图，防止菜单文字被误着色。
     */
    function installDisplayPipeline() {
        var originalFlush = global.bayeFlushLcdBuffer;
        if (typeof originalFlush === 'function') {
            global.bayeFlushLcdBuffer = function (buffer) {
                if (
                    cheatState.factionColors && cheatState.mainMapVisible &&
                    typeof wasmMemory !== 'undefined' &&
                    global.lcdWidth && global.lcdHeight && global.dotSize
                ) {
                    try {
                        var width = global.lcdWidth * global.dotSize;
                        var height = global.lcdHeight * global.dotSize;
                        var pixels = new Uint8ClampedArray(
                            wasmMemory.buffer,
                            buffer,
                            width * height * 4
                        );
                        colorizePixelData(
                            pixels,
                            width,
                            height,
                            global.dotSize,
                            global.dotSize
                        );
                    } catch (_) {
                        // 帧缓冲状态不完整时继续执行原版输出。
                    }
                }
                return originalFlush(buffer);
            };
        }

        var originalSendKey = global.sendKey;
        if (typeof originalSendKey === 'function') {
            global.sendKey = function (key) {
                if (key !== VK_UP && key !== VK_DOWN && key !== VK_LEFT && key !== VK_RIGHT) {
                    cheatState.mainMapVisible = false;
                }
                return originalSendKey(key);
            };
        }

        var originalRaiseTouchEvent = global.raiseTouchEvent;
        if (typeof originalRaiseTouchEvent === 'function') {
            global.raiseTouchEvent = function () {
                cheatState.mainMapVisible = false;
                return originalRaiseTouchEvent.apply(this, arguments);
            };
        }
    }

    /** 安装战斗作弊和地图着色 Hook，重复调用不会重复包装。 */
    function initialize() {
        if (cheatState.hooksInstalled) return true;
        if (!global.baye || !baye.hooks || !baye.data) return false;
        var hooks = baye.hooks;
        installOverrideHook(hooks, 'countAttackHurt', function (context) {
            return overrideDamage(context, false);
        });
        installOverrideHook(hooks, 'countSkillHurt', function (context) {
            return overrideDamage(context, true);
        });

        var originalMapHook = hooks.didShowMainMap;
        hooks.didShowMainMap = function (context) {
            var hookResult = originalMapHook ? originalMapHook(context) : 1;
            cheatState.mainMapVisible = true;
            global.requestAnimationFrame(colorizeCityIcons);
            return hookResult;
        };
        cheatState.hooksInstalled = true;
        return true;
    }

    /**
     * 等待异步化游戏主循环建立脚本 Hook 表。
     *
     * 最多检查 120 次，每次间隔 250ms；安装成功或达到上限后立即停止，不保留常驻
     * 轮询，也不会在 WebView 销毁后继续持有游戏对象。
     */
    function start() {
        if (initialize() || cheatState.initializationTimer != null) return;
        var remainingAttempts = 120;
        var tryInitialize = function () {
            cheatState.initializationTimer = null;
            if (initialize() || --remainingAttempts <= 0) return;
            cheatState.initializationTimer = global.setTimeout(tryInitialize, 250);
        };
        cheatState.initializationTimer = global.setTimeout(tryInitialize, 250);
    }

    /**
     * 从主地图进入原生存档档位界面。
     *
     * @return {string} 结构化结果。
     */
    function openSaveMenu() {
        if (!gameContext()) return result(false, '请先开始或载入一局游戏');
        if (cheatState.quickSavePending) return result(false, '正在打开存档界面');

        var hooks = baye.hooks || (baye.hooks = {});
        var originalHook = hooks.mainSystemMenu;
        var quickSaveHook;
        var hookUsed = false;
        var restoreHook = function () {
            if (hooks.mainSystemMenu !== quickSaveHook) return;
            if (originalHook) {
                hooks.mainSystemMenu = originalHook;
            } else {
                delete hooks.mainSystemMenu;
            }
        };

        quickSaveHook = function () {
            hookUsed = true;
            restoreHook();
            global.setTimeout(function () {
                cheatState.quickSavePending = false;
            }, 30000);
            return 1;
        };
        cheatState.quickSavePending = true;
        hooks.mainSystemMenu = quickSaveHook;
        global.setTimeout(function () {
            restoreHook();
            if (!hookUsed) cheatState.quickSavePending = false;
        }, 1500);
        sendKey(VK_EXIT);
        return result(true, '正在打开存档界面；若未跳转，请先回到主地图再试');
    }

    /** 存档文件实际写入后释放快捷存档防重复锁。 */
    function onSaveCompleted() {
        cheatState.quickSavePending = false;
    }

    /**
     * 执行经过白名单限制的三国霸业作弊操作。
     *
     * @param {string} action 固定动作名。
     * @param {Object|null|undefined} parameters 结构化参数。
     * @return {string} 结构化结果。
     */
    function applyCheat(action, parameters) {
        start();
        var context = gameContext();
        if (!context) return result(false, '请先开始或载入一局游戏');
        parameters = parameters || {};

        try {
            if (action === 'sgby_resources') {
                context.ownedCities.forEach(function (entry) {
                    entry.value.Money = 65535;
                    entry.value.Food = 65535;
                    entry.value.MothballArms = 65535;
                });
                return result(true, '已将 ' + context.ownedCities.length + ' 座城池资源提升至上限');
            }
            if (action === 'sgby_development') {
                context.ownedCities.forEach(function (entry) {
                    var city = entry.value;
                    city.State = 0;
                    city.Farming = city.FarmingLimit;
                    city.Commerce = city.CommerceLimit;
                    city.Population = city.PopulationLimit;
                    city.PeopleDevotion = 100;
                    city.AvoidCalamity = 100;
                });
                return result(true, '已将 ' + context.ownedCities.length + ' 座城池发展提升至上限');
            }
            if (action === 'sgby_generals') {
                var maxLevel = context.data.g_engineConfig.maxLevel || 20;
                context.ownedPeople.forEach(function (entry) {
                    var person = entry.value;
                    person.Level = maxLevel;
                    person.Force = 100;
                    person.IQ = 100;
                    person.Devotion = 100;
                    person.Thew = 100;
                    person.Experience = 0;
                    person.Arms = 65535;
                });
                return result(true, '已将 ' + context.ownedPeople.length + ' 名我方武将属性拉满');
            }
            if (action === 'sgby_invincible') {
                cheatState.invincible = !cheatState.invincible;
                return result(true, cheatState.invincible ? '我方无敌已开启' : '我方无敌已关闭');
            }
            if (action === 'sgby_one_hit_kill') {
                cheatState.oneHitKill = !cheatState.oneHitKill;
                return result(true, cheatState.oneHitKill ? '一击必杀已开启' : '一击必杀已关闭');
            }
            if (action === 'sgby_faction_colors') {
                cheatState.factionColors = !cheatState.factionColors;
                saveFactionColorSetting(cheatState.factionColors);
                return result(
                    true,
                    cheatState.factionColors
                        ? '阵营城池着色已开启，主地图刷新后生效'
                        : '阵营城池着色已关闭，主地图刷新后恢复'
                );
            }
            if (action === 'sgby_force_win') {
                if (!isBattleActive(context.data)) return result(false, '当前没有进行中的战斗');
                for (var enemyIndex = PLAYER_GENERAL_LIMIT; enemyIndex < TOTAL_GENERAL_LIMIT; enemyIndex++) {
                    var enemyId = context.data.g_FgtParam.GenArray[enemyIndex];
                    if (!enemyId) continue;
                    context.data.g_GenPos[enemyIndex].state = STATE_DEAD;
                    context.people[enemyId - 1].Arms = 0;
                }
                context.data.g_FgtOver = BATTLE_WIN;
                return result(true, '当前战斗已判定为我方胜利');
            }

            var selected = selectedGeneral(context, parameters);
            if (!selected) return result(false, '请选择有效的我方武将');
            var person = selected.value;
            var name = baye.getPersonName(selected.index) || ('武将 ' + (selected.index + 1));
            if (action === 'sgby_general_all') {
                person.Level = context.data.g_engineConfig.maxLevel || 20;
                person.Force = 100;
                person.IQ = 100;
                person.Devotion = 100;
                person.Thew = 100;
                person.Experience = 0;
                person.Arms = 65535;
                return result(true, name + '的全部属性已拉满');
            }
            if (action === 'sgby_general_force') {
                person.Force = 100;
                return result(true, name + '的武力已提升至 100');
            }
            if (action === 'sgby_general_iq') {
                person.IQ = 100;
                return result(true, name + '的智力已提升至 100');
            }
            if (action === 'sgby_general_thew') {
                person.Thew = 100;
                return result(true, name + '的体力已提升至 100');
            }
            if (action === 'sgby_general_devotion') {
                person.Devotion = 100;
                return result(true, name + '的忠诚已提升至 100');
            }
            if (action === 'sgby_general_level') {
                person.Level = context.data.g_engineConfig.maxLevel || 20;
                person.Experience = 0;
                return result(true, name + '已提升至等级上限');
            }
            if (action === 'sgby_general_arms') {
                person.Arms = 65535;
                return result(true, name + '的兵力已提升至 65535');
            }
            if (action === 'sgby_general_arm_type') {
                var armsType = Number(parameters.armsType);
                if (!Number.isInteger(armsType) || armsType < 0 || armsType >= ARM_NAMES.length) {
                    return result(false, '兵种参数无效');
                }
                person.ArmsType = armsType;
                var effective = baye.getArmType(selected.index);
                if (effective !== armsType) {
                    return result(
                        true,
                        name + '的基础兵种已改为' + ARM_NAMES[armsType] +
                        '，但当前装备仍覆盖为' + ARM_NAMES[effective]
                    );
                }
                return result(true, name + '的兵种已改为' + ARM_NAMES[armsType]);
            }

            var battleIndex = battleIndexOf(context.data, selected.index);
            if (battleIndex < 0 || battleIndex >= PLAYER_GENERAL_LIMIT) {
                return result(false, name + '当前不在我方战场队列中');
            }
            var position = context.data.g_GenPos[battleIndex];
            if (action === 'sgby_general_move') {
                position.move = MAX_BATTLE_MOVE;
                position.active = 0;
                return result(true, name + '的移动力已提升至 8，并恢复行动');
            }
            if (action === 'sgby_general_restore') {
                position.hp = 100;
                position.mp = 100;
                position.state = STATE_NORMAL;
                position.active = 0;
                return result(true, name + '的战斗状态已完全恢复');
            }
            return result(false, '未知的作弊操作');
        } catch (_) {
            return result(false, '修改失败，请回到主地图后重试');
        }
    }

    /** @return {string} 当前持续作弊状态。 */
    function getCheatState() {
        start();
        return JSON.stringify({
            invincible: cheatState.invincible,
            oneHitKill: cheatState.oneHitKill,
            factionColors: cheatState.factionColors
        });
    }

    global.BbkSgby = {
        start: start,
        openSaveMenu: openSaveMenu,
        onSaveCompleted: onSaveCompleted,
        applyCheat: applyCheat,
        getCheatState: getCheatState,
        getCheatData: getCheatData
    };

    installDisplayPipeline();
})(this);
