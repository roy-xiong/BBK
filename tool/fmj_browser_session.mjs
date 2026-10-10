import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

/** 创建独立的原游戏浏览器，测试时钟加速仅作用于这个临时 Chrome 会话。 */
export async function createFmjBrowser({ accelerated=false }={}) {
  const assets=path.join(root,'assets/games'),exceptions=[];
  const server=http.createServer((req,res)=>{
    const name=path.resolve(assets,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!name.startsWith(assets+path.sep))return res.writeHead(403).end();
    fs.readFile(name,(error,bytes)=>{
      if(error)return res.writeHead(404).end();
      const type={'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(name)]||'application/octet-stream';
      res.writeHead(200,{'Content-Type':type+'; charset=utf-8'}).end(bytes);
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const profile=fs.mkdtempSync('/tmp/fmj-flow-audit-');
  const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
    '--headless','--disable-gpu','--no-first-run','--disable-background-networking',
    '--disable-component-update','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
  ],{stdio:'ignore'});
  let socket;
  try {
    let port;
    for(let i=0;i<100;i++){
      try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break}catch{}
      await delay(50);
    }
    if(!port)throw Error('Chrome 调试端口启动失败');
    const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});
    let id=0;const pending=new Map();
    socket.onmessage=event=>{
      const data=JSON.parse(event.data);
      if(data.method==='Runtime.exceptionThrown')exceptions.push(data.params.exceptionDetails);
      if(data.method==='Page.javascriptDialogOpening'){
        exceptions.push({message:data.params.message,type:data.params.type});
        socket.send(JSON.stringify({id:++id,method:'Page.handleJavaScriptDialog',params:{accept:true}}));
      }
      const request=pending.get(data.id);if(!request)return;
      pending.delete(data.id);clearTimeout(request.timer);
      if(data.error)request.reject(Error(JSON.stringify(data.error)));else request.resolve(data.result);
    };
    const cdp=(method,params={},timeout=120000)=>new Promise((resolve,reject)=>{
      const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error(method+' 超时'))},timeout);
      pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params}));
    });
    const evaluate=async expression=>{
      const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
      if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
      return r.result.value;
    };
    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`window.__fmjAuditNotices=[];window.BbkSystemChannel={postMessage(message){try{window.__fmjAuditNotices.push(JSON.parse(message))}catch{window.__fmjAuditNotices.push(message)}}};`});
    if(accelerated)await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
      const timeout=window.setTimeout.bind(window),interval=window.setInterval.bind(window);
      window.setTimeout=(callback,ms,...args)=>timeout(callback,Math.max(4,ms/10),...args);
      window.setInterval=(callback,ms,...args)=>interval(callback,Math.max(4,ms/10),...args);
      let seed=98361;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
    })()`});
    await cdp('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/fmj/index.html?graphics=classic'});
    for(let i=0;i<100;i++){if(await evaluate('!!window.FmjGuide'))break;await delay(50)}
    await evaluate(`window.__fmjAuditNotices=window.__fmjAuditNotices||[];window.BbkSystemChannel={postMessage(message){try{window.__fmjAuditNotices.push(JSON.parse(message))}catch{window.__fmjAuditNotices.push(message)}}};`);
    if(accelerated)await evaluate('window.sysDrawScreen=function(){};');
    return {evaluate,cdp,exceptions,profile,close(){socket.close();chrome.kill('SIGTERM');server.close()}};
  } catch(error){socket?.close();chrome.kill('SIGTERM');server.close();throw error}
}
