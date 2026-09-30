import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const enhancementSource = readFileSync(
  new URL('../assets/games/sgby/js/bbk-enhancements.js', import.meta.url),
  'utf8',
);

/**
 * 创建最小可运行的三国霸业脚本环境。
 *
 * 这里只模拟增强脚本实际访问的数据结构，不复制游戏算法；测试目标是验证增强层是否
 * 正确调用 Hook、修改城池队列数据，并且不会把玩家规则错误地应用到敌方。
 */
function createHarness(storage = new Map(), options = {}) {
  const returnedTools = [];
  const sentKeys = [];
  const scheduledDelays = [];
  const scheduledTimers = [];
  const drawnImages = [];
  const systemMessages = [];
  const people = [
    person({Belong: 1, Force: 82, IQ: 91, Arms: 100}),
    person({Belong: 1, Force: 76, IQ: 64, Arms: 200}),
    person({Belong: 0, Force: 93, IQ: 88, Arms: 300}),
    person({Belong: 0xffff, Tool1: 5, Tool2: 6, Arms: 400}),
    person({Belong: 5, Force: 95, IQ: 90, Arms: 500}),
    person({Belong: 5, Force: 80, IQ: 85, Arms: 600}),
    person({Belong: 0, Force: 70, IQ: 96, Arms: 700}),
    person({Belong: 5, Force: 78, IQ: 82, Arms: 550}),
  ];
  const data = {
    g_PlayerKing: 0,
    g_YearDate: 190,
    g_MonthDate: 9,
    g_PIdx: 1,
    g_Persons: people,
    g_Cities: [
      {
        Belong: 1,
        PersonQueue: 0,
        Persons: 4,
        ToolQueue: 0,
        Tools: 2,
        Food: 0,
        MothballArms: 10,
        State: 0,
        Farming: 10,
        FarmingLimit: 900,
        Commerce: 20,
        CommerceLimit: 800,
        Population: 30,
        PopulationLimit: 700,
        PeopleDevotion: 40,
        AvoidCalamity: 50,
      },
      {
        Belong: 5,
        PersonQueue: 7,
        Persons: 0,
        ToolQueue: 3,
        Tools: 0,
        Food: 100,
        MothballArms: 0,
        State: 0,
        Farming: 10,
        FarmingLimit: 900,
        Commerce: 20,
        CommerceLimit: 800,
        Population: 30,
        PopulationLimit: 700,
        PeopleDevotion: 40,
        AvoidCalamity: 50,
      },
      {
        Belong: 5,
        PersonQueue: 4,
        Persons: 2,
        ToolQueue: 2,
        Tools: 0,
        Food: 100,
        MothballArms: 0,
        State: 0,
        Farming: 10,
        FarmingLimit: 900,
        Commerce: 20,
        CommerceLimit: 800,
        Population: 30,
        PopulationLimit: 700,
        PeopleDevotion: 40,
        AvoidCalamity: 50,
      },
      {
        Belong: 1,
        PersonQueue: 6,
        Persons: 1,
        ToolQueue: 2,
        Tools: 1,
        Food: 100,
        MothballArms: 0,
        State: 0,
        Farming: 10,
        FarmingLimit: 900,
        Commerce: 20,
        CommerceLimit: 800,
        Population: 30,
        PopulationLimit: 700,
        PeopleDevotion: 40,
        AvoidCalamity: 50,
      },
    ],
    g_PersonsQueue: [0, 1, 2, 3, 4, 5, 6],
    g_GoodsQueue: [3, 0x8004, 7],
    g_CityPositions: [
      {x: 0, y: 0},
      {x: 1, y: 0},
      {x: 2, y: 0},
      {x: 3, y: 0},
    ],
    g_CityPos: {x: 0, y: 0, setx: 0, sety: 0},
    g_engineConfig: {
      maxLevel: 20,
      ratioOfFoodToArmsPerMouth: 50,
      aiWorldActivity: 25,
      battleLoserOutcome: 0,
      autoBattleDefense: 0,
    },
    g_FgtParam: {
      Mode: 1,
      CityIndex: 2,
      MProvender: 100,
      EProvender: 100,
      GenArray: [1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 5, 6, 8],
    },
    g_GenPos: Array.from({length: 20}, () => ({
      x: 0,
      y: 0,
      move: 1,
      hp: 100,
      mp: 100,
      state: 0,
      active: 0,
    })),
    g_GenAtt: [
      {generalIndex: 0, at: 100, df: 100, armsType: 0},
      {generalIndex: 10, at: 100, df: 100, armsType: 1},
    ],
    g_FgtOver: 0,
    g_FoucsX: 4,
    g_FoucsY: 4,
    g_MapWid: 15,
    g_MapHgt: 15,
    g_PathSX: 0,
    g_PathSY: 0,
    g_PUseSX: 0,
    g_PUseSY: 0,
    g_FightPath: new Array(15 * 15 + 25).fill(0xff),
    g_FgtAtkRng: new Array(15 * 15 + 5).fill(0),
  };
  data.g_engineConfig.fixCityOffset = true;
  data.g_GenPos[0].x = 4;
  data.g_GenPos[0].y = 4;
  data.g_GenPos[10].x = 4;
  data.g_GenPos[10].y = 6;
  data.g_GenPos[11].x = 7;
  data.g_GenPos[11].y = 4;
  data.g_GenPos[12].x = 6;
  data.g_GenPos[12].y = 6;
  const hooks = {};
  const baye = {
    data,
    hooks,
    getPersonName: (index) => `武将${index}`,
    getCityName: (index) => `城池${index}`,
    getToolName: (index) => `物品${index}`,
    getArmType: (index) => people[index]?.ArmsType ?? 0,
    drawImage: (x, y, resid, resitem, picIndex, scr) => {
      drawnImages.push({
        x,
        y,
        resid,
        resitem,
        picIndex,
        scr,
        paintColor: data.g_paintColor,
      });
    },
    putToolInCity: (city, tool, hide) => returnedTools.push({city, tool, hide}),
    putPersonInCity: (cityIndex, personIndex) => {
      const city = data.g_Cities[cityIndex];
      data.g_PersonsQueue.splice(city.PersonQueue, 0, personIndex);
      city.Persons++;
      for (let index = cityIndex + 1; index < data.g_Cities.length; index++) {
        data.g_Cities[index].PersonQueue++;
      }
    },
    deletePersonInCity: (cityIndex, personIndex) => {
      const city = data.g_Cities[cityIndex];
      const end = city.PersonQueue + city.Persons;
      const queueIndex = data.g_PersonsQueue.indexOf(
        personIndex,
        city.PersonQueue,
      );
      if (queueIndex < city.PersonQueue || queueIndex >= end) return;
      data.g_PersonsQueue.splice(queueIndex, 1);
      city.Persons--;
      for (let index = cityIndex + 1; index < data.g_Cities.length; index++) {
        data.g_Cities[index].PersonQueue--;
      }
    },
  };
  const wasmMemory = {buffer: new ArrayBuffer(160 * 96 * 4)};
  const context = {
    baye,
    console,
    JSON,
    Math,
    Number,
    Uint8ClampedArray,
    setTimeout: (callback, delay) => {
      scheduledTimers.push({callback, delay});
      return scheduledTimers.length;
    },
    clearTimeout: () => {},
    requestAnimationFrame: (callback) => callback(),
    safeSetTimeout: (_callback, delay) => {
      scheduledDelays.push(delay);
      return scheduledDelays.length;
    },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
    document: {getElementById: () => null},
    BbkSystemChannel: {
      postMessage: (message) => systemMessages.push(JSON.parse(message)),
    },
    sendKey: (key) => {
      sentKeys.push(key);
      if (key === 0x22) data.g_FoucsY--;
      if (key === 0x23) data.g_FoucsY++;
      if (key === 0x24) data.g_FoucsX--;
      if (key === 0x25) data.g_FoucsX++;
    },
    bayeFlushLcdBuffer: () => {},
    wasmMemory,
    VK_UP: 0x22,
    VK_DOWN: 0x23,
    VK_LEFT: 0x24,
    VK_RIGHT: 0x25,
    VK_SEARCH: 0x33,
    VK_ENTER: 0x27,
    VK_EXIT: 0x28,
    lcdWidth: 160,
    lcdHeight: 96,
    dotSize: 1,
  };
  if (options.libraryBytes) {
    const responseText = Array.from(
      options.libraryBytes,
      (value) => String.fromCharCode(value),
    ).join('');
    context.XMLHttpRequest = class {
      status = 200;
      responseText = responseText;

      open() {}

      overrideMimeType() {}

      send() {}
    };
  }
  vm.createContext(context);
  vm.runInContext(enhancementSource, context, {
    filename: 'bbk-enhancements.js',
  });
  context.BbkSgby.start();
  return {
    api: context.BbkSgby,
    context,
    data,
    hooks,
    people,
    returnedTools,
    sentKeys,
    scheduledDelays,
    scheduledTimers,
    drawnImages,
    systemMessages,
    wasmMemory,
  };
}

