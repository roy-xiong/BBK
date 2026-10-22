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
      window.battleSnapshots=[];
      const cases=[];for(const target of [3,9,14])for(const seed of [1,42])cases.push({target,seed});
      console.log('EXPORTS', ['_FgtInit','_BuiltAtkAttr','_CountAtkHurt','_FgtGetCmdRng','_FgtDealBout'].map(k=>k+':'+typeof window[k]).join(','));
      const original=baye.hooks.didOpenNewGame, originalEnter=baye.hooks.enterBattle;
      baye.hooks.chooseGameEntry=()=>0;
      baye.hooks.loadPeriod=()=>{_bayeLoadPeriod(1);return 1;};
      baye.hooks.chooseActor=()=>5;
      baye.hooks.didOpenNewGame=()=>{if(original)original();baye.data.g_engineConfig.disableAllPersonReport=1;BbkSgby.applyCheat('sgby_disable_animations',{enabled:true});};
      baye.hooks.tacticStageUser=()=>window.battleSnapshots.length>=cases.length?-1:0;
      baye.hooks.mainSystemMenu=()=>0;
      baye.hooks.tacticStage2=()=>{if(!window.battleBaseline)window.battleBaseline=snapshot();restore(window.battleBaseline);};
      baye.hooks.tacticStage3=()=>{
        restore(window.battleBaseline);const c=cases[window.battleSnapshots.length];const target=baye.data.g_Cities[c.target];target.Belong=1;target.Food=5000;for(let i=0;i<target.Persons;i++){const id=baye.data.g_PersonsQueue[target.PersonQueue+i];if(baye.data.g_Persons[id].Belong>0&&baye.data.g_Persons[id].Belong!==65535)baye.data.g_Persons[id].Belong=1;}
        const o=baye.data.g_OrderQueue[170];for(const k of ['OrderId','Person','City','Object','Arms','Food','Money','Consume','TimeCount'])o[k]=0;o.OrderId=27;o.Person=0;o.City=8;o.Object=c.target;o.Food=5000;baye.data.FIGHTERS_IDX[0]=1;for(let i=0;i<600;i++)baye.data.FIGHTERS[i]=0;[5,58,60].forEach((id,i)=>{baye.data.FIGHTERS[i*2]=(id+1)&255;baye.data.FIGHTERS[i*2+1]=(id+1)>>8;});
        _bayeSRand(c.seed);window.battleBefore=snapshot();
      };
      baye.hooks.enterBattle=()=>{
        if(originalEnter)originalEnter();
        const bp=baye.data.g_FgtParam;
        const params={mode:Number(bp.Mode),city:Number(bp.CityIndex),sourceCity:8,way:Number(bp.Way),mapId:Number(bp.MapId),playerFood:Number(bp.MProvender),enemyFood:Number(bp.EProvender),people:Array.from(bp.GenArray).map(id=>id?Number(id)-1:null)};
        const units=Array.from(baye.data.g_GenPos).map(p=>record(p,['x','y','hp','mp','move','active','state']));
        const result={...cases[window.battleSnapshots.length],before:window.battleBefore,params,after:snapshot(),units,width:Number(baye.data.g_MapWid),height:Number(baye.data.g_MapHgt),cityX:Number(baye.data.g_CityX),cityY:Number(baye.data.g_CityY)};
        window.battleSnapshots.push(result);baye.data.g_FgtOver=1;
      };
      baye.hooks.tacticStage4=()=>{restore(window.battleBaseline);};
      baye.hooks.tacticStage5=undefined;
      _bayeSendKey(0x27);
    });
    for(let i=0;i<240;i++){
      const count=await page.evaluate(()=>window.battleSnapshots?.length||0);
      if(count>=6)break;
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    const snapshots=await page.evaluate(()=>window.battleSnapshots);
    if(snapshots.length!==6){console.log(errors);await page.screenshot({path:outputRoot+'/battle_capture_failure.png'});throw new Error('Incomplete battle oracle: '+snapshots.length);}
    await fs.writeFile(path.join(outputRoot,'reference_battle_init.json'),JSON.stringify(snapshots)+'\n');
    console.log(JSON.stringify(snapshots.map(x=>({target:x.target,seed:x.seed,params:x.params,nextSeed:x.after.randomSeed})),null,2));
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
