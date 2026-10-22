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
    await page.evaluate(() => {
      const pf=['OldBelong','Belong','Level','Force','IQ','Devotion','Character','Experience','Thew','ArmsType','Arms','Age'];
      const cf=['State','Belong','SatrapId','FarmingLimit','Farming','CommerceLimit','Commerce','PeopleDevotion','AvoidCalamity','PopulationLimit','Population','Money','Food','MothballArms','PersonQueue','Persons','ToolQueue','Tools'];
      const record=(value,fields)=>Object.fromEntries(fields.map(k=>[k,Number(value[k])]));
      const snapshot=()=>({period:baye.data.g_PIdx,year:baye.data.g_YearDate,month:baye.data.g_MonthDate,playerRulerIndex:baye.data.g_PlayerKing,randomSeed:_bayeGetSeed()>>>0,
        persons:Array.from(baye.data.g_Persons).slice(0,baye.getPersonCount()).map(p=>({...record(p,pf),Equip:Array.from(p.Equip)})),
        cities:Array.from(baye.data.g_Cities).map(c=>record(c,cf)),personQueue:Array.from(baye.data.g_PersonsQueue).slice(0,baye.getPersonCount()),goodsQueue:Array.from(baye.data.g_GoodsQueue).slice(0,2000)});
      window.calendarSnapshots=[];
      const original=baye.hooks.didOpenNewGame;
      baye.hooks.chooseGameEntry=()=>0;
      baye.hooks.loadPeriod=()=>{_bayeLoadPeriod(1);return 1;};
      baye.hooks.chooseActor=()=>5;
      baye.hooks.didOpenNewGame=()=>{
        if(original)original();
        for(let i=0;i<38;i++){baye.data.g_Cities[i].Belong=i===37?1:6;}
        for(let i=0;i<baye.getPersonCount();i++){let p=baye.data.g_Persons[i];if(p.Belong>0&&p.Belong!==65535)p.Belong=6;}
        baye.data.g_engineConfig.disableAllPersonReport=1;
        _bayeSRand(1);
      };
      baye.hooks.tacticStage1=()=>{baye.data.g_Cities[37].Belong=6;};
      baye.hooks.tacticStage5=undefined;
      baye.hooks.tacticStageUser=()=>window.calendarSnapshots.length>=12?-1:0;
      baye.hooks.mainSystemMenu=()=>0;
      baye.hooks.tacticStage4=()=>{window.calendarBefore=snapshot();};
      baye.hooks.tacticStage5=()=>{window.calendarSnapshots.push({before:window.calendarBefore,after:snapshot()});baye.data.g_Cities[37].Belong=1;};
      _bayeSendKey(0x27);
    });
    for(let i=0;i<120;i++){
      const count=await page.evaluate(()=>window.calendarSnapshots?.length||0);
      if(count>=12)break;
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    const snapshots=await page.evaluate(()=>window.calendarSnapshots);
    if(snapshots.length!==12){console.log(await page.evaluate(()=>({period:baye.data.g_PIdx,king:baye.data.g_PlayerKing,year:baye.data.g_YearDate,ready:document.body.dataset.gameReady,hooks:Object.keys(baye.hooks),errors:window.onerror.toString().slice(0,50)})));await page.screenshot({path:outputRoot+'/calendar_failure.png'});throw new Error('Incomplete calendar oracle: '+snapshots.length);}
    await fs.writeFile(path.join(outputRoot,'reference_calendar.json'),JSON.stringify(snapshots)+'\n');
    console.log(JSON.stringify(snapshots.map(x=>({month:x.before.month,nextMonth:x.after.month,nextYear:x.after.year,seed:x.after.randomSeed})),null,2));
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
