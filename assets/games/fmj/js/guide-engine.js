;(function (global) {
    'use strict';

    var directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    var barriers = new Set([13, 20, 28, 31, 34, 39, 45, 47, 57, 58, 61, 62, 64, 65, 68, 69, 72, 77]);

    /**
     * 只读地图及路由解释器。
     *
     * 所有条件运算仅修改副本；真实传送由宿主调用原引擎的地图事件。
     * 剧情、奖励、战斗、物品消耗一律作为边界，避免导航代替玩家作决定。
     *
     * @param {Object} data 从当前 ROM 生成的地图、剧情和图块。
     */
    function Engine(data) {
        this.data = data;
        this.passiveEvents = new WeakMap();
        this.maps = new Map(data.maps.map(function (m) { return [m.id, m]; }));
        this.scripts = new Map(data.scripts.map(function (s) {
            s.byAddress = new Map(s.commands.map(function (c, i) { return [c.at, i]; }));
            return [s.id, s];
        }));
        this.objects = new Map(data.objects.map(function (o) { return [o.id, o]; }));
        // 除地图格出口外，楼梯也可能绑定 NPC 事件。预先识别真正含场景切换的事件，
        // 避免导航把商人、宝箱或其他普通互动当成通路自动执行。
        this.scripts.forEach(function (script) {
            script.transferEvents = new Set();
            script.outdoorEvents = new Set();
            script.events.forEach(function (address, index) {
                if (!address || index >= 40 && index !== 254) return;
                var pending = [script.byAddress.get(address)], seen = new Set();
                for (var budget = 0; pending.length && budget < 400; budget++) {
                    var at = pending.pop(); if (at == null || seen.has(at)) continue; seen.add(at);
                    var cmd = script.commands[at]; if (!cmd || [9, 20, 68].includes(cmd.op)) continue;
                    if ([1, 14, 66].includes(cmd.op)) {
                        script.transferEvents.add(index + 1);
                        if (cmd.op === 1 && cmd.a[0] === 1) script.outdoorEvents.add(index + 1);
                    }
                    if (cmd.op === 10) { pending.push(script.byAddress.get(cmd.a[0])); continue; }
                    if (cmd.op === 11) pending.push(script.byAddress.get(cmd.a[1]));
                    if (cmd.op === 21) pending.push(script.byAddress.get(cmd.a[2]));
                    if (cmd.op === 31) pending.push(script.byAddress.get(cmd.a[0]));
                    if (cmd.op === 39) { cmd.a.slice(13).forEach(function (address) { pending.push(script.byAddress.get(address)); }); continue; }
                    pending.push(at + 1);
                }
            });
        });
    }

    /** 按各 ROM 的地图定义识别室外，避免把金庸的店铺 type=1 当成野外。 */
    Engine.prototype.isOutdoor = function (map) {
        return !!map && (this.data.outdoorMaps ? this.data.outdoorMaps.includes(map.id) : map.type === 1);
    };

    /** @return {Object} 与真实存档隔离的导航状态副本。 */
    Engine.prototype.copy = function (state) {
        return Object.assign({}, state, {
            flags: state.flags.slice(), vars: state.vars.slice(),
            npcs: (state.npcs || []).map(function (n) { return Object.assign({}, n); })
        });
    };

    /**
     * 解释场景初始化或某个事件，直到遇到剧情边界或回到可操作主场景。
     *
     * @param {Object} input 当前场景和事件快照。
     * @param {number} eventId 0 为场景初始化，其余为原游戏事件号。
     * @return {Object} 独立的结果状态和停止原因。
     */
    Engine.prototype.simulate = function (input, eventId, previewNarrative) {
        var state = this.copy(input), script = this.scripts.get(state.scriptId);
        if (!script) return { state: state, blocked: '场景脚本不可用' };
        var pc = eventId ? script.byAddress.get(script.events[eventId - 1]) : 0;
        if (pc == null) return { state: state, blocked: '没有对应事件' };
        for (var budget = 0; budget < 500; budget++) {
            var c = script.commands[pc];
            if (!c) return { state: state, blocked: '事件没有正常结束' };
            var a = c.a, jump = null;
            // atlas 仅用于离线世界地图构建，收集已完成剧情后的地理连接；实际导航
            // 从不传入此模式，仍然必须在对白、机关、奖励和战斗前停下。
            if ((barriers.has(c.op) || this.data.gameId === 'jyqxz' && [2,16,24,29,40,41,42,43,44,48,49,50,51,53,59,60,63,73,78,79].includes(c.op)) && previewNarrative !== 'atlas' && !(previewNarrative && [13, 47, 61, 69].includes(c.op))) return { state: state, blocked: c.op === 39 ? '战斗' : '剧情或交互', at: c.at };
            switch (c.op) {
                case 9: return { state: state, stable: true };
                case 1:
                    state.mapId = a[0] + ':' + a[1]; state.x = a[2] + 4; state.y = a[3] + 3;
                    break;
                case 10: jump = a[0]; break;
                case 11: if (state.flags[a[0]]) jump = a[1]; break;
                case 12: state.vars[a[0]] = a[1]; break;
                case 21: if (state.vars[a[0]] === a[1]) jump = a[2]; break;
                case 22: state.vars[a[0]] += a[1]; break;
                case 23: state.vars[a[0]] -= a[1]; break;
                case 26: state.flags[a[0]] = true; break;
                case 27: state.flags[a[0]] = false; break;
                case 3: case 33: state.npcs = state.npcs.filter(function (n) { return n.id !== a[0]; }); break;
                case 52: state.npcs = []; break;
                case 32: case 38:
                    var object = this.objects.get((c.op === 32 ? '4:' : '2:') + a[1]);
                    state.npcs = state.npcs.filter(function (n) { return n.id !== a[0]; });
                    state.npcs.push({ id: a[0], x: a[2], y: a[3], name: object ? object.name : '事件 ' + a[0], box: c.op === 32, moving: c.op === 38 && !!(object && object.moving) });
                    break;
                case 46:
                    state.npcs.forEach(function (npc) { if (npc.id === a[0]) npc.moving = a[1] === 2 || a[1] === 3; });
                    break;
                case 6:
                    state.npcs.forEach(function (n) { if (n.id === a[0]) { n.x = a[1]; n.y = a[2]; } });
                    break;
                case 54: state.sceneName = c.text; break;
                case 67:
                    if (state.vars[a[0]] > state.vars[a[1]]) jump = a[2];
                    else if (state.vars[a[0]] < state.vars[a[1]]) jump = a[3];
                    break;
                case 76: state.vars[a[1]] = state.vars[a[0]]; break;
                case 14:
                    state.scriptId = a[0] + ':' + a[1]; state.npcs = [];
                    for (var v = 200; v < 240; v++) state.vars[v] = 0;
                    script = this.scripts.get(state.scriptId);
                    if (!script) return { state: state, blocked: '目标脚本不可用' };
                    pc = 0; continue;
                case 39: if (previewNarrative === 'atlas') jump = a[14]; break;
                case 20: if (previewNarrative === 'atlas') return { state: state, blocked: '剧情结束' }; break;
                case 68: if (previewNarrative === 'atlas') return { state: state, stable: true }; break;
                case 66: if (previewNarrative !== 'atlas') return { state: state, blocked: '子剧情' }; break;
            }
            if (jump != null) {
                pc = script.byAddress.get(jump);
                if (pc == null) return { state: state, blocked: '条件地址不可用' };
            } else pc++;
        }
        return { state: state, blocked: '路由循环' };
    };

    /** @return {boolean} 指定格是否能在当前场景实际行走。 */
    Engine.prototype.walkable = function (state, x, y, allowEvents) {
        var map = this.maps.get(state.mapId);
        if (!map || x < 4 || y < 3 || x >= map.width - 4 || y >= map.height - 2) return false;
        var cell = map.cells[y * map.width + x];
        if (!(cell & 128)) return false;
        if (!allowEvents && (cell >> 8)) {
            var script = this.scripts.get(state.scriptId);
            // 复用底图保留了未绑定的事件号，例如灯洞 2 的道路格。原引擎在这种
            // 情况下只结束空事件，仍会正常走入格子，不能误把它们当成墙。
            if (!script) return false;
            if (!this.isPassiveEvent(state, (cell >> 8) + 40)) return false;
        }
        return !(state.npcs || []).some(function (n) { return n.x === x && n.y === y; });
    };

    /**
     * 空事件或条件已经结束的事件格仍是道路。只读解释原条件，不能把所有事件格
     * 一概当成墙，也不能越过对白、战斗或会改变剧情状态的事件。
     * @return {boolean} 当前条件下是否无需执行任何互动。
     */
    Engine.prototype.isPassiveEvent = function (state, event) {
        var script = this.scripts.get(state.scriptId);
        if (!script) return false;
        if (!script.events[event - 1]) return true;
        var cache = this.passiveEvents.get(state);
        if (!cache) { cache = new Map(); this.passiveEvents.set(state, cache); }
        if (cache.has(event)) return cache.get(event);
        var result = this.simulate(state, event);
        var passive = !!result.stable && this.key(result.state) === this.key(state) && JSON.stringify(result.state.npcs) === JSON.stringify(state.npcs);
        cache.set(event, passive);
        return passive;
    };

    /**
     * 按真实四方向移动做广度优先搜索，禁止跨墙、穿 NPC 或越过未处理事件。
     *
     * @return {Object} 各格步数、前驱和可接近的地图事件。
     */
    Engine.prototype.flood = function (state, allowEvents) {
        var map = this.maps.get(state.mapId);
        if (!map) return null;
        var size = map.width * map.height, distance = new Int32Array(size), previous = new Int32Array(size);
        distance.fill(-1); previous.fill(-1);
        var start = state.y * map.width + state.x;
        if (start < 0 || start >= size) return null;
        var queue = new Int32Array(size), head = 0, tail = 1, exits = new Map();
        queue[0] = start; distance[start] = 0;
        while (head < tail) {
            var from = queue[head++], x = from % map.width, y = Math.floor(from / map.width);
            for (var d = 0; d < 4; d++) {
                var nx = x + directions[d][0], ny = y + directions[d][1];
                if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
                var next = ny * map.width + nx, event = map.cells[next] >> 8;
                if (event && !exits.has(event + 40)) exits.set(event + 40, { event: event + 40, x: nx, y: ny, anchorX: x, anchorY: y, distance: distance[from] + 1 });
                if (distance[next] < 0 && this.walkable(state, nx, ny, !!allowEvents)) {
                    distance[next] = distance[from] + 1; previous[next] = from; queue[tail++] = next;
                }
            }
        }
        return { map: map, distance: distance, previous: previous, exits: [...exits.values()] };
    };

    /** @return {Array<Object>} 指定人物/机关旁边能走到的交互位置。 */
    Engine.prototype.approaches = function (state, flood, eventId) {
        var result = [], points = [];
        if (eventId > 40) {
            flood.map.cells.forEach(function (cell, i) { if ((cell >> 8) + 40 === eventId) points.push({ x: i % flood.map.width, y: Math.floor(i / flood.map.width) }); });
        } else points = state.npcs.filter(function (n) { return n.id === eventId; });
        points.forEach(function (point) {
            directions.forEach(function (dir, direction) {
                var x = point.x - dir[0], y = point.y - dir[1];
                if (x < 0 || y < 0 || x >= flood.map.width || y >= flood.map.height) return;
                var distance = flood.distance[y * flood.map.width + x];
                if (distance >= 0) result.push({ x: x, y: y, direction: direction, eventX: point.x, eventY: point.y, distance: distance });
            });
        });
        return result.sort(function (a, b) { return a.distance - b.distance; });
    };

    /** @return {Array<Object>} 真实地图出口、NPC 楼梯和已持有引路石的合法返回事件。 */
    Engine.prototype.navigationExits = function (state, flood) {
        var exits = flood.exits.slice(), script = this.scripts.get(state.scriptId);
        if (!script) return exits;
        for (var npc of state.npcs || []) {
            if (!script.transferEvents.has(npc.id)) continue;
            var approaches = this.approaches(state, flood, npc.id);
            if (approaches.length) {
                var point = approaches[0];
                exits.push({ kind: 'object', event: npc.id, anchorX: point.x, anchorY: point.y, direction: point.direction, x: npc.x, y: npc.y, distance: point.distance + 1 });
            }
        }
        if (state.escapeItem && script.transferEvents.has(255)) exits.push({ kind: 'item', event: 255, anchorX: state.x, anchorY: state.y, distance: 0 });
        return exits;
    };

    /** @return {string} 包含场景、位置和分支变量的唯一状态键。 */
    Engine.prototype.key = function (state) {
        return state.scriptId + '/' + state.mapId + '/' + state.x + ',' + state.y + '/' +
            state.flags.map(function (f, i) { return f ? i : ''; }).filter(String).join(',') + '/' + state.vars.slice(0, 240).join(',');
    };

    /**
     * 搜索当前剧情允许的路线；路线的每次跨图均对应原游戏地图事件。
     *
     * @param {Object} initial 实时游戏快照。
     * @param {Object} goal 目标脚本、人物/机关事件或格子。
     * @return {Object|null} 可执行路线；找不到时返回最近的剧情边界提示。
     */
    Engine.prototype.route = function (initial, goal) {
        var queue = [{ state: this.copy(initial), steps: [], cost: 0 }], seen = new Set(), frontier = [], obstruction = null;
        var scheduled = new Set([this.key(initial)]);
        for (var head = 0; head < queue.length && head < 800; head++) {
            var node = queue[head], state = node.state, key = this.key(state);
            if (seen.has(key)) continue;
            seen.add(key);
            var flood = this.flood(state);
            if (!flood) continue;
            var contextMatches = !goal.navFlags || state.flags.slice(100, 114).map(Number).join('') === goal.navFlags;
            if (contextMatches && (state.scriptId === goal.scriptId || (!goal.scriptId && state.mapId === goal.mapId) || goal.outdoor && this.isOutdoor(flood.map) || goal.mapType && flood.map.type === goal.mapType)) {
                var positions;
                if (goal.event) positions = this.approaches(state, flood, goal.event);
                else if (goal.x != null) {
                    var dist = flood.distance[goal.y * flood.map.width + goal.x];
                    positions = dist >= 0 && this.walkable(state, goal.x, goal.y, true) ? [{ x: goal.x, y: goal.y, distance: dist }] : [];
                } else positions = [{ x: state.x, y: state.y, distance: 0 }];
                if (positions.length) return { steps: node.steps, arrival: positions[0], state: state, cost: node.cost + positions[0].distance };
                if (goal.event || goal.x != null) {
                    // 目标被人物或机关挡住时，仍可送到其前面。只在规划副本中移除 NPC
                    // 来识别阻挡者；落点必须经过真实碰撞搜索，绝不穿过阻挡者。
                    var relaxed = this.copy(state); relaxed.npcs = [];
                    var relaxedFlood = this.flood(relaxed, true), targets = goal.event ? this.approaches(state, relaxedFlood, goal.event) :
                        relaxedFlood.distance[goal.y * flood.map.width + goal.x] >= 0 ? [{ x: goal.x, y: goal.y }] : [];
                    if (targets.length) {
                        var path = [], at = targets[0].y * flood.map.width + targets[0].x;
                        while (at >= 0) { path.push(at); at = relaxedFlood.previous[at]; }
                        path.reverse();
                        for (var cell of path) {
                            var blocker = state.npcs.find(function (n) { return n.x === cell % flood.map.width && n.y === Math.floor(cell / flood.map.width); });
                            if (blocker) {
                                var nearby = this.approaches(state, flood, blocker.id);
                                if (nearby.length) {
                                    var stopped = { steps: node.steps, arrival: nearby[0], state: state, cost: node.cost + nearby[0].distance, blockedAt: blocker.id, mobileBlocker: !!blocker.moving };
                                    if (!blocker.moving) return stopped;
                                    // 游人临时挡路时先搜索其他真实出入口形成的绕行；没有绕行
                                    // 才返回人物前的停靠点，不能把路人当剧情机关自动交互。
                                    if (!obstruction || stopped.cost < obstruction.cost) obstruction = stopped;
                                }
                                break;
                            }
                            var event = flood.map.cells[cell] >> 8;
                            if (goal.allowBoundary && event && flood.distance[cell] < 0) {
                                var gates = this.approaches(state, flood, event + 40);
                                var gate = gates.find(function (p) { return p.eventX === cell % flood.map.width && p.eventY === Math.floor(cell / flood.map.width); });
                                if (gate) return { steps: node.steps, arrival: gate, state: state, cost: node.cost + gate.distance,
                                    boundary: true, exit: { kind: 'road_event', event: event + 40, x: gate.eventX, y: gate.eventY, anchorX: gate.x, anchorY: gate.y, direction: gate.direction } };
                                break;
                            }
                        }
                    }
                }
            }
            for (var exit of this.navigationExits(state, flood)) {
                var input = this.copy(state); input.x = exit.anchorX; input.y = exit.anchorY;
                var outcome = this.simulate(input, exit.event);
                if (outcome.blocked) {
                    // 只把可接近且有真实交互的边界留给玩家，不执行其对白或战斗。
                    if (outcome.at) frontier.push({ state: state, steps: node.steps, arrival: { x: exit.anchorX, y: exit.anchorY }, exit: exit, reason: outcome.blocked, input: input, cost: node.cost + exit.distance });
                    continue;
                }
                // input 已移到出口旁，必须比较事件执行前后的状态。若与原 node 比较，
                // 单纯走路产生的坐标差异会把无效果事件误判成转场，耗尽搜索预算。
                var outcomeKey = this.key(outcome.state);
                if (outcome.stable && outcomeKey !== this.key(input) && !scheduled.has(outcomeKey)) {
                    scheduled.add(outcomeKey);
                    queue.push({ state: outcome.state, steps: node.steps.concat([{
                        scriptId: state.scriptId, mapId: state.mapId, exit: exit,
                        toScriptId: outcome.state.scriptId, toMapId: outcome.state.mapId
                    }]), cost: node.cost + exit.distance });
                }
            }
        }
        if (goal.allowBoundary) {
            // 首次出山等路径会先播放一句剧情。只读预测该句后的通路用于选择入口，
            // 执行时依旧在该句开始处停下，由玩家正常读完；不会跳过或自动回答对白。
            var boundary = null;
            for (var candidate of frontier) {
                var preview = this.simulate(candidate.input, candidate.exit.event, true);
                if (preview.state.scriptId === candidate.state.scriptId && preview.state.mapId === candidate.state.mapId) continue;
                var target = this.scripts.get(goal.scriptId);
                var matches = preview.state.scriptId === goal.scriptId || target && target.maps.includes(preview.state.mapId) || goal.outdoor && this.isOutdoor(this.maps.get(preview.state.mapId)) || goal.mapType && this.maps.get(preview.state.mapId)?.type === goal.mapType;
                var onward = matches ? { steps: [], cost: 0 } : preview.stable ? this.route(preview.state, Object.assign({}, goal, { allowBoundary: false })) : null;
                if (onward && !onward.unavailable && (!boundary || candidate.cost + onward.cost < boundary.score)) {
                    boundary = Object.assign({}, candidate, { boundary: true, score: candidate.cost + onward.cost });
                }
            }
            if (boundary) return boundary;
            // 有些出口接的是先战斗/再演出的场景，不能越过战斗预测通路。仅把玩家
            // 送到距离任务更近的真实入口，执行原事件后交还控制。
            var graphDistance = function (from, to, scripts) {
                var queue = [[from, 0]], known = new Set();
                for (var i = 0; i < queue.length && i < 300; i++) {
                    var entry = queue[i]; if (entry[0] === to) return entry[1];
                    if (known.has(entry[0])) continue; known.add(entry[0]);
                    var script = scripts.get(entry[0]); if (!script) continue;
                    script.commands.forEach(function (c) { if (c.op === 14 || c.op === 66) queue.push([c.a[0] + ':' + c.a[1], entry[1] + 1]); });
                }
                return Infinity;
            };
            var initialHops = graphDistance(initial.scriptId, goal.scriptId, this.scripts), closest = null;
            for (var stop of frontier) {
                var preview = this.simulate(stop.input, stop.exit.event, true);
                if (preview.state.scriptId === stop.state.scriptId) continue;
                var hops = graphDistance(preview.state.scriptId, goal.scriptId, this.scripts);
                if (hops < initialHops && (!closest || hops < closest.hops || hops === closest.hops && stop.cost < closest.cost)) closest = Object.assign({}, stop, { hops: hops, boundary: true });
            }
            if (closest) return closest;
            if (this.data.gameId === 'jyqxz' && goal.scriptId) {
                // 马车、渡船和引路石在二选一/菜单之后才转场。只把玩家送到
                // 原交互入口，由玩家决定去向；不能跳过车票、载重或物品消耗。
                var choiceBoundary = null;
                for (var stop of frontier) {
                    var definition = this.scripts.get(stop.state.scriptId), address = definition.events[stop.exit.event - 1];
                    var pending = [definition.byAddress.get(address)], checked = new Set();
                    for (var budget = 0; pending.length && budget < 500; budget++) {
                        var index = pending.pop(); if (index == null || checked.has(index)) continue; checked.add(index);
                        var command = definition.commands[index]; if (!command || [9,20,68].includes(command.op)) continue;
                        if (command.op === 14 || command.op === 66) {
                            var hops = graphDistance(command.a[0] + ':' + command.a[1], goal.scriptId, this.scripts);
                            if (hops < initialHops && (!choiceBoundary || hops < choiceBoundary.hops || hops === choiceBoundary.hops && stop.cost < choiceBoundary.cost)) choiceBoundary = Object.assign({}, stop, { hops: hops, boundary: true });
                            continue;
                        }
                        if (command.op === 10) { pending.push(definition.byAddress.get(command.a[0])); continue; }
                        if (command.op === 11) { pending.push(stop.state.flags[command.a[0]] ? definition.byAddress.get(command.a[1]) : index + 1); continue; }
                        if (command.op === 31) pending.push(definition.byAddress.get(command.a[0]));
                        if (command.op === 21) pending.push(definition.byAddress.get(command.a[2]));
                        if ([57,63,65].includes(command.op)) pending.push(definition.byAddress.get(command.a[command.a.length - 1]));
                        if ([58,67].includes(command.op)) command.a.slice(-2).forEach(function (at) { pending.push(definition.byAddress.get(at)); });
                        pending.push(index + 1);
                    }
                }
                if (choiceBoundary) return choiceBoundary;
            }
            if (goal.mapType === 1) {
                var storyExit = frontier.filter(function (stop) {
                    return stop.exit.kind === 'object' && this.scripts.get(stop.state.scriptId)?.outdoorEvents.has(stop.exit.event);
                }, this).sort(function (a, b) { return a.cost - b.cost; })[0];
                if (storyExit) return Object.assign({}, storyExit, { boundary: true });
            }
        }
        if (obstruction) return obstruction;
        if (!goal.dynamicProbe && (initial.npcs || []).some(function (npc) { return npc.moving; })) {
            var relaxed = this.copy(initial); relaxed.npcs = relaxed.npcs.filter(function (npc) { return !npc.moving; });
            var probe = this.route(relaxed, Object.assign({}, goal, { dynamicProbe: true }));
            if (!probe.unavailable) {
                // 行人也可能堵住离开当前地图的唯一道路；只读移除用于判断原因，
                // 实际计划仍停在原道路上，由执行器等待行人自然让路。
                var flood = this.flood(initial), candidates = [];
                initial.npcs.filter(function (npc) { return npc.moving; }).forEach(function (npc) {
                    var point = this.approaches(initial, flood, npc.id)[0];
                    if (point) candidates.push({ npc: npc, point: point });
                }, this);
                candidates.sort(function (a, b) { return a.point.distance - b.point.distance; });
                if (candidates.length) return { steps: [], state: this.copy(initial), arrival: candidates[0].point, blockedAt: candidates[0].npc.id, mobileBlocker: true, cost: candidates[0].point.distance };
            }
        }
        return { unavailable: true, frontier: frontier, visited: seen.size };
    };

    /** @return {Object} 对应真实剧情标记的下一任务；物品前置条件只作提醒。 */
    Engine.prototype.nextGoal = function (s) {
        var f = s.flags, make = function (label, scriptId, event, hint) { return { label: label, scriptId: scriptId, event: event || 0, hint: hint || '到达后按确认键与人物或机关交互。' }; };
        if (f[1]) return make('见师父，领取任务', '2:2', 9);
        if (!f[19]) {
            for (var lamp = 0; lamp < 8; lamp++) if (!f[11 + lamp]) return make('完成护灯试炼 ' + (lamp + 1), '2:' + (19 + lamp), 1);
            return make('取伏魔剑', '2:18', 1);
        }
        if (!f[21]) return make('把伏魔剑交给师父', '2:2', 9);
        if (!f[202]) return make('拜访忘忧村村长', '3:9', 1);
        if (!f[203]) return make('调查村南瘴气林', '4:1', 42);
        if (!f[204]) return make('向猎户问路', '4:2', 1);
        if (!f[208]) return make('向鲁斧借芦藤甲', '5:13', 1);
        if (!f[209]) return make('进入李府，处理门卫', '5:1', 1);
        if (!f[210]) return make('击败李虎，夺回芦藤甲', '5:15', 1);
        if (!f[215] && (!f[2000] || !f[2001])) return make('装备芦藤雌甲与雄甲', s.scriptId, 0, '分别让小梅与清风装备对应护甲，再进入瘴气林。');
        if (!f[215]) return make('到蛇窟深处除妖', '4:8', 43);
        if (!f[216] && s.scriptId.startsWith('4:')) return make('找到蛇窟出口，赶回忘忧村', '4:9', 42);
        if (!f[216]) return make('回三清宫复命', '2:2', 9);
        if (!f[217]) return make('邀请小梅再次同行', '3:11', 1);
        if (!f[219]) return make('赶往钟山，与袁姑娘会合', '6:13', 0);
        if (!f[220]) return make('解救钟山道院', '8:3', 0);
        if (!f[221]) return make('进入霸王钟洞，守护宝钟', '8:10', 0);
        if (!f[224]) return make('向钟山师叔报告失钟', '8:2', 0);
        if (!f[225]) return make('向建业客栈掌柜打听袁姑娘', '7:2', 45);
        if (!f[226]) return make('向白水镇客栈打听失童案', '9:5', 43);
        if (!f[228] && !f[227]) return make('询问老宅守卫', '9:1', 1);
        if (!f[227]) return make('说服白水镇长', '9:4', 1);
        if (!f[229]) return make('请门口镇长让守卫放行', '9:1', 3);
        if (!f[230] && !f[232]) return make('查看老宅主房，寻找井口声音', '9:11', 1);
        if (!f[232]) return make('进入老宅井下，寻找袁姑娘', '9:13', 45);
        if (!f[231]) {
            var stone = s.scriptId === '9:13' && (s.npcs || []).find(function (n) { return n.id >= 1 && n.id <= 8; });
            return make('处理摄魂阵' + (stone ? '石头 ' + stone.id : '的八处石头'), '9:13', stone ? stone.id : 0);
        }
        if (!f[233]) return make('与赤血对峙', '9:13', 45);
        if (!f[234]) return make('返回白水镇报告救人结果', '9:1', 0);
        if (!f[235]) return make('询问南北村的预言', '10:1', 5);
        if (!f[236]) return make('拜访周处', '10:2', 42);
        if (!f[238]) return make('进入南山寻找白虎', '12:3', 1);
        if (!f[239]) return make('返回南北村，查看受腥风伤害的村民', '10:1', 6);
        if (!f[240]) return make('向周处求取无忧丹', '10:2', 42);
        if (!f[241]) return make('救治受腥风伤害的村民', '10:1', 6);
        if (!f[245]) return make('北海追查苍龙', '13:2', !f[243] ? 1 : !f[244] ? 2 : 43);
        if (!f[246]) return make('回周处庙领取酬谢', '10:2', 42);
        if (!f[247]) return make('向酆都居民打听鬼事', '11:1', 1);
        if (!f[248]) return s.scriptId === '11:10' ? make('夜访酆都，寻找白无常', '11:10', 1) : make('向客栈掌柜打听并住店', '11:4', 43);
        if (!f[249]) return make('前往城隍庙，寻找鬼王', '11:10', 51);
        if (!f[250]) return make('向鬼王追查霸王钟，开放北行道路', '11:10', 2);
        if (!f[251]) return make('通过鹤鸣山洞口守卫', '14:8', 43);
        if (!f[252]) return make('面对鹤鸣山天道', '14:8', 1);
        if (!f[253]) {
            var mechanism = !f[1100] ? 22 : s.vars[1] === 1 ? 3 : s.vars[1] === 2 ? 4 : s.vars[1] === 3 ? 5 : 2;
            return make('寻找玄武：' + (!f[1100] ? '查看洞中文字' : '触发机关'), '14:9', mechanism);
        }
        if (!f[254]) return make('深入天师陵墓', '14:11', 1);
        if (!f[259] && !f[2002]) return make('装备天心灯，准备回山', s.scriptId, 0, '天心灯需要装备生效；四象精魄归位后再触发阵心。');
        if (!f[259]) return make('返回三清山，破解四象阵', '2:32', !f[255] ? 7 : !f[256] ? 3 : !f[257] ? 5 : !f[258] ? 1 : 9);
        if (!f[260]) return make('进入无机洞面对师父', '1:5', 45);
        return make('回伏魔洞，将混元金斗正位', '2:18', 17);
    };

    /**
     * 规划当前真实主线目标的路线，并保留沿途道路、剧情和机关的通行条件。
     *
     * 初始化目的地和直接跨越墙壁均不属于此能力。目标判定包含迷宫出口和各机关，
     * 在通路允许时直接抵达交互点旁，不要求玩家再次从地图中选择一个模糊场景。
     * @return {Object} 沿原出入口执行的路线。
     */
    Engine.prototype.taskPlan = function (initial) {
        var goal = this.nextGoal(initial);
        return Object.assign(this.route(initial, Object.assign({}, goal, { allowBoundary: true })), { goal: goal });
    };

    /**
     * 前往当前迷宫或建筑的外部入口。所有返回均由已有出口/楼梯/道具事件完成。
     *
     * 脚本场景没有对外通路时不能凭地图编号直接换图；引路石返回也必须已经持有。
     * @return {Object} 通往室外的合法路线。
     */
    Engine.prototype.exitPlan = function (initial) {
        var map = this.maps.get(initial.mapId);
        if (!map || this.isOutdoor(map)) return { unavailable: true, reason: 'outside' };
        var result = this.route(initial, this.data.outdoorMaps ? { outdoor: true, allowBoundary: true } : { mapType: 1, allowBoundary: true });
        if (!result.unavailable) return result;
        var task = this.nextGoal(initial);
        if (task.scriptId === initial.scriptId && task.event) {
            var preparation = this.route(initial, task);
            if (!preparation.unavailable) return Object.assign(preparation, { preparation: task.label });
        }
        return result;
    };

    /** @return {Array<Object>} 可由原存档事件验证的故事里程碑，读档会同步回退。 */
    Engine.prototype.progress = function (state) {
        var definitions = [
            [21, '伏魔剑试炼', '取剑复命，获准下山'], [202, '忘忧村', '村长说明蛇妖之患，小梅加入'],
            [203, '毒瘴林', '发现瘴气阻路'], [204, '猎户线索', '得知芦藤甲与鲁斧'], [208, '石梦城', '接下夺回芦藤甲的任务'],
            [209, '李府门卫', '进入李府'], [210, '李虎', '夺回芦藤雌雄甲'], [215, '蛇窟', '洞中击败蛇妖'],
            [216, '回山复命', '收到援助钟山的任务'], [217, '再度同行', '小梅决定一同去钟山'], [218, '建业相遇', '触发袁萍芷街头事件'],
            [219, '袁姑娘同行', '开启袁萍芷加入事件'], [220, '钟山道院', '开启钟山师叔剧情'], [221, '钟山失守', '霸王钟失窃'],
            [224, '追寻霸王钟', '奉命寻找袁姑娘与宝钟'], [225, '建业线索', '得知袁姑娘去了白水镇'], [226, '白水镇', '了解失童案'],
            [227, '老宅许可', '镇长同意调查'], [232, '摄魂阵', '得知破阵方法'], [231, '营救袁姑娘', '八处阵位处理完成'],
            [233, '再战赤血', '除去摄魂阵中的赤血'], [234, '救出孩童', '得到向北追钟的线索'], [235, '南北村', '听见一男两女的预言'],
            [236, '周处委托', '接受调查白虎与苍龙的任务'], [238, '南山白虎', '获得白虎之精'], [240, '无忧丹', '周处交付救治丹药'],
            [241, '救治村民', '开启交付无忧丹事件'], [245, '北海苍龙', '获得苍龙之精'], [246, '周处酬谢', '获得《周处除三害》'],
            [248, '夜访酆都', '白无常一战完成'], [249, '城隍庙', '听鬼王讲述群魔复活'], [250, '鬼王线索', '得知天道和鹤鸣山，开放北行道路'], [252, '天道败亡', '开启朱雀真相揭露'],
            [253, '玄武', '获得玄武之精'], [254, '天师证言', '获得天心灯并确认无机入魔'], [259, '四象诛仙阵', '破阵取得混元金斗'],
            [260, '无机解脱', '击散无机心魔']
        ];
        return definitions.map(function (d) { return { flag: d[0], title: d[1], detail: d[2], done: !!state.flags[d[0]] }; });
    };

    /**
     * 根据真实出入口把当前开放的室外道路尽量拼接成区域图。
     *
     * 入口格与新场景落点按同一格距对齐；复用底图以脚本及分支状态区分。
     * 如果闭环要求两个位置重叠，保留为带虚线的独立图层，不虚构跨层距离。
     *
     * @param {Object} initial 区域的剧情快照。
     * @return {Object} 区域场景与真实连接边。
     */
    Engine.prototype.region = function (initial) {
        var seed = this.copy(initial), seedMap = this.maps.get(seed.mapId);
        if (!seedMap) return { cards: [], links: [] };
        // 室内和迷宫单独展开；先从实际出口寻找可达室外，最多走 24 个连接场景。
        var pending = [seed], starts = new Set();
        for (var i = 0; !this.isOutdoor(this.maps.get(seed.mapId)) && i < pending.length && i < 24; i++) {
            var candidate = pending[i], identity = candidate.scriptId + '/' + candidate.mapId;
            if (starts.has(identity)) continue; starts.add(identity);
            var flood = this.flood(candidate); if (!flood) continue;
            for (var exit of this.navigationExits(candidate, flood)) {
                var result = this.simulate(candidate, exit.event);
                if (!result.stable) continue;
                if (this.isOutdoor(this.maps.get(result.state.mapId))) { seed = result.state; break; }
                pending.push(result.state);
            }
        }
        if (!this.isOutdoor(this.maps.get(seed.mapId))) return { cards: [], links: [] };
        var key = function (s) { return s.scriptId + '/' + s.mapId + '/' + s.flags.slice(100, 114).map(Number).join('') + '/' + s.vars.slice(200).join(','); };
        var cards = [], links = [], known = new Map(), queue = [{ state: seed, x: 0, y: 0 }];
        var intersects = function (a, b) {
            return Math.min(a.x + a.width - 64, b.x + b.width - 64) - Math.max(a.x + 64, b.x + 64) > 16 &&
                Math.min(a.y + a.height - 32, b.y + b.height - 32) - Math.max(a.y + 48, b.y + 48) > 16;
        };
        for (var head = 0; head < queue.length && cards.length < 90; head++) {
            var node = queue[head], state = node.state, id = key(state);
            if (known.has(id)) continue;
            var map = this.maps.get(state.mapId), card = { map: map, state: state, x: node.x, y: node.y, width: map.width * 16, height: map.height * 16 };
            if (cards.some(function (c) { return intersects(c, card); })) {
                card.x = Math.max.apply(null, cards.map(function (c) { return c.x + c.width; })) + 100;
                card.y = 0; card.detached = true;
            }
            known.set(id, card); cards.push(card);
            var flood = this.flood(state); if (!flood) continue;
            for (var exit of this.navigationExits(state, flood)) {
                var input = this.copy(state); input.x = exit.anchorX; input.y = exit.anchorY;
                var result = this.simulate(input, exit.event), targetMap = this.maps.get(result.state.mapId);
                if (!result.stable || !targetMap || !this.isOutdoor(targetMap) || key(result.state) === id) continue;
                var child = key(result.state), targetX = card.x + (exit.x - result.state.x) * 16, targetY = card.y + (exit.y - result.state.y) * 16;
                links.push({ from: id, to: child, source: { x: exit.x, y: exit.y }, target: { x: result.state.x, y: result.state.y }, event: exit.event });
                if (!known.has(child)) queue.push({ state: result.state, x: targetX, y: targetY });
            }
        }
        links = links.filter(function (link) { return known.has(link.from) && known.has(link.to); }).map(function (link) {
            var from = known.get(link.from), to = known.get(link.to);
            var start = { x: from.x + (link.source.x + 0.5) * 16, y: from.y + (link.source.y + 0.5) * 16 };
            var end = { x: to.x + (link.target.x + 0.5) * 16, y: to.y + (link.target.y + 0.5) * 16 };
            return { from: from, to: to, start: start, end: end, portal: Math.hypot(start.x - end.x, start.y - end.y) > 20 };
        });
        return { cards: cards, links: links };
    };

    global.FmjGuideEngine = Engine;
})(typeof window === 'undefined' ? globalThis : window);
