import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

/** 运行真实LCD输出脚本，模拟60/120Hz与高倍速下同一显示帧内的多次更新。 */
const source = readFileSync(new URL('../assets/games/sgby/js/lcd.js', import.meta.url), 'utf8');
function harness({ios=true, ipadDesktop=false, raf=true}={}) {
  let now=0,id=0,allocations=0,contexts=0;
  const queued=new Map(),events=new Map(),writes=[];
  const memory=new WebAssembly.Memory({initial:64,maximum:128});
  const drawing={putImageData(image){writes.push({time:now,first:image.data[0],width:image.width,height:image.height})}};
  const canvas={width:640,height:384,getContext(){contexts++;return drawing}};
  const context={
    console, Storage:function(){}, Uint8ClampedArray, localStorage:{},
    navigator:{userAgent:ios?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)':'Android',platform:ipadDesktop?'MacIntel':'iPhone',maxTouchPoints:ipadDesktop?5:0},
    document:{hidden:false,getElementById:()=>canvas,addEventListener(name,cb){events.set(name,cb)}},
    addEventListener(name,cb){events.set(name,cb)},
    performance:{now:()=>now}, wasmMemory:memory,
    ImageData:class {constructor(data,width,height){allocations++;this.data=data;this.width=width;this.height=height}},
    _bayeSetLcdSize(){},
  };
  if(ipadDesktop)context.navigator.userAgent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)';
  if(raf){context.requestAnimationFrame=cb=>{const handle=++id;queued.set(handle,cb);return handle};context.cancelAnimationFrame=handle=>queued.delete(handle)}
  context.window=context;
  vm.createContext(context);vm.runInContext(source,context);
  function frame(time){now=time;const callbacks=[...queued.values()];queued.clear();callbacks.forEach(cb=>cb(now))}
  function submit(value,pointer=0){new Uint8Array(memory.buffer)[pointer]=value;context.bayeFlushLcdBuffer(pointer)}
  return {context,canvas,memory,writes,queued,events,frame,submit,get allocations(){return allocations},get contexts(){return contexts}};
}

{
  const h=harness();
  for(let value=1;value<=8;value++)h.submit(value);
  console.log('同一显示帧8次更新，提前提交Canvas次数:',h.writes.length);
  assert.equal(h.writes.length,0,'iOS不应在显示帧到来前连续上传8份整屏像素');
  assert.equal(h.queued.size,1,'只能排队一个显示回调');
  h.frame(0);
  assert.equal(h.writes.length,1);
  assert.equal(h.writes[0].first,8,'应呈现最新游戏状态');
  assert.equal(h.queued.size,0,'无新画面时不能持续唤醒');
}
for(const refresh of [60,120])for(const speed of [1,4,6,8]){
  const h=harness();
  for(let index=0;index<=refresh;index++){
    for(let i=0;i<speed;i++)h.submit(index);
    h.frame(index*1000/refresh);
  }
  assert.ok(h.writes.length>=59&&h.writes.length<=61,`${refresh}Hz/${speed}x下应稳定限制在60次/秒，而非${h.writes.length}`);
  assert.equal(h.allocations,1,'不变的内存、地址和尺寸应复用ImageData');
  assert.ok(h.contexts<=2,'不能每次提交都重新取Canvas context');
}
{
  const h=harness();h.submit(1);h.frame(0);
  // 旧地图已排队后切到战果弹窗，不能把旧页面的像素回放到新页面。
  h.submit(2);h.submit(3,1024*1024);h.frame(1000/60);
  assert.equal(h.writes.at(-1).first,3);
  h.memory.grow(1);h.submit(4);h.frame(2000/60);
  assert.equal(h.writes.at(-1).first,4,'WASM内存增长后必须重建已失效的视图');
  assert.equal(h.allocations,3);
  h.submit(5);h.context.lcdSetDotSize(2);h.frame(50);
  assert.equal(h.writes.length,3,'尺寸变化必须使旧尺寸排队帧失效');
  h.submit(6);h.frame(200/3);
  assert.equal(h.writes.at(-1).width,320);
  assert.equal(h.writes.at(-1).height,192);
}
{
  const h=harness();h.context.document.hidden=true;h.submit(9);
  assert.equal(h.queued.size,0,'隐藏时不反复申请显示帧');
  h.context.document.hidden=false;h.events.get('visibilitychange')?.();h.frame(0);
  assert.equal(h.writes.at(-1).first,9,'返回前台不能丢掉最后一张画面');
}
{
  const h=harness({ipadDesktop:true});h.submit(7);assert.equal(h.writes.length,0);h.frame(0);assert.equal(h.writes.length,1);
}
for(const options of [{ios:false},{ios:true,raf:false}]){
  const h=harness(options);h.submit(1);h.submit(2);
  assert.equal(h.writes.length,2,'其他平台和缺少RAF的环境沿用同步显示');
}
console.log('三国霸业iOS显示节奏回归通过：60/120Hz、1/4/6/8x、内存增长、页面切换及尺寸变化');
