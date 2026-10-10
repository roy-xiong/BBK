import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createFmjBrowser, delay } from './fmj_browser_session.mjs';

/** 首次提交的独立 1× 页面，所有游戏资源直接读取固定 Git 对象。 */
export const originalFmjCommit = '6b6b62b';
export async function createOriginalFmjBrowser() {
  const blobs = new Map();
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!pathname.startsWith('/fmj/') || pathname.includes('..')) return response.writeHead(404).end();
    const resource = 'assets/games' + pathname;
    try {
      if (!blobs.has(resource)) blobs.set(resource, execFileSync('git', ['show', originalFmjCommit + ':' + resource], { maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }));
      const type = resource.endsWith('.js') ? 'application/javascript' : 'text/html';
      response.writeHead(200, { 'Content-Type': type + '; charset=utf-8' }).end(blobs.get(resource));
    } catch (_) {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await createFmjBrowser();
    await browser.cdp('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/fmj/index.html' });
    for (let i = 0; i < 100; i++) {
      if (await browser.evaluate("document.body?.dataset.gameReady === 'true' && !!window['fmj.core'] && !window.FmjWideView")) break;
      await delay(20);
    }
    await browser.evaluate('clearInterval(fmj.updateInterval)');
    const closeBrowser = browser.close;
    return { ...browser, close() { closeBrowser(); server.close(); } };
  } catch (error) {
    browser?.close(); server.close(); throw error;
  }
}

/**
 * 真正执行首次提交的场景、对白和 SRS 动画，保留每次 40ms 更新后的显示帧。
 * 捕获像素和上下推进位置，不重画遮罩，也不人为加入扫描线或点阵。
 */
export const originalCurtainReplay = `(() => {
  clearInterval(fmj.updateInterval);
  const c = window['fmj.core'].fmj;
  c.scene.SaveLoadGame.startNewGame = true;
  c.game.changeScreen_gacx6e$(c.ScreenViewType.SCREEN_MAIN_GAME);
  const scene = c.game.mainScene;
  scene.scriptProcess.stop(); scene.scriptProcess.curOp_0 = null;
  scene.createActor_qt1dr2$(1, 4, 3); scene.createActor_qt1dr2$(2, 4, 3);
  scene.startChapter_vux9f0$(3, 12);
  const frames = [], delta = kotlin.Long.fromInt(40);
  for (let tick = 0; tick < 400; tick++) {
    c.game.update_s8cxhz$(delta); c.game.draw();
    sysDrawScreen(c.game.canvas_0.buffer, c.game.canvas_0.width, c.game.canvas_0.height);
    const op = scene.scriptProcess.curOp_0;
    if (op?.closure$movie?.type === 1 && op.closure$movie.index === 3) {
      const rows = [];
      for (let y = 0; y < c.game.canvas_0.height; y++) {
        let black = 0;
        for (let x = 0; x < c.game.canvas_0.width; x++) {
          const pixel = c.game.canvas_0.buffer[y * c.game.canvas_0.width + x];
          if (pixel.r === 0 && pixel.g === 0 && pixel.b === 0) black++;
        }
        rows.push(black);
      }
      const lcd = document.querySelector('#lcd'), displayed = lcd.getContext('2d').getImageData(0, 0, lcd.width, lcd.height).data;
      const sx = lcd.width / c.game.canvas_0.width, sy = lcd.height / c.game.canvas_0.height;
      let rawHash = 2166136261, displayHash = 2166136261;
      for (let y = 0; y < c.game.canvas_0.height; y++) for (let x = 0; x < c.game.canvas_0.width; x++) {
        const pixel = c.game.canvas_0.buffer[y * c.game.canvas_0.width + x];
        const position = (Math.floor((y + 0.5) * sy) * lcd.width + Math.floor((x + 0.5) * sx)) * 4;
        for (const [channel, value] of [pixel.r, pixel.g, pixel.b, pixel.a].entries()) {
          rawHash = Math.imul(rawHash ^ value, 16777619) >>> 0;
          displayHash = Math.imul(displayHash ^ displayed[position + channel], 16777619) >>> 0;
        }
      }
      frames.push({ tick, keys: op.closure$movie.mShowList_0.toArray().map(key => key.index_8be2vx$), rows, rawHash, displayHash, image: lcd.toDataURL() });
    } else if (op?.closure$text) {
      const text = sysGbkDecode(op.closure$text);
      if (frames.length && text.includes('蛇妖:竟敢找人来对付我')) break;
      scene.scriptProcess.keyDown_za3lpa$(c.Global.KEY_ENTER); scene.scriptProcess.keyUp_za3lpa$(c.Global.KEY_ENTER);
    }
  }
  return { width: c.game.canvas_0.width, height: c.game.canvas_0.height, frames };
})()`;
