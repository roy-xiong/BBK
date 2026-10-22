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
    const initial = await page.evaluate(() => ({
      width:baye.data.g_screenWidth,height:baye.data.g_screenHeight,scale:baye.data.g_scale,
      config:Object.fromEntries(baye.data.g_engineConfig._baye_properties.map(key=>[key,typeof baye.data.g_engineConfig[key]==='object'?Array.from(baye.data.g_engineConfig[key]):baye.data.g_engineConfig[key]])),
      exports:Object.keys(window).filter(key => /baye.*(Period|Rand|Seed|Menu)/i.test(key)),
      scriptAvailable:typeof ori === 'object',
      palette:Array.from(baye.data.g_paintPalette),
      canvasBackground:getComputedStyle(document.getElementById('lcd')).backgroundColor,
      firstPixel:Array.from(document.getElementById('lcd').getContext('2d').getImageData(0,0,1,1).data),
    }));
    await fs.writeFile(path.join(outputRoot,'reference_config.json'),JSON.stringify(initial,null,2)+'\n');
    const periods = await page.evaluate(() => {
      const personFields=['OldBelong','Belong','Level','Force','IQ','Devotion','Character','Experience','Thew','ArmsType','Arms','Age'];
      const cityFields=['State','Belong','SatrapId','FarmingLimit','Farming','CommerceLimit','Commerce','PeopleDevotion','AvoidCalamity','PopulationLimit','Population','Money','Food','MothballArms','PersonQueue','Persons','ToolQueue','Tools'];
      function record(object, fields) {return Object.fromEntries(fields.map(key => [key, Number(object[key])]))}
      const output=[];
      for(let period=1;period<=4;period++) {
        _bayeLoadPeriod(period);
        const persons=Array.from(baye.data.g_Persons).slice(0,baye.getPersonCount()).map((person,index)=>({...record(person,personFields),Equip:Array.from(person.Equip),name:baye.getPersonName(index)}));
        const cities=Array.from(baye.data.g_Cities).map((city,index)=>({...record(city,cityFields),name:baye.getCityName(index)}));
        const baseline={period,year:baye.data.g_YearDate,month:baye.data.g_MonthDate,persons,cities,personQueue:Array.from(baye.data.g_PersonsQueue).slice(0,persons.length),goodsQueue:Array.from(baye.data.g_GoodsQueue).slice(0,2000)};
        if(baye.hooks.didOpenNewGame)baye.hooks.didOpenNewGame();
        baseline.afterRefinedHook=Array.from(baye.data.g_Persons).slice(0,baye.getPersonCount()).map(person=>({...record(person,personFields),Equip:Array.from(person.Equip)}));
        baseline.tools=Array.from(baye.data.g_Tools).map((tool,index)=>({...record(tool,['idx_','useflag','changeAttackRange','at','iq','move','arm']),name:baye.getToolName(index)}));
        output.push(baseline);
      }
      return output;
    });
    await fs.writeFile(path.join(outputRoot,'reference_periods.json'),JSON.stringify(periods)+'\n');
    await fs.writeFile(path.join(outputRoot,'reference_errors.json'),JSON.stringify(errors,null,2)+'\n');
    console.log(JSON.stringify({width:initial.width,height:initial.height,scale:initial.scale,periods:periods.map(x=>({period:x.period,year:x.year,persons:x.persons.length,cities:x.cities.length})),errors},null,2));
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
