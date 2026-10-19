import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const enhancementSource = readFileSync(
  new URL('../assets/games/sgby/js/bbk-enhancements.js', import.meta.url),
  'utf8',
);
const specialGeneralsSource = readFileSync(
  new URL('../assets/games/sgby/js/bbk-special-generals.js', import.meta.url), 'utf8',
);
const corePatchSource = readFileSync(
  new URL('../third_party/ibaye/ai-world-activity.patch', import.meta.url),
  'utf8',
);

assert.ok(
  corePatchSource.includes('+        minGenerals = 1;'),
  '活跃度 80 以上应允许单将城池出征',
);
assert.ok(
  corePatchSource.includes('+        minArms = 0;'),
  '活跃度 80 以上不应检查最强武将兵力',
);
assert.ok(
  corePatchSource.includes('+        reserveGenerals = 0;'),
  '活跃度 80 以上不应强制保留守将',
);
assert.ok(
  corePatchSource.includes(
    '+                    if (minArms && g_Persons[pqptr[0]].Arms < minArms)',
  ),
  '兵力门槛为零时应跳过最强武将兵力判断',
);
assert.ok(
  corePatchSource.includes('+                        fpcount -= reserveGenerals;'),
  '出征人数应按当前活跃度的守将保留数计算',
);
assert.ok(
  corePatchSource.includes('FightOrderPersons'),
  '出征队列必须按每组 10 个 PersonID 统一寻址',
);
assert.ok(
  corePatchSource.includes(
    '+    gam_fwrite((U8 *)FIGHTERS,10 * sizeof(PersonID),FIGHT_ORDER_MAX,fp);',
  ),
  '存档必须完整保存 30 组出征武将 PersonID',
);
assert.ok(
  corePatchSource.includes('+static void MarkPersonDead(PersonID person,U8 city)'),
  '战死结算必须使用统一的死亡状态清理',
);
assert.ok(
  corePatchSource.includes('+static U32 GetKingPersonsWithOrders('),
  '君主继承统计必须包含正在执行命令和出征的武将',
);
assert.ok(
  corePatchSource.includes('+static void ReturnOrderPerson(OrderType *Order,PersonID person)'),
  '命令执行结束必须校验人物当前归属和落脚城市',
);
assert.ok(
  corePatchSource.includes('+    SetCitySatrap();'),
  '君主更替或势力灭亡后必须立即重算太守',
);
assert.ok(
  corePatchSource.includes('+    I32 rade;'),
  '外交智力差必须使用有符号整数，避免负数溢出成高成功率',
);
assert.ok(
  corePatchSource.includes('+    .checkRedundantOnAddPerson = 1,'),
  '核心人物入城应启用跨城市去重保护',
);
for (const outcome of ['DEATH', 'CAPTIVE', 'ESCAPE', 'WILD']) {
  const branch = `BATTLE_LOSER_OUTCOME_${outcome} == ` +
    'g_engineConfig.battleLoserOutcome';
  assert.ok(
    corePatchSource.split(branch).length - 1 >= 2,
    `${outcome} 必须同时覆盖参战败将和失守城市留守武将`,
  );
}

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
  const resourceRequests = [];
  const animationFrames = [];
  const saveMessages = [];
  const fontSelections = [];
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
    g_LookEnemy: 1,
    g_LookMovie: 1,
    g_MoveSpeed: 1,
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
    g_OrderQueue: Array.from({length: 100}, () => ({
      OrderId: 0xff,
      Person: 0,
      City: 0,
    })),
    FIGHTERS_IDX: new Array(30).fill(0),
    FIGHTERS: new Array(600).fill(0),
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
      playerAttackAnyCity: 0,
      enemyEscapeRoute: 0,
      playerDiplomacyProtection: 0,
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
  if (options.fontSupport) {
    data.g_scale = options.fontScale;
    data.g_engineConfig.useCustomFont = 0;
    data.g_engineConfig.useCustomFontEn = 0;
  }
  const hooks = {...options.hooks};
  const baye = {
    data,
    hooks,
    getPersonName: (index) => options.personNames?.[index] ?? `武将${index}`,
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
    requestAnimationFrame: (callback) => {
      if (options.deferAnimationFrames) animationFrames.push(callback);
      else callback();
      return animationFrames.length;
    },
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
    BbkSaveChannel: {
      postMessage: (message) => saveMessages.push(JSON.parse(message)),
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
  if (options.fontSupport) {
    baye.setFont = id => {fontSelections.push(id); return 0;};
    context.TextDecoder = TextDecoder;
    context.document.createElement = () => {
      const canvas = {width: 0, height: 0};
      canvas.getContext = () => ({
        clearRect() {}, fillText() {},
        getImageData: () => ({data: new Uint8ClampedArray(canvas.width * canvas.height * 4)}),
      });
      return canvas;
    };
  }
  if (options.libraryBytes) {
    context.dynLib = Array.from(options.libraryBytes, value => value.toString(16).padStart(2, '0')).join('');
    const responseText = Array.from(
      options.libraryBytes,
      (value) => String.fromCharCode(value),
    ).join('');
    context.XMLHttpRequest = class {
      status = 200;
      responseText = responseText;

      open() {}

      overrideMimeType() {}

      send() {resourceRequests.push('xhr');}
    };
  }
  vm.createContext(context);
  vm.runInContext(specialGeneralsSource, context, {filename: 'bbk-special-generals.js'});
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
    resourceRequests,
    animationFrames,
    saveMessages,
    fontSelections,
    wasmMemory,
  };
}

{
  const {data, hooks, fontSelections} = createHarness(new Map(), {fontSupport: true, fontScale: 1});
  assert.deepEqual(fontSelections, [], '词典原版不能切换引擎字体');
  assert.equal(hooks.fontImageForChar, undefined, '词典原版不能安装系统字体字模Hook');
  assert.equal(data.g_engineConfig.useCustomFont, 0, '原版中文应使用引擎自带字模');
  assert.equal(data.g_engineConfig.useCustomFontEn, 0, '原版英数应使用引擎自带字模');
}