{
  const {api, data, hooks, people} = createHarness();
  const rangeContext = {
    type: 0,
    personIndex: 0,
    rangeSize: 5,
    range: new Array(225).fill(9),
  };
  assert.equal(hooks.calcAttackRange(rangeContext), 1);
  assert.equal(rangeContext.rangeSize, 5);

  apply(api, 'sgby_wide_group_attack');
  rangeContext.range.fill(9);
  assert.equal(hooks.calcAttackRange(rangeContext), 0);
  assert.equal(rangeContext.rangeSize, 7);
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const expected = 1;
      assert.equal(rangeContext.range[y * 7 + x], expected);
    }
  }

  const hurtContext = {hurt: 0};
  assert.equal(hooks.countAttackHurt(hurtContext), 0);
  assert.equal(hurtContext.hurt, 24);
  assert.equal(people[4].Arms, 500);
  assert.equal(people[5].Arms, 576);
  assert.equal(people[7].Arms, 526);
  assert.equal(data.g_GenPos[11].state, 0);
}

{
  const {api, context, data, hooks, people, sentKeys} = createHarness();
  apply(api, 'sgby_wide_group_attack');
  apply(api, 'sgby_one_hit_kill');
  const rangeContext = {
    type: 0,
    personIndex: 0,
    rangeSize: 5,
    range: new Array(225).fill(0),
  };
  hooks.calcAttackRange(rangeContext);
  data.g_FoucsX = data.g_GenPos[0].x;
  data.g_FoucsY = data.g_GenPos[0].y;
  const ownArms = people[0].Arms;
  context.sendKey(0x27);
  assert.equal(sentKeys.at(-1), 0x27);
  assert.equal(data.g_FoucsX, data.g_GenPos[10].x);
  assert.equal(data.g_FoucsY, data.g_GenPos[10].y);
  assert.equal(people[0].Arms, ownArms);
  assert.equal(people[4].Arms, 500);

  const hurtContext = {hurt: 0};
  assert.equal(hooks.countAttackHurt(hurtContext), 0);
  assert.equal(hurtContext.hurt, 65535);
  assert.equal(people[5].Arms, 0);
  assert.equal(people[7].Arms, 0);
  assert.equal(data.g_GenPos[11].state, 0);
  assert.equal(data.g_GenPos[12].state, 0);
}

