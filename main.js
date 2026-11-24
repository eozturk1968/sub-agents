const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const harness = require('./harness');
const roles = require('./roles');
const files = require('./files');

let win;

const file = (name) => path.join(app.getPath('userData'), name);

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}

// API keys: encrypted with the OS keychain when available.
function loadKeys() {
  try {
    const buf = fs.readFileSync(file('keys.bin'));
    const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
    return JSON.parse(json);
  } catch (e) {
    return {};
  }
}
function saveKeys(keys) {
  const s = JSON.stringify(keys);
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(s) : Buffer.from(s, 'utf8');
  fs.writeFileSync(file('keys.bin'), data);
}

const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };
// ---------- Paths that must work when the app is launched from Finder ----------
const os = require('os');
const platform = require('./platform');
const HOME_DIR = path.join(os.homedir(), '.sub-agents');
// The script lives inside the app; packaged builds unpack it so plain node/Electron can run it.
const SCRIPT_JS = path.join(__dirname, 'bin', 'subagent.js').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
// Leaders call sub-agents with this small launcher. It runs the script with the app's own
// runtime (ELECTRON_RUN_AS_NODE), so Node doesn't need to be installed.
const BIN_DIR = path.join(HOME_DIR, 'bin');
const SCRIPT = path.join(BIN_DIR, 'subagent');
const SUBAGENT_CMD = platform.subagentCommand(process.platform, SCRIPT); // what leaders type
const BRIDGE_FILE = path.join(HOME_DIR, 'bridge.json');

function writeLauncher() {
  fs.mkdirSync(BIN_DIR, { recursive: true });
  for (const f of platform.launcherFiles(process.platform, { binDir: BIN_DIR, execPath: process.execPath, scriptJs: SCRIPT_JS })) {
    fs.writeFileSync(f.file, f.content, f.mode ? { mode: f.mode } : undefined);
    if (f.mode) fs.chmodSync(f.file, f.mode);
  }
}

// Apps opened from Finder (or the Start menu) don't get the PATH from your shell, so
// claude/codex/agy wouldn't be found. Fix the PATH once at startup.
function loadShellPath() {
  if (process.platform === 'win32') return loadWindowsPath();
  const extra = ['/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), '.npm-global', 'bin')];
  let shellPath = '';
  try {
    const out = require('child_process').execFileSync(process.env.SHELL || '/bin/zsh', ['-ilc', 'printf "__SA_PATH__%s__SA_PATH__" "$PATH"'],
      { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] });
    const m = /__SA_PATH__(.*)__SA_PATH__/.exec(out);
    if (m) shellPath = m[1];
  } catch (e) { /* fall back to the usual folders */ }
  process.env.PATH = platform.mergePath(process.platform, [shellPath, process.env.PATH, extra.join(':')]);
}