for (const [scale, fontId, fontSize] of [[2, 1, 24], [4, 5, 48]]) {
  const {data, hooks, fontSelections} = createHarness(new Map(), {fontSupport: true, fontScale: scale});
  assert.deepEqual(fontSelections, [fontId], `${scale}X模组继续使用对应尺寸的字体`);
  assert.equal(data.g_engineConfig.useCustomFont, 1);
  assert.equal(data.g_engineConfig.useCustomFontEn, 1);
  for (const code of [65, 0xb3c7]) {
    const glyph = {code};
    assert.equal(hooks.fontImageForChar(glyph), 0);
    const width = code < 256 ? fontSize / 2 : fontSize;
    assert.equal(glyph.zmCode.length, Math.ceil(width / 8) * fontSize,
      `${scale}X中文字模和英数字模的尺寸须匹配真实资源倍率`);
  }
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
  // 城池 0 的队列共有 4 人，但只有武将 0、1 归属该城势力；数字应显示为 2。
  const cityCountTopOffset = (0 * 160 + 6) * 4;
  const cityCountBottomLeftOffset = (3 * 160 + 6) * 4;
  assert.deepEqual(
    Array.from(pixels.slice(cityCountTopOffset, cityCountTopOffset + 4)),
    [255, 255, 255, 255],
  );
  assert.deepEqual(
    Array.from(
      pixels.slice(cityCountBottomLeftOffset, cityCountBottomLeftOffset + 4),
    ),
    [255, 255, 255, 255],
  );

  pixels.set([0, 0, 0, 255], cityOffset);
  context.sendKey(0x27);
  context.bayeFlushLcdBuffer(0);
  assert.deepEqual(
    Array.from(pixels.slice(cityOffset, cityOffset + 4)),
    [211, 47, 47, 255],
  );
}

