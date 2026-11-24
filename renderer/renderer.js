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

// ---------- State ----------
let MODELS = [];
let SCRIPT = '';
const lastCall = {}; // agent name -> { time, ok, from }
let S = { nodes: [], leader: null, nextKey: 1, methods: {}, cwd: null, allowLeaderRun: false };
const chats = {};          // agent name -> [{ role, text }]
let keyStatus = {};        // provider -> true
const installed = {};      // harness -> bool
const ui = {
  query: '', pending: null, authMode: 'key', keyInput: '', busyLogin: false, loginUrl: null,
  modalError: '', drag: null, runs: {},
  open: [], bubbles: [], unread: new Set(), drafts: {}, roleEdit: null, editor: null, teamConfirm: null, renaming: null, settings: null,
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
  const taken = new Set(S.nodes.filter((n) => n.key !== exceptKey).map((n) => n.name));
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
function save() { api.saveState(S); }
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
  $('#status').innerHTML += teamLabel();
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

// ---------- Chat windows (Messenger style) ----------
// ui.open: chats shown as windows along the bottom, oldest first.
// ui.bubbles: chats shrunk to round bubbles on the left.
const MAX_OPEN = 3;
const isOpen = (id) => ui.open.some((w) => w.id === id);
const winEl = (id) => [...document.querySelectorAll('#dock .chat')].find((el) => el.dataset.id === id) || null;

function openChat(id) {
  if (!agentNode(id)) return;
  if (!chats[id]) chats[id] = [];
  ui.bubbles = ui.bubbles.filter((b) => b !== id);
  ui.unread.delete(id);
  if (!isOpen(id)) {
    ui.open.push({ id, size: 'small' });
    while (ui.open.length > MAX_OPEN) ui.bubbles.unshift(ui.open.shift().id);
  }
  syncDock();
  const el = winEl(id);
  const d = el && el.querySelector('textarea');
  if (d) d.focus();
}
function shrinkChat(id) {
  ui.open = ui.open.filter((w) => w.id !== id);
  if (!ui.bubbles.includes(id)) ui.bubbles.unshift(id);
  syncDock();
}
function closeChat(id) {
  ui.open = ui.open.filter((w) => w.id !== id);
  ui.bubbles = ui.bubbles.filter((b) => b !== id);
  ui.unread.delete(id);
  syncDock();
}
// A message arrived for a chat that isn't open: show it as a bubble with a dot.
function notify(id) {
  if (isOpen(id)) return;
  ui.unread.add(id);
  if (!ui.bubbles.includes(id)) ui.bubbles.unshift(id);
  renderBubbles();
}

function syncDock() {
  const dock = $('#dock');
  ui.open = ui.open.filter((w) => agentNode(w.id));
  const want = ui.open.map((w) => w.id);
  [...dock.querySelectorAll('.chat')].forEach((el) => { if (!want.includes(el.dataset.id)) el.remove(); });
  const current = [...dock.querySelectorAll('.chat')].map((el) => el.dataset.id);
  want.forEach((id) => {
    if (!winEl(id)) {
      const el = document.createElement('section');
      el.className = 'chat';
      el.dataset.id = id;
      el.setAttribute('aria-label', 'Chat with ' + id);
      dock.appendChild(el);
      renderChat(id);
    }
  });
  if (current.join('|') !== want.filter((id) => current.includes(id)).join('|')) {
    want.forEach((id) => dock.appendChild(winEl(id)));
  }
  renderBubbles();
}

function renderBubbles() {
  ui.bubbles = ui.bubbles.filter((id) => agentNode(id));
  $('#bubbles').innerHTML = ui.bubbles.map((id) => {
    const h = aH(id);
    const dot = ui.runs[id] ? '<span class="bubble-dot busy" aria-hidden="true"></span>'
      : ui.unread.has(id) ? '<span class="bubble-dot" aria-hidden="true"></span>' : '';
    return '<div class="bubble-wrap">' +
      '<button type="button" class="bubble" data-open="' + esc(id) + '" title="' + esc(id) + '" aria-label="Open chat with ' + esc(id) + (ui.unread.has(id) ? ' (new message)' : '') + '" style="background:' + h.bg + ';color:' + h.fg + '">' + h.letter + dot + '</button>' +
      '<span class="bubble-name">' + esc(id) + '</span>' +
      '<button type="button" class="bubble-close" data-close="' + esc(id) + '" aria-label="Close chat with ' + esc(id) + '">' + ICON.x + '</button>' +
      '</div>';
  }).join('');
}

function renderAllChats() {
  // Close windows and bubbles for agents that are no longer on the canvas.
  if (ui.open.some((w) => !agentNode(w.id)) || ui.bubbles.some((b) => !agentNode(b))) syncDock();
  ui.open.forEach((w) => renderChat(w.id));
  renderBubbles();
}

function leaderInfo(id) {
  const node = agentNode(id);
  const subs = node ? readyChildren(node.key) : [];
  const isLead = subs.length > 0;
  const canRun = isLead && (agentModel(id).harness === 'claude' || S.allowLeaderRun);
  return { isLead, subs, canRun, isRoot: !!node && node.key === S.leader };
}

function renderChat(id) {
  const el = winEl(id);
  if (!el || !agentNode(id)) return;
  const w = ui.open.find((x) => x.id === id);
  const m = agentModel(id);
  const h = HARNESS[m.harness];
  const { isLead, subs, canRun } = leaderInfo(id);
  const busy = !!ui.runs[id];
  el.className = 'chat ' + (w ? w.size : 'small');

  let html = '<header class="chat-head">' + avatar(h, 26) +
    '<div class="col grow"><strong style="font-size:13px">' + esc(id) + '</strong><span class="tiny">' + esc(shortName(m.id)) + ' · ' + h.name + ' · ' + agentMethod(id) + '</span></div>' +
    '<button type="button" class="icon-btn light" data-c="role" aria-label="Edit role" title="Role and memory">' + ICON.role + '</button>' +
    '<button type="button" class="icon-btn light" data-c="clear" aria-label="Clear chat" title="Clear chat">' + ICON.trash + '</button>' +
    '<button type="button" class="icon-btn light" data-c="min" aria-label="Minimize" title="Minimize">' + ICON.min + '</button>' +
    '<button type="button" class="icon-btn light" data-c="size" aria-label="' + (w && w.size === 'large' ? 'Make smaller' : 'Make bigger') + '">' + ICON.expand + '</button>' +
    '<button type="button" class="icon-btn light" data-c="close" aria-label="Close chat">' + ICON.x + '</button></header>';
  if (isLead && subs.length) {
    html += '<div class="leader-bar">' + (canRun
      ? 'Leads a team. It can hand tasks to: '
      : 'Leads a team. Turn on "Let leader run sub-agents" so ' + h.name + ' can call: ') +
      subs.map((s) => esc(s.name)).join(', ') + '</div>';
  }
  html += '<div class="messages"></div>' +
    '<div class="attach-row"></div>' +
    '<form class="composer">' +
    '<input type="file" class="file-input" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden>' +
    '<button type="button" class="attach-btn" data-c="attach" aria-label="Attach images" title="Attach images">' + ICON.clip + '</button>' +
    '<label class="sr" for="draft-' + esc(id) + '">Message</label>' +
    '<textarea id="draft-' + esc(id) + '" rows="1" placeholder="Message ' + esc(id) + '"></textarea>' +
    (busy ? '<button type="button" class="btn" data-c="stop" style="height:44px">Stop</button>'
      : '<button type="submit" class="send" aria-label="Send">' + ICON.send + '</button>') +
    '</form>';
  el.innerHTML = html;
  renderMessages(id);

  const d = el.querySelector('textarea');
  d.value = ui.drafts[id] || '';
  d.addEventListener('input', (e) => { ui.drafts[id] = e.target.value; });
  d.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(id); } });
  el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); send(id); });

  // Images: paperclip, paste, or drag and drop onto the window.
  el.querySelector('.file-input').addEventListener('change', (e) => { addImages(id, e.target.files); e.target.value = ''; });
  d.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData ? e.clipboardData.files : [])].filter((f) => IMAGE_TYPES.includes(f.type));
    if (files.length) { e.preventDefault(); addImages(id, files); }
  });
  el.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); el.classList.add('drop'); } });
  el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('drop'); });
  el.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    el.classList.remove('drop');
    addImages(id, e.dataTransfer.files);
  });
  renderAttachRow(id);
}