{
  const {context, hooks, wasmMemory} = createHarness();
  const pixels = new Uint8ClampedArray(wasmMemory.buffer);
  for (let index = 3; index < pixels.length; index += 4) {
    pixels[index] = 255;
  }
  hooks.didShowMainMap({});
  context.bayeFlushLcdBuffer(0);
  const cityOffset = (4 * 160 + 4) * 4;
  assert.deepEqual(
    Array.from(pixels.slice(cityOffset, cityOffset + 4)),
    [211, 47, 47, 255],
  );
  const roadOffset = (8 * 160 + 32) * 4;
  assert.deepEqual(
    Array.from(pixels.slice(roadOffset, roadOffset + 4)),
    [126, 132, 138, 255],
  );
  const roadOutlineOffset = (7 * 160 + 32) * 4;
  assert.deepEqual(
    Array.from(pixels.slice(roadOutlineOffset, roadOutlineOffset + 4)),
    [0, 0, 0, 255],
  );

  pixels.set([0, 0, 0, 255], cityOffset);
  context.sendKey(0x27);
  context.bayeFlushLcdBuffer(0);
  assert.deepEqual(
    Array.from(pixels.slice(cityOffset, cityOffset + 4)),
    [211, 47, 47, 255],
  );
}

function person(overrides) {
  return {
    OldBelong: 0,
    Belong: 0,
    Level: 1,
    Force: 50,
    IQ: 50,
    Devotion: 30,
    Experience: 20,
    Thew: 40,
    ArmsType: 0,
    Arms: 50,
    Tool1: 0,
    Tool2: 0,
    Age: 30,
    ...overrides,
  };
}

/** 构造只含资源 63 的最小 LIB，用于验证未来年份武将解析。 */
function buildGeneralConditionsLibrary(conditions) {
  const table = Buffer.alloc(63 * 4, 0xff);
  const item = Buffer.alloc(conditions.length * 4);
  conditions.forEach((condition, index) => {
    const offset = index * 4;
    item[offset] = condition.birth ?? 0;
    item.writeUInt16LE(condition.bole ?? 0, offset + 1);
    item[offset + 3] = condition.city ?? 0;
  });
  const resource = Buffer.alloc(14 + item.length);
  resource.writeUInt32LE(resource.length, 0);
  resource.writeUInt16LE(63, 4);
  resource.writeUInt16LE(1, 6);
  resource.writeUInt32LE(item.length, 8);
  item.copy(resource, 14);
  table.writeUInt32LE(table.length, (63 - 1) * 4);
  return Buffer.concat([table, resource]);
}

/** 执行一项增强脚本定时任务，缺少任务时直接让测试失败。 */
function runNextTimer(harness) {
  const timer = harness.scheduledTimers.shift();
  assert.ok(timer, '预期存在待执行的增强脚本定时任务');
  timer.callback();
  return timer.delay;
}

function apply(api, action) {
  const result = JSON.parse(api.applyCheat(action, {}));
  assert.equal(result.ok, true, result.message);
  return result;
}

{
  const {api, data, hooks} = createHarness();
  apply(api, 'sgby_free_movement');

  assert.equal(hooks.countMove({generalIndex: 0}), 0);
  assert.equal(data.g_GenPos[0].move, 8);
  assert.equal(hooks.countMove({generalIndex: 10}), 1);
  assert.equal(data.g_GenPos[10].move, 1);

  const resistance = new Array(256).fill(0xfe);
  assert.equal(hooks.countLandResistance({generalIndex: 0, result: resistance}), 0);
  assert.ok(resistance.every((value) => value === 0x81));
}

{
  const {api, data, hooks, people} = createHarness();
  apply(api, 'sgby_max_all');
  assert.equal(JSON.parse(api.getCheatState()).autoMaxCities, true);
  assert.equal(data.g_Cities[0].Money, 65535);
  assert.equal(data.g_Cities[0].Food, 65535);
  assert.equal(data.g_Cities[0].MothballArms, 65535);
  assert.equal(data.g_Cities[0].Farming, data.g_Cities[0].FarmingLimit);
  assert.equal(data.g_Cities[0].Commerce, data.g_Cities[0].CommerceLimit);
  assert.equal(data.g_Cities[0].Population, data.g_Cities[0].PopulationLimit);
  assert.equal(data.g_Cities[0].PeopleDevotion, 100);
  assert.equal(data.g_Cities[0].AvoidCalamity, 100);
  assert.equal(people[2].Belong, 1);

  data.g_Cities[0].Money = 1;
  data.g_Cities[0].Farming = 1;
  data.g_GoodsQueue[0] = 3;
  people[2].Belong = 0;
  hooks.tacticStage2({});
  assert.equal(data.g_Cities[0].Money, 65535);
  assert.equal(data.g_Cities[0].Farming, data.g_Cities[0].FarmingLimit);
  assert.equal(data.g_GoodsQueue[0], 0x8003);
  assert.equal(people[2].Belong, 1);
  const history = JSON.parse(api.getSearchHistory());
  assert.equal(history.records[0].source, '策略结束自动');
}

