"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const electron = require("electron");
const require$$0 = require("path");
const os = require("os");
const promises = require("fs/promises");
const require$$0$1 = require("fs");
const require$$0$2 = require("child_process");
const Database = require("better-sqlite3");
const net = require("net");
const url = require("url");
const node_child_process = require("node:child_process");
const http = require("http");
const electronUpdater = require("electron-updater");
const chokidar = require("chokidar");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const require$$0__namespace = /* @__PURE__ */ _interopNamespaceDefault(require$$0);
const os__namespace = /* @__PURE__ */ _interopNamespaceDefault(os);
class HotReloader {
  watcher = null;
  appDir = null;
  callbacks = null;
  start(appDir, callbacks) {
    this.stop();
    this.appDir = appDir;
    this.callbacks = callbacks;
    const frontendDir = require$$0.join(appDir, "frontend");
    const backendDir = require$$0.join(appDir, "backend");
    const logicDir = require$$0.join(appDir, "logic");
    const manifestFiles = [
      require$$0.join(appDir, "manifest.json"),
      require$$0.join(appDir, "app.manifest.json")
    ];
    this.watcher = chokidar.watch([frontendDir, backendDir, logicDir, ...manifestFiles], {
      ignored: [
        /(^|[/\\])\../,
        // dot files
        /node_modules/,
        /\.devtool/,
        /\*\*__devtool_runner_\d+\.ts/
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 50
      }
    });
    this.watcher.on("change", (path) => {
      const normalized = path.replace(/\\/g, "/");
      if (normalized.endsWith("/manifest.json") || normalized.endsWith("/app.manifest.json")) {
        callbacks.onManifestChange?.();
      } else if (normalized.includes("/frontend/")) {
        callbacks.onFrontendChange();
      } else if (normalized.includes("/backend/") || normalized.includes("/logic/")) {
        callbacks.onBackendChange();
      }
    });
    this.watcher.on("add", (path) => {
      const normalized = path.replace(/\\/g, "/");
      if (normalized.includes("/frontend/")) {
        callbacks.onFrontendChange();
      } else if (normalized.includes("/backend/") || normalized.includes("/logic/")) {
        callbacks.onBackendChange();
      }
    });
    this.watcher.on("unlink", (path) => {
      const normalized = path.replace(/\\/g, "/");
      if (normalized.includes("/frontend/")) {
        callbacks.onFrontendChange();
      } else if (normalized.includes("/backend/") || normalized.includes("/logic/")) {
        callbacks.onBackendChange();
      }
    });
  }
  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.appDir = null;
    this.callbacks = null;
  }
}
const MIME_TYPES = {
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
  pdf: "application/pdf"
};
function getMimeType$1(filename) {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return "application/octet-stream";
  const ext = filename.slice(dot + 1).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}
