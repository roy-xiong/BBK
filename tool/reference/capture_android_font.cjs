const fs = require('node:fs/promises');
const crypto = require('node:crypto');

// 只调用当前字模Hook，不调整游戏状态、字体设置、存档或资源版本。
(async()=>{
  const root=require('node:path').resolve(__dirname,'../..');
  const pages=await(await fetch('http://127.0.0.1:50716/json/list')).json();
  const page=pages.find(value=>value.url?.includes('/sgby/'));
  if(!page)throw new Error('三国霸业WebView不可用');
  const socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let next=1;const pending=new Map();
  socket.addEventListener('message',event=>{
    const value=JSON.parse(event.data);const request=pending.get(value.id);
    if(!request)return;pending.delete(value.id);clearTimeout(request.timer);
    if(value.error||value.result?.exceptionDetails)request.reject(new Error(JSON.stringify(value.error||value.result.exceptionDetails)));
    else request.resolve(value.result?.result?.value);
  });
  function evaluate(expression){return new Promise((resolve,reject)=>{
    const id=next++;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout'));},20000);
    pending.set(id,{resolve,reject,timer});
    socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true}}));
  });}
  try {
    const metadata=await evaluate('({scale:baye.data.g_scale,width:baye.data.g_screenWidth,height:baye.data.g_screenHeight,lib:localStorage.getItem("baye/libpath"),userAgent:navigator.userAgent,font:typeof baye.hooks.fontImageForChar,href:location.href})');
    if(metadata.scale!==4||metadata.width!==240||metadata.font!=='function')throw new Error('参考字体或资源版本不匹配');
    const table=await fs.readFile(root+'/assets/game/gbk_unicode.bin');
    const codes=Array.from({length:256},(_,i)=>i);
    for(let i=256;i<65536;i++)if(table.readUInt16LE(i*2)!==0)codes.push(i);
    codes.push(0xa2fd,0xa2fe);
    const chunks=[];const header=Buffer.alloc(8);header.write('SGFT');header.writeUInt16LE(1,4);header.writeUInt16LE(codes.length,6);chunks.push(header);
    for(let offset=0;offset<codes.length;offset+=128){
      const part=codes.slice(offset,offset+128);
      const result=await evaluate(`(()=>{const codes=${JSON.stringify(part)};return codes.map(code=>{const context={code};const result=baye.hooks.fontImageForChar(context);if(result!==0||!context.zmCode)throw new Error('字模采集失败 '+code);return {code,bytes:Array.from(context.zmCode)};});})()`);
      for(const glyph of result){
        const width=glyph.code<256?24:48;const length=width/8*48;
        if(glyph.bytes.length!==length)throw new Error('字模长度错误 '+glyph.code);
        const entry=Buffer.alloc(6);entry.writeUInt16LE(glyph.code,0);entry[2]=width;entry[3]=48;entry.writeUInt16LE(length,4);
        chunks.push(entry,Buffer.from(glyph.bytes));
      }
      if(offset%1280===0)console.log('font progress',Math.min(offset+part.length,codes.length)+'/'+codes.length);
    }
    const font=Buffer.concat(chunks);await fs.writeFile(root+'/assets/game/android_font48.bin',font);
    const manifest={date:'2026-10-22',device:'User-selected Android reference device',...metadata,count:codes.length,bytes:font.length,sha256:crypto.createHash('sha256').update(font).digest('hex'),supplementalCodes:['A2FD','A2FE'],source:'read-only invocation of the installed game fontImageForChar hook'};
    await fs.writeFile(root+'/tool/baseline/android_font_manifest.json',JSON.stringify(manifest,null,2)+'\n');
    console.log(JSON.stringify(manifest,null,2));
  } finally {socket.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