{
  const sharedStorage = new Map();
  const first = createHarness(sharedStorage);
  apply(first.api, 'sgby_invincible');
  apply(first.api, 'sgby_one_hit_kill');
  apply(first.api, 'sgby_free_movement');
  apply(first.api, 'sgby_food_protection');
  apply(first.api, 'sgby_generals');
  apply(first.api, 'sgby_wide_group_attack');
  apply(first.api, 'sgby_max_all');
  apply(first.api, 'sgby_post_battle_automation');
  const captiveActionResult = JSON.parse(first.api.applyCheat(
    'sgby_post_battle_captive_action',
    {mode: 'execute'},
  ));
  assert.equal(captiveActionResult.ok, true, captiveActionResult.message);
  const searchOutcomeResult = JSON.parse(first.api.applyCheat(
    'sgby_search_outcome',
    {mode: 'none'},
  ));
  assert.equal(searchOutcomeResult.ok, true, searchOutcomeResult.message);
  const loserOutcomeResult = JSON.parse(first.api.applyCheat(
    'sgby_battle_loser_outcome',
    {mode: 'death'},
  ));
  assert.equal(loserOutcomeResult.ok, true, loserOutcomeResult.message);
  const autoBattleResult = JSON.parse(first.api.handleControl('autoBattle'));
  assert.equal(autoBattleResult.ok, true, autoBattleResult.message);
  assert.equal(first.data.g_engineConfig.autoBattleDefense, 1);
  assert.equal(first.data.g_engineConfig.battleLoserOutcome, 1);
  first.api.handleControl('toggleBattleSpeed');

  const second = createHarness(sharedStorage);
  const restoredState = JSON.parse(second.api.getCheatState());
  assert.equal(restoredState.invincible, true);
  assert.equal(restoredState.oneHitKill, true);
  assert.equal(restoredState.freeMovement, true);
  assert.equal(restoredState.foodProtection, true);
  assert.equal(restoredState.autoMaxGenerals, true);
  assert.equal(restoredState.wideGroupAttack, true);
  assert.equal(restoredState.autoMaxCities, true);
  assert.equal(restoredState.postBattleAutomation, true);
  assert.equal(restoredState.postBattleCaptiveExecute, true);
  assert.equal(restoredState.postBattleCaptiveRecruit, false);
  assert.equal(restoredState.searchOutcomeNone, true);
  assert.equal(restoredState.searchOutcomeAll, false);
  assert.equal(restoredState.battleLoserOutcomeDeath, true);
  assert.equal(restoredState.battleLoserOutcomeOriginal, false);
  assert.equal(restoredState.autoBattle, true);
  assert.equal(restoredState.battleSpeed2x, false);
  assert.equal(restoredState.battleSpeed3x, true);
  assert.equal(restoredState.battleSpeed4x, false);
  assert.equal(second.people[0].Force, 100);
  assert.equal(second.people[0].Arms, 65535);
  assert.equal(second.data.g_engineConfig.autoBattleDefense, 1);
  assert.equal(second.data.g_engineConfig.battleLoserOutcome, 1);
}

{
  const {api} = createHarness();
  const state = JSON.parse(api.getCheatState());
  assert.equal(state.postBattleCaptiveRecruit, true);
  assert.equal(state.postBattleCaptiveExecute, false);
  assert.equal(state.postBattleCaptiveExile, false);
  assert.equal(state.searchOutcomeAll, true);
  assert.equal(state.searchOutcomeNone, false);
  assert.equal(state.battleLoserOutcomeOriginal, true);
  assert.equal(state.battleLoserOutcomeDeath, false);
}

{
  const harness = createHarness();
  const noneResult = JSON.parse(harness.api.applyCheat(
    'sgby_search_outcome',
    {mode: 'none'},
  ));
  assert.equal(noneResult.ok, true, noneResult.message);
  apply(harness.api, 'sgby_search_city');
  assert.equal(harness.people[2].Belong, 0);
  assert.equal(harness.data.g_GoodsQueue[0], 3);
  assert.equal(JSON.parse(harness.api.getSearchHistory()).records.length, 0);

  const allResult = JSON.parse(harness.api.applyCheat(
    'sgby_search_outcome',
    {mode: 'all'},
  ));
  assert.equal(allResult.ok, true, allResult.message);
  apply(harness.api, 'sgby_search_city');
  assert.equal(harness.people[2].Belong, 1);
  assert.equal(harness.data.g_GoodsQueue[0], 0x8003);
  assert.equal(JSON.parse(harness.api.getSearchHistory()).records.length, 1);
}

{
  const harness = createHarness();
  const {api, data, hooks, sentKeys} = harness;
  assert.equal(hooks.fightChooseAction, undefined);
  let controlResult = JSON.parse(api.handleControl('autoBattle'));
  assert.equal(controlResult.ok, true, controlResult.message);
  assert.equal(JSON.parse(api.getCheatState()).autoBattle, true);
  assert.equal(typeof hooks.fightChooseAction, 'function');

  data.g_FightPath[4 + 4 * 15] = 0;
  data.g_FightPath[4 + 5 * 15] = 0;
  hooks.battleStage2({});
  assert.equal(runNextTimer(harness), 210);
  runNextTimer(harness);
  hooks.countMoveRange({generalIndex: 0});
  runNextTimer(harness);
  runNextTimer(harness);
  runNextTimer(harness);
  runNextTimer(harness);
  runNextTimer(harness);
  assert.deepEqual(sentKeys.slice(-3), [0x27, 0x23, 0x27]);
  data.g_GenPos[0].x = data.g_FoucsX;
  data.g_GenPos[0].y = data.g_FoucsY;

  assert.equal(hooks.fightChooseAction({index: 0}), 0);
  data.g_FgtAtkRng.fill(0);
  data.g_FgtAtkRng[0] = 7;
  data.g_FgtAtkRng[1] = 1;
  data.g_FgtAtkRng[2] = 1;
  data.g_FgtAtkRng[3 + 5 * 7 + 3] = 1;
  runNextTimer(harness);
  runNextTimer(harness);
  runNextTimer(harness);
  assert.deepEqual(sentKeys.slice(-2), [0x23, 0x27]);

  controlResult = JSON.parse(api.handleControl('autoBattle'));
  assert.equal(controlResult.ok, true, controlResult.message);
  assert.equal(JSON.parse(api.getCheatState()).autoBattle, false);
  assert.equal(hooks.fightChooseAction, undefined);
}