function shouldSpaFallback(urlPath) {
  const dot = urlPath.lastIndexOf(".");
  if (dot === -1) return true;
  const ext = urlPath.slice(dot + 1).toLowerCase();
  return ext === "html" || ext === "htm";
}
function checkCocosBundle(webPreviewDir, fileExists) {
  const base = webPreviewDir.replace(/\/+$/, "");
  const hasInternal = fileExists(`${base}/assets/internal/config.json`) || fileExists(`${base}/assets/internal/index.js`);
  if (!hasInternal) {
    return `Cocos 引擎应用在 "${base}" 下缺少内置资源包（assets/internal/config.json 或 assets/internal/index.js），请确认使用完整的 Cocos Web 构建输出（web-mobile / web-desktop），assets/internal/ 目录不可缺少`;
  }
  return null;
}
const MARS_BOOTSTRAP_SCRIPT = `<script>(function(){
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
// localStorage/sessionStorage shim: sandbox blocks native storage API.
// localStorage writes are relayed to the parent page via PostMessage so data
// persists across page refreshes (parent stores in its own localStorage).
// Initial values are synchronously pre-populated from the URL hash
// (parent encodes stored data as #shapp-ls=<urlencoded-json>).
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
// Synchronously pre-populate localStorage from URL hash (#shapp-ls=<json>)
try{
var h=window.location.hash;
if(h&&h.indexOf('#shapp-ls=')===0){var hd=JSON.parse(decodeURIComponent(h.slice(10)));if(hd&&typeof hd==='object')_ls._load(hd);}
}catch(e){}
// Also listen for async parent updates (e.g. storage_init_data if hash was absent)
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
// Request parent to send back previously persisted localStorage data
try{window.parent.postMessage(JSON.stringify({type:'shapp:storage_init_req'}),'*');}catch(e){}
})();
// Context init: inject __marsUser and mock navigator.geolocation from parent data.
// Parent responds to shapp:context_init_req with shapp:context_init_data { user, geo }.
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
// Platform bridge: __SHAPP_PLATFORM__ provides requestUserProfile, requestPermissions etc.
// Defined here (synchronously, before mini-app code runs) so it's always available.
// On mobile, injectedJavaScriptBeforeContentLoaded sets it first — skip in that case.
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
})()<\/script>`;
function injectBootstrap(html) {
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
const hotReloader = new HotReloader();
async function findManifest(dir) {
  const candidates = ["app.manifest.json", "manifest.json"];
  for (const name of candidates) {
    try {
      const raw = await promises.readFile(require$$0.join(dir, name), "utf-8");
      try {
        return { manifest: JSON.parse(raw.replace(/^\uFEFF/, "")), resolvedDir: dir };
      } catch {
        throw new Error(`清单文件 ${name} JSON 格式错误，请检查文件内容`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("JSON 格式错误")) throw e;
    }
  }
  try {
    const entries = await promises.readdir(dir, { withFileTypes: true });
    const subdirs = entries.filter((e) => e.isDirectory());
    for (const sub of subdirs) {
      const subDir = require$$0.join(dir, sub.name);
      for (const name of candidates) {
        try {
          const raw = await promises.readFile(require$$0.join(subDir, name), "utf-8");
          try {
            return { manifest: JSON.parse(raw.replace(/^\uFEFF/, "")), resolvedDir: subDir };
          } catch {
            throw new Error(`清单文件 ${name} JSON 格式错误，请检查文件内容`);
          }
        } catch (e) {
          if (e instanceof Error && e.message.includes("JSON 格式错误")) throw e;
        }
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("JSON 格式错误")) throw e;
  }
  throw new Error(`未找到 app.manifest.json — 请确认所选目录是 Shapp 应用根目录`);
}
async function resolveEntries(dir, manifest) {
  const backendEntry = manifest.entry?.backend ?? "backend/main.ts";
  const candidates = [backendEntry];
  const result = [];
  for (const e of candidates) {
    try {
      await promises.access(require$$0.join(dir, e));
      result.push(e);
    } catch {
    }
  }
  return result.length > 0 ? result : [backendEntry];
}
async function loadFolderInternal(dirPath) {
  const { manifest, resolvedDir } = await findManifest(dirPath);
  const entries = await resolveEntries(resolvedDir, manifest);
  const recent = store.get("recentFolders");
  const filtered = recent.filter((r) => r !== resolvedDir);
  store.set("recentFolders", [resolvedDir, ...filtered].slice(0, 10));
  const frontendEntry = manifest.webPreview ?? manifest.entry?.frontend ?? "frontend";
  const resolvedFrontendEntry = require$$0.join(resolvedDir, frontendEntry);
  const frontendDir = require$$0.extname(frontendEntry) ? require$$0.dirname(resolvedFrontendEntry) : resolvedFrontendEntry;
  const warnings = [];
  if (!require$$0$1.existsSync(frontendDir)) {
    warnings.push(`前端目录 "${frontendEntry}" 不存在，上传到平台时将被拒绝`);
  }
  if (manifest.engine === "cocos") {
    const msg = checkCocosBundle(frontendDir, require$$0$1.existsSync);
    if (msg) warnings.push(msg);
  }
  return { dir: resolvedDir, frontendDir, manifest, entries, warnings };
}
function registerPackageHandlers(win) {
  electron.ipcMain.handle("package:openFolder", async () => {
    const result = await electron.dialog.showOpenDialog(win, {
      title: "选择应用文件夹",
      properties: ["openDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const dirPath = result.filePaths[0];
    const pkg = await loadFolderInternal(dirPath);
    startWatcher(pkg.dir, win);
    return pkg;
  });
  electron.ipcMain.handle("package:loadFolder", async (_e, dirPath) => {
    const pkg = await loadFolderInternal(dirPath);
    startWatcher(pkg.dir, win);
    return pkg;
  });
  electron.ipcMain.handle("package:getRecent", () => {
    return store.get("recentFolders");
  });
  electron.ipcMain.handle("package:clearRecent", () => {
    store.set("recentFolders", []);
  });
  electron.ipcMain.handle("package:saveManifest", async (_e, dir, manifest) => {
    const candidates = ["app.manifest.json", "manifest.json"];
    for (const name of candidates) {
      const filePath = require$$0.join(dir, name);
      if (require$$0$1.existsSync(filePath)) {
        await promises.writeFile(filePath, JSON.stringify(manifest, null, 2), "utf-8");
        return;
      }
    }
    throw new Error("manifest file not found");
  });
  const IMAGE_EXTS = /* @__PURE__ */ new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
  const MIME_MAP = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml"
  };
  electron.ipcMain.handle("package:readImage", async (_e, appDir, relPath) => {
    try {
      const filePath = require$$0.normalize(require$$0.join(appDir, relPath));
      if (!filePath.startsWith(require$$0.normalize(appDir))) return null;
      const data = await promises.readFile(filePath);
      const ext = require$$0.extname(filePath).toLowerCase();
      const mime = MIME_MAP[ext] ?? "image/png";
      return `data:${mime};base64,${data.toString("base64")}`;
    } catch {
      return null;
    }
  });
  electron.ipcMain.handle("package:saveImageFile", async (_e, appDir, relPath, dataUrl) => {
    const filePath = require$$0.normalize(require$$0.join(appDir, relPath));
    if (!filePath.startsWith(require$$0.normalize(appDir))) throw new Error("Path traversal not allowed");
    await promises.mkdir(require$$0.dirname(filePath), { recursive: true });
    const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
    await promises.writeFile(filePath, Buffer.from(base64, "base64"));
  });
  electron.ipcMain.handle("package:listImages", async (_e, appDir, subPath) => {
    try {
      const dirPath = require$$0.normalize(require$$0.join(appDir, subPath));
      if (!dirPath.startsWith(require$$0.normalize(appDir))) return [];
      const entries = await promises.readdir(dirPath, { withFileTypes: true });
      return entries.filter((e) => e.isFile() && IMAGE_EXTS.has(require$$0.extname(e.name).toLowerCase())).map((e) => e.name).sort();
    } catch {
      return [];
    }
  });
  electron.ipcMain.handle("package:deleteImageFile", async (_e, appDir, relPath) => {
    const filePath = require$$0.normalize(require$$0.join(appDir, relPath));
    if (!filePath.startsWith(require$$0.normalize(appDir))) throw new Error("Path traversal not allowed");
    await promises.unlink(filePath);
  });
  electron.ipcMain.handle(
    "package:pickImageFiles",
    async (_e, appDir, multi) => {
      const { canceled, filePaths } = await electron.dialog.showOpenDialog(win, {
        defaultPath: appDir,
        properties: multi ? ["openFile", "multiSelections"] : ["openFile"],
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }]
      });
      if (canceled || filePaths.length === 0) return [];
      return Promise.all(
        filePaths.map(async (fp) => {
          const data = await promises.readFile(fp);
          const ext = require$$0.extname(fp).toLowerCase();
          const mime = MIME_MAP[ext] ?? "image/png";
          return { dataUrl: `data:${mime};base64,${data.toString("base64")}`, filename: require$$0.basename(fp) };
        })
      );
    }
  );
}
function startWatcher(appDir, win) {
  hotReloader.start(appDir, {
    onFrontendChange: () => {
      win.webContents.send("package:hotReload", { type: "frontend" });
    },
    onBackendChange: () => {
      win.webContents.send("package:hotReload", { type: "backend" });
    },
    onManifestChange: async () => {
      try {
        const pkg = await loadFolderInternal(appDir);
        win.webContents.send("package:manifestReload", pkg.manifest);
      } catch {
      }
    }
  });
}
let currentProcess = null;
let getServerUrl = null;
function setServerUrlGetter(fn) {
  getServerUrl = fn;
}
function getDenoPath() {
  const platform = process.platform;
  const arch = process.arch;
  if (electron.app.isPackaged) {
    const resourcesDir = process.resourcesPath;
    const ext = platform === "win32" ? ".exe" : "";
    const suffix = arch === "arm64" ? "arm64" : "x64";
    return require$$0.join(resourcesDir, "deno", `deno-${platform}-${suffix}${ext}`);
  }
  return "deno";
}
function getOpencodePath() {
  const platform = process.platform;
  const arch = process.arch;
  if (electron.app.isPackaged) {
    const ext = platform === "win32" ? ".exe" : "";
    const suffix = arch === "arm64" ? "arm64" : "x64";
    return require$$0.join(process.resourcesPath, "opencode", `opencode-${platform}-${suffix}${ext}`);
  }
  return "opencode";
}
function getRunnerScriptPath() {
  if (electron.app.isPackaged) {
    return require$$0.join(process.resourcesPath, "deno-runner.ts");
  }
  return require$$0.join(electron.app.getAppPath(), "resources", "deno-runner.ts");
}
async function ensureDevtoolDir(appDir) {
  const devtoolDir = require$$0.join(appDir, ".devtool");
  await promises.mkdir(devtoolDir, { recursive: true });
  return devtoolDir;
}
function parseRunnerLine(line, win) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return null;
  }
  if (msg.type === "log") {
    const entry = {
      level: msg.level ?? "log",
      message: String(msg.message ?? ""),
      ts: msg.ts ?? Date.now()
    };
    win.webContents.send("execution:log", entry);
    return null;
  }
  if (msg.type === "result") {
    return {
      ok: true,
      data: msg.data,
      durationMs: msg.duration_ms ?? 0
    };
  }
  if (msg.type === "error") {
    return {
      ok: false,
      error: {
        code: String(msg.code ?? "EXECUTION_ERROR"),
        message: String(msg.message ?? "Unknown error")
      },
      durationMs: msg.duration_ms ?? 0
    };
  }
  return null;
}
async function executeWithDeno(params, win) {
  const denoPath = getDenoPath();
  const runnerScript = getRunnerScriptPath();
  const devtoolDir = await ensureDevtoolDir(params.appDir);
  const dbPath = require$$0.join(devtoolDir, "state.db");
  if (electron.app.isPackaged && !require$$0$1.existsSync(denoPath)) {
    return {
      ok: false,
      error: {
        code: "MISSING_DENO_BINARY",
        message: `Packaged Deno runtime not found: ${denoPath}. Rebuild the Windows bundle with pnpm run pack:win or ../../scripts/build-devtool-win.ps1.`
      },
      durationMs: 0
    };
  }
  return new Promise((resolve) => {
    const requestPayload = JSON.stringify({
      id: `req_${Date.now()}`,
      appDir: params.appDir,
      entryFile: params.entryFile,
      method: params.method,
      params: params.params,
      mockContext: params.mockContext,
      dbPath,
      serverUrl: getServerUrl?.() ?? null
    });
    const childProc = require$$0$2.spawn(
      denoPath,
      ["run", "--allow-all", "--no-check", runnerScript],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          DENO_NO_UPDATE_CHECK: "1"
        }
      }
    );
    currentProcess = childProc;
    let stdoutBuf = "";
    let result = null;
    const startTs = Date.now();
    childProc.stdout.on("data", (chunk) => {
      stdoutBuf += chunk.toString("utf-8");
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parsed = parseRunnerLine(trimmed, win);
        if (parsed) result = parsed;
      }
    });
    childProc.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf-8").trim();
      if (text) {
        const entry = {
          level: "error",
          message: `[Deno stderr] ${text}`,
          ts: Date.now()
        };
        win.webContents.send("execution:log", entry);
      }
    });
    childProc.on("close", (code) => {
      currentProcess = null;
      const durationMs = Date.now() - startTs;
      if (result) {
        resolve(result);
      } else if (code === null || code === 0) {
        resolve({ ok: true, data: null, durationMs });
      } else {
        resolve({
          ok: false,
          error: { code: "PROCESS_EXIT", message: `Deno exited with code ${code}` },
          durationMs
        });
      }
    });
    childProc.on("error", (err) => {
      currentProcess = null;
      resolve({
        ok: false,
        error: { code: "SPAWN_ERROR", message: err.message },
        durationMs: Date.now() - startTs
      });
    });
    childProc.stdin.write(requestPayload + "\n");
    childProc.stdin.end();
  });
}
function registerExecutionHandlers(win) {
  electron.ipcMain.handle("execution:run", async (_e, params) => {
    if (currentProcess) {
      currentProcess.kill("SIGKILL");
      currentProcess = null;
    }
    win.webContents.send("execution:status", "running");
    try {
      const result = await executeWithDeno(params, win);
      win.webContents.send("execution:status", result.ok ? "idle" : "error");
      return result;
    } catch (err) {
      win.webContents.send("execution:status", "error");
      return {
        ok: false,
        error: {
          code: "UNEXPECTED",
          message: err instanceof Error ? err.message : String(err)
        },
        durationMs: 0
      };
    }
  });
  electron.ipcMain.handle("execution:cancel", () => {
    if (currentProcess) {
      currentProcess.kill("SIGKILL");
      currentProcess = null;
      win.webContents.send("execution:status", "idle");
    }
  });
  electron.ipcMain.handle("execution:isRunning", () => {
    return currentProcess !== null;
  });
}
function openDb(dbPath) {
  return new Database(dbPath, { readonly: false });
}
function registerKvHandlers() {
  electron.ipcMain.handle("kv:getTables", (_e, dbPath) => {
    if (!require$$0$1.existsSync(dbPath)) return [];
    try {
      const db = openDb(dbPath);
      const rows = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      ).all();
      db.close();
      return rows.map((r) => r.name);
    } catch {
      return [];
    }
  });
  electron.ipcMain.handle(
    "kv:getTableRows",
    (_e, dbPath, table, limit = 100, offset = 0) => {
      if (!require$$0$1.existsSync(dbPath)) return { rows: [], total: 0 };
      try {
        const db = openDb(dbPath);
        const tables = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
        ).all(table).map((r) => r.name);
        if (tables.length === 0) {
          db.close();
          return { rows: [], total: 0 };
        }
        const tableName = tables[0];
        const totalRow = db.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get();
        const rows = db.prepare(
          `SELECT * FROM "${tableName}" LIMIT ? OFFSET ?`
        ).all(limit, offset);
        db.close();
        return { rows, total: totalRow.count };
      } catch {
        return { rows: [], total: 0 };
      }
    }
  );
  electron.ipcMain.handle(
    "kv:runQuery",
    (_e, dbPath, sql) => {
      if (!require$$0$1.existsSync(dbPath)) return { columns: [], rows: [] };
      try {
        const db = openDb(dbPath);
        const stmt = db.prepare(sql);
        if (stmt.reader) {
          const rows = stmt.all();
          const columns = rows.length > 0 ? Object.keys(rows[0]) : stmt.columns().map((c) => c.name);
          db.close();
          return {
            columns,
            rows: rows.map((r) => columns.map((c) => r[c]))
          };
        } else {
          stmt.run();
          db.close();
          return { columns: ["result"], rows: [["OK"]] };
        }
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : String(err)
        };
      }
    }
  );
  electron.ipcMain.handle(
    "kv:exportDb",
    async (_e, dbPath) => {
      if (!require$$0$1.existsSync(dbPath)) return null;
      const result = await electron.dialog.showSaveDialog({
        title: "导出数据库",
        defaultPath: "app-state.db",
        filters: [{ name: "SQLite Database", extensions: ["db", "sqlite"] }]
      });
      if (result.canceled || !result.filePath) return null;
      require$$0$1.copyFileSync(dbPath, result.filePath);
      return result.filePath;
    }
  );
  function ensureKvTable(db) {
    db.prepare(
      `CREATE TABLE IF NOT EXISTS shapp_kv (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL,
         updated_at INTEGER NOT NULL
       )`
    ).run();
  }
  electron.ipcMain.handle(
    "kv:getAllEntries",
    (_e, dbPath) => {
      if (!require$$0$1.existsSync(dbPath)) return [];
      try {
        const db = openDb(dbPath);
        ensureKvTable(db);
        const rows = db.prepare("SELECT key, value, updated_at FROM shapp_kv ORDER BY key").all();
        db.close();
        return rows.map((r) => ({ key: r.key, value: r.value, updatedAt: r.updated_at }));
      } catch {
        return [];
      }
    }
  );
  electron.ipcMain.handle(
    "kv:setEntry",
    (_e, dbPath, key, value) => {
      const db = openDb(dbPath);
      try {
        ensureKvTable(db);
        db.prepare(
          `INSERT INTO shapp_kv (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        ).run(key, value, Date.now());
      } finally {
        db.close();
      }
    }
  );
  electron.ipcMain.handle(
    "kv:deleteEntry",
    (_e, dbPath, key) => {
      if (!require$$0$1.existsSync(dbPath)) return;
      const db = openDb(dbPath);
      try {
        db.prepare("DELETE FROM shapp_kv WHERE key = ?").run(key);
      } finally {
        db.close();
      }
    }
  );
  electron.ipcMain.handle(
    "kv:clearAll",
    (_e, dbPath) => {
      if (!require$$0$1.existsSync(dbPath)) return;
      const db = openDb(dbPath);
      try {
        db.prepare("DELETE FROM shapp_kv").run();
      } finally {
        db.close();
      }
    }
  );
  electron.ipcMain.handle(
    "kv:importEntries",
    (_e, dbPath, entries) => {
      const db = openDb(dbPath);
      try {
        ensureKvTable(db);
        const insert = db.prepare(
          `INSERT INTO shapp_kv (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        );
        const insertMany = db.transaction((rows) => {
          for (const row of rows) {
            insert.run(row.key, row.value, Date.now());
          }
        });
        insertMany(entries);
      } finally {
        db.close();
      }
    }
  );
}
function registerServerHandlers() {
  electron.ipcMain.handle("server:start", async (_e, appDir, frontendDir) => {
    return staticServer.start(appDir, frontendDir);
  });
  electron.ipcMain.handle("server:stop", async () => {
    staticServer.stop();
  });
  electron.ipcMain.handle("server:getUrl", () => {
    return staticServer.getUrl();
  });
}
function registerCaptureHandlers(win) {
  electron.ipcMain.handle(
    "capture:screenshot",
    async (_e, rect) => {
      const image = await win.webContents.capturePage(rect);
      const pngBuffer = image.toPNG();
      return `data:image/png;base64,${pngBuffer.toString("base64")}`;
    }
  );
  electron.ipcMain.handle("capture:getWindowSourceId", async () => {
    const sources = await electron.desktopCapturer.getSources({
      types: ["window"],
      thumbnailSize: { width: 0, height: 0 }
    });
    const title = win.getTitle();
    const source = sources.find((s) => s.name === title) ?? sources[0];
    return source?.id ?? "";
  });
  electron.ipcMain.handle(
    "capture:saveMedia",
    async (_e, params) => {
      const { data, mimeType, filename, role, appDir } = params;
      let savePath;
      if (role === "cover" || role === "carousel") {
        const destDir = require$$0.join(appDir, "assets", role === "cover" ? "." : "carousel");
        await promises.mkdir(destDir, { recursive: true });
        if (role === "cover") {
          const ext = filename.split(".").pop()?.toLowerCase() || "png";
          savePath = require$$0.join(destDir, `cover.${ext}`);
        } else {
          savePath = require$$0.join(destDir, filename);
        }
      } else {
        const result = await electron.dialog.showSaveDialog({
          title: "保存媒体文件",
          defaultPath: filename,
          filters: [
            mimeType === "image/png" ? { name: "PNG Image", extensions: ["png"] } : { name: "WebM Video", extensions: ["webm"] }
          ]
        });
        if (result.canceled || !result.filePath)
          throw new Error("用户取消保存");
        savePath = result.filePath;
      }
      const base64 = data.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      await promises.writeFile(savePath, buffer);
      if (role === "cover" || role === "carousel") {
        win.webContents.send("package:assetsChanged", { role, appDir, filename });
      }
      return savePath;
    }
  );
  electron.ipcMain.handle(
    "capture:openSaveDialog",
    async (_e, defaultName) => {
      const result = await electron.dialog.showSaveDialog({
        title: "保存文件",
        defaultPath: defaultName
      });
      return result.canceled ? null : result.filePath ?? null;
    }
  );
}
const createSseClient = ({ onSseError, onSseEvent, responseTransformer, responseValidator, sseDefaultRetryDelay, sseMaxRetryAttempts, sseMaxRetryDelay, sseSleepFn, url: url2, ...options }) => {
  let lastEventId;
  const sleep = sseSleepFn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const createStream = async function* () {
    let retryDelay = sseDefaultRetryDelay ?? 3e3;
    let attempt = 0;
    const signal = options.signal ?? new AbortController().signal;
    while (true) {
      if (signal.aborted)
        break;
      attempt++;
      const headers = options.headers instanceof Headers ? options.headers : new Headers(options.headers);
      if (lastEventId !== void 0) {
        headers.set("Last-Event-ID", lastEventId);
      }
      try {
        const response = await fetch(url2, { ...options, headers, signal });
        if (!response.ok)
          throw new Error(`SSE failed: ${response.status} ${response.statusText}`);
        if (!response.body)
          throw new Error("No body in SSE response");
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        const abortHandler = () => {
          try {
            void reader.cancel();
          } catch {
          }
        };
        signal.addEventListener("abort", abortHandler);
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done)
              break;
            buffer += value;
            const chunks = buffer.split("\n\n");
            buffer = chunks.pop() ?? "";
            for (const chunk of chunks) {
              const lines = chunk.split("\n");
              const dataLines = [];
              let eventName;
              for (const line of lines) {
                if (line.startsWith("data:")) {
                  dataLines.push(line.replace(/^data:\s*/, ""));
                } else if (line.startsWith("event:")) {
                  eventName = line.replace(/^event:\s*/, "");
                } else if (line.startsWith("id:")) {
                  lastEventId = line.replace(/^id:\s*/, "");
                } else if (line.startsWith("retry:")) {
                  const parsed = Number.parseInt(line.replace(/^retry:\s*/, ""), 10);
                  if (!Number.isNaN(parsed)) {
                    retryDelay = parsed;
                  }
                }
              }
              let data;
              let parsedJson = false;
              if (dataLines.length) {
                const rawData = dataLines.join("\n");
                try {
                  data = JSON.parse(rawData);
                  parsedJson = true;
                } catch {
                  data = rawData;
                }
              }
              if (parsedJson) {
                if (responseValidator) {
                  await responseValidator(data);
                }
                if (responseTransformer) {
                  data = await responseTransformer(data);
                }
              }
              onSseEvent?.({
                data,
                event: eventName,
                id: lastEventId,
                retry: retryDelay
              });
              if (dataLines.length) {
                yield data;
              }
            }
          }
        } finally {
          signal.removeEventListener("abort", abortHandler);
          reader.releaseLock();
        }
        break;
      } catch (error) {
        onSseError?.(error);
        if (sseMaxRetryAttempts !== void 0 && attempt >= sseMaxRetryAttempts) {
          break;
        }
        const backoff = Math.min(retryDelay * 2 ** (attempt - 1), sseMaxRetryDelay ?? 3e4);
        await sleep(backoff);
      }
    }
  };
  const stream = createStream();
  return { stream };
};
const getAuthToken = async (auth, callback) => {
  const token = typeof callback === "function" ? await callback(auth) : callback;
  if (!token) {
    return;
  }
  if (auth.scheme === "bearer") {
    return `Bearer ${token}`;
  }
  if (auth.scheme === "basic") {
    return `Basic ${btoa(token)}`;
  }
  return token;
};
const jsonBodySerializer = {
  bodySerializer: (body) => JSON.stringify(body, (_key, value) => typeof value === "bigint" ? value.toString() : value)
};
const separatorArrayExplode = (style) => {
  switch (style) {
    case "label":
      return ".";
    case "matrix":
      return ";";
    case "simple":
      return ",";
    default:
      return "&";
  }
};
const separatorArrayNoExplode = (style) => {
  switch (style) {
    case "form":
      return ",";
    case "pipeDelimited":
      return "|";
    case "spaceDelimited":
      return "%20";
    default:
      return ",";
  }
};
const separatorObjectExplode = (style) => {
  switch (style) {
    case "label":
      return ".";
    case "matrix":
      return ";";
    case "simple":
      return ",";
    default:
      return "&";
  }
};
const serializeArrayParam = ({ allowReserved, explode, name, style, value }) => {
  if (!explode) {
    const joinedValues2 = (allowReserved ? value : value.map((v) => encodeURIComponent(v))).join(separatorArrayNoExplode(style));
    switch (style) {
      case "label":
        return `.${joinedValues2}`;
      case "matrix":
        return `;${name}=${joinedValues2}`;
      case "simple":
        return joinedValues2;
      default:
        return `${name}=${joinedValues2}`;
    }
  }
  const separator = separatorArrayExplode(style);
  const joinedValues = value.map((v) => {
    if (style === "label" || style === "simple") {
      return allowReserved ? v : encodeURIComponent(v);
    }
    return serializePrimitiveParam({
      allowReserved,
      name,
      value: v
    });
  }).join(separator);
  return style === "label" || style === "matrix" ? separator + joinedValues : joinedValues;
};
const serializePrimitiveParam = ({ allowReserved, name, value }) => {
  if (value === void 0 || value === null) {
    return "";
  }
  if (typeof value === "object") {
    throw new Error("Deeply-nested arrays/objects aren’t supported. Provide your own `querySerializer()` to handle these.");
  }
  return `${name}=${allowReserved ? value : encodeURIComponent(value)}`;
};
const serializeObjectParam = ({ allowReserved, explode, name, style, value, valueOnly }) => {
  if (value instanceof Date) {
    return valueOnly ? value.toISOString() : `${name}=${value.toISOString()}`;
  }
  if (style !== "deepObject" && !explode) {
    let values = [];
    Object.entries(value).forEach(([key, v]) => {
      values = [...values, key, allowReserved ? v : encodeURIComponent(v)];
    });
    const joinedValues2 = values.join(",");
    switch (style) {
      case "form":
        return `${name}=${joinedValues2}`;
      case "label":
        return `.${joinedValues2}`;
      case "matrix":
        return `;${name}=${joinedValues2}`;
      default:
        return joinedValues2;
    }
  }
  const separator = separatorObjectExplode(style);
  const joinedValues = Object.entries(value).map(([key, v]) => serializePrimitiveParam({
    allowReserved,
    name: style === "deepObject" ? `${name}[${key}]` : key,
    value: v
  })).join(separator);
  return style === "label" || style === "matrix" ? separator + joinedValues : joinedValues;
};
const PATH_PARAM_RE = /\{[^{}]+\}/g;
const defaultPathSerializer = ({ path, url: _url }) => {
  let url2 = _url;
  const matches = _url.match(PATH_PARAM_RE);
  if (matches) {
    for (const match of matches) {
      let explode = false;
      let name = match.substring(1, match.length - 1);
      let style = "simple";
      if (name.endsWith("*")) {
        explode = true;
        name = name.substring(0, name.length - 1);
      }
      if (name.startsWith(".")) {
        name = name.substring(1);
        style = "label";
      } else if (name.startsWith(";")) {
        name = name.substring(1);
        style = "matrix";
      }
      const value = path[name];
      if (value === void 0 || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        url2 = url2.replace(match, serializeArrayParam({ explode, name, style, value }));
        continue;
      }
      if (typeof value === "object") {
        url2 = url2.replace(match, serializeObjectParam({
          explode,
          name,
          style,
          value,
          valueOnly: true
        }));
        continue;
      }
      if (style === "matrix") {
        url2 = url2.replace(match, `;${serializePrimitiveParam({
          name,
          value
        })}`);
        continue;
      }
      const replaceValue = encodeURIComponent(style === "label" ? `.${value}` : value);
      url2 = url2.replace(match, replaceValue);
    }
  }
  return url2;
};
const getUrl = ({ baseUrl, path, query, querySerializer, url: _url }) => {
  const pathUrl = _url.startsWith("/") ? _url : `/${_url}`;
  let url2 = (baseUrl ?? "") + pathUrl;
  if (path) {
    url2 = defaultPathSerializer({ path, url: url2 });
  }
  let search = query ? querySerializer(query) : "";
  if (search.startsWith("?")) {
    search = search.substring(1);
  }
  if (search) {
    url2 += `?${search}`;
  }
  return url2;
};
const createQuerySerializer = ({ allowReserved, array, object } = {}) => {
  const querySerializer = (queryParams) => {
    const search = [];
    if (queryParams && typeof queryParams === "object") {
      for (const name in queryParams) {
        const value = queryParams[name];
        if (value === void 0 || value === null) {
          continue;
        }
        if (Array.isArray(value)) {
          const serializedArray = serializeArrayParam({
            allowReserved,
            explode: true,
            name,
            style: "form",
            value,
            ...array
          });
          if (serializedArray)
            search.push(serializedArray);
        } else if (typeof value === "object") {
          const serializedObject = serializeObjectParam({
            allowReserved,
            explode: true,
            name,
            style: "deepObject",
            value,
            ...object
          });
          if (serializedObject)
            search.push(serializedObject);
        } else {
          const serializedPrimitive = serializePrimitiveParam({
            allowReserved,
            name,
            value
          });
          if (serializedPrimitive)
            search.push(serializedPrimitive);
        }
      }
    }
    return search.join("&");
  };
  return querySerializer;
};
const getParseAs = (contentType) => {
  if (!contentType) {
    return "stream";
  }
  const cleanContent = contentType.split(";")[0]?.trim();
  if (!cleanContent) {
    return;
  }
  if (cleanContent.startsWith("application/json") || cleanContent.endsWith("+json")) {
    return "json";
  }
  if (cleanContent === "multipart/form-data") {
    return "formData";
  }
  if (["application/", "audio/", "image/", "video/"].some((type) => cleanContent.startsWith(type))) {
    return "blob";
  }
  if (cleanContent.startsWith("text/")) {
    return "text";
  }
  return;
};
const checkForExistence = (options, name) => {
  if (!name) {
    return false;
  }
  if (options.headers.has(name) || options.query?.[name] || options.headers.get("Cookie")?.includes(`${name}=`)) {
    return true;
  }
  return false;
};
const setAuthParams = async ({ security, ...options }) => {
  for (const auth of security) {
    if (checkForExistence(options, auth.name)) {
      continue;
    }
    const token = await getAuthToken(auth, options.auth);
    if (!token) {
      continue;
    }
    const name = auth.name ?? "Authorization";
    switch (auth.in) {
      case "query":
        if (!options.query) {
          options.query = {};
        }
        options.query[name] = token;
        break;
      case "cookie":
        options.headers.append("Cookie", `${name}=${token}`);
        break;
      case "header":
      default:
        options.headers.set(name, token);
        break;
    }
  }
};
const buildUrl = (options) => getUrl({
  baseUrl: options.baseUrl,
  path: options.path,
  query: options.query,
  querySerializer: typeof options.querySerializer === "function" ? options.querySerializer : createQuerySerializer(options.querySerializer),
  url: options.url
});
const mergeConfigs = (a, b) => {
  const config = { ...a, ...b };
  if (config.baseUrl?.endsWith("/")) {
    config.baseUrl = config.baseUrl.substring(0, config.baseUrl.length - 1);
  }
  config.headers = mergeHeaders(a.headers, b.headers);
  return config;
};
const mergeHeaders = (...headers) => {
  const mergedHeaders = new Headers();
  for (const header of headers) {
    if (!header || typeof header !== "object") {
      continue;
    }
    const iterator = header instanceof Headers ? header.entries() : Object.entries(header);
    for (const [key, value] of iterator) {
      if (value === null) {
        mergedHeaders.delete(key);
      } else if (Array.isArray(value)) {
        for (const v of value) {
          mergedHeaders.append(key, v);
        }
      } else if (value !== void 0) {
        mergedHeaders.set(key, typeof value === "object" ? JSON.stringify(value) : value);
      }
    }
  }
  return mergedHeaders;
};
class Interceptors {
  _fns;
  constructor() {
    this._fns = [];
  }
  clear() {
    this._fns = [];
  }
  getInterceptorIndex(id) {
    if (typeof id === "number") {
      return this._fns[id] ? id : -1;
    } else {
      return this._fns.indexOf(id);
    }
  }
  exists(id) {
    const index = this.getInterceptorIndex(id);
    return !!this._fns[index];
  }
  eject(id) {
    const index = this.getInterceptorIndex(id);
    if (this._fns[index]) {
      this._fns[index] = null;
    }
  }
  update(id, fn) {
    const index = this.getInterceptorIndex(id);
    if (this._fns[index]) {
      this._fns[index] = fn;
      return id;
    } else {
      return false;
    }
  }
  use(fn) {
    this._fns = [...this._fns, fn];
    return this._fns.length - 1;
  }
}
const createInterceptors = () => ({
  error: new Interceptors(),
  request: new Interceptors(),
  response: new Interceptors()
});
const defaultQuerySerializer = createQuerySerializer({
  allowReserved: false,
  array: {
    explode: true,
    style: "form"
  },
  object: {
    explode: true,
    style: "deepObject"
  }
});
const defaultHeaders = {
  "Content-Type": "application/json"
};
const createConfig = (override = {}) => ({
  ...jsonBodySerializer,
  headers: defaultHeaders,
  parseAs: "auto",
  querySerializer: defaultQuerySerializer,
  ...override
});
const createClient = (config = {}) => {
  let _config = mergeConfigs(createConfig(), config);
  const getConfig = () => ({ ..._config });
  const setConfig = (config2) => {
    _config = mergeConfigs(_config, config2);
    return getConfig();
  };
  const interceptors = createInterceptors();
  const beforeRequest = async (options) => {
    const opts = {
      ..._config,
      ...options,
      fetch: options.fetch ?? _config.fetch ?? globalThis.fetch,
      headers: mergeHeaders(_config.headers, options.headers),
      serializedBody: void 0
    };
    if (opts.security) {
      await setAuthParams({
        ...opts,
        security: opts.security
      });
    }
    if (opts.requestValidator) {
      await opts.requestValidator(opts);
    }
    if (opts.body && opts.bodySerializer) {
      opts.serializedBody = opts.bodySerializer(opts.body);
    }
    if (opts.serializedBody === void 0 || opts.serializedBody === "") {
      opts.headers.delete("Content-Type");
    }
    const url2 = buildUrl(opts);
    return { opts, url: url2 };
  };
  const request = async (options) => {
    const { opts, url: url2 } = await beforeRequest(options);
    const requestInit = {
      redirect: "follow",
      ...opts,
      body: opts.serializedBody
    };
    let request2 = new Request(url2, requestInit);
    for (const fn of interceptors.request._fns) {
      if (fn) {
        request2 = await fn(request2, opts);
      }
    }
    const _fetch = opts.fetch;
    let response = await _fetch(request2);
    for (const fn of interceptors.response._fns) {
      if (fn) {
        response = await fn(response, request2, opts);
      }
    }
    const result = {
      request: request2,
      response
    };
    if (response.ok) {
      if (response.status === 204 || response.headers.get("Content-Length") === "0") {
        return opts.responseStyle === "data" ? {} : {
          data: {},
          ...result
        };
      }
      const parseAs = (opts.parseAs === "auto" ? getParseAs(response.headers.get("Content-Type")) : opts.parseAs) ?? "json";
      let data;
      switch (parseAs) {
        case "arrayBuffer":
        case "blob":
        case "formData":
        case "json":
        case "text":
          data = await response[parseAs]();
          break;
        case "stream":
          return opts.responseStyle === "data" ? response.body : {
            data: response.body,
            ...result
          };
      }
      if (parseAs === "json") {
        if (opts.responseValidator) {
          await opts.responseValidator(data);
        }
        if (opts.responseTransformer) {
          data = await opts.responseTransformer(data);
        }
      }
      return opts.responseStyle === "data" ? data : {
        data,
        ...result
      };
    }
    const textError = await response.text();
    let jsonError;
    try {
      jsonError = JSON.parse(textError);
    } catch {
    }
    const error = jsonError ?? textError;
    let finalError = error;
    for (const fn of interceptors.error._fns) {
      if (fn) {
        finalError = await fn(error, response, request2, opts);
      }
    }
    finalError = finalError || {};
    if (opts.throwOnError) {
      throw finalError;
    }
    return opts.responseStyle === "data" ? void 0 : {
      error: finalError,
      ...result
    };
  };
  const makeMethod = (method) => {
    const fn = (options) => request({ ...options, method });
    fn.sse = async (options) => {
      const { opts, url: url2 } = await beforeRequest(options);
      return createSseClient({
        ...opts,
        body: opts.body,
        headers: opts.headers,
        method,
        url: url2
      });
    };
    return fn;
  };
  return {
    buildUrl,
    connect: makeMethod("CONNECT"),
    delete: makeMethod("DELETE"),
    get: makeMethod("GET"),
    getConfig,
    head: makeMethod("HEAD"),
    interceptors,
    options: makeMethod("OPTIONS"),
    patch: makeMethod("PATCH"),
    post: makeMethod("POST"),
    put: makeMethod("PUT"),
    request,
    setConfig,
    trace: makeMethod("TRACE")
  };
};
const client = createClient(createConfig({
  baseUrl: "http://localhost:4096"
}));
class _HeyApiClient {
  _client = client;
  constructor(args) {
    if (args?.client) {
      this._client = args.client;
    }
  }
}
class Global extends _HeyApiClient {
  /**
   * Get events
   */
  event(options) {
    return (options?.client ?? this._client).get.sse({
      url: "/global/event",
      ...options
    });
  }
}
class Project extends _HeyApiClient {
  /**
   * List all projects
   */
  list(options) {
    return (options?.client ?? this._client).get({
      url: "/project",
      ...options
    });
  }
  /**
   * Get the current project
   */
  current(options) {
    return (options?.client ?? this._client).get({
      url: "/project/current",
      ...options
    });
  }
}
class Pty extends _HeyApiClient {
  /**
   * List all PTY sessions
   */
  list(options) {
    return (options?.client ?? this._client).get({
      url: "/pty",
      ...options
    });
  }
  /**
   * Create a new PTY session
   */
  create(options) {
    return (options?.client ?? this._client).post({
      url: "/pty",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers
      }
    });
  }
  /**
   * Remove a PTY session
   */
  remove(options) {
    return (options.client ?? this._client).delete({
      url: "/pty/{id}",
      ...options
    });
  }
  /**
   * Get PTY session info
   */
  get(options) {
    return (options.client ?? this._client).get({
      url: "/pty/{id}",
      ...options
    });
  }
  /**
   * Update PTY session
   */
  update(options) {
    return (options.client ?? this._client).put({
      url: "/pty/{id}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Connect to a PTY session
   */
  connect(options) {
    return (options.client ?? this._client).get({
      url: "/pty/{id}/connect",
      ...options
    });
  }
}
class Config extends _HeyApiClient {
  /**
   * Get config info
   */
  get(options) {
    return (options?.client ?? this._client).get({
      url: "/config",
      ...options
    });
  }
  /**
   * Update config
   */
  update(options) {
    return (options?.client ?? this._client).patch({
      url: "/config",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers
      }
    });
  }
  /**
   * List all providers
   */
  providers(options) {
    return (options?.client ?? this._client).get({
      url: "/config/providers",
      ...options
    });
  }
}
class Tool extends _HeyApiClient {
  /**
   * List all tool IDs (including built-in and dynamically registered)
   */
  ids(options) {
    return (options?.client ?? this._client).get({
      url: "/experimental/tool/ids",
      ...options
    });
  }
  /**
   * List tools with JSON schema parameters for a provider/model
   */
  list(options) {
    return (options.client ?? this._client).get({
      url: "/experimental/tool",
      ...options
    });
  }
}
class Instance extends _HeyApiClient {
  /**
   * Dispose the current instance
   */
  dispose(options) {
    return (options?.client ?? this._client).post({
      url: "/instance/dispose",
      ...options
    });
  }
}
class Path extends _HeyApiClient {
  /**
   * Get the current path
   */
  get(options) {
    return (options?.client ?? this._client).get({
      url: "/path",
      ...options
    });
  }
}
class Vcs extends _HeyApiClient {
  /**
   * Get VCS info for the current instance
   */
  get(options) {
    return (options?.client ?? this._client).get({
      url: "/vcs",
      ...options
    });
  }
}
class Session extends _HeyApiClient {
  /**
   * List all sessions
   */
  list(options) {
    return (options?.client ?? this._client).get({
      url: "/session",
      ...options
    });
  }
  /**
   * Create a new session
   */
  create(options) {
    return (options?.client ?? this._client).post({
      url: "/session",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers
      }
    });
  }
  /**
   * Get session status
   */
  status(options) {
    return (options?.client ?? this._client).get({
      url: "/session/status",
      ...options
    });
  }
  /**
   * Delete a session and all its data
   */
  delete(options) {
    return (options.client ?? this._client).delete({
      url: "/session/{id}",
      ...options
    });
  }
  /**
   * Get session
   */
  get(options) {
    return (options.client ?? this._client).get({
      url: "/session/{id}",
      ...options
    });
  }
  /**
   * Update session properties
   */
  update(options) {
    return (options.client ?? this._client).patch({
      url: "/session/{id}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Get a session's children
   */
  children(options) {
    return (options.client ?? this._client).get({
      url: "/session/{id}/children",
      ...options
    });
  }
  /**
   * Get the todo list for a session
   */
  todo(options) {
    return (options.client ?? this._client).get({
      url: "/session/{id}/todo",
      ...options
    });
  }
  /**
   * Analyze the app and create an AGENTS.md file
   */
  init(options) {
    return (options.client ?? this._client).post({
      url: "/session/{id}/init",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Fork an existing session at a specific message
   */
  fork(options) {
    return (options.client ?? this._client).post({
      url: "/session/{id}/fork",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Abort a session
   */
  abort(options) {
    return (options.client ?? this._client).post({
      url: "/session/{id}/abort",
      ...options
    });
  }
  /**
   * Unshare the session
   */
  unshare(options) {
    return (options.client ?? this._client).delete({
      url: "/session/{id}/share",
      ...options
    });
  }
  /**
   * Share a session
   */
  share(options) {
    return (options.client ?? this._client).post({
      url: "/session/{id}/share",
      ...options
    });
  }
  /**
   * Get the diff for this session
   */
  diff(options) {
    return (options.client ?? this._client).get({
      url: "/session/{id}/diff",
      ...options
    });
  }
  /**
   * Summarize the session
   */
  summarize(options) {
    return (options.client ?? this._client).post({
      url: "/session/{id}/summarize",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * List messages for a session
   */
  messages(options) {
    return (options.client ?? this._client).get({
      url: "/session/{id}/message",
      ...options
    });
  }
  /**
   * Create and send a new message to a session
   */
  prompt(options) {
    return (options.client ?? this._client).post({
      url: "/session/{id}/message",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Get a message from a session
   */
  message(options) {
    return (options.client ?? this._client).get({
      url: "/session/{id}/message/{messageID}",
      ...options
    });
  }
  /**
   * Create and send a new message to a session, start if needed and return immediately
   */
  promptAsync(options) {
    return (options.client ?? this._client).post({
      url: "/session/{id}/prompt_async",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Send a new command to a session
   */
  command(options) {
    return (options.client ?? this._client).post({
      url: "/session/{id}/command",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Run a shell command
   */
  shell(options) {
    return (options.client ?? this._client).post({
      url: "/session/{id}/shell",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Revert a message
   */
  revert(options) {
    return (options.client ?? this._client).post({
      url: "/session/{id}/revert",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Restore all reverted messages
   */
  unrevert(options) {
    return (options.client ?? this._client).post({
      url: "/session/{id}/unrevert",
      ...options
    });
  }
}
class Command extends _HeyApiClient {
  /**
   * List all commands
   */
  list(options) {
    return (options?.client ?? this._client).get({
      url: "/command",
      ...options
    });
  }
}
class Oauth extends _HeyApiClient {
  /**
   * Authorize a provider using OAuth
   */
  authorize(options) {
    return (options.client ?? this._client).post({
      url: "/provider/{id}/oauth/authorize",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Handle OAuth callback for a provider
   */
  callback(options) {
    return (options.client ?? this._client).post({
      url: "/provider/{id}/oauth/callback",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
}
class Provider extends _HeyApiClient {
  /**
   * List all providers
   */
  list(options) {
    return (options?.client ?? this._client).get({
      url: "/provider",
      ...options
    });
  }
  /**
   * Get provider authentication methods
   */
  auth(options) {
    return (options?.client ?? this._client).get({
      url: "/provider/auth",
      ...options
    });
  }
  oauth = new Oauth({ client: this._client });
}
class Find extends _HeyApiClient {
  /**
   * Find text in files
   */
  text(options) {
    return (options.client ?? this._client).get({
      url: "/find",
      ...options
    });
  }
  /**
   * Find files
   */
  files(options) {
    return (options.client ?? this._client).get({
      url: "/find/file",
      ...options
    });
  }
  /**
   * Find workspace symbols
   */
  symbols(options) {
    return (options.client ?? this._client).get({
      url: "/find/symbol",
      ...options
    });
  }
}
class File extends _HeyApiClient {
  /**
   * List files and directories
   */
  list(options) {
    return (options.client ?? this._client).get({
      url: "/file",
      ...options
    });
  }
  /**
   * Read a file
   */
  read(options) {
    return (options.client ?? this._client).get({
      url: "/file/content",
      ...options
    });
  }
  /**
   * Get file status
   */
  status(options) {
    return (options?.client ?? this._client).get({
      url: "/file/status",
      ...options
    });
  }
}
class App extends _HeyApiClient {
  /**
   * Write a log entry to the server logs
   */
  log(options) {
    return (options?.client ?? this._client).post({
      url: "/log",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers
      }
    });
  }
  /**
   * List all agents
   */
  agents(options) {
    return (options?.client ?? this._client).get({
      url: "/agent",
      ...options
    });
  }
}
class Auth extends _HeyApiClient {
  /**
   * Remove OAuth credentials for an MCP server
   */
  remove(options) {
    return (options.client ?? this._client).delete({
      url: "/mcp/{name}/auth",
      ...options
    });
  }
  /**
   * Start OAuth authentication flow for an MCP server
   */
  start(options) {
    return (options.client ?? this._client).post({
      url: "/mcp/{name}/auth",
      ...options
    });
  }
  /**
   * Complete OAuth authentication with authorization code
   */
  callback(options) {
    return (options.client ?? this._client).post({
      url: "/mcp/{name}/auth/callback",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  /**
   * Start OAuth flow and wait for callback (opens browser)
   */
  authenticate(options) {
    return (options.client ?? this._client).post({
      url: "/mcp/{name}/auth/authenticate",
      ...options
    });
  }
  /**
   * Set authentication credentials
   */
  set(options) {
    return (options.client ?? this._client).put({
      url: "/auth/{id}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
}
class Mcp extends _HeyApiClient {
  /**
   * Get MCP server status
   */
  status(options) {
    return (options?.client ?? this._client).get({
      url: "/mcp",
      ...options
    });
  }
  /**
   * Add MCP server dynamically
   */
  add(options) {
    return (options?.client ?? this._client).post({
      url: "/mcp",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers
      }
    });
  }
  /**
   * Connect an MCP server
   */
  connect(options) {
    return (options.client ?? this._client).post({
      url: "/mcp/{name}/connect",
      ...options
    });
  }
  /**
   * Disconnect an MCP server
   */
  disconnect(options) {
    return (options.client ?? this._client).post({
      url: "/mcp/{name}/disconnect",
      ...options
    });
  }
  auth = new Auth({ client: this._client });
}
class Lsp extends _HeyApiClient {
  /**
   * Get LSP server status
   */
  status(options) {
    return (options?.client ?? this._client).get({
      url: "/lsp",
      ...options
    });
  }
}
class Formatter extends _HeyApiClient {
  /**
   * Get formatter status
   */
  status(options) {
    return (options?.client ?? this._client).get({
      url: "/formatter",
      ...options
    });
  }
}
class Control extends _HeyApiClient {
  /**
   * Get the next TUI request from the queue
   */
  next(options) {
    return (options?.client ?? this._client).get({
      url: "/tui/control/next",
      ...options
    });
  }
  /**
   * Submit a response to the TUI request queue
   */
  response(options) {
    return (options?.client ?? this._client).post({
      url: "/tui/control/response",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers
      }
    });
  }
}
class Tui extends _HeyApiClient {
  /**
   * Append prompt to the TUI
   */
  appendPrompt(options) {
    return (options?.client ?? this._client).post({
      url: "/tui/append-prompt",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers
      }
    });
  }
  /**
   * Open the help dialog
   */
  openHelp(options) {
    return (options?.client ?? this._client).post({
      url: "/tui/open-help",
      ...options
    });
  }
  /**
   * Open the session dialog
   */
  openSessions(options) {
    return (options?.client ?? this._client).post({
      url: "/tui/open-sessions",
      ...options
    });
  }
  /**
   * Open the theme dialog
   */
  openThemes(options) {
    return (options?.client ?? this._client).post({
      url: "/tui/open-themes",
      ...options
    });
  }
  /**
   * Open the model dialog
   */
  openModels(options) {
    return (options?.client ?? this._client).post({
      url: "/tui/open-models",
      ...options
    });
  }
  /**
   * Submit the prompt
   */
  submitPrompt(options) {
    return (options?.client ?? this._client).post({
      url: "/tui/submit-prompt",
      ...options
    });
  }
  /**
   * Clear the prompt
   */
  clearPrompt(options) {
    return (options?.client ?? this._client).post({
      url: "/tui/clear-prompt",
      ...options
    });
  }
  /**
   * Execute a TUI command (e.g. agent_cycle)
   */
  executeCommand(options) {
    return (options?.client ?? this._client).post({
      url: "/tui/execute-command",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers
      }
    });
  }
  /**
   * Show a toast notification in the TUI
   */
  showToast(options) {
    return (options?.client ?? this._client).post({
      url: "/tui/show-toast",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers
      }
    });
  }
  /**
   * Publish a TUI event
   */
  publish(options) {
    return (options?.client ?? this._client).post({
      url: "/tui/publish",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers
      }
    });
  }
  control = new Control({ client: this._client });
}
class Event extends _HeyApiClient {
  /**
   * Get events
   */
  subscribe(options) {
    return (options?.client ?? this._client).get.sse({
      url: "/event",
      ...options
    });
  }
}
class OpencodeClient extends _HeyApiClient {
  /**
   * Respond to a permission request
   */
  postSessionIdPermissionsPermissionId(options) {
    return (options.client ?? this._client).post({
      url: "/session/{id}/permissions/{permissionID}",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  }
  global = new Global({ client: this._client });
  project = new Project({ client: this._client });
  pty = new Pty({ client: this._client });
  config = new Config({ client: this._client });
  tool = new Tool({ client: this._client });
  instance = new Instance({ client: this._client });
  path = new Path({ client: this._client });
  vcs = new Vcs({ client: this._client });
  session = new Session({ client: this._client });
  command = new Command({ client: this._client });
  provider = new Provider({ client: this._client });
  find = new Find({ client: this._client });
  file = new File({ client: this._client });
  app = new App({ client: this._client });
  mcp = new Mcp({ client: this._client });
  lsp = new Lsp({ client: this._client });
  formatter = new Formatter({ client: this._client });
  tui = new Tui({ client: this._client });
  auth = new Auth({ client: this._client });
  event = new Event({ client: this._client });
}
function wrapClientError(error, response, request, opts) {
  if (!opts?.throwOnError)
    return error;
  if (error instanceof Error)
    return error;
  if (typeof error === "object" && error !== null && Object.keys(error).length > 0) {
    const obj = error;
    const message = typeof obj.data?.message === "string" && obj.data.message || typeof obj.message === "string" && obj.message || typeof obj.name === "string" && obj.name || describe(request, response);
    return new Error(message, { cause: { body: error, status: response?.status } });
  }
  if (typeof error === "string" && error.length > 0) {
    return new Error(error, { cause: { body: error, status: response?.status } });
  }
  const reason = response ? "(empty response body)" : "network error (no response)";
  return new Error(`opencode server ${describe(request, response)}: ${reason}`, {
    cause: { body: error, status: response?.status }
  });
}
function describe(request, response) {
  const method = request?.method ?? "?";
  const url2 = request?.url ?? "?";
  const status = response?.status;
  const statusText = response?.statusText;
  return `${method} ${url2}${status ? " → " + status : ""}${statusText ? " " + statusText : ""}`;
}
function pick(value, fallback) {
  if (!value)
    return;
  if (!fallback)
    return value;
  if (value === fallback)
    return fallback;
  if (value === encodeURIComponent(fallback))
    return fallback;
  return value;
}
function rewrite(request, directory) {
  if (request.method !== "GET" && request.method !== "HEAD")
    return request;
  const value = pick(request.headers.get("x-opencode-directory"), directory);
  if (!value)
    return request;
  const url2 = new URL(request.url);
  if (!url2.searchParams.has("directory")) {
    url2.searchParams.set("directory", value);
  }
  const next = new Request(url2, request);
  next.headers.delete("x-opencode-directory");
  return next;
}
function createOpencodeClient(config) {
  if (!config?.fetch) {
    const customFetch = (req) => {
      req.timeout = false;
      return fetch(req);
    };
    config = {
      ...config,
      fetch: customFetch
    };
  }
  if (config?.directory) {
    config.headers = {
      ...config.headers,
      "x-opencode-directory": encodeURIComponent(config.directory)
    };
  }
  const client2 = createClient(config);
  client2.interceptors.request.use((request) => rewrite(request, config?.directory));
  client2.interceptors.error.use(wrapClientError);
  return new OpencodeClient({ client: client2 });
}
var commonjsGlobal = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var crossSpawn = { exports: {} };
var windows;
var hasRequiredWindows;
function requireWindows() {
  if (hasRequiredWindows) return windows;
  hasRequiredWindows = 1;
  windows = isexe;
  isexe.sync = sync;
  var fs = require$$0$1;
  function checkPathExt(path, options) {
    var pathext = options.pathExt !== void 0 ? options.pathExt : process.env.PATHEXT;
    if (!pathext) {
      return true;
    }
    pathext = pathext.split(";");
    if (pathext.indexOf("") !== -1) {
      return true;
    }
    for (var i = 0; i < pathext.length; i++) {
      var p = pathext[i].toLowerCase();
      if (p && path.substr(-p.length).toLowerCase() === p) {
        return true;
      }
    }
    return false;
  }
  function checkStat(stat, path, options) {
    if (!stat.isSymbolicLink() && !stat.isFile()) {
      return false;
    }
    return checkPathExt(path, options);
  }
  function isexe(path, options, cb) {
    fs.stat(path, function(er, stat) {
      cb(er, er ? false : checkStat(stat, path, options));
    });
  }
  function sync(path, options) {
    return checkStat(fs.statSync(path), path, options);
  }
  return windows;
}
var mode;
var hasRequiredMode;
function requireMode() {
  if (hasRequiredMode) return mode;
  hasRequiredMode = 1;
  mode = isexe;
  isexe.sync = sync;
  var fs = require$$0$1;
  function isexe(path, options, cb) {
    fs.stat(path, function(er, stat) {
      cb(er, er ? false : checkStat(stat, options));
    });
  }
  function sync(path, options) {
    return checkStat(fs.statSync(path), options);
  }
  function checkStat(stat, options) {
    return stat.isFile() && checkMode(stat, options);
  }
  function checkMode(stat, options) {
    var mod = stat.mode;
    var uid = stat.uid;
    var gid = stat.gid;
    var myUid = options.uid !== void 0 ? options.uid : process.getuid && process.getuid();
    var myGid = options.gid !== void 0 ? options.gid : process.getgid && process.getgid();
    var u = parseInt("100", 8);
    var g = parseInt("010", 8);
    var o = parseInt("001", 8);
    var ug = u | g;
    var ret = mod & o || mod & g && gid === myGid || mod & u && uid === myUid || mod & ug && myUid === 0;
    return ret;
  }
  return mode;
}
var isexe_1;
var hasRequiredIsexe;
function requireIsexe() {
  if (hasRequiredIsexe) return isexe_1;
  hasRequiredIsexe = 1;
  var core;
  if (process.platform === "win32" || commonjsGlobal.TESTING_WINDOWS) {
    core = requireWindows();
  } else {
    core = requireMode();
  }
  isexe_1 = isexe;
  isexe.sync = sync;
  function isexe(path, options, cb) {
    if (typeof options === "function") {
      cb = options;
      options = {};
    }
    if (!cb) {
      if (typeof Promise !== "function") {
        throw new TypeError("callback not provided");
      }
      return new Promise(function(resolve, reject) {
        isexe(path, options || {}, function(er, is) {
          if (er) {
            reject(er);
          } else {
            resolve(is);
          }
        });
      });
    }
    core(path, options || {}, function(er, is) {
      if (er) {
        if (er.code === "EACCES" || options && options.ignoreErrors) {
          er = null;
          is = false;
        }
      }
      cb(er, is);
    });
  }
  function sync(path, options) {
    try {
      return core.sync(path, options || {});
    } catch (er) {
      if (options && options.ignoreErrors || er.code === "EACCES") {
        return false;
      } else {
        throw er;
      }
    }
  }
  return isexe_1;
}
var which_1;
var hasRequiredWhich;
function requireWhich() {
  if (hasRequiredWhich) return which_1;
  hasRequiredWhich = 1;
  const isWindows = process.platform === "win32" || process.env.OSTYPE === "cygwin" || process.env.OSTYPE === "msys";
  const path = require$$0;
  const COLON = isWindows ? ";" : ":";
  const isexe = requireIsexe();
  const getNotFoundError = (cmd) => Object.assign(new Error(`not found: ${cmd}`), { code: "ENOENT" });
  const getPathInfo = (cmd, opt) => {
    const colon = opt.colon || COLON;
    const pathEnv = cmd.match(/\//) || isWindows && cmd.match(/\\/) ? [""] : [
      // windows always checks the cwd first
      ...isWindows ? [process.cwd()] : [],
      ...(opt.path || process.env.PATH || /* istanbul ignore next: very unusual */
      "").split(colon)
    ];
    const pathExtExe = isWindows ? opt.pathExt || process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM" : "";
    const pathExt = isWindows ? pathExtExe.split(colon) : [""];
    if (isWindows) {
      if (cmd.indexOf(".") !== -1 && pathExt[0] !== "")
        pathExt.unshift("");
    }
    return {
      pathEnv,
      pathExt,
      pathExtExe
    };
  };
  const which = (cmd, opt, cb) => {
    if (typeof opt === "function") {
      cb = opt;
      opt = {};
    }
    if (!opt)
      opt = {};
    const { pathEnv, pathExt, pathExtExe } = getPathInfo(cmd, opt);
    const found = [];
    const step = (i) => new Promise((resolve, reject) => {
      if (i === pathEnv.length)
        return opt.all && found.length ? resolve(found) : reject(getNotFoundError(cmd));
      const ppRaw = pathEnv[i];
      const pathPart = /^".*"$/.test(ppRaw) ? ppRaw.slice(1, -1) : ppRaw;
      const pCmd = path.join(pathPart, cmd);
      const p = !pathPart && /^\.[\\\/]/.test(cmd) ? cmd.slice(0, 2) + pCmd : pCmd;
      resolve(subStep(p, i, 0));
    });
    const subStep = (p, i, ii) => new Promise((resolve, reject) => {
      if (ii === pathExt.length)
        return resolve(step(i + 1));
      const ext = pathExt[ii];
      isexe(p + ext, { pathExt: pathExtExe }, (er, is) => {
        if (!er && is) {
          if (opt.all)
            found.push(p + ext);
          else
            return resolve(p + ext);
        }
        return resolve(subStep(p, i, ii + 1));
      });
    });
    return cb ? step(0).then((res) => cb(null, res), cb) : step(0);
  };
  const whichSync = (cmd, opt) => {
    opt = opt || {};
    const { pathEnv, pathExt, pathExtExe } = getPathInfo(cmd, opt);
    const found = [];
    for (let i = 0; i < pathEnv.length; i++) {
      const ppRaw = pathEnv[i];
      const pathPart = /^".*"$/.test(ppRaw) ? ppRaw.slice(1, -1) : ppRaw;
      const pCmd = path.join(pathPart, cmd);
      const p = !pathPart && /^\.[\\\/]/.test(cmd) ? cmd.slice(0, 2) + pCmd : pCmd;
      for (let j = 0; j < pathExt.length; j++) {
        const cur = p + pathExt[j];
        try {
          const is = isexe.sync(cur, { pathExt: pathExtExe });
          if (is) {
            if (opt.all)
              found.push(cur);
            else
              return cur;
          }
        } catch (ex) {
        }
      }
    }
    if (opt.all && found.length)
      return found;
    if (opt.nothrow)
      return null;
    throw getNotFoundError(cmd);
  };
  which_1 = which;
  which.sync = whichSync;
  return which_1;
}
var pathKey = { exports: {} };
var hasRequiredPathKey;
function requirePathKey() {
  if (hasRequiredPathKey) return pathKey.exports;
  hasRequiredPathKey = 1;
  const pathKey$1 = (options = {}) => {
    const environment = options.env || process.env;
    const platform = options.platform || process.platform;
    if (platform !== "win32") {
      return "PATH";
    }
    return Object.keys(environment).reverse().find((key) => key.toUpperCase() === "PATH") || "Path";
  };
  pathKey.exports = pathKey$1;
  pathKey.exports.default = pathKey$1;
  return pathKey.exports;
}
var resolveCommand_1;
var hasRequiredResolveCommand;
function requireResolveCommand() {
  if (hasRequiredResolveCommand) return resolveCommand_1;
  hasRequiredResolveCommand = 1;
  const path = require$$0;
  const which = requireWhich();
  const getPathKey = requirePathKey();
  function resolveCommandAttempt(parsed, withoutPathExt) {
    const env = parsed.options.env || process.env;
    const cwd = process.cwd();
    const hasCustomCwd = parsed.options.cwd != null;
    const shouldSwitchCwd = hasCustomCwd && process.chdir !== void 0 && !process.chdir.disabled;
    if (shouldSwitchCwd) {
      try {
        process.chdir(parsed.options.cwd);
      } catch (err) {
      }
    }
    let resolved;
    try {
      resolved = which.sync(parsed.command, {
        path: env[getPathKey({ env })],
        pathExt: withoutPathExt ? path.delimiter : void 0
      });
    } catch (e) {
    } finally {
      if (shouldSwitchCwd) {
        process.chdir(cwd);
      }
    }
    if (resolved) {
      resolved = path.resolve(hasCustomCwd ? parsed.options.cwd : "", resolved);
    }
    return resolved;
  }
  function resolveCommand(parsed) {
    return resolveCommandAttempt(parsed) || resolveCommandAttempt(parsed, true);
  }
  resolveCommand_1 = resolveCommand;
  return resolveCommand_1;
}
var _escape = {};
var hasRequired_escape;
function require_escape() {
  if (hasRequired_escape) return _escape;
  hasRequired_escape = 1;
  const metaCharsRegExp = /([()\][%!^"`<>&|;, *?])/g;
  function escapeCommand(arg) {
    arg = arg.replace(metaCharsRegExp, "^$1");
    return arg;
  }
  function escapeArgument(arg, doubleEscapeMetaChars) {
    arg = `${arg}`;
    arg = arg.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"');
    arg = arg.replace(/(?=(\\+?)?)\1$/, "$1$1");
    arg = `"${arg}"`;
    arg = arg.replace(metaCharsRegExp, "^$1");
    if (doubleEscapeMetaChars) {
      arg = arg.replace(metaCharsRegExp, "^$1");
    }
    return arg;
  }
  _escape.command = escapeCommand;
  _escape.argument = escapeArgument;
  return _escape;
}
var shebangRegex;
var hasRequiredShebangRegex;
function requireShebangRegex() {
  if (hasRequiredShebangRegex) return shebangRegex;
  hasRequiredShebangRegex = 1;
  shebangRegex = /^#!(.*)/;
  return shebangRegex;
}
var shebangCommand;
var hasRequiredShebangCommand;
function requireShebangCommand() {
  if (hasRequiredShebangCommand) return shebangCommand;
  hasRequiredShebangCommand = 1;
  const shebangRegex2 = requireShebangRegex();
  shebangCommand = (string = "") => {
    const match = string.match(shebangRegex2);
    if (!match) {
      return null;
    }
    const [path, argument] = match[0].replace(/#! ?/, "").split(" ");
    const binary = path.split("/").pop();
    if (binary === "env") {
      return argument;
    }
    return argument ? `${binary} ${argument}` : binary;
  };
  return shebangCommand;
}
var readShebang_1;
var hasRequiredReadShebang;
function requireReadShebang() {
  if (hasRequiredReadShebang) return readShebang_1;
  hasRequiredReadShebang = 1;
  const fs = require$$0$1;
  const shebangCommand2 = requireShebangCommand();
  function readShebang(command) {
    const size = 150;
    const buffer = Buffer.alloc(size);
    let fd;
    try {
      fd = fs.openSync(command, "r");
      fs.readSync(fd, buffer, 0, size, 0);
      fs.closeSync(fd);
    } catch (e) {
    }
    return shebangCommand2(buffer.toString());
  }
  readShebang_1 = readShebang;
  return readShebang_1;
}
var parse_1;
var hasRequiredParse;
function requireParse() {
  if (hasRequiredParse) return parse_1;
  hasRequiredParse = 1;
  const path = require$$0;
  const resolveCommand = requireResolveCommand();
  const escape = require_escape();
  const readShebang = requireReadShebang();
  const isWin = process.platform === "win32";
  const isExecutableRegExp = /\.(?:com|exe)$/i;
  const isCmdShimRegExp = /node_modules[\\/].bin[\\/][^\\/]+\.cmd$/i;
  function detectShebang(parsed) {
    parsed.file = resolveCommand(parsed);
    const shebang = parsed.file && readShebang(parsed.file);
    if (shebang) {
      parsed.args.unshift(parsed.file);
      parsed.command = shebang;
      return resolveCommand(parsed);
    }
    return parsed.file;
  }
  function parseNonShell(parsed) {
    if (!isWin) {
      return parsed;
    }
    const commandFile = detectShebang(parsed);
    const needsShell = !isExecutableRegExp.test(commandFile);
    if (parsed.options.forceShell || needsShell) {
      const needsDoubleEscapeMetaChars = isCmdShimRegExp.test(commandFile);
      parsed.command = path.normalize(parsed.command);
      parsed.command = escape.command(parsed.command);
      parsed.args = parsed.args.map((arg) => escape.argument(arg, needsDoubleEscapeMetaChars));
      const shellCommand = [parsed.command].concat(parsed.args).join(" ");
      parsed.args = ["/d", "/s", "/c", `"${shellCommand}"`];
      parsed.command = process.env.comspec || "cmd.exe";
      parsed.options.windowsVerbatimArguments = true;
    }
    return parsed;
  }
  function parse(command, args, options) {
    if (args && !Array.isArray(args)) {
      options = args;
      args = null;
    }
    args = args ? args.slice(0) : [];
    options = Object.assign({}, options);
    const parsed = {
      command,
      args,
      options,
      file: void 0,
      original: {
        command,
        args
      }
    };
    return options.shell ? parsed : parseNonShell(parsed);
  }
  parse_1 = parse;
  return parse_1;
}
var enoent;
var hasRequiredEnoent;
function requireEnoent() {
  if (hasRequiredEnoent) return enoent;
  hasRequiredEnoent = 1;
  const isWin = process.platform === "win32";
  function notFoundError(original, syscall) {
    return Object.assign(new Error(`${syscall} ${original.command} ENOENT`), {
      code: "ENOENT",
      errno: "ENOENT",
      syscall: `${syscall} ${original.command}`,
      path: original.command,
      spawnargs: original.args
    });
  }
  function hookChildProcess(cp, parsed) {
    if (!isWin) {
      return;
    }
    const originalEmit = cp.emit;
    cp.emit = function(name, arg1) {
      if (name === "exit") {
        const err = verifyENOENT(arg1, parsed);
        if (err) {
          return originalEmit.call(cp, "error", err);
        }
      }
      return originalEmit.apply(cp, arguments);
    };
  }
  function verifyENOENT(status, parsed) {
    if (isWin && status === 1 && !parsed.file) {
      return notFoundError(parsed.original, "spawn");
    }
    return null;
  }
  function verifyENOENTSync(status, parsed) {
    if (isWin && status === 1 && !parsed.file) {
      return notFoundError(parsed.original, "spawnSync");
    }
    return null;
  }
  enoent = {
    hookChildProcess,
    verifyENOENT,
    verifyENOENTSync,
    notFoundError
  };
  return enoent;
}
var hasRequiredCrossSpawn;
function requireCrossSpawn() {
  if (hasRequiredCrossSpawn) return crossSpawn.exports;
  hasRequiredCrossSpawn = 1;
  const cp = require$$0$2;
  const parse = requireParse();
  const enoent2 = requireEnoent();
  function spawn(command, args, options) {
    const parsed = parse(command, args, options);
    const spawned = cp.spawn(parsed.command, parsed.args, parsed.options);
    enoent2.hookChildProcess(spawned, parsed);
    return spawned;
  }
  function spawnSync(command, args, options) {
    const parsed = parse(command, args, options);
    const result = cp.spawnSync(parsed.command, parsed.args, parsed.options);
    result.error = result.error || enoent2.verifyENOENTSync(result.status, parsed);
    return result;
  }
  crossSpawn.exports = spawn;
  crossSpawn.exports.spawn = spawn;
  crossSpawn.exports.sync = spawnSync;
  crossSpawn.exports._parse = parse;
  crossSpawn.exports._enoent = enoent2;
  return crossSpawn.exports;
}
var crossSpawnExports = requireCrossSpawn();
const launch = /* @__PURE__ */ getDefaultExportFromCjs(crossSpawnExports);
function stop(proc) {
  if (proc.exitCode !== null || proc.signalCode !== null)
    return;
  if (process.platform === "win32" && proc.pid) {
    const out = node_child_process.spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { windowsHide: true });
    if (!out.error && out.status === 0)
      return;
  }
  proc.kill();
}
function bindAbort(proc, signal, onAbort) {
  if (!signal)
    return () => {
    };
  const abort = () => {
    clear();
    stop(proc);
    onAbort?.();
  };
  const clear = () => {
    signal.removeEventListener("abort", abort);
    proc.off("exit", clear);
    proc.off("error", clear);
  };
  signal.addEventListener("abort", abort, { once: true });
  proc.on("exit", clear);
  proc.on("error", clear);
  if (signal.aborted)
    abort();
  return clear;
}
async function createOpencodeServer(options) {
  options = Object.assign({
    hostname: "127.0.0.1",
    port: 4096,
    timeout: 5e3
  }, options ?? {});
  const args = [`serve`, `--hostname=${options.hostname}`, `--port=${options.port}`];
  if (options.config?.logLevel)
    args.push(`--log-level=${options.config.logLevel}`);
  const proc = launch(getOpencodePath(), args, {
    env: {
      ...process.env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify(options.config ?? {})
    }
  });
  let clear = () => {
  };
  const url2 = await new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      clear();
      stop(proc);
      reject(new Error(`Timeout waiting for server to start after ${options.timeout}ms`));
    }, options.timeout);
    let output = "";
    let resolved = false;
    proc.stdout?.on("data", (chunk) => {
      if (resolved)
        return;
      output += chunk.toString();
      const lines = output.split("\n");
      for (const line of lines) {
        if (line.startsWith("opencode server listening")) {
          const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
          if (!match) {
            clear();
            stop(proc);
            clearTimeout(id);
            reject(new Error(`Failed to parse server url from output: ${line}`));
            return;
          }
          clearTimeout(id);
          resolved = true;
          resolve(match[1]);
          return;
        }
      }
    });
    proc.stderr?.on("data", (chunk) => {
      output += chunk.toString();
    });
    proc.on("exit", (code) => {
      clearTimeout(id);
      let msg = `Server exited with code ${code}`;
      if (output.trim()) {
        msg += `
Server output: ${output}`;
      }
      reject(new Error(msg));
    });
    proc.on("error", (error) => {
      clearTimeout(id);
      reject(error);
    });
    clear = bindAbort(proc, options.signal, () => {
      clearTimeout(id);
      reject(options.signal?.reason);
    });
  });
  return {
    url: url2,
    close() {
      clear();
      stop(proc);
    }
  };
}
async function createOpencode(options) {
  const server = await createOpencodeServer({
    ...options
  });
  const client2 = createOpencodeClient({
    baseUrl: server.url
  });
  return {
    client: client2,
    server
  };
}
let _instance = null;
let _startPromise = null;
let _eventAbort = null;
let _mainWindow = null;
let _currentProjectDir = null;
function getClient() {
  if (!_instance) throw new Error("OpenCode server not started");
  return _instance.client;
}
async function spawnOpenCodeServer(port, cwd) {
  const savedCwd = process.cwd();
  process.chdir(cwd);
  const raw = createOpencode({ hostname: "127.0.0.1", port, timeout: 15e3 });
  process.chdir(savedCwd);
  const resolved = await raw;
  const client2 = createOpencodeClient({ baseUrl: resolved.server.url, directory: cwd });
  return { server: resolved.server, client: client2 };
}
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}
function normalizeTitle(title) {
  if (!title) return "New Session";
  if (/^New session\s*[-\u2013]\s*\d{4}-\d{2}-\d{2}/i.test(title)) return "New Session";
  return title;
}
const AGENT_STORE_KEY = "agentPanel";
const AGENT_DEFAULTS = {
  width: 360,
  visible: true,
  selectedProvider: "anthropic",
  selectedModel: "claude-opus-4-5",
  mode: "build",
  encryptedKeys: {}
};
function getAgentStore() {
  const store2 = getStore();
  return store2.get(AGENT_STORE_KEY) ?? AGENT_DEFAULTS;
}
function setAgentStore(data) {
  const store2 = getStore();
  const current = getAgentStore();
  store2.set(AGENT_STORE_KEY, { ...current, ...data });
}
async function startEventSubscription(win) {
  if (_eventAbort) {
    _eventAbort.abort();
  }
  _eventAbort = new AbortController();
  const client2 = getClient();
  try {
    const response = await client2.event.subscribe();
    for await (const event of response.stream) {
      if (_eventAbort?.signal.aborted) break;
      const e = event;
      console.log("[Agent][SSE]", JSON.stringify({ type: e?.type, properties: e?.properties }));
      if (e?.type === "permission.asked") {
        const { id: permissionID, sessionID } = e.properties ?? {};
        if (permissionID && sessionID) {
          client2.postSessionIdPermissionsPermissionId({
            path: { id: sessionID, permissionID },
            body: { response: "always" }
          }).catch((err) => {
            console.warn("[Agent] Failed to approve permission:", permissionID, err);
          });
        }
        continue;
      }
      if (!win.isDestroyed()) {
        win.webContents.send("agent:event", event);
      }
    }
  } catch (err) {
    if (!_eventAbort?.signal.aborted) {
      console.error("[Agent] Event subscription error:", err);
    }
  }
}
function getMimeType(ext) {
  const map = {
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
    ts: "text/plain",
    tsx: "text/plain",
    js: "text/plain",
    jsx: "text/plain",
    css: "text/css",
    html: "text/html",
    xml: "text/xml",
    py: "text/plain",
    rs: "text/plain",
    go: "text/plain",
    java: "text/plain",
    c: "text/plain",
    cpp: "text/plain",
    h: "text/plain",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf"
  };
  return map[ext] ?? "text/plain";
}
function registerAgentHandlers(win) {
  _mainWindow = win;
  electron.ipcMain.handle("agent:startServer", async () => {
    if (_instance) return { ok: true };
    if (!_startPromise) {
      _startPromise = (async () => {
        try {
          const port = await findFreePort();
          const cwd = _currentProjectDir ?? process.cwd();
          _instance = await spawnOpenCodeServer(port, cwd);
          console.log("[Agent] OpenCode server started at", _instance.server.url, "cwd:", cwd);
          return { ok: true };
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          console.error("[Agent] Failed to start OpenCode server:", error);
          return { ok: false, error };
        } finally {
          _startPromise = null;
        }
      })();
    }
    return _startPromise;
  });
  electron.ipcMain.handle("agent:setProject", async (_e, dir) => {
    if (!dir || typeof dir !== "string") return;
    if (_currentProjectDir === dir && _instance) return;
    _currentProjectDir = dir;
    if (!_instance) return;
    _eventAbort?.abort();
    _eventAbort = null;
    const oldInstance = _instance;
    _instance = null;
    _startPromise = null;
    setTimeout(() => oldInstance.server.close(), 500);
    try {
      const port = await findFreePort();
      _instance = await spawnOpenCodeServer(port, dir);
      console.log("[Agent] OpenCode restarted for project:", dir, "at", _instance.server.url);
      if (_mainWindow && !_mainWindow.isDestroyed()) {
        await startEventSubscription(_mainWindow);
      }
    } catch (err) {
      console.error("[Agent] Failed to restart OpenCode for project:", err);
    }
  });
  electron.ipcMain.handle("agent:ping", async () => {
    try {
      const client2 = getClient();
      const result = await client2.session.list();
      return result.error == null;
    } catch {
      return false;
    }
  });
  electron.ipcMain.handle("agent:createSession", async (_e, directory) => {
    const client2 = getClient();
    const opts = {};
    if (directory && typeof directory === "string") opts.query = { directory };
    const result = await client2.session.create(opts);
    if (result.error) throw new Error(String(result.error));
    const s = result.data;
    return { id: s.id, title: normalizeTitle(s.title), createdAt: s.time?.created ?? Date.now() };
  });
  electron.ipcMain.handle("agent:listSessions", async () => {
    try {
      const client2 = getClient();
      const result = await client2.session.list();
      if (result.error) return [];
      const sessions = result.data ?? [];
      return sessions.map((s) => ({
        id: s.id,
        title: normalizeTitle(s.title),
        createdAt: s.time?.created ?? Date.now()
      }));
    } catch {
      return [];
    }
  });
  electron.ipcMain.handle("agent:deleteSession", async (_e, id) => {
    if (!id || typeof id !== "string") throw new Error("Invalid session id");
    const client2 = getClient();
    await client2.session.delete({ path: { id } });
  });
  electron.ipcMain.handle("agent:getMessages", async (_e, sessionId) => {
    if (!sessionId || typeof sessionId !== "string") return [];
    try {
      const client2 = getClient();
      const result = await client2.session.messages({ path: { id: sessionId } });
      if (result.error) return [];
      const raw = result.data ?? [];
      const mapped = raw.map((item) => ({
        id: item.info.id,
        role: item.info.role,
        parts: (item.parts ?? []).flatMap((p) => {
          if (p.type === "text") return [{ type: "text", text: p.text ?? "" }];
          if (p.type === "tool") {
            const state = p.state;
            return [{
              type: "tool",
              callID: p.callID ?? p.id ?? "",
              toolName: p.tool ?? "",
              args: state?.input ?? {},
              result: state?.output ?? state?.error,
              status: state?.status ?? "pending"
            }];
          }
          return [];
        }),
        createdAt: item.info.time?.created ?? Date.now()
      }));
      return mapped.filter((msg) => {
        if (msg.role !== "user") return true;
        const text = msg.parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("");
        return !text.startsWith("当前项目目录:");
      });
    } catch {
      return [];
    }
  });
  electron.ipcMain.handle("agent:pickFile", async () => {
    const win2 = _mainWindow;
    if (!win2) return [];
    const result = await electron.dialog.showOpenDialog(win2, {
      title: "选择附件",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "代码 / 文本", extensions: ["ts", "tsx", "js", "jsx", "json", "md", "txt", "css", "html", "py", "rs", "go", "java", "c", "cpp", "h"] },
        { name: "图片", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] },
        { name: "所有文件", extensions: ["*"] }
      ]
    });
    if (result.canceled) return [];
    return result.filePaths.map((filePath) => ({
      name: require$$0__namespace.basename(filePath),
      mime: getMimeType(require$$0__namespace.extname(filePath).toLowerCase().slice(1)),
      url: url.pathToFileURL(filePath).href
    }));
  });
  electron.ipcMain.handle("agent:sendPrompt", async (_e, sessionId, text, projectDir, mode2, files) => {
    if (!sessionId || typeof sessionId !== "string") throw new Error("Invalid session id");
    if (typeof text !== "string" || text.trim() === "") throw new Error("Empty message");
    const client2 = getClient();
    const agentData = getAgentStore();
    const fileParts = (files ?? []).map((f) => ({
      type: "file",
      mime: f.mime,
      url: f.url,
      filename: f.name
    }));
    client2.session.promptAsync({
      path: { id: sessionId },
      body: {
        model: {
          providerID: agentData.selectedProvider,
          modelID: agentData.selectedModel
        },
        ...mode2 ? { agent: mode2 } : {},
        parts: [...fileParts, { type: "text", text }]
      }
    }).catch((err) => {
      if (!win.isDestroyed()) {
        win.webContents.send("agent:event", {
          type: "session.error",
          properties: { sessionID: sessionId, error: { name: "UnknownError", data: { message: err.message } } }
        });
      }
    });
  });
  electron.ipcMain.handle("agent:abortSession", async (_e, sessionId) => {
    if (!sessionId || typeof sessionId !== "string") return;
    try {
      const client2 = getClient();
      await client2.session.abort({ path: { id: sessionId } });
    } catch {
    }
  });
  electron.ipcMain.handle("agent:listProviders", async () => {
    const client2 = getClient();
    try {
      const result = await client2.config.providers();
      if (result.error) return [];
      const providers = result.data?.providers ?? [];
      return providers.map((p) => ({
        id: p.id ?? p.name,
        name: p.name ?? p.id,
        // models is a dict { [modelId]: Model }, not an array
        models: Object.values(p.models ?? {}).map((m) => ({
          id: m.id ?? m.providerID,
          name: m.name ?? m.id
        }))
      }));
    } catch {
      return [];
    }
  });
  electron.ipcMain.handle("agent:getConfig", async () => {
    try {
      const client2 = getClient();
      const [cfgResult, provResult] = await Promise.all([
        client2.config.get().catch(() => ({ data: null, error: true })),
        client2.config.providers().catch(() => ({ data: null, error: true }))
      ]);
      const cfg = cfgResult.data;
      const provData = provResult.data;
      const rawProviders = provData?.providers ?? [];
      const defaults = provData?.default ?? {};
      const cfgModel = cfg?.model ?? "";
      const [cfgProvider = "", cfgModelId = ""] = cfgModel.includes("/") ? cfgModel.split("/") : ["", ""];
      const defaultEntries = Object.entries(defaults);
      const defaultProviderId = cfgProvider || (defaultEntries[0]?.[0] ?? "");
      const defaultModelId = cfgModelId || (defaultEntries[0]?.[1] ?? "");
      const freeModels = [];
      const providerGroups = [];
      for (const p of rawProviders) {
        const pid = p.id ?? p.name ?? "";
        const pname = p.name ?? p.id ?? "";
        const models = Object.values(p.models ?? {}).map((m) => ({
          id: m.id,
          name: m.name ?? m.id,
          cost: m.cost
        }));
        const free = models.filter(
          (m) => m.cost?.input === 0 && m.cost?.output === 0 || m.name.toLowerCase().includes("free")
        );
        for (const fm of free) {
          freeModels.push({ id: fm.id, name: fm.name, providerId: pid });
        }
        providerGroups.push({
          id: pid,
          name: pname,
          models: models.map((m) => ({ id: m.id, name: m.name }))
        });
      }
      return { freeModels, providerGroups, defaultProviderId, defaultModelId };
    } catch {
      return { freeModels: [], providerGroups: [], defaultProviderId: "", defaultModelId: "" };
    }
  });
  electron.ipcMain.handle("agent:setApiKey", async (_e, providerId, key) => {
    if (!providerId || typeof providerId !== "string") throw new Error("Invalid provider id");
    if (typeof key !== "string") throw new Error("Invalid key");
    const client2 = getClient();
    await client2.auth.set({
      path: { id: providerId },
      body: { type: "api", key }
    });
    const agentData = getAgentStore();
    const encryptedKeys = { ...agentData.encryptedKeys };
    if (electron.safeStorage.isEncryptionAvailable()) {
      encryptedKeys[providerId] = electron.safeStorage.encryptString(key).toString("base64");
    }
    setAgentStore({ encryptedKeys });
  });
  electron.ipcMain.handle("agent:listCatalogProviders", async () => {
    try {
      const client2 = getClient();
      const [listResult, authResult] = await Promise.all([
        client2.provider.list().catch(() => ({ data: null, error: true })),
        client2.provider.auth().catch(() => ({ data: null, error: true }))
      ]);
      const listData = listResult.data;
      const authData = authResult.data;
      if (!listData) return [];
      const all = listData.all ?? [];
      const connected = listData.connected ?? [];
      const authMap = authData ?? {};
      return all.map((p) => ({
        id: p.id ?? p.name,
        name: p.name ?? p.id,
        env: Array.isArray(p.env) ? p.env : [],
        api: p.api,
        npm: p.npm,
        connected: connected.includes(p.id),
        authMethods: authMap[p.id] ?? [],
        // models is a dict { [modelId]: Model }
        models: Object.values(p.models ?? {}).map((m) => ({
          id: m.id,
          name: m.name ?? m.id
        }))
      }));
    } catch {
      return [];
    }
  });
  electron.ipcMain.handle("agent:getPrefs", () => {
    const { width, visible, selectedProvider, selectedModel, mode: mode2 } = getAgentStore();
    return { width, visible, selectedProvider, selectedModel, mode: mode2 };
  });
  electron.ipcMain.handle("agent:setPrefs", (_e, prefs) => {
    setAgentStore(prefs);
  });
  electron.ipcMain.handle("agent:subscribe", async () => {
    await startEventSubscription(win);
  });
  electron.ipcMain.handle("agent:unsubscribe", () => {
    _eventAbort?.abort();
    _eventAbort = null;
  });
}
function stopAgentSubscription() {
  _eventAbort?.abort();
  _eventAbort = null;
  if (_instance) {
    _instance.server.close();
    _instance = null;
  }
  _currentProjectDir = null;
}
class StaticServer {
  server = null;
  port = 0;
  appDir = null;
  frontendDir = null;
  async start(appDir, frontendDir) {
    const resolvedFrontendDir = require$$0.normalize(frontendDir ?? require$$0.join(appDir, "frontend"));
    if (this.server && this.appDir === appDir && this.frontendDir === resolvedFrontendDir) {
      return { url: this.getUrl(), port: this.port };
    }
    this.stop();
    this.appDir = appDir;
    this.frontendDir = resolvedFrontendDir;
    return new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => this.handleRequest(req, res));
      srv.listen(0, "127.0.0.1", () => {
        const addr = srv.address();
        if (!addr || typeof addr === "string") {
          reject(new Error("Failed to bind server"));
          return;
        }
        this.port = addr.port;
        this.server = srv;
        resolve({ url: `http://127.0.0.1:${this.port}`, port: this.port });
      });
      srv.on("error", reject);
    });
  }
  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.port = 0;
      this.appDir = null;
      this.frontendDir = null;
    }
  }
  getUrl() {
    if (!this.server || !this.port) return null;
    return `http://127.0.0.1:${this.port}`;
  }
  handleRequest(req, res) {
    if (!this.appDir) {
      res.writeHead(503);
      res.end("Server not configured");
      return;
    }
    const rawUrl = req.url ?? "/";
    const urlPath = rawUrl.split("?")[0].replace(/\.{2,}/g, "").replace(/\\/g, "/");
    if (urlPath.startsWith("/.devtool/storage/")) {
      const rawKey = urlPath.slice("/.devtool/storage/".length);
      const safeKey = rawKey.split("/").filter((p) => p.length > 0 && p !== "." && p !== "..").join("/");
      if (!safeKey) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const storageBase = require$$0.join(this.appDir, ".devtool", "storage");
      const storageFilePath = require$$0.join(storageBase, safeKey);
      if (!storageFilePath.startsWith(storageBase)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      if (!require$$0$1.existsSync(storageFilePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      try {
        const stat = require$$0$1.statSync(storageFilePath);
        res.writeHead(200, {
          "Content-Type": getMimeType$1(storageFilePath),
          "Content-Length": stat.size,
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*"
        });
        require$$0$1.createReadStream(storageFilePath).pipe(res);
      } catch {
        res.writeHead(500);
        res.end("Internal server error");
      }
      return;
    }
    const relPath = urlPath === "/" ? "/index.html" : urlPath;
    const servingDir = this.frontendDir ?? require$$0.join(this.appDir, "frontend");
    const filePath = require$$0.join(servingDir, relPath);
    if (!filePath.startsWith(servingDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    if (!require$$0$1.existsSync(filePath)) {
      if (!shouldSpaFallback(relPath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const indexPath = require$$0.join(servingDir, "index.html");
      if (require$$0$1.existsSync(indexPath)) {
        this.serveFile(indexPath, res);
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
      return;
    }
    this.serveFile(filePath, res);
  }
  serveFile(filePath, res) {
    try {
      const stat = require$$0$1.statSync(filePath);
      if (stat.isDirectory()) {
        const indexPath = require$$0.join(filePath, "index.html");
        if (require$$0$1.existsSync(indexPath)) {
          this.serveFile(indexPath, res);
        } else {
          res.writeHead(403);
          res.end("Directory listing not allowed");
        }
        return;
      }
      const ext = require$$0.extname(filePath).toLowerCase();
      const isHtml = ext === ".html" || ext === ".htm";
      const contentType = getMimeType$1(filePath);
      if (isHtml) {
        const raw = require$$0$1.readFileSync(filePath, "utf-8");
        const bootstrapped = injectBootstrap(raw);
        const HIDE_SCROLLBAR = `<style>::-webkit-scrollbar{display:none!important}*{scrollbar-width:none!important;-ms-overflow-style:none!important}</style>`;
        const html = bootstrapped.includes("</head>") ? bootstrapped.replace("</head>", HIDE_SCROLLBAR + "</head>") : bootstrapped.includes("<body") ? bootstrapped.replace("<body", HIDE_SCROLLBAR + "<body") : HIDE_SCROLLBAR + bootstrapped;
        const buf = Buffer.from(html, "utf-8");
        res.writeHead(200, {
          "Content-Type": contentType,
          "Content-Length": buf.length,
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*"
        });
        res.end(buf);
        return;
      }
      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": stat.size,
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*"
      });
      const stream = require$$0$1.createReadStream(filePath);
      stream.pipe(res);
      stream.on("error", () => {
        res.end();
      });
    } catch {
      res.writeHead(500);
      res.end("Internal server error");
    }
  }
}
class Store {
  constructor(defaults) {
    this.defaults = defaults;
    const dir = require$$0.join(electron.app.getPath("userData"), "devtool");
    require$$0$1.mkdirSync(dir, { recursive: true });
    this.filePath = require$$0.join(dir, "preferences.json");
    this.data = this.load();
  }
  data;
  filePath;
  load() {
    try {
      if (require$$0$1.existsSync(this.filePath)) {
        const raw = require$$0$1.readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(raw);
        return { ...this.defaults, ...parsed };
      }
    } catch {
    }
    return { ...this.defaults };
  }
  save() {
    try {
      require$$0$1.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
    } catch {
    }
  }
  get(key) {
    return this.data[key] ?? this.defaults[key];
  }
  set(key, value) {
    this.data[key] = value;
    this.save();
  }
}
electronUpdater.autoUpdater.autoDownload = false;
electronUpdater.autoUpdater.autoInstallOnAppQuit = true;
electronUpdater.autoUpdater.allowPrerelease = false;
electronUpdater.autoUpdater.allowDowngrade = false;
function broadcast(win, status) {
  if (!win.isDestroyed()) {
    win.webContents.send("update:status", status);
  }
}
function initUpdater(win) {
  if (!electron.app.isPackaged) return;
  electronUpdater.autoUpdater.on("checking-for-update", () => {
    broadcast(win, { state: "checking" });
  });
  electronUpdater.autoUpdater.on("update-available", (info) => {
    broadcast(win, {
      state: "available",
      version: info.version,
      releaseDate: info.releaseDate ?? ""
    });
  });
  electronUpdater.autoUpdater.on("update-not-available", () => {
    broadcast(win, { state: "not-available" });
  });
  electronUpdater.autoUpdater.on("download-progress", (progress) => {
    const currentVersion = electronUpdater.autoUpdater.currentVersion?.version ?? "";
    broadcast(win, {
      state: "downloading",
      version: currentVersion,
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      total: progress.total,
      transferred: progress.transferred
    });
  });
  electronUpdater.autoUpdater.on("update-downloaded", (info) => {
    broadcast(win, { state: "downloaded", version: info.version });
  });
  electronUpdater.autoUpdater.on("error", (err) => {
    broadcast(win, { state: "error", message: err.message });
  });
  electron.ipcMain.handle("update:check", async () => {
    try {
      await electronUpdater.autoUpdater.checkForUpdates();
    } catch {
    }
  });
  electron.ipcMain.handle("update:download", async () => {
    await electronUpdater.autoUpdater.downloadUpdate();
  });
  electron.ipcMain.handle("update:install", () => {
    electronUpdater.autoUpdater.quitAndInstall(false, true);
  });
  setTimeout(() => {
    electronUpdater.autoUpdater.checkForUpdates().catch(() => {
    });
  }, 5e3);
}
let mainWindow = null;
const STORE_DEFAULTS = {
  recentFolders: [],
  lastMockContext: {
    userId: "dev_user_001",
    deviceId: "dev_device_local",
    scopes: ["db.*"]
  },
  lastInputs: {},
  windowBounds: { x: 0, y: 0, width: 820, height: 520 },
  mainWindowBounds: { width: 1280, height: 800 },
  theme: "system",
  locale: "zh",
  guideShown: false,
  panelSplit: 50,
  agentPanel: {
    width: 360,
    visible: false,
    selectedProvider: "anthropic",
    selectedModel: "claude-opus-4-5",
    encryptedKeys: {}
  }
};
let _store = null;
function getStore() {
  if (!_store) _store = new Store(STORE_DEFAULTS);
  return _store;
}
const store = {
  get: (key) => getStore().get(key),
  set: (key, value) => getStore().set(key, value)
};
const staticServer = new StaticServer();
let inMainMode = false;
function getWindowIconPath() {
  return electron.app.isPackaged ? require$$0.join(process.resourcesPath, "logo.ico") : require$$0.join(__dirname, "../../resources/logo.ico");
}
function createWindow() {
  const theme = store.get("theme");
  if (theme !== "system") {
    electron.nativeTheme.themeSource = theme;
  }
  mainWindow = new electron.BrowserWindow({
    width: 820,
    height: 520,
    minWidth: 620,
    minHeight: 420,
    frame: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    webPreferences: {
      preload: require$$0.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    },
    icon: process.platform === "win32" ? getWindowIconPath() : void 0,
    backgroundColor: "#F2F2F7",
    show: false
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(require$$0.join(__dirname, "../renderer/index.html"));
  }
  mainWindow.once("ready-to-show", () => {
    mainWindow.center();
    mainWindow.show();
    if (process.env.NODE_ENV === "development") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  });
  mainWindow.on("close", () => {
    if (mainWindow && inMainMode) {
      const b = mainWindow.getBounds();
      store.set("mainWindowBounds", { width: b.width, height: b.height });
    }
    staticServer.stop();
    stopAgentSubscription();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url: url2 }) => {
    electron.shell.openExternal(url2);
    return { action: "deny" };
  });
  return mainWindow;
}
electron.app.whenReady().then(() => {
  if (process.platform === "win32") {
    electron.app.setAppUserModelId("com.shapp.devtool");
  }
  const win = createWindow();
  registerPackageHandlers(win);
  registerExecutionHandlers(win);
  setServerUrlGetter(() => staticServer.getUrl());
  registerKvHandlers();
  registerServerHandlers();
  registerCaptureHandlers(win);
  registerAgentHandlers(win);
  electron.ipcMain.on("window:minimize", () => win.minimize());
  electron.ipcMain.on("window:maximize", () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  electron.ipcMain.on("window:close", () => win.close());
  electron.ipcMain.on("window:openDevTools", () => win.webContents.openDevTools({ mode: "detach" }));
  electron.ipcMain.on("window:enterMain", () => {
    inMainMode = true;
    win.setMinimumSize(900, 600);
    if (!win.isMaximized()) {
      win.maximize();
    }
  });
  electron.ipcMain.on("window:enterWelcome", () => {
    if (inMainMode) {
      const b = win.getBounds();
      store.set("mainWindowBounds", { width: b.width, height: b.height });
    }
    inMainMode = false;
    if (win.isMaximized()) {
      win.unmaximize();
    }
    win.setMinimumSize(620, 420);
    win.setSize(820, 520);
    win.center();
  });
  electron.ipcMain.handle("theme:get", () => store.get("theme"));
  electron.ipcMain.handle("theme:set", (_e, theme) => {
    store.set("theme", theme);
    electron.nativeTheme.themeSource = theme === "system" ? "system" : theme;
  });
  electron.ipcMain.handle("app:getInfo", () => ({
    name: "Shapp DevTool",
    version: electron.app.getVersion(),
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    os: `${os__namespace.type()} ${os__namespace.arch()} ${os__namespace.release()}`
  }));
  electron.ipcMain.handle("shell:openExternal", (_e, url2) => {
    if (/^https?:\/\//.test(url2)) {
      electron.shell.openExternal(url2);
    }
  });
  electron.ipcMain.handle("shell:showItemInFolder", (_e, path) => {
    electron.shell.showItemInFolder(path);
  });
  initUpdater(win);
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
function getMainWindow() {
  return mainWindow;
}
exports.getMainWindow = getMainWindow;
exports.getStore = getStore;
exports.staticServer = staticServer;
exports.store = store;
