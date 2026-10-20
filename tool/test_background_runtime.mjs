import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

/** 运行真实适配脚本；模拟浏览器后台停钟，原生调度独立推进，保留前后台切换边界。 */
const source = readFileSync(new URL('../assets/games/background-runtime.js', import.meta.url), 'utf8');
function harness({native = true, initiallyBackground = false} = {}) {
  let time = 0, next = 1, deadline = Infinity;
  const queue = new Map(), errors = [], nativeRequests = [];
  const window = {
    performance: {now: () => time},
    setTimeout(callback, delay) {
      const id = next++;
      queue.set(id, {callback, due: time + Math.max(1, Number(delay) || 0)});
      return id;
    },
    clearTimeout(id) {queue.delete(id)},
  };
  window.setInterval = window.setTimeout;
  window.clearInterval = window.clearTimeout;
  const original = window.setTimeout;
  if (native) window.BbkBackgroundClock = {
    isBackground: () => initiallyBackground,
    schedule(delay) {nativeRequests.push(delay);deadline = delay < 0 ? Infinity : time + delay},
  };
  const context = vm.createContext({window});
  vm.runInContext(source, context);
  function advance(milliseconds, browserSuspended = false) {
    const end = time + milliseconds;
    let guard = 0;
    while (time < end) {
      assert.ok(++guard < 100000, '计时器形成同步忙循环');
      const item = browserSuspended ? null : [...queue].sort((a,b) => a[1].due-b[1].due)[0];
      const due = Math.min(item?.[1].due ?? Infinity, deadline);
      if (due > end) {time = end;break}
      time = Math.max(time, due);
      if (deadline <= time) {
        deadline = Infinity;
        window.BbkBackgroundRuntime.tick();
      } else if (item) {
        queue.delete(item[0]);
        try {item[1].callback()} catch(error) {errors.push(error)}
      }
    }
  }
  return {window, original, advance, errors, nativeRequests, queue, context};
}

{
  const h = harness({native:false});
  assert.equal(h.window.setTimeout, h.original, '非Android宿主完全保留浏览器计时器');
  assert.equal(h.window.BbkBackgroundRuntime, undefined);
}
{
  const h = harness(), w = h.window;
  // 真实LCD定时器以handle >= 0判断是否可以清理，必须兼容这个C/JS边界。
  let handle=-1, count=0;
  function open(){if(handle>=0)w.clearInterval(handle);handle=w.setInterval(()=>count++,10)}
  open();assert.ok(handle>0 && handle<=2147483647);
  h.advance(20);assert.equal(count,2);
  open();h.advance(20);assert.equal(count,4,'重复打开LCD刷新定时器不能残留旧任务');
  if(handle>=0)w.clearInterval(String(handle));
  h.advance(20);assert.equal(count,4);
}
{
  const h = harness(), w = h.window;
  let count = 0;
  const timer = w.setInterval(() => count++, 100);
  h.advance(4000);
  assert.equal(count,40);
  w.BbkBackgroundRuntime.setBackground(true);
  h.advance(6000,true);
  assert.equal(count,100, '浏览器后台停钟时，原生仍按原100ms间隔推进');
  w.BbkBackgroundRuntime.setBackground(false);
  // 真正的原生宿主也会取消自己的pending tick；迟到的tick必须无副作用。
  w.BbkBackgroundRuntime.tick();
  h.advance(1000);
  assert.equal(count,110, '返回前台不得同时收到两份重复回调');
  w.clearTimeout(timer);
  h.advance(1000);
  assert.equal(count,110, 'clearTimeout也能清除interval');
}
{
  const h = harness(), w = h.window, calls=[];
  w.setTimeout((...args) => calls.push(args),100,'参数',2);
  h.advance(40);
  w.BbkBackgroundRuntime.setBackground(true);
  h.advance(59,true);assert.equal(calls.length,0);
  h.advance(1,true);assert.deepEqual(calls,[['参数',2]]);
  h.advance(1000,true);assert.equal(calls.length,1);
  assert.equal(h.nativeRequests.at(-1),-1,'最后一个任务结束后不持续唤醒');
}
{
  const h = harness({initiallyBackground:true}), w = h.window;
  let count = 0;
  const timer = w.setInterval(() => {count++;w.clearInterval(timer)},4);
  w.setTimeout(() => {throw Error('单个回调异常')},4);
  w.setTimeout(() => count+=10,4);
  h.advance(100,true);
  assert.equal(count,11,'interval自取消和异常均不能破坏其他计时器');
  w.BbkBackgroundRuntime.setBackground(false);
  h.advance(10);
  assert.equal(h.errors.length,1);
}
{
  const h = harness({initiallyBackground:true}), w = h.window, calls=[];
  w.setTimeout(() => {calls.push(1);w.setTimeout(() => calls.push(2),0)},0);
  h.advance(4,true);assert.deepEqual(calls,[1]);
  h.advance(4,true);assert.deepEqual(calls,[1,2],'嵌套WASM异步任务必须等下一次原生唤醒');
  let count=0;
  w.setInterval(()=>count++,0);
  h.advance(100,true);
  assert.ok(count<=25,'零间隔不能导致忙循环');
}
{
  const h = harness(), w=h.window;
  let count=0;
  const nativeTimer=h.original(()=>count++,30);
  w.clearInterval(nativeTimer);
  w.setTimeout(()=>count++,100);
  for(let i=0;i<10;i++){
    w.BbkBackgroundRuntime.setBackground(true);
    w.BbkBackgroundRuntime.setBackground(true);
    h.advance(4,true);
    w.BbkBackgroundRuntime.setBackground(false);
    w.BbkBackgroundRuntime.setBackground(false);
    h.advance(4);
  }
  h.advance(30);
  assert.equal(count,1,'多次切换保留一次性任务，旧浏览器ID清理也必须兼容');
}
console.log('Android后台时钟回归通过：后台继续推进、前后台切换、取消、异常与异步边界');
