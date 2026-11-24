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
  gemini: {
    name: 'Gemini CLI', provider: 'google', providerName: 'Google', allowSub: false,
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
  send: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
};

// ---------- State ----------
let MODELS = [];
let SCRIPT = '';
const lastCall = {}; // modelId -> { time, ok }
let S = { nodes: [], leader: null, nextKey: 1, methods: {}, cwd: null, allowLeaderRun: false };
const chats = {};          // modelId -> [{ role, text }]
let keyStatus = {};        // provider -> true
const installed = {};      // harness -> bool
const ui = {
  query: '', pending: null, authMode: 'key', keyInput: '', busyLogin: false, loginUrl: null,
  modalError: '', chat: null, chatSize: 'small', drag: null, runs: {}, draft: ''
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
const nodeOf = (id) => S.nodes.find((n) => n.modelId === id) || null;
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
function cliFor(id) { return 'node ' + SCRIPT + ' ' + id; }
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
    ? '<span class="dot" aria-hidden="true"></span>' + (lead ? 'Leader: <span class="mono">' + esc(lead.modelId) + '</span> · ' + others + ' other agent' + (others === 1 ? '' : 's') : '')
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
        kids.map((c) => '<span class="chip mono">' + esc(hOf(c.modelId).short) + ' · ' + esc(shortName(c.modelId)) + '</span>').join('') +
        '</div></div>'
      : '';
    let reports = '';
    if (!lead) {
      const banned = descendants(n.key);
      const options = S.nodes.filter((o) => o.key !== n.key && !banned.has(o.key));
      reports = '<label class="reports"><span>Reports to</span><select data-parent="' + n.key + '">' +
        options.map((o) => '<option value="' + o.key + '"' + (o.key === n.parent ? ' selected' : '') + '>' + esc(shortName(o.modelId)) + (o.key === S.leader ? ' (leader)' : '') + '</option>').join('') +
        '</select></label>';
    }
    const lc = lastCall[n.modelId];
    return '<div class="node' + (lead ? ' leader' : '') + '" data-key="' + n.key + '" style="left:' + n.x + 'px;top:' + n.y + 'px">' +
      '<div class="node-top"><span class="badge' + (lead ? ' lead' : '') + '">' + role + '</span>' +
      (ui.runs[n.modelId] ? '<span class="busy">working…</span>' : '') + '<span class="grow"></span>' +
      '<button type="button" class="icon-btn boxed" data-act="chat" aria-label="Open chat with ' + esc(m.id) + '">' + ICON.chat + '</button>' +
      (lead ? '' : '<button type="button" class="btn xs" data-act="leader">Make leader</button>') +
      '<button type="button" class="icon-btn" data-act="remove" aria-label="Remove ' + esc(m.id) + '">' + ICON.x + '</button></div>' +
      '<div class="row">' + avatar(h, 32) + '<div class="col grow"><span class="mono name">' + esc(m.id) + '</span>' +
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
  let w = 0, hgt = 0;
  S.nodes.forEach((n) => { w = Math.max(w, n.x + 320); hgt = Math.max(hgt, n.y + 320); });
  svg.style.width = w ? w + 'px' : '';
  svg.style.height = hgt ? hgt + 'px' : '';
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
  n.x = Math.max(0, p.x + i * 300);
  n.y = p.y + 260;
}

function addNode(id, x, y, parent) {
  if (x == null) {
    const p = nodeByKey(parent != null ? parent : S.leader);
    const sib = p ? childrenOf(p.key).length : 0;
    x = p ? p.x + sib * 300 : 40;
    y = p ? p.y + 260 : 40;
  }
  const key = S.nextKey++;
  const hasLeader = !!leaderNode();
  S.nodes.push({ key, modelId: id, x: Math.max(0, x), y: Math.max(0, y), parent: hasLeader ? (nodeByKey(parent) ? parent : S.leader) : null });
  if (!hasLeader) S.leader = key;
  fixTree();
  save();
  renderNodes();
  renderList();
}

function request(id, x, y, parent) {
  const existing = nodeOf(id);
  if (existing) {
    // A model can only be on the canvas once; dropping it on a box moves it under that box.
    if (parent != null && parent !== existing.key && !descendants(existing.key).has(parent) && existing.key !== S.leader) {
      existing.parent = parent; fixTree(); placeUnder(existing); save(); renderNodes();
    }
    return;
  }
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
      '<button type="button" class="option' + (!sub ? ' on' : '') + '" data-m="pick-key" aria-pressed="' + !sub + '">' + ICON.key +
      '<span class="col grow gap4"><strong>Use an API key</strong><span class="muted small">Pay per use with your own key</span></span><span class="radio" aria-hidden="true"></span></button></div>';
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

  const label = ui.busyLogin ? (m.harness === 'claude' ? 'Checking your Claude Code login…' : 'Waiting for sign-in…') : (sub ? (m.harness === 'claude' ? 'Connect' : h.subLabel) : 'Save and connect');
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
  if (p.noAdd) { save(); renderNodes(); renderList(); } else addNode(p.id, p.x, p.y, p.parent);
  renderConnected();
  openChat(p.id);
}

