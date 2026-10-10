import assert from 'node:assert/strict';
import { createFmjBrowser, delay } from './fmj_browser_session.mjs';

/**
 * 回放原 ROM 的剧情幕布指令，以 1× 每帧遮挡行作为 2× 的像素基准。
 * 检查原位图逐行投影、横向铺满和闭合遮挡；不人为假设新的纹理。
 */
const browser = await createFmjBrowser({ accelerated: true });
try {
  const results = await browser.evaluate(`(() => {
    sysSetGameLoopPaused(true);
    const module = window['fmj.core'], core = module.fmj;
    const definitions = FmjGuideData.scripts.filter(s => ['4:8', '3:12'].includes(s.id));
    return definitions.flatMap(definition => {
      const [type, index] = definition.id.split(':').map(Number);
      const commands = core.game.vm.loadScript_vux9f0$(type, index).commands_0.toArray();
      return definition.commands.flatMap((command, commandIndex) => {
        if (command.op !== 30 || command.a[0] !== 1 || command.a[1] !== 3) return [];
        function replay(wide) {
          FmjWideView.setEnabled(wide);
          const target = wide ? core.game.canvas_0 : module.graphics.Canvas_init_vux9f0$(160, 96);
          target.drawColor_we4i00$(core.Global.COLOR_WHITE);
          const op = commands[commandIndex].run_fhed9o$(null), frames = [];
          for (let tick = 0; tick < 100; tick++) {
            op.draw_9in0vv$(target);
            const rows = [];
            for (let y = 0; y < target.height; y++) {
              let covered = 0;
              for (let x = 0; x < target.width; x++) {
                const pixel = target.buffer[y * target.width + x];
                if (pixel.r === 0 && pixel.g === 0 && pixel.b === 0) covered++;
              }
              rows.push(covered);
            }
            const running = op.update_s8cxhz$(kotlin.Long.fromInt(40));
            frames.push({ rows, running });
            if (!running) break;
          }
          return frames;
        }
        return [{ script: definition.id, at: command.at, original: replay(false), wide: replay(true) }];
      });
    });
  })()`);
  assert.equal(results.length, 4, '必须覆盖蛇妖逃走及小梅父亲遇害剧情中的四次原幕布转场');
  for (const result of results) {
    assert.equal(result.wide.length, result.original.length, '幕布不能改变剧情等待时长');
    result.original.forEach((original, tick) => {
      const wide = result.wide[tick];
      assert.equal(wide.running, original.running, '原动画的结束时机必须一致');
      original.rows.forEach((covered, y) => {
        assert.ok(covered === 0 || covered === 159, '1× 原幕布应整行遮挡');
        const expected = covered ? 320 : 0;
        assert.equal(wide.rows[y * 2], expected, result.script + '@' + result.at + ' 第 ' + tick + ' 帧第 ' + (y * 2) + ' 行：2× 幕布应铺满，密度与 1× 一致');
        assert.equal(wide.rows[y * 2 + 1], expected, '2× 必须保留原位图的每一行，不能自行增加细纹');
      });
    });
    assert.ok(result.wide.some(frame => frame.rows.every(covered => covered === 320)), '上下幕布闭合时必须完整遮住画面');
  }
  // 再经由真实场景事件回放“蛇窟出口 → 坟场 → 蛇妖袭村”，核查正式游戏绘制链。
  assert.equal(JSON.parse(await browser.evaluate('bbkSelectFmjStage("stage-034")')).ok, true);
  for (let i = 0; i < 100; i++) {
    if (!await browser.evaluate('FmjGuide.state()?.busy')) break;
    await delay(10);
  }
  await browser.evaluate(`(() => {
    const core = window['fmj.core'].fmj, original = core.lib.ResSrs.prototype.draw_2g4tob$;
    window.__fmjCurtainStory = { frames: 0, closed: false, gaps: [] };
    core.lib.ResSrs.prototype.draw_2g4tob$ = function (target, dx, dy) {
      original.apply(this, arguments);
      if (target !== FmjWideView.drawing.projected || this.type !== 1 || this.index !== 3) return;
      const trace = window.__fmjCurtainStory;
      trace.frames++;
      const black = pixel => pixel && pixel.r === 0 && pixel.g === 0 && pixel.b === 0;
      const iterator = this.mShowList_0.iterator();
      while (iterator.hasNext()) {
        const header = this.mFrameHeader_0[iterator.next().index_8be2vx$];
        if (this.mImage_0[header[4]].width !== 159) continue;
        for (let y = header[1] * 2; y < header[1] * 2 + 4; y++) {
          if (!target.buffer.slice(y * 320, (y + 1) * 320).every(black)) trace.gaps.push(y);
        }
      }
      if (target.buffer.every(black)) trace.closed = true;
    };
    window.__fmjRestoreCurtain = () => { core.lib.ResSrs.prototype.draw_2g4tob$ = original; };
    core.game.mainScene.triggerEvent_za3lpa$(42);
  })()`);
  let reachedFatherScene = false;
  try {
    for (let i = 0; i < 200; i++) {
      const text = await browser.evaluate(`(() => {
        const op = window['fmj.core'].fmj.game.mainScene.scriptProcess.curOp_0;
        return op?.closure$text ? sysGbkDecode(op.closure$text) : '';
      })()`);
      if (text.includes('蛇妖:竟敢找人来对付我')) { reachedFatherScene = true; break; }
      await browser.evaluate('bbkSendInput("confirm")');
      await delay(10);
    }
    assert.ok(reachedFatherScene, '幕布结束后应正常进入小梅父亲遇害场景的原对白');
    const trace = await browser.evaluate('window.__fmjCurtainStory');
    assert.ok(trace.frames > 0, '真实剧情必须经过上下幕布动画');
    assert.deepEqual(trace.gaps, [], '正式场景中的原横条必须贯穿整个屏幕');
    assert.equal(trace.closed, true, '切换到遇害场景前幕布必须完全闭合');
  } finally {
    await browser.evaluate('window.__fmjRestoreCurtain()');
  }
  assert.deepEqual(browser.exceptions, []);
  console.log('剧情幕布回归通过：四次原位图转场、原帧序和结束时机、2× 全宽、完整遮挡及真实剧情衔接。');
} finally {
  browser.close();
}
