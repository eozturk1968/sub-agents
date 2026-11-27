'use strict';
/* global api */

// ---------- Static info ----------
const HARNESS = {
  claude: {
    name: 'Claude Code', provider: 'anthropic', providerName: 'Anthropic', allowSub: true, subLabel: 'Use my Claude Code login',
    subDesc: 'Uses the Claude account you are logged into in Claude Code on this Mac. For your own use only.',
    keyName: 'Anthropic API key', ph: 'sk-ant-...', letter: 'A', bg: '#FBE4D8', fg: '#B4532A',
    install: 'npm install -g @anthropic-ai/claude-code', tool: 'Bash(claude -p:*)', short: 'claude -p',
    note: 'Anthropic does not allow signing in with a Claude subscription in other apps, so Claude models use an API key.'
  },
  codex: {
    name: 'Codex', provider: 'openai', providerName: 'OpenAI', allowSub: true, subLabel: 'Sign in with ChatGPT',
    subDesc: 'Use your ChatGPT subscription. Opens your browser.',
    keyName: 'OpenAI API key', ph: 'sk-...', letter: 'O', bg: '#D9F2EA', fg: '#0F7A5C',
    install: 'npm install -g @openai/codex', tool: 'Bash(codex exec:*)', short: 'codex exec'
  },
  antigravity: {
    name: 'Antigravity CLI', provider: 'google', providerName: 'Google', allowSub: true, keyAllowed: false,
    subLabel: 'Use my Antigravity login',
    subDesc: 'Uses the Google account you are signed into in Antigravity CLI on this computer. For your own use only.',
    keyName: 'Gemini API key', ph: 'AIza...', letter: 'G', bg: '#DBE7FE', fg: '#1D4ED8',
    install: 'curl -fsSL https://antigravity.google/cli/install.sh | bash', tool: 'Bash(agy:*)', short: 'agy -p',
    note: 'Antigravity CLI uses your Google sign-in.'
  },
  gemini: {
    name: 'Gemini CLI', provider: 'google', providerName: 'Google', allowSub: true, subLabel: 'Use my Gemini CLI login',
    subDesc: 'Uses the Google account you are logged into in Gemini CLI on this computer. For your own use only.',
    keyName: 'Gemini API key', ph: 'AIza...', letter: 'G', bg: '#DBE7FE', fg: '#1D4ED8',
    install: 'npm install -g @google/gemini-cli', tool: 'Bash(gemini:*)', short: 'gemini -p',
    note: 'Gemini CLI needs an API key when another app runs it in the background.'
  }
};

const ICON = {
  x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  chat: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
  user: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#374151" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  key: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#374151" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/></svg>',
  min: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
  expand: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  role: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>',
  clip: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"/></svg>',
  send: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
};

// ---------- Platform ----------
const IS_WIN = api.platform === 'win32';
const IS_MAC = api.platform === 'darwin';
const MOD = IS_MAC ? 'Cmd' : 'Ctrl';
const FILE_MANAGER = IS_MAC ? 'Finder' : IS_WIN ? 'File Explorer' : 'file manager';
if (IS_WIN) {
  // Windows install commands (run in PowerShell).
  HARNESS.claude.install = 'irm https://claude.ai/install.ps1 | iex';
  HARNESS.antigravity.install = 'irm https://antigravity.google/cli/install.ps1 | iex';
}
HARNESS.claude.subDesc = HARNESS.claude.subDesc.replace('this Mac', 'this computer');

// ---------- State ----------
let MODELS = [];
let SCRIPT = '';
let LEADER_BASE = [];
const lastCall = {}; // agent name -> { time, ok, from }
let S = { nodes: [], leader: null, nextKey: 1, methods: {}, cwd: null, allowLeaderRun: false };
const chats = {};          // agent name -> [{ role, text }]
let keyStatus = {};        // provider -> true
const installed = {};      // harness -> bool
const ui = {
  query: '', pending: null, authMode: 'key', keyInput: '', busyLogin: false, loginUrl: null,
  modalError: '', drag: null, runs: {},
  open: [], bubbles: [], unread: new Set(), drafts: {}, roleEdit: null, editor: null, teamConfirm: null, renaming: null, settings: null, tabClose: null,
  attach: {} // agent name -> [{ name, dataUrl }] waiting to be sent
};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const model = (id) => MODELS.find((m) => m.id === id);
const hOf = (id) => HARNESS[model(id).harness];
const shortName = (id) => id.split('/')[1] || id;
const methodLabel = (id) => (S.methods[id] === 'key' ? 'API key' : 'Subscription');

