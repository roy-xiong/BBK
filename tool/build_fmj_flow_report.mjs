import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

const folder=path.join(os.tmpdir(),'bbk-fmj-flow-audit');
const runs=['complete','complete-alternative'].map(name=>JSON.parse(fs.readFileSync(`${folder}/full-flow-${name}.json`,'utf8')));
if(runs.some(run=>run.issues.length||!run.records.some(record=>record.type==='ending')))throw Error('连续回放未通过，不能发布完成报告');
const context={window:{}};
for(const name of ['guide-data','guide-engine','quest-engine'])vm.runInNewContext(fs.readFileSync(`assets/games/fmj/js/${name}.js`,'utf8'),context);
const data=context.window.FmjGuideData,engine=new context.window.FmjGuideEngine(data);
const esc=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const findings=[
  ['李府客厅路线搜索耗尽','无效果地图事件因走到出口旁而被误判为状态变化，重复入队占满搜索预算。','比较事件真正执行前后的状态，并在入队前去重；保留真机装备状态的回归用例。'],
  ['原路线遇到游人会持续撞人','计算路线后，三清宫、石梦城等处游人进入路径。','逐格核对实时碰撞；遇到变化重新寻路，仍使用原方向键行走。'],
  ['走动的目标人物占据旧落点','南北村等城镇人物走动，预测的交互位置过期。','到达时按人物实际位置重算相邻道路与朝向。'],
  ['建筑门口被路人临时挡住','跨图路线沿用旧门口，或者只重算当前路径仍不可达。','重新选择实际入口的接近点，必要时重算全部合法转场路线。'],
  ['狭窄道路或箱子后方被行人封住','白水镇取卡片后，游人可能堵住离开当前区域的唯一道路。','只读判断动态阻挡；用正常方向键让出空间、等待行人自然移开并继续规划，方向键可中断。等待最长一分钟，持续不通会明确停止。'],
  ['镇长许可后仍进不去老宅','取得许可 227 不等于门口守卫已移动；还需事件 229。','补上找老宅门口镇长放行的独立目标，不提前移动守卫。'],
  ['老宅井口尚未显露却直接去井下','原版必须先调查主房，设置事件 230，才出现井口交互对象。','补上主房调查，再通过枯井迷宫去摄魂阵。'],
  ['寻女支线入口有隐藏前置','蔡婆婆家的门须经东东 205 → 阿霞 206 才开放。','完整模式按顺序补齐线索、委托、金色钥匙开门、救人和答谢。'],
  ['导航仅覆盖主线','情书、钱袋、老王去留、密道宝库和卡片任务未成为当前目标。','新增完整模式、20 个支线/分支节点、逐项前往按钮；保留仅主线模式。'],
  ['互斥与无完成标记的支线无法准确显示','老王的两条分支互斥；愚人居原脚本部分成功分支没有完成标记。','记录已选分支；未选路线单独标明。新增记录在原事件执行到结束节点后写入原存档的空闲标记区，读档同步恢复。'],
  ['南方小鬼误扣另一张卡片','原 ROM 在 2:52 / 1072 扣除 14:7 不点卡片，而奖励目标是 14:6 小鬼卡片。','仅替换已匹配该地址、指令和参数的物品消费操作，保留原分支、法术奖励与后续对白。'],
  ['万能钥匙不足以全开五处箱子','所有原脚本只奖励 3 把，全部商店没有出售万能钥匙。','显示余量和共同预算；每次开锁仍弹原选择框，取消则暂缓，可在支线列表重新选择。钥匙不足明确列出。'],
  ['有些支线会错过时机','蛇妖复命后未问东东会失去早期寻女线索；袁姑娘离队后不能完成其在紫瞳魔灯事件中的故事。','新游戏的完整模式优先安排这些节点；旧档错过的节点显示具体原因。'],
  ['快读对白会误选默认分支','连续确认可能落在刚出现的选择操作上。','弹窗暂停帧循环；点选选项，或先按方向键选定再确认。连续确认不自动决定新弹窗。'],
  ['选择位置与 ROM 地址不一致','选择构造器使用去掉事件表后的偏移。','加回事件表长度，准确识别取消开箱、老王及结局的分支。'],
  ['结局完成过早','刚开始“妖魔立即消失”时就被标记结束，后面还有“若干年后”的尾声。','直到原脚本播放完尾声、执行结束指令才记完成。'],
  ['失败提示把所有问题都说成缺引路石','普通城镇或任务路线不可达时也显示迷宫道具提示。','任务路线提示对应目标与道路/剧情条件；引路石说明只用于出口任务。']
  ,['白水镇晚期旧档被早期支线卡住','完整流程模式会把已经错过的情书、李府老王等早期支线重新排在白水镇后期主线之前，导致真实路线不可达。','为有明确剧情窗口的支线增加阶段边界；旧档显示“已错过”，主线继续前往南北村。']
];
const extra=engine.questTasks({flags:Array(2401).fill(false),goods:{},scriptId:'1:1'});
const locks=context.window.FmjQuests.keyLocks;
const keyRows=locks.map(lock=>`<tr><td>${esc(lock.label)}</td><td>${esc(lock.scriptId)}</td><td>${lock.expires?'袁姑娘离队前优先处理':'随对应剧情道路开放'}</td></tr>`).join('');
const runCards=runs.map((run,index)=>`<article><h3>路线 ${index+1}：${index?'紫瞳魔灯 + 不点卡片 + 观星亭':'虫子卡片 + 紫瞳魔灯 + 小鬼卡片'}</h3><p>${run.records.filter(r=>r.type==='navigation').length} 次真实导航，${run.records.filter(r=>r.type==='choice').length} 次原选择回应；到尾声结束，未检出剩余阻断或 JavaScript 异常。</p><details><summary>查看逐步目标与分支</summary><ol>${run.records.filter(r=>['navigation','choice','equipment','ending'].includes(r.type)).map(r=>`<li>${esc(r.type==='navigation'?`${r.goal.label}（${r.state.script}）`:r.type==='choice'?`${r.options.join(' / ')} → ${r.options[r.selected]}`:r.type==='equipment'?`装备：${r.item}`:'原版尾声已结束')}</li>`).join('')}</ol></details></article>`).join('');
const questRows=extra.map(q=>`<tr><td>${esc(q.label)}</td><td>${esc(q.detail)}</td><td>${esc(runs[0].quests.find(r=>r.id===q.id)?.statusLabel)}</td><td>${esc(runs[1].quests.find(r=>r.id===q.id)?.statusLabel)}</td></tr>`).join('');
const branches=data.scripts.flatMap(s=>s.commands.filter(c=>c.op===31).map(c=>({scene:s.name,script:s.id,...c})));
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>伏魔记 · 全流程导航检查与支线攻略</title><style>
:root{color-scheme:dark;--bg:#0c121c;--panel:#162232;--text:#e5edf7;--muted:#a5b6c9;--line:#31415a;--accent:#73dcc6}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.8 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}main{max-width:1150px;margin:auto;padding:45px 24px 80px}h1{font-size:32px;line-height:1.3}h2{margin-top:42px;font-size:23px;color:var(--accent)}h3{font-size:18px}p{color:var(--muted)}a{color:var(--accent)}article,.note{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px 22px;margin:14px 0}.note{border-left:4px solid var(--accent)}.table{overflow:auto}table{border-collapse:collapse;width:100%;min-width:640px}th,td{padding:12px 14px;border:1px solid var(--line);text-align:left;vertical-align:top}th{background:#203246}td{color:var(--muted)}summary{cursor:pointer;color:var(--accent)}li{margin-bottom:7px}code{background:#25354a;padding:2px 5px;border-radius:4px}footer{font-size:13px;color:var(--muted);margin-top:35px}@media(max-width:600px){main{padding:25px 16px}h1{font-size:26px}article{padding:14px}}
footer{overflow-wrap:anywhere}
</style></head><body><main><h1>伏魔记：全流程导航检查与支线攻略</h1><p>2026-10-09 · 基于本项目原 ROM · ${data.maps.length} 张地图 / ${data.scripts.length} 个脚本</p>
<div class="note">默认流程已包含主线和支线。自动行走使用原方向键及 105 毫秒重复间隔，遇到对话、战斗和机关交还控制；剧情分支由玩家在弹窗选择。所有道路和道具条件继续遵守原游戏。</div>
<h2>怎样走完整流程</h2><p>游戏控制区的“一键前往当前目标”与地图面板共用同一规划。地图面板的“完整流程：主线 + 支线”会优先补齐当前阶段可做的支线。暂缓的开箱可在支线列表重新前往；已完成、未选分支、钥匙不足和错过时机分别显示。</p><p>这份清单包含故事支线、卡片任务及李府密道宝库；普通药品/装备宝箱不是单独的故事节点，可通过完整等比例地图按需探索。</p>
<h2>万能钥匙的原版限制</h2><p>老孟 → 建业阿军的情书任务奖励 3 把万能钥匙；下面 5 处每处消耗 1 把，原商店均不出售。单局无法同时全开，需要玩家决定分配。两组电脑回放覆盖了五处箱子及三条卡片互动。</p><div class="table"><table><thead><tr><th>地点与任务</th><th>原脚本</th><th>时机</th></tr></thead><tbody>${keyRows}</tbody></table></div>
<h2>发现的问题与处理</h2>${findings.map((f,i)=>`<article><h3>${i+1}. ${esc(f[0])}</h3><p>${esc(f[1])}</p><div>${esc(f[2])}</div></article>`).join('')}
<h2>支线节点与两组回放结果</h2><div class="table"><table><thead><tr><th>故事节点</th><th>条件 / 分支</th><th>路线 1</th><th>路线 2</th></tr></thead><tbody>${questRows}</tbody></table></div>
<h2>原版全部二选一入口</h2><p>共 ${branches.length} 处；全部接入原指令的选择弹窗。另用三选一菜单验证了多项选择和取消的原返回变量。</p><div class="table"><table><thead><tr><th>地点</th><th>选项</th><th>脚本 / 地址</th></tr></thead><tbody>${branches.map(b=>`<tr><td>${esc(b.scene)}</td><td>${esc(b.text.join(' / '))}</td><td>${esc(b.script)} / ${b.at}</td></tr>`).join('')}</tbody></table></div>
<h2>电脑验证记录</h2><p>两组从新游戏到原版尾声结束的实际引擎回放，使用原存档检查点续跑。导航、地图切换、奖励、原剧情条件与支线消费由原引擎执行；测试会话加速时钟，关闭随机遭遇，并临时启用无敌/一击必杀来压缩战斗时间，未改手机存档。此验证确认导航及剧情衔接，不是战斗平衡或所有随机巡逻组合的穷举。</p>${runCards}<p>专项回归：120 个主线交互入口；29 个迷宫场景、44 个真实入口；李府装备后路线；NPC 阻挡与等比例格子；手机尺寸下的选项触摸、连续确认保护、过期回应拒绝、多项菜单取消；小鬼/不点两卡不互扣；支线标记的原存档读写恢复。</p>
<h2>配套地图与故事</h2><p><a href="伏魔记-完整等比例地图.html">完整等比例地图</a> · <a href="伏魔记-完整故事节点流程.html">完整故事节点流程</a>。地图包含房屋、洞穴、迷宫，地图内一格一步，横纵比例一致，可缩放及测距；独立图层间的排版距离不代表游戏步数。</p><footer>原 ROM SHA-256：${esc(data.sha256)}。本轮未使用 IDE，也未自动编译或安装手机应用。</footer></main></body></html>`;
const output='/Users/xiongjian/Downloads/伏魔记-全流程导航检查与支线攻略.html';
fs.writeFileSync(output,html);
console.log(output);
