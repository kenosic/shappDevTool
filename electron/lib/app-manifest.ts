/**
 * app-manifest — 内联副本（原位于 @shapp/app-manifest）
 *
 * 此文件由原 src/packages/app-manifest/src/index.ts 内联而来，
 * 使 devTool 可脱离 monorepo 独立运行，无需 workspace 依赖。
 */

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export type AppManifest = {
  id: string;
  name: string;
  version: string;
  title?: string;
  description?: string;
  /** 游戏引擎类型，目前支持 "cocos" | "unity" */
  engine?: string;
  /** 运行时标识符，例如 "mars@1.0" */
  runtime?: string;
  entry?: {
    frontend?: string;
    backend?: string;
    /** 管理员前端入口（可选）。仅应用发布者可访问，由平台在 /a/:appId/__admin/* 下提供服务。 */
    admin?: string;
  };
  /**
   * 前端资源根目录（相对于包根目录）。
   * Cocos 构建输出通常为 "build/web-mobile"；Vite 通常为 "dist"。
   * devTool 与 hosting-api 均依据此字段定位入口文件与资源路径。
   */
  webPreview?: string;
  /** 应用图标图片路径（相对于 ZIP 根目录），推荐正方形图片，512×512 px */
  logo?: string;
  capabilities?: string[];
  permissions?: { scope: string; reason?: string }[];
  platform?: {
    sdk_version?: string;
    platform_version?: string;
  };
};

// ─── MIME 类型 ────────────────────────────────────────────────────────────────

/**
 * 文件扩展名 → Content-Type 映射（键为不含点的小写扩展名）。
 */
export const MIME_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  mjs: "application/javascript; charset=utf-8",
  cjs: "application/javascript; charset=utf-8",
  ts: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  jsonc: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml",
  wasm: "application/wasm",
  pdf: "application/pdf",
};

/**
 * 根据文件名或路径返回 Content-Type。
 * 未知扩展名返回 "application/octet-stream"。
 */
