/* global EmulatorJS, EJS_GameManager, GamepadHandler */
(() => {
  'use strict';
  let configuration;
  let emulator;
  let stopped = false;
  let running = false;
  let saveTimer;
  let requestTail = Promise.resolve();
  let saveTail = Promise.resolve();
  const workers = new Set();
  const blobUrls = new Set();
  const pressed = new Set();
  const coreErrors = [];
  const coreDiagnostics = [];
  const NativeWorker = window.Worker;
  const createObjectURL = URL.createObjectURL.bind(URL);

  /** 所有跨平台消息统一 JSON，错误不会作为未捕获 Promise 留在浏览器线程。 */
  function notify(type, details = {}) {
    window.BbkEmulatorChannel?.postMessage(JSON.stringify({ type, ...details }));
  }
  function manager() {
    if (!running || stopped || !emulator?.gameManager) throw Error('游戏尚未就绪');
    return emulator.gameManager;
  }

  /** 跟踪解压 worker 与 WASM Blob URL，页面退出时主动释放。 */
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args);
      workers.add(this);
      // 解压 worker 的 t=1 是完成消息，立即释放其 ROM/core 临时堆。
      this.addEventListener('message', event => { if (event.data?.t === 1) this.terminate(); });
    }
    terminate() { workers.delete(this); return super.terminate(); }
  };
  URL.createObjectURL = blob => { const url = createObjectURL(blob); blobUrls.add(url); return url; };

  /** 不检查远程更新，固定内核只从 APK 本地资源获取；不使用浏览器重复手柄轮询。 */
  EmulatorJS.prototype.checkForUpdates = function () {};
  GamepadHandler.prototype.loop = function () {};
  const originalCallEvent = EmulatorJS.prototype.callEvent;
  EmulatorJS.prototype.callEvent = function (type, ...args) {
    // 上游 exit 会卸载 IDBFS；宿主使用内存 FS，应走自己的关闭流程。
    if (type === 'exit') { window.bbkEmulatorShutdown?.(); return; }
    return originalCallEvent.call(this, type, ...args);
  };
  const originalBaseName = EmulatorJS.prototype.getBaseFileName;
  EmulatorJS.prototype.getBaseFileName = function (force) {
    const name = originalBaseName.call(this, force);
    return force && typeof name === 'string' ? decodeURIComponent(name) : name;
  };
  const originalDownload = EmulatorJS.prototype.downloadFile;
  EmulatorJS.prototype.downloadFile = function (path, ...args) {
    if (typeof path === 'string') {
      const url = new URL(path, location.href);
      if (url.origin !== location.origin) return Promise.resolve(-1);
    }
    return originalDownload.call(this, path, ...args);
  };
  const originalStartError = EmulatorJS.prototype.startGameError;
  EmulatorJS.prototype.startGameError = function (message) {
    notify('error', { message: `${message}\n请检查 ROM set、文件名与 BIOS 是否匹配。` });
    return originalStartError.call(this, message);
  };
  const originalDownloadFiles = EmulatorJS.prototype.downloadFiles;
  EmulatorJS.prototype.downloadFiles = function () {
    const originalMain = this.Module.callMain.bind(this.Module);
    this.Module.callMain = (...args) => {
      // 固定 RetroArch 前端开启日志回调，以便 FBNeo 错误屏也能反馈给 Flutter。
      if (Array.isArray(args[0]) && !args[0].includes('-v')) args[0] = ['-v', ...args[0]];
      const exitCode = originalMain(...args);
      this.bbkCoreExitCode = exitCode;
      if (typeof exitCode === 'number' && exitCode !== 0) throw Error('内核拒绝加载 ROM');
      return exitCode;
    };
    return originalDownloadFiles.call(this);
  };
  const originalInitModule = EmulatorJS.prototype.initModule;
  EmulatorJS.prototype.initModule = function (...args) {
    const runtime = window.EJS_Runtime;
    window.EJS_Runtime = options => {
      for (const name of ['print', 'printErr']) {
        const original = options[name];
        options[name] = message => {
          if (coreDiagnostics.length >= 100) coreDiagnostics.shift();
          coreDiagnostics.push(String(message).slice(0, 1000));
          // FBNeo 会以正常主循环绘制错误屏，exitCode 仍为 0，必须检查内核错误日志。
          if (/\[[^\]]*FATAL\]|\[[^\]]*ERROR\].*FBNeo|romset is unknown|romset.*not working/i.test(String(message))) {
            if (coreErrors.length < 12) coreErrors.push(String(message).slice(0, 1000));
          }
          original?.(message);
        };
      }
      return runtime(options);
    };
    return originalInitModule.call(this, ...args);
  };
  const originalRetroArchConfig = EJS_GameManager.prototype.getRetroArchCfg;
  EJS_GameManager.prototype.getRetroArchCfg = function () {
    // 将固定目录写明，避免前端按内核名称自动追加一层，使 SRAM 启动恢复落在错误位置。
    return originalRetroArchConfig.call(this) + '\nsystem_directory = "/"\n' +
      'sort_savefiles_enable = false\nsort_savefiles_by_content_enable = false\n' +
      'sort_savestates_enable = false\nhistory_list_enable = false\n';
  };
  const originalWriteFile = EJS_GameManager.prototype.writeFile;
  EJS_GameManager.prototype.writeFile = function (name, data) {
    // 固定前端的外置资源下载返回 ArrayBuffer；Emscripten FS 需要 ArrayBufferView。
    // 直接传 ArrayBuffer 会生成 0 字节 BIOS/父档，转换视图不复制原始缓冲区。
    return originalWriteFile.call(this, name, data instanceof ArrayBuffer ? new Uint8Array(data) : data);
  };

  /** 直接使用内存 FS，外置存档为唯一恢复来源，避免 IDBFS 中同名 ROM 串档。 */
  EJS_GameManager.prototype.mountFileSystems = async function () {
    this.mkdir('/data');
    this.mkdir('/data/saves');
    if (configuration.core === 'fceumm') {
      const saved = await readSave('sram');
      if (saved) this.writeFile(`/data/saves/${configuration.sramName}`, saved);
    }
  };

  async function readSave(name) {
    const response = await fetch(`${configuration.prefix}save/${name}`);
    if (response.status === 404) return null;
    if (!response.ok) throw Error('读取存档失败');
    return new Uint8Array(await response.arrayBuffer());
  }
  async function writeSave(name, bytes) {
    const response = await fetch(`${configuration.prefix}save/${name}`, {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes,
    });
    if (!response.ok) throw Error('写入存档失败，请检查 BBK 文件夹权限与存储空间');
  }

  /** SRAM 写入与即时存档按序执行，后台保存和用户按钮不能互相覆盖。 */
  function saveSnapshot(includeState) {
    const task = saveTail.then(async () => {
      const gm = manager();
      const sram = gm.getSaveFile();
      if (sram?.length) await writeSave('sram', sram);
      if (includeState && gm.supportsStates()) await writeSave('auto', gm.getState());
    });
    saveTail = task.catch(() => {});
    return task;
  }

  /** 金手指文件可按 ROM hash、原文件名或标题索引；每项只接收描述与代码。 */
  async function loadCheats() {
    const saved = await readSave('cheats');
    if (saved) {
      try { return sanitizeCheats(JSON.parse(new TextDecoder().decode(saved))); } catch (_) { /* 损坏列表不阻止加载 ROM。 */ }
    }
    const response = await fetch(`${configuration.prefix}cheat-definitions`);
    if (response.status === 404) return [];
    if (!response.ok) throw Error('无法读取金手指配置');
    const definitions = await response.json();
    return sanitizeCheats(definitions[configuration.hash] ?? definitions[decodeURIComponent(configuration.romUrl.split('/').pop())]
      ?? definitions[configuration.title] ?? []);
  }
  function sanitizeCheats(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 128).filter(item => item && typeof item.desc === 'string' &&
      typeof item.code === 'string' && item.code.length <= 200 && /^[\x20-\x7e]+$/.test(item.code))
      .map(item => ({ desc: item.desc.slice(0, 80), code: item.code,
        checked: configuration.family === 'nes' && item.checked === true }));
  }
  async function persistCheats() {
    await writeSave('cheats', new TextEncoder().encode(JSON.stringify(emulator.cheats)));
  }
  /** 先清除再只提交启用项，兼容忽略 enabled=false 的旧核心，避免“关闭”代码仍生效。 */
  function applyCheats() {
    const gm = manager();
    gm.resetCheat();
    for (let index = 0; index < emulator.cheats.length; index++) {
      const cheat = emulator.cheats[index];
      if (cheat.checked === true) gm.setCheat(index, true, cheat.code);
    }
  }

  /** 数字编号白名单与边沿去重。暂停/退后台/退出均释放真实按键。 */
  window.bbkEmulatorInput = (button, value) => {
    if (!running || stopped || emulator.paused || !Number.isInteger(button) || button < 0 || button > 11) return;
    const down = value === 1;
    if (down === pressed.has(button)) return;
    if (down) pressed.add(button); else pressed.delete(button);
    emulator.gameManager.simulateInput(0, button, down ? 1 : 0);
  };
  function releaseInputs() {
    if (emulator?.gameManager) for (const button of pressed) emulator.gameManager.simulateInput(0, button, 0);
    pressed.clear();
  }

  /** Flutter 调用固定动作，异步操作完成后通过请求 ID 回传；禁止任意脚本或文件路径。 */
  async function perform(action, parameters) {
    const gm = manager();
    switch (action) {
      case 'pause':
        releaseInputs();
        if (parameters.paused === true) emulator.pause(); else emulator.play();
        return { message: parameters.paused ? '已暂停' : '继续游戏' };
      case 'snapshot':
        releaseInputs();
        await saveSnapshot(true);
        return { message: '进度已保存' };
      case 'saveState':
        if (!gm.supportsStates()) throw Error('当前内核不支持即时存档');
        await saveTail;
        await writeSave('state', gm.getState());
        await saveSnapshot(false);
        return { message: '即时存档已保存' };
      case 'loadState': {
        releaseInputs();
        await saveTail;
        const data = await readSave('state');
        if (!data) throw Error('尚无手动即时存档');
        gm.loadState(data);
        return { message: '已读取即时存档' };
      }
      case 'getCheats': return { value: emulator.cheats };
      case 'addCheat': {
        const { desc, code } = parameters;
        if (typeof desc !== 'string' || !desc.trim() || desc.length > 80 || typeof code !== 'string' ||
            !code.trim() || code.length > 200 || !/^[\x20-\x7e]+$/.test(code) || emulator.cheats.length >= 128) {
          throw Error('请填写有效名称和 ASCII 代码（最多 200 字符、128 条）');
        }
        emulator.cheats.push({ desc, code, checked: false });
        applyCheats();
        await persistCheats();
        return { message: '已添加金手指，默认关闭' };
      }
      case 'toggleCheat':
      case 'removeCheat': {
        const { index } = parameters;
        if (!Number.isInteger(index) || index < 0 || index >= emulator.cheats.length) throw Error('金手指已变化，请重新打开面板');
        if (action === 'removeCheat') emulator.cheats.splice(index, 1);
        else emulator.cheats[index].checked = parameters.enabled === true;
        applyCheats();
        await persistCheats();
        return { message: '金手指已更新' };
      }
      default: throw Error('不支持的模拟器操作');
    }
  }
  window.bbkEmulatorRequest = (id, action, parameters) => {
    if (!Number.isInteger(id) || typeof action !== 'string' || !parameters || typeof parameters !== 'object') return;
    const task = requestTail.then(() => perform(action, parameters));
    requestTail = task.then(value => notify('reply', { id, ok: true, ...value }),
      failure => notify('reply', { id, ok: false, message: failure.message || String(failure) }));
  };

  /** 宿主先等待 snapshot 完成再调用；释放音频、worker、计时器及 WASM 主循环。 */
  window.bbkEmulatorShutdown = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(saveTimer);
    releaseInputs();
    emulator?.pause?.();
    emulator?.Module?.pauseMainLoop?.();
    emulator?.gamepad?.terminate?.();
    const contexts = emulator?.Module?.AL?.contexts || [];
    for (const context of Object.values(contexts)) context.audioCtx?.close?.().catch(() => {});
    emulator?.Module?.AL?.currentCtx?.audioCtx?.close?.().catch(() => {});
    for (const worker of workers) worker.terminate();
    workers.clear();
    for (const url of blobUrls) URL.revokeObjectURL(url);
    blobUrls.clear();
    running = false;
  };
  window.addEventListener('pagehide', window.bbkEmulatorShutdown);

  /** 启动配置来自仅当前会话有效的本地路由；不从 BBK 加载可执行 JS 或 WASM。 */
  async function boot() {
    const token = new URLSearchParams(location.search).get('session');
    if (!/^[a-f0-9]{48}$/.test(token || '')) throw Error('模拟器会话无效');
    const response = await fetch(`/__emulator__/${token}/config`);
    if (!response.ok) throw Error('ROM 会话已失效，请重新进入');
    configuration = await response.json();
    if (!['fceumm', 'fbneo'].includes(configuration.core)) throw Error('模拟器内核不支持');
    if (configuration.core === 'fbneo') {
      const index = await (await fetch('fbneo-romsets.json')).json();
      const name = decodeURIComponent(configuration.romUrl.split('/').pop()).replace(/\.(zip|7z)$/i, '');
      if (!Object.hasOwn(index.games, name)) throw Error('无法识别街机 ROM set 名称，请保留原始文件名（例如 mslug.zip）');
    }
    let cheats = [];
    try { cheats = await loadCheats(); } catch (_) { /* 非必需金手指配置不能阻断游戏。 */ }
    const externalFiles = {};
    if (configuration.bios['neogeo.zip'] && configuration.core === 'fbneo') {
      externalFiles['/neogeo.zip'] = configuration.bios['neogeo.zip'];
    }
    if (configuration.core === 'fbneo') {
      for (const [name, url] of Object.entries(configuration.bios)) {
        if (/\.(zip|7z)$/i.test(name) && name !== 'neogeo.zip') externalFiles[`/${name}`] = url;
      }
    }
    // FDS BIOS 按原始文件名进入内核 system 目录，无需将 ROM/BIOS 复制到 APK。
    if (configuration.bios['disksys.rom']) externalFiles['/disksys.rom'] = configuration.bios['disksys.rom'];
    const languageResponse = await fetch('data/localization/zh-CN.json');
    const language = await languageResponse.json();
    emulator = new EmulatorJS('#game', {
      gameUrl: configuration.romUrl, dataPath: 'data/', system: configuration.core,
      gameName: `${configuration.title}-${configuration.hash}`, gameId: parseInt(configuration.hash.slice(0, 7), 16),
      language: 'zh-CN', langJson: language, startOnLoad: true, backgroundColor: '#000',
      threads: false, disableDatabases: true, disableLocalStorage: true, cacheLimit: 0,
      externalFiles, volume: .6,
      buttonOpts: { fullscreen: false, screenRecord: false, cheat: false, netplay: false, exitEmulation: false },
      defaultOptions: { 'virtual-gamepad': 'disabled', 'ejs_threads': 'disabled',
        'retroarch_core': configuration.core, 'shader': 'disabled' },
      hideSettings: ['ejs_threads', 'retroarch_core'],
    });
    window.EJS_emulator = emulator;
    emulator.bbkDiagnostics = coreDiagnostics;
    emulator.on('start', async () => {
      try {
        if (stopped) return;
        if (coreErrors.length) {
          emulator.pause();
          notify('error', { message: '内核未能加载当前 ROM：\n' + coreErrors.join('\n') + '\n请检查 ROM set 和 BIOS。' });
          return;
        }
        running = true;
        emulator.cheats = cheats;
        applyCheats();
        const autosave = await readSave('auto');
        if (autosave && emulator.gameManager.supportsStates()) emulator.gameManager.loadState(autosave);
        notify('ready');
        // SRAM 周期备份低频执行；即时存档只在后台/退出/用户请求时生成。
        saveTimer = setInterval(() => {
          if (running && !stopped) saveSnapshot(false).catch(failure => notify('error', { message: failure.message }));
        }, 15000);
      } catch (failure) { notify('error', { message: `恢复游戏进度失败：${failure.message}` }); }
    });
  }
  window.addEventListener('error', event => notify('error', { message: event.message || '模拟器脚本异常' }));
  window.addEventListener('unhandledrejection', event => notify('error', { message: event.reason?.message || '模拟器加载失败' }));
  boot().catch(failure => notify('error', { message: failure.message || String(failure) }));
})();