function isReady(id) {
  const m = S.methods[id];
  if (!m) return false;
  if (m === 'key') return !!keyStatus[hOf(id).provider];
  return true;
}
function leaderNode() { return S.nodes.find((n) => n.key === S.leader) || null; }
const nodeByKey = (k) => S.nodes.find((n) => n.key === k) || null;
// Each box on the canvas is an agent with its own unique name. Chats, roles, memory and
// leader calls use the agent name; sign-in stays per model.
const agentNode = (name) => S.nodes.find((n) => n.name === name) || null;
const agentModel = (name) => { const n = agentNode(name); return n ? model(n.modelId) : null; };
const aH = (name) => HARNESS[agentModel(name).harness];
const agentMethod = (name) => { const n = agentNode(name); return n ? methodLabel(n.modelId) : ''; };
const AGENT_NAME_OK = /^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/;
function cleanAgentName(s) {
  return String(s || '').trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9._-]/g, '').replace(/^[._-]+/, '').slice(0, 48);
}
function uniqueAgentName(base, exceptKey) {
  base = cleanAgentName(base) || 'agent';
  // Names are unique across every open tab: chats, memory and sub-agent calls go by name.
  const taken = new Set([...S.nodes.filter((n) => n.key !== exceptKey), ...allNodes().filter((n) => !S.nodes.includes(n))].map((n) => n.name));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(base + '-' + i)) return base + '-' + i;
}
function childrenOf(key) { return S.nodes.filter((n) => n.parent === key); }
function readyChildren(key) { return childrenOf(key).filter((n) => isReady(n.modelId)); }
function descendants(key) {
  const out = new Set();
  const walk = (k) => childrenOf(k).forEach((c) => { if (!out.has(c.key)) { out.add(c.key); walk(c.key); } });
  walk(key);
  return out;
}
// Keep the tree valid: one root (the group leader), every other node has a parent that exists.
function fixTree() {
  if (!nodeByKey(S.leader)) S.leader = S.nodes.length ? S.nodes[0].key : null;
  S.nodes.forEach((n) => {
    if (n.key === S.leader) { n.parent = null; return; }
    if (!nodeByKey(n.parent) || descendants(n.key).has(n.parent)) n.parent = S.leader;
  });
}
function cliFor(name) { return SCRIPT + ' ' + name; }
function save() { api.saveState(serializeState()); renderTabs(); }
function avatar(h, size) {
  return '<span class="avatar" style="width:' + size + 'px;height:' + size + 'px;background:' + h.bg + ';color:' + h.fg + '" aria-hidden="true">' + h.letter + '</span>';
}

// ---------- Sidebar ----------
function renderList() {
  const q = ui.query.toLowerCase();
  const items = MODELS.filter((m) => m.id.toLowerCase().includes(q)).map((m) => {
    const h = HARNESS[m.harness];
    const meta = installed[m.harness] === false ? h.name + ' not installed' : h.name + (isReady(m.id) ? ' · connected' : '');
    return '<li><button type="button" class="model" draggable="true" data-model="' + esc(m.id) + '">' +
      '<span class="row" style="gap:8px">' + avatar(h, 20) + '<span class="mono">' + esc(m.id) + '</span></span>' +
      '<span class="meta">' + esc(meta) + '</span></button></li>';
  });
  $('#model-list').innerHTML = items.join('') || '<li class="muted small">No models match.</li>';
}

function renderConnected() {
  const ids = Object.keys(S.methods).filter((id) => model(id));
  const el = $('#connected');
  if (!ids.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="section-label">Connected</div>' + ids.map((id) =>
    '<div class="conn"><span class="dot" aria-hidden="true"></span><span class="mono grow">' + esc(id) + '</span>' +
    '<span class="muted small">' + methodLabel(id) + '</span>' +
    '<button type="button" class="btn sm" data-disconnect="' + esc(id) + '">Disconnect</button></div>'
  ).join('');
}

// ---------- Toolbar ----------
function renderToolbar() {
  const lead = leaderNode();
  const others = Math.max(0, S.nodes.length - 1);
  $('#status').innerHTML = S.nodes.length
    ? '<span class="dot" aria-hidden="true"></span>' + (lead ? 'Leader: <span class="mono">' + esc(lead.name) + '</span> · ' + others + ' other agent' + (others === 1 ? '' : 's') : '')
    : 'No agents yet';
  const f = S.cwd ? S.cwd.split(/[\\/]/).filter(Boolean).pop() : 'Home folder';
  $('#folder').textContent = 'Folder: ' + f;
  $('#folder').title = S.cwd || 'Agents work in your home folder. Click to choose a project folder.';
  $('#allow-run').checked = !!S.allowLeaderRun;
}

