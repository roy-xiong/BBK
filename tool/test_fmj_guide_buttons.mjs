import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkWideUi, checkWideCombat } from './fmj_wide_ui_checks.mjs';
import { checkLifuWalk } from './fmj_lifu_walk_checks.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deviceMode = process.argv.includes('--device');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let chrome, server, socket, sequence = 0;
const pending = new Map();
const exceptions = [];
try {
  let port = 9224;
  if (!deviceMode) {
    const assets = path.join(project, 'assets/games');
    server = http.createServer((req, res) => {
      const file = path.resolve(assets, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
      if (!file.startsWith(assets + '/')) return res.writeHead(403).end();
      fs.readFile(file, (error, bytes) => {
        if (error) return res.writeHead(404).end();
        const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[path.extname(file)] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' }).end(bytes);
      });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const profile = fs.mkdtempSync('/tmp/fmj-button-regression-');
    chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless', '--disable-gpu', '--disable-background-networking', '--disable-component-update', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
    for (let i = 0; i < 80; i++) {
      try { port = fs.readFileSync(profile + '/DevToolsActivePort', 'utf8').split('\n')[0]; break; } catch { await delay(100); }
    }
  }
  const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const page = deviceMode ? pages.find(p => p.url.includes('/fmj/index.html')) : pages.find(p => p.type === 'page');
  assert.ok(page, '没有找到伏魔记页面');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const data = JSON.parse(event.data), request = pending.get(data.id);
    if (data.method === 'Runtime.exceptionThrown') exceptions.push(data.params.exceptionDetails);
    if (!request) return;
    pending.delete(data.id);
    if (data.error) request.reject(data.error); else request.resolve(data.result);
  };
  function cdp(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence; pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.equal(result.exceptionDetails, undefined, '页面 JavaScript 执行异常');
    return result.result.value;
  }
  await cdp('Runtime.enable');
  if (!deviceMode) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true });
    await cdp('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/fmj/index.html' });
    for (let i = 0; i < 60; i++) { if (await evaluate('!!window.FmjGuide')) break; await delay(100); }
    await evaluate(`(()=>{const c=window['fmj.core'].fmj;c.scene.SaveLoadGame.startNewGame=true;c.game.changeScreen_gacx6e$(c.ScreenViewType.SCREEN_MAIN_GAME);})()`);
    await delay(150);
    await evaluate(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene;s.scriptProcess.stop();s.loadMap_tjonv8$(1,2,15,0);if(!s.player)s.createActor_qt1dr2$(1,4,3);s.player.setPosInMap_vux9f0$(19,3);s.setMapScreenPos_vux9f0$(15,0);c.script.ScriptResources.globalEvents[1]=true;s.startChapter_vux9f0$(2,12);})()`);
    for (let i = 0; i < 50; i++) { if (await evaluate('FmjGuide.state()?.busy===false')) break; await delay(100); }
    if (process.argv.includes('--lifu')) {
      await checkLifuWalk(evaluate, delay);
      await evaluate(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene;s.scriptProcess.stop();c.script.ScriptResources.initGlobalEvents();c.script.ScriptResources.globalEvents[1]=true;s.loadMap_tjonv8$(1,2,15,0);s.player.setPosInMap_vux9f0$(19,3);s.setMapScreenPos_vux9f0$(15,0);s.startChapter_vux9f0$(2,12);})()`);
      for (let i = 0; i < 50; i++) { if (await evaluate('FmjGuide.state()?.busy===false')) break; await delay(100); }
    }
    if (process.argv.includes('--ui')) {
      await checkWideUi(evaluate, delay);
      await evaluate(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene;s.scriptProcess.stop();s.loadMap_tjonv8$(1,2,15,0);s.player.setPosInMap_vux9f0$(19,3);s.setMapScreenPos_vux9f0$(15,0);s.startChapter_vux9f0$(2,12);})()`);
      for (let i = 0; i < 50; i++) { if (await evaluate('FmjGuide.state()?.busy===false')) break; await delay(100); }
    }
    if (process.argv.includes('--wide')) {
      const initial = await evaluate('FmjGuide.state()');
      const display = await evaluate('FmjWideView.state()');
      assert.equal(display.width, 320);
      assert.equal(display.height, 192);
      assert.equal(display.camera.columns, 20);
      assert.equal(display.camera.rows, 12);
      const fill = await evaluate(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene,original=s.currentMap;window.sysSetGameLoopPaused(true);const road=c.lib.DatLib.Companion.getRes_2et8c9$(c.lib.DatLib.ResType.MAP,1,45);s.currentMap=road;s.drawScene_9in0vv$(c.game.canvas_0);const blank=c.game.canvas_0.buffer.filter(p=>p.r===28&&p.g===41&&p.b===40).length;s.currentMap=original;s.drawScene_9in0vv$(c.game.canvas_0);window.sysSetGameLoopPaused(false);return blank;})()`);
      assert.equal(fill, 0, '2× 小地图不应留下大片纯色空白');
      const fillAll = await evaluate(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene,original=s.currentMap,bad=[];window.sysSetGameLoopPaused(true);try{for(const entry of FmjGuideData.maps){s.currentMap=c.lib.DatLib.Companion.getRes_2et8c9$(c.lib.DatLib.ResType.MAP,entry.type,entry.index);s.drawScene_9in0vv$(c.game.canvas_0);if(c.game.canvas_0.buffer.some(p=>p.r===28&&p.g===41&&p.b===40))bad.push(entry.id);}return bad;}finally{s.currentMap=original;s.drawScene_9in0vv$(c.game.canvas_0);window.sysSetGameLoopPaused(false);}})()`);
      assert.deepEqual(fillAll, [], '全部室外、建筑和洞穴原图都应填满 2× 画面');
      const clipped = await evaluate(`(()=>{window.sysSetGameLoopPaused(true);const c=window['fmj.core'].fmj,module=window['fmj.core'],canvas=c.game.canvas_0,paint=new module.graphics.Paint();paint.color=c.Global.COLOR_BLACK;paint.style=module.graphics.Paint.Style.FILL;canvas.drawColor_we4i00$(c.Global.COLOR_WHITE);canvas.drawRect_x3aj6j$(10,10,14,14,paint);const scaled=canvas.buffer[20*320+20].r===0&&canvas.buffer[27*320+27].r===0&&canvas.buffer[28*320+28].r===180;const bitmap=module.graphics.Bitmap_init_vux9f0$(16,16);canvas.drawBitmap_t8cslu$(bitmap,-6,-6);const clipped=canvas.buffer.length===320*192&&!Object.keys(canvas.buffer).some(k=>Number(k)<0);window.sysSetGameLoopPaused(false);return {scaled,clipped}})()`);
      assert.equal(clipped.scaled, true, 'UI 应在 2× 逻辑坐标直接绘制');
      assert.equal(clipped.clipped, true, '负坐标图形必须裁剪到逻辑画布');
      await evaluate('bbkToggleWideView()');
      assert.equal(await evaluate('FmjWideView.state().width'), 160);
      await evaluate('bbkToggleWideView()');
      assert.deepEqual(await evaluate('FmjGuide.state().flags'), initial.flags);
      assert.equal(await evaluate('FmjGuide.state().x'), initial.x);
      assert.equal(await evaluate('FmjGuide.state().y'), initial.y);
      console.log('远视野验证通过：320×192 填满、20×12 格、2× UI 坐标、负坐标裁剪、无损切换。');
    }
    if (process.argv.includes('--exits')) {
      for (const fixture of [
        { script: [12, 3], map: [3, 8], position: [4, 25], flags: [238], expected: '1:35' },
        { script: [13, 2], map: [3, 3], position: [17, 15], flags: [245], expected: '1:45' },
        { script: [9, 13], map: [3, 9], position: [9, 8], flags: [231, 232, 233], expected: '1:24' },
      ]) {
        await evaluate(`(()=>{const f=${JSON.stringify(fixture)},c=window['fmj.core'].fmj,s=c.game.mainScene;s.scriptProcess.stop();c.characters.Player.Companion.sGoodsList.addGoods_vux9f0$(13,1);f.flags.forEach(i=>c.script.ScriptResources.globalEvents[i]=true);s.loadMap_tjonv8$(f.map[0],f.map[1],f.position[0]-4,f.position[1]-3);s.player.setPosInMap_vux9f0$(f.position[0],f.position[1]);s.setMapScreenPos_vux9f0$(f.position[0]-4,f.position[1]-3);s.startChapter_vux9f0$(f.script[0],f.script[1]);})()`);
        for (let i = 0; i < 70; i++) {
          if (await evaluate('FmjGuide.state()?.busy===false')) break;
          await evaluate('window.bbkSendInput("confirm")'); await delay(80);
        }
        const count = await evaluate('window["fmj.core"].fmj.characters.Player.Companion.sGoodsList.getGoodsNum_vux9f0$(13,1)');
        const exited = await evaluate('window.bbkGoToFmjExit()');
        assert.equal(exited.ok, true, '原引路石出口没有执行成功：' + fixture.script.join(':'));
        for (let i = 0; i < 50; i++) {
          if (await evaluate('FmjGuide.state().mapId===' + JSON.stringify(fixture.expected))) break;
          await delay(100);
        }
        assert.equal(await evaluate('FmjGuide.state().mapId'), fixture.expected);
        assert.equal(await evaluate('window["fmj.core"].fmj.characters.Player.Companion.sGoodsList.getGoodsNum_vux9f0$(13,1)'), count, '应遵循原引路石的非消耗逻辑');
      }
      console.log('原引擎返回验证通过：南山虎穴、北海龙潭、摄魂阵。');
      await evaluate(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene;if(c.game.getCurScreen()!==s)c.game.getCurScreen().popScreen();s.scriptProcess.stop();c.script.ScriptResources.initGlobalEvents();c.script.ScriptResources.globalEvents[1]=true;s.loadMap_tjonv8$(1,2,15,0);s.player.setPosInMap_vux9f0$(19,3);s.setMapScreenPos_vux9f0$(15,0);s.startChapter_vux9f0$(2,12);})()`);
      for (let i = 0; i < 50; i++) { if (await evaluate('FmjGuide.state()?.busy===false')) break; await delay(100); }
    }
    if (process.argv.includes('--quick')) {
      const flags = await evaluate('FmjGuide.state().flags');
      const result = await evaluate('window.bbkGoToFmjNextGoal()');
      assert.equal(result.ok, true, '外部一键前往没有执行成功');
      assert.equal(await evaluate('FmjGuide.state().scriptId'), '2:2');
      assert.equal(await evaluate('!!document.getElementById("fmj-guide")'), false, '外部前往不应创建地图面板');
      assert.deepEqual(await evaluate('FmjGuide.state().flags'), flags);
      console.log('外部前往验证通过：未创建地图页面，抵达真实任务地点且剧情标记不变。');
      await evaluate(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene;if(c.game.getCurScreen()!==s)c.game.getCurScreen().popScreen();s.scriptProcess.stop();s.loadMap_tjonv8$(1,2,15,0);s.player.setPosInMap_vux9f0$(19,3);s.setMapScreenPos_vux9f0$(15,0);s.startChapter_vux9f0$(2,12);})()`);
      for (let i = 0; i < 50; i++) { if (await evaluate('FmjGuide.state()?.busy===false')) break; await delay(100); }
    }
    await evaluate('FmjGuide.open()'); await delay(250);
  }
  assert.equal(await evaluate('FmjGuide.inspect().open'), true, '请在游戏内打开地图面板');
  if (process.argv.includes('--perf')) {
    const perf = await evaluate(`(async()=>{const c=window['fmj.core'].fmj,originalDraw=c.game.draw,originalPresent=window.sysDrawScreen;let draws=0,presents=0;const drawProbe=function(){draws++;return originalDraw.apply(this,arguments)},presentProbe=function(){presents++;return originalPresent.apply(this,arguments)};c.game.draw=drawProbe;window.sysDrawScreen=presentProbe;try{await new Promise(r=>setTimeout(r,320));return {draws,presents}}finally{c.game.draw=originalDraw;window.sysDrawScreen=originalPresent;}})()`);
    console.log(JSON.stringify({ hiddenGameFrames: perf }));
    assert.equal(perf.draws, 0, '地图打开后仍在绘制被遮住的游戏画面');
    assert.equal(perf.presents, 0, '地图打开后仍在做游戏高清放大');
  }
  async function tap(selector) {
    const point = await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,dpr:devicePixelRatio,disabled:b.disabled};})()`);
    assert.ok(point, '找不到按钮：' + selector);
    assert.equal(point.disabled, false, '按钮不应在可操作场景被禁用');
    if (deviceMode) {
      const bounds = JSON.parse(page.description);
      execFileSync('adb', ['-s', 'a330d811', 'shell', 'input', 'tap', String(Math.round(bounds.screenX + point.x * point.dpr)), String(Math.round(bounds.screenY + point.y * point.dpr))]);
    } else {
      await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] });
      await delay(60);
      await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await delay(300);
  }
  const before = await evaluate('FmjGuide.inspect().camera.zoom');
  await tap('[data-action="zoom-in"]');
  const after = await evaluate('FmjGuide.inspect().camera.zoom');
  console.log(JSON.stringify({ mode: deviceMode ? 'Android 实际触摸' : '浏览器触摸', zoomBefore: before, zoomAfter: after }));
  assert.ok(after > before * 1.2, '触摸放大按钮没有产生效果');
  const gridBefore = await evaluate('document.querySelector("[data-action=grid]").classList.contains("active")');
  await tap('[data-action="grid"]');
  assert.equal(await evaluate('document.querySelector("[data-action=grid]").classList.contains("active")'), !gridBefore, '格子按钮没有生效');
  if (!deviceMode || process.argv.includes('--travel')) {
    const goal = await evaluate('FmjGuide.engine.nextGoal(FmjGuide.state())');
    const flags = await evaluate('FmjGuide.state().flags');
    await tap('[data-action="next"]');
    for (let i = 0; i < 50; i++) { if (await evaluate('FmjGuide.state().scriptId===' + JSON.stringify(goal.scriptId))) break; await delay(100); }
    assert.equal(await evaluate('FmjGuide.state().scriptId'), goal.scriptId, '触摸一键前往按钮没有执行传送');
    assert.deepEqual(await evaluate('FmjGuide.state().flags'), flags, '传送不能改写剧情标记');
    console.log(JSON.stringify({ nextButton: '真实触摸成功', arrived: goal.scriptId, flagsUnchanged: true }));
    if (process.argv.includes('--wide') && !deviceMode) {
      await evaluate(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene;if(c.game.getCurScreen()!==s)c.game.getCurScreen().popScreen();s.scriptProcess.stop();s.triggerEvent_za3lpa$(9);})()`);
      await delay(160);
      assert.equal(await evaluate('window["fmj.core"].fmj.game.mainScene.scriptProcess.running'), true);
      assert.equal(await evaluate('FmjWideView.state().width'), 320, '对话不能切回旧逻辑画面');
      await evaluate(`(()=>{const c=window['fmj.core'].fmj,s=c.game.mainScene;s.scriptProcess.stop();s.loadMap_tjonv8$(3,2,0,9);s.player.setPosInMap_vux9f0$(4,12);s.setMapScreenPos_vux9f0$(0,9);s.startChapter_vux9f0$(2,19);})()`);
      for (let i = 0; i < 50; i++) { if (await evaluate('FmjGuide.state()?.busy===false')) break; await delay(100); }
      await evaluate('window["fmj.core"].fmj.game.mainScene.triggerEvent_za3lpa$(1)');
      await delay(160);
      assert.equal(await evaluate('window["fmj.core"].fmj.combat.Combat.Companion.IsActive()'), true);
      assert.equal(await evaluate('FmjWideView.state().width'), 320, '战斗不能切回旧逻辑画面');
      assert.equal(await evaluate('window["fmj.core"].fmj.game.canvas_0.buffer.length'), 320 * 192);
      if (process.argv.includes('--ui')) await checkWideCombat(evaluate);
      console.log('原引擎对话和护灯战斗验证通过：全程保持 320×192。');
    }
  }
  if (deviceMode) {
    // 关闭面板后实际点击 Flutter 工具栏重新打开，验证平台视图没有重挂载丢失命中链。
    await evaluate('FmjGuide.open()'); await delay(200);
    await tap('[data-action="close"]');
    assert.equal(await evaluate('FmjGuide.inspect().open'), false);
    execFileSync('adb', ['-s', 'a330d811', 'shell', 'uiautomator', 'dump', '/sdcard/bbk-button-check.xml']);
    const xml = execFileSync('adb', ['-s', 'a330d811', 'shell', 'cat', '/sdcard/bbk-button-check.xml'], { encoding: 'utf8' });
    const toolbar = xml.match(/<node[^>]*content-desc="剧情帮助与地图"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    assert.ok(toolbar, '未发现地图工具栏按钮');
    execFileSync('adb', ['-s', 'a330d811', 'shell', 'input', 'tap', String(Math.round((+toolbar[1] + +toolbar[3]) / 2)), String(Math.round((+toolbar[2] + +toolbar[4]) / 2))]);
    await delay(300);
    assert.equal(await evaluate('FmjGuide.inspect().open'), true, '实际点击工具栏后地图未重新打开');
    const reopened = await evaluate('FmjGuide.inspect().camera.zoom');
    await tap('[data-action="zoom-in"]');
    assert.ok(await evaluate('FmjGuide.inspect().camera.zoom') > reopened * 1.2, '地图重新打开后再次丢失触摸');
  }
  console.log('地图按钮触摸回归通过。');
  assert.deepEqual(exceptions, [], '游戏帧循环不能出现未处理的 JavaScript 异常');
} finally {
  socket?.close(); chrome?.kill('SIGTERM'); server?.close();
}