{
  const harness = createHarness();
  const {api, data, hooks, sentKeys} = harness;
  api.handleControl('autoBattle');
  hooks.battleStage2({});
  harness.scheduledTimers.length = 0;
  assert.equal(hooks.fightChooseAction({index: 0}), 0);
  data.g_FgtAtkRng.fill(0);
  data.g_FgtAtkRng[0] = 5;
  runNextTimer(harness);
  assert.equal(sentKeys.at(-1), 0x28);
  assert.equal(hooks.fightChooseAction({index: 0}), 3);
}

{
  const harness = createHarness();
  const {api, data, hooks, sentKeys} = harness;
  apply(api, 'sgby_wide_group_attack');
  api.handleControl('autoBattle');
  hooks.battleStage2({});
  harness.scheduledTimers.length = 0;
  assert.equal(hooks.fightChooseAction({index: 0}), 0);
  hooks.calcAttackRange({
    type: 0,
    personIndex: 0,
    rangeSize: 5,
    range: new Array(225).fill(0),
  });
  data.g_FgtAtkRng.fill(0);
  data.g_FgtAtkRng[0] = 7;
  data.g_FgtAtkRng[1] = 1;
  data.g_FgtAtkRng[2] = 1;
  data.g_FgtAtkRng[3 + 5 * 7 + 3] = 1;
  data.g_FoucsX = data.g_GenPos[0].x;
  data.g_FoucsY = data.g_GenPos[0].y;
  runNextTimer(harness);
  runNextTimer(harness);
  runNextTimer(harness);
  runNextTimer(harness);
  assert.deepEqual(sentKeys, [0x27]);
}

{
  const harness = createHarness();
  const {api, data, hooks, people, sentKeys} = harness;
  people[5].Arms = 1;
  data.g_GenPos[11].x = 5;
  data.g_GenPos[11].y = 4;
  api.handleControl('autoBattle');
  hooks.battleStage2({});
  harness.scheduledTimers.length = 0;
  assert.equal(hooks.fightChooseAction({index: 0}), 0);
  data.g_FgtAtkRng.fill(0);
  data.g_FgtAtkRng[0] = 7;
  data.g_FgtAtkRng[1] = 1;
  data.g_FgtAtkRng[2] = 1;
  data.g_FgtAtkRng[3 + 5 * 7 + 3] = 1;
  data.g_FgtAtkRng[3 + 3 * 7 + 4] = 1;
  data.g_FoucsX = data.g_GenPos[0].x;
  data.g_FoucsY = data.g_GenPos[0].y;
  runNextTimer(harness);
  runNextTimer(harness);
  runNextTimer(harness);
  runNextTimer(harness);
  assert.deepEqual(sentKeys, [0x23, 0x23, 0x27]);
}

{
  const harness = createHarness();
  const {api, data, hooks, sentKeys} = harness;
  data.g_GenPos[0].x = 1;
  data.g_GenPos[0].y = 1;
  data.g_GenPos[10].x = 0;
  data.g_GenPos[10].y = 1;
  data.g_FoucsX = 1;
  data.g_FoucsY = 1;
  api.handleControl('autoBattle');
  hooks.battleStage2({});
  harness.scheduledTimers.length = 0;
  assert.equal(hooks.fightChooseAction({index: 0}), 0);
  data.g_FgtAtkRng.fill(0);
  data.g_FgtAtkRng[0] = 5;
  data.g_FgtAtkRng[1] = 0xff;
  data.g_FgtAtkRng[2] = 0xff;
  data.g_FgtAtkRng[3 + 2 * 5 + 1] = 1;
  runNextTimer(harness);
  runNextTimer(harness);
  runNextTimer(harness);
  assert.deepEqual(sentKeys, [0x24, 0x27]);
}

{
  const harness = createHarness();
  const {api, data, hooks, sentKeys} = harness;
  data.g_GenPos[0].x = 4;
  data.g_GenPos[0].y = 4;
  data.g_GenPos[1].x = 6;
  data.g_GenPos[1].y = 4;
  data.g_GenPos[10].x = 6;
  data.g_GenPos[10].y = 6;
  api.handleControl('autoBattle');
  hooks.battleStage2({});
  harness.scheduledTimers.length = 0;

  // 第一名武将无合法目标，完成休息后进入第二名武将选择。
  assert.equal(hooks.fightChooseAction({index: 0}), 0);
  data.g_FgtAtkRng.fill(0);
  data.g_FgtAtkRng[0] = 5;
  runNextTimer(harness);
  assert.equal(hooks.fightChooseAction({index: 0}), 3);
  data.g_GenPos[0].active = 1;
  runNextTimer(harness);
  runNextTimer(harness);
  runNextTimer(harness);
  runNextTimer(harness);
  runNextTimer(harness);
  runNextTimer(harness);
  assert.deepEqual(sentKeys.slice(-3), [0x25, 0x25, 0x27]);

  const selectedKeyCount = sentKeys.length;
  runNextTimer(harness);
  runNextTimer(harness);
  assert.equal(
    sentKeys.length,
    selectedKeyCount,
    '引擎确认第二名武将前不得提前发送移动按键',
  );
  hooks.countMoveRange({generalIndex: 1});
  runNextTimer(harness);
  runNextTimer(harness);
  runNextTimer(harness);
  assert.ok(sentKeys.length > selectedKeyCount, '确认选中后应继续发送移动按键');
}

