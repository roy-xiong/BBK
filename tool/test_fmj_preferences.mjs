import assert from 'node:assert/strict';
import { createFmjBrowser, delay } from './fmj_browser_session.mjs';

/** 通过实际网页重载核查按钮的持久化值，以及发送给 Flutter 文件备份的键值。 */
const browser = await createFmjBrowser({ accelerated: true });
try {
  await browser.evaluate(`(() => {
    window.__preferenceWrites = [];
    window.BbkSaveChannel = { postMessage: value => window.__preferenceWrites.push(JSON.parse(value)) };
    bbkSelectFmjStage('stage-034');
  })()`);
  await delay(100);
  await browser.evaluate(`(() => {
    FmjGuide.open();
    const select = document.querySelector('[data-id="story-scope"]');
    if (!select) throw Error('流程范围按钮没有出现');
    select.value = 'main'; select.dispatchEvent(new Event('change'));
    FmjGuide.close();
  })()`);
  await browser.evaluate(`(() => {
    sysSetGameLoopPaused(true);
    bbkApplyCheat('fmj_invincible');
    bbkApplyCheat('fmj_one_hit_kill');
    bbkApplyCheat('fmj_normal_attack_all');
    bbkApplyCheat('fmj_random_battle');
    bbkSetFmjRunSpeed(3);
    bbkSetFmjAutoBattle(true);
    FmjWideView.setEnabled(false);
  })()`);
  const expected = {
    invincible: true, oneHitKill: true, normalAttackAll: true,
    randomBattleDisabled: true, runSpeed: 3, autoBattle: true, wideView: false, storyScope: 'main',
  };
  const exported = JSON.parse(await browser.evaluate('bbkExportState()'));
  assert.ok(exported['bbk/fmj_controls'], '按钮设置必须导出到 Flutter 文件备份，端口改变也能恢复');
  const saved = JSON.parse(exported['bbk/fmj_controls']);
  for (const [key, value] of Object.entries(expected)) assert.equal(saved[key], value, key + ' 必须保存实际值');
  const writes = await browser.evaluate('window.__preferenceWrites');
  assert.ok(writes.some(write => write.entries['bbk/fmj_controls'] === exported['bbk/fmj_controls']), '最后一次按钮变更必须实时发送到 Flutter');

  async function reload() {
    await browser.evaluate('window.__preferencesOldPage = true');
    await browser.cdp('Page.reload');
    for (let i = 0; i < 100; i++) {
      if (await browser.evaluate('!window.__preferencesOldPage && document.body?.dataset.gameReady === "true" && !!window.bbkGetFmjRunSpeed')) return;
      await delay(10);
    }
    throw Error('游戏重载未完成');
  }
  async function assertRestored() {
    const state = await browser.evaluate(`({
      cheats: JSON.parse(bbkGetCheatState()),
      speed: JSON.parse(bbkGetFmjRunSpeed()).multiplier,
      autoBattle: JSON.parse(bbkGetFmjAutoBattle()).enabled,
      wideView: FmjWideView.state().enabled,
      scope: FmjPreferences.get('storyScope'),
      monitor: bbkCheatState.monitorStarted,
    })`);
    for (const key of ['invincible', 'oneHitKill', 'normalAttackAll', 'randomBattleDisabled']) assert.equal(state.cheats[key], expected[key], key + ' 重载后必须生效');
    assert.equal(state.speed, expected.runSpeed);
    assert.equal(state.autoBattle, expected.autoBattle);
    assert.equal(state.wideView, expected.wideView);
    assert.equal(state.scope, expected.storyScope);
    assert.equal(state.monitor, true, '恢复作弊后必须自动安装原功能钩子');
  }
  await reload();
  await assertRestored();
  // 从存储恢复的值必须驱动真实作弊和自动攻击，不能只恢复显示标签。
  await browser.evaluate("bbkSelectFmjStage('stage-034')");
  await delay(100);
  await browser.evaluate(`(() => {
    sysSetGameLoopPaused(true);
    const core = window['fmj.core'].fmj, scene = core.game.mainScene;
    scene.scriptProcess.stop(); scene.scriptProcess.curOp_0 = null;
    core.combat.Combat.Companion.EnterFight_dnhp7$(core.game.vm, 0,
      new Int32Array([1, 0, 0]), new Int32Array([2, 2, 2]),
      new Int32Array([0, 0, 0]), new Int32Array([0, 0, 0]), 0, 0);
    const combat = core.combat.Combat.Companion.sInstance_0, original = combat.onAutoAttack;
    window.__restoredAutoAttacks = 0;
    combat.onAutoAttack = function () { window.__restoredAutoAttacks++; return original.apply(this, arguments); };
    core.game.playerList.toArray().forEach(player => { player.hp = 1; });
    combat.mMonsterList_0.toArray().forEach(monster => { monster.hp = monster.maxHP - 1; });
  })()`);
  let actualEffect;
  for (let i = 0; i < 50; i++) {
    actualEffect = await browser.evaluate(`(() => {
      const core = window['fmj.core'].fmj, players = core.game.playerList.toArray();
      return {
        invincible: players.every(player => player.hp === player.maxHP),
        oneHitKill: core.combat.Combat.Companion.sInstance_0.mMonsterList_0.toArray().every(monster => monster.hp === 0),
        normalAttackAll: players.every(player => player.hasAtbuff_za3lpa$(core.characters.FightingCharacter.Companion.BUFF_MASK_ALL)),
        autoBattle: window.__restoredAutoAttacks > 0,
      };
    })()`);
    if (Object.values(actualEffect).every(Boolean)) break;
    await delay(10);
  }
  assert.deepEqual(actualEffect, { invincible: true, oneHitKill: true, normalAttackAll: true, autoBattle: true }, '恢复后实际作弊和自动攻击必须生效');
  // 清掉测试浏览器存储，用原 HTML 的启动还原路径恢复 Flutter 文件镜像。
  const restoreScript = await browser.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const nativeOpen = XMLHttpRequest.prototype.open, nativeSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__preferenceBackup = url === '/__state__/fmj';
      return nativeOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      if (!this.__preferenceBackup) return nativeSend.apply(this, arguments);
      Object.defineProperty(this, 'status', { value: 200 });
      Object.defineProperty(this, 'responseText', { value: ${JSON.stringify(JSON.stringify({ entries: exported }))} });
    };
  })()` });
  await browser.evaluate('localStorage.clear()');
  await reload();
  await assertRestored();
  await browser.cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: restoreScript.identifier });
  // 保存关闭状态并再次重载，防止恢复时只处理开启而忽略用户关闭。
  await browser.evaluate("bbkSelectFmjStage('stage-034')");
  await delay(100);
  await browser.evaluate(`(() => {
    bbkApplyCheat('fmj_invincible'); bbkApplyCheat('fmj_one_hit_kill');
    bbkApplyCheat('fmj_normal_attack_all'); bbkApplyCheat('fmj_random_battle');
    bbkSetFmjRunSpeed(1); bbkSetFmjAutoBattle(false); FmjWideView.setEnabled(true); FmjPreferences.set('storyScope', 'complete');
  })()`);
  Object.assign(expected, { invincible: false, oneHitKill: false, normalAttackAll: false, randomBattleDisabled: false, runSpeed: 1, autoBattle: false, wideView: true, storyScope: 'complete' });
  await reload();
  await assertRestored();
  assert.deepEqual(browser.exceptions, []);
  console.log('按钮持久化通过：作弊、随机战斗、奔跑倍速、自动战斗、视野，开启/关闭重载恢复、Flutter 实时备份及存储清理后的镜像还原。');
} finally {
  browser.close();
}