// Windows: read the current user and system PATH from the registry (tools installed
// after you logged in are only there), then add the usual install folders. The
// launcher folder goes first, so leaders can type just: subagent NAME "TASK".
function loadWindowsPath() {
  const reg = (key) => {
    try {
      const out = require('child_process').execFileSync('reg', ['query', key, '/v', 'Path'],
        { encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      return platform.expandWinVars(platform.parseRegPath(out), process.env);
    } catch (e) { return ''; }
  };
  const user = reg('HKCU\\Environment');
  const system = reg('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment');
  const dirs = platform.windowsToolDirs(process.env, os.homedir());
  const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === 'path') || 'Path';
  process.env[pathKey] = platform.mergePath('win32', [dirs.join(';'), process.env[pathKey], user, system]);
}

// The model list. In the packaged app the built-in list can't be edited, so a copy
// in the app's data folder is used once the user chooses to edit it.
function userModelsFile() { return file('models.json'); }
function modelsFile() {
  if (app.isPackaged && fs.existsSync(userModelsFile())) return userModelsFile();
  return path.join(__dirname, 'models.json');
}

// Each open team tab has its own canvas. Older saves had one canvas at the top level.
function tabsOf(state) {
  return Array.isArray(state.tabs) && state.tabs.length ? state.tabs : [state];
}
// Find an agent by name in any open tab. Names are unique across tabs.
function findAgent(state, agentName) {
  for (const tab of tabsOf(state)) {
    const nodes = tab.nodes || [];
    const node = nodes.find((n) => (n.name || n.modelId) === agentName) || nodes.find((n) => n.modelId === agentName);
    if (node) return { tab, node };
  }
  return null;
}
const allAgentNames = (state) => tabsOf(state).flatMap((t) => (t.nodes || []).map((n) => n.name || n.modelId));

// Team info for a model on the canvas: its boss and its signed-in sub-agents.
function teamFor(state, tab, list, agentName) {
  const nodes = tab.nodes || [];
  const methods = state.methods || {};
  const keys = loadKeys();
  const ready = (id) => {
    const mm = list.find((x) => x.id === id);
    if (!mm || !methods[id]) return false;
    return methods[id] !== 'key' || !!keys[harness.HARNESSES[mm.harness].provider];
  };
  const node = nodes.find((n) => (n.name || n.modelId) === agentName);
  if (!node) return { kids: [], parent: null };
  return {
    kids: nodes.filter((n) => n.parent === node.key && ready(n.modelId)),
    parent: nodes.find((n) => n.key === node.parent) || null
  };
}

function teamBrief(kids) {
  const cmd = (id) => SUBAGENT_CMD + ' ' + id;
  return [
    'You lead a team of AI agents in the Sub-Agents app.',
    'Your sub-agents are NOT part of this conversation or thread, and they will never show up in any built-in agent list or roster. ' +
      'Each one is a separate command-line program that you call yourself by running a shell command.',
    'To give a sub-agent a task, run its command with the task as the last argument in double quotes. The Sub-Agents app then runs that model and the command prints its answer, ending with [sub-agent finished] or [sub-agent failed: ...]. Never invent a sub-agent\'s answer; only report what the command printed.',
    'Your sub-agents:',
    kids.map((k) => '- ' + (k.name || k.modelId) + ' (' + k.modelId + '): ' + cmd(k.name || k.modelId) + ' "TASK"').join('\n'),
    'Split the work, use sub-agents where they help, then give one final answer.'
  ].join('\n');
}

// Local bridge: the leader runs bin/subagent.js, which asks this app to run the
// sub-agent's own CLI. The app does the run, so every call is visible in the UI.
function startBridge() {
  const token = crypto.randomBytes(24).toString('hex');
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/run') { res.writeHead(404); res.end(); return; }
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 1e6) req.destroy(); });
    req.on('end', async () => {
      let p;
      try { p = JSON.parse(body); } catch (e) { res.writeHead(400); res.end('Bad request.'); return; }
      if (p.token !== token) { res.writeHead(403); res.end('Forbidden.'); return; }
      const list = readJson(modelsFile(), []);
      const state = readJson(file('state.json'), {});
      // Sub-agents are called by agent name (older callers sent a model id).
      const agentName = String(p.agent || p.modelId || '');
      const found = findAgent(state, agentName);
      if (!found) { res.writeHead(404); res.end('No agent named ' + agentName + ' on the canvas. Agents: ' + allAgentNames(state).join(', ')); return; }
      const { tab, node } = found;
      const cwd = tab.cwd || null;
      const name = node.name || node.modelId;
      const m = list.find((x) => x.id === node.modelId);
      if (!m) { res.writeHead(404); res.end(node.modelId + ' is not in models.json.'); return; }
      const method = (state.methods || {})[m.id];
      if (!method) { res.writeHead(409); res.end(m.id + ' is not signed in. Connect it in the Sub-Agents app first.'); return; }
      const keys = {};
      const provider = harness.HARNESSES[m.harness].provider;
      if (method === 'key') { const all = loadKeys(); if (all[provider]) keys[provider] = all[provider]; }

      const task = String(p.task || '');
      const team = teamFor(state, tab, list, name);
      // A sub-agent with its own sub-agents gets the same team instructions as the leader.
      const canRun = team.kids.length > 0 && (m.harness === 'claude' || !!state.allowLeaderRun);
      const prompt = roles.rolePrompt(cwd, name) + '\n\n' +
        (canRun ? teamBrief(team.kids) + '\n\n' : '') +
        'Task from the agent you report to:\n' + task;

      const callId = crypto.randomUUID();
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      send('sub:start', { callId, agent: name, task, from: team.parent ? (team.parent.name || team.parent.modelId) : 'leader' });
      const r = await harness.run(
        {
          runId: callId, harness: m.harness, model: m.model, prompt, cwd,
          leaderTools: canRun && m.harness === 'claude' ? claudeLeaderTools(state) : null,
          fullAccess: canRun && m.harness !== 'claude'
        },
        keys,
        (t) => { res.write(t); send('sub:chunk', { callId, agent: name, text: t }); }
      );
      if (r.ok && m.harness === 'codex') res.write(r.text || '');
      res.end(r.ok ? '\n[sub-agent finished]\n' : '\n[sub-agent failed: ' + r.error + ']\n');
      let remembered = [];
      // Skip memory if the agent was removed from the canvas while it worked.
      const still = allAgentNames(readJson(file('state.json'), {})).includes(name);
      if (r.ok && still) { try { remembered = roles.remember(cwd, name, r.text); } catch (e) { /* folder not writable */ } }
      send('sub:end', { callId, agent: name, ok: r.ok, text: r.text, error: r.error, remembered });
    });
  });
  server.listen(0, '127.0.0.1', () => {
    fs.writeFileSync(BRIDGE_FILE, JSON.stringify({ port: server.address().port, token }), { mode: 0o600 });
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Sub-Agents',
    backgroundColor: '#FFFFFF',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('models:list', () => readJson(modelsFile(), []));
ipcMain.handle('models:edit', async () => {
  let p = modelsFile();
  if (app.isPackaged && p !== userModelsFile()) { fs.copyFileSync(p, userModelsFile()); p = userModelsFile(); }
  const err = await shell.openPath(p);
  return err ? { ok: false, error: err, path: p } : { ok: true, path: p };
});
ipcMain.handle('state:load', () => readJson(file('state.json'), null));
ipcMain.handle('state:save', (_e, s) => { fs.writeFileSync(file('state.json'), JSON.stringify(s, null, 2)); });

ipcMain.handle('keys:status', () => {
  const k = loadKeys();
  return Object.fromEntries(Object.keys(k).map((p) => [p, true]));
});
ipcMain.handle('keys:set', (_e, provider, key) => {
  const k = loadKeys();
  k[provider] = String(key).trim();
  saveKeys(k);
  return true;
});
ipcMain.handle('keys:encrypted', () => safeStorage.isEncryptionAvailable());

ipcMain.handle('harness:check', (_e, h) => harness.check(h));
ipcMain.handle('harness:login', (_e, h) => harness.login(h, (url) => win && win.webContents.send('login:url', url)));

ipcMain.handle('folder:pick', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('open:url', (_e, url) => {
  if (/^https:\/\//.test(url)) shell.openExternal(url);
});

// opts: { runId, harness, model, prompt, cwd, leaderTools, fullAccess, providers }
ipcMain.handle('chat:send', (_e, opts) => {
  const all = loadKeys();
  const keys = {};
  for (const p of opts.providers || []) if (all[p]) keys[p] = all[p];
  return harness.run(opts, keys, (text) => win && win.webContents.send('chat:chunk', { runId: opts.runId, text }));
});
ipcMain.handle('bridge:script', () => SUBAGENT_CMD);
ipcMain.handle('leader:base', () => platform.leaderBaseTools(process.platform, SCRIPT));
ipcMain.handle('app:platform', () => process.platform);
// ---------- Team files ----------
// A team file holds the canvas layout, the leader setting and each agent's role file.
// It never holds API keys or sign-ins.
function teamDir(cwd) { return path.join(cwd || require('os').homedir(), '.sub-agents', 'teams'); }

ipcMain.handle('team:save', async (_e, cwd, team, suggested) => {
  try {
    const dir = teamDir(cwd);
    fs.mkdirSync(dir, { recursive: true });
    const r = await dialog.showSaveDialog(win, {
      title: 'Save team',
      defaultPath: path.join(dir, (suggested || 'my-team') + '.team.json'),
      filters: [{ name: 'Sub-Agents team', extensions: ['json'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation']
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    const ids = [...new Set((team.nodes || []).map((n) => n.name || n.modelId))];
    const roleTexts = {};
    ids.forEach((id) => { const rr = roles.readRole(cwd, id); if (rr.exists) roleTexts[id] = rr.text; });
    const name = path.basename(r.filePath).replace(/\.team\.json$|\.json$/i, '');
    const data = { app: 'sub-agents', version: 1, name, savedAt: new Date().toISOString(), ...team, roles: roleTexts };
    fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2) + '\n');
    return { ok: true, path: r.filePath, name };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('team:pick', async (_e, cwd) => {
  try {
    const dir = teamDir(cwd);
    const r = await dialog.showOpenDialog(win, {
      title: 'Open team',
      defaultPath: fs.existsSync(dir) ? dir : (cwd || undefined),
      filters: [{ name: 'Sub-Agents team', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
    return { ok: true, path: r.filePaths[0], text: fs.readFileSync(r.filePaths[0], 'utf8') };
  } catch (e) { return { ok: false, error: e.message }; }
});

// Write role files from a team into the project. Never overwrite a role the project already has.
ipcMain.handle('team:roles', (_e, cwd, roleTexts) => {
  const created = []; const kept = [];
  for (const [id, text] of Object.entries(roleTexts || {})) {
    const cur = roles.readRole(cwd, id);
    if (!cur.exists) { roles.writeRole(cwd, id, text); created.push(id); }
    else if (cur.text.trim() !== String(text).trim()) kept.push(id);
  }
  return { created, kept };
});

ipcMain.handle('fs:list', (_e, cwd, rel) => files.list(cwd, rel));
ipcMain.handle('fs:read', (_e, cwd, rel) => files.read(cwd, rel));
ipcMain.handle('fs:write', (_e, cwd, rel, text) => files.write(cwd, rel, text));
ipcMain.handle('fs:mkdir', (_e, cwd, rel) => files.mkdir(cwd, rel));
ipcMain.handle('fs:exists', (_e, cwd, rel) => files.exists(cwd, rel));
ipcMain.handle('fs:open', (_e, cwd, rel) => files.open(cwd, rel));
ipcMain.handle('fs:reveal', (_e, cwd, rel) => files.reveal(cwd, rel));

// Save chat images into PROJECT/.sub-agents/attachments so every CLI can read them.
const IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
ipcMain.handle('images:save', (_e, cwd, files) => {
  try {
    const dir = path.join(cwd || require('os').homedir(), '.sub-agents', 'attachments');
    fs.mkdirSync(dir, { recursive: true });
    const paths = (files || []).map((f, i) => {
      const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(String(f.dataUrl || ''));
      if (!m || !IMAGE_EXT[m[1]]) throw new Error('Not a supported image: ' + f.name);
      const base = String(f.name || 'image').replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60) || 'image';
      const p = path.join(dir, Date.now() + '-' + i + '-' + base + '.' + IMAGE_EXT[m[1]]);
      fs.writeFileSync(p, Buffer.from(m[2], 'base64'));
      return p;
    });
    return { ok: true, paths };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('role:read', (_e, cwd, id) => roles.readRole(cwd, id));
ipcMain.handle('role:write', (_e, cwd, id, text) => roles.writeRole(cwd, id, text));
ipcMain.handle('role:rename', (_e, cwd, from, to) => { try { return roles.renameRole(cwd, from, to); } catch (e) { return false; } });
ipcMain.handle('agent:archive', (_e, cwd, name, chatMarkdown) => {
  try { return { ok: true, files: roles.archiveAgent(cwd, name, chatMarkdown) }; }
  catch (e) { return { ok: false, files: [], error: e.message }; }
});
ipcMain.handle('role:prompt', (_e, cwd, id) => roles.rolePrompt(cwd, id));
ipcMain.handle('role:remember', (_e, cwd, id, reply) => { try { return roles.remember(cwd, id, reply); } catch (e) { return []; } });
ipcMain.handle('role:open', (_e, cwd, id) => {
  const r = roles.readRole(cwd, id);
  if (!r.exists) roles.writeRole(cwd, id, r.text);
  return shell.openPath(r.path);
});
ipcMain.handle('chat:stop', (_e, runId) => harness.stop(runId));

// Tools a Claude leader may use without asking: the sub-agent launcher, plus any extra
// permissions added in Settings (for example Bash(python3:*) or Read).
function claudeLeaderTools(state) {
  const extra = Array.isArray(state.claudeLeaderTools) ? state.claudeLeaderTools : [];
  return [...platform.leaderBaseTools(process.platform, SCRIPT), ...extra.map((t) => String(t).trim()).filter(Boolean)];
}
ipcMain.handle('leader:tools', () => claudeLeaderTools(readJson(file('state.json'), {})));

// Only one copy of the app at a time (two would fight over the sub-agent bridge).
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  if (process.platform === 'win32') app.setAppUserModelId('com.erdincozturk.subagents');
  app.whenReady().then(() => { loadShellPath(); writeLauncher(); startBridge(); createWindow(); });
}
app.on('quit', () => { try { fs.unlinkSync(BRIDGE_FILE); } catch (e) { /* already gone */ } });
app.on('window-all-closed', () => app.quit());
