"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("devtool", {
  // App info
  app: {
    getInfo: () => electron.ipcRenderer.invoke("app:getInfo")
  },
  // Window controls
  window: {
    minimize: () => electron.ipcRenderer.send("window:minimize"),
    maximize: () => electron.ipcRenderer.send("window:maximize"),
    close: () => electron.ipcRenderer.send("window:close"),
    openDevTools: () => electron.ipcRenderer.send("window:openDevTools"),
    enterMain: () => electron.ipcRenderer.send("window:enterMain"),
    enterWelcome: () => electron.ipcRenderer.send("window:enterWelcome")
  },
  // Theme
  theme: {
    get: () => electron.ipcRenderer.invoke("theme:get"),
    set: (theme) => electron.ipcRenderer.invoke("theme:set", theme)
  },
  // Shell
  shell: {
    openExternal: (url) => electron.ipcRenderer.invoke("shell:openExternal", url),
    showItemInFolder: (path) => electron.ipcRenderer.invoke("shell:showItemInFolder", path)
  },
  // Package / folder management
  package: {
    openFolder: () => electron.ipcRenderer.invoke("package:openFolder"),
    loadFolder: (dirPath) => electron.ipcRenderer.invoke("package:loadFolder", dirPath),
    getRecent: () => electron.ipcRenderer.invoke("package:getRecent"),
    clearRecent: () => electron.ipcRenderer.invoke("package:clearRecent"),
    onHotReload: (cb) => {
      const handler = (_e, event) => cb(event);
      electron.ipcRenderer.on("package:hotReload", handler);
      return () => electron.ipcRenderer.removeListener("package:hotReload", handler);
    },
    saveManifest: (dir, manifest) => electron.ipcRenderer.invoke("package:saveManifest", dir, manifest),
    onManifestReload: (cb) => {
      const handler = (_e, manifest) => cb(manifest);
      electron.ipcRenderer.on("package:manifestReload", handler);
      return () => electron.ipcRenderer.removeListener("package:manifestReload", handler);
    },
    readImage: (appDir, relPath) => electron.ipcRenderer.invoke("package:readImage", appDir, relPath),
    saveImageFile: (appDir, relPath, dataUrl) => electron.ipcRenderer.invoke("package:saveImageFile", appDir, relPath, dataUrl),
    listImages: (appDir, subPath) => electron.ipcRenderer.invoke("package:listImages", appDir, subPath),
    deleteImageFile: (appDir, relPath) => electron.ipcRenderer.invoke("package:deleteImageFile", appDir, relPath),
    pickImageFiles: (appDir, multi) => electron.ipcRenderer.invoke("package:pickImageFiles", appDir, multi),
    onAssetsChanged: (cb) => {
      const handler = (_e, info) => cb(info);
      electron.ipcRenderer.on("package:assetsChanged", handler);
      return () => electron.ipcRenderer.removeListener("package:assetsChanged", handler);
    }
  },
  // Execution
  execution: {
    run: (params) => electron.ipcRenderer.invoke("execution:run", params),
    cancel: () => electron.ipcRenderer.invoke("execution:cancel"),
    isRunning: () => electron.ipcRenderer.invoke("execution:isRunning"),
    onLog: (cb) => {
      const handler = (_e, entry) => cb(entry);
      electron.ipcRenderer.on("execution:log", handler);
      return () => electron.ipcRenderer.removeListener("execution:log", handler);
    },
    onStatus: (cb) => {
      const handler = (_e, status) => cb(status);
      electron.ipcRenderer.on("execution:status", handler);
      return () => electron.ipcRenderer.removeListener("execution:status", handler);
    }
  },
  // DB (SQLite table browser)
  db: {
    getTables: (dbPath) => electron.ipcRenderer.invoke("kv:getTables", dbPath),
    getTableRows: (dbPath, table, limit, offset) => electron.ipcRenderer.invoke("kv:getTableRows", dbPath, table, limit, offset),
    runQuery: (dbPath, sql) => electron.ipcRenderer.invoke("kv:runQuery", dbPath, sql),
    exportDb: (dbPath) => electron.ipcRenderer.invoke("kv:exportDb", dbPath)
  },
  // KV store (shapp_kv table)
  kv: {
    getAllEntries: (dbPath) => electron.ipcRenderer.invoke("kv:getAllEntries", dbPath),
    setEntry: (dbPath, key, value) => electron.ipcRenderer.invoke("kv:setEntry", dbPath, key, value),
    deleteEntry: (dbPath, key) => electron.ipcRenderer.invoke("kv:deleteEntry", dbPath, key),
    clearAll: (dbPath) => electron.ipcRenderer.invoke("kv:clearAll", dbPath),
    importEntries: (dbPath, entries) => electron.ipcRenderer.invoke("kv:importEntries", dbPath, entries)
  },
  // Static server for preview
  server: {
    start: (appDir, frontendDir) => electron.ipcRenderer.invoke("server:start", appDir, frontendDir),
    stop: () => electron.ipcRenderer.invoke("server:stop"),
    getUrl: () => electron.ipcRenderer.invoke("server:getUrl")
  },
  // Capture
  capture: {
    screenshot: (rect) => electron.ipcRenderer.invoke("capture:screenshot", rect),
    getWindowSourceId: () => electron.ipcRenderer.invoke("capture:getWindowSourceId"),
    saveMedia: (params) => electron.ipcRenderer.invoke("capture:saveMedia", params),
    openSaveDialog: (defaultName) => electron.ipcRenderer.invoke("capture:openSaveDialog", defaultName)
  },
  // Auto-updater
  update: {
    check: () => electron.ipcRenderer.invoke("update:check"),
    download: () => electron.ipcRenderer.invoke("update:download"),
    install: () => electron.ipcRenderer.invoke("update:install"),
    onStatus: (cb) => {
      const handler = (_e, status) => cb(status);
      electron.ipcRenderer.on("update:status", handler);
      return () => electron.ipcRenderer.removeListener("update:status", handler);
    }
  },
  // Coding Agent (OpenCode)
  agent: {
    ping: () => electron.ipcRenderer.invoke("agent:ping"),
    startServer: () => electron.ipcRenderer.invoke("agent:startServer"),
    setProject: (dir) => electron.ipcRenderer.invoke("agent:setProject", dir),
    createSession: (directory) => electron.ipcRenderer.invoke("agent:createSession", directory),
    listSessions: () => electron.ipcRenderer.invoke("agent:listSessions"),
    deleteSession: (id) => electron.ipcRenderer.invoke("agent:deleteSession", id),
    getMessages: (sessionId) => electron.ipcRenderer.invoke("agent:getMessages", sessionId),
    pickFile: () => electron.ipcRenderer.invoke("agent:pickFile"),
    sendPrompt: (sessionId, text, projectDir, mode, files) => electron.ipcRenderer.invoke("agent:sendPrompt", sessionId, text, projectDir, mode, files),
    abortSession: (sessionId) => electron.ipcRenderer.invoke("agent:abortSession", sessionId),
    listProviders: () => electron.ipcRenderer.invoke("agent:listProviders"),
    getConfig: () => electron.ipcRenderer.invoke("agent:getConfig"),
    setApiKey: (providerId, key) => electron.ipcRenderer.invoke("agent:setApiKey", providerId, key),
    listCatalogProviders: () => electron.ipcRenderer.invoke("agent:listCatalogProviders"),
    getPrefs: () => electron.ipcRenderer.invoke("agent:getPrefs"),
    setPrefs: (prefs) => electron.ipcRenderer.invoke("agent:setPrefs", prefs),
    subscribe: () => electron.ipcRenderer.invoke("agent:subscribe"),
    unsubscribe: () => electron.ipcRenderer.invoke("agent:unsubscribe"),
    onEvent: (cb) => {
      const handler = (_e, event) => cb(event);
      electron.ipcRenderer.on("agent:event", handler);
      return () => electron.ipcRenderer.removeListener("agent:event", handler);
    }
  }
});
