const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.SGBY_PLAYWRIGHT_MODULE || 'playwright');

// 此脚本只运行已存在的旧内核，采集迁移测试数据，不构建新 Flutter 应用。
const projectRoot = path.resolve(__dirname, '../..');
const sourceRoot = path.join(process.env.SGBY_REFERENCE_REPO || path.resolve(projectRoot, '../bbk'), 'assets/games');
const outputRoot = path.join(projectRoot, 'test/fixtures');
const mime = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.wasm':'application/wasm','.lib':'application/octet-stream'};
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/__state__/sgby') {
      response.setHeader('Content-Type', 'application/json');
      response.end('{"entries":{}}'); return;
    }
    if (url.pathname === '/__font__') {response.end(await fs.readFile(path.join(projectRoot, 'assets/game/android_font48.bin')));return;}
    const file = path.resolve(sourceRoot, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(sourceRoot + path.sep)) { response.writeHead(403); response.end(); return; }
    const bytes = await fs.readFile(file);
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    response.end(bytes);
  } catch (_) { response.writeHead(404); response.end(); }
});

(async () => {
  await require('./reference_support.cjs').verifySource(projectRoot, sourceRoot);
  await fs.mkdir(outputRoot, {recursive:true});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless:true,executablePath:process.env.SGBY_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const page = await browser.newPage({viewport:{width:960,height:576}});
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => {if(message.type()==='error') errors.push(message.text())});
    page.on('requestfailed', request => errors.push(request.url()+': '+request.failure()?.errorText));
    await page.addInitScript(() => {
      localStorage.setItem('baye/libpath', 'libs/SGBY-Reset-4X.lib');
      localStorage.setItem('baye/libname', '原版精修 4X');
      localStorage.setItem('baye/resolution', '0');
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/sgby/index.html`);
    for(let attempt=0;attempt<40;attempt++) {
      if(await page.evaluate(()=>Boolean(window.baye && baye.data && document.body.dataset.gameReady==='true')))break;
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    await new Promise(resolve=>setTimeout(resolve,1000));
    await page.evaluate(async()=>{
      const bytes=new Uint8Array(await(await fetch('/__font__')).arrayBuffer()),view=new DataView(bytes.buffer),glyphs=new Map();let offset=8;
      for(let i=0;i<view.getUint16(6,true);i++){const code=view.getUint16(offset,true),len=view.getUint16(offset+4,true);offset+=6;glyphs.set(code,bytes.slice(offset,offset+len));offset+=len;}
      const originalFont=baye.hooks.fontImageForChar;baye.hooks.fontImageForChar=context=>{const glyph=glyphs.get(context.code);if(glyph){context.zmCode=glyph;return 0;}return originalFont(context);};
      const originalFlush=window.bayeFlushLcdBuffer;window.bayeFlushLcdBuffer=function(buffer){originalFlush(buffer);window.referencePixels=new Uint8Array(new Uint8Array(wasmMemory.buffer,buffer,240*4*144*4*4));};
      const pf=['OldBelong','Belong','Level','Force','IQ','Devotion','Character','Experience','Thew','ArmsType','Arms','Age'],cf=['State','Belong','SatrapId','FarmingLimit','Farming','CommerceLimit','Commerce','PeopleDevotion','AvoidCalamity','PopulationLimit','Population','Money','Food','MothballArms','PersonQueue','Persons','ToolQueue','Tools'];
      const record=(value,fields)=>Object.fromEntries(fields.map(k=>[k,Number(value[k])]));
      window.pixelWorld=()=>({period:baye.data.g_PIdx,year:baye.data.g_YearDate,month:baye.data.g_MonthDate,playerRulerIndex:baye.data.g_PlayerKing,randomSeed:_bayeGetSeed()>>>0,persons:Array.from(baye.data.g_Persons).slice(0,baye.getPersonCount()).map(p=>({...record(p,pf),Equip:Array.from(p.Equip)})),cities:Array.from(baye.data.g_Cities).map(c=>record(c,cf)),personQueue:Array.from(baye.data.g_PersonsQueue).slice(0,baye.getPersonCount()),goodsQueue:Array.from(baye.data.g_GoodsQueue).slice(0,2000),cursorX:Number(baye.data.g_CityPos.setx),cursorY:Number(baye.data.g_CityPos.sety),viewX:Number(baye.data.g_CityPos.x),viewY:Number(baye.data.g_CityPos.y)});
      const original=baye.hooks.didOpenNewGame;baye.hooks.didOpenNewGame=()=>{if(original)original();_bayeSRand(1);};
      _bayeSendKey(0x27);
    });
    const metadata=[];
    const capture=async(name)=>{
      await new Promise(resolve=>setTimeout(resolve,220));
      const value=await page.evaluate(()=>({pixels:Array.from(window.referencePixels||[]),world:window.pixelWorld()}));
      if(value.pixels.length!==960*576*4)throw new Error('Missing frame '+name);
      const pixels=Buffer.from(value.pixels);
      for(let i=0;i<pixels.length;i+=4){const alpha=pixels[i+3];for(let c=0;c<3;c++)pixels[i+c]=Math.floor((pixels[i+c]*alpha+180*(255-alpha)+127)/255);pixels[i+3]=255;}
      await fs.writeFile(path.join(outputRoot,'pixels_ext_'+name+'.rgba.gz'),require('node:zlib').gzipSync(pixels));
      metadata.push({name,world:value.world});await page.screenshot({path:outputRoot+'/pixels_ext_'+name+'.png'});console.log('Captured '+name);
    };
    const key=async(value)=>{await page.evaluate(key=>_bayeSendKey(key),value);};
    await capture('main_menu');
    await key(0x27);await capture('period_menu');
    await key(0x27);await capture('rulers');
    await key(0x27);await capture('strategy');
    await key(0x27);await capture('city_menu');
    for(let i=0;i<3;i++)await key(0x23);await key(0x27);await capture('city_details');
    await key(0x28);await key(0x26);await capture('help_menu');
    await key(0x27);await capture('help_heroes');
    await key(0x23);await capture('help_heroes_1');
    await key(0x28);await key(0x23);await key(0x27);await capture('help_tools');
    await key(0x28);await key(0x23);await key(0x23);await key(0x27);await capture('help_cities');
    await key(0x27);await capture('help_city_hidden');
    await key(0x27);await key(0x28);await key(0x28);
    await key(0x27);await key(0x27);await key(0x27);await capture('people_selection');
    await key(0x27);await capture('general_report');
    await new Promise(resolve=>setTimeout(resolve,2200));await key(0x28);
    await page.evaluate(()=>{const p=baye.data.g_CityPositions[3];baye.data.g_CityPos.setx=p.x-1;baye.data.g_CityPos.sety=p.y;baye.hooks.playerCityCommand=()=>9;});
    await key(0x25);await key(0x27);await capture('no_goods_report');await new Promise(resolve=>setTimeout(resolve,2200));await page.evaluate(()=>BbkSgby.applyCheat('sgby_search_city'));await key(0x27);await capture('goods_selection');
    await key(0x28);await new Promise(resolve=>setTimeout(resolve,2200));await page.evaluate(()=>{baye.hooks.playerCityCommand=undefined;baye.hooks.mainSystemMenu=undefined;});await key(0x28);await new Promise(resolve=>setTimeout(resolve,150));await key(0x23);await key(0x27);await capture('save_menu');
    await fs.writeFile(path.join(outputRoot,'reference_pixels_extended.json'),JSON.stringify(metadata)+'\n');
    console.log(errors);
    await require('./reference_support.cjs').refreshPngs(outputRoot);
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