// ---------- Canvas ----------
function renderNodes() {
  $('#nodes').innerHTML = S.nodes.map((n) => {
    const m = model(n.modelId);
    const h = HARNESS[m.harness];
    const lead = n.key === S.leader;
    const ready = isReady(n.modelId);
    const kids = readyChildren(n.key);
    let role;
    if (lead) role = 'Group leader';
    else role = (ready ? 'Sub-agent' : 'Sub-agent · sign in to share') + (kids.length ? ' · leads ' + kids.length : '');
    const shared = kids.length
      ? '<div class="shared"><span class="shared-label">Can call these sub-agents</span><div class="chips">' +
        kids.map((c) => '<span class="chip mono">' + esc(hOf(c.modelId).short) + ' · ' + esc(c.name) + '</span>').join('') +
        '</div></div>'
      : '';
    let reports = '';
    if (!lead) {
      const banned = descendants(n.key);
      const options = S.nodes.filter((o) => o.key !== n.key && !banned.has(o.key));
      reports = '<label class="reports"><span>Reports to</span><select data-parent="' + n.key + '">' +
        options.map((o) => '<option value="' + o.key + '"' + (o.key === n.parent ? ' selected' : '') + '>' + esc(o.name) + (o.key === S.leader ? ' (leader)' : '') + '</option>').join('') +
        '</select></label>';
    }
    const lc = lastCall[n.name];
    return '<div class="node' + (lead ? ' leader' : '') + '" data-key="' + n.key + '" style="left:' + n.x + 'px;top:' + n.y + 'px">' +
      '<div class="node-top"><span class="badge' + (lead ? ' lead' : '') + '">' + role + '</span>' +
      (ui.runs[n.name] ? '<span class="busy">working…</span>' : '') + '<span class="grow"></span>' +
      '<button type="button" class="icon-btn boxed" data-act="chat" aria-label="Open chat with ' + esc(n.name) + '">' + ICON.chat + '</button>' +
      '<button type="button" class="icon-btn boxed" data-act="role" aria-label="Role and memory for ' + esc(n.name) + '" title="Role and memory">' + ICON.role + '</button>' +
      '<button type="button" class="icon-btn boxed' + (liveOpenFor(n.name) ? ' on' : '') + '" data-act="term" aria-label="Live terminal for ' + esc(n.name) + '" title="Live terminal">' + TERM_ICON + '</button>' +
      (lead ? '' : '<button type="button" class="btn xs" data-act="leader">Make leader</button>') +
      '<button type="button" class="icon-btn" data-act="remove" aria-label="Remove ' + esc(n.name) + '">' + ICON.x + '</button></div>' +
      '<div class="row">' + avatar(h, 32) + '<div class="col grow">' +
      (ui.renaming === n.key
        ? '<form class="rename" data-rename-form="' + n.key + '"><label class="sr" for="rename-' + n.key + '">Agent name</label><input id="rename-' + n.key + '" class="mono" maxlength="48" autocomplete="off"></form>'
        : '<button type="button" class="name-btn mono name" data-act="rename" title="Double-click to rename">' + esc(n.name) + '</button>') +
      '<span class="meta mono">' + esc(m.id) + '</span>' +
      '<span class="meta">' + h.name + ' · ' + (ready ? methodLabel(n.modelId) : 'Not connected') + '</span>' +
      (lc ? '<span class="meta ' + (lc.ok ? 'ok' : 'bad') + '">Last task from ' + esc(lc.from) + ': ' + lc.time + (lc.ok ? ', finished' : ', failed') + '</span>' : '') +
      '</div></div>' + reports + shared + '</div>';
  }).join('');
  $('#empty').hidden = S.nodes.length > 0;
  renderTabs();
  renderWires();
  renderToolbar();
}

function renderWires() {
  const svg = $('#wires');
  const el = (k) => document.querySelector('.node[data-key="' + k + '"]');
  svg.innerHTML = S.nodes.filter((n) => n.key !== S.leader && nodeByKey(n.parent)).map((n) => {
    const p = nodeByKey(n.parent);
    const pe = el(p.key);
    const ce = el(n.key);
    if (!pe || !ce) return '';
    const px = p.x + pe.offsetWidth / 2;
    const pb = p.y + pe.offsetHeight;
    const cx = n.x + ce.offsetWidth / 2;
    const ct = n.y;
    const my = Math.round((pb + ct) / 2);
    const c = isReady(n.modelId) ? '#2563EB' : '#B8C0CC';
    return '<path d="M' + px + ' ' + pb + ' V' + my + ' H' + cx + ' V' + ct + '" fill="none" stroke="' + c + '" stroke-width="2"/>' +
      '<circle cx="' + cx + '" cy="' + ct + '" r="3.5" fill="' + c + '"/>';
  }).join('');
}

// Put a box under its boss, next to its siblings.
function placeUnder(n) {
  const p = nodeByKey(n.parent);
  if (!p) return;
  const i = childrenOf(p.key).filter((c) => c.key !== n.key).length;
  n.x = p.x + i * 300;
  n.y = p.y + 260;
}

function addNode(id, x, y, parent) {
  if (x == null) {
    const p = nodeByKey(parent != null ? parent : S.leader);
    const sib = p ? childrenOf(p.key).length : 0;
    // First agent goes near the top-left of what's on screen right now.
    const v = view();
    x = p ? p.x + sib * 300 : Math.round(-v.x / v.z) + 40;
    y = p ? p.y + 260 : Math.round(-v.y / v.z) + 40;
  }
  const key = S.nextKey++;
  const hasLeader = !!leaderNode();
  const name = uniqueAgentName(shortName(id));
  S.nodes.push({ key, modelId: id, name, x: Math.round(x), y: Math.round(y), parent: hasLeader ? (nodeByKey(parent) ? parent : S.leader) : null });
  if (!hasLeader) S.leader = key;
  fixTree();
  save();
  renderNodes();
  renderList();
  return name;
}

function request(id, x, y, parent) {
  // The same model can be added many times; each copy is its own agent.
  if (isReady(id)) addNode(id, x, y, parent);
  else openModal(id, { x, y, parent });
}

// ---------- Sign-in dialog ----------
function openModal(id, opts) {
  const h = hOf(id);
  ui.pending = Object.assign({ id }, opts);
  ui.authMode = h.allowSub ? 'subscription' : 'key';
  ui.keyInput = '';
  ui.modalError = '';
  ui.busyLogin = false;
  ui.loginUrl = null;
  renderModal();
}

