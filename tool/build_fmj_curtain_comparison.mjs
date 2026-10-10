import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createFmjBrowser } from './fmj_browser_session.mjs';
import { createOriginalFmjBrowser, originalCurtainReplay, originalFmjCommit } from './fmj_original_reference.mjs';

/** 导出实际剧情显示帧，供玩家逐帧对照初版和扩展后的同一动画。 */
const original = await createOriginalFmjBrowser(), current = await createFmjBrowser();
try {
  const reference = await original.evaluate(originalCurtainReplay);
  await current.evaluate('FmjWideView.setEnabled(true); bbkSetHighDefinition(true);');
  const wide = await current.evaluate(originalCurtainReplay);
  assert.equal(wide.frames.length, reference.frames.length);
  const frames = reference.frames.map((frame, index) => ({
    original: frame.image, wide: wide.frames[index].image,
    sequenceEqual: JSON.stringify(frame.keys) === JSON.stringify(wide.frames[index].keys),
  }));
  assert.ok(frames.every(frame => frame.sequenceEqual));
  const output = '/Users/xiongjian/Downloads/伏魔记-初版幕布与2X逐帧对照.html';
  fs.writeFileSync(output, `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>伏魔记 · 初版幕布与 2× 对照</title>
<style>
:root{color-scheme:dark;font:16px/1.6 system-ui,sans-serif;background:#11151b;color:#e7ecf1}*{box-sizing:border-box}body{max-width:1100px;margin:auto;padding:28px}h1{font-size:26px;font-weight:600;margin:0 0 12px}p{color:#aeb8c4;margin:8px 0 20px}.panels{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0;background:#1a2029;border:1px solid #323b48;border-radius:12px;padding:16px}figcaption{margin-bottom:12px;font-size:18px}img{display:block;width:100%;aspect-ratio:5/3;image-rendering:pixelated;object-fit:contain;background:#000}.controls{display:flex;flex-wrap:wrap;gap:16px;align-items:center;margin-top:24px;padding:18px;background:#1a2029;border-radius:12px}button{font:inherit;border:1px solid #647b93;background:#263b50;color:#eaf3ff;border-radius:8px;padding:8px 16px;cursor:pointer}input{flex:1;min-width:170px;accent-color:#79b3ff}output{min-width:120px;font-variant-numeric:tabular-nums}.note{font-size:14px;margin-top:18px}@media(max-width:700px){body{padding:16px}.panels{grid-template-columns:1fr}}
</style></head><body>
<h1>伏魔记 · 初版幕布与 2× 对照</h1>
<p>同一段剧情：从忘忧坟场切换到蛇妖袭村。两侧同步播放，可暂停并拖动到任意一帧。</p>
<div class="panels"><figure><figcaption>首次提交 1× · ${originalFmjCommit}</figcaption><img id="original" alt="首次提交的原始转场帧"></figure><figure><figcaption>修订版 2× · 原动画扩展</figcaption><img id="wide" alt="2× 视野的同一转场帧"></figure></div>
<div class="controls"><button id="play">播放</button><button id="restart">回到首帧</button><input id="position" type="range" min="0" max="${frames.length - 1}" value="0" aria-label="转场帧"><output id="counter"></output></div>
<p class="note">左侧来自首次提交的完整游戏页面，右侧来自当前游戏页面。每帧间隔 40 毫秒；画面中的点阵和颜色直接取自游戏输出。</p>
<script>
const frames=${JSON.stringify(frames)};let index=0,timer=null;const position=document.getElementById('position'),play=document.getElementById('play');
function draw(){document.getElementById('original').src=frames[index].original;document.getElementById('wide').src=frames[index].wide;position.value=index;document.getElementById('counter').textContent='帧 '+(index+1)+' / '+frames.length}
function stop(){clearInterval(timer);timer=null;play.textContent='播放'}
play.addEventListener('click',()=>{if(timer){stop();return}if(index===frames.length-1)index=0;play.textContent='暂停';draw();timer=setInterval(()=>{if(index<frames.length-1){index++;draw()}else stop()},40)});
position.addEventListener('input',()=>{stop();index=Number(position.value);draw()});document.getElementById('restart').addEventListener('click',()=>{stop();index=0;draw()});window.addEventListener('pagehide',stop);draw();
</script></body></html>`);
  console.log(output);
} finally {
  original.close(); current.close();
}
