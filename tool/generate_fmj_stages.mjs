import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

// 选关前置来自原引擎连续回放，不用事件编号大小推断剧情先后。
const context={window:{}};
for(const file of ['guide-data','guide-engine'])vm.runInNewContext(fs.readFileSync(`assets/games/fmj/js/${file}.js`,'utf8'),context);
const data=context.window.FmjGuideData,engine=new context.window.FmjGuideEngine(data);
const fixture='tool/fixtures/fmj_stage_story_states.json';
const regenerate=process.argv.includes('--from-audit')||!fs.existsSync(fixture);
const runs=regenerate?['complete','complete-alternative'].map(name=>JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'bbk-fmj-flow-audit',`full-flow-${name}.json`),'utf8'))):JSON.parse(fs.readFileSync(fixture,'utf8')).runs;
if(regenerate){
  fs.mkdirSync(path.dirname(fixture),{recursive:true});
  fs.writeFileSync(fixture,JSON.stringify({sha256:data.sha256,runs:runs.map(run=>({records:run.records.filter(r=>r.type==='navigation').map(r=>({state:r.state,goal:r.goal}))}))}));
}
const incoming=new Map();
for(const script of data.scripts){let map;for(const c of script.commands){if(c.op===1)map={mapId:c.a[0]+':'+c.a[1],x:c.a[2]+4,y:c.a[3]+3};if(c.op===14&&map){const id=c.a[0]+':'+c.a[1];const rows=incoming.get(id)||[];rows.push({...map});incoming.set(id,rows)}}}
const stages=[],seen=new Set();
function group(flags){const f=new Set(flags);return f.has(254)?'八 · 回山与终局':f.has(250)?'七 · 鹤鸣山与天师陵':f.has(246)?'六 · 酆都鬼事':f.has(234)?'五 · 周处与四象精魄':f.has(224)?'四 · 白水镇与摄魂阵':f.has(216)?'三 · 建业与钟山':f.has(202)?'二 · 忘忧村与石梦城':'一 · 三清山试炼'}
for(const run of runs)for(const record of run.records){
  if(record.type!=='navigation')continue;
  const goal=record.goal,key=[goal.scriptId,goal.event,goal.label].join('/');if(seen.has(key))continue;seen.add(key);
  const script=engine.scripts.get(goal.scriptId);if(!script)continue;
  const flags=record.state.flags.filter(f=>f>0&&f<=2400),f=new Set(flags);
  const mapId=goal.scriptId===record.state.script?record.state.map:script.maps[0];
  const entrance=(incoming.get(goal.scriptId)||[]).find(p=>p.mapId===mapId)||{x:8,y:8,mapId};
  const vars=Array(240).fill(0);
  if(goal.scriptId==='9:13'&&goal.event>=1&&goal.event<=8)vars[1]=goal.event-1;
  if(goal.scriptId==='14:9'&&[2,3,4,5].includes(goal.event))vars[1]=goal.event-2;
  let seed={scriptId:goal.scriptId,mapId,x:entrance.x,y:entrance.y,flags:Array(2401).fill(false),vars,npcs:[]};flags.forEach(i=>seed.flags[i]=true);
  const initialized=engine.simulate(seed,0,true).state,map=engine.maps.get(initialized.mapId);
  let position={x:initialized.x,y:initialized.y};
  if(map){const flood=engine.flood(initialized),near=goal.event?engine.approaches(initialized,flood,goal.event):[];
    if(near.length)position=near[0];else if(!engine.walkable(initialized,position.x,position.y,false)){for(let y=3;y<map.height-2;y++){let found=false;for(let x=4;x<map.width-4;x++)if(engine.walkable(initialized,x,y,false)){position={x,y};found=true;break}if(found)break}}}
  const actors=[1];if(f.has(202)&&(!f.has(216)||f.has(217)))actors.push(2);
  if(f.has(219)&&!f.has(221)||f.has(231)&&!f.has(252))actors.push(3);
  const goods=Object.entries(record.state.goods||{}).filter(([,n])=>n>0).map(([id,count])=>({id,count}));
  goods.push({id:'13:1',count:1});
  if(f.has(19))goods.push({id:'14:12',count:1});
  for(const [flag,item,used]of [[245,8,255],[238,9,256],[252,10,257],[253,11,258]])if(f.has(flag)&&!f.has(used))goods.push({id:'14:'+item,count:1});
  if(f.has(259))goods.push({id:'14:13',count:1});
  if(goal.id==='daughter-rescue'&&!f.has(214))goods.push({id:'14:4',count:1});
  if(goal.deferFlag||/卡片|紫瞳|观星亭/.test(goal.label))goods.push({id:'14:2',count:3});
  const equipment=[];if(f.has(210)){equipment.push({actor:1,id:'4:14',slot:6},{actor:2,id:'4:13',slot:6});}
  if(f.has(254))equipment.push({actor:1,id:'6:14',slot:0});
  if(goal.id==='worm-return')goods.push({id:'14:5',count:1});
  if(goal.id==='ghost-return')goods.push({id:'14:6',count:1});
  if(goal.id==='point-return')goods.push({id:'14:7',count:1});
  stages.push({id:'stage-'+String(stages.length+1).padStart(3,'0'),title:goal.label,chapter:group(flags),scene:script.name,
    scriptId:goal.scriptId,mapId:initialized.mapId,x:position.x,y:position.y,direction:position.direction,event:goal.event,
    flags,variable:vars[1],actors,goods,equipment,kind:goal.kind==='side'?'支线':'主线',
    level:Math.min(50,5+Math.floor(flags.filter(i=>i>=202&&i<=260).length*1.1)),
    preparation:equipment.length?'自动补齐任务物品，并佩戴'+(f.has(254)?'芦藤甲、天心灯':'芦藤雌雄甲'):'自动补齐队伍与任务物品'});
}
stages.sort((a,b)=>'一二三四五六七八'.indexOf(a.chapter[0])-'一二三四五六七八'.indexOf(b.chapter[0]));
fs.writeFileSync('assets/games/fmj/js/stage-data.js','/* 由 tool/generate_fmj_stages.mjs 根据原引擎完整流程回放生成。 */\nwindow.FmjStageData='+JSON.stringify(stages)+';\n');
console.log(`生成 ${stages.length} 个细分故事关卡`);
