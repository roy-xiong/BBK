import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

/**
 * 只读验证用户提供的实际 ROM，运行当前项目的 EmulatorJS 包装页与固定内核。
 * 本地服务按宿主配置提供文件白名单；原 ROM/BIOS 不复制、不重命名、不写入。
 * 截图、检查结果和临时即时档写入输出目录，用于桌面浏览器兼容性证据。
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function option(name) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; }
const nesPath = option('--nes');
const arcadeDirectory = option('--arcade-dir');
const output = option('--out');
const onlyName = option('--only');
if (!output || (!nesPath && !arcadeDirectory)) throw Error('需要 --out，以及 --nes 或 --arcade-dir');
fs.mkdirSync(output, { recursive: true });
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'assets/games/emulator/fbneo-romsets.json'), 'utf8')).games;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const games = [];
if (nesPath) games.push({ path: nesPath, family: 'nes' });
if (arcadeDirectory) for (const name of fs.readdirSync(arcadeDirectory).sort()) {
  if (/\.(zip|7z)$/i.test(name) && name !== 'neogeo.zip') games.push({ path: path.join(arcadeDirectory, name), family: 'arcade' });
}
if (onlyName) for (let index = games.length - 1; index >= 0; index--) {
  if (path.basename(games[index].path) !== onlyName) games.splice(index, 1);
}
let active;
const results = [];
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    if (active && url.pathname.startsWith(active.prefix)) {
      const resource = decodeURIComponent(url.pathname.slice(active.prefix.length));
      if (resource === 'config') {
        response.setHeader('Content-Type', 'application/json');
        return response.end(JSON.stringify(active.config));
      }
      if (resource === 'cheat-definitions') return response.writeHead(404).end();
      if (resource.startsWith('save/')) {
        const name = resource.slice(5);
        if (!['sram', 'state', 'auto', 'cheats'].includes(name)) return response.writeHead(404).end();
        if (request.method === 'POST') {
          let bytes = 0;
          const chunks = [];
          for await (const chunk of request) {
            bytes += chunk.length;
            if (bytes > 128 * 1024 * 1024) throw Error('即时档超过测试大小限制');
            chunks.push(chunk);
          }
          active.saves.set(name, Buffer.concat(chunks));
          return response.writeHead(204).end();
        }
        const bytes = active.saves.get(name);
        if (!bytes) return response.writeHead(404).end();
        return response.end(bytes);
      }
      const file = active.files.get(resource);
      if (!file) return response.writeHead(404).end();
      response.setHeader('Content-Type', 'application/octet-stream');
      response.setHeader('Content-Length', fs.statSync(file).size);
      if (request.method === 'HEAD') return response.end();
      return fs.createReadStream(file).pipe(response);
    }
    const assetRoot = path.join(root, 'assets/games');
    const file = path.resolve(assetRoot, `.${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(assetRoot + path.sep)) return response.writeHead(403).end();
    const type = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' }[path.extname(file)] || 'application/octet-stream';
    response.setHeader('Content-Type', type);
    if (file.endsWith('index.html')) response.setHeader('Content-Security-Policy',
      "default-src 'self' blob: data:; script-src 'self' blob: 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'");
    if (!fs.existsSync(file)) return response.writeHead(404).end();
    fs.createReadStream(file).pipe(response);
  } catch (error) { if (!response.headersSent) response.writeHead(500); response.end(error.message); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = fs.mkdtempSync('/tmp/bbk-real-rom-browser-');
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--disable-background-networking', '--autoplay-policy=no-user-gesture-required', '--window-size=960,720',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let launchLog = '';
chrome.stderr.on('data', data => { launchLog = (launchLog + data).slice(-3000); });
let socket;
let requestId = 0;
try {
  let port;
  for (let index = 0; index < 100; index++) {
    try {
      const candidate = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
      if (/^\d+$/.test(candidate)) { port = candidate; break; }
    } catch (_) {}
    await delay(100);
  }
  if (!port) throw Error(`Chrome 启动失败：${launchLog}`);
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown' && active) active.exceptions.push(message.params.exceptionDetails);
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id); clearTimeout(item.timer);
    if (message.error) item.reject(Error(JSON.stringify(message.error))); else item.resolve(message.result);
  };
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++requestId;
    pending.set(id, { resolve, reject, timer: setTimeout(() => { pending.delete(id); reject(Error(`${method} 超时`)); }, 30000) });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 960, height: 720, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source:
    'window.__bbkMessages=[];window.BbkEmulatorChannel={postMessage(message){window.__bbkMessages.push(JSON.parse(message))}};' });
  let commandId = 0;
  async function command(action, parameters = {}) {
    const id = ++commandId;
    await evaluate(`bbkEmulatorRequest(${id},${JSON.stringify(action)},${JSON.stringify(parameters)})`);
    for (let i = 0; i < 300; i++) {
      const result = await evaluate(`window.__bbkMessages.find(message=>message.type==='reply'&&message.id===${id})||null`);
      if (result) { if (!result.ok) throw Error(result.message); return result; }
      await delay(100);
    }
    throw Error(`${action} 未返回结果`);
  }
  async function screenshot(name) {
    const result = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(output, name);
    fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
    return file;
  }
  async function pulse(button, milliseconds = 150) {
    await evaluate(`bbkEmulatorInput(${button},1)`);
    await delay(milliseconds);
    await evaluate(`bbkEmulatorInput(${button},0)`);
  }
  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const fileName = path.basename(game.path);
    const stem = path.basename(game.path, path.extname(game.path));
    const sha256 = hash(fs.readFileSync(game.path));
    const token = randomBytes(24).toString('hex');
    const prefix = `/__emulator__/${token}/`;
    const files = new Map([[`rom/${fileName}`, game.path]]);
    const bios = {};
    if (game.family === 'arcade') {
      const biosFile = path.join(path.dirname(game.path), 'neogeo.zip');
      if (fs.existsSync(biosFile)) { files.set('bios/neogeo.zip', biosFile); bios['neogeo.zip'] = `${prefix}bios/neogeo.zip`; }
      const parent = catalog[stem];
      if (typeof parent === 'string') for (const ext of ['zip', '7z']) {
        const parentFile = path.join(path.dirname(game.path), `${parent}.${ext}`);
        if (fs.existsSync(parentFile)) {
          files.set(`bios/${parent}.${ext}`, parentFile); bios[`${parent}.${ext}`] = `${prefix}bios/${parent}.${ext}`; break;
        }
      }
    }
    active = { prefix, files, saves: new Map(), exceptions: [], config: {
      core: game.family === 'nes' ? 'fceumm' : 'fbneo', family: game.family, title: stem, hash: sha256,
      prefix, romUrl: `${prefix}rom/${encodeURIComponent(fileName)}`, bios, sramName: `${stem}.srm` } };
    const result = { name: fileName, file: game.path, sha256, size: fs.statSync(game.path).size, family: game.family,
      core: active.config.core, nameIndexed: game.family === 'nes' || Object.hasOwn(catalog, stem), parent: catalog[stem] || null,
      suppliedBIOS: Object.keys(bios), started: false, screenshots: [] };
    console.log(`开始验证 ${fileName}`);
    const startedAt = Date.now();
    try {
      await cdp('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/emulator/index.html?session=${token}` });
      for (let tick = 0; tick < 900; tick++) {
        const messages = await evaluate('window.__bbkMessages||[]');
        const failure = messages.find(message => message.type === 'error');
        if (failure) throw Error(failure.message);
        if (messages.some(message => message.type === 'ready')) { result.started = true; break; }
        await delay(100);
      }
      if (!result.started) throw Error('90 秒内未启动');
      result.bootMilliseconds = Date.now() - startedAt;
      await delay(2500);
      result.screenshots.push(await screenshot(`${i}-boot.png`));
      if (game.family === 'arcade') await pulse(2); // 投币
      await pulse(3); // START
      await delay(1500);
      if (game.family === 'nes') await delay(8000); // 等待任务介绍结束，再验证可操作场景。
      if (game.family === 'arcade') { await pulse(2); await pulse(3); }
      else await pulse(3);
      await delay(1500);
      await pulse(7, 500); // 右
      await pulse(game.family === 'nes' ? 8 : 0, 300); // 跳跃或射击
      await delay(1000);
      result.screenshots.push(await screenshot(`${i}-play.png`));
      result.runtime = await evaluate(`({frames:EJS_emulator.gameManager.getFrameNum(),
        width:EJS_emulator.gameManager.getVideoDimensions('width'),height:EJS_emulator.gameManager.getVideoDimensions('height'),
        heapBytes:EJS_emulator.Module.HEAPU8.length,paused:EJS_emulator.paused,
        audioState:EJS_emulator.Module.AL?.currentCtx?.audioCtx?.state||null,diagnostics:EJS_emulator.bbkDiagnostics})`);
      await command('pause', { paused: true });
      await command('saveState');
      result.screenshots.push(await screenshot(`${i}-saved.png`));
      result.stateBytes = active.saves.get('state')?.length || 0;
      const savedBytes = active.saves.get('state');
      const saved = hash(savedBytes);
      await evaluate(`(()=>{const fn=EJS_emulator.gameManager.functions.loadState;
        EJS_emulator.gameManager.functions.loadState=(...args)=>{const result=fn(...args);window.__bbkLoadResult=result;return result}})()`);
      await command('pause', { paused: false });
      await pulse(7, 300);
      await delay(300);
      await command('pause', { paused: true });
      await command('loadState');
      const restoredBytes = await evaluateBytes('EJS_emulator.gameManager.getState()');
      result.stateRestoreExact = saved === hash(restoredBytes);
      result.loadStateReturn = await evaluate('window.__bbkLoadResult');
      result.stateDifference = { beforeLength: savedBytes.length, afterLength: restoredBytes.length, offsets: [] };
      for(let index=0;index<Math.min(savedBytes.length,restoredBytes.length);index++) {
        if(savedBytes[index] !== restoredBytes[index] && result.stateDifference.offsets.length < 80)
          result.stateDifference.offsets.push({offset:index,before:savedBytes[index],after:restoredBytes[index]});
      }
      fs.writeFileSync(path.join(output, `${i}-saved.state`), savedBytes);
      fs.writeFileSync(path.join(output, `${i}-restored.state`), restoredBytes);
      await command('snapshot');
      result.autoStateBytes = active.saves.get('auto')?.length || 0;
      result.screenshots.push(await screenshot(`${i}-restored.png`));
      await command('pause', { paused: false });
      await delay(150);
      await command('pause', { paused: true });
      result.screenshots.push(await screenshot(`${i}-resumed.png`));
      if (game.family === 'nes') {
        await command('pause', { paused: false });
        await pulse(3, 500);
        await delay(10000);
        result.screenshots.push(await screenshot(`${i}-start.png`));
        await pulse(8, 300);
        await pulse(0, 300);
        await pulse(7, 500);
        await delay(1500);
        result.screenshots.push(await screenshot(`${i}-action.png`));
        await delay(5000);
        await pulse(7, 700);
        await pulse(0, 200);
        await pulse(8, 200);
        await delay(500);
        await command('pause', { paused: true });
        result.screenshots.push(await screenshot(`${i}-gameplay-saved.png`));
        await command('saveState');
        const beforeFrame = await evaluate('EJS_emulator.gameManager.getFrameNum()');
        await delay(250);
        result.pausedFrames = { before: beforeFrame, after: await evaluate('EJS_emulator.gameManager.getFrameNum()') };
        await command('pause', { paused: false });
        await pulse(7, 1000);
        await command('pause', { paused: true });
        result.screenshots.push(await screenshot(`${i}-gameplay-moved.png`));
        await command('loadState');
        await command('pause', { paused: false });
        await delay(60);
        await command('pause', { paused: true });
        result.screenshots.push(await screenshot(`${i}-gameplay-restored.png`));
      }
    } catch (error) {
      result.error = error.message;
      result.screenshots.push(await screenshot(`${i}-error.png`));
    } finally {
      result.exceptions = active.exceptions.map(exception => exception.exception?.description || exception.text);
      try { result.diagnostics = await evaluate('window.EJS_emulator?.bbkDiagnostics||[]'); } catch (_) {}
      try { result.virtualBIOS = await evaluate(`(()=>{const fs=window.EJS_emulator?.gameManager?.FS;
        if(!fs)return null;try{const b=fs.readFile('/neogeo.zip');return {size:b.length,header:[...b.slice(0,8)]}}catch(e){return {error:String(e)}}})()`); } catch (_) {}
      try { await evaluate('window.bbkEmulatorShutdown?.()'); } catch (_) {}
      await cdp('Page.navigate', { url: 'about:blank' });
      await delay(200);
      results.push(result);
      fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
      console.log(JSON.stringify({ name: result.name, started: result.started, error: result.error,
        stateBytes: result.stateBytes, stateRestoreExact: result.stateRestoreExact, frames: result.runtime?.frames }));
    }
  }
  async function evaluateBytes(expression) {
    const base64 = await evaluate(`(()=>{const data=${expression};let text='';for(let i=0;i<data.length;i+=32768)
      text+=String.fromCharCode(...data.subarray(i,i+32768));return btoa(text)})()`);
    return Buffer.from(base64, 'base64');
  }
} finally { socket?.close(); chrome.kill('SIGTERM'); server.close(); }
