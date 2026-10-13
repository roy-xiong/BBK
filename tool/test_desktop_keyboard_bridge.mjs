import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createFmjBrowser, delay} from './fmj_browser_session.mjs';

/** 捕获改键后的按下及松开，确保原版监听不会再把 Escape 当作返回键执行。 */
const b=await createFmjBrowser({accelerated:true});
try {
  await b.evaluate('bbkSelectFmjStage("stage-001")');
  for(let i=0;i<100;i++){if(!await b.evaluate('FmjGuide.state()?.busy'))break;await delay(10);}
  const source=fs.readFileSync(new URL('../assets/games/desktop-controls.js',import.meta.url),'utf8');
  const result=await b.evaluate(`(()=>{
    sysSetGameLoopPaused(true);
    const scene=window['fmj.core'].fmj.game.mainScene, before={x:scene.player.posInMap.x,y:scene.player.posInMap.y};
    const received=[];window.BbkSystemChannel={postMessage(value){const message=JSON.parse(value);if(message.type==='desktop_key'){received.push(message.data.code);if(message.data.code==='Escape')bbkSendInput('left');}}};
    (0,eval)(${JSON.stringify(source)});
    for(const type of ['keydown','keyup'])document.body.dispatchEvent(new KeyboardEvent(type,{code:'Escape',key:'Escape',keyCode:27,bubbles:true,cancelable:true}));
    const game=window['fmj.core'].fmj.game;
    return {received,before,after:{x:scene.player.posInMap.x,y:scene.player.posInMap.y},sameScreen:game.getCurScreen()===scene};
  })()`);
  assert.deepEqual(result.received,['Escape']);assert.equal(result.sameScreen,true,'松键不能打开原返回菜单');
  assert.equal(result.after.x,result.before.x-1,'重映射的 Escape 应沿原输入走向左侧');
  assert.equal(result.after.y,result.before.y);assert.deepEqual(b.exceptions,[]);
  console.log('桌面键盘桥通过：按下仅执行新映射，松开不触发旧返回键。');
}finally{b.close()}