function renderModal() {
  const el = $('#modal');
  if (ui.roleEdit) { renderRoleEditor(); return; }
  if (ui.editor) { renderEditor(); return; }
  if (ui.teamConfirm) { renderTeamConfirm(); return; }
  if (ui.tabClose) { renderTabCloseConfirm(); return; }
  if (ui.settings) { renderSettings(); return; }
  const p = ui.pending;
  if (!p) { el.innerHTML = ''; return; }
  const m = model(p.id);
  const h = HARNESS[m.harness];
  const notInstalled = installed[m.harness] === false;
  const sub = h.allowSub && ui.authMode === 'subscription';
  const hasKey = !!keyStatus[h.provider];

  let body = '';
  if (notInstalled) {
    body += '<div class="warn"><span><strong>' + h.name + " isn't installed.</strong> Install it once in a terminal, then click Check again.</span>" +
      '<code class="mono">' + esc(h.install) + '</code><button type="button" class="btn sm" data-m="recheck">Check again</button></div>';
  }
  if (h.allowSub) {
    body += '<div class="options">' +
      '<button type="button" class="option' + (sub ? ' on' : '') + '" data-m="pick-sub" aria-pressed="' + sub + '">' + ICON.user +
      '<span class="col grow gap4"><strong>' + h.subLabel + '</strong><span class="muted small">' + esc(h.subDesc) + '</span></span><span class="radio" aria-hidden="true"></span></button>' +
      (h.keyAllowed === false ? '' : '<button type="button" class="option' + (!sub ? ' on' : '') + '" data-m="pick-key" aria-pressed="' + !sub + '">' + ICON.key +
      '<span class="col grow gap4"><strong>Use an API key</strong><span class="muted small">Pay per use with your own key</span></span><span class="radio" aria-hidden="true"></span></button>') + '</div>';
  } else {
    body += '<p class="note">' + esc(h.note) + '</p>';
  }
  if (!sub) {
    body += '<div class="field"><label for="key-input"><strong>' + h.keyName + '</strong></label>' +
      '<input id="key-input" type="password" autocomplete="off" placeholder="' + esc(hasKey ? 'A saved key will be used. Paste a new one to replace it.' : h.ph) + '">' +
      '<span class="muted small">Encrypted and saved on this computer only. Shared by all ' + h.providerName + ' models.</span></div>';
  }
  if (ui.busyLogin && ui.loginUrl) {
    body += '<p class="small">Finish signing in in your browser. If it didn\'t open, <button type="button" class="link" data-m="open-url">open the sign-in page</button>.</p>';
  }
  if (ui.modalError) body += '<p class="error">' + esc(ui.modalError) + '</p>';

  const viaCli = m.harness === 'claude' || m.harness === 'gemini' || m.harness === 'antigravity';
  const label = ui.busyLogin ? (viaCli ? 'Checking your ' + h.name + ' login…' : 'Waiting for sign-in…') : (sub ? (viaCli ? 'Connect' : h.subLabel) : 'Save and connect');
  el.innerHTML = '<div class="overlay"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title">' +
    '<div class="row top">' + avatar(h, 40) + '<div class="col grow gap4"><h2 id="dlg-title">Connect ' + h.providerName + '</h2>' +
    '<p class="muted small">To use <span class="mono">' + esc(m.id) + '</span>. Runs in <strong>' + h.name + '</strong>.</p></div>' +
    '<button type="button" class="icon-btn" data-m="cancel" aria-label="Close">' + ICON.x + '</button></div>' +
    body +
    '<div class="actions"><button type="button" class="btn" data-m="cancel">Cancel</button>' +
    '<button type="button" class="btn primary" data-m="confirm"' + (notInstalled || ui.busyLogin ? ' disabled' : '') + '>' + label + '</button></div>' +
    '</div></div>';

  const ki = $('#key-input');
  if (ki) {
    ki.value = ui.keyInput;
    ki.addEventListener('input', (e) => { ui.keyInput = e.target.value; });
    ki.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmModal(); });
    ki.focus();
  }
}

async function confirmModal() {
  const p = ui.pending;
  if (!p || ui.busyLogin) return;
  const m = model(p.id);
  const h = HARNESS[m.harness];
  const sub = h.allowSub && ui.authMode === 'subscription';
  if (sub) {
    ui.busyLogin = true;
    ui.modalError = '';
    renderModal();
    const r = await api.login(m.harness);
    ui.busyLogin = false;
    if (!r.ok) { ui.modalError = r.error || 'Sign-in did not finish.'; renderModal(); return; }
    S.methods[p.id] = 'subscription';
  } else {
    const k = ui.keyInput.trim();
    if (k) { await api.setKey(h.provider, k); keyStatus[h.provider] = true; }
    else if (!keyStatus[h.provider]) { ui.modalError = 'Paste your API key first.'; renderModal(); return; }
    S.methods[p.id] = 'key';
  }
  ui.pending = null;
  renderModal();
  let name = p.agent;
  if (p.noAdd) { save(); renderNodes(); renderList(); } else name = addNode(p.id, p.x, p.y, p.parent);
  renderConnected();
  renderAllChats();
  if (name) openChat(name);
}

// ---------- Chat: see chatpanel.js ----------
function leaderInfo(id) {
  const node = agentNode(id);
  const subs = node ? readyChildren(node.key) : [];
  const isLead = subs.length > 0;
  const canRun = isLead && (agentModel(id).harness === 'claude' || S.allowLeaderRun);
  return { isLead, subs, canRun, isRoot: !!node && node.key === S.leader };
}

function leaderBrief(subs) {
  const first = subs[0];
  return [
    'You lead a team of AI agents in the Sub-Agents app.',
    'Your sub-agents are NOT part of this conversation or thread, and they will never show up in any built-in agent list or roster. ' +
      'Each one is a separate command-line program that you call yourself by running a shell command.',
    'To give a sub-agent a task, run its command with the task as the last argument in double quotes. The Sub-Agents app then runs that model and the command prints its answer, ending with [sub-agent finished] or [sub-agent failed: ...]. Never invent a sub-agent\'s answer; only report what the command printed.',
    'Your sub-agents:',
    subs.map((s) => '- ' + s.name + ' (' + s.modelId + '): ' + cliFor(s.name) + ' "TASK"').join('\n'),
    'Example: ' + cliFor(first.name) + ' "Write a haiku about rain"',
    'If the user asks which sub-agents you have, list the ones above. When the user gives you work, split it up, run sub-agents where they help, and then give one final answer.'
  ].join('\n');
}