// ---------- Chat window ----------
function openChat(id) {
  ui.chat = id;
  if (ui.chatSize === 'min') ui.chatSize = 'small';
  if (!chats[id]) chats[id] = [];
  renderChat();
}

function leaderInfo(id) {
  const node = nodeOf(id);
  const subs = node ? readyChildren(node.key) : [];
  const isLead = subs.length > 0;
  const canRun = isLead && (model(id).harness === 'claude' || S.allowLeaderRun);
  return { isLead, subs, canRun, isRoot: !!node && node.key === S.leader };
}

function renderChat() {
  const el = $('#chat');
  const id = ui.chat;
  if (!id || !model(id)) { el.hidden = true; el.innerHTML = ''; return; }
  const m = model(id);
  const h = HARNESS[m.harness];
  const { isLead, subs, canRun } = leaderInfo(id);
  const busy = !!ui.runs[id];
  el.hidden = false;
  el.className = 'chat ' + ui.chatSize;

  let html = '<header class="chat-head">' + avatar(h, 26) +
    '<div class="col grow"><strong style="font-size:13px">' + h.name + '</strong><span class="mono tiny">' + esc(id) + ' · ' + methodLabel(id) + '</span></div>' +
    '<button type="button" class="icon-btn light" data-c="clear" aria-label="Clear chat" title="Clear chat">' + ICON.trash + '</button>' +
    '<button type="button" class="icon-btn light" data-c="min" aria-label="' + (ui.chatSize === 'min' ? 'Restore' : 'Minimize') + '">' + ICON.min + '</button>' +
    '<button type="button" class="icon-btn light" data-c="size" aria-label="' + (ui.chatSize === 'large' ? 'Make smaller' : 'Make bigger') + '">' + ICON.expand + '</button>' +
    '<button type="button" class="icon-btn light" data-c="close" aria-label="Close chat">' + ICON.x + '</button></header>';

  if (ui.chatSize !== 'min') {
    if (isLead && subs.length) {
      html += '<div class="leader-bar">' + (canRun
        ? 'Leads a team. It can hand tasks to: '
        : 'Leads a team. Turn on "Let leader run sub-agents" so ' + h.name + ' can call: ') +
        subs.map((s) => esc(s.modelId)).join(', ') + '</div>';
    }
    html += '<div class="messages" id="messages"></div>' +
      '<form class="composer" id="composer"><label for="draft" class="sr">Message</label>' +
      '<textarea id="draft" rows="1" placeholder="Message ' + esc(shortName(id)) + ' (Enter to send, Shift+Enter for a new line)"></textarea>' +
      (busy ? '<button type="button" class="btn" data-c="stop" style="height:44px">Stop</button>'
        : '<button type="submit" class="send" aria-label="Send">' + ICON.send + '</button>') +
      '</form>';
  }
  el.innerHTML = html;
  renderMessages();

  const d = $('#draft');
  if (d) {
    d.value = ui.draft;
    d.addEventListener('input', (e) => { ui.draft = e.target.value; });
    d.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  }
  const f = $('#composer');
  if (f) f.addEventListener('submit', (e) => { e.preventDefault(); send(); });
}

function renderMessages() {
  const box = $('#messages');
  if (!box) return;
  const list = chats[ui.chat] || [];
  box.innerHTML = list.length
    ? list.map((x) => '<div class="msg ' + x.role + '">' + (x.role === 'task' ? '<span class="msg-label">Task from ' + esc(x.from || 'the leader') + '</span>' : '') + esc(x.text || (x.role === 'assistant' ? '…' : '')) + '</div>').join('')
    : '<p class="muted small center">Connected. Messages go to ' + esc(hOf(ui.chat).name) + ', working in ' + esc(S.cwd || 'your home folder') + '.</p>';
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
    subs.map((s) => '- ' + s.modelId + ': ' + cliFor(s.modelId) + ' "TASK"').join('\n'),
    'Example: ' + cliFor(first.modelId) + ' "Write a haiku about rain"',
    'If the user asks which sub-agents you have, list the ones above. When the user gives you work, split it up, run sub-agents where they help, and then give one final answer.'
  ].join('\n');
}

