;(function (global) {
    'use strict';

    var ARM_NAMES = ['骑兵', '步兵', '弓兵', '水兵', '极兵', '玄兵'];
    var MAX_BATTLE_MOVE = 8;
    var PLAYER_GENERAL_LIMIT = 10;
    var TOTAL_GENERAL_LIMIT = 20;
    var STATE_NORMAL = 0;
    var STATE_SILENCED = 2;
    var STATE_IMMOBILIZED = 3;
    var STATE_DEAD = 8;
    var BATTLE_RUNNING = 0;
    var BATTLE_WIN = 1;
    var CAPTIVE_BELONG = 0xffff;
    var FOUND_GOODS_MASK = 0x8000;
    var MOVEMENT_TERRAIN_COST = 0x81;
    var LONG_PRESS_DELAY_MS = 600;
    var LONG_PRESS_CANCEL_DISTANCE = 12;
    var PLAYER_UNIT_MARKER_COLOR = 0x80;
    var PLAYER_UNIT_MARKER_CHANNEL = 0x7f;
    var PLAYER_UNIT_MARKER_ALPHA = 0x80;
    var PLAYER_UNIT_RED = [211, 47, 47];
    var FACTION_COLOR_STORAGE_KEY = 'bbk/sgbyFactionColors';
    var CHEAT_STATE_STORAGE_KEY = 'baye/bbkSgbyCheatState';
    var persistedCheatState = loadPersistentCheatState();

    var cheatState = {
        invincible: persistedCheatState.invincible === true,
        oneHitKill: persistedCheatState.oneHitKill === true,
        freeMovement: persistedCheatState.freeMovement === true,
        autoMaxGenerals: persistedCheatState.autoMaxGenerals === true,
        foodProtection: persistedCheatState.foodProtection === true,
        battleSpeed2x: persistedCheatState.battleSpeed2x !== false,
        postBattleAutomation: persistedCheatState.postBattleAutomation === true,
        factionColors: typeof persistedCheatState.factionColors === 'boolean'
            ? persistedCheatState.factionColors
            : loadFactionColorSetting(),
        hooksInstalled: false,
        longPressInstalled: false,
        battleSpeedPipelineInstalled: false,
        endTurnPending: false,
        quickSavePending: false,
        battleFoodSnapshot: null,
        postBattleAutomationPending: false,
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
     * 读取需要跨应用重启保留的作弊开关。
     *
     * @return {Object} 已校验为对象的本地状态。
     */
    function loadPersistentCheatState() {
        try {
            var decoded = JSON.parse(global.localStorage.getItem(CHEAT_STATE_STORAGE_KEY) || '{}');
            return decoded && typeof decoded === 'object' ? decoded : {};
        } catch (_) {
            return {};
        }
    }

    /** 将持续作弊开关写入本地存储，不保存临时锁和 Hook 运行状态。 */
    function savePersistentCheatState() {
        try {
            global.localStorage.setItem(CHEAT_STATE_STORAGE_KEY, JSON.stringify({
                version: 1,
                invincible: cheatState.invincible,
                oneHitKill: cheatState.oneHitKill,
                freeMovement: cheatState.freeMovement,
                autoMaxGenerals: cheatState.autoMaxGenerals,
                foodProtection: cheatState.foodProtection,
                battleSpeed2x: cheatState.battleSpeed2x,
                postBattleAutomation: cheatState.postBattleAutomation,
                factionColors: cheatState.factionColors
            }));
        } catch (_) {
            // localStorage 不可用时仍保留当前运行周期内的状态。
        }
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
     * 将单个武将提升到当前版本允许的上限。
     *
     * @param {Object} person 武将对象。
     * @param {Object} data 引擎全局数据。
     */
    function maximizeGeneral(person, data) {
        person.Level = data.g_engineConfig.maxLevel || 20;
        person.Force = 100;
        person.IQ = 100;
        person.Devotion = 100;
        person.Thew = 100;
        person.Experience = 0;
        person.Arms = 65535;
    }

    /**
     * 一次拉满全部我方城池的资源和发展属性。
     *
     * @param {Object} context 当前游戏上下文。
     * @return {number} 处理的城池数量。
     */
    function maximizeOwnedCities(context) {
        context.ownedCities.forEach(function (entry) {
            var city = entry.value;
            city.Money = 65535;
            city.Food = 65535;
            city.MothballArms = 65535;
            city.State = 0;
            city.Farming = city.FarmingLimit;
            city.Commerce = city.CommerceLimit;
            city.Population = city.PopulationLimit;
            city.PeopleDevotion = 100;
            city.AvoidCalamity = 100;
        });
        return context.ownedCities.length;
    }

    /**
     * 搜出全部我方城池中当前已经存在的隐藏人物和物品。
     *
     * @param {Object} context 当前游戏上下文。
     * @return {{people:number, tools:number}} 搜索结果统计。
     */
    function searchAllOwnedCities(context) {
        var foundPeople = 0;
        var foundTools = 0;
        var goodsQueue = context.data.g_GoodsQueue;
        context.ownedCities.forEach(function (cityEntry) {
            cityPersonIndexes(context, cityEntry).forEach(function (personIndex) {
                var hiddenPerson = context.people[personIndex];
                if (!hiddenPerson || hiddenPerson.Belong !== 0) return;
                hiddenPerson.Belong = context.ruler;
                hiddenPerson.Devotion = 100;
                if (cheatState.autoMaxGenerals) maximizeGeneral(hiddenPerson, context.data);
                foundPeople++;
            });
            if (!goodsQueue) return;
            for (var toolOffset = 0; toolOffset < cityEntry.value.Tools; toolOffset++) {
                var queueIndex = cityEntry.value.ToolQueue + toolOffset;
                var queuedTool = goodsQueue[queueIndex];
                if ((queuedTool & FOUND_GOODS_MASK) === 0) {
                    goodsQueue[queueIndex] = queuedTool | FOUND_GOODS_MASK;
                    foundTools++;
                }
            }
        });
        return {people: foundPeople, tools: foundTools};
    }

    /**
     * 招降指定我方城池集合内的全部俘虏。
     *
     * @param {Object} context 当前游戏上下文。
     * @param {Array<{index:number,value:Object}>} cityEntries 需要处理的我方城池。
     * @return {number} 招降人数。
     */
    function recruitCaptives(context, cityEntries) {
        var recruited = 0;
        cityEntries.forEach(function (cityEntry) {
            cityPersonIndexes(context, cityEntry).forEach(function (personIndex) {
                var captive = context.people[personIndex];
                if (!captive || captive.Belong !== CAPTIVE_BELONG) return;
                captive.Belong = context.ruler;
                captive.Devotion = 100;
                if (cheatState.autoMaxGenerals) maximizeGeneral(captive, context.data);
                recruited++;
            });
        });
        return recruited;
    }

    /** 在新开局、载入存档或脚本初始化后重新应用需要写入人物数据的持续作弊。 */
    function applyPersistentGeneralEffects() {
        if (!cheatState.autoMaxGenerals) return;
        var context = gameContext();
        if (!context) return;
        context.ownedPeople.forEach(function (entry) {
            maximizeGeneral(entry.value, context.data);
        });
    }

    /**
     * 向 Flutter 顶部提示发送后台自动处理结果。
     *
     * @param {boolean} ok 是否成功。
     * @param {string} message 提示内容。
     */
    function postSystemNotice(ok, message) {
        if (!global.BbkSystemChannel) return;
        global.BbkSystemChannel.postMessage(JSON.stringify({
            type: 'sgby_notice',
            data: {ok: ok, message: message}
        }));
    }

    /** 战斗结算完成并回到主地图后执行一次自动处理。 */
    function runPostBattleAutomation() {
        if (!cheatState.postBattleAutomation) return;
        var context = gameContext();
        if (!context) {
            postSystemNotice(false, '战后自动处理失败，请回到主地图后手动执行');
            return;
        }
        var cityCount = maximizeOwnedCities(context);
        var recruited = recruitCaptives(context, context.ownedCities);
        var searched = searchAllOwnedCities(context);
        postSystemNotice(
            true,
            '战后自动处理完成：拉满 ' + cityCount + ' 座城池，招降 ' + recruited +
            ' 人，搜出隐藏人物 ' + searched.people + ' 名、隐藏物品 ' + searched.tools + ' 件'
        );
    }

    /**
     * 根据主地图光标查找当前选中的城池。
     *
     * @param {Object} context 当前游戏上下文。
     * @return {{index:number, value:Object}|null} 当前城池；光标不在城池上时返回 null。
     */
    function selectedMapCity(context) {
        var cursor = context.data.g_CityPos;
        var positions = context.data.g_CityPositions;
        if (!cursor || !positions) return null;
        for (var cityIndex = 0; cityIndex < context.cities.length; cityIndex++) {
            var position = positions[cityIndex];
            if (position && position.x === cursor.setx && position.y === cursor.sety) {
                return {index: cityIndex, value: context.cities[cityIndex]};
            }
        }
        return null;
    }

    /**
     * 读取指定城池人物队列的稳定快照。
     *
     * 后续处斩会改变全局队列起始位置，因此必须先复制人物编号，再逐个删除。
     *
     * @param {Object} context 当前游戏上下文。
     * @param {{index:number, value:Object}} cityEntry 城池信息。
     * @return {number[]} 人物数组序号。
     */
    function cityPersonIndexes(context, cityEntry) {
        var queue = context.data.g_PersonsQueue;
        if (!queue) return [];
        var city = cityEntry.value;
        var people = [];
        for (var offset = 0; offset < city.Persons; offset++) {
            people.push(queue[city.PersonQueue + offset]);
        }
        return people;
    }

    /**
     * 返回当前主地图光标选中的我方城池。
     *
     * @param {Object} context 当前游戏上下文。
     * @return {{index:number, value:Object}|null} 我方城池。
     */
    function selectedOwnedCity(context) {
        var cityEntry = selectedMapCity(context);
        return cityEntry && cityEntry.value.Belong === context.ruler ? cityEntry : null;
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
     * 安装不改变原 Hook 返回值的观察 Hook。
     *
     * @param {Object} hooks Hook 集合。
     * @param {string} name Hook 名称。
     * @param {function(Object): void} observer 原 Hook 执行后的增强逻辑。
     */
    function installObserverHook(hooks, name, observer) {
        var original = hooks[name];
        hooks[name] = function (context) {
            var hookResult = original ? original(context) : 1;
            try {
                observer(context);
            } catch (_) {
                // 辅助逻辑异常时保留原版回合流程和原 Hook 返回值。
            }
            return hookResult;
        };
    }

    /**
     * 计算城市本回合需要的粮草，并在不足时仅补到可正常扣除的最小值。
     *
     * 这样可以避免原版“粮草不足则全员兵力减半”的分支，同时保留旱灾、水灾、暴动
     * 对兵力的独立影响，也不会每回合把城市粮草永久拉满。
     */
    function protectCityFoodShortage() {
        if (!cheatState.foodProtection) return;
        var context = gameContext();
        if (!context) return;
        var ratio = context.data.g_engineConfig.ratioOfFoodToArmsPerMouth || 50;
        var queue = context.data.g_PersonsQueue;
        if (!queue || ratio <= 0) return;

        context.ownedCities.forEach(function (entry) {
            var city = entry.value;
            var totalArms = city.MothballArms;
            for (var offset = 0; offset < city.Persons; offset++) {
                var person = context.people[queue[city.PersonQueue + offset]];
                if (!person || person.Belong !== city.Belong) continue;
                var arms = person.Arms;
                if (city.State === 2 || city.State === 3) {
                    arms -= Math.floor(arms / 4);
                } else if (city.State === 4) {
                    arms = Math.floor(arms / 2);
                }
                totalArms = (totalArms + arms) & 0xffff;
            }
            var requiredFood = Math.floor(totalArms / ratio);
            if (city.Food <= requiredFood && requiredFood < 65535) {
                city.Food = requiredFood + 1;
            }
        });
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
     * 将我方战场单位使用的专用灰阶标记转换为红色。
     *
     * 原引擎只有单色调色板。绘制我方单位时先使用不会出现在原版画面中的 0x80 调色值，
     * 再只扫描我方单位所在的 16×16 图块并替换对应像素。这样不会把地形、文字或敌方
     * 单位一起染色，每帧最多检查十个小图块，避免全屏逐像素扫描影响战斗性能。
     *
     * @param {Uint8ClampedArray} pixels RGBA 像素数组。
     * @param {number} pixelWidth 像素宽度。
     * @param {number} pixelHeight 像素高度。
     * @param {number} scaleX 逻辑坐标到像素的横向比例。
     * @param {number} scaleY 逻辑坐标到像素的纵向比例。
     * @return {number} 实际替换的像素数量。
     */
    function colorizePlayerBattleUnits(pixels, pixelWidth, pixelHeight, scaleX, scaleY) {
        if (!global.baye || !baye.data || !isBattleActive(baye.data)) return 0;
        var data = baye.data;
        var mapStartX = Number(data.g_MapSX) || 0;
        var mapStartY = Number(data.g_MapSY) || 0;
        var coloredPixels = 0;
        for (var generalIndex = 0; generalIndex < PLAYER_GENERAL_LIMIT; generalIndex++) {
            if (!data.g_FgtParam.GenArray[generalIndex]) continue;
            var position = data.g_GenPos[generalIndex];
            if (!position || position.state === STATE_DEAD) continue;
            var relativeX = position.x - mapStartX;
            var relativeY = position.y - mapStartY;
            if (relativeX < 0 || relativeY < 0) continue;

            var startX = Math.max(0, Math.floor(relativeX * 16 * scaleX));
            var startY = Math.max(0, Math.floor(relativeY * 16 * scaleY));
            var endX = Math.min(pixelWidth, Math.ceil((relativeX + 1) * 16 * scaleX));
            var endY = Math.min(pixelHeight, Math.ceil((relativeY + 1) * 16 * scaleY));
            for (var y = startY; y < endY; y++) {
                for (var x = startX; x < endX; x++) {
                    var offset = (y * pixelWidth + x) * 4;
                    if (
                        pixels[offset] === PLAYER_UNIT_MARKER_CHANNEL &&
                        pixels[offset + 1] === PLAYER_UNIT_MARKER_CHANNEL &&
                        pixels[offset + 2] === PLAYER_UNIT_MARKER_CHANNEL &&
                        pixels[offset + 3] === PLAYER_UNIT_MARKER_ALPHA
                    ) {
                        pixels[offset] = PLAYER_UNIT_RED[0];
                        pixels[offset + 1] = PLAYER_UNIT_RED[1];
                        pixels[offset + 2] = PLAYER_UNIT_RED[2];
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
     * 将触点坐标转换为游戏逻辑坐标。
     *
     * @param {HTMLCanvasElement} canvas 游戏画布。
     * @param {number} clientX 浏览器横坐标。
     * @param {number} clientY 浏览器纵坐标。
     * @return {{x:number, y:number}|null} 游戏坐标。
     */
    function gamePointFromClient(canvas, clientX, clientY) {
        var rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height || !global.lcdWidth || !global.lcdHeight) return null;
        return {
            x: (clientX - rect.left) / rect.width * global.lcdWidth,
            y: (clientY - rect.top) / rect.height * global.lcdHeight
        };
    }

    /**
     * 构造触点所在敌方城池的武将信息。
     *
     * @param {HTMLCanvasElement} canvas 游戏画布。
     * @param {number} clientX 浏览器横坐标。
     * @param {number} clientY 浏览器纵坐标。
     * @return {{point:Object, city:Object}|null} Flutter 可解析的数据。
     */
    function enemyCityAtPoint(canvas, clientX, clientY) {
        if (!cheatState.mainMapVisible) return null;
        var context = gameContext();
        if (!context) return null;
        var point = gamePointFromClient(canvas, clientX, clientY);
        if (!point) return null;
        var mapX = context.data.g_CityPos.x + Math.floor(point.x / 16);
        var mapY = context.data.g_CityPos.y + Math.floor(point.y / 16);
        var positions = context.data.g_CityPositions;
        var cityEntry = null;
        for (var cityIndex = 0; cityIndex < context.cities.length; cityIndex++) {
            var position = positions[cityIndex];
            if (position && position.x === mapX && position.y === mapY) {
                cityEntry = {index: cityIndex, value: context.cities[cityIndex]};
                break;
            }
        }
        if (
            !cityEntry || !cityEntry.value.Belong ||
            cityEntry.value.Belong === context.ruler
        ) {
            return null;
        }

        var generals = [];
        cityPersonIndexes(context, cityEntry).forEach(function (personIndex) {
            var person = context.people[personIndex];
            if (!person) return;
            var captive = person.Belong === CAPTIVE_BELONG;
            if (!captive && person.Belong !== cityEntry.value.Belong) return;
            var effectiveArmsType = person.ArmsType;
            try {
                effectiveArmsType = baye.getArmType(personIndex);
            } catch (_) {
                // 装备兵种读取失败时展示基础兵种。
            }
            generals.push({
                index: personIndex,
                name: baye.getPersonName(personIndex) || ('武将 ' + (personIndex + 1)),
                level: person.Level,
                force: person.Force,
                iq: person.IQ,
                devotion: person.Devotion,
                arms: person.Arms,
                armsType: effectiveArmsType,
                captive: captive
            });
        });

        return {
            point: point,
            city: {
                index: cityEntry.index,
                name: baye.getCityName(cityEntry.index) || ('城池 ' + (cityEntry.index + 1)),
                rulerName: baye.getPersonName(cityEntry.value.Belong - 1) || '未知势力',
                generals: generals
            }
        };
    }

    /**
     * 安装敌方城池长按识别。普通短按仍交给原触摸处理器。
     *
     * 长按识别成功后向引擎补发取消事件，避免松手再次触发原版“点按城池”；随后通过
     * 只读系统通道把武将快照交给 Flutter 展示。监听器只安装一次，页面销毁后由 WebView
     * 一并释放，不额外持有 Flutter 对象。
     */
    function installEnemyCityLongPress() {
        if (cheatState.longPressInstalled || !global.document) return;
        var canvas = global.document.getElementById('lcd');
        if (!canvas || !canvas.addEventListener) return;
        var active = null;

        function cancelTimer() {
            if (active && active.timer != null) global.clearTimeout(active.timer);
            active = null;
        }

        canvas.addEventListener('touchstart', function (event) {
            if (!cheatState.mainMapVisible || active || !event.targetTouches.length) return;
            var touch = event.targetTouches[0];
            active = {
                identifier: touch.identifier,
                clientX: touch.clientX,
                clientY: touch.clientY,
                timer: global.setTimeout(function () {
                    if (!active) return;
                    var target = enemyCityAtPoint(canvas, active.clientX, active.clientY);
                    if (!target) {
                        cancelTimer();
                        return;
                    }
                    if (typeof global._bayeSendTouchEvent === 'function') {
                        global._bayeSendTouchEvent(4, target.point.x, target.point.y);
                    }
                    if (global.BbkSystemChannel) {
                        global.BbkSystemChannel.postMessage(JSON.stringify({
                            type: 'sgby_enemy_city',
                            data: target.city
                        }));
                    }
                    cancelTimer();
                }, LONG_PRESS_DELAY_MS)
            };
        }, {passive: true});

        canvas.addEventListener('touchmove', function (event) {
            if (!active) return;
            for (var index = 0; index < event.changedTouches.length; index++) {
                var touch = event.changedTouches[index];
                if (touch.identifier !== active.identifier) continue;
                var distanceX = touch.clientX - active.clientX;
                var distanceY = touch.clientY - active.clientY;
                if (Math.sqrt(distanceX * distanceX + distanceY * distanceY) > LONG_PRESS_CANCEL_DISTANCE) {
                    cancelTimer();
                }
                break;
            }
        }, {passive: true});
        canvas.addEventListener('touchend', cancelTimer, {passive: true});
        canvas.addEventListener('touchcancel', cancelTimer, {passive: true});
        cheatState.longPressInstalled = true;
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
                var shouldColorCities = cheatState.factionColors && cheatState.mainMapVisible;
                var shouldColorBattle = global.baye && baye.data && isBattleActive(baye.data);
                if (
                    (shouldColorCities || shouldColorBattle) &&
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
                        if (shouldColorCities) {
                            colorizePixelData(
                                pixels,
                                width,
                                height,
                                global.dotSize,
                                global.dotSize
                            );
                        }
                        if (shouldColorBattle) {
                            colorizePlayerBattleUnits(
                                pixels,
                                width,
                                height,
                                global.dotSize,
                                global.dotSize
                            );
                        }
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

    /**
     * 安装仅在战斗期间生效的 2x 定时管线。
     *
     * 原版关闭战斗动画后仍有伤害数字、状态闪烁和敌军移动等固定等待，这些等待最终都
     * 经过 Emscripten 的 safeSetTimeout。这里只在有效战斗中缩短等待，主地图、内政、
     * 存档和菜单操作保持原速度；切回 1x 后立即恢复原超时值。
     */
    function installBattleSpeedPipeline() {
        if (cheatState.battleSpeedPipelineInstalled) return;
        var originalSafeSetTimeout = global.safeSetTimeout;
        if (typeof originalSafeSetTimeout !== 'function') return;
        global.safeSetTimeout = function (callback, delay) {
            var adjustedDelay = delay;
            try {
                if (
                    cheatState.battleSpeed2x && typeof delay === 'number' && delay > 0 &&
                    global.baye && baye.data && isBattleActive(baye.data)
                ) {
                    adjustedDelay = delay / 2;
                }
            } catch (_) {
                adjustedDelay = delay;
            }
            return originalSafeSetTimeout(callback, adjustedDelay);
        };
        cheatState.battleSpeedPipelineInstalled = true;
    }

    /**
     * 接管单个战场单位绘制，为我方单位写入专用调色标记。
     *
     * @param {Object} hooks 游戏 Hook 集合。
     */
    function installBattleUnitDrawing(hooks) {
        var original = hooks.drawOneGeneral;
        hooks.drawOneGeneral = function (context) {
            var generalIndex = Number(context.index);
            var originalColor = baye.data.g_paintColor;
            try {
                if (Number.isInteger(generalIndex) && generalIndex < PLAYER_GENERAL_LIMIT) {
                    baye.data.g_paintColor = PLAYER_UNIT_MARKER_COLOR;
                }
                if (original) return original(context);
                baye.drawImage(context.x, context.y, 5, 0, context.pic, 1);
            } finally {
                baye.data.g_paintColor = originalColor;
            }

            var position = baye.data.g_GenPos[generalIndex];
            if (position && (position.state === STATE_SILENCED || position.state === STATE_IMMOBILIZED)) {
                var statusPicture = position.state === STATE_SILENCED ? 2 : 4;
                baye.drawImage(
                    context.x,
                    context.y,
                    34,
                    0,
                    statusPicture + Number(context.frame || 0),
                    1
                );
            }
            return 0;
        };
    }

    /** 安装战斗、内政作弊和地图增强 Hook，重复调用不会重复包装。 */
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
        installOverrideHook(hooks, 'countMove', function (context) {
            var generalIndex = Number(context.generalIndex);
            if (
                !cheatState.freeMovement || !Number.isInteger(generalIndex) ||
                generalIndex < 0 || generalIndex >= PLAYER_GENERAL_LIMIT ||
                !baye.data.g_GenPos || !baye.data.g_GenPos[generalIndex]
            ) {
                return false;
            }
            baye.data.g_GenPos[generalIndex].move = MAX_BATTLE_MOVE;
            return true;
        });
        installOverrideHook(hooks, 'countLandResistance', function (context) {
            var generalIndex = Number(context.generalIndex);
            var resistance = context.result;
            if (
                !cheatState.freeMovement || !Number.isInteger(generalIndex) ||
                generalIndex < 0 || generalIndex >= PLAYER_GENERAL_LIMIT ||
                !resistance || typeof resistance.length !== 'number'
            ) {
                return false;
            }
            for (var index = 0; index < resistance.length; index++) {
                resistance[index] = MOVEMENT_TERRAIN_COST;
            }
            return true;
        });
        installObserverHook(hooks, 'battleStage4', function () {
            cheatState.battleFoodSnapshot = cheatState.foodProtection && baye.data.g_FgtParam
                ? baye.data.g_FgtParam.MProvender
                : null;
        });
        installObserverHook(hooks, 'battleStage5', function () {
            var snapshot = cheatState.battleFoodSnapshot;
            cheatState.battleFoodSnapshot = null;
            if (
                cheatState.foodProtection && typeof snapshot === 'number' &&
                baye.data.g_FgtParam && baye.data.g_FgtParam.MProvender < snapshot
            ) {
                baye.data.g_FgtParam.MProvender = snapshot;
            }
        });
        installObserverHook(hooks, 'tacticStage4', protectCityFoodShortage);
        installObserverHook(hooks, 'didOpenNewGame', applyPersistentGeneralEffects);
        installObserverHook(hooks, 'didLoadGame', applyPersistentGeneralEffects);
        installObserverHook(hooks, 'exitBattle', function () {
            if (cheatState.postBattleAutomation) {
                cheatState.postBattleAutomationPending = true;
            }
        });
        installBattleUnitDrawing(hooks);

        var originalMapHook = hooks.didShowMainMap;
        hooks.didShowMainMap = function (context) {
            var hookResult = originalMapHook ? originalMapHook(context) : 1;
            cheatState.mainMapVisible = true;
            global.requestAnimationFrame(colorizeCityIcons);
            if (cheatState.postBattleAutomationPending) {
                cheatState.postBattleAutomationPending = false;
                runPostBattleAutomation();
            }
            return hookResult;
        };
        installEnemyCityLongPress();
        installBattleSpeedPipeline();
        cheatState.hooksInstalled = true;
        applyPersistentGeneralEffects();
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
     * 安装一次性菜单选择 Hook，并在超时后恢复原 Hook。
     *
     * @param {string} hookName 菜单 Hook 名称。
     * @param {number} selection 需要直接返回的菜单序号。
     * @return {boolean} 是否安装成功。
     */
    function installOneShotMenuSelection(hookName, selection) {
        var hooks = baye.hooks || (baye.hooks = {});
        var original = hooks[hookName];
        var oneShotHook;
        var restore = function () {
            if (hooks[hookName] !== oneShotHook) return;
            if (original) {
                hooks[hookName] = original;
            } else {
                delete hooks[hookName];
            }
            cheatState.endTurnPending = false;
        };
        oneShotHook = function () {
            restore();
            return selection;
        };
        hooks[hookName] = oneShotHook;
        global.setTimeout(restore, 2000);
        return true;
    }

    /**
     * 处理三国霸业按钮面板的专属命令。
     *
     * @param {string} action 固定控制动作。
     * @return {string} 结构化执行结果。
     */
    function handleControl(action) {
        start();
        if (action === 'toggleBattleSpeed') {
            cheatState.battleSpeed2x = !cheatState.battleSpeed2x;
            savePersistentCheatState();
            return result(true, cheatState.battleSpeed2x ? '战斗速度已切换为 2x' : '战斗速度已切换为 1x');
        }

        var context = gameContext();
        if (!context) return result(false, '请先开始或载入一局游戏');
        if (action === 'battleInfo') {
            if (!isBattleActive(context.data)) return result(false, '当前不在战斗中');
            sendKey(VK_SEARCH);
            return result(true, '正在打开战场形势');
        }
        if (action === 'endTurn') {
            if (cheatState.quickSavePending) return result(false, '正在打开存档界面，请稍候');
            if (cheatState.endTurnPending) return result(false, '正在结束当前回合');
            cheatState.endTurnPending = true;
            installOneShotMenuSelection(
                isBattleActive(context.data) ? 'fightOpenMainMenu' : 'mainSystemMenu',
                0
            );
            sendKey(VK_EXIT);
            return result(true, isBattleActive(context.data) ? '正在结束我方战斗回合' : '正在结束本月策略');
        }
        return result(false, '未知的面板操作');
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
            if (action === 'sgby_max_all') {
                var maximizedCities = maximizeOwnedCities(context);
                return result(true, '已将 ' + maximizedCities + ' 座我方城池资源和发展一键拉满');
            }
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
                cheatState.autoMaxGenerals = !cheatState.autoMaxGenerals;
                if (cheatState.autoMaxGenerals) {
                    context.ownedPeople.forEach(function (entry) {
                        maximizeGeneral(entry.value, context.data);
                    });
                }
                savePersistentCheatState();
                return result(
                    true,
                    cheatState.autoMaxGenerals
                        ? '武将自动满属性已开启，并已应用到现有我方武将'
                        : '武将自动满属性已关闭'
                );
            }
            if (action === 'sgby_free_movement') {
                cheatState.freeMovement = !cheatState.freeMovement;
                savePersistentCheatState();
                return result(
                    true,
                    cheatState.freeMovement
                        ? '全员移动 8 步已开启，不受地形、兵种和装备限制'
                        : '全员移动 8 步已关闭'
                );
            }
            if (action === 'sgby_food_protection') {
                cheatState.foodProtection = !cheatState.foodProtection;
                cheatState.battleFoodSnapshot = null;
                savePersistentCheatState();
                return result(
                    true,
                    cheatState.foodProtection
                        ? '粮草保护已开启：战斗不耗我方粮草，城池缺粮不再减兵'
                        : '粮草保护已关闭'
                );
            }
            if (action === 'sgby_search_city') {
                var searchResult = searchAllOwnedCities(context);
                return result(
                    true,
                    '已搜索全部 ' + context.ownedCities.length + ' 座我方城池，搜出隐藏人物 ' +
                    searchResult.people + ' 名、隐藏物品 ' + searchResult.tools + ' 件'
                );
            }
            if (action === 'sgby_recruit_captives') {
                var recruitCity = selectedOwnedCity(context);
                if (!recruitCity) return result(false, '请先在主地图选中一座我方城池');
                var recruited = recruitCaptives(context, [recruitCity]);
                return result(true, '已招降当前城池全部俘虏，共 ' + recruited + ' 名，忠诚均为 100');
            }
            if (action === 'sgby_post_battle_automation') {
                cheatState.postBattleAutomation = !cheatState.postBattleAutomation;
                if (!cheatState.postBattleAutomation) {
                    cheatState.postBattleAutomationPending = false;
                }
                savePersistentCheatState();
                return result(
                    true,
                    cheatState.postBattleAutomation
                        ? '战后自动处理已开启'
                        : '战后自动处理已关闭'
                );
            }
            if (action === 'sgby_execute_captives') {
                var executeCity = selectedOwnedCity(context);
                if (!executeCity) return result(false, '请先在主地图选中一座我方城池');
                var captives = cityPersonIndexes(context, executeCity).filter(function (personIndex) {
                    var person = context.people[personIndex];
                    return person && person.Belong === CAPTIVE_BELONG;
                });
                captives.forEach(function (personIndex) {
                    var captive = context.people[personIndex];
                    if (captive.Tool1 > 0) baye.putToolInCity(executeCity.index, captive.Tool1 - 1, false);
                    if (captive.Tool2 > 0) baye.putToolInCity(executeCity.index, captive.Tool2 - 1, false);
                    baye.deletePersonInCity(executeCity.index, personIndex);
                });
                return result(true, '已处斩当前城池全部俘虏，共 ' + captives.length + ' 名，装备已收入城池');
            }
            if (action === 'sgby_invincible') {
                cheatState.invincible = !cheatState.invincible;
                savePersistentCheatState();
                return result(true, cheatState.invincible ? '我方无敌已开启' : '我方无敌已关闭');
            }
            if (action === 'sgby_one_hit_kill') {
                cheatState.oneHitKill = !cheatState.oneHitKill;
                savePersistentCheatState();
                return result(true, cheatState.oneHitKill ? '一击必杀已开启' : '一击必杀已关闭');
            }
            if (action === 'sgby_faction_colors') {
                cheatState.factionColors = !cheatState.factionColors;
                saveFactionColorSetting(cheatState.factionColors);
                savePersistentCheatState();
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
                maximizeGeneral(person, context.data);
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
            freeMovement: cheatState.freeMovement,
            autoMaxGenerals: cheatState.autoMaxGenerals,
            foodProtection: cheatState.foodProtection,
            battleSpeed2x: cheatState.battleSpeed2x,
            postBattleAutomation: cheatState.postBattleAutomation,
            factionColors: cheatState.factionColors
        });
    }

    global.BbkSgby = {
        start: start,
        openSaveMenu: openSaveMenu,
        onSaveCompleted: onSaveCompleted,
        handleControl: handleControl,
        applyCheat: applyCheat,
        getCheatState: getCheatState,
        getCheatData: getCheatData
    };

    installDisplayPipeline();
})(this);