function addMemoryNote(id, lines) {
  if (!lines || !lines.length) return;
  chats[id].push({ role: 'note', text: lines.join('\n') });
}

async function send(id) {
  const all = ui.attach[id] || [];
  if (all.some((f) => f.pending)) return; // still copying files
  const pending = all.filter((f) => f.path);
  const text = (ui.drafts[id] || '').trim() || (pending.length ? 'Please look at the attached file' + (pending.length > 1 ? 's.' : '.') : '');
  if (!id || !text || ui.runs[id]) return;
  const m = agentModel(id);
  const node = agentNode(id);
  if (!m || !node) return;
  const list = chats[id];
  const history = list.filter((x) => x.role === 'user' || x.role === 'assistant' || x.role === 'task').slice(-10);
  const { subs, canRun } = leaderInfo(id);
  const cwd = S.cwd; // the tab can change while this runs

  let prompt = (await api.rolePrompt(cwd, id)) + '\n\n';
  if (canRun) prompt += leaderBrief(subs) + '\n\n';
  if (history.length) {
    prompt += 'Conversation so far:\n' + history.map((x) => (x.role === 'user' ? 'User: ' : x.role === 'task' ? 'Agent you report to: ' : 'Assistant: ') + x.text +
      (x.files && x.files.length ? ' [attached: ' + x.files.map((f) => f.rel || f.path).join(', ') + ']' : '')).join('\n') + '\n\n';
  }
  // Attached files were copied into the project folder, so every tool can open them.
  const imagePaths = pending.filter((f) => f.image).map((f) => f.path);
  if (pending.length) {
    prompt += (cwd ? 'Attached files (in the project folder):\n' : 'Attached files:\n') +
      pending.map((f) => '- ' + (f.rel || f.path)).join('\n') +
      '\nOpen and read ' + (pending.length === 1 ? 'it' : 'them') + ' before answering. If you hand a task about ' +
      (pending.length === 1 ? 'this file' : 'these files') + ' to a sub-agent, include the path' + (pending.length === 1 ? '' : 's') + ' in the task.\n\n';
  }
  prompt += 'User: ' + text;

  // Only pass the key for this model if it uses one. Sub-agent keys are handled by the app when the leader calls them.
  const providers = S.methods[node.modelId] === 'key' ? [hOf(node.modelId).provider] : [];

  list.push({ role: 'user', text, files: pending.map((f) => ({ name: f.name, path: f.path, rel: f.rel, size: f.size, image: !!f.image, thumb: f.thumb || null, checked: true })) });
  ui.attach[id] = [];
  const reply = { role: 'assistant', text: '', live: true, started: Date.now() };
  list.push(reply);
  ui.drafts[id] = '';
  const runId = Date.now() + '-' + Math.random().toString(36).slice(2);
  ui.runs[id] = runId;
  liveStart(id, text, null);
  renderChat(id);
  renderNodes();

  const r = await api.send({
    runId,
    harness: m.harness,
    model: m.model,
    prompt,
    cwd,
    providers,
    images: imagePaths,
    leaderTools: canRun && m.harness === 'claude' ? [...LEADER_BASE, ...(S.claudeLeaderTools || [])] : null,
    fullAccess: !!(canRun && m.harness !== 'claude')
  });

  if (ui.runs[id] === runId) delete ui.runs[id];
  delete reply.live;
  reply.elapsed = Date.now() - reply.started;
  if (chats[id] === list) liveEnd(id, r.ok, r.error);
  if (chats[id] !== list) return; // removed from the canvas while it worked
  if (r.ok) {
    reply.text = r.text || reply.text || '(no output)';
    addMemoryNote(id, await api.remember(cwd, id, reply.text));
  } else {
    if (!reply.text) list.pop();
    list.push({ role: 'error', text: r.error || 'Something went wrong.' });
  }
  if (isOpen(id)) renderChat(id); else notify(id);
  renderNodes();
  renderBubbles();
  renderTabs();
}

api.onChunk(({ runId, text }) => {
  const id = Object.keys(ui.runs).find((k) => ui.runs[k] === runId);
  if (!id) return;
  const list = chats[id];
  const last = list[list.length - 1];
  if (last && last.role === 'assistant') last.text += text;
  liveChunk(id, text);
  renderMessages(id);
});