// ---------- Image attachments ----------
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const hasFiles = (e) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

async function addImages(id, fileList) {
  const list = ui.attach[id] || (ui.attach[id] = []);
  const skipped = [];
  for (const f of [...fileList]) {
    if (!IMAGE_TYPES.includes(f.type)) { skipped.push(f.name + ' (not PNG, JPG, GIF or WebP)'); continue; }
    if (f.size > MAX_IMAGE_BYTES) { skipped.push(f.name + ' (over 20 MB)'); continue; }
    const ext = f.type.split('/')[1].replace('jpeg', 'jpg');
    list.push({ name: f.name && f.name !== 'image.png' ? f.name : 'pasted.' + ext, dataUrl: await readAsDataUrl(f) });
  }
  if (skipped.length) { chats[id].push({ role: 'error', text: 'Not attached: ' + skipped.join(', ') }); renderMessages(id); }
  renderAttachRow(id);
}

function renderAttachRow(id) {
  const el = winEl(id);
  const row = el && el.querySelector('.attach-row');
  if (!row) return;
  const list = ui.attach[id] || [];
  row.innerHTML = list.map((a, i) =>
    '<div class="thumb"><img src="' + a.dataUrl + '" alt="' + esc(a.name) + '">' +
    '<button type="button" class="thumb-x" data-unattach="' + i + '" aria-label="Remove ' + esc(a.name) + '">' + ICON.x + '</button></div>').join('');
}