{
  const {context, data, hooks, wasmMemory, animationFrames} = createHarness(
    new Map(), {deferAnimationFrames: true},
  );
  data.g_FgtOver = 1;
  const pixels = new Uint8ClampedArray(wasmMemory.buffer);
  for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;
  hooks.didShowMainMap({});

  // 空城直接获胜不会触发 enterBattle。核心离开选城页后直接绘制战果弹窗，
  // 弹窗的黑色文字恰好落在旧城池坐标，仍必须保持原色。
  hooks.didLeaveMainMap?.({});
  const victoryFrame = pixels.slice();
  context.bayeFlushLcdBuffer(0);
  const cityOffset = (4 * 160 + 4) * 4;
  assert.deepEqual(
    Array.from(pixels.slice(cityOffset, cityOffset + 4)),
    [0, 0, 0, 255],
    '离开地图后的战果弹窗不能按旧城池坐标染色',
  );
  assert.deepEqual(pixels, victoryFrame, '弹窗也不能被旧地图道路和守将数字覆盖');

  let canvasWrites = 0;
  context.document.getElementById = () => ({
    width: 160, height: 96,
    getContext: () => ({
      getImageData: () => ({data: victoryFrame.slice()}),
      putImageData: () => {canvasWrites++;},
    }),
  });
  animationFrames.splice(0).forEach(callback => callback());
  assert.equal(canvasWrites, 0, '上一帧地图的延迟回调不能再次覆盖当前弹窗');

  hooks.didShowMainMap({});
  context.bayeFlushLcdBuffer(0);
  assert.deepEqual(
    Array.from(pixels.slice(cityOffset, cityOffset + 4)),
    [211, 47, 47, 255],
    '重新进入地图后应恢复城池染色',
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

{
  const storage = new Map();
  const {api, hooks, scheduledTimers, systemMessages, saveMessages} = createHarness(storage);
  const statistics = () => JSON.parse(api.getBattleStatistics?.() || 'null');
  assert.equal(statistics(), null, '选择君主前不应继承其他局的战绩');
  hooks.didOpenNewGame({});
  assert.equal(statistics()?.lostSoldiers, 0, '选择君主后开始独立统计');
  hooks.battleArmsLost({sourceBelong: 1, victimBelong: 5, loss: 500});
  hooks.battleArmsLost({sourceBelong: 5, victimBelong: 1, loss: 70});
  hooks.battleArmsLost({sourceBelong: 5, victimBelong: 6, loss: 1000});
  hooks.battleGeneralDied({personIndex: 4, belong: 5, arms: 200, winnerBelong: 1});
  hooks.battleGeneralDied({personIndex: 4, belong: 5, arms: 200, winnerBelong: 1});
  assert.equal(statistics().lostSoldiers, 70);
  assert.equal(statistics().killedSoldiers, 700, '伤害与战后剩余兵力处死均计入，但同一次死亡不能重复');
  assert.equal(statistics().killedGenerals, 1);
  assert.equal(statistics().lostGenerals, 0);
  scheduledTimers.filter(timer => timer.delay === 100).at(-1).callback();
  assert.equal(systemMessages.at(-1).type, 'sgby_battle_statistics');
  assert.equal(systemMessages.at(-1).data.killedSoldiers, 700, '战斗中即推送数字，不等待返回地图');
  hooks.didSaveGame({slotIndex: 0});
  hooks.battleArmsLost({sourceBelong: 1, victimBelong: 5, loss: 100});
  hooks.didSaveGame({slotIndex: 1});
  assert.equal(saveMessages.filter(message => Object.keys(message.entries).some(key =>
    key.startsWith('baye/bbkSgbyBattleStatistics/'))).length, 2,
  '每个成功存档都要同步该档统计到Flutter备份');
  hooks.didLoadGame({slotIndex: 0});
  assert.equal(statistics().killedSoldiers, 700, '读回第一档应回滚该档之后的战绩');
  hooks.didLoadGame({slotIndex: 1});
  assert.equal(statistics().killedSoldiers, 800, '不同档位不能串用统计');
  const reopened = createHarness(storage);
  reopened.hooks.didLoadGame({slotIndex: 0});
  assert.equal(JSON.parse(reopened.api.getBattleStatistics()).killedSoldiers, 700, '重建页面后仍可恢复该档战绩');
  hooks.didOpenNewGame({});
  assert.equal(statistics().killedSoldiers, 0, '新选君主开启新局时清零');
  hooks.didLoadGame({slotIndex: 2});
  assert.equal(statistics().hasFullHistory, false, '旧档没有历史战绩时须明确从此次载入开始');
  assert.equal(statistics().killedSoldiers, 0);
}

{
  const {context, data, hooks, wasmMemory} = createHarness();
  data.g_FgtOver = 1;
  // 21号势力原来接近红色，18号接近粉色；四座相近城池属于四个不同势力。
  [1, 21, 18, 5].forEach((belong, index) => {data.g_Cities[index].Belong = belong;});
  const pixels = new Uint8ClampedArray(wasmMemory.buffer);
  const renderColors = () => {
    pixels.fill(0);
    for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;
    hooks.didShowMainMap({});
    context.bayeFlushLcdBuffer(0);
    return data.g_CityPositions.map(({x, y}) => {
      const offset = ((y * 16 + 4) * 160 + x * 16 + 4) * 4;
      return Array.from(pixels.slice(offset, offset + 3));
    });
  };
  const hueOf = ([red, green, blue]) => {
    const max = Math.max(red, green, blue), min = Math.min(red, green, blue);
    if (max === min) return 0;
    let hue = max === red ? (green - blue) / (max - min)
      : max === green ? 2 + (blue - red) / (max - min)
        : 4 + (red - green) / (max - min);
    return (hue * 60 + 360) % 360;
  };
  const colors = renderColors();
  assert.deepEqual(colors[0], [211, 47, 47], '玩家固定使用红色');
  for (let first = 0; first < colors.length; first++) {
    for (let second = first + 1; second < colors.length; second++) {
      const difference = Math.abs(hueOf(colors[first]) - hueOf(colors[second]));
      assert.ok(Math.min(difference, 360 - difference) >= 40,
        `相近城池${first}、${second}不能使用相近色相：${JSON.stringify(colors)}`);
    }
  }
  assert.deepEqual(renderColors(), colors, '重复刷新时阵营颜色应保持稳定');
  data.g_Cities[2].Belong = 21;
  const afterConquest = renderColors();
  assert.deepEqual(afterConquest[1], afterConquest[2], '同一势力的多个城池必须使用同色');
  data.g_Cities[2].Belong = 18;
  assert.notDeepEqual(renderColors()[1], renderColors()[2], '城池归属变化后须更新阵营配色缓存');
  data.g_Cities[3].Belong = 0;
  assert.deepEqual(renderColors()[3], [126, 132, 138], '无人城始终保持灰色');
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
  apply(first.api, 'sgby_attack_any_city');
  apply(first.api, 'sgby_enemy_escape_route');
  apply(first.api, 'sgby_disable_animations');
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
  assert.equal(first.data.g_engineConfig.playerAttackAnyCity, 1);
  assert.equal(first.data.g_engineConfig.enemyEscapeRoute, 1);
  assert.equal(first.data.g_LookEnemy, 0);
  assert.equal(first.data.g_LookMovie, 0);
  assert.equal(first.data.g_MoveSpeed, 0);
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
  assert.equal(restoredState.attackAnyCity, true);
  assert.equal(restoredState.enemyEscapeRoute, true);
  assert.equal(restoredState.animationsDisabled, true);
  assert.equal(restoredState.battleSpeed2x, false);
  assert.equal(restoredState.battleSpeed3x, true);
  assert.equal(restoredState.battleSpeed4x, false);
  assert.equal(restoredState.battleSpeed6x, false);
  assert.equal(restoredState.battleSpeed8x, false);
  assert.equal(second.people[0].Force, 100);
  assert.equal(second.people[0].Arms, 65535);
  assert.equal(second.data.g_engineConfig.autoBattleDefense, 1);
  assert.equal(second.data.g_engineConfig.battleLoserOutcome, 1);
  assert.equal(second.data.g_engineConfig.playerAttackAnyCity, 1);
  assert.equal(second.data.g_engineConfig.enemyEscapeRoute, 1);
  assert.equal(second.data.g_LookEnemy, 0);
  assert.equal(second.data.g_LookMovie, 0);
  assert.equal(second.data.g_MoveSpeed, 0);
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
  assert.equal(state.attackAnyCity, false);
  assert.equal(state.enemyEscapeRoute, false);
  assert.equal(state.animationsDisabled, false);
  assert.equal(state.autoEndTurn, false);
}

{
  const {api, data} = createHarness();
  apply(api, 'sgby_disable_animations');
  assert.equal(data.g_LookEnemy, 0);
  assert.equal(data.g_LookMovie, 0);
  assert.equal(data.g_MoveSpeed, 0);
  apply(api, 'sgby_disable_animations');
  assert.equal(data.g_LookEnemy, 1);
  assert.equal(data.g_LookMovie, 1);
  assert.equal(data.g_MoveSpeed, 1);
}

{
  const {context, data, hooks, people} = createHarness();
  context.baye.putPersonInCity(2, 1);
  data.g_Cities[3].Belong = 0;
  data.g_Cities[3].SatrapId = 0;
  people[6].Belong = 5;
  people[7].Tool1 = 2;

  hooks.didLoadGame({});

  assert.equal(
    data.g_PersonsQueue.filter((personIndex) => personIndex === 1).length,
    1,
    '旧存档中的同一人物只能保留一个城市队列位置',
  );
  assert.equal(data.g_Cities[3].Belong, 5);
  assert.equal(data.g_Cities[3].SatrapId, 7);
  assert.equal(people[7].Belong, 0xffff);
  assert.equal(people[7].Arms, 0);
  assert.equal(people[7].Tool1, 0);
  assert.equal(people[7].Tool2, 0);
}

{
  const {data, hooks, people} = createHarness();
  data.g_OrderQueue[0] = {OrderId: 0, Person: 7, City: 2};
  hooks.didLoadGame({});
  assert.equal(
    people[7].Belong,
    5,
    '正在执行非战斗命令的城外人物不能被旧存档修复误判为死亡',
  );
}

{
  const sharedStorage = new Map();
  const first = createHarness(sharedStorage);
  const {api, data, hooks, scheduledTimers, sentKeys, systemMessages} = first;
  data.g_FgtOver = 1;
  hooks.didShowMainMap({});

  const enabled = JSON.parse(api.handleControl('autoEndTurn'));
  assert.equal(enabled.ok, true, enabled.message);
  assert.equal(JSON.parse(api.getCheatState()).autoEndTurn, true);
  assert.equal(sentKeys.at(-1), 0x28);
  hooks.didLeaveMainMap({});
  // 真实核心先退出选城页再调用系统菜单。停止染色不能取消已经请求的结束策略。
  assert.equal(hooks.mainSystemMenu({}), 0);
  assert.equal(hooks.tacticStageUser({}), 0);
  assert.equal(hooks.mainSystemMenu({}), 0);

  hooks.enterBattle({});
  assert.equal(JSON.parse(api.getCheatState()).autoEndTurn, true);
  assert.equal(typeof hooks.tacticStageUser, 'function');
  assert.equal(typeof hooks.mainSystemMenu, 'function');
  assert.equal(systemMessages.at(-1).type, 'sgby_control_state');
  assert.equal(systemMessages.at(-1).data.autoEndTurn, true);
  assert.equal(
    hooks.tacticStageUser({}),
    -1,
    '进入战斗后不能跳过PlayerTactic，否则战后无法重新绘制战略地图',
  );

  hooks.exitBattle({});
  const keysBeforeReturningToMap = sentKeys.length;
  assert.equal(hooks.tacticStageUser({}), -1, '战斗结束不等于已经返回战略地图');
  assert.notEqual(hooks.mainSystemMenu({}), 0, '战略地图出现前不能自动选择结束策略');
  assert.equal(sentKeys.length, keysBeforeReturningToMap);
  hooks.didShowMainMap({});
  const resumeTimer = scheduledTimers.find((timer) => timer.delay === 180);
  assert.ok(resumeTimer, '战斗结束回到主地图后应安排继续自动策略');
  resumeTimer.callback();
  assert.equal(sentKeys.length, keysBeforeReturningToMap + 1);
  assert.equal(sentKeys.at(-1), 0x28);

  const second = createHarness(sharedStorage);
  assert.equal(JSON.parse(second.api.getCheatState()).autoEndTurn, true);
  assert.equal(typeof second.hooks.tacticStageUser, 'function');
  assert.equal(typeof second.hooks.mainSystemMenu, 'function');
  assert.equal(second.hooks.tacticStageUser({}), -1, '重启恢复自动策略后也要先显示战略地图');
}

{
  const {api, data, hooks, scheduledTimers, sentKeys} = createHarness();
  data.g_FgtOver = 1;
  hooks.didShowMainMap({});
  assert.equal(JSON.parse(api.handleControl('autoEndTurn')).ok, true);
  hooks.mainSystemMenu({});
  hooks.didShowMainMap({});
  const previousMapTimer = scheduledTimers.filter((timer) => timer.delay === 180).at(-1);
  assert.ok(previousMapTimer);
  hooks.enterBattle({});
  hooks.exitBattle({});
  hooks.didShowMainMap({});
  const currentMapTimer = scheduledTimers.filter((timer) => timer.delay === 180).at(-1);
  assert.notEqual(currentMapTimer, previousMapTimer);
  const keysBeforeResume = sentKeys.length;
  previousMapTimer.callback();
  assert.equal(sentKeys.length, keysBeforeResume, '战前遗留的自动策略回调不能提前结束战后的策略');
  currentMapTimer.callback();
  assert.equal(sentKeys.length, keysBeforeResume + 1);
  hooks.mainSystemMenu({});

  hooks.didShowMainMap({});
  const timerBeforeDisable = scheduledTimers.filter((timer) => timer.delay === 180).at(-1);
  assert.equal(JSON.parse(api.handleControl('autoEndTurn')).ok, true);
  assert.equal(JSON.parse(api.handleControl('autoEndTurn')).ok, true);
  hooks.mainSystemMenu({});
  const keysAfterReenable = sentKeys.length;
  timerBeforeDisable.callback();
  assert.equal(sentKeys.length, keysAfterReenable, '关闭再开启后，旧定时器不能再次结束策略');
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
  const {api, data, hooks, sentKeys} = harness;
  apply(api, 'sgby_wide_group_attack');
  api.handleControl('autoBattle');
  data.g_GenPos[0].x = 4;
  data.g_GenPos[0].y = 4;
  data.g_FoucsX = 4;
  data.g_FoucsY = 4;
  data.g_GenPos[10].x = 4;
  data.g_GenPos[10].y = 6;
  data.g_GenPos[11].x = 8;
  data.g_GenPos[11].y = 7;
  data.g_GenPos[12].x = 9;
  data.g_GenPos[12].y = 7;
  data.g_FightPath.fill(0xff);
  data.g_FightPath[4 + 4 * 15] = 0;
  data.g_FightPath[4 + 5 * 15] = 0;
  data.g_FightPath[7 + 5 * 15] = 0;

  hooks.battleStage2({});
  runNextTimer(harness);
  runNextTimer(harness);
  hooks.countMoveRange({generalIndex: 0});
  for (let index = 0; index < 20 && harness.scheduledTimers.length; index++) {
    runNextTimer(harness);
  }

  assert.deepEqual(
    sentKeys.slice(-6),
    [0x27, 0x25, 0x25, 0x25, 0x23, 0x27],
    '扩大群攻应移动到可覆盖三名敌将的落点',
  );
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
  data.g_Cities[2].Belong = 1;
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
  assert.ok(Math.abs(scheduledDelays.at(-1) - 100 / 6) < 0.001);
  controlResult = JSON.parse(api.handleControl('toggleBattleSpeed'));
  assert.equal(controlResult.ok, true, controlResult.message);
  context.safeSetTimeout(() => {}, 100);
  assert.equal(scheduledDelays.at(-1), 12.5);
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
  const {context, data, hooks, scheduledDelays} = createHarness();
  data.g_FgtOver = 1;
  hooks.didShowMainMap({});

  context.safeSetTimeout(() => {}, 200);
  assert.equal(
    scheduledDelays.at(-1),
    100,
    '战略事件和消息框延时应跟随当前 2x 游戏速度',
  );
}

{
  const storage = new Map();
  const first = createHarness(storage);
  for (let index = 0; index < 4; index++) {
    const result = JSON.parse(first.api.handleControl('toggleBattleSpeed'));
    assert.equal(result.ok, true, result.message);
  }
  const second = createHarness(storage);
  const state = JSON.parse(second.api.getCheatState());
  assert.equal(state.battleSpeed8x, true);
  second.context.safeSetTimeout(() => {}, 160);
  assert.equal(second.scheduledDelays.at(-1), 20);
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
  const storage = new Map([['baye/libpath', 'libs/test.lib']]);
  const conditions = Array.from({length: 8}, () => ({}));
  conditions[2] = {birth: 160, city: 1};
  conditions[6] = {birth: 180, city: 4};
  const harness = createHarness(storage, {
    libraryBytes: buildGeneralConditionsLibrary(conditions),
  });
  harness.context.baye.getPersonCount = () => 8;
  harness.context.baye.getPersonName = (index) =>
    index < 8 ? `武将${index}` : '';
  harness.people.push(person());
  const cheatData = JSON.parse(harness.api.getCheatData());
  assert.equal(cheatData.ok, true);
  assert.equal(
    cheatData.generals.some((general) => general.index >= 8),
    false,
    '固定容量人物数组中的未使用无名槽位不能进入将领列表',
  );
  assert.deepEqual(
    cheatData.generals.map((general) => general.group),
    [
      'player',
      'player',
      'enemy',
      'enemy',
      'enemy',
      'currentWild',
      'futureWild',
    ],
  );
  const futureGeneral = cheatData.generals.find(
    (general) => general.group === 'futureWild',
  );
  assert.equal(futureGeneral.index, 6);
  assert.equal(futureGeneral.appearanceYear, 196);
  assert.equal(futureGeneral.cityName, '城池3');
  const enemyGenerals = cheatData.generals.filter(
    (general) => general.group === 'enemy',
  );
  assert.equal(enemyGenerals[0].index, 4);
  assert.equal(enemyGenerals[0].isRuler, true);
  assert.equal(enemyGenerals[1].isRuler, false);
}

{
  const {api, data, returnedTools} = createHarness();
  apply(api, 'sgby_execute_captives');
  assert.ok(!data.g_PersonsQueue.includes(3));
  assert.deepEqual(returnedTools, [
    {city: 0, tool: 4, hide: false},
    {city: 0, tool: 5, hide: false},
  ]);
  assert.equal(data.g_Persons[3].Tool1, 0);
  assert.equal(data.g_Persons[3].Tool2, 0);
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
  const {api, data, hooks, sentKeys} = harness;
  data.g_FgtOver = 1;
  data.g_Cities[0].Food = 6000;
  hooks.didShowMainMap({});

  const result = JSON.parse(api.handleControl('quickExpedition'));
  assert.equal(result.ok, true, result.message);
  assert.equal(sentKeys.at(-1), 0x27);
  assert.equal(hooks.playerCityCommand({cityIndex: 0}), 27);
  assert.equal(hooks.cityMakeCommand({cityIndex: 0, commandIndex: 27}), 2);
  assert.equal(
    hooks.battleChoosePerson({
      cityIndex: 0,
      selectionCount: 0,
      availableCount: 2,
    }),
    0,
  );
  assert.equal(
    hooks.battleChoosePerson({
      cityIndex: 0,
      selectionCount: 1,
      availableCount: 1,
    }),
    0xffff,
  );
  assert.equal(hooks.playerCityCommand({cityIndex: 0}), -1);
  runNextTimer(harness);
  assert.deepEqual(sentKeys.slice(-5), [0x24, 0x24, 0x24, 0x23, 0x27]);
}

{
  const {api, data, hooks, sentKeys} = createHarness();
  data.g_FgtOver = 1;
  data.g_CityPos.setx = 2;
  hooks.didShowMainMap({});
  const before = sentKeys.length;
  const result = JSON.parse(api.handleControl('quickExpedition'));
  assert.equal(result.ok, false);
  assert.match(result.message, /我方城市/);
  assert.equal(sentKeys.length, before);
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
  data.g_Cities[2].Belong = 1;
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
  const {api, context, data, hooks, people} = harness;
  apply(api, 'sgby_post_battle_automation');
  data.g_FgtParam.Mode = 1;
  data.g_FgtParam.CityIndex = 2;
  hooks.enterBattle({});
  context.baye.deletePersonInCity(0, 1);
  people[1].Belong = 0xffff;
  context.baye.putPersonInCity(2, 1);
  hooks.exitBattle({});
  data.g_FgtOver = 2;
  hooks.didShowMainMap({});

  assert.equal(
    people[1].Belong,
    5,
    '我方进攻失败后，俘虏应由实际胜方势力招降',
  );
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
  people[1].Tool1 = 2;
  data.g_FgtParam.Mode = 0;
  data.g_FgtParam.CityIndex = 0;
  data.g_FgtParam.GenArray[10] = 5;
  hooks.enterBattle({});
  data.g_Cities[0].Belong = 5;
  people[1].Belong = 0xffff;
  hooks.exitBattle({});
  data.g_FgtOver = 2;
  hooks.didShowMainMap({});

  assert.equal(
    data.g_PersonsQueue.includes(1),
    false,
    '敌方攻城成功后，实际胜方的处斩设置应删除我方俘虏',
  );
  assert.equal(returnedTools.some((entry) => entry.tool === 1), true);
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
  const searchResult = JSON.parse(api.applyCheat(
    'sgby_search_outcome',
    {mode: 'none'},
  ));
  assert.equal(searchResult.ok, true, searchResult.message);
  people[7].Belong = 8;
  data.g_FgtParam.Mode = 2;
  data.g_FgtParam.CityIndex = 2;
  data.g_FgtParam.GenArray[0] = 8;
  hooks.enterBattle({});
  data.g_Cities[2].Belong = 8;
  people[5].Belong = 0xffff;
  hooks.exitBattle({});
  data.g_FgtOver = 1;
  hooks.didShowMainMap({});

  const battleCityPeople = data.g_PersonsQueue.slice(
    data.g_Cities[2].PersonQueue,
    data.g_Cities[2].PersonQueue + data.g_Cities[2].Persons,
  );
  assert.equal(people[5].Belong, 0);
  assert.equal(battleCityPeople.includes(5), false);
  assert.equal(
    data.g_PersonsQueue.includes(5),
    true,
    '敌军互战后的流放人物应进入非胜方城市',
  );
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
  const searchOutcomeResult = JSON.parse(api.applyCheat(
    'sgby_search_outcome',
    {mode: 'none'},
  ));
  assert.equal(searchOutcomeResult.ok, true, searchOutcomeResult.message);
  hooks.enterBattle({});
  data.g_Cities[2].Belong = 1;
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

{
  const storage = new Map([['baye/libpath', 'libs/test.lib']]);
  const conditions = Array.from({length: 9}, () => ({}));
  conditions[6] = {birth: 220, city: 4};
  conditions[7] = {birth: 160, city: 4};
  conditions[8] = {birth: 160, city: 0};
  const harness = createHarness(storage, {
    libraryBytes: buildGeneralConditionsLibrary(conditions),
  });
  const {api, data, people} = harness;
  harness.context.baye.getPersonCount = () => 9;
  people[5].Belong = 0;
  people[7].Belong = 0;
  people.push(person({Belong: 0}));
  // 真机 C 内存桥只暴露 length 和数字下标，不继承 Array.prototype。
  const cityValues = data.g_Cities;
  const boundCities = {length: cityValues.length};
  cityValues.forEach((city, index) => {
    boundCities[index] = city;
  });
  data.g_Cities = boundCities;
  // 城内、城外和未来在野同时存在；全地图搜索必须与“当前在野”列表范围一致。
  boundCities[3].Belong = 0;
  const before = JSON.parse(api.getCheatData());
  const currentWild = before.generals.filter(
    (general) => general.group === 'currentWild',
  );
  assert.deepEqual(
    currentWild.map((general) => general.index),
    [2, 5, 7, 8],
  );

  const searchResult = JSON.parse(api.applyCheat(
    'sgby_search_world_generals',
    {},
  ));
  assert.equal(searchResult.ok, true, searchResult.message);
  assert.equal(people[2].Belong, 1);
  assert.equal(people[5].Belong, 5);
  assert.equal(people[6].Belong, 0, '未来在野武将不能被提前搜出');
  assert.equal(people[7].Belong, 8);
  assert.equal(people[8].Belong, 1);
  assert.equal(boundCities[3].Belong, 8);
  assert.equal(boundCities[3].SatrapId, 8);
  assert.ok(data.g_PersonsQueue.includes(7));
  assert.ok(data.g_PersonsQueue.includes(8));
  assert.match(searchResult.message, /搜出 4 名/);
  assert.match(searchResult.message, /1 座空城建立新势力/);
  const history = JSON.parse(api.getSearchHistory());
  assert.equal(history.records[0].source, '全地图搜索');
  assert.equal(history.records[0].peopleCount, 4);
}

{
  const storage = new Map([['baye/libpath', 'libs/test.lib']]);
  const conditions = Array.from({length: 9}, () => ({}));
  conditions[6] = {birth: 220, city: 4};
  conditions[7] = {birth: 160, city: 2};
  conditions[8] = {birth: 160, city: 0};
  const harness = createHarness(storage, {
    libraryBytes: buildGeneralConditionsLibrary(conditions),
  });
  const {api, data, people, returnedTools} = harness;
  harness.context.baye.getPersonCount = () => 9;
  people[7].Belong = 0;
  people[7].Tool1 = 3;
  people.push(person({Belong: 0, Tool1: 4}));
  people[2].Tool1 = 2;
  const before = JSON.parse(api.getCheatData());
  const currentWild = before.generals.filter(
    (general) => general.group === 'currentWild',
  );
  assert.deepEqual(
    currentWild.map((general) => general.index),
    [2, 7, 8],
  );
  const executeResult = JSON.parse(api.applyCheat(
    'sgby_execute_wild_generals',
    {},
  ));
  assert.equal(executeResult.ok, true, executeResult.message);
  assert.match(executeResult.message, /4 名/);
  assert.equal(data.g_PersonsQueue.includes(2), false);
  assert.equal(data.g_PersonsQueue.includes(6), false);
  assert.equal(data.g_PersonsQueue.includes(3), true);
  assert.equal(people[2].Belong, 0xffff);
  assert.equal(people[6].Belong, 0xffff, '一键处死必须同时覆盖未来在野武将');
  assert.equal(people[7].Belong, 0xffff);
  assert.equal(people[8].Belong, 0xffff);
  assert.equal(returnedTools.some((entry) => entry.tool === 1), true);
  assert.equal(returnedTools.some((entry) => entry.tool === 2), true);
  assert.equal(returnedTools.some((entry) => entry.tool === 3), true);

  const searchResult = JSON.parse(api.applyCheat(
    'sgby_search_world_generals',
    {},
  ));
  assert.match(searchResult.message, /搜出 0 名/);
  const history = JSON.parse(api.getSearchHistory());
  assert.equal(history.records[0].source, '全地图处死在野');
  assert.equal(history.records[0].executedCount, 4);
}

{
  const harness = createHarness();
  const {api, data, hooks, people, returnedTools} = harness;
  const outcomeResult = JSON.parse(api.applyCheat(
    'sgby_battle_loser_outcome',
    {mode: 'death'},
  ));
  assert.equal(outcomeResult.ok, true, outcomeResult.message);
  data.g_FgtParam.CityIndex = 0;
  hooks.enterBattle({});
  hooks.exitBattle({});
  data.g_Cities[0].Belong = 5;
  hooks.didShowMainMap({});

  assert.equal(data.g_PersonsQueue.includes(3), false);
  assert.equal(people[3].Belong, 0xffff);
  assert.equal(returnedTools.some((entry) => entry.tool === 4), true);
  assert.equal(returnedTools.some((entry) => entry.tool === 5), true);
}

{
  const storage = new Map([['baye/libpath', 'libs/test.lib']]);
  const conditions = Array.from({length: 8}, () => ({}));
  conditions[6] = {birth: 220, city: 4};
  const harness = createHarness(storage, {libraryBytes: buildGeneralConditionsLibrary(conditions)});
  harness.context.baye.getPersonCount = () => 8;
  const roster = JSON.parse(harness.api.getCheatData());
  assert.equal(roster.ok, true);
  assert.equal(roster.generals.find(general => general.index === 6).group, 'futureWild');
  assert.equal(harness.resourceRequests.length, 0, '首次读取将领列表必须复用引擎资源，不能同步请求LIB');
  harness.context.dynLib = '00';
  harness.data.g_PIdx = 2;
  assert.equal(JSON.parse(harness.api.getCheatData()).ok, true, '损坏或切换中的资源不能导致列表崩溃');
}

{
  const {api, data, hooks, scheduledTimers, sentKeys} = createHarness();
  data.g_FgtOver = 1;
  hooks.didShowMainMap({});
  assert.equal(JSON.parse(api.handleControl('autoEndTurn')).ok, true);
  hooks.mainSystemMenu({});
  api.beginUiPause();
  api.beginUiPause();
  const keysBeforePause = sentKeys.length;
  assert.equal(JSON.parse(api.getCheatState()).autoEndTurn, true, '面板暂挂不能改变用户持久开关');
  assert.equal(hooks.tacticStageUser({}), -1, '面板打开时必须等待玩家阶段');
  assert.notEqual(hooks.mainSystemMenu({}), 0);
  api.endUiPause();
  assert.equal(hooks.tacticStageUser({}), -1, '嵌套面板尚未全部关闭时不能恢复');
  assert.equal(sentKeys.length, keysBeforePause);
  api.endUiPause();
  assert.equal(hooks.tacticStageUser({}), 0);
  const resumeTimer = scheduledTimers.filter(timer => timer.delay === 180).at(-1);
  assert.ok(resumeTimer);
  resumeTimer.callback();
  assert.equal(sentKeys.length, keysBeforePause + 1);
  hooks.mainSystemMenu({});
  api.endUiPause();
  assert.equal(sentKeys.length, keysBeforePause + 1, '重复关闭不能重复恢复自动操作');
}

{
  const harness = createHarness();
  const {api, hooks, sentKeys, scheduledTimers} = harness;
  api.handleControl('autoBattle');
  hooks.battleStage2({});
  const oldTimers = scheduledTimers.slice();
  api.beginUiPause();
  const keysBeforePause = sentKeys.length;
  oldTimers.forEach(timer => timer.callback());
  assert.equal(sentKeys.length, keysBeforePause, '打开面板后旧的自动战斗回调不能继续发按键');
  api.endUiPause();
  assert.equal(JSON.parse(api.getCheatState()).autoBattle, true);
  assert.ok(scheduledTimers.length > oldTimers.length, '面板关闭后应重新安排自动战斗');
}

{
  const storage = new Map();
  const {api, data} = createHarness(storage);
  assert.equal(data.g_engineConfig.playerDiplomacyProtection, 0);
  assert.equal(JSON.parse(api.applyCheat('sgby_diplomacy_protection')).ok, true);
  assert.equal(data.g_engineConfig.playerDiplomacyProtection, 1);
  assert.equal(JSON.parse(createHarness(storage).api.getCheatState()).diplomacyProtection, true);
  api.applyCheat('sgby_diplomacy_protection');
  assert.equal(data.g_engineConfig.playerDiplomacyProtection, 0);
}

{
  const harness = createHarness();
  harness.data.g_FgtOver = 1;
  harness.hooks.didShowMainMap({});
  harness.people[0].Arms = harness.people[1].Arms = 0;
  const before = harness.sentKeys.length;
  assert.equal(JSON.parse(harness.api.handleControl('quickExpedition')).ok, false);
  assert.equal(harness.sentKeys.length, before, '全城零兵时不能发起出征或改变自动策略');
}

{
  const storage = new Map();
  const names = {0: '通宵虫', 4: '南方小鬼'};
  const harness = createHarness(storage, {personNames: names});
  const {api, data, people, hooks} = harness;
  assert.equal(JSON.parse(api.applyCheat('sgby_hide_special_generals')).ok, false, '战斗中不允许改君主与参战队列');
  data.g_FgtOver = 1;
  hooks.didOpenNewGame({});
  const counters = JSON.parse(api.getBattleStatistics());
  // 核心绑定数组只有length和数字属性，没有Array.prototype.forEach。
  data.g_Cities = Object.assign({length: data.g_Cities.length}, data.g_Cities);
  data.g_Persons = Object.assign({length: people.length}, people);
  data.g_OrderQueue = Object.assign({length: data.g_OrderQueue.length}, data.g_OrderQueue);
  assert.equal(JSON.parse(api.applyCheat('sgby_hide_special_generals')).ok, true);
  assert.equal(data.g_PlayerKing, 1);
  assert.equal(data.g_Cities[0].Belong, 2);
  assert.equal(data.g_Cities[2].Belong, 6);
  assert.equal(people[0].Belong, 0xffff);
  assert.equal(people[4].Belong, 0xffff);
  assert.equal(data.g_PersonsQueue.includes(0), false);
  assert.equal(data.g_PersonsQueue.includes(4), false);
  assert.equal(JSON.parse(api.getBattleStatistics()).lostGenerals, counters.lostGenerals);
  assert.equal(JSON.parse(api.getBattleStatistics()).killedGenerals, counters.killedGenerals);
  assert.equal(JSON.parse(api.getCheatData()).generals.some(person => person.index === 0 || person.index === 4), false);
  hooks.didSaveGame({slotIndex: 1});
  const slot = JSON.parse(storage.get('baye/bbkSgbyHiddenGenerals/slot-1'));
  assert.equal(slot.people.length, 2);
  const hiddenState = JSON.parse(JSON.stringify(data));
  assert.equal(JSON.parse(api.applyCheat('sgby_hide_special_generals')).ok, true);
  assert.equal(data.g_PlayerKing, 1, '关闭隐藏不能让原君主夺位');
  assert.equal(people[0].Belong, 2);
  assert.equal(people[4].Belong, 6);
  assert.equal(people[0].Arms, 100);
  assert.equal(people[4].Arms, 500);
  // 全局开关已关闭；重新载入隐藏状态档位时，应使用该档备份恢复。
  Object.assign(data, hiddenState);
  hooks.didLoadGame({slotIndex: 1});
  assert.equal(data.g_Persons[0].Belong, 2);
  assert.equal(data.g_Persons[4].Belong, 6);
  assert.equal(data.g_PersonsQueue.filter(index => index === 0).length, 1);
  assert.equal(data.g_PersonsQueue.filter(index => index === 4).length, 1);
  assert.equal(data.g_PlayerKing, 1);
}

{
  const harness = createHarness(new Map(), {personNames: {0: '通宵虫', 4: '南方小鬼'}});
  harness.data.g_FgtOver = 1;
  harness.people[5].Belong = harness.people[7].Belong = 0;
  const before = JSON.stringify(harness.data);
  assert.equal(JSON.parse(harness.api.applyCheat('sgby_hide_special_generals')).ok, false);
  assert.equal(JSON.stringify(harness.data), before, '无人继位时整次操作必须无副作用');
  assert.equal(JSON.parse(harness.api.getCheatState()).hideSpecialGenerals, false);
}

{
  const storage = new Map();
  const {api, data, context, hooks, drawnImages, systemMessages} = createHarness(storage);
  data.g_paintColor = 0xff;
  hooks.drawOneGeneral({index: 0, pic: 12, x: 0, y: 0, frame: 1});
  assert.equal(drawnImages.at(-1).picIndex, 12, '默认保留河流船图');
  const switched = JSON.parse(api.handleControl('toggleTroopIcons'));
  assert.equal(switched.ok, true);
  assert.equal(switched.enabled, true);
  assert.equal(systemMessages.at(-1).data.showTroopIcons, true);
  for (let arms = 0; arms < 6; arms++) {
    // 使用装备后的实际兵种，不能依赖人物基础ArmsType或河流临时图标。
    context.baye.getArmType = () => arms;
    for (const [index, facing] of [[0, 0], [10, 16]]) {
      for (const frame of [0, 1]) {
        const drawing = {index, pic: facing + 12 + frame, x: 0, y: 0, frame: 1};
        hooks.drawOneGeneral(drawing);
        assert.equal(drawnImages.at(-1).picIndex, facing + arms * 2 + frame);
        assert.equal(drawnImages.at(-1).paintColor, index === 0 ? 0x80 : 0xff);
        assert.equal(drawing.pic, facing + 12 + frame, '绘制后不能污染核心临时图块索引');
        assert.equal(data.g_paintColor, 0xff);
      }
    }
  }
  for (const picture of [0, 3, 10, 14, 15, 37]) {
    hooks.drawOneGeneral({index: 0, pic: picture, x: 0, y: 0, frame: 1});
    assert.equal(drawnImages.at(-1).picIndex, picture, '陆地、异常状态与自定义图不能被替换');
  }
  data.g_FgtParam.GenArray[0] = 0;
  hooks.drawOneGeneral({index: 0, pic: 12, x: 0, y: 0, frame: 0});
  assert.equal(drawnImages.at(-1).picIndex, 12, '无效战场人物不能越界查询兵种');
  assert.equal(JSON.parse(createHarness(storage).api.getCheatState()).showTroopIcons, true);
  assert.equal(JSON.parse(api.handleControl('toggleTroopIcons')).enabled, false);
  hooks.drawOneGeneral({index: 10, pic: 29, x: 0, y: 0, frame: 1});
  assert.equal(drawnImages.at(-1).picIndex, 29, '关闭立即恢复敌方船图');
  assert.equal(JSON.parse(createHarness(storage).api.getCheatState()).showTroopIcons, false);
}

{
  const received = [];
  const {api, hooks, data, context} = createHarness(new Map(), {hooks: {
    drawOneGeneral(event) {received.push({...event}); return 7;},
  }});
  context.baye.getArmType = () => 2;
  api.handleControl('toggleTroopIcons');
  data.g_paintColor = 0xff;
  const drawing = {index: 10, pic: 29, x: 16, y: 32, frame: 1};
  assert.equal(hooks.drawOneGeneral(drawing), 7, '保留模组原Hook的返回值');
  assert.equal(received[0].pic, 21, '模组绘制接收到原兵种与原朝向、原动画帧');
  assert.equal(drawing.pic, 29);
  assert.equal(data.g_paintColor, 0xff);
}

console.log('三国霸业增强回归测试通过');