// ---------- Sub-agent calls made by the leader ----------
const subCalls = {}; // callId -> { agent, msg, from }
function nowTime() { return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
api.onSubStart(({ callId, agent, task, from }) => {
  if (!chats[agent]) chats[agent] = [];
  chats[agent].push({ role: 'task', text: task, from: from || 'the leader' });
  const msg = { role: 'assistant', text: '', live: true, started: Date.now() };
  chats[agent].push(msg);
  subCalls[callId] = { agent, msg, from: from || 'leader', list: chats[agent] };
  liveStart(agent, task, from || 'the leader');
  if (from && from !== 'leader') liveSubCall(from, agent, task);
  ui.runs[agent] = callId;
  renderNodes();
  if (isOpen(agent)) renderChat(agent); else notify(agent);
  renderBubbles();
});
api.onSubChunk(({ callId, text }) => {
  const c = subCalls[callId];
  if (!c) return;
  c.msg.text += text;
  liveChunk(c.agent, text);
  renderMessages(c.agent);
});
api.onSubEnd(({ callId, agent, ok, text, error, remembered }) => {
  const c = subCalls[callId];
  delete subCalls[callId];
  if (c) { delete c.msg.live; c.msg.elapsed = Date.now() - (c.msg.started || Date.now()); }
  if (ui.runs[agent] === callId) delete ui.runs[agent];
  if (c && chats[agent] === c.list) {
    liveEnd(agent, ok, error);
    if (c.from && c.from !== 'leader') liveSubDone(c.from, agent, ok);
  }
  if (!c || chats[agent] !== c.list) return; // removed from the canvas while it worked
  if (c) {
    if (ok) { c.msg.text = text || c.msg.text || '(no output)'; addMemoryNote(agent, remembered); }
    else { if (!c.msg.text) chats[agent].splice(chats[agent].indexOf(c.msg), 1); chats[agent].push({ role: 'error', text: error || 'Failed.' }); }
  }
  lastCall[agent] = { time: nowTime(), ok, from: c ? shortName(c.from) : 'leader' };
  renderNodes();
  if (isOpen(agent)) renderChat(agent); else notify(agent);
  renderBubbles();
});

// ---------- Role editor ----------
async function openRoleEditor(id) {
  const r = await api.readRole(S.cwd, id);
  ui.roleEdit = { id, path: r.path, text: r.text, exists: r.exists, saved: false };
  renderModal();
}

function renderRoleEditor() {
  const e = ui.roleEdit;
  const h = aH(e.id);
  $('#modal').innerHTML = '<div class="overlay"><div class="dialog wide" role="dialog" aria-modal="true" aria-labelledby="role-title">' +
    '<div class="row top">' + avatar(h, 40) + '<div class="col grow gap4"><h2 id="role-title">Role and memory: ' + esc(e.id) + '</h2>' +
    '<p class="muted small">Read before every task. Lines the agent writes as <span class="mono">REMEMBER:</span> are added under <span class="mono"># Memory</span>.</p></div>' +
    '<button type="button" class="icon-btn" data-m="role-cancel" aria-label="Close">' + ICON.x + '</button></div>' +
    '<label class="sr" for="role-text">Role file</label>' +
    '<textarea id="role-text" class="role-text mono" spellcheck="false"></textarea>' +
    '<p class="muted small">Saved in <span class="mono">' + esc(e.path) + '</span>' + (e.exists ? '' : ' (not created yet)') + '. Change the project with <strong>Folder</strong>.</p>' +
    (e.saved ? '<p class="small" style="color:#15803D">Saved.</p>' : '') +
    '<div class="actions"><button type="button" class="btn" data-m="role-open">Open in text editor</button><span class="grow"></span>' +
    '<button type="button" class="btn" data-m="role-cancel">Close</button>' +
    '<button type="button" class="btn primary" data-m="role-save">Save</button></div>' +
    '</div></div>';
  const t = $('#role-text');
  t.value = e.text;
  t.addEventListener('input', (ev) => { e.text = ev.target.value; e.saved = false; });
  t.focus();
}

api.onLoginUrl((url) => {
  ui.loginUrl = url;
  if (ui.pending) renderModal();
});

// ---------- Renaming agents ----------
function startRename(key) {
  ui.renaming = key;
  renderNodes();
  const n = nodeByKey(key);
  const inp = document.getElementById('rename-' + key);
  if (inp && n) { inp.value = n.name; inp.focus(); inp.select(); }
}

async function commitRename(key, raw) {
  const n = nodeByKey(key);
  ui.renaming = null;
  if (!n) { renderNodes(); return; }
  const wanted = cleanAgentName(raw);
  if (!wanted || wanted === n.name) { renderNodes(); return; }
  const next = uniqueAgentName(wanted, n.key);
  await renameAgent(n, next);
}

async function renameAgent(n, next) {
  const old = n.name;
  const move = (obj) => { if (obj && Object.prototype.hasOwnProperty.call(obj, old)) { obj[next] = obj[old]; delete obj[old]; } };
  [chats, lastCall, ui.runs, ui.drafts, ui.attach].forEach(move);
  ui.open.forEach((w) => { if (w.id === old) w.id = next; });
  ui.bubbles = ui.bubbles.map((b) => (b === old ? next : b));
  if (ui.unread.delete(old)) ui.unread.add(next);
  Object.values(subCalls).forEach((c) => { if (c.agent === old) c.agent = next; if (c.from === old) c.from = next; });
  liveRename(old, next);
  const win = winEl(old);
  if (win) { win.dataset.id = next; win.setAttribute('aria-label', 'Chat with ' + next); }
  n.name = next;
  await api.renameRole(S.cwd, old, next);
  save();
  renderNodes();
  renderAllChats();
}

// Older saves used one box per model and named role files after the model.
// Give every box a name, and move model-named role files to the agent name.
async function migrateAgents() {
  S.nodes.forEach((n) => { if (!n.name || !AGENT_NAME_OK.test(n.name)) n.name = uniqueAgentName(n.name || shortName(n.modelId), n.key); });
  const seen = new Set();
  S.nodes.forEach((n) => { if (seen.has(n.name)) n.name = uniqueAgentName(n.name, n.key); seen.add(n.name); });
  for (const n of S.nodes) await api.renameRole(S.cwd, n.modelId, n.name);
}

// ---------- Events ----------
function bind() {
  bindView();
  bindTerminal();
  bindSettings();
  bindFiles();
  bindTeams();
  bindTabs();
  // A file dropped outside a drop area would replace the app with that file. Block it.
  document.addEventListener('dragover', (e) => { if (hasDragFiles(e)) e.preventDefault(); });
  document.addEventListener('drop', (e) => { if (hasDragFiles(e)) e.preventDefault(); });

  $('#search').addEventListener('input', (e) => { ui.query = e.target.value; renderList(); });

  const listEl = $('#model-list');
  listEl.addEventListener('dragstart', (e) => {
    const b = e.target.closest('[data-model]');
    if (!b) return;
    e.dataTransfer.setData('text/plain', b.dataset.model);
    e.dataTransfer.effectAllowed = 'copy';
  });
  listEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-model]');
    if (b) request(b.dataset.model);
  });

  $('#connected').addEventListener('click', (e) => {
    const b = e.target.closest('[data-disconnect]');
    if (!b) return;
    const id = b.dataset.disconnect;
    delete S.methods[id];
    S.nodes.filter((n) => n.modelId === id).forEach((n) => closeChat(n.name));
    save();
    renderConnected();
    renderNodes();
    renderList();
  });

  const cv = $('#canvas');
  cv.addEventListener('dragover', (e) => { e.preventDefault(); cv.classList.add('over'); });
  cv.addEventListener('dragleave', (e) => { if (!cv.contains(e.relatedTarget)) cv.classList.remove('over'); });
  cv.addEventListener('drop', (e) => {
    e.preventDefault();
    cv.classList.remove('over');
    const id = e.dataTransfer.getData('text/plain');
    if (!model(id)) return;
    const target = e.target.closest && e.target.closest('.node');
    if (target) { request(id, null, null, Number(target.dataset.key)); return; }
    const w = screenToWorld(e.clientX, e.clientY);
    request(id, Math.round(w.x - 140), Math.round(w.y - 30));
  });

  const nodesEl = $('#nodes');
  nodesEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button, select, label, input, form')) return;
    const el = e.target.closest('.node');
    if (!el) return;
    const n = S.nodes.find((o) => String(o.key) === el.dataset.key);
    ui.drag = { n, el, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y };
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
    el.classList.add('dragging');
  });
  nodesEl.addEventListener('pointermove', (e) => {
    const d = ui.drag;
    if (!d) return;
    d.n.x = Math.round(d.ox + (e.clientX - d.sx) / view().z);
    d.n.y = Math.round(d.oy + (e.clientY - d.sy) / view().z);
    d.el.style.left = d.n.x + 'px';
    d.el.style.top = d.n.y + 'px';
    renderWires();
  });
  const endDrag = () => {
    if (!ui.drag) return;
    ui.drag.el.classList.remove('dragging');
    ui.drag = null;
    save();
    renderToolbar();
  };
  nodesEl.addEventListener('pointerup', endDrag);
  nodesEl.addEventListener('pointercancel', endDrag);

  nodesEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const key = Number(b.closest('.node').dataset.key);
    const n = S.nodes.find((o) => o.key === key);
    if (!n) return;
    if (b.dataset.act === 'role') { openRoleEditor(n.name); return; }
    if (b.dataset.act === 'term') { openLiveTab(n.name); return; }
    if (b.dataset.act === 'chat') {
      if (isReady(n.modelId)) openChat(n.name);
      else openModal(n.modelId, { noAdd: true, agent: n.name });
    } else if (b.dataset.act === 'leader') {
      const old = leaderNode();
      n.parent = null;
      S.leader = key;
      if (old && old.key !== key) old.parent = key;
      fixTree();
      save();
      renderNodes();
      renderAllChats();
    } else if (b.dataset.act === 'remove') {
      // Its sub-agents move up to its own boss. Its role file and chat are
      // saved to .sub-agents/removed, then the agent is wiped.
      const up = n.parent;
      S.nodes = S.nodes.filter((o) => o.key !== key);
      if (S.leader === key) {
        S.leader = S.nodes.length ? (childrenOf(key)[0] || S.nodes[0]).key : null;
      }
      S.nodes.forEach((o) => { if (o.parent === key) o.parent = up != null ? up : S.leader; });
      fixTree();
      save();
      renderNodes();
      renderAllChats();
      archiveAgents([n]).then(removedNotice);
    }
  });
  // Rename an agent: double-click its name (or press Enter on it).
  nodesEl.addEventListener('dblclick', (e) => {
    const b = e.target.closest('[data-act="rename"]');
    if (b) startRename(Number(b.closest('.node').dataset.key));
  });
  nodesEl.addEventListener('keydown', (e) => {
    const b = e.target.closest('[data-act="rename"]');
    if (b && (e.key === 'Enter' || e.key === 'F2')) { e.preventDefault(); startRename(Number(b.closest('.node').dataset.key)); }
    const inp = e.target.closest('[data-rename-form] input');
    if (inp && e.key === 'Escape') { ui.renaming = null; renderNodes(); }
  });
  nodesEl.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-rename-form]');
    if (!f) return;
    e.preventDefault();
    commitRename(Number(f.dataset.renameForm), f.querySelector('input').value);
  });
  nodesEl.addEventListener('focusout', (e) => {
    const f = e.target.closest('[data-rename-form]');
    if (f && ui.renaming != null) commitRename(Number(f.dataset.renameForm), f.querySelector('input').value);
  });
  nodesEl.addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-parent]');
    if (!sel) return;
    const n = nodeByKey(Number(sel.dataset.parent));
    if (!n) return;
    n.parent = Number(sel.value);
    fixTree();
    placeUnder(n);
    save();
    renderNodes();
    renderAllChats();
  });

  $('#modal').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    const act = b.dataset.m;
    if (act === 'role-cancel') { ui.roleEdit = null; renderModal(); return; }
    if (act === 'role-open') { api.openRole(S.cwd, ui.roleEdit.id); return; }
    if (act === 'role-save') {
      await api.writeRole(S.cwd, ui.roleEdit.id, ui.roleEdit.text);
      ui.roleEdit.exists = true; ui.roleEdit.saved = true; renderModal(); return;
    }
    if (act === 'cancel') { if (!ui.busyLogin) { ui.pending = null; renderModal(); } }
    else if (act === 'pick-sub') { ui.authMode = 'subscription'; ui.modalError = ''; renderModal(); }
    else if (act === 'pick-key') { if (hOf(ui.pending.id).keyAllowed !== false) { ui.authMode = 'key'; ui.modalError = ''; renderModal(); } }
    else if (act === 'confirm') confirmModal();
    else if (act === 'open-url') { if (ui.loginUrl) api.openUrl(ui.loginUrl); }
    else if (act === 'recheck') {
      const h = model(ui.pending.id).harness;
      installed[h] = await api.checkHarness(h);
      renderModal();
      renderList();
    }
  });

  bindChatPanel();

  $('#folder').addEventListener('click', async () => {
    const p = await api.pickFolder();
    if (p) { S.cwd = p; await migrateAgents(); save(); renderToolbar(); renderAllChats(); filesUI.expanded.clear(); refreshFiles(); }
  });
  $('#allow-run').addEventListener('change', (e) => {
    S.allowLeaderRun = e.target.checked;
    save();
    renderAllChats();
  });
  $('#clear').addEventListener('click', async () => {
    const gone = S.nodes.slice();
    S.nodes = [];
    S.leader = null;
    save();
    renderNodes();
    renderAllChats();
    if (gone.length) removedNotice(await archiveAgents(gone));
  });
}

