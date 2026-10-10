import assert from 'node:assert/strict';
import { createFmjBrowser } from './fmj_browser_session.mjs';
import { createOriginalFmjBrowser, originalCurtainReplay, originalFmjCommit } from './fmj_original_reference.mjs';

/** 用首次提交的完整页面作基准，核查最终显示帧，而非人为假设的遮罩形状。 */
const original = await createOriginalFmjBrowser();
const current = await createFmjBrowser();
try {
  const reference = await original.evaluate(originalCurtainReplay);
  assert.ok(reference.frames.length > 10, '必须完整回放首次提交的剧情转场');
  await current.evaluate('FmjWideView.setEnabled(false); bbkSetHighDefinition(true);');
  const restored = await current.evaluate(originalCurtainReplay);
  assert.equal(restored.frames.length, reference.frames.length);
  reference.frames.forEach((frame, i) => {
    assert.equal(restored.frames[i].rawHash, frame.rawHash, '还原的 1× 逻辑帧必须与首次提交一致');
    assert.equal(restored.frames[i].displayHash, frame.displayHash, '还原的 1× 最终显示必须保留首次提交的点阵、材质和颜色');
    assert.deepEqual(restored.frames[i].keys, frame.keys, '原上下幕布帧序不得改变');
  });
  await current.evaluate('FmjWideView.setEnabled(true); bbkSetHighDefinition(true);');
  const wide = await current.evaluate(originalCurtainReplay);
  assert.equal(wide.width, 320); assert.equal(wide.height, 192);
  assert.equal(wide.frames.length, reference.frames.length);
  wide.frames.forEach((frame, i) => {
    assert.deepEqual(frame.keys, reference.frames[i].keys, '2× 必须复用原 SRS 的实际推进帧');
    assert.equal(frame.displayHash, frame.rawHash, '2× 转场不能用高清边缘滤镜改写原始点阵材质');
    for (const key of frame.keys) {
      if (key >= 48) continue;
      const y = (key % 2 === 0 ? key : 95 - key) * 2;
      for (let row = y; row < y + 4; row++) assert.equal(frame.rows[row], 320, '原横条在 2× 必须铺满完整宽度');
    }
  });
  assert.equal(await current.evaluate('FmjHdRenderer.isEnabled()'), true, '转场不能修改玩家选择的高清设置');
  const modeSwitch = await current.evaluate(`(() => {
    const lcd = document.querySelector('#lcd'), color = window['fmj.core'].fmj.Global.COLOR_BLACK;
    const buffer = new Array(320 * 192).fill(color);
    FmjHdRenderer.draw(lcd, buffer, 320, 192, true);
    const original = lcd.getContext('2d').getImageData(0, 0, 1, 1).data[0];
    // 帧内容保持相同，仅退出转场模式，缓存也必须恢复所选画质。
    FmjHdRenderer.draw(lcd, buffer, 320, 192, false);
    const restored = lcd.getContext('2d').getImageData(0, 0, 1, 1).data[0];
    return { original, restored };
  })()`);
  assert.equal(modeSwitch.original, 0); assert.equal(modeSwitch.restored, 24, '相同画面退出转场后也要恢复高清显示');
  assert.deepEqual(original.exceptions, []); assert.deepEqual(current.exceptions, []);
  console.log(`初版 ${originalFmjCommit} 转场差分通过：1× 实际显示逐帧一致，2× 共用原绘制/帧序、320 全宽、原点阵色彩，保留高清设置。`);
} finally {
  original.close(); current.close();
}