{
  const harness = createHarness();
  const {api, data, hooks, sentKeys} = harness;
  for (let index = 0; index < 10; index++) {
    data.g_GenPos[index].active = 1;
  }
  api.handleControl('autoBattle');
  hooks.battleStage2({});
  const selectionTimer = harness.scheduledTimers.shift();
  assert.ok(selectionTimer);
  selectionTimer.callback();
  runNextTimer(harness);
  assert.equal(sentKeys.filter((key) => key === 0x28).length, 2);
  assert.equal(hooks.fightOpenMainMenu({}), 0);
  while (harness.scheduledTimers.length) {
    runNextTimer(harness);
  }
  assert.equal(sentKeys.filter((key) => key === 0x28).length, 2);
}

{
  const {api, data, hooks, people, systemMessages} = createHarness();
  apply(api, 'sgby_generals');
  apply(api, 'sgby_post_battle_automation');
  hooks.enterBattle({});
  hooks.exitBattle({});
  data.g_FgtOver = 1;
  hooks.didShowMainMap({});

  assert.equal(data.g_Cities[0].Money, 65535);
  assert.equal(data.g_Cities[0].Farming, data.g_Cities[0].FarmingLimit);
  assert.equal(data.g_Cities[3].Money, 65535);
  assert.equal(people[2].Belong, 1);
  assert.equal(people[3].Belong, 1);
  assert.equal(people[6].Belong, 1);
  assert.equal(people[2].Devotion, 100);
  assert.equal(people[3].Devotion, 100);
  assert.equal(people[3].Force, 100);
  assert.equal(data.g_GoodsQueue[0], 0x8003);
  assert.equal(data.g_GoodsQueue[2], 0x8007);
  assert.equal(systemMessages.at(-1).type, 'sgby_notice');
  assert.match(systemMessages.at(-1).data.message, /自动处理完成/);
  assert.match(systemMessages.at(-1).data.message, /搜索记录/);
  const battleHistory = JSON.parse(api.getSearchHistory());
  assert.equal(battleHistory.records[0].source, '我方进攻「武将4」所属的「城池2」');
  assert.deepEqual(battleHistory.records[0].battle, {
    direction: 'playerAttack',
    cityName: '城池2',
    attackerRulerName: '武将0',
    defenderRulerName: '武将4',
    source: '我方进攻「武将4」所属的「城池2」',
  });
  assert.equal(battleHistory.records[0].recruitedCount, 1);
  assert.deepEqual(battleHistory.records[0].cities[0].recruited, ['武将3']);
}

{
  const {api, data, hooks} = createHarness();
  apply(api, 'sgby_post_battle_automation');
  data.g_FgtParam.Mode = 0;
  data.g_FgtParam.CityIndex = 0;
  hooks.enterBattle({});
  hooks.exitBattle({});
  data.g_FgtOver = 1;
  hooks.didShowMainMap({});

  const history = JSON.parse(api.getSearchHistory());
  assert.equal(history.records[0].source, '「武将4」进攻我方「城池0」');
  assert.deepEqual(history.records[0].battle, {
    direction: 'playerDefence',
    cityName: '城池0',
    attackerRulerName: '武将4',
    defenderRulerName: '武将0',
    source: '「武将4」进攻我方「城池0」',
  });
}

{
  const {api, data, hooks} = createHarness();
  apply(api, 'sgby_post_battle_automation');
  data.g_FgtParam.Mode = 2;
  data.g_FgtParam.CityIndex = 0;
  data.g_FgtParam.GenArray[0] = 5;
  data.g_Cities[0].Belong = 1;
  hooks.enterBattle({});
  hooks.exitBattle({});
  data.g_FgtOver = 1;
  hooks.didShowMainMap({});

  const history = JSON.parse(api.getSearchHistory());
  assert.equal(
    history.records[0].source,
    '「武将4」进攻「武将0」所属的「城池0」',
  );
  assert.equal(history.records[0].battle.direction, 'auto');
}