function renderMessages(id) {
  const el = winEl(id);
  const box = el && el.querySelector('.messages');
  if (!box) return;
  const list = chats[id] || [];
  box.innerHTML = list.length
    ? list.map((x, i) => '<div class="msg ' + x.role + '">' +
        (x.role === 'task' ? '<span class="msg-label">Task from ' + esc(x.from || 'the leader') + '</span>' : '') +
        (x.role === 'note' ? '<span class="msg-label">Saved to memory</span>' : '') +
        (x.images && x.images.length ? '<div class="msg-images">' + x.images.map((im) => '<img src="' + im.dataUrl + '" alt="' + esc(im.name) + '">').join('') + '</div>' : '') +
        esc(x.text || (x.role === 'assistant' ? '…' : '')) +
        (x.role === 'assistant' && x.text && !ui.runs[id] ? '<button type="button" class="msg-save" data-savereply="' + i + '">Save as draft</button>' : '') +
        '</div>').join('')
    : '<p class="muted small center">Messages go to ' + esc(aH(id).name) + ', working in ' + esc(S.cwd || 'your home folder') + '.</p>';
  box.scrollTop = box.scrollHeight;
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
  const pending = ui.attach[id] || [];
  const text = (ui.drafts[id] || '').trim() || (pending.length ? 'Please look at the attached image' + (pending.length > 1 ? 's.' : '.') : '');
  if (!id || !text || ui.runs[id]) return;
  const m = agentModel(id);
  const node = agentNode(id);
  if (!m || !node) return;
  const list = chats[id];
  const history = list.filter((x) => x.role === 'user' || x.role === 'assistant' || x.role === 'task').slice(-10);
  const { subs, canRun } = leaderInfo(id);

  let prompt = (await api.rolePrompt(S.cwd, id)) + '\n\n';
  if (canRun) prompt += leaderBrief(subs) + '\n\n';
  if (history.length) {
    prompt += 'Conversation so far:\n' + history.map((x) => (x.role === 'user' ? 'User: ' : x.role === 'task' ? 'Agent you report to: ' : 'Assistant: ') + x.text).join('\n') + '\n\n';
  }
  // Save attached images into the project so every tool can open them.
  let imagePaths = [];
  if (pending.length) {
    const saved = await api.saveImages(S.cwd, pending.map((a) => ({ name: a.name, dataUrl: a.dataUrl })));
    if (!saved.ok) { chats[id].push({ role: 'error', text: 'Could not save the images: ' + saved.error }); renderMessages(id); return; }
    imagePaths = saved.paths;
    prompt += 'The user attached ' + (imagePaths.length === 1 ? 'an image' : imagePaths.length + ' images') +
      '. Open and look at ' + (imagePaths.length === 1 ? 'it' : 'them') + ' before answering:\n' +
      imagePaths.map((p) => '- ' + p).join('\n') +
      '\nIf you hand a task about ' + (imagePaths.length === 1 ? 'this image' : 'these images') + ' to a sub-agent, include the file path' + (imagePaths.length === 1 ? '' : 's') + ' in the task.\n\n';
  }
  prompt += 'User: ' + text;

  // Only pass the key for this model if it uses one. Sub-agent keys are handled by the app when the leader calls them.
  const providers = S.methods[node.modelId] === 'key' ? [hOf(node.modelId).provider] : [];

  list.push({ role: 'user', text, images: pending.map((a, i) => ({ name: a.name, dataUrl: a.dataUrl, path: imagePaths[i] })) });
  ui.attach[id] = [];
  const reply = { role: 'assistant', text: '' };
  list.push(reply);
  ui.drafts[id] = '';
  const runId = Date.now() + '-' + Math.random().toString(36).slice(2);
  ui.runs[id] = runId;
  renderChat(id);
  renderNodes();

  const r = await api.send({
    runId,
    harness: m.harness,
    model: m.model,
    prompt,
    cwd: S.cwd,
    providers,
    images: imagePaths,
    leaderTools: canRun && m.harness === 'claude' ? ['Bash(' + SCRIPT + ':*)', ...(S.claudeLeaderTools || [])] : null,
    fullAccess: !!(canRun && m.harness !== 'claude')
  });

  if (ui.runs[id] === runId) delete ui.runs[id];
  if (chats[id] !== list) return; // removed from the canvas while it worked
  if (r.ok) {
    reply.text = r.text || reply.text || '(no output)';
    addMemoryNote(id, await api.remember(S.cwd, id, reply.text));
  } else {
    if (!reply.text) list.pop();
    list.push({ role: 'error', text: r.error || 'Something went wrong.' });
  }
  if (isOpen(id)) renderChat(id); else notify(id);
  renderNodes();
  renderBubbles();
}

