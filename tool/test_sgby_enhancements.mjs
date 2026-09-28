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
function createHarness(storage = new Map()) {
  const returnedTools = [];
  const sentKeys = [];
  const scheduledDelays = [];
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
  ];
  const data = {
    g_PlayerKing: 0,
    g_YearDate: 190,
    g_MonthDate: 9,
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
    g_CityPositions: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 2, y: 0}],
    g_CityPos: {x: 0, y: 0, setx: 0, sety: 0},
    g_engineConfig: {
      maxLevel: 20,
      ratioOfFoodToArmsPerMouth: 50,
    },
    g_FgtParam: {
      MProvender: 100,
      EProvender: 100,
      GenArray: [1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 5],
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
    g_GenAtt: [{generalIndex: 0}, {generalIndex: 10}],
    g_FgtOver: 0,
  };
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
    setTimeout: () => 1,
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
    sendKey: (key) => sentKeys.push(key),
    bayeFlushLcdBuffer: () => {},
    wasmMemory,
    VK_UP: 0x22,
    VK_DOWN: 0x23,
    VK_LEFT: 0x24,
    VK_RIGHT: 0x25,
    VK_SEARCH: 0x33,
    VK_EXIT: 0x28,
    lcdWidth: 160,
    lcdHeight: 96,
    dotSize: 1,
  };
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
    drawnImages,
    systemMessages,
    wasmMemory,
  };
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
    ...overrides,
  };
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
  const {api, data} = createHarness();
  apply(api, 'sgby_max_all');
  assert.equal(data.g_Cities[0].Money, 65535);
  assert.equal(data.g_Cities[0].Food, 65535);
  assert.equal(data.g_Cities[0].MothballArms, 65535);
  assert.equal(data.g_Cities[0].Farming, data.g_Cities[0].FarmingLimit);
  assert.equal(data.g_Cities[0].Commerce, data.g_Cities[0].CommerceLimit);
  assert.equal(data.g_Cities[0].Population, data.g_Cities[0].PopulationLimit);
  assert.equal(data.g_Cities[0].PeopleDevotion, 100);
  assert.equal(data.g_Cities[0].AvoidCalamity, 100);
}

{
  const sharedStorage = new Map();
  const first = createHarness(sharedStorage);
  apply(first.api, 'sgby_invincible');
  apply(first.api, 'sgby_one_hit_kill');
  apply(first.api, 'sgby_free_movement');
  apply(first.api, 'sgby_food_protection');
  apply(first.api, 'sgby_generals');
  apply(first.api, 'sgby_post_battle_automation');
  first.api.handleControl('toggleBattleSpeed');

  const second = createHarness(sharedStorage);
  const restoredState = JSON.parse(second.api.getCheatState());
  assert.equal(restoredState.invincible, true);
  assert.equal(restoredState.oneHitKill, true);
  assert.equal(restoredState.freeMovement, true);
  assert.equal(restoredState.foodProtection, true);
  assert.equal(restoredState.autoMaxGenerals, true);
  assert.equal(restoredState.postBattleAutomation, true);
  assert.equal(restoredState.battleSpeed2x, false);
  assert.equal(restoredState.battleSpeed3x, true);
  assert.equal(restoredState.battleSpeed4x, false);
  assert.equal(second.people[0].Force, 100);
  assert.equal(second.people[0].Arms, 65535);
}

{
  const {api, data, hooks, people, systemMessages} = createHarness();
  apply(api, 'sgby_generals');
  apply(api, 'sgby_post_battle_automation');
  hooks.exitBattle({});
  data.g_FgtOver = 1;
  hooks.didShowMainMap({});

  assert.equal(data.g_Cities[0].Money, 65535);
  assert.equal(data.g_Cities[0].Farming, data.g_Cities[0].FarmingLimit);
  assert.equal(data.g_Cities[2].Money, 65535);
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
  });
  assert.deepEqual(firstHistory.records[0].cities[1], {
    cityName: '城池2',
    people: ['武将6'],
    tools: ['物品7'],
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

console.log('三国霸业增强回归测试通过');
