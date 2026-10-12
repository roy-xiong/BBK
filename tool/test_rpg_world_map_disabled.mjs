import assert from 'node:assert/strict';
import { createFmjBrowser, delay } from './fmj_browser_session.mjs';

/**
 * 核查两款 RPG 保留剧情任务入口时，真实网页不加载图集、不创建地图画布。
 * 同时验证阅读暂停、关闭恢复、门派选择、流程设置及原引擎逐格行走。
 */
for (const gameId of ['fmj', 'jyqxz']) {
  const browser = await createFmjBrowser({ gameId, accelerated: true });
  try {
    const resources = await browser.evaluate('performance.getEntriesByType("resource").map(entry => new URL(entry.name).pathname)');
    assert.ok(resources.some(name => name.endsWith('/navigation-data.js')), gameId + ' 必须加载独立导航数据');
    assert.ok(resources.some(name => name.endsWith('/guide.css')), gameId + ' 必须加载剧情任务样式');
    assert.ok(!resources.some(name => /\/(guide-data\.js|world-map\.json)$/.test(name)), gameId + ' 不能加载完整世界地图资源');
    assert.equal(await browser.evaluate('Object.hasOwn(FmjGuideData, "world") || Object.hasOwn(FmjGuideData, "tiles")'), false);

    // 引擎已加载但尚未开局时，空列表提示不能访问不存在的世界图集数据。
    const empty = await browser.evaluate(`(() => {
      const result = JSON.parse(bbkOpenFmjGuide()), root = document.getElementById('fmj-guide');
      return { result, text: root.textContent, canvas: root.querySelector('canvas') !== null };
    })()`);
    assert.equal(empty.result.ok, true);
    assert.match(empty.text, /请先开始或载入游戏/);
    assert.equal(empty.canvas, false);
    await browser.evaluate('FmjGuide.close()');

    const stageId = gameId === 'fmj' ? 'stage-034' : 'scene-9:11';
    assert.equal(JSON.parse(await browser.evaluate(`bbkSelectFmjStage(${JSON.stringify(stageId)})`)).ok, true);
    let state;
    for (let i = 0; i < 200; i++) {
      state = await browser.evaluate('FmjGuide.state()');
      if (state && !state.busy) break;
      await browser.evaluate('bbkSendInput("confirm")');
      await delay(10);
    }
    assert.ok(state && !state.busy, gameId + ' 选关后必须进入可操作场景');
    await browser.evaluate('if (!JSON.parse(bbkGetCheatState()).randomBattleDisabled) bbkApplyCheat("fmj_random_battle")');

    const mapAttempts = await browser.evaluate(`(() => {
      window.__panelWork = { contexts: 0, observers: 0, frames: 0 };
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function () { __panelWork.contexts++; return getContext.apply(this, arguments); };
      const Observer = window.ResizeObserver;
      window.ResizeObserver = class extends Observer { constructor(...args) { super(...args); __panelWork.observers++; } };
      const frame = window.requestAnimationFrame;
      window.requestAnimationFrame = function () { __panelWork.frames++; return frame.apply(this, arguments); };
      const results = [bbkOpenFmjGuide(), FmjGuide.open()].map(JSON.parse);
      const root = document.getElementById('fmj-guide'), aside = root.querySelector('aside');
      return { results, paused: fmj.updateInterval === null, title: root.querySelector('h1').textContent,
        canvas: !!root.querySelector('canvas'), mapArea: !!root.querySelector('.map-area'),
        scrollable: getComputedStyle(aside).overflowY, view: FmjGuide.inspect(), work: __panelWork };
    })()`);
    assert.ok(mapAttempts.results.every(result => result.ok === true));
    assert.equal(mapAttempts.paused, true, '阅读任务时应暂停游戏');
    assert.match(mapAttempts.title, /剧情与任务/);
    assert.equal(mapAttempts.canvas, false, '任务面板不能生成隐藏地图画布');
    assert.equal(mapAttempts.mapArea, false, '地图工具与区域应一并移除');
    assert.equal(mapAttempts.scrollable, 'auto');
    assert.equal(mapAttempts.view.open, true);
    assert.equal(mapAttempts.view.cards, 0);
    assert.deepEqual(mapAttempts.work, { contexts: 0, observers: 0, frames: 0 });
    for (const width of [390, 320]) {
      await browser.cdp('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
      const size = await browser.evaluate(`(() => {
        document.querySelector('#fmj-guide [data-action="refresh"]').click();
        const root = document.getElementById('fmj-guide'), aside = root.querySelector('aside'), header = root.querySelector('header');
        return { width: innerWidth, scrollWidth: root.scrollWidth, asideHeight: aside.clientHeight, remainingHeight: root.clientHeight - header.offsetHeight, display: getComputedStyle(aside).display, work: __panelWork };
      })()`);
      assert.ok(size.scrollWidth <= size.width, '竖屏任务面板不能横向溢出');
      assert.ok(size.asideHeight > size.remainingHeight * 0.85, '任务列表应占满正文，不保留隐藏世界图的空白');
      assert.equal(size.display, 'block');
      assert.deepEqual(size.work, { contexts: 0, observers: 0, frames: 0 }, '刷新及调整尺寸不能触发世界地图工作');
    }

    const scope = await browser.evaluate(`(() => {
      const select = document.querySelector('[data-id="story-scope"]');
      select.value = 'main'; select.dispatchEvent(new Event('change'));
      return FmjPreferences.get('storyScope');
    })()`);
    assert.equal(scope, 'main', '轻量列表中的流程设置必须仍可保存');
    if (gameId === 'jyqxz') {
      // 截住路线执行以验证菜单分发，既不依赖长途耗时，也不让验证改变剧情。
      const selected = await browser.evaluate(`(() => {
        const engine = FmjGuide.engine, route = engine.route, button = document.querySelector('[data-jy-school="101"]');
        const expanded = button.closest('details').open;
        let target;
        engine.route = function (state, destination) { target = destination; return { unavailable: true }; };
        try { button.click(); return { expanded, target, stored: JSON.parse(localStorage.getItem('bbk/jyqxz_goal')) }; }
        finally { engine.route = route; localStorage.removeItem('bbk/jyqxz_goal'); }
      })()`);
      assert.equal(selected.expanded, true, '门派入门应默认展开，玩家不必滑到长列表末尾寻找');
      assert.equal(selected.target.scriptId, '13:1');
      assert.equal(selected.target.event, 1);
      assert.equal(selected.stored.label, '拜访华山派掌门');
    }

    const destination = await browser.evaluate(`(() => {
      const state = FmjGuide.state(), engine = FmjGuide.engine, flood = engine.flood(state);
      for (let index = 0; index < flood.distance.length; index++) {
        const x = index % flood.map.width, y = Math.floor(index / flood.map.width);
        if (flood.distance[index] === 2 && engine.walkable(state, x, y, false))
          return { scriptId: state.scriptId, mapId: state.mapId, x, y };
      }
      return null;
    })()`);
    assert.ok(destination, gameId + ' 测试场景应有可行走的道路');
    const result = await browser.evaluate(`FmjGuide.travel(${JSON.stringify(destination)})`);
    assert.equal(result.ok, true, JSON.stringify(result));
    const arrival = await browser.evaluate('FmjGuide.state()');
    assert.deepEqual([arrival.x, arrival.y], [destination.x, destination.y], '停用世界图集后仍能实际自动走路');
    assert.equal(await browser.evaluate('!!FmjGuide.engine.nextGoal(FmjGuide.state()).label && typeof bbkGoToFmjNextGoal === "function"'), true);
    assert.equal(await browser.evaluate('document.getElementById("fmj-guide").hidden && fmj.updateInterval !== null'), true, '从面板前往应关闭列表并恢复游戏');
    await browser.evaluate('FmjGuide.open(); document.querySelector("#fmj-guide [data-action=close]").click()');
    assert.equal(await browser.evaluate('!FmjGuide.inspect().open && fmj.updateInterval !== null'), true, '返回游戏按钮应正常恢复时钟');
    assert.equal(await browser.evaluate('document.querySelector("#fmj-guide canvas")'), null);
    const visibility = await browser.evaluate('__fmjAuditNotices.filter(n => n.type === "fmj_guide_visibility").map(n => n.data.visible)');
    assert.equal(visibility.includes(true) && visibility.at(-1) === false, true, '面板显隐必须继续通知 Flutter');
    assert.deepEqual(browser.exceptions, [], gameId + ' 不能产生运行异常');
    console.log(gameId + ' 通过：剧情任务入口恢复，无世界图集、画布、布局/绘制帧和缩放监听；竖屏列表、门派、流程设置、暂停恢复及自动行走正常。');
  } finally {
    browser.close();
  }
}