export function getMimeType(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return "application/octet-stream";
  const ext = filename.slice(dot + 1).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

// ─── SPA 回退逻辑 ─────────────────────────────────────────────────────────────

/**
 * 判断请求路径是否应该走 SPA 回退（返回 index.html）。
 *
 * 规则：
 *   - 无扩展名路径                 → SPA 路由，走回退
 *   - 扩展名为 .html / .htm       → 走回退
 *   - JS / CSS / JSON / 图片等    → 不走回退，直接返回 404
 */
export function shouldSpaFallback(urlPath: string): boolean {
  const dot = urlPath.lastIndexOf(".");
  if (dot === -1) return true;
  const ext = urlPath.slice(dot + 1).toLowerCase();
  return ext === "html" || ext === "htm";
}

// ─── Cocos 结构校验 ───────────────────────────────────────────────────────────

/**
 * 检查 Cocos Web 构建输出是否包含必须的内置资源包。
 *
 * @param webPreviewDir  前端资源根目录绝对路径（或 ZIP 内前缀路径）
 * @param fileExists     文件存在性检测回调，支持 Node.js（existsSync）和 ZIP Set（set.has）
 * @returns 如果缺少内置资源包返回错误描述字符串，否则返回 null
 */
export function checkCocosBundle(
  webPreviewDir: string,
  fileExists: (path: string) => boolean,
): string | null {
  const base = webPreviewDir.replace(/\/+$/, "");
  const hasInternal =
    fileExists(`${base}/assets/internal/config.json`) ||
    fileExists(`${base}/assets/internal/index.js`);
  if (!hasInternal) {
    return (
      `Cocos 引擎应用在 "${base}" 下缺少内置资源包（assets/internal/config.json 或 assets/internal/index.js），` +
      `请确认使用完整的 Cocos Web 构建输出（web-mobile / web-desktop），assets/internal/ 目录不可缺少`
    );
  }
  return null;
}

// ─── MARS 运行时引导脚本 ──────────────────────────────────────────────────────

/**
 * 注入到 HTML 页面 </head> 之前的运行时引导脚本。
 *
 * 功能：
 *   1. crypto.randomUUID 兼容性 polyfill
 *   2. localStorage / sessionStorage shim
 *   3. window.__marsTransport（PostMessage RPC 传输层）
 */
export const MARS_BOOTSTRAP_SCRIPT = `<script>(function(){
if(typeof crypto!=='undefined'&&typeof crypto.randomUUID!=='function'){
crypto.randomUUID=function(){
if(typeof crypto.getRandomValues==='function'){
var b=new Uint8Array(16);crypto.getRandomValues(b);
b[6]=(b[6]&0x0f)|0x40;b[8]=(b[8]&0x3f)|0x80;
var h=[];for(var i=0;i<16;i++)h.push(('0'+b[i].toString(16)).slice(-2));
return h[0]+h[1]+h[2]+h[3]+'-'+h[4]+h[5]+'-'+h[6]+h[7]+'-'+h[8]+h[9]+'-'+h[10]+h[11]+h[12]+h[13]+h[14]+h[15];
}return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return(c==='x'?r:(r&0x3|0x8)).toString(16);});
};
}
(function(){
function makeShim(relay){
var s=Object.create(null);
function send(msg){if(relay)try{window.parent.postMessage(JSON.stringify(msg),'*');}catch(e){}}
return{
getItem:function(k){var v=s[String(k)];return v===undefined?null:v;},
setItem:function(k,v){s[String(k)]=String(v);send({type:'shapp:storage_set',key:String(k),value:String(v)});},
removeItem:function(k){delete s[String(k)];send({type:'shapp:storage_remove',key:String(k)});},
clear:function(){for(var k in s)delete s[k];send({type:'shapp:storage_clear'});},
key:function(n){return Object.keys(s)[n]!==undefined?Object.keys(s)[n]:null;},
get length(){return Object.keys(s).length;},
_load:function(d){for(var k in d)if(Object.prototype.hasOwnProperty.call(d,k))s[k]=d[k];}
};
}
var _ls=makeShim(true),_ss=makeShim(false);
try{
var h=window.location.hash;
if(h&&h.indexOf('#shapp-ls=')===0){var hd=JSON.parse(decodeURIComponent(h.slice(10)));if(hd&&typeof hd==='object')_ls._load(hd);}
}catch(e){}
window.addEventListener('message',function(ev){
try{
var d=typeof ev.data==='string'?JSON.parse(ev.data):ev.data;
if(d&&d.type==='shapp:storage_init_data'&&d.data&&typeof d.data==='object')_ls._load(d.data);
}catch(e){}
});
function defProp(host,name,shim){
try{Object.defineProperty(host,name,{get:function(){return shim;},configurable:true,enumerable:true});return true;}catch(e){return false;}
}
if(!defProp(window,'localStorage',_ls))defProp(Window.prototype,'localStorage',_ls);
if(!defProp(window,'sessionStorage',_ss))defProp(Window.prototype,'sessionStorage',_ss);
try{window.parent.postMessage(JSON.stringify({type:'shapp:storage_init_req'}),'*');}catch(e){}
})();
(function(){
function applyCtx(d){
  if(!d)return;
  if('user' in d){window.__marsUser=d.user;}
  if(d.locale&&typeof d.locale==='string'){window.__SHAPP_LOCALE__=d.locale;}
  if(d.geo&&d.geo.enabled){
    var g=d.geo;
    var coords={latitude:g.latitude,longitude:g.longitude,accuracy:g.accuracy||50,altitude:g.altitude||null,altitudeAccuracy:null,heading:null,speed:null};
    var geoApi={
      getCurrentPosition:function(ok,_e,_o){setTimeout(function(){ok({coords:coords,timestamp:Date.now()});},50);},
      watchPosition:function(ok,_e,_o){setTimeout(function(){ok({coords:coords,timestamp:Date.now()});},50);return 1;},
      clearWatch:function(){}
    };
    try{Object.defineProperty(navigator,'geolocation',{get:function(){return geoApi;},configurable:true});}catch(e){}
  }
}
window.addEventListener('message',function(ev){
  try{var d=typeof ev.data==='string'?JSON.parse(ev.data):ev.data;if(d&&d.type==='shapp:context_init_data')applyCtx(d);}catch(e){}
});
try{window.parent.postMessage(JSON.stringify({type:'shapp:context_init_req'}),'*');}catch(e){}
})();
if(!window.__SHAPP_PLATFORM__){
(function(){
var _n=0;
function _sw(type,rt,payload){
return new Promise(function(resolve,reject){
var rid='shapp_'+(++_n)+'_'+Date.now();
function h(ev){try{var d=typeof ev.data==='string'?JSON.parse(ev.data):ev.data;if(d&&d.type===rt&&d.requestId===rid){window.removeEventListener('message',h);if(d.error)reject(new Error(typeof d.error==='string'?d.error:JSON.stringify(d.error)));else resolve(d);}}catch(e){}}
window.addEventListener('message',h);
try{var m=JSON.stringify(Object.assign({type:type,requestId:rid},payload));if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(m);else window.parent.postMessage(m,'*');}catch(e){window.removeEventListener('message',h);reject(e);}
});
}
window.__SHAPP_PLATFORM__={
getLocale:function(){return(window.__SHAPP_LOCALE__)||navigator.language||'zh-CN';},
invoke:function(ep,inp){return _sw('shapp:invoke','shapp:invoke_result',{entryPoint:ep||'main',input:inp||{}}).then(function(d){return d.result;});},
requestUserProfile:function(scopes){return _sw('shapp:request_user_profile','shapp:user_profile_result',{scopes:scopes||['profile']}).then(function(d){return d.profile;});},
requestPermissions:function(scopes){return _sw('shapp:request_permissions','shapp:permissions_result',{scopes:scopes||[]}).then(function(d){return{granted:d.granted,denied:d.denied};});},
checkPermissions:function(scopes){return _sw('shapp:check_permissions','shapp:permissions_result',{scopes:scopes||[]}).then(function(d){return{granted:d.granted,denied:d.denied};});}
};
})();
}
if(window.__marsTransport)return;
var P={};
window.addEventListener('message',function(ev){
  try{
    var d=typeof ev.data==='string'?JSON.parse(ev.data):ev.data;
    if(d.type==='shapp:rpc_result'&&d.requestId&&P[d.requestId]){
      var p=P[d.requestId];delete P[d.requestId];
      if(d.error){p.resolve({requestId:d.requestId,data:null,error:d.error});}
      else{p.resolve({requestId:d.requestId,data:d.data,error:null});}
    }
  }catch(e){}
});
window.__marsTransport={
  send:function(req){
    return new Promise(function(resolve,reject){
      P[req.requestId]={resolve:resolve,reject:reject};
      var msg=JSON.stringify({type:'shapp:rpc',requestId:req.requestId,method:req.method,params:req.params});
      if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(msg);}
      else{window.parent.postMessage(msg,'*');}
    });
  }
};
})()</script>`;

/**
 * 将 MARS 运行时引导脚本注入 HTML 字符串。
 * 插入位置：</head> 之前 > <body> 之前 > 文档最前。
 */
export function injectBootstrap(html: string): string {
  const headClose = html.indexOf("</head>");
  if (headClose !== -1) {
    return html.slice(0, headClose) + MARS_BOOTSTRAP_SCRIPT + html.slice(headClose);
  }
  const bodyOpen = html.indexOf("<body");
  if (bodyOpen !== -1) {
    return html.slice(0, bodyOpen) + MARS_BOOTSTRAP_SCRIPT + html.slice(bodyOpen);
  }
  return MARS_BOOTSTRAP_SCRIPT + html;
}
