;(function (global) {
    'use strict';

    var ARM_NAMES = ['骑兵', '步兵', '弓兵', '水兵', '极兵', '玄兵'];
    var MAX_BATTLE_MOVE = 8;
    var PLAYER_GENERAL_LIMIT = 10;
    var TOTAL_GENERAL_LIMIT = 20;
    var STATE_NORMAL = 0;
    var STATE_CONFUSED = 1;
    var STATE_SILENCED = 2;
    var STATE_IMMOBILIZED = 3;
    var STATE_STONE = 6;
    var STATE_DEAD = 8;
    var ACTION_WAITING = 0;
    var BATTLE_RUNNING = 0;
    var BATTLE_WIN = 1;
    var BATTLE_MODE_PLAYER_DEFENCE = 0;
    var BATTLE_MODE_PLAYER_ATTACK = 1;
    var BATTLE_MODE_AUTO = 2;
    var CAPTIVE_BELONG = 0xffff;
    var CAPTIVE_ACTION_RECRUIT = 'recruit';
    var CAPTIVE_ACTION_EXECUTE = 'execute';
    var CAPTIVE_ACTION_EXILE = 'exile';
    var SEARCH_OUTCOME_NONE = 'none';
    var SEARCH_OUTCOME_ALL = 'all';
    var BATTLE_LOSER_OUTCOME_ORIGINAL = 'original';
    var BATTLE_LOSER_OUTCOME_DEATH = 'death';
    var BATTLE_LOSER_OUTCOME_CAPTIVE = 'captive';
    var BATTLE_LOSER_OUTCOME_ESCAPE = 'escape';
    var BATTLE_LOSER_OUTCOME_WILD = 'wild';
    var FOUND_GOODS_MASK = 0x8000;
    var MOVEMENT_TERRAIN_COST = 0x81;
    var BATTLE_COMMAND = 27;
    var AUTO_EXPEDITION_FOOD = 5000;
    var NORMAL_ATTACK_COMMAND = 0;
    var REST_COMMAND = 3;
    var GAME_SPEED_MULTIPLIERS = [1, 2, 3, 4, 6, 8];
    var NORMAL_ATTACK_RANGE_SIZE = 7;
    var NORMAL_ATTACK_DISTANCE = 3;
    var FIGHT_PATH_SIZE = 15;
    var BLOCKED_FIGHT_PATH = 0x80;
    var AUTO_BATTLE_KEY_DELAY_MS = 220;
    var AUTO_BATTLE_STAGE_DELAY_MS = 420;
    var AUTO_BATTLE_ACTION_DELAY_MS = 1600;
    var DEFAULT_WORLD_ACTIVITY = 50;
    var MIN_WORLD_ACTIVITY = 0;
    var MAX_WORLD_ACTIVITY = 100;
    var GENERAL_CON_RESOURCE_ID = 63;
    var RESOURCE_HEADER_SIZE = 14;
    var RESOURCE_INDEX_SIZE = 8;
    var SEARCH_CONDITION_SIZE = 4;
    var LONG_PRESS_DELAY_MS = 600;
    var LONG_PRESS_CANCEL_DISTANCE = 12;
    var PLAYER_UNIT_MARKER_COLOR = 0x80;
    var PLAYER_UNIT_MARKER_CHANNEL = 0x7f;
    var PLAYER_UNIT_MARKER_ALPHA = 0x80;
    var PLAYER_UNIT_RED = [211, 47, 47];
    var CITY_ROAD_COLOR = [126, 132, 138];
    var CITY_COUNT_COLOR = [255, 255, 255];
    var CITY_COUNT_SHADOW_COLOR = [0, 0, 0];
    // 3×5 点阵字体；每一项的低三位依次表示该行从左到右的三个像素。
    var CITY_COUNT_DIGITS = [
        [7, 5, 5, 5, 7], [2, 6, 2, 2, 7], [7, 1, 7, 4, 7], [7, 1, 7, 1, 7],
        [5, 5, 7, 1, 1], [7, 4, 7, 1, 7], [7, 4, 7, 5, 7], [7, 1, 1, 1, 1],
        [7, 5, 7, 5, 7], [7, 5, 7, 1, 7]
    ];
    var ATTACK_SUBDUE_MODIFIERS = [
        [1.0, 1.2, 0.8, 1.0, 0.7, 1.3],
        [0.8, 1.0, 1.2, 1.0, 0.6, 1.2],
        [1.2, 0.8, 1.0, 1.0, 1.1, 1.2],
        [1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
        [1.1, 1.3, 0.9, 1.0, 1.0, 1.5],
        [0.6, 0.6, 0.6, 0.6, 0.6, 0.6]
    ];
    // 三个内置资源版本的 CITY_LINKR 数据一致；每对编号表示一条实际可行军连接。
    var CITY_CONNECTIONS = [
        [0, 3], [1, 2], [1, 7], [1, 6], [3, 8], [4, 5], [4, 10],
        [5, 6], [5, 11], [6, 12], [7, 13], [8, 9], [8, 14], [9, 10],
        [10, 15], [10, 20], [10, 14], [11, 12], [11, 15], [12, 13],
        [12, 16], [13, 18], [13, 17], [14, 20], [14, 19], [15, 16],
        [15, 21], [16, 22], [17, 18], [17, 22], [19, 24], [20, 21],
        [20, 26], [21, 22], [22, 23], [22, 29], [22, 28], [24, 25],
        [24, 31], [24, 30], [26, 27], [26, 33], [26, 32], [27, 28],
        [27, 33], [28, 34], [29, 34], [31, 32], [32, 35], [33, 34],
        [33, 36], [34, 37], [35, 36], [36, 37]
    ];
    var FACTION_COLOR_STORAGE_KEY = 'bbk/sgbyFactionColors';
    var CHEAT_STATE_STORAGE_KEY = 'baye/bbkSgbyCheatState';
    var SEARCH_HISTORY_STORAGE_KEY = 'baye/bbkSgbySearchHistory';
    var SEARCH_HISTORY_LIMIT = 50;
    var persistedCheatState = loadPersistentCheatState();
    var persistedBattleSpeed = resolvePersistedBattleSpeed(persistedCheatState);

    var cheatState = {
        invincible: persistedCheatState.invincible === true,
        oneHitKill: persistedCheatState.oneHitKill === true,
        wideGroupAttack: persistedCheatState.wideGroupAttack === true,
        freeMovement: persistedCheatState.freeMovement === true,
        autoMaxGenerals: persistedCheatState.autoMaxGenerals === true,
        autoMaxCities: persistedCheatState.autoMaxCities === true,
        foodProtection: persistedCheatState.foodProtection === true,
        autoBattle: persistedCheatState.autoBattle === true,
        autoEndTurn: persistedCheatState.autoEndTurn === true,
        attackAnyCity: persistedCheatState.attackAnyCity === true,
        enemyEscapeRoute: persistedCheatState.enemyEscapeRoute === true,
        animationsDisabled: persistedCheatState.animationsDisabled === true,
        battleSpeedMultiplier: persistedBattleSpeed,
        postBattleAutomation: persistedCheatState.postBattleAutomation === true,
        postBattleCaptiveAction: resolvePostBattleCaptiveAction(persistedCheatState),
        searchOutcome: resolveSearchOutcome(persistedCheatState),
        battleLoserOutcome: resolveBattleLoserOutcome(persistedCheatState),
        factionColors: typeof persistedCheatState.factionColors === 'boolean'
            ? persistedCheatState.factionColors
            : loadFactionColorSetting(),
        hooksInstalled: false,
        longPressInstalled: false,
        battleSpeedPipelineInstalled: false,
        endTurnPending: false,
        quickSavePending: false,
        battleFoodSnapshot: null,
        cityFoodConsumptionSnapshot: null,
        postBattleAutomationPending: false,
        postBattleSource: null,
        battleCaptiveSnapshot: null,
        initializationTimer: null,
        mainMapVisible: false,
        mainMapRoadsVisible: false,
        groupAttackTargeting: null,
        selfGroupTouchInstalled: false,
        expeditionFoodSelection: null,
        quickExpedition: null,
        autoBattlePlayerStage: false,
        autoBattleRunId: 0,
        autoBattleGeneralIndex: -1,
        autoBattleForceRestIndex: -1,
        autoBattleMoveReadyIndex: -1,
        autoBattleActionIndex: -1,
        autoBattleEndTurnIssued: false,
        autoBattleEndTurnPending: false,
        autoBattleEndTurnRestore: null
    };
    var generalConditionCache = null;
    var autoBattleHooks = null;
    var autoBattleOriginalChooseAction = null;
    var autoBattleChooseActionHook = null;
    var autoEndTurnHooks = null;
    var autoEndTurnOriginalTacticStageUser = null;
    var autoEndTurnOriginalMainSystemMenu = null;
    var autoEndTurnTacticStageUserHook = null;
    var autoEndTurnMainSystemMenuHook = null;
    var engineSendKey = null;

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
     * 将 Flutter 传入的世界活跃度写入引擎配置。
     *
     * 非有限值回退到默认值，其他值取整并限制到 0～100。旧版 WASM 没有对应字段时
     * 返回 false，调用方可继续使用引擎默认策略，不会写入未知内存。
     *
     * @param {*} value 待设置的世界活跃度。
     * @return {boolean} 是否已写入引擎。
     */
    function setWorldActivity(value) {
        var normalized = Number(value);
        if (!Number.isFinite(normalized)) normalized = DEFAULT_WORLD_ACTIVITY;
        normalized = Math.max(
            MIN_WORLD_ACTIVITY,
            Math.min(MAX_WORLD_ACTIVITY, Math.round(normalized))
        );
        start();
        if (
            !global.baye || !baye.data || !baye.data.g_engineConfig ||
            typeof baye.data.g_engineConfig.aiWorldActivity === 'undefined'
        ) {
            return false;
        }
        baye.data.g_engineConfig.aiWorldActivity = normalized;
        return true;
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

    /**
     * 兼容读取新版倍率和旧版 battleSpeed2x 布尔字段。
     *
     * @param {Object} state 本地持久状态。
     * @return {number} 已校验的全局游戏速度倍率。
     */
    function resolvePersistedBattleSpeed(state) {
        var multiplier = Number(state.battleSpeedMultiplier);
        if (GAME_SPEED_MULTIPLIERS.indexOf(multiplier) >= 0) {
            return multiplier;
        }
        return state.battleSpeed2x === false ? 1 : 2;
    }

    /** @return {number} 当前全局游戏速度的下一档倍率。 */
    function nextGameSpeedMultiplier(current) {
        var index = GAME_SPEED_MULTIPLIERS.indexOf(current);
        return index < 0 || index >= GAME_SPEED_MULTIPLIERS.length - 1
            ? GAME_SPEED_MULTIPLIERS[0]
            : GAME_SPEED_MULTIPLIERS[index + 1];
    }

    /**
     * 兼容读取战后俘虏处理方式。旧状态没有该字段时保持原来的“全部招降”行为。
     *
     * @param {Object} state 本地持久状态。
     * @return {string} recruit、execute 或 exile。
     */
    function resolvePostBattleCaptiveAction(state) {
        var action = state.postBattleCaptiveAction;
        if (
            action === CAPTIVE_ACTION_RECRUIT || action === CAPTIVE_ACTION_EXECUTE ||
            action === CAPTIVE_ACTION_EXILE
        ) {
            return action;
        }
        return CAPTIVE_ACTION_RECRUIT;
    }

    /**
     * 兼容读取作弊搜索结果。旧版本固定搜出全部内容，因此缺失字段时保持原行为。
     *
     * @param {Object} state 本地持久状态。
     * @return {string} none 或 all。
     */
    function resolveSearchOutcome(state) {
        return state.searchOutcome === SEARCH_OUTCOME_NONE
            ? SEARCH_OUTCOME_NONE
            : SEARCH_OUTCOME_ALL;
    }

    /**
     * 兼容读取战败武将处理方式。缺失或损坏的数据必须回退原版算法，避免静默改写存档。
     *
     * @param {Object} state 本地持久状态。
     * @return {string} 已校验的战败处理方式。
     */
    function resolveBattleLoserOutcome(state) {
        var outcome = state.battleLoserOutcome;
        if (
            outcome === BATTLE_LOSER_OUTCOME_DEATH ||
            outcome === BATTLE_LOSER_OUTCOME_CAPTIVE ||
            outcome === BATTLE_LOSER_OUTCOME_ESCAPE ||
            outcome === BATTLE_LOSER_OUTCOME_WILD
        ) {
            return outcome;
        }
        return BATTLE_LOSER_OUTCOME_ORIGINAL;
    }

    /**
     * 把需要在 C 核心生效的持续作弊同步到引擎配置。
     *
     * 字段检测允许新版增强脚本配合旧 WASM 启动；此时只是不启用核心作弊，不会写入
     * 未知内存。自动守城与自动战斗共用一个持久开关，关闭后立即恢复手动选择守将。
     */
    function syncEngineCheatSettings() {
        if (!global.baye || !baye.data || !baye.data.g_engineConfig) return;
        var config = baye.data.g_engineConfig;
        if (typeof config.autoBattleDefense !== 'undefined') {
            config.autoBattleDefense = cheatState.autoBattle ? 1 : 0;
        }
        if (typeof config.playerAttackAnyCity !== 'undefined') {
            config.playerAttackAnyCity = cheatState.attackAnyCity ? 1 : 0;
        }
        if (typeof config.enemyEscapeRoute !== 'undefined') {
            config.enemyEscapeRoute = cheatState.enemyEscapeRoute ? 1 : 0;
        }
        if (typeof config.battleLoserOutcome !== 'undefined') {
            var values = {};
            values[BATTLE_LOSER_OUTCOME_ORIGINAL] = 0;
            values[BATTLE_LOSER_OUTCOME_DEATH] = 1;
            values[BATTLE_LOSER_OUTCOME_CAPTIVE] = 2;
            values[BATTLE_LOSER_OUTCOME_ESCAPE] = 3;
            values[BATTLE_LOSER_OUTCOME_WILD] = 4;
            config.battleLoserOutcome = values[cheatState.battleLoserOutcome] || 0;
        }
    }

    /** 将持续作弊开关写入本地存储，不保存临时锁和 Hook 运行状态。 */
    function savePersistentCheatState() {
        try {
            global.localStorage.setItem(CHEAT_STATE_STORAGE_KEY, JSON.stringify({
                version: 6,
                invincible: cheatState.invincible,
                oneHitKill: cheatState.oneHitKill,
                wideGroupAttack: cheatState.wideGroupAttack,
                freeMovement: cheatState.freeMovement,
                autoMaxGenerals: cheatState.autoMaxGenerals,
                autoMaxCities: cheatState.autoMaxCities,
                foodProtection: cheatState.foodProtection,
                autoBattle: cheatState.autoBattle,
                autoEndTurn: cheatState.autoEndTurn,
                attackAnyCity: cheatState.attackAnyCity,
                enemyEscapeRoute: cheatState.enemyEscapeRoute,
                animationsDisabled: cheatState.animationsDisabled,
                battleSpeedMultiplier: cheatState.battleSpeedMultiplier,
                battleSpeed2x: cheatState.battleSpeedMultiplier === 2,
                postBattleAutomation: cheatState.postBattleAutomation,
                postBattleCaptiveAction: cheatState.postBattleCaptiveAction,
                searchOutcome: cheatState.searchOutcome,
                battleLoserOutcome: cheatState.battleLoserOutcome,
                factionColors: cheatState.factionColors
            }));
        } catch (_) {
            // localStorage 不可用时仍保留当前运行周期内的状态。
        }
    }

    /** @return {Array<Object>} 本地保存的搜索历史，异常数据按空列表处理。 */
    function loadSearchHistory() {
        try {
            var decoded = JSON.parse(global.localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY) || '[]');
            return Array.isArray(decoded) ? decoded : [];
        } catch (_) {
            return [];
        }
    }

    /**
     * 保存搜索历史并限制最大条数。
     *
     * @param {Array<Object>} records 搜索记录。
     */
    function saveSearchHistory(records) {
        try {
            global.localStorage.setItem(
                SEARCH_HISTORY_STORAGE_KEY,
                JSON.stringify(records.slice(0, SEARCH_HISTORY_LIMIT))
            );
        } catch (_) {
            // 搜索历史属于辅助信息，写入失败不影响游戏数据修改。
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
     * 读取小端无符号整数；越界时返回 null，避免损坏资源导致 DataView 异常中断游戏。
     *
     * @param {DataView} view LIB 数据视图。
     * @param {number} offset 字节偏移。
     * @param {number} size 整数宽度，只允许 1、2、4。
     * @return {number|null} 读取结果。
     */
    function readUnsignedLittleEndian(view, offset, size) {
        if (!Number.isInteger(offset) || offset < 0 || offset + size > view.byteLength) {
            return null;
        }
        if (size === 1) return view.getUint8(offset);
        if (size === 2) return view.getUint16(offset, true);
        if (size === 4) return view.getUint32(offset, true);
        return null;
    }

    /**
     * 同步读取当前版本的本地 LIB 文件。
     *
     * 游戏资源由应用内的 127.0.0.1 静态服务提供，读取只发生在首次全城搜索时。使用
     * x-user-defined 保留原始字节，兼容 Window 环境不允许同步 XHR 设置 arraybuffer 的限制。
     *
     * @param {string} path 当前资源库相对路径。
     * @return {Uint8Array|null} LIB 原始字节。
     */
    function loadLibraryBytes(path) {
        if (!path || typeof global.XMLHttpRequest !== 'function') return null;
        try {
            var request = new global.XMLHttpRequest();
            request.open('GET', path, false);
            if (typeof request.overrideMimeType === 'function') {
                request.overrideMimeType('text/plain; charset=x-user-defined');
            }
            request.send(null);
            if (request.status !== 0 && (request.status < 200 || request.status >= 300)) {
                return null;
            }
            var text = request.responseText || '';
            if (!text.length) return null;
            var bytes = new Uint8Array(text.length);
            for (var index = 0; index < text.length; index++) {
                bytes[index] = text.charCodeAt(index) & 0xff;
            }
            return bytes;
        } catch (_) {
            return null;
        }
    }

    /**
     * 解析当前剧本的武将出现条件（资源 63）。
     *
     * 同时兼容定长资源项和带 RIDX 索引的变长资源项。解析结果按“资源路径+剧本编号”
     * 缓存，后续每月自动搜索不会重复读取约 2MB 的本地资源库。
     *
     * @param {Object} context 当前游戏上下文。
     * @return {Array<Object>} 与人物数组序号一致的出现条件。
     */
    function generalSearchConditions(context) {
        var path = global.localStorage.getItem('baye/libpath') || '';
        var period = Number(context.data.g_PIdx);
        if (!Number.isInteger(period) || period < 1) return [];
        var cacheKey = path + '#' + period;
        if (generalConditionCache && generalConditionCache.key === cacheKey) {
            return generalConditionCache.conditions;
        }
        var bytes = loadLibraryBytes(path);
        if (!bytes) return [];
        try {
            var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            var tableOffset = (GENERAL_CON_RESOURCE_ID - 1) * 4;
            var resourceOffset = readUnsignedLittleEndian(view, tableOffset, 4);
            if (resourceOffset == null || resourceOffset + RESOURCE_HEADER_SIZE > view.byteLength) {
                return [];
            }
            var resourceId = readUnsignedLittleEndian(view, resourceOffset + 4, 2);
            var itemCount = readUnsignedLittleEndian(view, resourceOffset + 6, 2);
            var itemLength = readUnsignedLittleEndian(view, resourceOffset + 8, 4);
            var resourceKey = readUnsignedLittleEndian(view, resourceOffset + 12, 1);
            if (
                resourceId !== GENERAL_CON_RESOURCE_ID || resourceKey !== 0 ||
                period > itemCount
            ) {
                return [];
            }
            var itemOffset;
            var selectedItemLength;
            if (itemLength > 0) {
                itemOffset = resourceOffset + RESOURCE_HEADER_SIZE + (period - 1) * itemLength;
                selectedItemLength = itemLength;
            } else {
                var indexOffset = resourceOffset + RESOURCE_HEADER_SIZE +
                    (period - 1) * RESOURCE_INDEX_SIZE;
                var relativeOffset = readUnsignedLittleEndian(view, indexOffset, 4);
                selectedItemLength = readUnsignedLittleEndian(view, indexOffset + 4, 4);
                if (relativeOffset == null || selectedItemLength == null) return [];
                itemOffset = resourceOffset + relativeOffset;
            }
            if (
                itemOffset < 0 || selectedItemLength < SEARCH_CONDITION_SIZE ||
                itemOffset + selectedItemLength > view.byteLength
            ) {
                return [];
            }
            var count = Math.min(
                context.people.length,
                Math.floor(selectedItemLength / SEARCH_CONDITION_SIZE)
            );
            var conditions = [];
            for (var personIndex = 0; personIndex < count; personIndex++) {
                var offset = itemOffset + personIndex * SEARCH_CONDITION_SIZE;
                conditions.push({
                    birth: readUnsignedLittleEndian(view, offset, 1) || 0,
                    bole: readUnsignedLittleEndian(view, offset + 1, 2) || 0,
                    city: readUnsignedLittleEndian(view, offset + 3, 1) || 0
                });
            }
            generalConditionCache = {key: cacheKey, conditions: conditions};
            return conditions;
        } catch (_) {
            return [];
        }
    }

    /**
     * 将尚未到出生年份、但出生地已属于玩家的武将提前加入对应城池的人才队列。
     *
     * 已在任意城池队列中的人物不会重复添加；出生地为 0 的随机人物稳定分配到一座
     * 我方城池。这里只让人物进入原版“隐藏/可搜索”状态，真正归属仍由搜索流程修改。
     *
     * @param {Object} context 当前游戏上下文。
     * @return {number} 新加入人才队列的人数。
     */
    function materializeFutureGenerals(context) {
        var conditions = generalSearchConditions(context);
        if (!conditions.length || typeof baye.putPersonInCity !== 'function') return 0;
        var cityIndexes = personCityIndexes(context);
        var currentYear = Number(context.data.g_YearDate) || 0;
        var added = 0;
        for (var personIndex = 0; personIndex < conditions.length; personIndex++) {
            var condition = conditions[personIndex];
            var person = context.people[personIndex];
            if (
                !condition || condition.birth <= 0 ||
                condition.birth + 16 <= currentYear || !person || person.Belong !== 0 ||
                cityIndexes[personIndex] != null
            ) {
                continue;
            }
            var cityIndex;
            if (condition.city === 0) {
                cityIndex = context.ownedCities[personIndex % context.ownedCities.length].index;
            } else {
                cityIndex = context.data.g_engineConfig.fixCityOffset
                    ? condition.city - 1
                    : condition.city;
            }
            if (
                !Number.isInteger(cityIndex) || cityIndex < 0 ||
                cityIndex >= context.cities.length ||
                context.cities[cityIndex].Belong !== context.ruler
            ) {
                continue;
            }
            baye.putPersonInCity(cityIndex, personIndex);
            cityIndexes[personIndex] = cityIndex;
            if (typeof person.Age === 'number') {
                person.Age = Math.max(16, Math.min(255, currentYear - condition.birth));
            }
            added++;
        }
        return added;
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
     * 读取当前正在执行命令的城外人物。
     *
     * 普通命令直接保存人物序号；出征命令的 `Person` 字段保存 30 组出征队列的槽位，
     * 每组由 10 个小端序 `PersonID` 组成，值为“人物序号 + 1”。旧存档修复必须排除
     * 这些正常暂离城市的人物，避免把执行命令者误判成幽灵人物。
     *
     * @param {Object} context 当前游戏上下文。
     * @return {Object<string, boolean>} 正在执行命令的人物序号集合。
     */
    function activeOrderPeople(context) {
        var active = {};
        var orders = context.data.g_OrderQueue;
        if (!orders || typeof orders.length !== 'number') return active;
        var personCount = context.people.length;
        if (typeof baye.getPersonCount === 'function') {
            var engineCount = Number(baye.getPersonCount());
            if (Number.isInteger(engineCount) && engineCount >= 0 && engineCount <= personCount) {
                personCount = engineCount;
            }
        }
        for (var orderIndex = 0; orderIndex < orders.length; orderIndex++) {
            var order = orders[orderIndex];
            if (!order || Number(order.OrderId) === 0xff) continue;
            if (Number(order.OrderId) !== BATTLE_COMMAND) {
                var personIndex = Number(order.Person);
                if (Number.isInteger(personIndex) && personIndex >= 0 && personIndex < personCount) {
                    active[personIndex] = true;
                }
                continue;
            }
            var slot = Number(order.Person);
            var fighters = context.data.FIGHTERS;
            if (!Number.isInteger(slot) || slot < 0 || slot >= 30 || !fighters) continue;
            var byteOffset = slot * PLAYER_GENERAL_LIMIT * 2;
            for (var fighterIndex = 0; fighterIndex < PLAYER_GENERAL_LIMIT; fighterIndex++) {
                var low = Number(fighters[byteOffset + fighterIndex * 2]) || 0;
                var high = Number(fighters[byteOffset + fighterIndex * 2 + 1]) || 0;
                var personId = low | (high << 8);
                personIndex = personId - 1;
                if (personId > 0 && personIndex < personCount) active[personIndex] = true;
            }
        }
        return active;
    }

    /**
     * 修复旧版本已经写入存档的人物队列和归属不一致。
     *
     * 修复严格依赖可证明的不变量：同一人物只能位于一座城市；有阵营但既不在城市、
     * 也不在命令队列的人物属于旧版战死残留；无主或君主引用失效的城市，仅在城内存在
     * 明确同阵营在任武将时恢复归属。完全空城被旧版清掉的原归属无法可靠反推，因此不
     * 猜测势力。修复后的太守立即按本城同阵营人物智力重算。
     */
    function repairLoadedGameState() {
        var context = gameContext();
        if (!context || typeof baye.deletePersonInCity !== 'function') return;
        var active = activeOrderPeople(context);
        var seen = {};
        var duplicateCount = 0;
        var repairedCityCount = 0;
        var orphanCount = 0;

        for (var cityIndex = 0; cityIndex < context.cities.length; cityIndex++) {
            var cityEntry = {index: cityIndex, value: context.cities[cityIndex]};
            cityPersonIndexes(context, cityEntry).forEach(function (personIndex) {
                if (!Number.isInteger(personIndex) || personIndex < 0 ||
                    personIndex >= context.people.length) return;
                if (seen[personIndex]) {
                    baye.deletePersonInCity(cityIndex, personIndex);
                    duplicateCount++;
                    return;
                }
                seen[personIndex] = true;
            });
        }

        for (cityIndex = 0; cityIndex < context.cities.length; cityIndex++) {
            var city = context.cities[cityIndex];
            cityEntry = {index: cityIndex, value: city};
            var indexes = cityPersonIndexes(context, cityEntry);
            var owner = Number(city.Belong) || 0;
            var ownerIndex = owner - 1;
            var ownerValid = owner > 0 && ownerIndex < context.people.length &&
                context.people[ownerIndex] && context.people[ownerIndex].Belong === owner;
            if (!ownerValid) {
                var counts = {};
                indexes.forEach(function (personIndex) {
                    var person = context.people[personIndex];
                    var belong = person ? Number(person.Belong) || 0 : 0;
                    if (belong > 0 && belong !== CAPTIVE_BELONG && belong <= context.people.length) {
                        counts[belong] = (counts[belong] || 0) + 1;
                    }
                });
                var inferredOwner = 0;
                var inferredCount = 0;
                Object.keys(counts).forEach(function (key) {
                    if (counts[key] > inferredCount) {
                        inferredOwner = Number(key);
                        inferredCount = counts[key];
                    }
                });
                if (!inferredOwner && ownerIndex >= 0 && ownerIndex < context.people.length) {
                    var ruler = context.people[ownerIndex];
                    var rulerBelong = ruler ? Number(ruler.Belong) || 0 : 0;
                    if (rulerBelong > 0 && rulerBelong !== CAPTIVE_BELONG &&
                        rulerBelong <= context.people.length) {
                        inferredOwner = rulerBelong;
                    }
                }
                if (inferredOwner > 0) {
                    city.Belong = inferredOwner;
                    owner = inferredOwner;
                    repairedCityCount++;
                }
            }
            var satrap = -1;
            indexes.forEach(function (personIndex) {
                var person = context.people[personIndex];
                if (!person || person.Belong !== owner) return;
                if (satrap < 0 || person.IQ > context.people[satrap].IQ) satrap = personIndex;
            });
            city.SatrapId = satrap < 0 ? 0 : satrap + 1;
        }

        for (var personIndex = 0; personIndex < context.people.length; personIndex++) {
            var person = context.people[personIndex];
            if (!person || seen[personIndex] || active[personIndex]) continue;
            var belong = Number(person.Belong) || 0;
            if (belong <= 0 || belong === CAPTIVE_BELONG || belong > context.people.length) continue;
            person.OldBelong = belong;
            person.Belong = CAPTIVE_BELONG;
            person.Arms = 0;
            person.Tool1 = 0;
            person.Tool2 = 0;
            orphanCount++;
        }
        if (duplicateCount || repairedCityCount || orphanCount) {
            postSystemNotice(
                true,
                '旧存档一致性修复：去重 ' + duplicateCount + ' 人，恢复 ' +
                repairedCityCount + ' 座城池归属，清理 ' + orphanCount + ' 名幽灵人物'
            );
        }
    }

    /**
     * 返回人物的将领列表分组。
     *
     * 当前在野和未来在野都要求人物仍为无所属；登场年份按原版资源中的出生年加 16
     * 计算。俘虏和已处死人物共用 0xffff 哨兵，不混入敌方或在野列表。
     *
     * @param {Object} context 当前游戏上下文。
     * @param {Object} person 人物数据。
     * @param {Object|null|undefined} condition 人物登场条件。
     * @return {string|null} Flutter 使用的固定分组值；不展示时返回 null。
     */
    function generalRosterGroup(context, person, condition) {
        if (person.Belong === context.ruler) return 'player';
        if (person.Belong === 0) {
            var birth = condition ? Number(condition.birth) || 0 : 0;
            var appearanceYear = birth > 0 ? birth + 16 : 0;
            return appearanceYear > Number(context.data.g_YearDate || 0)
                ? 'futureWild'
                : 'currentWild';
        }
        if (person.Belong === 0xffff) return null;
        return 'enemy';
    }

    /**
     * 返回当前剧本内可展示的我方、敌方、当前在野和未来在野武将。
     *
     * @return {string} JSON 数据。
     */
    function getCheatData() {
        var context = gameContext();
        if (!context) return result(false, '请先开始或载入一局游戏');
        try {
            var cityIndexes = personCityIndexes(context);
            var conditions = generalSearchConditions(context);
            var maxLevel = context.data.g_engineConfig.maxLevel || 20;
            var personCount = context.people.length;
            if (typeof baye.getPersonCount === 'function') {
                var enginePersonCount = Number(baye.getPersonCount());
                if (
                    Number.isInteger(enginePersonCount) && enginePersonCount >= 0 &&
                    enginePersonCount <= context.people.length
                ) {
                    personCount = enginePersonCount;
                }
            }
            var generals = [];
            for (var personIndex = 0; personIndex < personCount; personIndex++) {
                var person = context.people[personIndex];
                var personName = baye.getPersonName(personIndex);
                if (typeof personName !== 'string' || !personName.trim()) continue;
                var condition = conditions[personIndex];
                var group = person ? generalRosterGroup(context, person, condition) : null;
                if (!group) continue;
                var cityIndex = cityIndexes[personIndex];
                var cityName = cityIndex == null
                    ? '城外'
                    : (baye.getCityName(cityIndex) || '未知城池');
                if (
                    cityIndex == null &&
                    (group === 'currentWild' || group === 'futureWild') && condition
                ) {
                    if (condition.city === 0) {
                        cityName = '随机城池';
                    } else {
                        var conditionCityIndex = context.data.g_engineConfig.fixCityOffset
                            ? condition.city - 1
                            : condition.city;
                        if (
                            Number.isInteger(conditionCityIndex) && conditionCityIndex >= 0 &&
                            conditionCityIndex < context.cities.length
                        ) {
                            cityIndex = conditionCityIndex;
                            cityName = baye.getCityName(cityIndex) || '未知城池';
                        }
                    }
                }
                var birth = condition ? Number(condition.birth) || 0 : 0;
                var appearanceYear = birth > 0 ? birth + 16 : 0;
                var battleIndex = battleIndexOf(context.data, personIndex);
                var position = battleIndex >= 0
                    ? context.data.g_GenPos[battleIndex]
                    : null;
                generals.push({
                    index: personIndex,
                    name: personName,
                    group: group,
                    factionName: group === 'player' || group === 'enemy'
                        ? rulerNameForBelong(context.data, person.Belong)
                        : '在野',
                    isRuler: person.Belong === personIndex + 1,
                    appearanceYear: appearanceYear,
                    cityIndex: cityIndex == null ? 65535 : cityIndex,
                    cityName: cityName,
                    level: person.Level,
                    force: person.Force,
                    iq: person.IQ,
                    devotion: person.Devotion,
                    thew: person.Thew,
                    experience: person.Experience,
                    arms: person.Arms,
                    baseArmsType: person.ArmsType,
                    effectiveArmsType: baye.getArmType(personIndex),
                    inBattle: battleIndex >= 0,
                    battleMove: position ? position.move : 0,
                    battleHp: position ? position.hp : 0,
                    battleMp: position ? position.mp : 0,
                    battleState: position ? position.state : 0,
                    canAct: position ? position.active === 0 : false
                });
            }
            var groupOrder = {player: 0, enemy: 1, currentWild: 2, futureWild: 3};
            generals.sort(function (left, right) {
                if (groupOrder[left.group] !== groupOrder[right.group]) {
                    return groupOrder[left.group] - groupOrder[right.group];
                }
                if (left.cityIndex !== right.cityIndex) return left.cityIndex - right.cityIndex;
                if (left.isRuler !== right.isRuler) return left.isRuler ? -1 : 1;
                if (left.appearanceYear !== right.appearanceYear) {
                    return left.appearanceYear - right.appearanceYear;
                }
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
     * 搜出全部我方城池中的隐藏人物和物品，并提前加入尚未到出现年份的武将。
     *
     * @param {Object} context 当前游戏上下文。
     * @param {string} source 触发来源。
     * @param {Array<Object>} recruitedCities 本次招降的逐城结果。
     * @param {Object|null} battleSource 战斗来源快照；非战斗搜索传 null。
     * @return {{people:number, tools:number, cities:Array<Object>}} 搜索结果统计。
     */
    function searchAllOwnedCities(context, source, recruitedCities, battleSource) {
        var foundPeople = 0;
        var foundTools = 0;
        var cityResults = [];
        var cityResultByName = {};
        var goodsQueue = context.data.g_GoodsQueue;
        function cityResult(cityName) {
            var existing = cityResultByName[cityName];
            if (existing) return existing;
            var created = {
                cityName: cityName,
                people: [],
                tools: [],
                recruited: [],
                executed: [],
                exiled: []
            };
            cityResultByName[cityName] = created;
            cityResults.push(created);
            return created;
        }
        (recruitedCities || []).forEach(function (entry) {
            var resultEntry = cityResult(entry.cityName);
            resultEntry.recruited = (entry.recruited || []).slice();
            resultEntry.executed = (entry.executed || []).slice();
            resultEntry.exiled = (entry.exiled || []).slice();
        });
        if (cheatState.searchOutcome === SEARCH_OUTCOME_NONE) {
            appendSearchHistory(context, source, cityResults, battleSource);
            return {people: 0, tools: 0, cities: cityResults};
        }
        materializeFutureGenerals(context);
        context.ownedCities.forEach(function (cityEntry) {
            var cityName = baye.getCityName(cityEntry.index) || ('城池 ' + (cityEntry.index + 1));
            var personNames = [];
            var toolNames = [];
            cityPersonIndexes(context, cityEntry).forEach(function (personIndex) {
                var hiddenPerson = context.people[personIndex];
                if (!hiddenPerson || hiddenPerson.Belong !== 0) return;
                personNames.push(
                    baye.getPersonName(personIndex) || ('武将 ' + (personIndex + 1))
                );
                hiddenPerson.Belong = context.ruler;
                hiddenPerson.Devotion = 100;
                if (cheatState.autoMaxGenerals) maximizeGeneral(hiddenPerson, context.data);
                foundPeople++;
            });
            if (goodsQueue) {
                for (var toolOffset = 0; toolOffset < cityEntry.value.Tools; toolOffset++) {
                    var queueIndex = cityEntry.value.ToolQueue + toolOffset;
                    var queuedTool = goodsQueue[queueIndex];
                    if ((queuedTool & FOUND_GOODS_MASK) === 0) {
                        var toolIndex = queuedTool & 0x7fff;
                        toolNames.push(baye.getToolName(toolIndex) || ('物品 ' + (toolIndex + 1)));
                        goodsQueue[queueIndex] = queuedTool | FOUND_GOODS_MASK;
                        foundTools++;
                    }
                }
            }
            if (personNames.length || toolNames.length) {
                var resultEntry = cityResult(cityName);
                resultEntry.people = personNames;
                resultEntry.tools = toolNames;
            }
        });
        appendSearchHistory(context, source, cityResults, battleSource);
        return {people: foundPeople, tools: foundTools, cities: cityResults};
    }

    /**
     * 追加一次搜索或招降记录。
     *
     * @param {Object} context 当前游戏上下文。
     * @param {string} source 触发来源。
     * @param {Array<Object>} cityResults 逐城结果。
     * @param {Object|null} battleSource 战斗来源快照；旧记录和非战斗记录为空。
     */
    function appendSearchHistory(context, source, cityResults, battleSource) {
        var now = new Date();
        var records = loadSearchHistory();
        var peopleCount = 0;
        var toolCount = 0;
        var recruitedCount = 0;
        var executedCount = 0;
        var exiledCount = 0;
        cityResults.forEach(function (city) {
            peopleCount += (city.people || []).length;
            toolCount += (city.tools || []).length;
            recruitedCount += (city.recruited || []).length;
            executedCount += (city.executed || []).length;
            exiledCount += (city.exiled || []).length;
        });
        if (peopleCount + toolCount + recruitedCount + executedCount + exiledCount === 0) return;
        records.unshift({
            id: String(now.getTime()),
            timestamp: now.toISOString(),
            realTime: now.toLocaleString('zh-CN', {hour12: false}),
            gameTime: String(context.data.g_YearDate || 0) + '年' +
                String(context.data.g_MonthDate || 0) + '月',
            source: source || '手动搜索',
            battle: battleSource || null,
            peopleCount: peopleCount,
            toolCount: toolCount,
            recruitedCount: recruitedCount,
            executedCount: executedCount,
            exiledCount: exiledCount,
            cities: cityResults
        });
        saveSearchHistory(records);
    }

    /**
     * 生成可直接展示的逐城搜索摘要。
     *
     * @param {Array<Object>} cityResults 逐城搜索结果。
     * @return {string} 中文摘要。
     */
    function formatSearchDetails(cityResults) {
        if (!cityResults.length) return '未发现新的隐藏人物或物品';
        return cityResults.map(function (city) {
            var details = [];
            if (city.people.length) details.push('人物 ' + city.people.join('、'));
            if (city.tools.length) details.push('物品 ' + city.tools.join('、'));
            return city.cityName + '：' + details.join('；');
        }).join(' | ');
    }

    /**
     * 招降指定我方城池集合内的全部俘虏。
     *
     * @param {Object} context 当前游戏上下文。
     * @param {Array<{index:number,value:Object}>} cityEntries 需要处理的我方城池。
     * @return {{count:number,cities:Array<Object>}} 招降统计和逐城名单。
     */
    function recruitCaptives(context, cityEntries) {
        var recruited = 0;
        var cityResults = [];
        cityEntries.forEach(function (cityEntry) {
            var recruitedNames = [];
            cityPersonIndexes(context, cityEntry).forEach(function (personIndex) {
                var captive = context.people[personIndex];
                if (!captive || captive.Belong !== CAPTIVE_BELONG) return;
                recruitedNames.push(
                    baye.getPersonName(personIndex) || ('武将 ' + (personIndex + 1))
                );
                captive.Belong = context.ruler;
                captive.Devotion = 100;
                if (cheatState.autoMaxGenerals) maximizeGeneral(captive, context.data);
                recruited++;
            });
            if (recruitedNames.length) {
                cityResults.push({
                    cityName: baye.getCityName(cityEntry.index) || ('城池 ' + (cityEntry.index + 1)),
                    people: [],
                    tools: [],
                    recruited: recruitedNames,
                    executed: [],
                    exiled: []
                });
            }
        });
        return {count: recruited, cities: cityResults};
    }

    /**
     * 处斩指定我方城池中的全部俘虏，并按原版规则把装备收入俘虏所在城池。
     * 人物队列会在删除时整体移动，因此每座城先读取稳定快照，再逐个删除。
     *
     * @return {{count:number,cities:Array<Object>,label:string}} 处理统计。
     */
    function executeCaptives(context, cityEntries) {
        var count = 0;
        var cityResults = [];
        cityEntries.forEach(function (cityEntry) {
            var executedNames = [];
            cityPersonIndexes(context, cityEntry).forEach(function (personIndex) {
                var captive = context.people[personIndex];
                if (!captive || captive.Belong !== CAPTIVE_BELONG) return;
                executedNames.push(
                    baye.getPersonName(personIndex) || ('武将 ' + (personIndex + 1))
                );
                returnPersonEquipment(cityEntry.index, captive);
                baye.deletePersonInCity(cityEntry.index, personIndex);
                count++;
            });
            if (executedNames.length) {
                cityResults.push({
                    cityName: baye.getCityName(cityEntry.index) ||
                        ('城池 ' + (cityEntry.index + 1)),
                    people: [],
                    tools: [],
                    recruited: [],
                    executed: executedNames,
                    exiled: []
                });
            }
        });
        return {count: count, cities: cityResults, label: '处斩'};
    }

    /** 按原版战死规则把人物装备作为已发现物品放入所在城市。 */
    function returnPersonEquipment(cityIndex, person) {
        if (person.Tool1 > 0) baye.putToolInCity(cityIndex, person.Tool1 - 1, false);
        if (person.Tool2 > 0) baye.putToolInCity(cityIndex, person.Tool2 - 1, false);
        person.Tool1 = 0;
        person.Tool2 = 0;
    }

    /**
     * 处死全地图当前位于城市队列中的在野武将。
     *
     * 删除前把归属设为俘虏哨兵，防止未来武将补全逻辑把已处死人物再次加入地图；人物
     * 不在任何城市队列中，因此不会被招降俘虏功能重新找到。
     */
    function executeAllWildGenerals(context) {
        var count = 0;
        var cityResults = [];
        for (var cityIndex = 0; cityIndex < context.cities.length; cityIndex++) {
            var city = context.cities[cityIndex];
            var executedNames = [];
            var cityEntry = {index: cityIndex, value: city};
            cityPersonIndexes(context, cityEntry).forEach(function (personIndex) {
                var person = context.people[personIndex];
                if (!person || person.Belong !== 0) return;
                executedNames.push(
                    baye.getPersonName(personIndex) || ('武将 ' + (personIndex + 1))
                );
                returnPersonEquipment(cityIndex, person);
                person.OldBelong = 0;
                person.Belong = CAPTIVE_BELONG;
                person.Arms = 0;
                baye.deletePersonInCity(cityIndex, personIndex);
                count++;
            });
            if (executedNames.length) {
                cityResults.push({
                    cityName: baye.getCityName(cityIndex) || ('城池 ' + (cityIndex + 1)),
                    people: [],
                    tools: [],
                    recruited: [],
                    executed: executedNames,
                    exiled: []
                });
            }
        }
        appendSearchHistory(context, '全地图处死在野', cityResults, null);
        return {count: count, cities: cityResults};
    }

    /**
     * 搜出全地图所有城市队列中的在野武将。
     *
     * 有主城池中的人物加入当地势力；空城以人物队列中的第一名在野武将为新主公，其他
     * 人物加入该新势力。每座空城独立建国，不改变玩家君主，也不处理尚未进入地图队列
     * 的未来年份人物。
     */
    function searchAllWorldGenerals(context) {
        var found = 0;
        var newRulers = 0;
        var cityResults = [];
        for (var cityIndex = 0; cityIndex < context.cities.length; cityIndex++) {
            var city = context.cities[cityIndex];
            var cityEntry = {index: cityIndex, value: city};
            var wildIndexes = cityPersonIndexes(context, cityEntry).filter(function (personIndex) {
                var person = context.people[personIndex];
                return person && person.Belong === 0;
            });
            if (!wildIndexes.length) continue;

            var targetBelong = Number(city.Belong) || 0;
            if (!targetBelong) {
                targetBelong = wildIndexes[0] + 1;
                city.Belong = targetBelong;
                city.SatrapId = targetBelong;
                newRulers++;
            }
            var personNames = [];
            wildIndexes.forEach(function (personIndex) {
                var person = context.people[personIndex];
                personNames.push(
                    baye.getPersonName(personIndex) || ('武将 ' + (personIndex + 1))
                );
                person.OldBelong = 0;
                person.Belong = targetBelong;
                person.Devotion = 100;
                if (targetBelong === context.ruler && cheatState.autoMaxGenerals) {
                    maximizeGeneral(person, context.data);
                }
                found++;
            });
            cityResults.push({
                cityName: baye.getCityName(cityIndex) || ('城池 ' + (cityIndex + 1)),
                people: personNames,
                tools: [],
                recruited: [],
                executed: [],
                exiled: []
            });
        }
        appendSearchHistory(context, '全地图搜索', cityResults, null);
        return {count: found, newRulers: newRulers, cities: cityResults};
    }

    /**
     * 流放指定我方城池中的全部俘虏。
     *
     * 优先放入非我方城池，避免紧接着执行的我方全城搜索把刚流放的人再次归属我方。
     * 地图已没有非我方城池时保留俘虏，避免构造无法维持“在野”状态的伪流放。
     *
     * @return {{count:number,cities:Array<Object>,label:string}} 处理统计。
     */
    function exileCaptives(context, cityEntries) {
        var destinations = [];
        for (var cityIndex = 0; cityIndex < context.cities.length; cityIndex++) {
            if (context.cities[cityIndex].Belong !== context.ruler) destinations.push(cityIndex);
        }
        if (!destinations.length) return {count: 0, cities: [], label: '流放'};
        var occupiedDestinations = destinations.filter(function (cityIndex) {
            return context.cities[cityIndex].Persons > 0;
        });
        if (occupiedDestinations.length) destinations = occupiedDestinations;

        var count = 0;
        var cityResults = [];
        cityEntries.forEach(function (cityEntry) {
            var exiledNames = [];
            cityPersonIndexes(context, cityEntry).forEach(function (personIndex) {
                var captive = context.people[personIndex];
                if (!captive || captive.Belong !== CAPTIVE_BELONG) return;
                exiledNames.push(
                    baye.getPersonName(personIndex) || ('武将 ' + (personIndex + 1))
                );
                captive.Belong = 0;
                baye.deletePersonInCity(cityEntry.index, personIndex);
                var destination = destinations[Math.floor(Math.random() * destinations.length)];
                baye.putPersonInCity(destination, personIndex);
                count++;
            });
            if (exiledNames.length) {
                cityResults.push({
                    cityName: baye.getCityName(cityEntry.index) ||
                        ('城池 ' + (cityEntry.index + 1)),
                    people: [],
                    tools: [],
                    recruited: [],
                    executed: [],
                    exiled: exiledNames
                });
            }
        });
        return {count: count, cities: cityResults, label: '流放'};
    }

    /** 按持久化选择处理战后全部俘虏。 */
    function processPostBattleCaptives(context) {
        if (cheatState.postBattleCaptiveAction === CAPTIVE_ACTION_EXECUTE) {
            return executeCaptives(context, context.ownedCities);
        }
        if (cheatState.postBattleCaptiveAction === CAPTIVE_ACTION_EXILE) {
            return exileCaptives(context, context.ownedCities);
        }
        var recruited = recruitCaptives(context, context.ownedCities);
        recruited.label = '招降';
        return recruited;
    }

    /**
     * 自动拉满开关开启后，在策略结束时执行城池拉满和全城搜索。
     *
     * @param {string} source 搜索记录来源。
     * @param {boolean} showNotice 是否向 Flutter 显示底部提示。
     */
    function runAutoCityMaintenance(source, showNotice) {
        if (!cheatState.autoMaxCities) return;
        var context = gameContext();
        if (!context) return;
        var cityCount = maximizeOwnedCities(context);
        var searched = searchAllOwnedCities(context, source, [], null);
        if (showNotice && searched.people + searched.tools > 0) {
            postSystemNotice(
                true,
                source + '：已拉满 ' + cityCount + ' 座城池，搜出隐藏人物 ' +
                searched.people + ' 名、隐藏物品 ' + searched.tools + ' 件；详情见搜索记录'
            );
        }
    }

    /** 把“关闭动效”映射到原引擎的三个战斗显示选项。 */
    function applyAnimationSetting() {
        if (!global.baye || !baye.data) return;
        var enabled = cheatState.animationsDisabled ? 0 : 1;
        baye.data.g_LookEnemy = enabled;
        baye.data.g_LookMovie = enabled;
        baye.data.g_MoveSpeed = enabled;
    }

    /** 在新开局、载入存档或脚本初始化后重新应用需要写入引擎数据的持续作弊。 */
    function applyPersistentGeneralEffects() {
        syncEngineCheatSettings();
        applyAnimationSetting();
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

    /** 把会影响游戏控制面板的脚本状态主动同步给 Flutter。 */
    function postControlState() {
        if (!global.BbkSystemChannel) return;
        global.BbkSystemChannel.postMessage(JSON.stringify({
            type: 'sgby_control_state',
            data: {
                autoBattle: cheatState.autoBattle,
                autoEndTurn: cheatState.autoEndTurn,
                battleSpeedMultiplier: cheatState.battleSpeedMultiplier
            }
        }));
    }

    /**
     * 根据人物归属编号返回主公名。
     *
     * @param {Object} data 游戏数据。
     * @param {number} belong 人物或城池的归属编号，值为“主公数组序号 + 1”。
     * @return {string} 主公名；数据异常时返回兜底文案。
     */
    function rulerNameForBelong(data, belong) {
        var rulerIndex = Number(belong) - 1;
        if (!Number.isInteger(rulerIndex) || rulerIndex < 0 || rulerIndex >= data.g_Persons.length) {
            return '未知主公';
        }
        return baye.getPersonName(rulerIndex) || ('主公 ' + (rulerIndex + 1));
    }

    /** @return {number} 指定战场序号对应武将的归属编号；无效时返回 0。 */
    function battleGeneralBelong(data, battleIndex) {
        var personId = Number(data.g_FgtParam.GenArray[battleIndex]);
        var personIndex = personId - 1;
        var person = Number.isInteger(personIndex) && personIndex >= 0
            ? data.g_Persons[personIndex]
            : null;
        return person ? Number(person.Belong) || 0 : 0;
    }

    /**
     * 在战斗开始时快照方向、双方主公和城市。
     *
     * 战斗结算会立即改变城池归属，必须在 enterBattle 阶段保存原防守方；防守战的进攻
     * 主公则由敌方首名参战武将反查，不能在返回主地图后使用城池当前归属推断。
     *
     * @return {Object|null} 可持久化的战斗来源。
     */
    function captureBattleSource() {
        if (!global.baye || !baye.data || !baye.data.g_FgtParam) return null;
        var data = baye.data;
        var battle = data.g_FgtParam;
        var cityIndex = Number(battle.CityIndex);
        if (
            !Number.isInteger(cityIndex) || cityIndex < 0 ||
            !data.g_Cities || cityIndex >= data.g_Cities.length
        ) {
            return null;
        }
        var city = data.g_Cities[cityIndex];
        if (!city) return null;
        var mode = Number(battle.Mode);
        var playerBelong = Number(data.g_PlayerKing) + 1;
        var attackerBelong;
        var defenderBelong = Number(city.Belong) || 0;
        var direction;
        if (mode === BATTLE_MODE_PLAYER_ATTACK) {
            direction = 'playerAttack';
            attackerBelong = playerBelong;
        } else if (mode === BATTLE_MODE_PLAYER_DEFENCE) {
            direction = 'playerDefence';
            attackerBelong = battleGeneralBelong(data, PLAYER_GENERAL_LIMIT);
            defenderBelong = playerBelong;
        } else if (mode === BATTLE_MODE_AUTO) {
            direction = 'auto';
            attackerBelong = battleGeneralBelong(data, 0);
        } else {
            return null;
        }
        var cityName = baye.getCityName(cityIndex) || ('城池 ' + (cityIndex + 1));
        var attackerRulerName = rulerNameForBelong(data, attackerBelong);
        var defenderRulerName = rulerNameForBelong(data, defenderBelong);
        var source;
        if (direction === 'playerAttack') {
            source = '我方进攻「' + defenderRulerName + '」所属的「' + cityName + '」';
        } else if (direction === 'playerDefence') {
            source = '「' + attackerRulerName + '」进攻我方「' + cityName + '」';
        } else {
            source = '「' + attackerRulerName + '」进攻「' + defenderRulerName +
                '」所属的「' + cityName + '」';
        }
        return {
            direction: direction,
            cityName: cityName,
            attackerRulerName: attackerRulerName,
            defenderRulerName: defenderRulerName,
            source: source
        };
    }

    /**
     * 保存战斗开始前已经关押在目标城市的俘虏。
     *
     * 核心的 `GetCityPersons` 只返回在任武将，必死模式不会触及这些既有俘虏；增强层在
     * 城池确实易主后补齐处死，守城成功或战斗中止时不会误处理。
     */
    function captureBattleCityCaptives() {
        if (!global.baye || !baye.data || !baye.data.g_FgtParam) return null;
        var data = baye.data;
        var cities = data.g_Cities;
        var people = data.g_Persons;
        if (!cities || !people || !data.g_PersonsQueue) return null;
        var context = {data: data, cities: cities, people: people};
        var cityIndex = Number(data.g_FgtParam.CityIndex);
        if (!Number.isInteger(cityIndex) || cityIndex < 0 || cityIndex >= cities.length) {
            return null;
        }
        var city = cities[cityIndex];
        var cityEntry = {index: cityIndex, value: city};
        return {
            cityIndex: cityIndex,
            originalBelong: Number(city.Belong) || 0,
            personIndexes: cityPersonIndexes(context, cityEntry).filter(function (personIndex) {
                var person = context.people[personIndex];
                return person && person.Belong === CAPTIVE_BELONG;
            })
        };
    }

    /** 城破回到主地图后，补齐“必死”模式对战前既有俘虏的处理。 */
    function executeDefeatedCityCaptives() {
        var snapshot = cheatState.battleCaptiveSnapshot;
        cheatState.battleCaptiveSnapshot = null;
        if (!snapshot || cheatState.battleLoserOutcome !== BATTLE_LOSER_OUTCOME_DEATH) {
            return 0;
        }
        if (!global.baye || !baye.data) return 0;
        var data = baye.data;
        var cities = data.g_Cities;
        var people = data.g_Persons;
        if (
            !cities || !people || !data.g_PersonsQueue ||
            snapshot.cityIndex < 0 || snapshot.cityIndex >= cities.length
        ) {
            return 0;
        }
        var context = {data: data, cities: cities, people: people};
        var city = cities[snapshot.cityIndex];
        if (Number(city.Belong) === snapshot.originalBelong) return 0;
        var cityEntry = {index: snapshot.cityIndex, value: city};
        var currentIndexes = cityPersonIndexes(context, cityEntry);
        var count = 0;
        snapshot.personIndexes.forEach(function (personIndex) {
            var person = context.people[personIndex];
            if (
                !person || person.Belong !== CAPTIVE_BELONG ||
                currentIndexes.indexOf(personIndex) < 0
            ) {
                return;
            }
            returnPersonEquipment(snapshot.cityIndex, person);
            baye.deletePersonInCity(snapshot.cityIndex, personIndex);
            count++;
        });
        return count;
    }

    /** 战斗结算完成并回到主地图后执行一次自动处理。 */
    function runPostBattleAutomation(battleSource) {
        if (!cheatState.postBattleAutomation) return;
        var context = gameContext();
        if (!context) {
            postSystemNotice(false, '战后自动处理失败，请回到主地图后手动执行');
            return;
        }
        var cityCount = maximizeOwnedCities(context);
        var captiveResult = processPostBattleCaptives(context);
        var source = battleSource && battleSource.source ? battleSource.source : '战后自动';
        var searched = searchAllOwnedCities(
            context,
            source,
            captiveResult.cities,
            battleSource || null
        );
        if (captiveResult.count + searched.people + searched.tools === 0) return;
        postSystemNotice(
            true,
            source + '，战后自动处理完成：拉满 ' + cityCount + ' 座城池，' +
            captiveResult.label + ' ' + captiveResult.count +
            ' 人，搜出隐藏人物 ' + searched.people + ' 名、隐藏物品 ' + searched.tools +
            ' 件；详细人物和物品请查看搜索记录'
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
     * 安装出征粮草自动选择跟踪，只标记玩家发起的“出征”命令。
     *
     * @param {Object} hooks Hook 集合。
     */
    function installExpeditionFoodHook(hooks) {
        var original = hooks.cityMakeCommand;
        hooks.cityMakeCommand = function (context) {
            var hookResult = original ? original(context) : 2;
            if (hookResult === 0 || hookResult === 1) {
                cheatState.expeditionFoodSelection = null;
                return hookResult;
            }
            if (Number(context.commandIndex) !== BATTLE_COMMAND) {
                cheatState.expeditionFoodSelection = null;
                return hookResult == null ? 2 : hookResult;
            }

            var game = gameContext();
            var cityIndex = Number(context.cityIndex);
            var city = game && game.cities[cityIndex];
            if (!game || !city || city.Food <= 0) {
                cheatState.expeditionFoodSelection = null;
                return hookResult == null ? 2 : hookResult;
            }
            var availablePeople = 0;
            cityPersonIndexes(game, {index: cityIndex, value: city}).forEach(function (personIndex) {
                var person = game.people[personIndex];
                if (person && person.Belong === city.Belong) availablePeople++;
            });
            cheatState.expeditionFoodSelection = availablePeople > 0 ? {
                cityIndex: cityIndex,
                selectedCount: 0,
                maxSelections: Math.min(10, availablePeople)
            } : null;
            return hookResult == null ? 2 : hookResult;
        };
    }

    /**
     * 安装一键出征命令和选将 Hook。
     *
     * 普通流程返回 -1 交还原版菜单；仅按钮发起的一次流程跳过命令菜单，并在选将阶段
     * 选择第一名武将后立即结束。粮草仍复用既有数字框输入算法，目标城市不接管。
     */
    function installQuickExpeditionHooks(hooks) {
        var originalCityCommand = hooks.playerCityCommand;
        var originalChoosePerson = hooks.battleChoosePerson;
        hooks.playerCityCommand = function (context) {
            var quick = cheatState.quickExpedition;
            if (quick && Number(context.cityIndex) === quick.cityIndex) {
                return BATTLE_COMMAND;
            }
            return originalCityCommand ? originalCityCommand(context) : -1;
        };
        hooks.battleChoosePerson = function (context) {
            var quick = cheatState.quickExpedition;
            if (!quick || Number(context.cityIndex) !== quick.cityIndex) {
                return originalChoosePerson ? originalChoosePerson(context) : -1;
            }
            if (Number(context.selectionCount) === 0 && Number(context.availableCount) > 0) {
                return 0;
            }

            cheatState.quickExpedition = null;
            var expedition = cheatState.expeditionFoodSelection;
            if (expedition && typeof engineSendKey === 'function') {
                expedition.selectedCount = 1;
                cheatState.expeditionFoodSelection = null;
                global.setTimeout(function () {
                    submitExpeditionFood(engineSendKey, expedition);
                }, 120);
            }
            return 0xffff;
        };
    }

    /** 从当前光标所在我方城市启动一键出征。 */
    function startQuickExpedition() {
        var context = gameContext();
        if (!context || !cheatState.mainMapVisible || isBattleActive(context.data)) {
            return result(false, '请回到战略地图后使用一键出征');
        }
        var cityEntry = selectedOwnedCity(context);
        if (!cityEntry) return result(false, '请先在战略地图选中一座我方城市');
        var availablePeople = cityPersonIndexes(context, cityEntry).filter(function (personIndex) {
            var person = context.people[personIndex];
            return person && person.Belong === context.ruler;
        });
        if (!availablePeople.length) return result(false, '当前城市没有可出征武将');

        if (cheatState.autoEndTurn) {
            cheatState.autoEndTurn = false;
            syncAutoEndTurnHooks();
            savePersistentCheatState();
            postControlState();
        }
        cheatState.quickExpedition = {cityIndex: cityEntry.index};
        sendKey(VK_ENTER);
        return result(true, '已选择第一名武将和自动粮草，请手动选择目标城市');
    }

    /**
     * 从数字框默认最大值自动减到 5000，并确认；不足 5000 时直接确认最大值。
     *
     * @param {function(number): *} originalSendKey 原始按键发送函数。
     * @param {Object} selection 当前出征选择状态。
     */
    function submitExpeditionFood(originalSendKey, selection) {
        var city = baye.data.g_Cities[selection.cityIndex];
        var maximum = city ? Number(city.Food) : 0;
        if (!Number.isInteger(maximum) || maximum <= 0) return;
        var target = Math.min(AUTO_EXPEDITION_FOOD, maximum);
        var difference = maximum - target;
        if (!difference) {
            originalSendKey(VK_ENTER);
            return;
        }
        var digits = String(maximum).length;
        var unit = 1;
        for (var position = 0; position < digits; position++) {
            var decreases = Math.floor(difference / unit) % 10;
            for (var count = 0; count < decreases; count++) {
                originalSendKey(VK_DOWN);
            }
            if (position < digits - 1) originalSendKey(VK_LEFT);
            unit *= 10;
        }
        originalSendKey(VK_ENTER);
    }

    /**
     * 计算城市本回合需要的粮草，并在不足时仅补到可正常扣除的最小值。
     *
     * 这样可以避免原版“粮草不足则全员兵力减半”的分支，同时保留旱灾、水灾、暴动
     * 对兵力的独立影响，也不会每回合把城市粮草永久拉满。
     */
    function calculateCityFoodConsumption(context, city) {
        var ratio = context.data.g_engineConfig.ratioOfFoodToArmsPerMouth || 50;
        var queue = context.data.g_PersonsQueue;
        if (!queue || ratio <= 0) return 0;
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
        return Math.floor(totalArms / ratio);
    }

    function protectCityFoodShortage() {
        if (!cheatState.foodProtection) return;
        var context = gameContext();
        if (!context) return;
        context.ownedCities.forEach(function (entry) {
            var city = entry.value;
            var requiredFood = calculateCityFoodConsumption(context, city);
            if (city.Food <= requiredFood && requiredFood < 65535) {
                city.Food = requiredFood + 1;
            }
        });
    }

    /** 自动拉满开启时，记录环境更新即将产生的我方驻军粮耗。 */
    function snapshotCityFoodConsumption() {
        cheatState.cityFoodConsumptionSnapshot = null;
        if (!cheatState.autoMaxCities) return;
        var context = gameContext();
        if (!context) return;
        cheatState.cityFoodConsumptionSnapshot = context.ownedCities.map(function (entry) {
            return {
                cityIndex: entry.index,
                consumption: calculateCityFoodConsumption(context, entry.value)
            };
        });
    }

    /** 环境更新完成后仅补回驻军粮耗，保留灾害和随机事件造成的其他粮草变化。 */
    function restoreCityFoodConsumption() {
        var snapshot = cheatState.cityFoodConsumptionSnapshot;
        cheatState.cityFoodConsumptionSnapshot = null;
        if (!cheatState.autoMaxCities || !snapshot || !global.baye || !baye.data) return;
        var ruler = baye.data.g_PlayerKing + 1;
        snapshot.forEach(function (entry) {
            var city = baye.data.g_Cities[entry.cityIndex];
            if (!city || city.Belong !== ruler) return;
            city.Food = Math.min(65535, city.Food + entry.consumption);
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
     * 判断战场单位是否处于攻击者周围三格的正方形范围内。
     *
     * @param {Object} attackerPosition 攻击者坐标。
     * @param {Object} targetPosition 目标坐标。
     * @return {boolean} 横纵坐标差均不超过 3 格，且不是攻击者自身。
     */
    function isInNormalAttackSquare(attackerPosition, targetPosition) {
        var deltaX = Math.abs(targetPosition.x - attackerPosition.x);
        var deltaY = Math.abs(targetPosition.y - attackerPosition.y);
        return (
            (deltaX > 0 || deltaY > 0) &&
            deltaX <= NORMAL_ATTACK_DISTANCE && deltaY <= NORMAL_ATTACK_DISTANCE
        );
    }

    /**
     * 使用原版公式计算普通攻击伤害。
     *
     * @return {number|null} 伤害值；战斗数据不完整时返回 null 并交回原版逻辑。
     */
    function calculateNormalAttackHurt() {
        var data = baye.data;
        var attack = data.g_GenAtt[0];
        var defence = data.g_GenAtt[1];
        var attackerId = data.g_FgtParam.GenArray[attack.generalIndex];
        var attacker = attackerId ? data.g_Persons[attackerId - 1] : null;
        if (!attacker || !defence.df) return null;
        var attackType = Number(attack.armsType);
        var defenceType = Number(defence.armsType);
        var modifierRow = ATTACK_SUBDUE_MODIFIERS[attackType];
        var modifier = modifierRow ? modifierRow[defenceType] : null;
        if (typeof modifier !== 'number') return null;
        var baseHurt = Math.floor(attack.at / defence.df * (attacker.Arms >> 3));
        var hurt = Math.floor(baseHurt * modifier) + 10;
        return Math.max(0, Math.min(65535, hurt));
    }

    /**
     * 将“选择自己”重定向到范围内第一名存活敌军。
     *
     * 后续仍进入原版普通攻击流程，因此主目标攻击动画、行动消耗、死亡检查和多个阵亡
     * 单位的逐个死亡动画全部由原引擎负责。
     *
     * @param {number} mapX 目标地图横坐标。
     * @param {number} mapY 目标地图纵坐标。
     * @return {boolean} 是否已重定向本次确认。
     */
    function redirectSelfGroupAttack(mapX, mapY) {
        var targeting = cheatState.groupAttackTargeting;
        if (!cheatState.wideGroupAttack || !targeting) return false;
        var data = baye.data;
        var attackerPosition = data.g_GenPos[targeting.generalIndex];
        if (!attackerPosition || attackerPosition.x !== mapX || attackerPosition.y !== mapY) {
            return false;
        }
        for (var index = PLAYER_GENERAL_LIMIT; index < TOTAL_GENERAL_LIMIT; index++) {
            var personId = data.g_FgtParam.GenArray[index];
            var targetPosition = data.g_GenPos[index];
            if (!personId || !targetPosition || targetPosition.state === STATE_DEAD) continue;
            if (!isInNormalAttackSquare(attackerPosition, targetPosition)) continue;
            data.g_FoucsX = targetPosition.x;
            data.g_FoucsY = targetPosition.y;
            return true;
        }
        return false;
    }

    /**
     * 将当前普通攻击伤害同步应用到 7×7 正方形范围内的其他敌军。
     *
     * 主目标仍由原引擎扣兵；这里只处理次要目标，之后原版 FgtChkAtkEnd 会统一刷新死亡
     * 状态，避免重复结算主目标或绕过战斗胜负流程。
     *
     * @param {number} hurt 本次普通攻击伤害。
     * @param {number} attackerIndex 攻击者战场序号。
     * @param {number} primaryDefenderIndex 主目标战场序号。
     */
    function applyNormalAttackGroupDamage(hurt, attackerIndex, primaryDefenderIndex) {
        var data = baye.data;
        var attackerPosition = data.g_GenPos[attackerIndex];
        if (!attackerPosition) return;
        for (var index = PLAYER_GENERAL_LIMIT; index < TOTAL_GENERAL_LIMIT; index++) {
            if (index === primaryDefenderIndex) continue;
            var personId = data.g_FgtParam.GenArray[index];
            var position = data.g_GenPos[index];
            if (!personId || !position || position.state === STATE_DEAD) continue;
            if (!isInNormalAttackSquare(attackerPosition, position)) continue;
            var person = data.g_Persons[personId - 1];
            if (!person) continue;
            person.Arms = hurt >= person.Arms ? 0 : person.Arms - hurt;
        }
    }

    /**
     * 安装普通攻击伤害 Hook，保留敌方原版计算和已有模组 Hook。
     *
     * @param {Object} hooks Hook 集合。
     */
    function installNormalAttackHook(hooks) {
        var original = hooks.countAttackHurt;
        hooks.countAttackHurt = function (context) {
            try {
                var data = baye.data;
                var attackerIndex = data.g_GenAtt[0].generalIndex;
                var defenderIndex = data.g_GenAtt[1].generalIndex;
                if (
                    cheatState.invincible && attackerIndex >= PLAYER_GENERAL_LIMIT &&
                    defenderIndex < PLAYER_GENERAL_LIMIT
                ) {
                    context.hurt = 0;
                    return 0;
                }
                if (attackerIndex < PLAYER_GENERAL_LIMIT && defenderIndex >= PLAYER_GENERAL_LIMIT) {
                    cheatState.groupAttackTargeting = null;
                    if (!cheatState.wideGroupAttack && !cheatState.oneHitKill) {
                        return original ? original(context) : 1;
                    }
                    var originalHandled = false;
                    if (cheatState.oneHitKill) {
                        context.hurt = 65535;
                    } else if (original) {
                        originalHandled = original(context) === 0;
                    }
                    if (!cheatState.oneHitKill && !originalHandled) {
                        var calculatedHurt = calculateNormalAttackHurt();
                        if (calculatedHurt == null) return 1;
                        context.hurt = calculatedHurt;
                    }
                    if (cheatState.wideGroupAttack) {
                        applyNormalAttackGroupDamage(
                            Number(context.hurt) || 0,
                            attackerIndex,
                            defenderIndex
                        );
                    }
                    return 0;
                }
            } catch (_) {
                // 数据不完整时交回原版或已有模组 Hook。
            }
            return original ? original(context) : 1;
        };
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
        if (belong === playerRuler) return PLAYER_UNIT_RED;
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
     * 根据原版 CITY_LINKR 邻接表补画可行军城池连接。
     *
     * @param {Uint8ClampedArray} pixels RGBA 像素数组。
     * @param {number} pixelWidth 像素宽度。
     * @param {number} pixelHeight 像素高度。
     * @param {number} scaleX 横向像素倍率。
     * @param {number} scaleY 纵向像素倍率。
     * @return {number} 实际绘制的像素数量。
     */
    function drawCityConnections(pixels, pixelWidth, pixelHeight, scaleX, scaleY) {
        var context = mapContext();
        if (!context) return 0;
        var viewport = context.data.g_CityPos;
        var positions = context.data.g_CityPositions;
        var visibleColumns = Math.floor((global.lcdWidth + 1) / 16) - 2;
        var visibleRows = Math.floor(global.lcdHeight / 16);
        var mapPixelWidth = Math.min(pixelWidth, Math.round(visibleColumns * 16 * scaleX));
        var mapPixelHeight = Math.min(pixelHeight, Math.round(visibleRows * 16 * scaleY));
        var scale = Math.min(scaleX, scaleY);
        var radius = Math.max(0, Math.floor(scale / 2));
        var painted = 0;

        function paintRadius(x, y, radius, color) {
            for (var offsetY = -radius; offsetY <= radius; offsetY++) {
                for (var offsetX = -radius; offsetX <= radius; offsetX++) {
                    var targetX = x + offsetX;
                    var targetY = y + offsetY;
                    if (
                        targetX < 0 || targetY < 0 ||
                        targetX >= mapPixelWidth || targetY >= mapPixelHeight
                    ) {
                        continue;
                    }
                    var pixelOffset = (targetY * pixelWidth + targetX) * 4;
                    pixels[pixelOffset] = color[0];
                    pixels[pixelOffset + 1] = color[1];
                    pixels[pixelOffset + 2] = color[2];
                    pixels[pixelOffset + 3] = 255;
                    painted++;
                }
            }
        }

        function paint(x, y) {
            paintRadius(x, y, radius, CITY_ROAD_COLOR);
        }

        CITY_CONNECTIONS.forEach(function (connection) {
            var from = positions[connection[0]];
            var to = positions[connection[1]];
            if (!from || !to) return;
            var startX = (from.x - viewport.x) * 16 + 8;
            var startY = (from.y - viewport.y) * 16 + 8;
            var endX = (to.x - viewport.x) * 16 + 8;
            var endY = (to.y - viewport.y) * 16 + 8;
            var deltaX = endX - startX;
            var deltaY = endY - startY;
            var length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            if (!length) return;
            var trim = 6;
            startX = Math.round((startX + deltaX / length * trim) * scaleX);
            startY = Math.round((startY + deltaY / length * trim) * scaleY);
            endX = Math.round((endX - deltaX / length * trim) * scaleX);
            endY = Math.round((endY - deltaY / length * trim) * scaleY);

            var lineDeltaX = Math.abs(endX - startX);
            var lineDeltaY = Math.abs(endY - startY);
            var stepX = startX < endX ? 1 : -1;
            var stepY = startY < endY ? 1 : -1;
            var error = lineDeltaX - lineDeltaY;
            while (true) {
                paint(startX, startY);
                if (startX === endX && startY === endY) break;
                var doubledError = error * 2;
                if (doubledError > -lineDeltaY) {
                    error -= lineDeltaY;
                    startX += stepX;
                }
                if (doubledError < lineDeltaX) {
                    error += lineDeltaX;
                    startY += stepY;
                }
            }
        });
        return painted;
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
     * 统计一座城池中归属于该城势力的在任武将数量。
     *
     * `City.Persons` 还包含俘虏和隐藏在野人物，直接展示会夸大实际守城力量，也会泄露
     * 尚未搜索到的人物。因此这里按城市人物队列和人物归属逐个计数；空城固定显示 0。
     *
     * @param {Object} context 地图数据上下文。
     * @param {Object} city 城池数据。
     * @return {number} 当前在任武将数量。
     */
    function cityGeneralCount(context, city) {
        var belong = Number(city.Belong);
        var queue = context.data.g_PersonsQueue;
        var people = context.data.g_Persons;
        if (!Number.isInteger(belong) || belong <= 0 || !queue || !people) return 0;
        var start = Number(city.PersonQueue);
        var total = Number(city.Persons);
        if (!Number.isInteger(start) || !Number.isInteger(total) || start < 0 || total < 0) {
            return 0;
        }
        var count = 0;
        for (var offset = 0; offset < total; offset++) {
            var personIndex = Number(queue[start + offset]);
            var person = Number.isInteger(personIndex) ? people[personIndex] : null;
            if (person && Number(person.Belong) === belong) count++;
        }
        return count;
    }

    /**
     * 在每座可见城池图标上方绘制小号武将人数。
     *
     * 使用点阵而不是 Canvas 字体，保证不同 WebView、分辨率倍率和系统字体下字形稳定。
     * 先绘制右下黑色阴影，再绘制白色正文；数字限制为三位，避免异常数据越过 16×16
     * 城池网格。函数直接处理当前帧缓冲，不创建临时 Canvas，也不引入额外刷新任务。
     *
     * @return {number} 实际写入的物理像素数量。
     */
    function drawCityGeneralCounts(pixels, pixelWidth, pixelHeight, scaleX, scaleY) {
        var context = mapContext();
        if (!context || !context.data.g_PersonsQueue || !context.data.g_Persons) return 0;
        var visibleColumns = Math.floor((global.lcdWidth + 1) / 16) - 2;
        var visibleRows = Math.floor(global.lcdHeight / 16);
        var viewport = context.data.g_CityPos;
        var mapPixelWidth = Math.min(pixelWidth, Math.round(visibleColumns * 16 * scaleX));
        var mapPixelHeight = Math.min(pixelHeight, Math.round(visibleRows * 16 * scaleY));
        var painted = 0;

        function paintLogicalPixel(logicalX, logicalY, color) {
            var startX = Math.max(0, Math.floor(logicalX * scaleX));
            var startY = Math.max(0, Math.floor(logicalY * scaleY));
            var endX = Math.min(mapPixelWidth, Math.ceil((logicalX + 1) * scaleX));
            var endY = Math.min(mapPixelHeight, Math.ceil((logicalY + 1) * scaleY));
            for (var y = startY; y < endY; y++) {
                for (var x = startX; x < endX; x++) {
                    var pixelOffset = (y * pixelWidth + x) * 4;
                    pixels[pixelOffset] = color[0];
                    pixels[pixelOffset + 1] = color[1];
                    pixels[pixelOffset + 2] = color[2];
                    pixels[pixelOffset + 3] = 255;
                    painted++;
                }
            }
        }

        function paintText(text, startX, startY, offsetX, offsetY, color) {
            for (var digitIndex = 0; digitIndex < text.length; digitIndex++) {
                var glyph = CITY_COUNT_DIGITS[Number(text.charAt(digitIndex))];
                if (!glyph) continue;
                for (var row = 0; row < glyph.length; row++) {
                    for (var column = 0; column < 3; column++) {
                        if (glyph[row] & (1 << (2 - column))) {
                            paintLogicalPixel(
                                startX + digitIndex * 4 + column + offsetX,
                                startY + row + offsetY,
                                color
                            );
                        }
                    }
                }
            }
        }

        for (var cityIndex = 0; cityIndex < context.cities.length; cityIndex++) {
            var position = context.data.g_CityPositions[cityIndex];
            if (!position) continue;
            var relativeX = position.x - viewport.x;
            var relativeY = position.y - viewport.y;
            if (
                relativeX < 0 || relativeY < 0 ||
                relativeX >= visibleColumns || relativeY >= visibleRows
            ) {
                continue;
            }
            var count = Math.min(999, cityGeneralCount(context, context.cities[cityIndex]));
            var text = String(count);
            var textWidth = text.length * 3 + text.length - 1;
            var startX = relativeX * 16 + Math.floor((16 - textWidth) / 2);
            var startY = Math.max(0, relativeY * 16 - 2);
            paintText(text, startX, startY, 1, 1, CITY_COUNT_SHADOW_COLOR);
            paintText(text, startX, startY, 0, 0, CITY_COUNT_COLOR);
        }
        return painted;
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
        if (!cheatState.mainMapVisible) return;
        var canvas = document.getElementById('lcd');
        if (!canvas || !canvas.getContext || !global.lcdWidth || !global.lcdHeight) return;

        try {
            var drawing = canvas.getContext('2d');
            var image = drawing.getImageData(0, 0, canvas.width, canvas.height);
            var scaleX = canvas.width / global.lcdWidth;
            var scaleY = canvas.height / global.lcdHeight;
            if (cheatState.mainMapRoadsVisible) {
                drawCityConnections(image.data, canvas.width, canvas.height, scaleX, scaleY);
            }
            if (cheatState.factionColors) {
                colorizePixelData(
                    image.data,
                    canvas.width,
                    canvas.height,
                    scaleX,
                    scaleY
                );
            }
            if (cheatState.mainMapRoadsVisible) {
                drawCityGeneralCounts(
                    image.data,
                    canvas.width,
                    canvas.height,
                    scaleX,
                    scaleY
                );
            }
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
            cheatState.mainMapRoadsVisible = false;
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
     * 被黑白帧覆盖。弹窗期间继续保留城池着色，只暂停道路重画，避免路线穿过弹窗。
     */
    function installDisplayPipeline() {
        var originalFlush = global.bayeFlushLcdBuffer;
        if (typeof originalFlush === 'function') {
            global.bayeFlushLcdBuffer = function (buffer) {
                var shouldColorCities = cheatState.factionColors && cheatState.mainMapVisible;
                var shouldDrawRoads = cheatState.mainMapVisible && cheatState.mainMapRoadsVisible;
                var shouldDrawCityCounts = cheatState.mainMapVisible &&
                    cheatState.mainMapRoadsVisible;
                var shouldColorBattle = global.baye && baye.data && isBattleActive(baye.data);
                if (
                    (
                        shouldColorCities || shouldDrawRoads ||
                        shouldDrawCityCounts || shouldColorBattle
                    ) &&
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
                        if (shouldDrawRoads) {
                            drawCityConnections(
                                pixels,
                                width,
                                height,
                                global.dotSize,
                                global.dotSize
                            );
                        }
                        if (shouldColorCities) {
                            colorizePixelData(
                                pixels,
                                width,
                                height,
                                global.dotSize,
                                global.dotSize
                            );
                        }
                        if (shouldDrawCityCounts) {
                            drawCityGeneralCounts(
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
            engineSendKey = originalSendKey;
            global.sendKey = function (key) {
                if (
                    key === VK_ENTER && cheatState.groupAttackTargeting &&
                    redirectSelfGroupAttack(
                        Number(baye.data.g_FoucsX),
                        Number(baye.data.g_FoucsY)
                    )
                ) {
                    return originalSendKey(VK_ENTER);
                }
                if (key === VK_EXIT) cheatState.groupAttackTargeting = null;
                var expedition = cheatState.expeditionFoodSelection;
                var submitFood = false;
                if (expedition) {
                    if (key === VK_ENTER) {
                        expedition.selectedCount++;
                        submitFood = expedition.selectedCount >= expedition.maxSelections;
                    } else if (key === VK_EXIT) {
                        submitFood = expedition.selectedCount > 0;
                        if (!submitFood) cheatState.expeditionFoodSelection = null;
                    }
                }
                if (key !== VK_UP && key !== VK_DOWN && key !== VK_LEFT && key !== VK_RIGHT) {
                    cheatState.mainMapRoadsVisible = false;
                }
                var keyResult = originalSendKey(key);
                if (submitFood) {
                    cheatState.expeditionFoodSelection = null;
                    submitExpeditionFood(originalSendKey, expedition);
                }
                return keyResult;
            };
        }

        var originalRaiseTouchEvent = global.raiseTouchEvent;
        if (typeof originalRaiseTouchEvent === 'function') {
            global.raiseTouchEvent = function () {
                cheatState.mainMapRoadsVisible = false;
                return originalRaiseTouchEvent.apply(this, arguments);
            };
        }
    }

    /** 安装战场触摸自选群攻桥，屏幕点按自己与方向键确认保持相同行为。 */
    function installSelfGroupTouchPipeline() {
        if (cheatState.selfGroupTouchInstalled) return;
        var originalSendTouch = global._bayeSendTouchEvent;
        if (typeof originalSendTouch !== 'function') return;
        global._bayeSendTouchEvent = function (key, x, y) {
            if (key === 2 && cheatState.groupAttackTargeting) {
                var mapX = (Number(baye.data.g_MapSX) || 0) + Math.floor(x / 16);
                var mapY = (Number(baye.data.g_MapSY) || 0) + Math.floor(y / 16);
                if (redirectSelfGroupAttack(mapX, mapY)) {
                    var touchResult = originalSendTouch(4, x, y);
                    global.sendKey(VK_ENTER);
                    return touchResult;
                }
            } else if (key === 4) {
                cheatState.groupAttackTargeting = null;
            }
            return originalSendTouch.apply(this, arguments);
        };
        cheatState.selfGroupTouchInstalled = true;
    }

    /**
     * 安装覆盖整个游戏引擎的倍率定时管线。
     *
     * 战斗动画、战略事件、进攻与胜负通知、灾害报告等原生等待最终都会经过
     * Emscripten 的 safeSetTimeout。统一缩短该入口，保证所有游戏内流程使用相同的
     * 1x～4x 倍率；倍率只在 baye 引擎数据就绪后生效，不影响 Flutter 宿主定时任务。
     */
    function installBattleSpeedPipeline() {
        if (cheatState.battleSpeedPipelineInstalled) return;
        var originalSafeSetTimeout = global.safeSetTimeout;
        if (typeof originalSafeSetTimeout !== 'function') return;
        global.safeSetTimeout = function (callback, delay) {
            var adjustedDelay = delay;
            try {
                if (
                    cheatState.battleSpeedMultiplier > 1 &&
                    typeof delay === 'number' && delay > 0 &&
                    global.baye && baye.data
                ) {
                    adjustedDelay = delay / cheatState.battleSpeedMultiplier;
                }
            } catch (_) {
                adjustedDelay = delay;
            }
            return originalSafeSetTimeout(callback, adjustedDelay);
        };
        cheatState.battleSpeedPipelineInstalled = true;
    }

    /** @return {number} 当前倍率下单次自动按键的间隔。 */
    function autoBattleKeyDelay() {
        return Math.max(
            55,
            Math.round(AUTO_BATTLE_KEY_DELAY_MS / cheatState.battleSpeedMultiplier)
        );
    }

    /** @return {number} 当前倍率下等待引擎切换输入阶段的时间。 */
    function autoBattleStageDelay() {
        return Math.max(
            90,
            Math.round(AUTO_BATTLE_STAGE_DELAY_MS / cheatState.battleSpeedMultiplier)
        );
    }

    /** @return {number} 当前倍率下等待攻击及死亡动画完成的时间。 */
    function autoBattleActionDelay() {
        return Math.max(
            400,
            Math.round(AUTO_BATTLE_ACTION_DELAY_MS / cheatState.battleSpeedMultiplier)
        );
    }

    /** 使已排队的自动战斗回调失效，但不改变用户开关。 */
    function cancelAutoBattleRun() {
        cheatState.autoBattleRunId++;
        cheatState.autoBattleGeneralIndex = -1;
        cheatState.autoBattleForceRestIndex = -1;
        cheatState.autoBattleMoveReadyIndex = -1;
        cheatState.autoBattleActionIndex = -1;
        cheatState.autoBattleEndTurnPending = false;
        if (typeof cheatState.autoBattleEndTurnRestore === 'function') {
            cheatState.autoBattleEndTurnRestore();
        }
    }

    /** @return {boolean} 指定自动战斗任务是否仍可继续。 */
    function isAutoBattleRunValid(runId) {
        return (
            cheatState.autoBattle && cheatState.autoBattlePlayerStage &&
            runId === cheatState.autoBattleRunId && global.baye && baye.data &&
            isBattleActive(baye.data)
        );
    }

    /** @return {Array<number>} 当前仍存活的敌方战场序号。 */
    function aliveEnemyIndexes(data) {
        var indexes = [];
        for (var index = PLAYER_GENERAL_LIMIT; index < TOTAL_GENERAL_LIMIT; index++) {
            if (
                data.g_FgtParam.GenArray[index] && data.g_GenPos[index] &&
                data.g_GenPos[index].state !== STATE_DEAD
            ) {
                indexes.push(index);
            }
        }
        return indexes;
    }

    /** @return {Array<number>} 当前回合仍可由玩家操作的我方战场序号。 */
    function availablePlayerIndexes(data) {
        var indexes = [];
        for (var index = 0; index < PLAYER_GENERAL_LIMIT; index++) {
            var position = data.g_GenPos[index];
            if (
                !data.g_FgtParam.GenArray[index] || !position ||
                position.state === STATE_DEAD || position.state === STATE_CONFUSED ||
                position.state === STATE_STONE || position.active !== ACTION_WAITING
            ) {
                continue;
            }
            indexes.push(index);
        }
        return indexes;
    }

    /** 计算曼哈顿距离，保持与原版战场 AI 的格子距离定义一致。 */
    function battleDistance(leftX, leftY, rightX, rightY) {
        return Math.abs(leftX - rightX) + Math.abs(leftY - rightY);
    }

    /**
     * 生成光标从起点移动到终点的逐格方向键序列。
     *
     * @return {Array<number>} 方向键序列。
     */
    function directionalKeys(fromX, fromY, toX, toY) {
        var keys = [];
        var currentX = fromX;
        var currentY = fromY;
        while (currentX < toX) {
            keys.push(VK_RIGHT);
            currentX++;
        }
        while (currentX > toX) {
            keys.push(VK_LEFT);
            currentX--;
        }
        while (currentY < toY) {
            keys.push(VK_DOWN);
            currentY++;
        }
        while (currentY > toY) {
            keys.push(VK_UP);
            currentY--;
        }
        return keys;
    }

    /**
     * 逐个发送自动战斗按键。每次发送前都校验 runId，关闭开关后不会遗留延时输入。
     */
    function sendAutoBattleKeys(keys, runId, completed) {
        var keyIndex = 0;
        var sendNext = function () {
            if (!isAutoBattleRunValid(runId)) return;
            if (keyIndex >= keys.length) {
                if (completed) completed();
                return;
            }
            sendKey(keys[keyIndex++]);
            global.setTimeout(sendNext, autoBattleKeyDelay());
        };
        global.setTimeout(sendNext, autoBattleKeyDelay());
    }

    /** 返回指定落点使用 7×7 扩大群攻时可覆盖的存活敌将数量。 */
    function groupAttackCoverageAt(data, enemies, mapX, mapY) {
        var count = 0;
        enemies.forEach(function (enemyIndex) {
            var enemy = data.g_GenPos[enemyIndex];
            var deltaX = Math.abs(enemy.x - mapX);
            var deltaY = Math.abs(enemy.y - mapY);
            if (
                (deltaX > 0 || deltaY > 0) &&
                deltaX <= NORMAL_ATTACK_DISTANCE && deltaY <= NORMAL_ATTACK_DISTANCE
            ) {
                count++;
            }
        });
        return count;
    }

    /**
     * 从引擎刚计算出的 15x15 可移动路径中选择自动战斗落点。
     *
     * 扩大群攻开启时优先选择 7×7 内覆盖敌将最多的位置；覆盖数相同时再比较最近敌人
     * 距离和实际移动距离。普通攻击继续沿用最接近敌人的原算法。函数不直接修改坐标，
     * 后续仍通过方向键和确认键完成原版移动流程。
     */
    function chooseAutoBattleMove(data, generalIndex) {
        var position = data.g_GenPos[generalIndex];
        var enemies = aliveEnemyIndexes(data);
        var path = data.g_FightPath;
        if (!position || !enemies.length || !path) {
            return position ? {x: position.x, y: position.y} : null;
        }
        var best = {x: position.x, y: position.y};
        var bestCoverage = -1;
        var bestEnemyDistance = Number.MAX_SAFE_INTEGER;
        var bestTravelDistance = -1;
        var pathStartX = Number(data.g_PathSX) || 0;
        var pathStartY = Number(data.g_PathSY) || 0;
        var useStartX = Number(data.g_PUseSX) || 0;
        var useStartY = Number(data.g_PUseSY) || 0;
        for (var pathY = useStartY; pathY < FIGHT_PATH_SIZE; pathY++) {
            for (var pathX = useStartX; pathX < FIGHT_PATH_SIZE; pathX++) {
                var resistance = Number(path[pathY * FIGHT_PATH_SIZE + pathX]);
                if (!Number.isFinite(resistance) || resistance >= BLOCKED_FIGHT_PATH) continue;
                var mapX = pathX - useStartX + pathStartX;
                var mapY = pathY - useStartY + pathStartY;
                if (
                    mapX < 0 || mapY < 0 || mapX >= data.g_MapWid || mapY >= data.g_MapHgt
                ) {
                    continue;
                }
                var nearestEnemyDistance = Number.MAX_SAFE_INTEGER;
                enemies.forEach(function (enemyIndex) {
                    var enemy = data.g_GenPos[enemyIndex];
                    nearestEnemyDistance = Math.min(
                        nearestEnemyDistance,
                        battleDistance(mapX, mapY, enemy.x, enemy.y)
                    );
                });
                var coverage = cheatState.wideGroupAttack
                    ? groupAttackCoverageAt(data, enemies, mapX, mapY)
                    : 0;
                var travelDistance = battleDistance(position.x, position.y, mapX, mapY);
                if (
                    coverage > bestCoverage ||
                    (
                        coverage === bestCoverage &&
                        (
                            nearestEnemyDistance < bestEnemyDistance ||
                            (
                                nearestEnemyDistance === bestEnemyDistance &&
                                travelDistance > bestTravelDistance
                            )
                        )
                    )
                ) {
                    best = {x: mapX, y: mapY};
                    bestCoverage = coverage;
                    bestEnemyDistance = nearestEnemyDistance;
                    bestTravelDistance = travelDistance;
                }
            }
        }
        return best;
    }

    /**
     * 按战场序号返回当前普通攻击范围内的第一名敌军。
     *
     * 攻击范围起点由原引擎保存为 U8；武将在地图上边缘或左边缘时起点会回绕到
     * 253~255，因此坐标差也必须按 U8 回绕，才能与原版 FgtChkRng 的判断一致。
     *
     * @return {number} 第一名合法敌军的战场序号；没有目标时返回 -1。
     */
    function chooseAutoBattleTarget(data) {
        var range = data.g_FgtAtkRng;
        if (!range) return -1;
        var size = Number(range[0]);
        var startX = Number(range[1]);
        var startY = Number(range[2]);
        if (!Number.isInteger(size) || size <= 0) return -1;
        var enemies = aliveEnemyIndexes(data);
        for (var enemyOffset = 0; enemyOffset < enemies.length; enemyOffset++) {
            var enemyIndex = enemies[enemyOffset];
            var enemy = data.g_GenPos[enemyIndex];
            var rangeX = (enemy.x - startX + 256) & 0xff;
            var rangeY = (enemy.y - startY + 256) & 0xff;
            if (
                rangeX < 0 || rangeY < 0 || rangeX >= size || rangeY >= size ||
                Number(range[3 + rangeY * size + rangeX]) !== 1
            ) {
                continue;
            }
            return enemyIndex;
        }
        return -1;
    }

    /** @return {boolean} 是否仍有已归零但尚未完成死亡状态结算的单位。 */
    function hasPendingBattleDeaths(data) {
        for (var index = 0; index < TOTAL_GENERAL_LIMIT; index++) {
            var personId = data.g_FgtParam.GenArray[index];
            var position = data.g_GenPos[index];
            var person = personId ? data.g_Persons[personId - 1] : null;
            if (
                person && position && position.state !== STATE_DEAD &&
                (Number(person.Arms) === 0 || Number(position.hp) === 0)
            ) {
                return true;
            }
        }
        return false;
    }

    /**
     * 等待原版攻击、伤害数字和逐个死亡动画完成，再选择下一名我方武将。
     *
     * 上一版只使用固定延时，群攻连续阵亡时光标会被死亡动画移动到其他位置，后续
     * 方向键便可能在空格确认。这里同时等待当前武将完成行动、异步动画结束以及死亡
     * 状态全部落定；超时仅停止本次自动输入，不向仍在动画中的引擎继续塞按键。
     */
    function waitForAutoBattleResolution(runId, generalIndex, attempts) {
        if (!isAutoBattleRunValid(runId)) return;
        var data = baye.data;
        var position = data.g_GenPos[generalIndex];
        var asyncAction = Number(data.g_asyncActionID) || 0;
        if (
            !position || position.active === ACTION_WAITING || asyncAction !== 0 ||
            hasPendingBattleDeaths(data)
        ) {
            if (attempts >= 160) return;
            global.setTimeout(function () {
                waitForAutoBattleResolution(runId, generalIndex, attempts + 1);
            }, autoBattleStageDelay());
            return;
        }
        scheduleAutoBattleGeneral(runId);
    }

    /** 选择普通攻击目标；没有合法目标时退出目标选择并让该武将原地休息。 */
    function driveAutoBattleAim(runId, generalIndex, attempts) {
        if (!isAutoBattleRunValid(runId)) return;
        var data = baye.data;
        if (!data.g_FgtAtkRng || Number(data.g_FgtAtkRng[0]) <= 0) {
            if (attempts >= 40) return;
            global.setTimeout(function () {
                driveAutoBattleAim(runId, generalIndex, attempts + 1);
            }, autoBattleStageDelay());
            return;
        }
        var targetIndex = chooseAutoBattleTarget(data);
        if (targetIndex < 0) {
            cheatState.autoBattleForceRestIndex = generalIndex;
            sendKey(VK_EXIT);
            return;
        }
        var attacker = data.g_GenPos[generalIndex];
        var target = cheatState.wideGroupAttack
            ? attacker
            : data.g_GenPos[targetIndex];
        if (!attacker || !target) return;
        var keys = directionalKeys(attacker.x, attacker.y, target.x, target.y);
        keys.push(VK_ENTER);
        sendAutoBattleKeys(keys, runId, function () {
            global.setTimeout(function () {
                waitForAutoBattleResolution(runId, generalIndex, 0);
            }, autoBattleActionDelay());
        });
    }

    /** 在移动范围出现后逐格选择目标位置。 */
    function driveAutoBattleMove(runId, generalIndex) {
        if (!isAutoBattleRunValid(runId)) return;
        var data = baye.data;
        var target = chooseAutoBattleMove(data, generalIndex);
        if (!target) return;
        var keys = directionalKeys(data.g_FoucsX, data.g_FoucsY, target.x, target.y);
        keys.push(VK_ENTER);
        sendAutoBattleKeys(keys, runId, null);
    }

    /**
     * 等待引擎确认己方武将已经进入移动范围阶段。
     *
     * 多人连续行动时，伤害动画结束和 FgtGetControl 恢复接收按键并不是同一时刻。旧实现
     * 只等待固定时长，确认键若被前一阶段消费，后续移动键就会落在选择武将界面。这里
     * 以引擎的 countMoveRange Hook 作为可靠确认；若长时间未确认，则基于实时光标重新
     * 发送一次选择序列，等价于用户关闭再开启自动战斗时触发的自恢复，但不改变开关。
     */
    function waitForAutoBattleGeneralSelection(runId, generalIndex, attempts) {
        if (!isAutoBattleRunValid(runId)) return;
        if (cheatState.autoBattleActionIndex === generalIndex) return;
        if (cheatState.autoBattleMoveReadyIndex === generalIndex) {
            global.setTimeout(function () {
                driveAutoBattleMove(runId, generalIndex);
            }, autoBattleStageDelay());
            return;
        }
        if (attempts >= 20) {
            if (availablePlayerIndexes(baye.data).indexOf(generalIndex) < 0) {
                scheduleAutoBattleGeneral(runId);
                return;
            }
            selectAutoBattleGeneral(runId, generalIndex);
            return;
        }
        global.setTimeout(function () {
            waitForAutoBattleGeneralSelection(runId, generalIndex, attempts + 1);
        }, autoBattleStageDelay());
    }

    /** 发送选择指定己方武将的按键，并等待引擎阶段确认。 */
    function selectAutoBattleGeneral(runId, generalIndex) {
        if (!isAutoBattleRunValid(runId)) return;
        var selected = baye.data.g_GenPos[generalIndex];
        if (!selected) {
            scheduleAutoBattleGeneral(runId);
            return;
        }
        cheatState.autoBattleGeneralIndex = generalIndex;
        cheatState.autoBattleMoveReadyIndex = -1;
        cheatState.autoBattleActionIndex = -1;
        var keys = directionalKeys(
            baye.data.g_FoucsX,
            baye.data.g_FoucsY,
            selected.x,
            selected.y
        );
        keys.push(VK_ENTER);
        sendAutoBattleKeys(keys, runId, function () {
            waitForAutoBattleGeneralSelection(runId, generalIndex, 0);
        });
    }

    /** @return {number} 当前倍率下自动结束回合的重试间隔。 */
    function autoBattleEndTurnRetryDelay() {
        return Math.max(
            700,
            Math.round(1800 / cheatState.battleSpeedMultiplier)
        );
    }

    /**
     * 安装带确认回调的战斗菜单 Hook。
     *
     * 只有原版 FgtMainMenu 真正调用该 Hook，才表示退出键已经进入“结束回合”菜单；
     * 伤害提示、死亡动画或报告框消费退出键时不会提前标记成功。
     */
    function installAutoBattleEndTurnHook(runId) {
        if (typeof cheatState.autoBattleEndTurnRestore === 'function') return;
        var hooks = baye.hooks || (baye.hooks = {});
        var original = hooks.fightOpenMainMenu;
        var endTurnHook;
        var restore = function () {
            if (hooks.fightOpenMainMenu === endTurnHook) {
                if (original) {
                    hooks.fightOpenMainMenu = original;
                } else {
                    delete hooks.fightOpenMainMenu;
                }
            }
            if (cheatState.autoBattleEndTurnRestore === restore) {
                cheatState.autoBattleEndTurnRestore = null;
            }
        };
        endTurnHook = function (context) {
            if (!isAutoBattleRunValid(runId)) {
                restore();
                return original ? original(context) : 0;
            }
            cheatState.autoBattleEndTurnIssued = true;
            cheatState.autoBattleEndTurnPending = false;
            restore();
            return 0;
        };
        cheatState.autoBattleEndTurnRestore = restore;
        hooks.fightOpenMainMenu = endTurnHook;
    }

    /**
     * 重试结束回合，直到原版战斗菜单确认执行或当前自动战斗任务失效。
     */
    function retryAutoBattleEndTurn(runId, attempts) {
        if (!isAutoBattleRunValid(runId) || cheatState.autoBattleEndTurnIssued) {
            cheatState.autoBattleEndTurnPending = false;
            if (typeof cheatState.autoBattleEndTurnRestore === 'function') {
                cheatState.autoBattleEndTurnRestore();
            }
            return;
        }
        if (attempts >= 160) {
            cheatState.autoBattleEndTurnPending = false;
            if (typeof cheatState.autoBattleEndTurnRestore === 'function') {
                cheatState.autoBattleEndTurnRestore();
            }
            return;
        }
        installAutoBattleEndTurnHook(runId);
        if ((Number(baye.data.g_asyncActionID) || 0) === 0) {
            sendKey(VK_EXIT);
        }
        global.setTimeout(function () {
            retryAutoBattleEndTurn(runId, attempts + 1);
        }, autoBattleEndTurnRetryDelay());
    }

    /** 当前已无可行动武将时，通过原版战斗菜单结束我方回合。 */
    function finishAutoBattlePlayerTurn(runId) {
        if (!isAutoBattleRunValid(runId)) return;
        if (cheatState.autoBattleEndTurnIssued || cheatState.autoBattleEndTurnPending) return;
        cheatState.autoBattleEndTurnPending = true;
        retryAutoBattleEndTurn(runId, 0);
    }

    /** 选择下一名可行动武将，并进入原版移动范围选择。 */
    function scheduleAutoBattleGeneral(runId) {
        global.setTimeout(function () {
            if (!isAutoBattleRunValid(runId)) return;
            var data = baye.data;
            var players = availablePlayerIndexes(data);
            var enemies = aliveEnemyIndexes(data);
            if (!players.length || !enemies.length) {
                finishAutoBattlePlayerTurn(runId);
                return;
            }
            var selectedIndex = players[0];
            var selectedDistance = Number.MAX_SAFE_INTEGER;
            players.forEach(function (playerIndex) {
                var player = data.g_GenPos[playerIndex];
                enemies.forEach(function (enemyIndex) {
                    var enemy = data.g_GenPos[enemyIndex];
                    var distance = battleDistance(player.x, player.y, enemy.x, enemy.y);
                    if (distance < selectedDistance) {
                        selectedDistance = distance;
                        selectedIndex = playerIndex;
                    }
                });
            });
            selectAutoBattleGeneral(runId, selectedIndex);
        }, autoBattleStageDelay());
    }

    /** 开始本轮玩家阶段；新 runId 会取消上一轮未执行的定时按键。 */
    function beginAutoBattlePlayerTurn() {
        cancelAutoBattleRun();
        cheatState.autoBattleEndTurnIssued = false;
        if (!cheatState.autoBattle || !cheatState.autoBattlePlayerStage) return;
        scheduleAutoBattleGeneral(cheatState.autoBattleRunId);
    }

    /**
     * 按自动战斗开关安装或恢复动作菜单 Hook。
     *
     * 原引擎只要检测到 fightChooseAction 存在就会跳过人工菜单，因此关闭自动战斗时
     * 必须真正删除增强 Hook，而不是从 Hook 内返回一个默认值。
     */
    function syncAutoBattleChooseActionHook() {
        if (!autoBattleHooks || !autoBattleChooseActionHook) return;
        if (cheatState.autoBattle) {
            autoBattleHooks.fightChooseAction = autoBattleChooseActionHook;
            return;
        }
        if (autoBattleHooks.fightChooseAction !== autoBattleChooseActionHook) return;
        if (autoBattleOriginalChooseAction) {
            autoBattleHooks.fightChooseAction = autoBattleOriginalChooseAction;
        } else {
            delete autoBattleHooks.fightChooseAction;
        }
    }

    /**
     * 按自动策略开关安装或恢复玩家策略和系统菜单 Hook。
     *
     * 开启后 `tacticStageUser` 跳过 PlayerTactic，随后 `mainSystemMenu` 固定选择“结束策略”；
     * 关闭时必须恢复原 Hook 或删除字段，否则 C 核心会误判为脚本已经接管玩家策略。
     */
    function syncAutoEndTurnHooks() {
        if (!autoEndTurnHooks || !autoEndTurnTacticStageUserHook || !autoEndTurnMainSystemMenuHook) {
            return;
        }
        if (cheatState.autoEndTurn) {
            autoEndTurnHooks.tacticStageUser = autoEndTurnTacticStageUserHook;
            autoEndTurnHooks.mainSystemMenu = autoEndTurnMainSystemMenuHook;
            return;
        }
        if (autoEndTurnHooks.tacticStageUser === autoEndTurnTacticStageUserHook) {
            if (autoEndTurnOriginalTacticStageUser) {
                autoEndTurnHooks.tacticStageUser = autoEndTurnOriginalTacticStageUser;
            } else {
                delete autoEndTurnHooks.tacticStageUser;
            }
        }
        if (autoEndTurnHooks.mainSystemMenu === autoEndTurnMainSystemMenuHook) {
            if (autoEndTurnOriginalMainSystemMenu) {
                autoEndTurnHooks.mainSystemMenu = autoEndTurnOriginalMainSystemMenu;
            } else {
                delete autoEndTurnHooks.mainSystemMenu;
            }
        }
    }

    /** 安装自动策略所需 Hook；重复初始化时只复用同一组函数。 */
    function installAutoEndTurnHooks(hooks) {
        autoEndTurnHooks = hooks;
        autoEndTurnOriginalTacticStageUser = hooks.tacticStageUser || null;
        autoEndTurnOriginalMainSystemMenu = hooks.mainSystemMenu || null;
        autoEndTurnTacticStageUserHook = function (context) {
            if (cheatState.autoEndTurn) return 0;
            return autoEndTurnOriginalTacticStageUser
                ? autoEndTurnOriginalTacticStageUser(context)
                : -1;
        };
        autoEndTurnMainSystemMenuHook = function (context) {
            if (cheatState.autoEndTurn) return 0;
            return autoEndTurnOriginalMainSystemMenu
                ? autoEndTurnOriginalMainSystemMenu(context)
                : 0xff;
        };
        syncAutoEndTurnHooks();
    }

    /**
     * 安装自动战斗所需 Hook。
     *
     * 移动、选目标和确认均通过 sendKey 驱动；唯一直接返回的是原版动作菜单中的“攻击”
     * 或“休息”选项，从而保持原有伤害、动画、死亡和胜负结算链路。
     */
    function installAutoBattleHooks(hooks) {
        autoBattleHooks = hooks;
        autoBattleOriginalChooseAction = hooks.fightChooseAction || null;
        autoBattleChooseActionHook = function (context) {
            var generalIndex = Number(context.index);
            if (
                !cheatState.autoBattle || !cheatState.autoBattlePlayerStage ||
                !Number.isInteger(generalIndex) || generalIndex < 0 ||
                generalIndex >= PLAYER_GENERAL_LIMIT
            ) {
                return autoBattleOriginalChooseAction
                    ? autoBattleOriginalChooseAction(context)
                    : NORMAL_ATTACK_COMMAND;
            }
            if (cheatState.autoBattleForceRestIndex === generalIndex) {
                cheatState.autoBattleForceRestIndex = -1;
                global.setTimeout(function () {
                    waitForAutoBattleResolution(
                        cheatState.autoBattleRunId,
                        generalIndex,
                        0
                    );
                }, autoBattleStageDelay());
                return REST_COMMAND;
            }
            cheatState.autoBattleGeneralIndex = generalIndex;
            cheatState.autoBattleActionIndex = generalIndex;
            cheatState.autoBattleMoveReadyIndex = -1;
            if (baye.data.g_FgtAtkRng) {
                // 清除上一名武将的范围标记；原引擎会在 Hook 返回后立即写入本次范围。
                baye.data.g_FgtAtkRng[0] = 0;
            }
            var runId = cheatState.autoBattleRunId;
            global.setTimeout(function () {
                driveAutoBattleAim(runId, generalIndex, 0);
            }, autoBattleStageDelay());
            return NORMAL_ATTACK_COMMAND;
        };
        syncAutoBattleChooseActionHook();
        installObserverHook(hooks, 'countMoveRange', function (context) {
            var generalIndex = Number(context.generalIndex);
            if (
                cheatState.autoBattle && cheatState.autoBattlePlayerStage &&
                Number.isInteger(generalIndex) && generalIndex >= 0 &&
                generalIndex < PLAYER_GENERAL_LIMIT &&
                generalIndex === cheatState.autoBattleGeneralIndex
            ) {
                cheatState.autoBattleMoveReadyIndex = generalIndex;
            }
        });
        installObserverHook(hooks, 'battleStage2', function () {
            cheatState.autoBattlePlayerStage = true;
            beginAutoBattlePlayerTurn();
        });
        installObserverHook(hooks, 'battleStage3', function () {
            cheatState.autoBattlePlayerStage = false;
            cancelAutoBattleRun();
        });
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

    /**
     * 使用手机WebView当前系统字体生成引擎需要的加粗1bpp字模。
     *
     * 4X资源使用48×48中文和24×48英数；低倍率版本按当前倍率回退到24或12像素，
     * 因此三国霸业所有通过引擎绘制的菜单、属性、战报和地图文字都使用同一系统字体。
     *
     * @param {Object} hooks 游戏Hook集合。
     * @return {boolean} 是否成功安装。
     */
    function installSystemFont(hooks) {
        if (
            !global.document || typeof global.document.createElement !== 'function' ||
            typeof global.TextDecoder !== 'function' || typeof baye.setFont !== 'function'
        ) {
            return false;
        }
        var scale = Number(baye.data.g_scale) || 1;
        var fontSize = scale >= 4 ? 48 : (scale >= 2 ? 24 : 12);
        var fontId = scale >= 4 ? 5 : (scale >= 2 ? 1 : 0);
        var fontResult = baye.setFont(fontId);
        if (fontResult !== 0 && fontResult !== baye.OK) return false;
        if (typeof baye.clearFontCache === 'function') baye.clearFontCache();
        baye.data.g_engineConfig.useCustomFont = 1;
        baye.data.g_engineConfig.useCustomFontEn = 1;
        baye.data.g_engineConfig.cacheCustomFont = 1;

        var canvas = global.document.createElement('canvas');
        var decoder = new global.TextDecoder('gbk');
        var cache = new Map();
        var original = hooks.fontImageForChar;

        function bitmapFor(code) {
            if (cache.has(code)) return cache.get(code).slice();
            var ascii = code < 256;
            var width = ascii ? Math.ceil(fontSize / 2) : fontSize;
            canvas.width = width;
            canvas.height = fontSize;
            var drawing = canvas.getContext('2d', {willReadFrequently: true});
            if (!drawing) throw new Error('Canvas 2D不可用');
            var character = ascii
                ? String.fromCharCode(code)
                : decoder.decode(new Uint8Array([code >> 8, code & 0xff]));
            drawing.clearRect(0, 0, width, fontSize);
            drawing.fillStyle = '#ffffff';
            drawing.textAlign = 'center';
            drawing.textBaseline = 'middle';
            drawing.font = '700 ' + Math.max(10, fontSize - 6) +
                'px system-ui, -apple-system, "Noto Sans CJK SC", sans-serif';
            drawing.fillText(character, width / 2, fontSize / 2 + 1);
            var rgba = drawing.getImageData(0, 0, width, fontSize).data;
            var bytesPerLine = Math.ceil(width / 8);
            var bitmap = new Array(bytesPerLine * fontSize).fill(0);
            for (var y = 0; y < fontSize; y++) {
                for (var x = 0; x < width; x++) {
                    var offset = (y * width + x) * 4;
                    if (rgba[offset + 3] < 56 || rgba[offset] < 56) continue;
                    bitmap[Math.floor(x / 8) + y * bytesPerLine] |= 0x80 >> (x % 8);
                }
            }
            cache.set(code, bitmap);
            return bitmap.slice();
        }

        hooks.fontImageForChar = function (context) {
            try {
                context.zmCode = bitmapFor(Number(context.code));
                return 0;
            } catch (_) {
                return original ? original(context) : 1;
            }
        };
        return true;
    }

    /** 安装战斗、内政作弊和地图增强 Hook，重复调用不会重复包装。 */
    function initialize() {
        if (cheatState.hooksInstalled) return true;
        if (!global.baye || !baye.hooks || !baye.data) return false;
        var hooks = baye.hooks;
        installSystemFont(hooks);
        installNormalAttackHook(hooks);
        installAutoBattleHooks(hooks);
        installAutoEndTurnHooks(hooks);
        installQuickExpeditionHooks(hooks);
        installOverrideHook(hooks, 'countSkillHurt', function (context) {
            return overrideDamage(context, true);
        });
        installOverrideHook(hooks, 'calcAttackRange', function (context) {
            var personIndex = Number(context.personIndex);
            var person = baye.data.g_Persons[personIndex];
            if (
                !cheatState.wideGroupAttack ||
                Number(context.type) !== NORMAL_ATTACK_COMMAND || !person ||
                person.Belong !== baye.data.g_PlayerKing + 1 || !context.range
            ) {
                cheatState.groupAttackTargeting = null;
                return false;
            }
            context.rangeSize = NORMAL_ATTACK_RANGE_SIZE;
            for (var rangeIndex = 0; rangeIndex < context.range.length; rangeIndex++) {
                context.range[rangeIndex] = 0;
            }
            var center = NORMAL_ATTACK_DISTANCE;
            for (var rangeY = 0; rangeY < NORMAL_ATTACK_RANGE_SIZE; rangeY++) {
                for (var rangeX = 0; rangeX < NORMAL_ATTACK_RANGE_SIZE; rangeX++) {
                    context.range[rangeY * NORMAL_ATTACK_RANGE_SIZE + rangeX] = 1;
                }
            }
            var generalIndex = battleIndexOf(baye.data, personIndex);
            if (generalIndex < 0 || generalIndex >= PLAYER_GENERAL_LIMIT) return false;
            cheatState.groupAttackTargeting = {generalIndex: generalIndex};
            return true;
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
        installObserverHook(hooks, 'tacticStage4', function () {
            protectCityFoodShortage();
            snapshotCityFoodConsumption();
        });
        installObserverHook(hooks, 'tacticStage5', restoreCityFoodConsumption);
        installObserverHook(hooks, 'tacticStage2', function () {
            runAutoCityMaintenance('策略结束自动', true);
        });
        installObserverHook(hooks, 'didOpenNewGame', applyPersistentGeneralEffects);
        installObserverHook(hooks, 'didLoadGame', function () {
            repairLoadedGameState();
            applyPersistentGeneralEffects();
        });
        installObserverHook(hooks, 'exitBattle', function () {
            cheatState.autoBattlePlayerStage = false;
            cancelAutoBattleRun();
            if (cheatState.postBattleAutomation) {
                cheatState.postBattleAutomationPending = true;
            }
        });
        installObserverHook(hooks, 'enterBattle', function () {
            // 自动策略 Hook 只作用于战略阶段。战斗期间无需关闭开关，回到主地图后
            // didShowMainMap 会继续安排结束当前策略，避免一次战斗永久中断连续推进。
            cheatState.autoBattlePlayerStage = false;
            cancelAutoBattleRun();
            cheatState.mainMapVisible = false;
            cheatState.mainMapRoadsVisible = false;
            cheatState.postBattleSource = captureBattleSource();
            cheatState.battleCaptiveSnapshot = captureBattleCityCaptives();
        });
        installExpeditionFoodHook(hooks);
        installBattleUnitDrawing(hooks);

        var originalMapHook = hooks.didShowMainMap;
        hooks.didShowMainMap = function (context) {
            var hookResult = originalMapHook ? originalMapHook(context) : 1;
            cheatState.mainMapVisible = true;
            cheatState.mainMapRoadsVisible = true;
            if (cheatState.quickExpedition) cheatState.quickExpedition = null;
            executeDefeatedCityCaptives();
            global.requestAnimationFrame(colorizeCityIcons);
            if (cheatState.autoEndTurn && !cheatState.endTurnPending) {
                global.setTimeout(requestAutoEndCurrentTurn, 180);
            }
            if (cheatState.postBattleAutomationPending) {
                cheatState.postBattleAutomationPending = false;
                var battleSource = cheatState.postBattleSource;
                cheatState.postBattleSource = null;
                runPostBattleAutomation(battleSource);
            }
            return hookResult;
        };
        installEnemyCityLongPress();
        installSelfGroupTouchPipeline();
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
            syncAutoEndTurnHooks();
        };
        oneShotHook = function () {
            restore();
            return selection;
        };
        hooks[hookName] = oneShotHook;
        global.setTimeout(restore, 2000);
        return true;
    }

    /** 结束当前正在显示的玩家策略月，后续月份由持久 Hook 直接跳过。 */
    function requestAutoEndCurrentTurn() {
        if (
            !cheatState.autoEndTurn || !cheatState.mainMapVisible ||
            cheatState.endTurnPending || cheatState.quickSavePending
        ) {
            return false;
        }
        cheatState.endTurnPending = true;
        installOneShotMenuSelection('mainSystemMenu', 0);
        sendKey(VK_EXIT);
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
            cheatState.battleSpeedMultiplier = nextGameSpeedMultiplier(
                cheatState.battleSpeedMultiplier
            );
            savePersistentCheatState();
            return result(true, '游戏速度已切换为 ' + cheatState.battleSpeedMultiplier + 'x');
        }

        if (action === 'autoBattle') {
            cheatState.autoBattle = !cheatState.autoBattle;
            syncAutoBattleChooseActionHook();
            syncEngineCheatSettings();
            savePersistentCheatState();
            if (cheatState.autoBattle && cheatState.autoBattlePlayerStage) {
                beginAutoBattlePlayerTurn();
            } else if (!cheatState.autoBattle) {
                cancelAutoBattleRun();
            }
            return result(
                true,
                cheatState.autoBattle
                    ? '自动战斗已开启，将按当前倍率逐步移动和攻击'
                    : '自动战斗已关闭'
            );
        }

        if (action === 'autoEndTurn') {
            if (!cheatState.autoEndTurn && !cheatState.mainMapVisible) {
                return result(false, '请回到战略地图后开启自动策略结束');
            }
            cheatState.autoEndTurn = !cheatState.autoEndTurn;
            syncAutoEndTurnHooks();
            savePersistentCheatState();
            postControlState();
            if (cheatState.autoEndTurn) requestAutoEndCurrentTurn();
            return result(
                true,
                cheatState.autoEndTurn
                    ? '自动策略结束已开启，战斗结束后将自动继续'
                    : '自动策略结束已关闭'
            );
        }

        if (action === 'quickExpedition') return startQuickExpedition();

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
                cheatState.autoMaxCities = !cheatState.autoMaxCities;
                if (!cheatState.autoMaxCities) {
                    cheatState.cityFoodConsumptionSnapshot = null;
                }
                savePersistentCheatState();
                if (cheatState.autoMaxCities) {
                    runAutoCityMaintenance('开启自动拉满', false);
                }
                return result(
                    true,
                    cheatState.autoMaxCities
                        ? '自动拉满与搜索已开启，并已立即执行一次'
                        : '自动拉满与搜索已关闭'
                );
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
            if (action === 'sgby_attack_any_city') {
                cheatState.attackAnyCity = !cheatState.attackAnyCity;
                syncEngineCheatSettings();
                savePersistentCheatState();
                return result(
                    true,
                    cheatState.attackAnyCity
                        ? '任意攻城已开启：我方出征可忽略城市连线'
                        : '任意攻城已关闭：恢复原版相邻路线限制'
                );
            }
            if (action === 'sgby_enemy_escape_route') {
                cheatState.enemyEscapeRoute = !cheatState.enemyEscapeRoute;
                syncEngineCheatSettings();
                savePersistentCheatState();
                return result(
                    true,
                    cheatState.enemyEscapeRoute
                        ? '敌军逃跑路线限制已开启：只能沿原势力城市连线撤退'
                        : '敌军逃跑路线限制已关闭：恢复原版随机退往势力城市'
                );
            }
            if (action === 'sgby_disable_animations') {
                cheatState.animationsDisabled = !cheatState.animationsDisabled;
                applyAnimationSetting();
                savePersistentCheatState();
                return result(
                    true,
                    cheatState.animationsDisabled
                        ? '过程动效已关闭：跳过敌方移动展示和战斗动画'
                        : '过程动效已恢复'
                );
            }
            if (action === 'sgby_search_city') {
                var searchResult = searchAllOwnedCities(context, '手动搜索', [], null);
                return result(
                    true,
                    '搜索完成：' + formatSearchDetails(searchResult.cities)
                );
            }
            if (action === 'sgby_search_world_generals') {
                var worldSearch = searchAllWorldGenerals(context);
                return result(
                    true,
                    '全地图搜索完成：搜出 ' + worldSearch.count + ' 名在野武将，' +
                    worldSearch.newRulers + ' 座空城建立新势力'
                );
            }
            if (action === 'sgby_execute_wild_generals') {
                var wildExecution = executeAllWildGenerals(context);
                return result(
                    true,
                    '已处死全地图在野武将 ' + wildExecution.count + ' 名，装备已收入所在城池'
                );
            }
            if (action === 'sgby_search_outcome') {
                var searchOutcome = parameters.mode;
                if (
                    searchOutcome !== SEARCH_OUTCOME_NONE &&
                    searchOutcome !== SEARCH_OUTCOME_ALL
                ) {
                    return result(false, '搜索结果模式无效');
                }
                cheatState.searchOutcome = searchOutcome;
                savePersistentCheatState();
                return result(
                    true,
                    searchOutcome === SEARCH_OUTCOME_ALL
                        ? '搜索结果已设为全部搜到'
                        : '搜索结果已设为一个都搜不到'
                );
            }
            if (action === 'sgby_recruit_captives') {
                var recruitCity = selectedOwnedCity(context);
                if (!recruitCity) return result(false, '请先在主地图选中一座我方城池');
                var recruited = recruitCaptives(context, [recruitCity]);
                appendSearchHistory(context, '手动招降', recruited.cities, null);
                return result(
                    true,
                    '已招降当前城池全部俘虏，共 ' + recruited.count + ' 名，忠诚均为 100'
                );
            }
            if (action === 'sgby_post_battle_automation') {
                cheatState.postBattleAutomation = !cheatState.postBattleAutomation;
                if (!cheatState.postBattleAutomation) {
                    cheatState.postBattleAutomationPending = false;
                    cheatState.postBattleSource = null;
                }
                savePersistentCheatState();
                return result(
                    true,
                    cheatState.postBattleAutomation
                        ? '战后自动处理已开启'
                        : '战后自动处理已关闭'
                );
            }
            if (action === 'sgby_post_battle_captive_action') {
                var captiveAction = parameters.mode;
                if (
                    captiveAction !== CAPTIVE_ACTION_RECRUIT &&
                    captiveAction !== CAPTIVE_ACTION_EXECUTE &&
                    captiveAction !== CAPTIVE_ACTION_EXILE
                ) {
                    return result(false, '俘虏处理方式无效');
                }
                cheatState.postBattleCaptiveAction = captiveAction;
                savePersistentCheatState();
                var captiveActionLabel = captiveAction === CAPTIVE_ACTION_EXECUTE
                    ? '处斩'
                    : captiveAction === CAPTIVE_ACTION_EXILE ? '流放' : '招降';
                return result(true, '战后俘虏处理方式已设为' + captiveActionLabel);
            }
            if (action === 'sgby_battle_loser_outcome') {
                var loserOutcome = parameters.mode;
                if (
                    loserOutcome !== BATTLE_LOSER_OUTCOME_ORIGINAL &&
                    loserOutcome !== BATTLE_LOSER_OUTCOME_DEATH &&
                    loserOutcome !== BATTLE_LOSER_OUTCOME_CAPTIVE &&
                    loserOutcome !== BATTLE_LOSER_OUTCOME_ESCAPE &&
                    loserOutcome !== BATTLE_LOSER_OUTCOME_WILD
                ) {
                    return result(false, '战败武将处理方式无效');
                }
                cheatState.battleLoserOutcome = loserOutcome;
                syncEngineCheatSettings();
                savePersistentCheatState();
                var loserOutcomeLabels = {};
                loserOutcomeLabels[BATTLE_LOSER_OUTCOME_ORIGINAL] = '原版算法';
                loserOutcomeLabels[BATTLE_LOSER_OUTCOME_DEATH] = '必定战死';
                loserOutcomeLabels[BATTLE_LOSER_OUTCOME_CAPTIVE] = '必定被俘';
                loserOutcomeLabels[BATTLE_LOSER_OUTCOME_ESCAPE] = '必定逃跑';
                loserOutcomeLabels[BATTLE_LOSER_OUTCOME_WILD] = '必定在野';
                return result(true, '战败武将处理已设为' + loserOutcomeLabels[loserOutcome]);
            }
            if (action === 'sgby_execute_captives') {
                var executeCity = selectedOwnedCity(context);
                if (!executeCity) return result(false, '请先在主地图选中一座我方城池');
                var executed = executeCaptives(context, [executeCity]);
                return result(
                    true,
                    '已处斩当前城池全部俘虏，共 ' + executed.count + ' 名，装备已收入城池'
                );
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
            if (action === 'sgby_wide_group_attack') {
                cheatState.wideGroupAttack = !cheatState.wideGroupAttack;
                if (!cheatState.wideGroupAttack) cheatState.groupAttackTargeting = null;
                savePersistentCheatState();
                return result(
                    true,
                    cheatState.wideGroupAttack
                        ? '扩大范围与群攻已开启，可选择自己攻击范围内全部敌军'
                        : '扩大范围与群攻已关闭，已恢复原版攻击规则'
                );
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
            wideGroupAttack: cheatState.wideGroupAttack,
            freeMovement: cheatState.freeMovement,
            autoMaxGenerals: cheatState.autoMaxGenerals,
            autoMaxCities: cheatState.autoMaxCities,
            foodProtection: cheatState.foodProtection,
            autoBattle: cheatState.autoBattle,
            autoEndTurn: cheatState.autoEndTurn,
            attackAnyCity: cheatState.attackAnyCity,
            enemyEscapeRoute: cheatState.enemyEscapeRoute,
            animationsDisabled: cheatState.animationsDisabled,
            battleSpeed2x: cheatState.battleSpeedMultiplier === 2,
            battleSpeed3x: cheatState.battleSpeedMultiplier === 3,
            battleSpeed4x: cheatState.battleSpeedMultiplier === 4,
            battleSpeed6x: cheatState.battleSpeedMultiplier === 6,
            battleSpeed8x: cheatState.battleSpeedMultiplier === 8,
            postBattleAutomation: cheatState.postBattleAutomation,
            postBattleCaptiveRecruit:
                cheatState.postBattleCaptiveAction === CAPTIVE_ACTION_RECRUIT,
            postBattleCaptiveExecute:
                cheatState.postBattleCaptiveAction === CAPTIVE_ACTION_EXECUTE,
            postBattleCaptiveExile:
                cheatState.postBattleCaptiveAction === CAPTIVE_ACTION_EXILE,
            searchOutcomeAll: cheatState.searchOutcome === SEARCH_OUTCOME_ALL,
            searchOutcomeNone: cheatState.searchOutcome === SEARCH_OUTCOME_NONE,
            battleLoserOutcomeOriginal:
                cheatState.battleLoserOutcome === BATTLE_LOSER_OUTCOME_ORIGINAL,
            battleLoserOutcomeDeath:
                cheatState.battleLoserOutcome === BATTLE_LOSER_OUTCOME_DEATH,
            battleLoserOutcomeCaptive:
                cheatState.battleLoserOutcome === BATTLE_LOSER_OUTCOME_CAPTIVE,
            battleLoserOutcomeEscape:
                cheatState.battleLoserOutcome === BATTLE_LOSER_OUTCOME_ESCAPE,
            battleLoserOutcomeWild:
                cheatState.battleLoserOutcome === BATTLE_LOSER_OUTCOME_WILD,
            factionColors: cheatState.factionColors
        });
    }

    /** @return {string} 本地搜索历史。 */
    function getSearchHistory() {
        return JSON.stringify({ok: true, records: loadSearchHistory()});
    }

    global.BbkSgby = {
        start: start,
        openSaveMenu: openSaveMenu,
        onSaveCompleted: onSaveCompleted,
        handleControl: handleControl,
        applyCheat: applyCheat,
        setWorldActivity: setWorldActivity,
        getCheatState: getCheatState,
        getSearchHistory: getSearchHistory,
        getCheatData: getCheatData
    };

    installDisplayPipeline();
})(this);