// ---------- Removing agents ----------
// The chat as a readable Markdown file.
function chatMarkdown(name) {
  const list = (chats[name] || []).filter((x) => x.text || (x.images && x.images.length) || (x.files && x.files.length));
  if (!list.length) return '';
  const who = (x) => (x.role === 'user' ? 'You' : x.role === 'task' ? 'Task from ' + (x.from || 'the leader')
    : x.role === 'note' ? 'Saved to memory' : x.role === 'error' ? 'Error' : name);
  const out = ['# Chat with ' + name, '', 'Removed from the canvas on ' + new Date().toLocaleString() + '.', ''];
  list.forEach((x) => {
    out.push('**' + who(x) + '**:', '');
    if (x.text) out.push(x.text, '');
    if (x.files && x.files.length) out.push('Attachments: ' + x.files.map((f) => f.path || f.name).join(', '), '');
    else if (x.images && x.images.length) out.push('Images: ' + x.images.map((im) => im.path || im.name).join(', '), '');
  });
  return out.join('\n');
}

// Save each removed agent's role file and chat, then forget everything about it.
async function archiveAgents(nodes) {
  const results = [];
  for (const n of nodes) {
    const name = n.name;
    if (ui.runs[name]) { try { api.stop(ui.runs[name]); } catch (e) { /* ignore */ } delete ui.runs[name]; }
    const md = chatMarkdown(name);
    closeChat(name);
    delete chats[name]; delete lastCall[name]; delete ui.drafts[name]; delete ui.attach[name];
    liveForget(name);
    if (ui.renaming === name) ui.renaming = null;
    let r;
    try { r = await api.archiveAgent(S.cwd, name, md); } catch (e) { r = { ok: false, files: [], error: e.message }; }
    results.push({ name, ...r });
  }
  renderNodes();
  renderAllChats();
  if (S.cwd) refreshFiles();
  return results;
}

