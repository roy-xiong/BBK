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
      const of=['OrderId','Person','City','Object','TimeCount'];
      const fullSnapshot=()=>{const s=snapshot();s.orders=Array.from(baye.data.g_OrderQueue).map((o,queueSlot)=>({o,queueSlot})).filter(x=>x.o.OrderId!==255).map(({o,queueSlot})=>{const v={...record(o,of),queueSlot};if(o.OrderId===27){v.Food=Number(o.Food);const raw=Array.from(baye.data.FIGHTERS).slice(o.Person*20,o.Person*20+20);v.fighters=[];for(let i=0;i<20;i+=2){const id=raw[i]|raw[i+1]<<8;if(id)v.fighters.push(id-1);}}return v;});return s;};
      const restore=s=>{baye.data.g_YearDate=s.year;baye.data.g_MonthDate=s.month;baye.data.g_PlayerKing=s.playerRulerIndex;for(let i=0;i<s.persons.length;i++){for(const key of pf)baye.data.g_Persons[i][key]=s.persons[i][key];for(let j=0;j<2;j++)baye.data.g_Persons[i].Equip[j]=s.persons[i].Equip[j];}for(let i=0;i<38;i++)for(const key of cf)baye.data.g_Cities[i][key]=s.cities[i][key];s.personQueue.forEach((x,i)=>baye.data.g_PersonsQueue[i]=x);s.goodsQueue.forEach((x,i)=>baye.data.g_GoodsQueue[i]=x);for(const o of Array.from(baye.data.g_OrderQueue))o.OrderId=255;for(let i=0;i<30;i++)baye.data.FIGHTERS_IDX[i]=0;};
      window.cheatSnapshots=[];
      const cases=['sgby_resources','sgby_development','sgby_generals','sgby_max_all','sgby_search_city','sgby_search_world_generals','sgby_execute_wild_generals','sgby_recruit_captives','sgby_execute_captives'];
      const original=baye.hooks.didOpenNewGame;
      baye.hooks.chooseGameEntry=()=>0;baye.hooks.loadPeriod=()=>{_bayeLoadPeriod(1);return 1;};baye.hooks.chooseActor=()=>5;
      baye.hooks.didOpenNewGame=()=>{if(original)original();baye.data.g_engineConfig.disableAllPersonReport=1;};
      baye.hooks.tacticStageUser=()=>window.cheatSnapshots.length>=cases.length?-1:0;baye.hooks.mainSystemMenu=()=>0;
      baye.hooks.tacticStage2=()=>{if(!window.cheatBaseline)window.cheatBaseline=snapshot();restore(window.cheatBaseline);};
      baye.hooks.tacticStage3=()=>{
        restore(window.cheatBaseline);
        const state=JSON.parse(BbkSgby.getCheatState());if(state.autoMaxCities)BbkSgby.applyCheat('sgby_max_all');if(state.autoMaxGenerals)BbkSgby.applyCheat('sgby_generals');
        baye.data.g_Persons[57].Belong=65535;baye.data.g_Persons[57].OldBelong=1;
        baye.data.g_CityPos.setx=baye.data.g_CityPositions[0].x;baye.data.g_CityPos.sety=baye.data.g_CityPositions[0].y;
        _bayeSRand(1);const before=snapshot();const action=cases[window.cheatSnapshots.length];const result=JSON.parse(BbkSgby.applyCheat(action,{}));
        window.cheatSnapshots.push({action,before,after:snapshot(),result,state:JSON.parse(BbkSgby.getCheatState())});
      };
      baye.hooks.tacticStage4=()=>{restore(window.cheatBaseline);};baye.hooks.tacticStage5=undefined;
      _bayeSendKey(0x27);
    });
    for(let i=0;i<160;i++){
      const count=await page.evaluate(()=>window.cheatSnapshots?.length||0);if(count>=9)break;
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    const snapshots=await page.evaluate(()=>window.cheatSnapshots);
    if(snapshots.length!==9){console.log(errors);throw new Error('Incomplete orders oracle: '+snapshots.length);}
    await fs.writeFile(path.join(outputRoot,'reference_cheats.json'),JSON.stringify(snapshots)+'\n');
    console.log('Captured '+snapshots.length+' cheat samples');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
