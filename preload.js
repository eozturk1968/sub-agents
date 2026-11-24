const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listModels: () => ipcRenderer.invoke('models:list'),
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (s) => ipcRenderer.invoke('state:save', s),
  keyStatus: () => ipcRenderer.invoke('keys:status'),
  setKey: (provider, key) => ipcRenderer.invoke('keys:set', provider, key),
  keysEncrypted: () => ipcRenderer.invoke('keys:encrypted'),
  checkHarness: (h) => ipcRenderer.invoke('harness:check', h),
  login: (h) => ipcRenderer.invoke('harness:login', h),
  pickFolder: () => ipcRenderer.invoke('folder:pick'),
  openUrl: (u) => ipcRenderer.invoke('open:url', u),
  send: (opts) => ipcRenderer.invoke('chat:send', opts),
  stop: (runId) => ipcRenderer.invoke('chat:stop', runId),
  readRole: (cwd, id) => ipcRenderer.invoke('role:read', cwd, id),
  writeRole: (cwd, id, text) => ipcRenderer.invoke('role:write', cwd, id, text),
  rolePrompt: (cwd, id) => ipcRenderer.invoke('role:prompt', cwd, id),
  remember: (cwd, id, reply) => ipcRenderer.invoke('role:remember', cwd, id, reply),
  openRole: (cwd, id) => ipcRenderer.invoke('role:open', cwd, id),
  subagentScript: () => ipcRenderer.invoke('bridge:script'),
  onSubStart: (cb) => ipcRenderer.on('sub:start', (_e, d) => cb(d)),
  onSubChunk: (cb) => ipcRenderer.on('sub:chunk', (_e, d) => cb(d)),
  onSubEnd: (cb) => ipcRenderer.on('sub:end', (_e, d) => cb(d)),
  onChunk: (cb) => ipcRenderer.on('chat:chunk', (_e, d) => cb(d)),
  onLoginUrl: (cb) => ipcRenderer.on('login:url', (_e, u) => cb(u))
});
