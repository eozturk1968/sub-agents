const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const harness = require('./harness');

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
function teamFor(state, list, modelId) {
  const nodes = state.nodes || [];
  const methods = state.methods || {};
  const keys = loadKeys();
  const ready = (id) => {
    const mm = list.find((x) => x.id === id);
    if (!mm || !methods[id]) return false;
    return methods[id] !== 'key' || !!keys[harness.HARNESSES[mm.harness].provider];
  };
  const node = nodes.find((n) => n.modelId === modelId);
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
    kids.map((k) => '- ' + k.modelId + ': ' + cmd(k.modelId) + ' "TASK"').join('\n'),
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
      const m = list.find((x) => x.id === p.modelId);
      if (!m) { res.writeHead(404); res.end('Unknown sub-agent: ' + p.modelId + '. Known: ' + list.map((x) => x.id).join(', ')); return; }
      const state = readJson(file('state.json'), {});
      const method = (state.methods || {})[m.id];
      if (!method) { res.writeHead(409); res.end(m.id + ' is not signed in. Connect it in the Sub-Agents app first.'); return; }
      const keys = {};
      const provider = harness.HARNESSES[m.harness].provider;
      if (method === 'key') { const all = loadKeys(); if (all[provider]) keys[provider] = all[provider]; }

      const task = String(p.task || '');
      const team = teamFor(state, list, m.id);
      // A sub-agent with its own sub-agents gets the same team instructions as the leader.
      const canRun = team.kids.length > 0 && (m.harness === 'claude' || !!state.allowLeaderRun);
      const prompt = canRun ? teamBrief(team.kids) + '\n\nTask from the agent you report to:\n' + task : task;

      const callId = crypto.randomUUID();
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      send('sub:start', { callId, modelId: m.id, task, from: team.parent ? team.parent.modelId : 'leader' });
      const r = await harness.run(
        {
          runId: callId, harness: m.harness, model: m.model, prompt, cwd: state.cwd,
          leaderTools: canRun && m.harness === 'claude' ? ['Bash(node ' + SCRIPT + ':*)'] : null,
          fullAccess: canRun && m.harness !== 'claude'
        },
        keys,
        (t) => { res.write(t); send('sub:chunk', { callId, modelId: m.id, text: t }); }
      );
      if (r.ok && m.harness === 'codex') res.write(r.text || '');
      res.end(r.ok ? '\n[sub-agent finished]\n' : '\n[sub-agent failed: ' + r.error + ']\n');
      send('sub:end', { callId, modelId: m.id, ok: r.ok, text: r.text, error: r.error });
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
ipcMain.handle('chat:stop', (_e, runId) => harness.stop(runId));

app.whenReady().then(() => { startBridge(); createWindow(); });
app.on('quit', () => { try { fs.unlinkSync(BRIDGE_FILE); } catch (e) { /* already gone */ } });
app.on('window-all-closed', () => app.quit());
