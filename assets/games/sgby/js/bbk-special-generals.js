;(function (global) {
    'use strict';

    var SLOT_PREFIX = 'baye/bbkSgbyHiddenGenerals/slot-';
    var ABSENT = 0xffff;
    var BATTLE = 27;

    /**
     * 创建特殊武将隐藏管理器。备份跟随实际存档档位，不跨新开局或不同档位复用。
     *
     * 隐藏使用核心已有的“无城市、无命令、不可登场”状态，不触发死亡或战果Hook。
     * 修改仅在战略安全边界进行；君主继承方案全部可行后才写数据，避免只隐藏一半。
     * @param {Object} options 上下文、安全状态、持久开关及君主切换通知。
     * @return {Object} 隐藏、恢复与存读档入口。
     */
    function create(options) {
        var backups = [];
        var cachedIndexes = null;

        /** 引擎绑定的是带length和数字属性的对象，不依赖Array.prototype方法。 */
        function each(values, action) {
            if (!values) return;
            for (var index = 0; index < values.length; index++) action(values[index], index);
        }

        function specialIndexes(context) {
            if (cachedIndexes) return cachedIndexes;
            cachedIndexes = [];
            var count = typeof baye.getPersonCount === 'function'
                ? Math.min(context.people.length, baye.getPersonCount()) : context.people.length;
            for (var index = 0; index < count; index++) {
                var name = String(baye.getPersonName(index) || '').replace(/\s/g, '');
                if (name === '通宵虫' || name === '通宵蟲' || name === '南方小鬼') {
                    cachedIndexes.push(index);
                }
            }
            return cachedIndexes;
        }

        /** 读取真实城市队列，不能用原势力推测执行命令中的武将位置。 */
        function locations(context) {
            var result = {};
            each(context.cities, function (city, cityIndex) {
                for (var offset = 0; offset < city.Persons; offset++) {
                    result[context.data.g_PersonsQueue[city.PersonQueue + offset]] = cityIndex;
                }
            });
            each(context.data.g_OrderQueue, function (order) {
                if (order.OrderId === 0xff) return;
                if (order.OrderId !== BATTLE) {
                    if (result[order.Person] == null) result[order.Person] = order.City;
                    return;
                }
                var bytes = context.data.FIGHTERS;
                if (!bytes || order.Person < 0 || order.Person >= 30) return;
                for (var slot = 0; slot < 10; slot++) {
                    var start = order.Person * 20 + slot * 2;
                    var id = bytes[start] | (bytes[start + 1] << 8);
                    if (id && result[id - 1] == null) result[id - 1] = order.City;
                }
            });
            return result;
        }

        /** 重新选择实际驻城的同阵营太守，不改变城池、人物和命令归属。 */
        function updateSatraps(context) {
            each(context.cities, function (city) {
                var best = -1;
                for (var offset = 0; offset < city.Persons; offset++) {
                    var index = context.data.g_PersonsQueue[city.PersonQueue + offset];
                    var person = context.people[index];
                    if (city.Belong && person && person.Belong === city.Belong &&
                        (best < 0 || person.IQ > context.people[best].IQ)) best = index;
                }
                city.SatrapId = best < 0 ? 0 : best + 1;
            });
        }

        /** 清理隐藏人物的排队命令；同队其他武将保留，外交目标失效则正常归还执行者。 */
        function removeFromOrders(context, indexes) {
            each(context.data.g_OrderQueue, function (order) {
                if (order.OrderId === 0xff) return;
                if (order.OrderId !== BATTLE) {
                    if (indexes.indexOf(Number(order.Person)) >= 0) order.OrderId = 0xff;
                    else if ((order.OrderId === 6 || (order.OrderId >= 15 && order.OrderId <= 19)) &&
                        indexes.indexOf(Number(order.Object)) >= 0) order.OrderId = 0;
                    return;
                }
                var bytes = context.data.FIGHTERS;
                var slot = Number(order.Person);
                if (!bytes || slot < 0 || slot >= 30) return;
                var fighters = [];
                for (var i = 0; i < 10; i++) {
                    var start = slot * 20 + i * 2;
                    var id = bytes[start] | (bytes[start + 1] << 8);
                    if (id && indexes.indexOf(id - 1) < 0) fighters.push(id);
                }
                for (i = 0; i < 10; i++) {
                    id = fighters[i] || 0;
                    bytes[slot * 20 + i * 2] = id & 255;
                    bytes[slot * 20 + i * 2 + 1] = id >> 8;
                }
                if (!fighters.length) {
                    order.OrderId = 0xff;
                    if (context.data.FIGHTERS_IDX) context.data.FIGHTERS_IDX[slot] = 0;
                    var city = context.cities[order.City];
                    if (city) city.Food = Math.min(65535, city.Food + (Number(order.Food) || 0));
                }
            });
        }

        /**
         * 隐藏两名武将；同势力非隐藏武将按驻城、智力、武力、编号依次选择继任者。
         * 无合法继任者时不修改任何人物，向用户说明需要先为该势力补充一名武将。
         * @return {{ok:boolean,message:string}} 操作结果。
         */
        function apply() {
            var context = options.getContext();
            if (!context) return {ok: false, message: '请先开始或载入游戏'};
            if (options.isBattleActive(context.data)) {
                return {ok: false, message: '请回到战略地图后切换特殊武将隐藏'};
            }
            var indexes = specialIndexes(context);
            var cityIndexes = locations(context);
            var pending = indexes.filter(function (index) {
                return !backups.some(function (saved) {return saved.index === index;}) &&
                    (context.people[index].Belong !== ABSENT || cityIndexes[index] != null);
            });
            var replacements = {};
            for (var i = 0; i < pending.length; i++) {
                var index = pending[i];
                if (context.people[index].Belong !== index + 1) continue;
                var best = -1;
                each(context.people, function (person, candidate) {
                    if (!person || person.Belong !== index + 1 || indexes.indexOf(candidate) >= 0) return;
                    if (best < 0 ||
                        (cityIndexes[candidate] != null && cityIndexes[best] == null) ||
                        ((cityIndexes[candidate] != null) === (cityIndexes[best] != null) &&
                            (person.IQ > context.people[best].IQ ||
                                (person.IQ === context.people[best].IQ && person.Force > context.people[best].Force)))) {
                        best = candidate;
                    }
                });
                if (best < 0) return {ok: false, message: baye.getPersonName(index) + '所在势力没有可继任武将，请先补充武将'};
                replacements[index + 1] = best + 1;
            }
            pending.forEach(function (index) {
                var person = context.people[index];
                backups.push({index: index, belong: replacements[person.Belong] || person.Belong,
                    oldBelong: replacements[person.OldBelong] || person.OldBelong || 0,
                    arms: person.Arms, city: cityIndexes[index] == null ? -1 : cityIndexes[index]});
            });
            Object.keys(replacements).forEach(function (old) {
                var previous = Number(old), successor = replacements[old];
                context.people[successor - 1].Devotion = 100;
                each(context.people, function (person) {
                    if (person.Belong === previous) person.Belong = successor;
                    if (person.OldBelong === previous) person.OldBelong = successor;
                });
                each(context.cities, function (city) {if (city.Belong === previous) city.Belong = successor;});
                backups.forEach(function (saved) {
                    if (saved.belong === previous) saved.belong = successor;
                    if (saved.oldBelong === previous) saved.oldBelong = successor;
                });
                if (context.data.g_PlayerKing + 1 === previous) {
                    context.data.g_PlayerKing = successor - 1;
                    options.onPlayerRulerChanged(successor);
                }
            });
            removeFromOrders(context, pending);
            pending.forEach(function (index) {
                each(context.cities, function (_, city) {baye.deletePersonInCity(city, index);});
                context.people[index].Belong = ABSENT;
                context.people[index].OldBelong = 0;
                context.people[index].Arms = 0;
            });
            updateSatraps(context);
            return {ok: true, message: '已隐藏通宵虫和南方小鬼，原有君主已由同势力武将继任'};
        }

        /** 恢复原兵力及普通武将身份；原势力灭亡时按原城市当前归属落位，不恢复君主。 */
        function restore() {
            var context = options.getContext();
            if (!context || options.isBattleActive(context.data)) {
                return {ok: false, message: '请回到战略地图后恢复特殊武将'};
            }
            backups.forEach(function (saved) {
                var person = context.people[saved.index];
                if (!person || person.Belong !== ABSENT) return;
                var ruler = context.people[saved.belong - 1];
                var belong = ruler && ruler.Belong !== ABSENT ? ruler.Belong : 0;
                var city = -1;
                if (belong > 0) {
                    each(context.cities, function (value, index) {
                        if (value.Belong === belong && (city < 0 || index === saved.city)) city = index;
                    });
                }
                if (city < 0 && saved.city >= 0 && context.cities[saved.city]) {
                    city = saved.city;
                    belong = context.cities[city].Belong;
                }
                person.Belong = belong === saved.index + 1 ? 0 : belong;
                person.OldBelong = saved.oldBelong;
                person.Arms = saved.arms;
                if (city >= 0) baye.putPersonInCity(city, saved.index);
            });
            backups = [];
            updateSatraps(context);
            return {ok: true, message: '已恢复通宵虫和南方小鬼，原君主保留普通武将身份'};
        }

        function save(event) {
            var slot = event ? Number(event.slotIndex) : NaN;
            if (!Number.isInteger(slot) || slot < 0 || slot > 3) return;
            try {
                var key = SLOT_PREFIX + slot;
                var encoded = JSON.stringify({version: 1, people: backups});
                global.localStorage.setItem(key, encoded);
                if (global.BbkSaveChannel) {
                    var entries = {};
                    entries[key] = encoded;
                    global.BbkSaveChannel.postMessage(JSON.stringify({entries: entries}));
                }
            } catch (_) {
                options.notice(false, '特殊武将恢复数据保存失败，请检查存储空间并重新存档');
            }
        }

        function load(event) {
            backups = [];
            cachedIndexes = null;
            var context = options.getContext();
            var slot = event ? Number(event.slotIndex) : NaN;
            if (!context || !Number.isInteger(slot) || slot < 0 || slot > 3) return;
            try {
                var saved = JSON.parse(global.localStorage.getItem(SLOT_PREFIX + slot));
                var indexes = specialIndexes(context);
                if (saved && saved.version === 1 && Array.isArray(saved.people) && saved.people.length <= 2) {
                    var occupied = locations(context);
                    backups = saved.people.filter(function (person) {
                        return person && indexes.indexOf(person.index) >= 0 &&
                            context.people[person.index].Belong === ABSENT && occupied[person.index] == null &&
                            Number.isInteger(person.belong) && person.belong >= 0 && person.belong <= ABSENT &&
                            Number.isInteger(person.oldBelong) && person.oldBelong >= 0 && person.oldBelong <= ABSENT &&
                            Number.isInteger(person.arms) && person.arms >= 0 && person.arms <= 65535 &&
                            Number.isInteger(person.city) && person.city >= -1 && person.city < context.cities.length;
                    });
                }
            } catch (_) { /* 旧档无附属数据时不使用其他档位的备份，也不复活已战死人物。 */ }
            var result = options.isEnabled() ? apply() : restore();
            if (!result.ok) options.notice(false, result.message);
        }

        return {
            apply: apply, restore: restore, save: save, load: load,
            newGame: function () {
                backups = [];
                cachedIndexes = null;
                if (options.isEnabled()) {
                    var result = apply();
                    if (!result.ok) options.notice(false, result.message);
                }
            }
        };
    }

    global.BbkSgbySpecialGenerals = {create: create};
})(this);
