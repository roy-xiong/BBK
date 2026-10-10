import assert from 'node:assert/strict';
import { engine, profile, data } from './audit_fmj_navigation.mjs';

const entries = new Map();
for(const script of data.scripts) {
  let p;
  for(const c of script.commands) {
    if(c.op===1)p={mapId:c.a.slice(0,2).join(':'),x:c.a[2]+4,y:c.a[3]+3};
    if(c.op===14&&p){const id=c.a.slice(0,2).join(':'),items=entries.get(id)||[];if(!items.some(i=>JSON.stringify(i)===JSON.stringify(p)))items.push({...p});entries.set(id,items);}
  }
}
const targets=[
  ['3:9',202,1],['4:1',203,42],['4:2',204,1],['5:13',208,1],['5:1',209,1],['5:15',210,1],
  ['4:8',215,43],['4:9',216,42],['3:11',217,1],['7:2',225,45],['9:5',226,43],['9:1',227,1],['9:4',227,1],
  ['9:13',232,45],['10:1',235,5],['10:2',236,42],['12:3',238,1],['10:1',239,6],['10:2',240,42],['10:1',241,6],
  ['13:2',243,1],['13:2',244,2],['13:2',245,43],['10:2',246,42],['11:1',247,1],['11:4',248,43],
  ['11:10',249,51],['11:10',250,2],['14:8',251,43],['14:8',252,1],['14:9',253,22],['14:11',254,1],['1:5',260,45],['2:18',261,17],
];
const failures=[],results=[];
for(const [id,flag,event] of targets) {
  const script=engine.scripts.get(id), entrances=(entries.get(id)||[]).filter(p=>script.maps.includes(p.mapId));
  for(const entrance of entrances) {
    let s=profile(id,entrance.mapId,entrance.x,entrance.y,flag,flag===253?[-1100]:[]);
    // 鬼王由夜城的城隍庙地图事件创建，不能拿“刚进入夜城”冒充听完线索的存档。
    if(id==='11:10'&&flag===250){s.flags[249]=false;s=engine.simulate(s,51,true).state;}
    const before=JSON.stringify(s),p=engine.route(s,{scriptId:id,event,allowBoundary:true});
    assert.equal(JSON.stringify(s),before,'目标规划不能修改真实剧情状态');
    if(p.unavailable)failures.push({id,name:script.name,event,entrance});
    else results.push({id,event,boundary:!!p.boundary,blockedAt:p.blockedAt});
  }
}
console.log(JSON.stringify({checked:results.length+failures.length,failures}));
assert.deepEqual(failures,[],'主线人物、机关或必须处理的道路节点存在遗漏');
const jianye=profile('7:2','2:22',12,14,225);
assert.equal(engine.nextGoal(jianye).event,45,'建业掌柜应定位到柜台，而不是客房门');
const ghost=profile('11:10','1:43',15,9,250);
assert.equal(engine.nextGoal(ghost).event,2,'酆都北行前必须获得鬼王的鹤鸣山线索');
assert.equal(engine.nextGoal(ghost).scriptId,'11:10');
assert.ok(engine.nextGoal(ghost).label.includes('开放北行道路'));
console.log('主线目标入口与真实交互位置审计通过。');
