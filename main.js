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
const SCRIPT = path.join(__dirname, 'bin', 'subagent.js');
const BRIDGE_FILE = path.join(__dirname, 'bin', '.bridge.json');

// Team info for a model on the canvas: its boss and its signed-in sub-agents.
function teamFor(state, list, agentName) {
  const nodes = state.nodes || [];
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
  const cmd = (id) => 'node ' + SCRIPT + ' ' + id;
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
      const list = readJson(path.join(__dirname, 'models.json'), []);
      const state = readJson(file('state.json'), {});
      // Sub-agents are called by agent name (older callers sent a model id).
      const agentName = String(p.agent || p.modelId || '');
      const nodes = state.nodes || [];
      const node = nodes.find((n) => (n.name || n.modelId) === agentName) || nodes.find((n) => n.modelId === agentName);
      if (!node) { res.writeHead(404); res.end('No agent named ' + agentName + ' on the canvas. Agents: ' + nodes.map((n) => n.name || n.modelId).join(', ')); return; }
      const name = node.name || node.modelId;
      const m = list.find((x) => x.id === node.modelId);
      if (!m) { res.writeHead(404); res.end(node.modelId + ' is not in models.json.'); return; }
      const method = (state.methods || {})[m.id];
      if (!method) { res.writeHead(409); res.end(m.id + ' is not signed in. Connect it in the Sub-Agents app first.'); return; }
      const keys = {};
      const provider = harness.HARNESSES[m.harness].provider;
      if (method === 'key') { const all = loadKeys(); if (all[provider]) keys[provider] = all[provider]; }

      const task = String(p.task || '');
      const team = teamFor(state, list, name);
      // A sub-agent with its own sub-agents gets the same team instructions as the leader.
      const canRun = team.kids.length > 0 && (m.harness === 'claude' || !!state.allowLeaderRun);
      const prompt = roles.rolePrompt(state.cwd, name) + '\n\n' +
        (canRun ? teamBrief(team.kids) + '\n\n' : '') +
        'Task from the agent you report to:\n' + task;

      const callId = crypto.randomUUID();
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      send('sub:start', { callId, agent: name, task, from: team.parent ? (team.parent.name || team.parent.modelId) : 'leader' });
      const r = await harness.run(
        {
          runId: callId, harness: m.harness, model: m.model, prompt, cwd: state.cwd,
          leaderTools: canRun && m.harness === 'claude' ? ['Bash(node ' + SCRIPT + ':*)'] : null,
          fullAccess: canRun && m.harness !== 'claude'
        },
        keys,
        (t) => { res.write(t); send('sub:chunk', { callId, agent: name, text: t }); }
      );
      if (r.ok && m.harness === 'codex') res.write(r.text || '');
      res.end(r.ok ? '\n[sub-agent finished]\n' : '\n[sub-agent failed: ' + r.error + ']\n');
      let remembered = [];
      if (r.ok) { try { remembered = roles.remember(state.cwd, name, r.text); } catch (e) { /* folder not writable */ } }
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

ipcMain.handle('models:list', () => readJson(path.join(__dirname, 'models.json'), []));
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
ipcMain.handle('bridge:script', () => SCRIPT);
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
ipcMain.handle('role:prompt', (_e, cwd, id) => roles.rolePrompt(cwd, id));
ipcMain.handle('role:remember', (_e, cwd, id, reply) => { try { return roles.remember(cwd, id, reply); } catch (e) { return []; } });
ipcMain.handle('role:open', (_e, cwd, id) => {
  const r = roles.readRole(cwd, id);
  if (!r.exists) roles.writeRole(cwd, id, r.text);
  return shell.openPath(r.path);
});
ipcMain.handle('chat:stop', (_e, runId) => harness.stop(runId));

app.whenReady().then(() => { startBridge(); createWindow(); });
app.on('quit', () => { try { fs.unlinkSync(BRIDGE_FILE); } catch (e) { /* already gone */ } });
app.on('window-all-closed', () => app.quit());