function removedNotice(results) {
  if (!results.length) return;
  const failed = results.filter((r) => !r.ok);
  const names = results.map((r) => r.name);
  const label = names.length === 1 ? names[0] : names.length + ' agents';
  if (failed.length) { notice('Removed ' + label + ', but could not save ' + failed.map((r) => r.name).join(', ') + ': ' + failed[0].error, 'bad'); return; }
  const saved = results.some((r) => r.files.length);
  const where = S.cwd ? '.sub-agents/removed' : '~/.sub-agents/removed';
  notice('Removed ' + label + '.' + (saved ? ' Saved to ' + where + '.' : ''), 'ok');
}

// ---------- Start ----------
async function init() {
  MODELS = (await api.listModels()).filter((m) => HARNESS[m.harness]);
  SCRIPT = await api.subagentScript();
  LEADER_BASE = await api.leaderBase();
  // Shortcut hints: Cmd on Mac, Ctrl elsewhere.
  if (!IS_MAC) document.querySelectorAll('[title]').forEach((el) => { el.title = el.title.replace(/\bCmd\b/g, MOD); });
  loadSavedState(await api.loadState());
  await restoreChats();
  // Check every tab: drop unknown models, fix the tree, give every agent a valid name unique across tabs.
  const startTab = ACTIVE;
  for (const t of TABS.slice()) {
    if (t.id !== ACTIVE) { syncActiveTab(); ACTIVE = t.id; putTabInS(t); }
    S.nodes = S.nodes.filter((n) => model(n.modelId));
    fixTree();
    await migrateAgents();
    syncActiveTab();
  }
  if (ACTIVE !== startTab) { ACTIVE = startTab; putTabInS(currentTab()); }
  pruneChats();
  startChatStore();
  save();
  keyStatus = await api.keyStatus();
  bind();
  renderList();
  renderConnected();
  renderNodes();
  applyView();
  renderAllChats();
  await Promise.all(Object.keys(HARNESS).map(async (h) => { installed[h] = await api.checkHarness(h); }));
  renderList();
}

init();
