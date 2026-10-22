import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import vm from 'node:vm';

/**
 * 执行已应用补丁的真实 EM_JS 信号量，验证高倍速下的输入吞吐和 Asyncify 恢复边界。
 *
 * 虚拟调度器只替代浏览器任务队列，并给 timer 设置 8ms 恢复成本；不复制信号量算法。
 * 真实战斗中旧实现会在该条件下塞满 100 条消息池、丢失按键，而 4×仍能持续推进。
 */
const directory = resolve(process.argv[2] || 'build/sgby-engine');
const source = readFileSync(join(directory, 'src/platform/js/sem.c'), 'utf8');
const functions = [...source.matchAll(
  /EM_JS\([^,]+,\s*(gam_sem_\w+),\s*\(([^)]*)\),\s*\{([\s\S]*?)\n\}\);/g,
)].map(([, name, args, body]) =>
  `function ${name}(${args.trim().split(/\s+/).at(-1) || ''}) {${body}\n}`,
).join('\n');
assert.ok(functions.includes('function gam_sem_wait('), '未读取到真实消息信号量');

/**
 * 创建可控的浏览器事件循环，并检查等待中的 WASM 只能在原生调用栈退出后恢复。
 *
 * @param {boolean} messageChannel 是否提供 MessageChannel，覆盖旧运行时的 timer 回退。
 * @return {object} 信号量、时钟及任务调度的测试接口。
 */
function harness(messageChannel = true) {
  let now = 0;
  let sequence = 0;
  let channels = 0;
  let inNativeCall = false;
  let suspended = false;
  let resume = () => {};
  const tasks = [];
  const schedule = (callback, milliseconds, timer = false) => {
    tasks.push({at: now + Math.max(timer ? 8 : 0.1, milliseconds),
      sequence: sequence++, callback});
  };
  const context = {
    Module: {},
    performance: {now: () => now},
    setTimeout: (callback, milliseconds) => schedule(callback, milliseconds, true),
    Asyncify: {
      handleSleep(start) {
        let synchronous = true;
        let completed = false;
        start(() => {
          if (synchronous) completed = true;
          else {
            assert.equal(inNativeCall, false, '不能在 WASM 调用栈中重入 Asyncify');
            suspended = false;
            resume();
          }
        });
        synchronous = false;
        suspended = !completed;
      },
    },
  };
  if (messageChannel) context.MessageChannel = class {
    constructor() {
      channels++;
      this.port1 = {};
      this.port2 = {postMessage: () => schedule(() => this.port1.onmessage?.(), 0)};
    }
  };
  vm.createContext(context);
  vm.runInContext(functions, context);
  const semid = context.gam_sem_create();
  return {
    context, semid,
    get now() { return now; },
    get channels() { return channels; },
    get suspended() { return suspended; },
    set resume(callback) { resume = callback; },
    schedule,
    spend(milliseconds) { now += milliseconds; },
    signal() {
      inNativeCall = true;
      try { context.gam_sem_signal(semid); } finally { inNativeCall = false; }
    },
    wait() {
      inNativeCall = true;
      try { context.gam_sem_wait(semid); } finally { inNativeCall = false; }
    },
    runUntil(until) {
      let iterations = 0;
      for (;;) {
        tasks.sort((left, right) => left.at - right.at || left.sequence - right.sequence);
        if (!tasks.length || tasks[0].at > until) break;
        const task = tasks.shift();
        now = Math.max(now, task.at);
        task.callback();
        assert.ok(++iterations < 100000, '消息消费未让出事件循环');
      }
      now = Math.max(now, until);
    },
  };
}

// 已积压的消息必须直接消费，避免每条都重新分配、展开和恢复 Asyncify 栈。
{
  const h = harness();
  h.wait();
  assert.equal(h.suspended, true);
  h.signal();
  assert.equal(h.suspended, true, '发消息时仍在原生栈内，必须延后恢复');
  h.runUntil(1);
  h.signal(); h.signal(); h.signal();
  for (let index = 0; index < 3; index++) {
    h.wait();
    assert.equal(h.suspended, false, '已经入队的消息不应逐条等待 setTimeout');
  }
  assert.equal(h.context.Module.sems[h.semid].cnt, 0);
  assert.equal(h.channels, 1, '恢复任务应复用同一个 MessageChannel');
}

// 大量积压仍须主动让步，避免连续读队列阻塞绘制、手柄和退出事件。
{
  const h = harness();
  for (let index = 0; index < 100; index++) h.signal();
  h.wait();
  h.runUntil(1);
  let synchronousReads = 0;
  while (!h.suspended && synchronousReads < 100) {
    h.wait();
    if (!h.suspended) synchronousReads++;
  }
  assert.ok(synchronousReads > 0 && synchronousReads <= 8, '批量消费必须有数量上限');
  assert.equal(h.suspended, true);
}

/**
 * 按原版的两个逻辑定时器和自动按键间隔回放消息流，记录输入丢失和最大响应延迟。
 *
 * @param {number} speed 游戏倍率。
 * @param {boolean} messageChannel 是否启用浏览器消息任务。
 * @return {object} 消费结果；池容量沿用 gui.c 的 100 条。
 */
function replay(speed, messageChannel = true) {
  const h = harness(messageChannel);
  const queue = [];
  let maximum = 0;
  let lostKeys = 0;
  let consumedKeys = 0;
  let maximumKeyDelay = 0;
  const consume = () => {
    const message = queue.shift();
    assert.ok(message, '唤醒次数必须与队列消息一致');
    if (message.key) {
      consumedKeys++;
      maximumKeyDelay = Math.max(maximumKeyDelay, h.now - message.at);
    }
    h.spend(0.05);
  };
  const read = () => {
    for (;;) {
      h.wait();
      if (h.suspended) return;
      consume();
    }
  };
  h.resume = () => { consume(); read(); };
  const produce = (interval, key = false) => {
    const tick = () => {
      if (queue.length < 100) {
        queue.push({key, at: h.now});
        maximum = Math.max(maximum, queue.length);
        h.signal();
      } else if (key) lostKeys++;
      h.schedule(tick, interval, true);
    };
    h.schedule(tick, interval, true);
  };
  produce(50 / speed); // 光标/触摸 timer0。
  produce(500 / speed); // 地图闪烁 timer1。
  produce(Math.max(55, Math.round(220 / speed)), true);
  read();
  h.runUntil(10000);
  assert.equal(lostKeys, 0, `${speed}×不应丢失自动按键`);
  assert.ok(maximum < 32, `${speed}×消息积压过多：${maximum}`);
  assert.ok(maximumKeyDelay < 200, `${speed}×输入响应过慢：${maximumKeyDelay}ms`);
  assert.ok(consumedKeys > 40, '自动战斗必须持续接收输入');
  assert.equal(h.context.Module.sems[h.semid].cnt,
    queue.length - (h.suspended && queue.length ? 1 : 0), '信号量计数不能丢失消息');
  return {speed, messageChannel, maximum, lostKeys,
    maximumKeyDelay: Math.round(maximumKeyDelay), consumedKeys};
}

const results = [];
for (const speed of [1, 2, 3, 4, 6, 8]) results.push(replay(speed));
results.push(replay(8, false));
console.log('PASS 三国霸业真实消息信号量：' + JSON.stringify(results));