{
  const {
    api,
    context,
    data,
    hooks,
    sentKeys,
    scheduledDelays,
    drawnImages,
    wasmMemory,
  } = createHarness();

  let controlResult = JSON.parse(api.handleControl('battleInfo'));
  assert.equal(controlResult.ok, true, controlResult.message);
  assert.equal(sentKeys.at(-1), 0x33);

  controlResult = JSON.parse(api.handleControl('endTurn'));
  assert.equal(controlResult.ok, true, controlResult.message);
  assert.equal(sentKeys.at(-1), 0x28);
  assert.equal(hooks.fightOpenMainMenu({}), 0);
  assert.equal(hooks.fightOpenMainMenu, undefined);

  context.safeSetTimeout(() => {}, 100);
  assert.equal(scheduledDelays.at(-1), 50);
  controlResult = JSON.parse(api.handleControl('toggleBattleSpeed'));
  assert.equal(controlResult.ok, true, controlResult.message);
  context.safeSetTimeout(() => {}, 100);
  assert.ok(Math.abs(scheduledDelays.at(-1) - 100 / 3) < 0.001);
  controlResult = JSON.parse(api.handleControl('toggleBattleSpeed'));
  assert.equal(controlResult.ok, true, controlResult.message);
  context.safeSetTimeout(() => {}, 100);
  assert.equal(scheduledDelays.at(-1), 25);
  controlResult = JSON.parse(api.handleControl('toggleBattleSpeed'));
  assert.equal(controlResult.ok, true, controlResult.message);
  context.safeSetTimeout(() => {}, 100);
  assert.equal(scheduledDelays.at(-1), 100);
  controlResult = JSON.parse(api.handleControl('toggleBattleSpeed'));
  assert.equal(controlResult.ok, true, controlResult.message);
  context.safeSetTimeout(() => {}, 100);
  assert.equal(scheduledDelays.at(-1), 50);

  data.g_paintColor = 0xff;
  hooks.drawOneGeneral({index: 0, pic: 3, x: 0, y: 0, frame: 0});
  hooks.drawOneGeneral({index: 10, pic: 4, x: 16, y: 0, frame: 0});
  assert.equal(drawnImages[0].paintColor, 0x80);
  assert.equal(drawnImages[1].paintColor, 0xff);
  assert.equal(data.g_paintColor, 0xff);

  const pixels = new Uint8ClampedArray(wasmMemory.buffer);
  pixels.set([0x7f, 0x7f, 0x7f, 0x80], 0);
  context.bayeFlushLcdBuffer(0);
  assert.deepEqual(Array.from(pixels.slice(0, 4)), [211, 47, 47, 255]);
}

{
  const {api, data, hooks, sentKeys} = createHarness();
  data.g_FgtOver = 1;
  const controlResult = JSON.parse(api.handleControl('endTurn'));
  assert.equal(controlResult.ok, true, controlResult.message);
  assert.equal(sentKeys.at(-1), 0x28);
  assert.equal(hooks.mainSystemMenu({}), 0);
  assert.equal(hooks.mainSystemMenu, undefined);
}

{
  const sharedStorage = new Map();
  const {api, data, people} = createHarness(sharedStorage);
  apply(api, 'sgby_search_city');
  assert.equal(people[2].Belong, 1);
  assert.equal(people[2].Devotion, 100);
  assert.equal(people[6].Belong, 1);
  assert.equal(people[6].Devotion, 100);
  assert.equal(data.g_GoodsQueue[0], 0x8003);
  assert.equal(data.g_GoodsQueue[1], 0x8004);
  assert.equal(data.g_GoodsQueue[2], 0x8007);

  const firstHistory = JSON.parse(api.getSearchHistory());
  assert.equal(firstHistory.ok, true);
  assert.equal(firstHistory.records.length, 1);
  assert.equal(firstHistory.records[0].gameTime, '190年9月');
  assert.equal(firstHistory.records[0].source, '手动搜索');
  assert.deepEqual(firstHistory.records[0].cities[0], {
    cityName: '城池0',
    people: ['武将2'],
    tools: ['物品3'],
    recruited: [],
    executed: [],
    exiled: [],
  });
  assert.deepEqual(firstHistory.records[0].cities[1], {
    cityName: '城池3',
    people: ['武将6'],
    tools: ['物品7'],
    recruited: [],
    executed: [],
    exiled: [],
  });

  const restoredHarness = createHarness(sharedStorage);
  const restoredHistory = JSON.parse(restoredHarness.api.getSearchHistory());
  assert.equal(restoredHistory.records.length, 1);
  assert.equal(restoredHistory.records[0].cities[0].people[0], '武将2');

  apply(api, 'sgby_generals');
  apply(api, 'sgby_recruit_captives');
  assert.equal(people[3].Belong, 1);
  assert.equal(people[3].Devotion, 100);
  assert.equal(people[3].Level, 20);
  assert.equal(people[3].Force, 100);
  assert.equal(people[3].Arms, 65535);
  const recruitHistory = JSON.parse(api.getSearchHistory());
  assert.equal(recruitHistory.records[0].source, '手动招降');
  assert.equal(recruitHistory.records[0].recruitedCount, 1);
  assert.deepEqual(recruitHistory.records[0].cities[0].recruited, ['武将3']);
}

{
  const storage = new Map([['baye/libpath', 'libs/test.lib']]);
  const conditions = Array.from({length: 8}, () => ({}));
  conditions[7] = {birth: 220, city: 1};
  const harness = createHarness(storage, {
    libraryBytes: buildGeneralConditionsLibrary(conditions),
  });
  harness.people[2].Belong = 1;
  harness.people[6].Belong = 1;
  harness.people[7].Belong = 0;
  harness.data.g_GoodsQueue[0] |= 0x8000;
  harness.data.g_GoodsQueue[2] |= 0x8000;

  const searchResult = apply(harness.api, 'sgby_search_city');
  assert.match(searchResult.message, /武将7/);
  assert.equal(harness.people[7].Belong, 1);
  assert.equal(harness.people[7].Age, 16);
  assert.ok(harness.data.g_PersonsQueue.includes(7));
  const history = JSON.parse(harness.api.getSearchHistory());
  assert.equal(history.records.length, 1);
  assert.deepEqual(history.records[0].cities[0].people, ['武将7']);
}

{
  const harness = createHarness();
  apply(harness.api, 'sgby_max_all');
  const historyCount = JSON.parse(harness.api.getSearchHistory()).records.length;
  harness.systemMessages.length = 0;
  harness.hooks.tacticStage2({});
  assert.equal(harness.systemMessages.length, 0);
  assert.equal(
    JSON.parse(harness.api.getSearchHistory()).records.length,
    historyCount,
  );
}