async function send() {
  const id = ui.chat;
  const text = ui.draft.trim();
  if (!id || !text || ui.runs[id]) return;
  const m = model(id);
  const list = chats[id];
  const history = list.filter((x) => x.role !== 'error').slice(-10);
  const { subs, canRun } = leaderInfo(id);

  let prompt = '';
  if (canRun) prompt += leaderBrief(subs) + '\n\n';
  if (history.length) {
    prompt += 'Conversation so far:\n' + history.map((x) => (x.role === 'user' ? 'User: ' : x.role === 'task' ? 'Group leader: ' : 'Assistant: ') + x.text).join('\n') + '\n\n';
  }
  prompt += (history.length || canRun) ? 'User: ' + text : text;

  // Only pass keys for models in this run that use an API key.
  // Sub-agent keys are handled by the app itself when the leader calls them.
  const providers = S.methods[id] === 'key' ? [hOf(id).provider] : [];

  list.push({ role: 'user', text });
  const reply = { role: 'assistant', text: '' };
  list.push(reply);
  ui.draft = '';
  const runId = Date.now() + '-' + Math.random().toString(36).slice(2);
  ui.runs[id] = runId;
  renderChat();
  renderNodes();

  const r = await api.send({
    runId,
    harness: m.harness,
    model: m.model,
    prompt,
    cwd: S.cwd,
    providers,
    leaderTools: canRun && m.harness === 'claude' ? ['Bash(node ' + SCRIPT + ':*)'] : null,
    fullAccess: !!(canRun && m.harness !== 'claude')
  });

  delete ui.runs[id];
  if (r.ok) {
    reply.text = r.text || reply.text || '(no output)';
  } else {
    if (!reply.text) list.pop();
    list.push({ role: 'error', text: r.error || 'Something went wrong.' });
  }
  if (ui.chat === id) renderChat();
  renderNodes();
}

api.onChunk(({ runId, text }) => {
  const id = Object.keys(ui.runs).find((k) => ui.runs[k] === runId);
  if (!id) return;
  const list = chats[id];
  const last = list[list.length - 1];
  if (last && last.role === 'assistant') last.text += text;
  if (ui.chat === id) renderMessages();
});