api.onChunk(({ runId, text }) => {
  const id = Object.keys(ui.runs).find((k) => ui.runs[k] === runId);
  if (!id) return;
  const list = chats[id];
  const last = list[list.length - 1];
  if (last && last.role === 'assistant') last.text += text;
  renderMessages(id);
});

// ---------- Sub-agent calls made by the leader ----------
const subCalls = {}; // callId -> { agent, msg, from }
function nowTime() { return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
api.onSubStart(({ callId, agent, task, from }) => {
  if (!chats[agent]) chats[agent] = [];
  chats[agent].push({ role: 'task', text: task, from: from || 'the leader' });
  const msg = { role: 'assistant', text: '' };
  chats[agent].push(msg);
  subCalls[callId] = { agent, msg, from: from || 'leader', list: chats[agent] };
  ui.runs[agent] = callId;
  renderNodes();
  if (isOpen(agent)) renderChat(agent); else notify(agent);
});
api.onSubChunk(({ callId, text }) => {
  const c = subCalls[callId];
  if (!c) return;
  c.msg.text += text;
  renderMessages(c.agent);
});
api.onSubEnd(({ callId, agent, ok, text, error, remembered }) => {
  const c = subCalls[callId];
  delete subCalls[callId];
  if (ui.runs[agent] === callId) delete ui.runs[agent];
  if (!c || chats[agent] !== c.list) return; // removed from the canvas while it worked
  if (c) {
    if (ok) { c.msg.text = text || c.msg.text || '(no output)'; addMemoryNote(agent, remembered); }
    else { if (!c.msg.text) chats[agent].splice(chats[agent].indexOf(c.msg), 1); chats[agent].push({ role: 'error', text: error || 'Failed.' }); }
  }
  lastCall[agent] = { time: nowTime(), ok, from: c ? shortName(c.from) : 'leader' };
  renderNodes();
  if (isOpen(agent)) renderChat(agent); else notify(agent);
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
  Object.values(subCalls).forEach((c) => { if (c.agent === old) c.agent = next; });
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
  bindSettings();
  bindFiles();
  bindTeams();
  // A file dropped outside a drop area would replace the app with that file. Block it.
  document.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  document.addEventListener('drop', (e) => { if (hasFiles(e)) e.preventDefault(); });

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

  $('#dock').addEventListener('click', (e) => {
    const ob = e.target.closest('[data-open]');
    if (ob) { openChat(ob.dataset.open); return; }
    const cb = e.target.closest('[data-close]');
    if (cb) { closeChat(cb.dataset.close); return; }
    const sr = e.target.closest('[data-savereply]');
    if (sr) { saveReplyAsDraft(sr.closest('.chat').dataset.id, Number(sr.dataset.savereply)); return; }
    const ux = e.target.closest('[data-unattach]');
    if (ux) {
      const wid = ux.closest('.chat').dataset.id;
      (ui.attach[wid] || []).splice(Number(ux.dataset.unattach), 1);
      renderAttachRow(wid);
      return;
    }
    const b = e.target.closest('[data-c]');
    if (!b) return;
    const win = b.closest('.chat');
    const id = win.dataset.id;
    const act = b.dataset.c;
    if (act === 'close') closeChat(id);
    else if (act === 'min') shrinkChat(id);
    else if (act === 'size') {
      const w = ui.open.find((x) => x.id === id);
      w.size = w.size === 'large' ? 'small' : 'large';
      win.style.width = ''; win.style.height = '';
      renderChat(id);
    }
    else if (act === 'clear') { if (!ui.runs[id]) { chats[id] = []; renderChat(id); } }
    else if (act === 'stop') { const r = ui.runs[id]; if (r) api.stop(r); }
    else if (act === 'role') openRoleEditor(id);
    else if (act === 'attach') win.querySelector('.file-input').click();
  });

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
  const list = (chats[name] || []).filter((x) => x.text || (x.images && x.images.length));
  if (!list.length) return '';
  const who = (x) => (x.role === 'user' ? 'You' : x.role === 'task' ? 'Task from ' + (x.from || 'the leader')
    : x.role === 'note' ? 'Saved to memory' : x.role === 'error' ? 'Error' : name);
  const out = ['# Chat with ' + name, '', 'Removed from the canvas on ' + new Date().toLocaleString() + '.', ''];
  list.forEach((x) => {
    out.push('**' + who(x) + '**:', '');
    if (x.text) out.push(x.text, '');
    if (x.images && x.images.length) out.push('Images: ' + x.images.map((im) => im.path || im.name).join(', '), '');
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
  const saved = await api.loadState();
  if (saved) S = Object.assign(S, saved);
  S.nodes = S.nodes.filter((n) => model(n.modelId));
  fixTree();
  await migrateAgents();
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
