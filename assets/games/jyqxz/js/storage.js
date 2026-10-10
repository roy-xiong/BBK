;(function(global){
    'use strict';
    var prefix='jyqxz:', memory=Object.create(null);
    global.BbkRpgGameId='jyqxz';
    /**
     * 保存键与 FMJ 共用的 sav/* 隔离；后端失效时保留本局内存并通知 Flutter 镜像。
     * 只接受本游戏存档键，不读取未命名空间化的旧 FMJ 数据。
     * @param {string} path 引擎逻辑键。
     * @param {string} value 原引擎序列化值。
     */
    function set(path,value){
        if(typeof path!=='string'||!path.startsWith('sav/')||typeof value!=='string')return;
        memory[path]=value;
        try{global.localStorage.setItem(prefix+path,value);}catch(_){}
        if(global.BbkSaveChannel)global.BbkSaveChannel.postMessage(JSON.stringify({entries:{[path]:value}}));
        return value;
    }
    function get(path){
        if(Object.prototype.hasOwnProperty.call(memory,path))return memory[path];
        try{return global.localStorage.getItem(prefix+path);}catch(_){return null;}
    }
    function exportState(){
        var entries=Object.assign({},memory);
        try{for(var i=0;i<global.localStorage.length;i++){var key=global.localStorage.key(i);if(key&&key.startsWith(prefix+'sav/'))entries[key.slice(prefix.length)]=global.localStorage.getItem(key);}}catch(_){}
        return entries;
    }
    global.JyqxzStorage={get:get,set:set,export:exportState,install:function(){
        var read=global.sysStorageGet,write=global.sysStorageSet,has=global.sysStorageHas;
        global.sysStorageGet=function(path){return path.startsWith('sav/')?get(path):read(path);};
        global.sysStorageSet=function(path,value){return path.startsWith('sav/')?set(path,value):write(path,value);};
        global.sysStorageHas=function(path){return path.startsWith('sav/')?get(path)!=null:has(path);};
    }};
    try{
        var xhr=new XMLHttpRequest();xhr.open('GET','/__state__/jyqxz',false);xhr.send(null);
        if(xhr.status===200){var state=JSON.parse(xhr.responseText);Object.keys(state.entries||{}).forEach(function(key){
            if(key==='bbk/jyqxz_controls'&&typeof state.entries[key]==='string'){try{global.localStorage.setItem(key,state.entries[key]);}catch(_){}}
            else set(key,state.entries[key]);
        });}
    }catch(_){}
    global.addEventListener('pagehide',function(){if(global.BbkSaveChannel)global.BbkSaveChannel.postMessage(JSON.stringify({entries:exportState()}));});
})(window);