{
  const {api, people} = createHarness();
  people[6].Belong = 1;
  const cheatData = JSON.parse(api.getCheatData());
  assert.equal(cheatData.ok, true);
  assert.deepEqual(
    cheatData.generals.map((general) => general.cityIndex),
    [0, 0, 3],
  );
}

{
  const {api, data, returnedTools} = createHarness();
  apply(api, 'sgby_execute_captives');
  assert.ok(!data.g_PersonsQueue.includes(3));
  assert.deepEqual(returnedTools, [
    {city: 0, tool: 4, hide: false},
    {city: 0, tool: 5, hide: false},
  ]);
}

{
  const {api, data, hooks} = createHarness();
  apply(api, 'sgby_food_protection');
  hooks.battleStage4({});
  data.g_FgtParam.MProvender = 70;
  hooks.battleStage5({});
  assert.equal(data.g_FgtParam.MProvender, 100);

  hooks.tacticStage4({});
  assert.equal(data.g_Cities[0].Food, 7);
  assert.equal(data.g_Cities[1].Food, 100);
}

{
  const {api, data, hooks} = createHarness();
  apply(api, 'sgby_max_all');
  hooks.tacticStage4({});
  data.g_Cities[0].Food -= 11;
  data.g_Cities[3].Food -= 13;
  hooks.tacticStage5({});
  assert.equal(data.g_Cities[0].Food, 65535);
  assert.equal(data.g_Cities[3].Food, 65535);

  apply(api, 'sgby_max_all');
  hooks.tacticStage4({});
  data.g_Cities[0].Food = 65000;
  hooks.tacticStage5({});
  assert.equal(data.g_Cities[0].Food, 65000);
}

{
  const {api, data} = createHarness();
  assert.equal(api.setWorldActivity(85), true);
  assert.equal(data.g_engineConfig.aiWorldActivity, 85);
  assert.equal(api.setWorldActivity(180), true);
  assert.equal(data.g_engineConfig.aiWorldActivity, 100);
  assert.equal(api.setWorldActivity(Number.NaN), true);
  assert.equal(data.g_engineConfig.aiWorldActivity, 50);
  delete data.g_engineConfig.aiWorldActivity;
  assert.equal(api.setWorldActivity(60), false);
}

{
  const {context, data, hooks, sentKeys} = createHarness();
  data.g_Cities[0].Food = 8000;
  assert.equal(hooks.cityMakeCommand({cityIndex: 0, commandIndex: 27}), 2);
  context.sendKey(0x27);
  context.sendKey(0x28);
  assert.deepEqual(sentKeys.slice(-8), [
    0x28,
    0x24,
    0x24,
    0x24,
    0x23,
    0x23,
    0x23,
    0x27,
  ]);
  assert.equal(sentKeys.at(-1), 0x27);
}

{
  const {context, data, hooks, sentKeys} = createHarness();
  data.g_Cities[0].Food = 3000;
  assert.equal(hooks.cityMakeCommand({cityIndex: 0, commandIndex: 27}), 2);
  context.sendKey(0x27);
  context.sendKey(0x28);
  assert.deepEqual(sentKeys.slice(-2), [0x28, 0x27]);
}

{
  const harness = createHarness();
  const {api, data, hooks, people, returnedTools} = harness;
  apply(api, 'sgby_post_battle_automation');
  const actionResult = JSON.parse(api.applyCheat(
    'sgby_post_battle_captive_action',
    {mode: 'execute'},
  ));
  assert.equal(actionResult.ok, true, actionResult.message);
  hooks.enterBattle({});
  hooks.exitBattle({});
  data.g_FgtOver = 1;
  hooks.didShowMainMap({});

  assert.equal(data.g_PersonsQueue.includes(3), false);
  assert.equal(returnedTools.some((entry) => entry.tool === 4), true);
  assert.equal(returnedTools.some((entry) => entry.tool === 5), true);
  assert.equal(people[3].Belong, 0xffff);
  const history = JSON.parse(api.getSearchHistory());
  assert.equal(history.records[0].executedCount, 1);
  assert.deepEqual(history.records[0].cities[0].executed, ['武将3']);
  assert.equal(history.records[0].recruitedCount, 0);
}

{
  const harness = createHarness();
  const {api, data, hooks, people} = harness;
  apply(api, 'sgby_post_battle_automation');
  const actionResult = JSON.parse(api.applyCheat(
    'sgby_post_battle_captive_action',
    {mode: 'exile'},
  ));
  assert.equal(actionResult.ok, true, actionResult.message);
  hooks.enterBattle({});
  hooks.exitBattle({});
  data.g_FgtOver = 1;
  hooks.didShowMainMap({});

  assert.equal(people[3].Belong, 0);
  const sourceCityPeople = data.g_PersonsQueue.slice(
    data.g_Cities[0].PersonQueue,
    data.g_Cities[0].PersonQueue + data.g_Cities[0].Persons,
  );
  assert.equal(sourceCityPeople.includes(3), false);
  const destinationCities = data.g_Cities
    .filter((city) => city.Belong !== 1)
    .map((city) => data.g_PersonsQueue.slice(
      city.PersonQueue,
      city.PersonQueue + city.Persons,
    ));
  assert.equal(destinationCities.some((indexes) => indexes.includes(3)), true);
  const history = JSON.parse(api.getSearchHistory());
  assert.equal(history.records[0].exiledCount, 1);
  assert.deepEqual(history.records[0].cities[0].exiled, ['武将3']);
  assert.equal(history.records[0].recruitedCount, 0);
}

console.log('三国霸业增强回归测试通过');
