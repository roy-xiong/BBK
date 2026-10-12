import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const token = 'a'.repeat(48);
const prefix = `/__emulator__/${token}/`;
const arcade = process.argv.includes('--arcade');
const profile = fs.mkdtempSync('/tmp/bbk-emulator-browser-');
const saves = new Map();
const messages = [];
const networkFailures = [];
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

/** 自造 NROM 测试卡带，带电池 RAM 和手柄读取，不使用任何第三方游戏 ROM。 */
function testRom() {
  const rom = Buffer.alloc(16 + 16384 + 8192);
  rom.set([0x4e, 0x45, 0x53, 0x1a, 1, 1, 2], 0);
  // 初始化 PPU；循环计数至 $6000，读取 NES A 键至 $6001。
  const program = [0x78, 0xd8, 0xa2, 0xff, 0x9a, 0xa9, 0, 0x8d, 0, 0x20, 0x8d, 1, 0x20,
    0xa9, 0x3f, 0x8d, 6, 0x20, 0xa9, 0, 0x8d, 6, 0x20, 0xa9, 0x20, 0x8d, 7, 0x20,
    0xa9, 8, 0x8d, 1, 0x20];
  const loop = 0x8000 + program.length;
  program.push(0xee, 0, 0x60, 0xa9, 1, 0x8d, 0x16, 0x40, 0xa9, 0, 0x8d, 0x16, 0x40,
    0xad, 0x16, 0x40, 0x29, 1, 0x8d, 1, 0x60, 0xad, 2, 0x60, 0x8d, 3, 0x60,
    0x4c, loop & 255, loop >> 8);
  rom.set(program, 16);
  for (const offset of [0x3ffa, 0x3ffc, 0x3ffe]) rom.writeUInt16LE(0x8000, 16 + offset);
  return rom;
}
const rom = testRom();
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname.startsWith(prefix)) {
    const resource = url.pathname.slice(prefix.length);
    if (resource === 'config') {
      response.setHeader('Content-Type', 'application/json');
      return response.end(JSON.stringify({ core: arcade ? 'fbneo' : 'fceumm', family: arcade ? 'arcade' : 'nes',
        title: 'BBK Test', hash: 'b'.repeat(64), prefix,
        romUrl: `${prefix}rom/${arcade ? 'invalid.zip' : 'bbk-test.nes'}`, sramName: 'bbk-test.srm', bios: {} }));
    }
    if (resource.startsWith('rom/')) return response.end(rom);
    if (resource === 'cheat-definitions') return response.writeHead(404).end();
    if (resource.startsWith('save/')) {
      const name = resource.slice(5);
      if (request.method === 'POST') {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        saves.set(name, Buffer.concat(chunks));
        return response.writeHead(204).end();
      }
      if (!saves.has(name)) return response.writeHead(404).end();
      return response.end(saves.get(name));
    }
    return response.writeHead(404).end();
  }
  const target = path.resolve(root, 'assets/games', `.${decodeURIComponent(url.pathname)}`);
  if (!target.startsWith(path.join(root, 'assets/games') + path.sep)) return response.writeHead(403).end();
  try {
    const bytes = fs.readFileSync(target);
    const type = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' }[path.extname(target)] || 'application/octet-stream';
    response.setHeader('Content-Type', type);
    if (target.endsWith('index.html')) response.setHeader('Content-Security-Policy',
      "default-src 'self' blob: data:; script-src 'self' blob: 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'");
    response.end(bytes);
  } catch (_) { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--disable-background-networking', '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let logs = '';
chrome.stderr.on('data', data => { logs = (logs + data).slice(-3000); });
let socket;
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; } catch (_) {}
    await delay(100);
  }
  assert.ok(port, logs);
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Network.loadingFailed') networkFailures.push(message.params);
    if (message.method === 'Runtime.consoleAPICalled') {
      const text = message.params.args.map(arg => arg.value || arg.description || '').join(' ');
      if (/^BBK_MESSAGE /.test(text)) messages.push(JSON.parse(text.slice(12)));
      if (/Failed|Error|error|abort/.test(text)) console.log(text.slice(0, 1200));
    }
    if (message.method === 'Runtime.exceptionThrown') console.log(JSON.stringify(message.params));
    const waiting = pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id); clearTimeout(waiting.timer);
    message.error ? waiting.reject(Error(JSON.stringify(message.error))) : waiting.resolve(message.result);
  };
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject, timer: setTimeout(() => reject(Error(`${method} timeout`)), 30000) });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Network.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source:
    'window.BbkEmulatorChannel={postMessage(message){console.log("BBK_MESSAGE "+message)}};' });
  const url = `http://127.0.0.1:${server.address().port}/emulator/index.html?session=${token}`;
  await cdp('Page.navigate', { url });
  if (arcade) {
    for (let i = 0; i < 300; i++) {
      const failure = messages.find(message => message.type === 'error');
      if (failure) {
        console.log('PASS: FBNeo 对不匹配的 ROM 返回加载错误：' + failure.message);
        process.exitCode = 0;
        break;
      }
      if (messages.some(message => message.type === 'ready')) {
        console.log('FBNEO CHECK', await evaluate('EJS_emulator.bbkDiagnostics'));
        throw Error('FBNeo 将无效 ROM 误报告为就绪');
      }
      await delay(100);
      if (i === 299) throw Error('FBNeo 未能反馈无效 ROM 错误');
    }
  } else {
  async function awaitReady() {
    for (let i = 0; i < 300; i++) {
      if (messages.some(message => message.type === 'ready')) return;
      const failure = messages.find(message => message.type === 'error');
      if (failure) throw Error(failure.message);
      await delay(100);
    }
    throw Error('NES core startup timed out');
  }
  await awaitReady();
  // 外置 BIOS/父档使用 vendor 的 ArrayBuffer 下载分支，不能产生 0 字节虚拟文件。
  const externalSize = await evaluate(`(async()=>{
    const original=EJS_emulator.config.externalFiles;
    EJS_emulator.config.externalFiles={'/external-buffer.bin':EJS_emulator.config.gameUrl};
    try {await EJS_emulator.gameManager.loadExternalFiles();
      return EJS_emulator.gameManager.FS.readFile('/external-buffer.bin').length;
    } finally {EJS_emulator.config.externalFiles=original;}
  })()`);
  assert.equal(externalSize, rom.length, '外置 ArrayBuffer 必须完整写入虚拟文件系统');
  let commandId = 0;
  async function command(action, parameters = {}) {
    const id = ++commandId;
    await evaluate(`bbkEmulatorRequest(${id},${JSON.stringify(action)},${JSON.stringify(parameters)})`);
    for (let i = 0; i < 100; i++) {
      const reply = messages.find(message => message.type === 'reply' && message.id === id);
      if (reply) { assert.equal(reply.ok, true, reply.message); return reply; }
      await delay(50);
    }
    throw Error(`${action} timeout`);
  }
  await delay(500);
  await evaluate('bbkEmulatorInput(8,1)');
  await delay(200);
  assert.equal(await evaluate('EJS_emulator.gameManager.getSaveFile()[1]'), 1, '长按 A 必须进入 NES 控制器读取');
  await command('snapshot');
  assert.ok(saves.get('sram').length >= 8192, 'SRAM 必须来自实际核心');
  await evaluate('bbkEmulatorInput(8,0)');
  await delay(200);
  await command('saveState');
  assert.equal(saves.get('sram')[1], 0, '释放 A 后 NES 输入必须清零');
  assert.ok(saves.get('state').length > 1000, '即时档必须包含实际核心状态');
  await command('loadState');
  await command('pause', { paused: true });
  assert.equal(await evaluate('EJS_emulator.paused'), true);
  await command('addCheat', { desc: '测试代码', code: '6002:42' });
  assert.equal((await command('getCheats')).value[0].checked, false);
  await command('pause', { paused: false });
  await delay(200);
  assert.equal(await evaluate('EJS_emulator.gameManager.getSaveFile()[3]'), 0, '默认关闭的代码不能生效');
  await command('toggleCheat', { index: 0, enabled: true });
  assert.equal((await command('getCheats')).value[0].checked, true);
  await delay(200);
  assert.equal(await evaluate('EJS_emulator.gameManager.getSaveFile()[3]'), 0x42, '代码必须修改实际 NES CPU 的读取');
  await command('toggleCheat', { index: 0, enabled: false });
  await delay(200);
  assert.equal(await evaluate('EJS_emulator.gameManager.getSaveFile()[3]'), 0, '关闭代码必须恢复原始读取');
  await command('toggleCheat', { index: 0, enabled: true });
  await command('snapshot');
  // 只靠 SRAM 恢复一次，不能让自动即时档掩盖 SRAM 写入/加载目录错误。
  saves.get('sram')[4] = 0x5a;
  saves.delete('auto');
  messages.length = 0;
  await cdp('Page.reload');
  await awaitReady();
  assert.equal(await evaluate('EJS_emulator.gameManager.getSaveFile()[4]'), 0x5a, '仅 SRAM 必须正确恢复');
  assert.equal((await command('getCheats')).value[0].desc, '测试代码', '跨页面重启必须恢复外置金手指列表');
  assert.equal((await command('getCheats')).value[0].checked, true);
  await command('snapshot');
  await evaluate('bbkEmulatorShutdown()');
  assert.equal(await evaluate('EJS_emulator.paused'), true);
  assert.equal(networkFailures.filter(item => item.blockedReason).length, 0, '运行时不能依赖被 CSP 阻止的 CDN 资源');
  console.log('PASS: 实际 FCEUmm 启动、按下/释放、SRAM、即时存档/恢复、金手指持久化、离线资源与退出。');
  }
} finally {
  socket?.close(); chrome.kill('SIGTERM'); server.close();
}
