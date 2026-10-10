import fs from 'node:fs';
import vm from 'node:vm';

/**
 * 从原脚本条件和出口构建真实场景实例；同一桥梁/道路底图在世界中可出现多次。
 * 坐标保持原格距，场景不旋转。建筑门和洞口作为分层入口，不伪造其跨层距离。
 */
export function buildWorldAtlas(data) {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../assets/games/fmj/js/guide-engine.js', import.meta.url), 'utf8'), context);
  const engine = new context.window.FmjGuideEngine(data);
  const roads = new Set(data.scripts.filter(s => s.commands.some(c => c.op === 11 && c.a[0] >= 100 && c.a[0] <= 113)).map(s => s.id));
  const incoming = new Map();
  for (const script of data.scripts) {
    let position;
    for (const c of script.commands) {
      if (c.op === 1) position = { mapId: c.a.slice(0,2).join(':'), x: c.a[2] + 4, y: c.a[3] + 3 };
      if (c.op === 14 && position) {
        const id = c.a.slice(0,2).join(':'), entries = incoming.get(id) || [];
        if (!entries.some(p => JSON.stringify(p) === JSON.stringify(position))) entries.push({ ...position });
        incoming.set(id, entries);
      }
    }
  }
  const identity = state => {
    const script = engine.scripts.get(state.scriptId), map = engine.maps.get(state.mapId);
    const name = script.commands.find(c=>c.op===54)?.text || map.name;
    // 白天/夜间与主线回访属于同一座城；“台子”等同名模板仍按脚本区分位置。
    return ['1:1','1:23','1:43'].includes(map.id) ? map.id + '/' + name :
      state.scriptId + '/' + state.mapId + '/' + (roads.has(state.scriptId) ? state.flags.slice(100,114).map(Number).join('') : name);
  };
  const nodes = new Map(), edges = new Map(), queue = [], visited = new Set();
  const base = [19,21,25,31,2000,2001];
  const story = [202,203,204,208,209,210,215,216,217,218,219,220,221,224,225,226,227,228,229,231,232,233,234,235,236,237,238,239,240,241,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257,258,259];
  const phases = [215,216,217,219,224,234,238,246,260];
  const add = (state, phase) => {
    const map = engine.maps.get(state.mapId), script = engine.scripts.get(state.scriptId);
    if (!map || !script) return null;
    const id = identity(state);
    if (!nodes.has(id)) nodes.set(id, { id, mapId: map.id, type:map.type, scriptId: script.id, name: script.commands.find(c=>c.op===54)?.text || map.name,
      scriptIds:[],navFlags: roads.has(script.id) ? state.flags.slice(100,114).map(Number).join('') : null, width: map.width, height: map.height,
      npcs:state.npcs.map(n=>({...n})) });
    if(!nodes.get(id).scriptIds.includes(script.id))nodes.get(id).scriptIds.push(script.id);
    const key = id + '/' + phase + '/' + engine.key(state);
    if (!visited.has(key)) { visited.add(key); queue.push({ id, state, phase }); }
    return id;
  };
  for (const phase of phases) {
    const flags = Array(2401).fill(false);
    [...base, ...story.filter(f=>f<phase)].forEach(f=>flags[f]=true);
    for (let f=1000;f<1200;f++) flags[f]=true;
    for (const script of data.scripts) {
      if (script.id === '1:2') continue;
      if (roads.has(script.id) && !['2:1','2:32'].includes(script.id)) continue;
      for (const entrance of incoming.get(script.id) || []) {
        if (engine.maps.get(entrance.mapId)?.type !== 1 || entrance.x < 4 || entrance.y < 3) continue;
        const seed = { ...entrance, scriptId: script.id, flags: flags.slice(), vars:Array(240).fill(0), npcs:[] };
        const initialized = engine.simulate(seed,0,'atlas');
        if (initialized.state.mapId === seed.mapId && (initialized.stable || script.maps.length===1)) add(initialized.state,phase);
      }
    }
    const start = engine.simulate({scriptId:'2:1',mapId:'1:1',x:5,y:6,flags:flags.slice(),vars:Array(240).fill(0),npcs:[]},0,'atlas');
    if (start.stable) add(start.state,phase);
  }
  for (let head=0;head<queue.length && head<15000;head++) {
    const {state,id,phase}=queue[head], sourceMap=engine.maps.get(state.mapId), exits=new Map();
    // 世界地图包括尚未开放的出口，地理关系不能由当前剧情或站位裁掉。
    // 执行导航仍使用实时 flood，此处只是离线读取原事件绑定。
    sourceMap.cells.forEach((cell,i)=>{if(cell>>8 && !exits.has((cell>>8)+40))exits.set((cell>>8)+40,{event:(cell>>8)+40,x:i%sourceMap.width,y:Math.floor(i/sourceMap.width)})});
    for(const npc of state.npcs)if(engine.scripts.get(state.scriptId).transferEvents.has(npc.id))exits.set(npc.id,{event:npc.id,x:npc.x,y:npc.y,object:true});
    for (const exit of exits.values()) {
      const input=engine.copy(state);input.x=exit.x;input.y=exit.y;
      const result=engine.simulate(input,exit.event,'atlas');
      if (!result.stable) continue;
      const target=add(result.state,phase);
      if (!target || target===id) continue;
      const points=[];
      if(exit.object)points.push({x:exit.x,y:exit.y});
      else sourceMap.cells.forEach((cell,i)=>{if((cell>>8)+40===exit.event) points.push({x:i%sourceMap.width,y:Math.floor(i/sourceMap.width)})});
      const source=points.reduce((a,p)=>({x:a.x+p.x/points.length,y:a.y+p.y/points.length}),{x:0,y:0});
      const distances=[source.y-3,sourceMap.width-5-source.x,sourceMap.height-3-source.y,source.x-4];
      const direction=distances.indexOf(Math.min(...distances));
      const boundary=Math.min(...distances)<=1;
      const targetMap=engine.maps.get(result.state.mapId), targetDistances=[result.state.y-3,targetMap.width-5-result.state.x,targetMap.height-3-result.state.y,result.state.x-4];
      const opposite=(direction+2)%4;
      const kind=sourceMap.type!==1||targetMap.type!==1 ? 'room' : ['1:24','1:36'].includes(sourceMap.id)||['1:24','1:36'].includes(targetMap.id) ? 'entrance' : 'road';
      const key=id+'>'+target+'/'+exit.event;
      if(!edges.has(key))edges.set(key,{from:id,to:target,source,landing:{x:result.state.x,y:result.state.y},event:exit.event,direction,kind});
    }
  }
  const allEdges=[...edges.values()];
  const roadEdges=allEdges.filter(e=>e.kind==='road'), placed=new Map(), components=[];
  const reverse=e=>({...e,from:e.to,to:e.from,source:e.landing,landing:e.source,direction:(e.direction+2)%4});
  const adjacency=new Map([...nodes.keys()].map(id=>[id,[]]));
  roadEdges.forEach(e=>{adjacency.get(e.from).push(e);adjacency.get(e.to).push(reverse(e));});
  for(const seed of nodes.values()) {
    if(seed.type!==1)continue;
    if(placed.has(seed.id))continue;
    const component={id:'land-'+components.length,nodes:[],links:[],conflicts:[]}, todo=[{id:seed.id,x:0,y:0}];components.push(component);
    for(let i=0;i<todo.length;i++) {
      const pos=todo[i];if(placed.has(pos.id))continue;
      const node={...nodes.get(pos.id),x:pos.x,y:pos.y,component:component.id}; placed.set(pos.id,node);component.nodes.push(node);
      for(const e of adjacency.get(pos.id)) {
        const target=nodes.get(e.to), next={id:e.to,x:node.x+e.source.x-e.landing.x,y:node.y+e.source.y-e.landing.y};
        if(!placed.has(e.to))todo.push(next);
        else {
          const p=placed.get(e.to);
          if(Math.abs(p.x-next.x)>3||Math.abs(p.y-next.y)>3)component.conflicts.push({edge:e,error:[p.x-next.x,p.y-next.y]});
        }
      }
    }
  }
  // 相邻大区域有真实建筑入口时将其挂到入口上，作为单独层打开；不把它随意扔到右边。
  const links=allEdges.map(e=>({...e,fromComponent:placed.get(e.from)?.component,toComponent:placed.get(e.to)?.component}));
  components.forEach(c=>{c.links=links.filter(e=>e.fromComponent===c.id && e.toComponent===c.id);});
  const used=new Set([...nodes.values()].map(n=>n.mapId));
  return {version:1,unit:16,main:components.sort((a,b)=>b.nodes.length-a.nodes.length)[0]?.id,
    components,links,interiors:[...nodes.values()].filter(n=>n.type!==1),unusedMaps:data.maps.filter(m=>!used.has(m.id)).map(m=>m.id)};
}

if(process.argv.includes('--inspect')) {
  const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../assets/games/fmj/js/guide-data.js',import.meta.url),'utf8'),context);
  const world=buildWorldAtlas(context.window.FmjGuideData);
  console.log(JSON.stringify({main:world.main,components:world.components.map(c=>({id:c.id,nodes:c.nodes.length,conflicts:c.conflicts.length,names:c.nodes.filter(n=>!n.navFlags).map(n=>n.name)})),links:world.links.length,unused:world.unusedOutdoorMaps}));
}
