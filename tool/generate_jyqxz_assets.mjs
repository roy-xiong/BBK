import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildJyqxzWorld } from './build_jyqxz_world.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const game = path.join(root, 'assets/games/jyqxz');
const source = fs.readFileSync(path.join(game, 'rom/rom.js'), 'utf8');
const binary = Buffer.from(source.match(/fmj\.rom\["DAT\.LIB"\]\s*=\s*"([0-9A-F]+)"/)?.[1] || '', 'hex');
const hash = crypto.createHash('sha256').update(binary).digest('hex');
if (hash !== '25d5535d4302b73adda5f2f01614c99fe07bb225c1c0e891bdab3a1795a6c867') throw Error('金庸群侠传 ROM 与核验基线不一致');
const decoder = new TextDecoder('gbk');
function string(bytes, at) {
  const end = bytes.indexOf(0, at);
  if (end < at) throw Error('资源字符串没有终止标记');
  return decoder.decode(bytes.subarray(at, end));
}
const resources = [];
for (let h = 16, p = 8192; binary[h] !== 255; h += 3, p += 3) {
  if (h >= 8192 || p + 2 >= binary.length) throw Error('资源索引越界');
  const offset = binary[p] * 16384 + binary.readUInt16LE(p + 1);
  if (offset >= binary.length) throw Error('资源数据越界');
  resources.push({kind:binary[h], type:binary[h+1], index:binary[h+2], offset});
}
// 指令长度沿用当前 FMJ 解析器，两个游戏使用同一引擎，避免重复定义漂移。
const parser = fs.readFileSync(path.join(root, 'tool/generate_fmj_world_map.mjs'), 'utf8');
const fixed = new Function(parser.match(/const fixedLengths = new Map\([\s\S]*?\);/)[0] + '\nreturn fixedLengths;')();
function cLength(bytes, at) { const end=bytes.indexOf(0,at); if(end<at)throw Error('剧情字符串越界');return end-at+1; }
function argLength(bytes, op, at) {
  if (fixed.has(op)) return fixed.get(op);
  if ([13,64,69].includes(op)) return 2+cLength(bytes,at+2);
  if ([28,47,54].includes(op)) return cLength(bytes,at);
  if (op===61) return 4+cLength(bytes,at+4);
  if (op===31) { const n=cLength(bytes,at);return n+cLength(bytes,at+n)+2; }
  throw Error('未支持的剧情指令 '+op);
}
const maps=resources.filter(r=>r.kind===2).map(r=>{
  const width=binary[r.offset+16],height=binary[r.offset+17];
  if(r.offset+18+width*height*2>binary.length)throw Error('地图格子越界');
  return {id:`${r.type}:${r.index}`,name:string(binary,r.offset+3),type:r.type,index:r.index,width,height,tiles:binary[r.offset+2],cells:Array.from({length:width*height},(_,i)=>binary.readUInt16LE(r.offset+18+i*2))};
});
const tiles=resources.filter(r=>r.kind===7).map(r=>{
  const width=binary[r.offset+2],height=binary[r.offset+3],count=binary[r.offset+4],format=binary[r.offset+5];
  if(width!==16||height!==16||format!==1)throw Error('图块格式与当前引擎不一致');
  return {id:r.index,width,height,count,hex:binary.subarray(r.offset+6,r.offset+6+count*32).toString('hex')};
});
const objects=resources.filter(r=>r.kind===3&&[2,4].includes(r.type)).map(r=>({id:`${r.type}:${r.index}`,name:string(binary,r.offset+9),sprite:binary[r.offset+22],moving:r.type===2&&binary[r.offset+21]>0&&[2,3].includes(binary[r.offset+4])}));
const goods=resources.filter(r=>r.kind===6).map(r=>({id:`${r.type}:${r.index}`,name:string(binary,r.offset+6),event:binary.readUInt16LE(r.offset+132)}));
const scripts=resources.filter(r=>r.kind===1).map(r=>{
  const count=binary[r.offset+26],header=count*2+3,length=binary.readUInt16LE(r.offset+24);
  const events=Array.from({length:count},(_,i)=>binary.readUInt16LE(r.offset+27+i*2));
  const code=binary.subarray(r.offset+24+header,r.offset+24+length),commands=[];
  for(let p=0;p<code.length;){
    const op=code[p],at=p+1,size=argLength(code,op,at),a=[];let text;
    if(at+size>code.length)throw Error('剧情指令越界');
    if([13,61,64,69].includes(op)){const prefix=op===61?4:2;for(let i=0;i<prefix;i+=2)a.push(code.readUInt16LE(at+i));text=string(code,at+prefix);}
    else if([28,47,54].includes(op)){if(op===28)a.push(...code.subarray(at,code.indexOf(0,at)));else text=string(code,at);}
    else if(op===31){const first=cLength(code,at),second=cLength(code,at+first);text=[string(code,at),string(code,at+first)];a.push(code.readUInt16LE(at+first+second));}
    else for(let i=0;i<size;i+=2)a.push(code.readUInt16LE(at+i));
    commands.push({at:p+header,op,a,...(text===undefined?{}:{text})});p+=size+1;
  }
  const addresses=new Set(commands.map(c=>c.at));
  if(events.some(e=>e&&!addresses.has(e)))throw Error('事件入口不指向指令');
  return {id:`${r.type}:${r.index}`,events,commands,maps:[],name:commands.find(c=>c.op===54)?.text||`剧情 ${r.type}:${r.index}`};
});
const incoming=new Map();
for(const script of scripts){let map;for(const c of script.commands){if(c.op===1)map={mapId:c.a[0]+':'+c.a[1],x:c.a[2]+4,y:c.a[3]+3};if([14,66].includes(c.op)&&map){const id=c.a[0]+':'+c.a[1],rows=incoming.get(id)||[];if(!rows.some(r=>r.mapId===map.mapId&&r.x===map.x&&r.y===map.y))rows.push({...map});incoming.set(id,rows);}}}
for(const script of scripts){script.maps=[...new Set((incoming.get(script.id)||[]).map(r=>r.mapId))];if(!script.maps.length)script.maps=[...new Set(script.commands.filter(c=>c.op===1).map(c=>c.a.slice(0,2).join(':')))];}
const cityNames={9:'京城',10:'西夏',11:'大理',12:'扬州'};
const places={12:'马车行',13:'杂货铺',14:'客栈',15:'药局',16:'武师',17:'装备店',18:'镖局',19:'铁匠',20:'织女与猎人',21:'兵器铺',24:'衙门',25:'赌场',26:'民居一',27:'民居二',28:'民居三',29:'工匠',30:'裁缝'};
const schoolNames={7:'丐帮',8:'少林寺',9:'恒山派',10:'武当派',11:'古墓派',12:'全真教',13:'华山派',14:'灵鹫宫',15:'星宿派',16:'血刀门',17:'峨嵋派'};
for(const script of scripts)if(script.name.startsWith('剧情 ')){const [type,index]=script.id.split(':').map(Number);script.name=index<=5&&schoolNames[type]?schoolNames[type]+(index===1?'掌门阁':index===5&&type===13?'思过崖秘洞':'师叔阁 '+(index-1)):cityNames[type]&&places[index]?cityNames[type]+places[index]:type===1?'开场与角色选择':script.name;}
const outdoorMaps=maps.filter(m=>[2,3,4,9].includes(m.type)||m.type===5&&m.index<10).map(m=>m.id);
const skills=resources.filter(r=>r.kind===4).map(r=>({id:`${r.type}:${r.index}`,actors:[...new Set(scripts.flatMap(s=>s.commands.filter(c=>c.op===44&&c.a[1]===r.type&&c.a[2]===r.index).map(c=>c.a[0])))]}));
const data={version:1,gameId:'jyqxz',title:'金庸群侠传',sha256:hash,maps,tiles,objects,goods,skills,scripts,outdoorMaps,incoming:Object.fromEntries(incoming)};
// 地理关系由原事件构建，执行导航仍使用实时旗标与碰撞。
data.world=buildJyqxzWorld(data);
fs.writeFileSync(path.join(game,'js/guide-data.js'),'/* 从固定 JYQXZ ROM 生成，不可手改。 */\nwindow.FmjGuideData='+JSON.stringify(data)+';\n');
if(process.argv.includes('--export')){
  const css=fs.readFileSync(path.join(root,'assets/games/fmj/guide.css'),'utf8');
  const scripts=['js/guide-data.js','../fmj/js/guide-engine.js','js/quests.js','../fmj/js/guide-ui.js'].map(f=>fs.readFileSync(path.resolve(game,f),'utf8')).join('\n').replace(/<\/script/gi,'<\\/script');
  const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>金庸群侠传 · 游戏世界地图</title><style>'+css+'</style></head><body data-fmj-atlas="standalone"><script>'+scripts+'</script></body></html>';
  const output='/Users/xiongjian/Downloads/JYQXZ-金庸群侠传完整地图.html';fs.writeFileSync(output,html);console.log('已导出 '+output);
}
console.log(JSON.stringify({game:'jyqxz',maps:maps.length,scripts:scripts.length,objects:objects.length,goods:goods.length,sha256:hash}));
