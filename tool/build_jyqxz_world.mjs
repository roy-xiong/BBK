import fs from 'node:fs';
import vm from 'node:vm';

/**
 * 按本 ROM 的真实 loadmap→startchapter 出入口构建世界图，保持 16px 等比例。
 * 所有旗标变体只用于离线发现地理连接；执行寻路继续使用玩家真实存档条件。
 * 模板复用按脚本身份区分；闭环坐标冲突标记为跨层连接，不捏造道路。
 * @param {Object} data 已解析的金庸原版资源。
 * @return {Object} 外景区域、房屋、入口和未引用地图。
 */
export function buildJyqxzWorld(data){
  const context={window:{}};vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../assets/games/fmj/js/guide-engine.js',import.meta.url),'utf8'),context);
  const engine=new context.window.FmjGuideEngine(data),nodes=new Map(),edges=new Map();
  const schools=[0,101,151,171,181,191,192,193,194,195,196,197];
  for(const school of schools)for(const phase of [0,3,6,9]){
    const flags=Array(2401).fill(false);flags[[194,195,196,197].includes(school)?2:1]=true;
    if(school)flags[school]=true;for(let n=0;n<phase;n++)flags[1001+n]=true;
    for(const script of data.scripts)for(const entry of data.incoming[script.id]||[]){
      const seed={...entry,scriptId:script.id,flags:flags.slice(),vars:Array(240).fill(0),npcs:[]};
      const initialized=engine.simulate(seed,0,'atlas').state,map=engine.maps.get(initialized.mapId);if(!map||initialized.scriptId!==script.id)continue;
      const id=script.id+'/'+map.id;
      if(!nodes.has(id))nodes.set(id,{id,mapId:map.id,type:map.type,scriptId:script.id,scriptIds:[script.id],name:script.name,width:map.width,height:map.height,npcs:initialized.npcs,navFlags:null});
      const exits=new Map();map.cells.forEach((cell,i)=>{const event=(cell>>8)+40;if(cell>>8&&!exits.has(event))exits.set(event,{event,x:i%map.width,y:Math.floor(i/map.width)});});
      initialized.npcs.forEach(n=>{if(script.transferEvents.has(n.id))exits.set(n.id,{event:n.id,x:n.x,y:n.y});});
      for(const exit of exits.values()){
        const state=engine.copy(initialized);state.x=exit.x;state.y=exit.y;
        const result=engine.simulate(state,exit.event,'atlas'),targetMap=engine.maps.get(result.state.mapId);
        if(!result.stable||!targetMap)continue;
        const to=result.state.scriptId+'/'+targetMap.id;if(to===id)continue;
        const key=id+'>'+to+'/'+exit.event;
        if(!edges.has(key))edges.set(key,{from:id,to,source:{x:exit.x,y:exit.y},landing:{x:result.state.x,y:result.state.y},event:exit.event,kind:engine.isOutdoor(map)&&engine.isOutdoor(targetMap)?'road':'entrance'});
      }
    }
  }
  const allEdges=[...edges.values()].filter(e=>nodes.has(e.to)),adjacency=new Map([...nodes.keys()].map(id=>[id,[]]));
  allEdges.filter(e=>e.kind==='road').forEach(e=>{adjacency.get(e.from).push(e);adjacency.get(e.to).push({...e,from:e.to,to:e.from,source:e.landing,landing:e.source});});
  const placed=new Map(),components=[];
  for(const seed of nodes.values()){
    if(!data.outdoorMaps.includes(seed.mapId)||placed.has(seed.id))continue;
    const component={id:'land-'+components.length,nodes:[],links:[],conflicts:[]},queue=[{id:seed.id,x:0,y:0}];components.push(component);
    for(let i=0;i<queue.length;i++){
      const p=queue[i];if(placed.has(p.id))continue;
      const node={...nodes.get(p.id),x:p.x,y:p.y,component:component.id};placed.set(p.id,node);component.nodes.push(node);
      for(const edge of adjacency.get(p.id)){
        const next={id:edge.to,x:node.x+edge.source.x-edge.landing.x,y:node.y+edge.source.y-edge.landing.y};
        if(!placed.has(next.id))queue.push(next);
        else{const actual=placed.get(next.id);if(Math.abs(actual.x-next.x)>3||Math.abs(actual.y-next.y)>3)component.conflicts.push({edge,error:[actual.x-next.x,actual.y-next.y]});}
      }
    }
  }
  const links=allEdges.map(e=>({...e,fromComponent:placed.get(e.from)?.component,toComponent:placed.get(e.to)?.component}));
  components.forEach(c=>{c.links=links.filter(e=>e.fromComponent===c.id&&e.toComponent===c.id);});
  return {version:1,unit:16,main:components.slice().sort((a,b)=>b.nodes.length-a.nodes.length)[0]?.id,components,links,interiors:[...nodes.values()].filter(n=>!data.outdoorMaps.includes(n.mapId)),unusedMaps:data.maps.filter(m=>![...nodes.values()].some(n=>n.mapId===m.id)).map(m=>m.id)};
}