// ---------- Sub-agent calls made by the leader ----------
const subCalls = {}; // callId -> { modelId, msg }
function nowTime() { return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
api.onSubStart(({ callId, modelId, task, from }) => {
  if (!chats[modelId]) chats[modelId] = [];
  chats[modelId].push({ role: 'task', text: task, from: from || 'the leader' });
  const msg = { role: 'assistant', text: '' };
  chats[modelId].push(msg);
  subCalls[callId] = { modelId, msg, from: from || 'leader' };
  ui.runs[modelId] = callId;
  renderNodes();
  if (ui.chat === modelId) renderChat();
});
api.onSubChunk(({ callId, text }) => {
  const c = subCalls[callId];
  if (!c) return;
  c.msg.text += text;
  if (ui.chat === c.modelId) renderMessages();
});
api.onSubEnd(({ callId, modelId, ok, text, error }) => {
  const c = subCalls[callId];
  delete subCalls[callId];
  if (ui.runs[modelId] === callId) delete ui.runs[modelId];
  if (c) {
    if (ok) c.msg.text = text || c.msg.text || '(no output)';
    else { if (!c.msg.text) chats[modelId].splice(chats[modelId].indexOf(c.msg), 1); chats[modelId].push({ role: 'error', text: error || 'Failed.' }); }
  }
  lastCall[modelId] = { time: nowTime(), ok, from: c ? shortName(c.from) : 'leader' };
  renderNodes();
  if (ui.chat === modelId) renderChat();
});

api.onLoginUrl((url) => {
  ui.loginUrl = url;
  if (ui.pending) renderModal();
});

// ---------- Events ----------
function bind() {
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
    if (ui.chat === id) { ui.chat = null; renderChat(); }
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
    const r = cv.getBoundingClientRect();
    request(id,
      Math.max(0, Math.round(e.clientX - r.left + cv.scrollLeft - 140)),
      Math.max(0, Math.round(e.clientY - r.top + cv.scrollTop - 30)));
  });

  const nodesEl = $('#nodes');
  nodesEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button, select, label')) return;
    const el = e.target.closest('.node');
    if (!el) return;
    const n = S.nodes.find((o) => String(o.key) === el.dataset.key);
    ui.drag = { n, el, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y };
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
  });
  nodesEl.addEventListener('pointermove', (e) => {
    const d = ui.drag;
    if (!d) return;
    d.n.x = Math.max(0, d.ox + e.clientX - d.sx);
    d.n.y = Math.max(0, d.oy + e.clientY - d.sy);
    d.el.style.left = d.n.x + 'px';
    d.el.style.top = d.n.y + 'px';
    renderWires();
  });
  const endDrag = () => {
    if (!ui.drag) return;
    ui.drag.el.classList.remove('dragging');
    ui.drag = null;
    save();
  };
  nodesEl.addEventListener('pointerup', endDrag);
  nodesEl.addEventListener('pointercancel', endDrag);

  nodesEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const key = Number(b.closest('.node').dataset.key);
    const n = S.nodes.find((o) => o.key === key);
    if (!n) return;
    if (b.dataset.act === 'chat') {
      if (isReady(n.modelId)) openChat(n.modelId);
      else openModal(n.modelId, { noAdd: true });
    } else if (b.dataset.act === 'leader') {
      const old = leaderNode();
      n.parent = null;
      S.leader = key;
      if (old && old.key !== key) old.parent = key;
      fixTree();
      save();
      renderNodes();
      renderChat();
    } else if (b.dataset.act === 'remove') {
      // Its sub-agents move up to its own boss.
      const up = n.parent;
      S.nodes = S.nodes.filter((o) => o.key !== key);
      if (S.leader === key) {
        S.leader = S.nodes.length ? (childrenOf(key)[0] || S.nodes[0]).key : null;
      }
      S.nodes.forEach((o) => { if (o.parent === key) o.parent = up != null ? up : S.leader; });
      fixTree();
      save();
      renderNodes();
      renderChat();
    }
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
    renderChat();
  });

  $('#modal').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    const act = b.dataset.m;
    if (act === 'cancel') { if (!ui.busyLogin) { ui.pending = null; renderModal(); } }
    else if (act === 'pick-sub') { ui.authMode = 'subscription'; ui.modalError = ''; renderModal(); }
    else if (act === 'pick-key') { ui.authMode = 'key'; ui.modalError = ''; renderModal(); }
    else if (act === 'confirm') confirmModal();
    else if (act === 'open-url') { if (ui.loginUrl) api.openUrl(ui.loginUrl); }
    else if (act === 'recheck') {
      const h = model(ui.pending.id).harness;
      installed[h] = await api.checkHarness(h);
      renderModal();
      renderList();
    }
  });

  $('#chat').addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    const act = b.dataset.c;
    if (act === 'close') { ui.chat = null; renderChat(); }
    else if (act === 'clear') { if (!ui.runs[ui.chat]) { chats[ui.chat] = []; renderChat(); } }
    else if (act === 'min') { ui.chatSize = ui.chatSize === 'min' ? 'small' : 'min'; renderChat(); }
    else if (act === 'size') { ui.chatSize = ui.chatSize === 'large' ? 'small' : 'large'; renderChat(); }
    else if (act === 'stop') { const r = ui.runs[ui.chat]; if (r) api.stop(r); }
  });
  // Clear inline size left by manual resizing when switching sizes.
  $('#chat').addEventListener('click', (e) => {
    if (e.target.closest('[data-c="min"],[data-c="size"]')) { $('#chat').style.width = ''; $('#chat').style.height = ''; }
  });

  $('#folder').addEventListener('click', async () => {
    const p = await api.pickFolder();
    if (p) { S.cwd = p; save(); renderToolbar(); if (ui.chat) renderMessages(); }
  });
  $('#allow-run').addEventListener('change', (e) => {
    S.allowLeaderRun = e.target.checked;
    save();
    renderChat();
  });
  $('#clear').addEventListener('click', () => {
    S.nodes = [];
    S.leader = null;
    save();
    renderNodes();
    renderChat();
  });
}

// ---------- Start ----------
async function init() {
  MODELS = (await api.listModels()).filter((m) => HARNESS[m.harness]);
  SCRIPT = await api.subagentScript();
  const saved = await api.loadState();
  if (saved) S = Object.assign(S, saved);
  S.nodes = S.nodes.filter((n) => model(n.modelId));
  // Drop duplicate models (one box per model) and give old saves a tree.
  S.nodes = S.nodes.filter((n, i) => S.nodes.findIndex((o) => o.modelId === n.modelId) === i);
  fixTree();
  keyStatus = await api.keyStatus();
  bind();
  renderList();
  renderConnected();
  renderNodes();
  renderChat();
  await Promise.all(Object.keys(HARNESS).map(async (h) => { installed[h] = await api.checkHarness(h); }));
  renderList();
}

init();
