'use strict';
/* global api, S, ui, chats, $, esc, ICON, HARNESS, agentNode, agentModel, agentMethod, aH, shortName, avatar, leaderInfo,
   send, save, renderTabs, notifyOtherTab, openRoleEditor, saveReplyAsDraft, notice, marked, DOMPurify */
// The chat: one floating panel on the canvas, for the agents of the active tab.
// Loaded before renderer.js; everything here runs after renderer.js has set up.
//
// ui.open: [] when the chat is closed, or [{ id, min }] for the agent shown (min: shrunk to the pill).
// It is saved per team tab (tabs.js). The panel's place and size are in S.chatPanel, for the whole app.

// ---------- Markdown (model text is untrusted: sanitized, no raw HTML, only http/https links) ----------
let mdReady = false;
function setupMarkdown() {
  if (mdReady || typeof marked === 'undefined' || typeof DOMPurify === 'undefined') return;
  mdReady = true;
  marked.use({
    gfm: true,
    breaks: true,
    renderer: {
      // Raw HTML in a reply is shown as text, never as HTML.
      html(tok) { return esc(tok.text || tok.raw || ''); },
      code(tok) {
        const lang = String(tok.lang || '').trim().split(/\s+/)[0];
        return '<div class="md-code"><div class="md-code-h"><span>' + esc(lang || 'text') + '</span>' +
          '<button type="button" class="md-copy">Copy</button></div><pre><code>' + esc(tok.text || '') + '</code></pre></div>';
      },
      // Pictures from the web are not loaded: show the link instead.
      image(tok) { return linkHtml(tok.href, tok.text || tok.href); }
    }
  });
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href)) { node.setAttribute('data-ext', '1'); node.setAttribute('title', href); }
      else node.removeAttribute('href');
      node.removeAttribute('target');
    }
  });
}
function linkHtml(href, text) {
  return /^https?:\/\//i.test(String(href || '')) ? '<a href="' + esc(href) + '">' + esc(text) + '</a>' : esc(text);
}
const MD_TAGS = ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'del', 's', 'code', 'pre',
  'blockquote', 'ul', 'ol', 'li', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'span', 'button', 'input'];
const mdCache = new WeakMap(); // message -> { text, html }
function markdown(text) {
  setupMarkdown();
  if (!mdReady) return '<p class="pre">' + esc(text) + '</p>';
  let html;
  try { html = marked.parse(String(text || '')); } catch (e) { return '<p class="pre">' + esc(text) + '</p>'; }
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: MD_TAGS,
    ALLOWED_ATTR: ['href', 'title', 'class', 'start', 'type', 'checked', 'disabled', 'align', 'data-ext'],
    ALLOWED_URI_REGEXP: /^https?:\/\//i,
    FORBID_ATTR: ['style', 'id', 'name']
  });
}
function mdOf(m) {
  const c = mdCache.get(m);
  if (c && c.text === m.text) return c.html;
  const html = markdown(m.text);
  mdCache.set(m, { text: m.text, html });
  return html;
}

// ---------- Panel state ----------
const PANEL_MIN_W = 340;
const PANEL_MIN_H = 300;
const cur = () => ui.open[0] || null;
const chatId = () => (cur() ? cur().id : null);
const panelShown = () => !!cur() && !cur().min;
const isOpen = (id) => !!id && chatId() === id && panelShown();
const winEl = () => null; // one panel now; kept for older callers
function geo() {
  if (!S.chatPanel || typeof S.chatPanel !== 'object') S.chatPanel = {};
  const g = S.chatPanel;
  if (!isFinite(g.right)) g.right = 16;
  if (!isFinite(g.top)) g.top = 16;
  if (!isFinite(g.w)) g.w = 440;
  if (g.h != null && !isFinite(g.h)) g.h = null;
  return g;
}

function openChat(id) {
  if (!agentNode(id)) return;
  if (!chats[id]) chats[id] = [];
  ui.unread.delete(id);
  const same = chatId() === id && panelShown();
  ui.open = [{ id, min: false }];
  if (same) renderChrome(); else renderChatPanel();
  save();
  focusComposer();
}
function shrinkChat() {
  if (!cur()) return;
  cur().min = true;
  renderChatPanel();
  save();
}
function closeChat(id) {
  if (id && chatId() !== id) return;
  ui.open = [];
  renderChatPanel();
  save();
}
// A message arrived for an agent whose chat is not on screen.
function notify(id) {
  if (isOpen(id)) return;
  if (notifyOtherTab(id)) return;
  ui.unread.add(id);
  if (!cur()) ui.open = [{ id, min: true }]; // closed: show the pill so it can be seen
  renderChrome();
  renderTabs();
}

function syncDock() {
  if (cur() && !agentNode(cur().id)) ui.open = [];
  // Coming to a tab with no chat but new messages: show the pill.
  if (!cur()) {
    const n = S.nodes.find((x) => ui.unread.has(x.name));
    if (n) ui.open = [{ id: n.name, min: true }];
  }
  renderChatPanel();
}
function renderBubbles() { renderChrome(); }
function renderAllChats() { syncDock(); }
function renderChat(id) { if (!id || id === chatId()) renderChatPanel(); }
function renderAttachRow(id) { if (id === chatId()) renderPending(); }

function focusComposer() {
  const t = $('#cp-input');
  if (t) t.focus();
}

// ---------- Rendering ----------
const fmtSize = (n) => (n == null ? '' : n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB'
  : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(1) + ' GB');
const extOf = (name) => { const m = /\.([A-Za-z0-9]+)$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
const FILE_KIND = {
  pdf: ['PDF', '#DC2626'], doc: ['DOC', '#2563EB'], docx: ['DOC', '#2563EB'], rtf: ['DOC', '#2563EB'], odt: ['DOC', '#2563EB'],
  xls: ['XLS', '#16A34A'], xlsx: ['XLS', '#16A34A'], csv: ['CSV', '#16A34A'], tsv: ['CSV', '#16A34A'], ods: ['XLS', '#16A34A'],
  ppt: ['PPT', '#EA580C'], pptx: ['PPT', '#EA580C'], key: ['KEY', '#EA580C'],
  zip: ['ZIP', '#6B7280'], gz: ['ZIP', '#6B7280'], tar: ['ZIP', '#6B7280'], '7z': ['ZIP', '#6B7280'], rar: ['ZIP', '#6B7280'],
  mp3: ['AUD', '#9333EA'], wav: ['AUD', '#9333EA'], m4a: ['AUD', '#9333EA'], mp4: ['VID', '#DB2777'], mov: ['VID', '#DB2777'], webm: ['VID', '#DB2777'],
  md: ['MD', '#0F766E'], txt: ['TXT', '#475569'], json: ['JSON', '#475569'], yaml: ['YML', '#475569'], yml: ['YML', '#475569'],
  py: ['PY', '#2563EB'], js: ['JS', '#CA8A04'], ts: ['TS', '#2563EB'], html: ['HTML', '#EA580C'], css: ['CSS', '#2563EB'],
  c: ['C', '#475569'], h: ['H', '#475569'], cpp: ['C++', '#475569'], java: ['JAVA', '#B45309'], m: ['M', '#B45309'], ipynb: ['NB', '#EA580C'],
  cir: ['SPICE', '#0F766E'], asc: ['SPICE', '#0F766E'], net: ['SPICE', '#0F766E']
};
function fileIcon(f) {
  const k = FILE_KIND[extOf(f.name)] || [(extOf(f.name) || 'FILE').slice(0, 4).toUpperCase(), '#64748B'];
  return '<span class="fi" style="background:' + k[1] + '">' + esc(k[0]) + '</span>';
}
// Restored files: check once that they still exist; images get their thumbnail back.
function checkFile(f) {
  if (f.checked || f.checking || f.pending) return;
  f.checking = true;
  api.fileInfo(f.path).then(async (info) => {
    f.checking = false; f.checked = true;
    if (!info || !info.ok) { f.missing = true; }
    else {
      if (f.size == null) f.size = info.size;
      if (f.image && !f.thumb) { const url = await api.readImage(f.path); if (url) f.thumb = url; }
    }
    scheduleMessages(true);
  }, () => { f.checking = false; f.checked = true; f.missing = true; scheduleMessages(true); });
}
function chipHtml(f, opts) {
  if (!f.path && !f.thumb) f.missing = true;
  else if (!opts.pending) checkFile(f);
  const thumb = f.image && f.thumb ? '<img src="' + f.thumb + '" alt="">' : fileIcon(f);
  const sub = f.missing ? 'Missing' : fmtSize(f.size);
  return '<div class="cp-file' + (f.missing ? ' missing' : '') + '"' +
    (f.missing ? '' : ' data-openfile="' + esc(opts.key) + '" role="button" tabindex="0" title="Open ' + esc(f.name) + '"') + '>' +
    thumb + '<span class="fn">' + esc(f.name) + '<small>' + esc(sub) + '</small></span>' +
    (opts.pending ? '<button type="button" class="cp-file-x" data-unattach="' + opts.index + '" aria-label="Remove ' + esc(f.name) + '">' + ICON.x + '</button>' : '') +
    '</div>';
}
// Older saved chats have images: [{ name, path, dataUrl }]. Show them as file chips too.
function filesOf(m) {
  if (m.files && m.files.length) return m.files;
  if (m.images && m.images.length) {
    m.files = m.images.map((im) => ({ name: im.name || 'image', path: im.path || null, image: true, thumb: im.dataUrl || null }));
    return m.files;
  }
  return [];
}
const secs = (ms) => { const s = Math.max(1, Math.round(ms / 1000)); return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's'; };
function stepsRow(m) {
  if (m.live && m.started) return '<div class="cp-steps live" data-started="' + m.started + '">' + STEP_ICON + '<span>Working for ' + secs(Date.now() - m.started) + '</span></div>';
  if (m.elapsed) return '<div class="cp-steps">' + STEP_ICON + '<span>Worked for ' + secs(m.elapsed) + '</span></div>';
  return '';
}
const STEP_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

function messageHtml(id, m, i) {
  if (m.role === 'user') {
    const files = filesOf(m);
    return '<div class="cp-user">' +
      (files.length ? '<div class="cp-files">' + files.map((f, j) => chipHtml(f, { key: i + ':' + j })).join('') + '</div>' : '') +
      (m.text ? '<div class="cp-bubble">' + esc(m.text) + '</div>' : '') + '</div>';
  }
  if (m.role === 'error') return '<div class="cp-error">' + esc(m.text) + '</div>';
  if (m.role === 'note') return '<div class="cp-note"><span class="cp-label">Saved to memory</span>' + esc(m.text) + '</div>';
  if (m.role === 'task') return '<div class="cp-task"><span class="cp-label">Task from ' + esc(m.from || 'the leader') + '</span><div class="md">' + mdOf(m) + '</div></div>';
  // assistant
  const body = m.text ? '<div class="md">' + mdOf(m) + '</div>' : (m.live ? '<div class="cp-typing"><i></i><i></i><i></i></div>' : '');
  const actions = m.text && !m.live
    ? '<div class="cp-actions"><button type="button" data-copyreply="' + i + '">Copy</button><button type="button" data-savereply="' + i + '">Save as draft</button></div>' : '';
  return '<div class="cp-ai">' + stepsRow(m) + body + actions + '</div>';
}

function renderMessagesNow() {
  const id = chatId();
  const box = $('#cp-msgs');
  if (!box || !id || !panelShown()) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  const list = chats[id] || [];
  box.innerHTML = list.length
    ? list.map((m, i) => messageHtml(id, m, i)).join('')
    : '<p class="cp-empty">Messages go to ' + esc(aH(id).name) + ', working in ' + esc(S.cwd || 'your home folder') + '.</p>';
  if (nearBottom || forceBottom) box.scrollTop = box.scrollHeight;
  forceBottom = false;
}
let msgTimer = null;
let forceBottom = false;
// Streaming text: redraw at most every 70 ms.
function scheduleMessages(soft) {
  if (msgTimer) return;
  msgTimer = setTimeout(() => { msgTimer = null; renderMessagesNow(); }, soft ? 30 : 70);
}
function renderMessages(id) { if (id === chatId() && panelShown()) scheduleMessages(); }

function badgeOf(id) {
  const node = agentNode(id);
  if (!node) return '';
  const { isLead, subs, isRoot } = leaderInfo(id);
  if (isRoot) return '<span class="cp-badge lead">Group leader</span>';
  return '<span class="cp-badge">' + (isLead ? 'Sub-agent · leads ' + subs.length : 'Sub-agent') + '</span>';
}

function avatarsHtml(id) {
  return S.nodes.map((n) => {
    const h = HARNESS[agentModel(n.name).harness];
    const state = ui.runs[n.name] ? 'busy' : ui.unread.has(n.name) ? 'unread' : '';
    const label = n.name + (state === 'busy' ? ' (working)' : state === 'unread' ? ' (new message)' : '');
    return '<button type="button" class="cp-av' + (n.name === id ? ' on' : '') + '" data-agent="' + esc(n.name) + '" role="tab" aria-selected="' + (n.name === id) + '" title="' + esc(label) + '" aria-label="' + esc(label) + '" style="background:' + h.bg + ';color:' + h.fg + '">' +
      h.letter + '<i class="cp-dot ' + state + '"></i></button>';
  }).join('');
}

function statusHtml(id) {
  return ui.runs[id] ? '<span class="cp-state busy"><i class="cp-dot busy inline"></i>Working</span>'
    : '<span class="cp-state"><i class="cp-dot inline"></i>Idle</span>';
}

function renderChatPanel() {
  const panel = $('#chatpanel');
  const pill = $('#cp-pill');
  if (!panel) return;
  if (cur() && !agentNode(cur().id)) ui.open = [];
  const id = chatId();
  if (!id || cur().min) { panel.hidden = true; panel.innerHTML = ''; panel.dataset.id = ''; renderPill(); return; }
  pill.hidden = true;
  ui.unread.delete(id);
  const m = agentModel(id);
  const h = HARNESS[m.harness];
  const { isLead, subs, canRun } = leaderInfo(id);
  const busy = !!ui.runs[id];
  panel.hidden = false;
  panel.dataset.id = id;
  panel.innerHTML =
    '<header class="cp-head">' +
      '<span class="cp-grip" title="Drag to move" aria-hidden="true"><svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor"><circle cx="3" cy="3" r="1.6"/><circle cx="9" cy="3" r="1.6"/><circle cx="3" cy="9" r="1.6"/><circle cx="9" cy="9" r="1.6"/><circle cx="3" cy="15" r="1.6"/><circle cx="9" cy="15" r="1.6"/></svg></span>' +
      '<div class="cp-agents" role="tablist" aria-label="Agents">' + avatarsHtml(id) + '</div>' +
      '<span class="grow"></span>' +
      '<button type="button" class="cp-ic" data-c="min" aria-label="Minimize" title="Minimize"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 17h12"/></svg></button>' +
      '<button type="button" class="cp-ic" data-c="close" aria-label="Close chat" title="Close">' + ICON.x + '</button>' +
    '</header>' +
    '<div class="cp-who"><span class="cp-name mono">' + esc(id) + '</span>' + badgeOf(id) + '<span class="grow"></span>' +
      '<span id="cp-status">' + statusHtml(id) + '</span>' +
      '<button type="button" class="cp-ic sm" data-c="role" aria-label="Role and memory" title="Role and memory">' + ICON.role + '</button>' +
      '<button type="button" class="cp-ic sm" data-c="clear" aria-label="Clear chat" title="Clear chat">' + ICON.trash + '</button></div>' +
    '<div class="cp-sub">' + esc(m.id) + ' · ' + esc(h.name) + ' · ' + esc(agentMethod(id)) + '</div>' +
    (isLead && subs.length ? '<div class="cp-lead' + (canRun ? '' : ' warn') + '">' + (canRun ? 'Leads: ' : 'Turn on "Let leader run sub-agents" so ' + esc(h.name) + ' can call: ') + subs.map((s) => esc(s.name)).join(', ') + '</div>' : '') +
    '<div id="cp-msgs" class="cp-msgs" aria-live="polite"></div>' +
    '<form class="cp-compose" id="cp-form">' +
      '<div class="cp-drop" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg><span>Drop files here</span><small>Any file type · copied into the project folder</small></div>' +
      '<div id="cp-pending" class="cp-pending"></div>' +
      '<label class="sr" for="cp-input">Message</label>' +
      '<textarea id="cp-input" rows="2" placeholder="Message ' + esc(id) + '…"></textarea>' +
      '<div class="cp-bar">' +
        '<button type="button" class="cp-ic" data-c="attach" aria-label="Attach files" title="Attach files">' + ICON.clip + '</button>' +
        '<span class="cp-hint">Shift + Enter for a new line</span><span class="grow"></span>' +
        (busy ? '<button type="button" class="cp-stop" data-c="stop"><i></i>Stop</button>' : '') +
        '<button type="submit" class="cp-send" aria-label="Send" title="Send"' + (busy ? ' disabled' : '') + '><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>' +
      '</div>' +
    '</form>' +
    '<div class="cp-resize" title="Drag to resize" aria-hidden="true"></div>';
  const t = $('#cp-input');
  t.value = ui.drafts[id] || '';
  growInput(t);
  placePanel();
  forceBottom = true;
  renderMessagesNow();
  renderPending();
}

// Only the parts that change often: avatars, status, Stop button, pill.
function renderChrome() {
  const id = chatId();
  renderPill();
  if (!id || !panelShown()) return;
  const panel = $('#chatpanel');
  if (!panel || panel.dataset.id !== id) { renderChatPanel(); return; }
  const av = panel.querySelector('.cp-agents');
  if (av) av.innerHTML = avatarsHtml(id);
  const st = $('#cp-status');
  if (st) st.innerHTML = statusHtml(id);
  const bar = panel.querySelector('.cp-bar');
  const busy = !!ui.runs[id];
  const stop = bar && bar.querySelector('.cp-stop');
  if (bar && busy && !stop) bar.querySelector('.cp-send').insertAdjacentHTML('beforebegin', '<button type="button" class="cp-stop" data-c="stop"><i></i>Stop</button>');
  if (stop && !busy) stop.remove();
  const sendBtn = bar && bar.querySelector('.cp-send');
  if (sendBtn) sendBtn.disabled = busy;
}

function renderPill() {
  const pill = $('#cp-pill');
  if (!pill) return;
  const c = cur();
  if (!c || !c.min || !agentNode(c.id)) { pill.hidden = true; return; }
  const unread = S.nodes.filter((n) => ui.unread.has(n.name)).length;
  pill.hidden = false;
  pill.dataset.agent = c.id;
  pill.setAttribute('aria-label', 'Open chat with ' + c.id + (unread ? ' (' + unread + ' new)' : ''));
  pill.innerHTML = ICON.chat + '<span class="mono">' + esc(c.id) + '</span><span class="cp-pill-sep">·</span>' +
    (ui.runs[c.id] ? '<i class="cp-dot busy inline"></i>Working' : '<i class="cp-dot inline"></i>Idle') +
    (unread ? '<span class="cp-pill-new">' + unread + ' new</span>' : '');
}

function renderPending() {
  const id = chatId();
  const row = $('#cp-pending');
  if (!row || !id) return;
  const list = ui.attach[id] || [];
  row.innerHTML = list.map((f, i) => chipHtml(f, { pending: true, index: i, key: 'p:' + i })).join('');
  row.hidden = !list.length;
}

function growInput(t) {
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight, 180) + 'px';
}

// ---------- Place, drag and resize (kept inside the canvas) ----------
function placePanel() {
  const panel = $('#chatpanel');
  const cv = $('#canvas');
  if (!panel || panel.hidden || !cv) return;
  const g = geo();
  const W = cv.clientWidth;
  const H = cv.clientHeight;
  const w = Math.max(Math.min(PANEL_MIN_W, W - 16), Math.min(g.w, W - 16));
  let h = g.h == null ? H - g.top - 44 : g.h;
  h = Math.max(Math.min(PANEL_MIN_H, H - 16), Math.min(h, H - 16));
  const left = Math.max(8, Math.min(W - w - 8, W - g.right - w));
  const top = Math.max(8, Math.min(H - h - 8, g.top));
  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
  panel.style.width = w + 'px';
  panel.style.height = h + 'px';
}

function bindPanelGeometry(panel) {
  let op = null;
  panel.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.cp-grip, .cp-head');
    const corner = e.target.closest('.cp-resize');
    if (e.button !== 0 || (!corner && (!grip || e.target.closest('button')))) return;
    e.preventDefault();
    const r = panel.getBoundingClientRect();
    op = { kind: corner ? 'resize' : 'move', id: e.pointerId, sx: e.clientX, sy: e.clientY, left: panel.offsetLeft, top: panel.offsetTop, w: r.width, h: r.height };
    try { panel.setPointerCapture(e.pointerId); } catch (err) { /* gone */ }
    panel.classList.add(corner ? 'resizing' : 'moving');
  });
  panel.addEventListener('pointermove', (e) => {
    if (!op || e.pointerId !== op.id) return;
    const cv = $('#canvas');
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    const g = geo();
    const dx = e.clientX - op.sx;
    const dy = e.clientY - op.sy;
    if (op.kind === 'move') {
      const left = Math.max(8, Math.min(W - op.w - 8, op.left + dx));
      const top = Math.max(8, Math.min(H - op.h - 8, op.top + dy));
      g.right = W - left - op.w;
      g.top = top;
      if (g.h == null) g.h = op.h;
    } else {
      // The corner is bottom-left: drag left to widen, down to make it taller.
      const right = op.left + op.w;
      const w = Math.max(PANEL_MIN_W, Math.min(right - 8, op.w - dx));
      const h = Math.max(PANEL_MIN_H, Math.min(H - op.top - 8, op.h + dy));
      g.w = w; g.h = h; g.right = W - right;
    }
    placePanel();
  });
  const end = (e) => {
    if (!op || e.pointerId !== op.id) return;
    op = null;
    panel.classList.remove('moving', 'resizing');
    save();
  };
  panel.addEventListener('pointerup', end);
  panel.addEventListener('pointercancel', end);
}

// ---------- Files ----------
const BIG_FILE = 100 * 1024 * 1024;
const hasDragFiles = (e) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
// items: [{ path } | { name, dataUrl }]. Files are copied into the project's .sub-agents/uploads folder.
async function addUploads(id, items) {
  if (!id || !items.length) return;
  const list = ui.attach[id] || (ui.attach[id] = []);
  const ph = items.map((it) => ({ name: it.name || String(it.path || '').split(/[\\/]/).pop() || 'file', pending: true, size: null }));
  list.push(...ph);
  if (id === chatId()) renderPending();
  let r;
  try { r = await api.addUploads(S.cwd, items); } catch (e) { r = { ok: false, files: [], errors: [e.message] }; }
  ph.forEach((p) => { const i = list.indexOf(p); if (i >= 0) list.splice(i, 1); });
  const got = r.files || [];
  for (const f of got) {
    if (f.image) { try { f.thumb = await api.readImage(f.path); } catch (e) { /* no thumbnail */ } }
    list.push(f);
  }
  const notes = [...(r.errors || [])];
  got.filter((f) => f.size > BIG_FILE).forEach((f) => notes.push(f.name + ' is ' + fmtSize(f.size) + '. Very large files may be slow or too big for some agents to read.'));
  if (notes.length) { (chats[id] || (chats[id] = [])).push({ role: 'error', text: notes.join('\n') }); scheduleMessages(); }
  if (id === chatId()) renderPending();
}
async function addDroppedFiles(id, fileList) {
  const items = [];
  for (const f of [...fileList]) {
    let p = '';
    try { p = api.pathForFile(f); } catch (e) { p = ''; }
    if (p) items.push({ path: p });
    else if (f.size <= 25 * 1024 * 1024) items.push({ name: f.name || 'pasted', dataUrl: await readAsDataUrl(f) });
  }
  return addUploads(id, items);
}

// ---------- Events ----------
function bindChatPanel() {
  const panel = $('#chatpanel');
  const pill = $('#cp-pill');
  // The panel sits on the canvas: keep its clicks, scrolls and drops away from the canvas.
  ['pointerdown', 'wheel', 'dblclick'].forEach((t) => panel.addEventListener(t, (e) => e.stopPropagation(), { passive: true }));
  pill.addEventListener('pointerdown', (e) => e.stopPropagation());
  bindPanelGeometry(panel);

  panel.addEventListener('click', async (e) => {
    const id = chatId();
    if (!id) return;
    const ext = e.target.closest('a');
    if (ext) {
      e.preventDefault();
      const href = ext.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href)) api.openUrl(href);
      return;
    }
    const cp = e.target.closest('.md-copy');
    if (cp) {
      const code = cp.closest('.md-code').querySelector('code');
      copyText(code ? code.textContent : '', cp);
      return;
    }
    const cr = e.target.closest('[data-copyreply]');
    if (cr) { const m = (chats[id] || [])[Number(cr.dataset.copyreply)]; if (m) copyText(m.text, cr); return; }
    const sr = e.target.closest('[data-savereply]');
    if (sr) { saveReplyAsDraft(id, Number(sr.dataset.savereply)); return; }
    const ux = e.target.closest('[data-unattach]');
    if (ux) { (ui.attach[id] || []).splice(Number(ux.dataset.unattach), 1); renderPending(); return; }
    const of = e.target.closest('[data-openfile]');
    if (of) { openFileChip(id, of.dataset.openfile); return; }
    const av = e.target.closest('[data-agent]');
    if (av) { openChat(av.dataset.agent); return; }
    const b = e.target.closest('[data-c]');
    if (!b) return;
    const act = b.dataset.c;
    if (act === 'close') closeChat(id);
    else if (act === 'min') shrinkChat();
    else if (act === 'clear') { if (!ui.runs[id]) { chats[id] = []; renderMessagesNow(); } }
    else if (act === 'stop') { const r = ui.runs[id]; if (r) api.stop(r); }
    else if (act === 'role') openRoleEditor(id);
    else if (act === 'attach') {
      const paths = await api.pickUploads();
      if (paths && paths.length) addUploads(id, paths.map((p) => ({ path: p })));
    }
  });
  panel.addEventListener('keydown', (e) => {
    const of = e.target.closest('[data-openfile]');
    if (of && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openFileChip(chatId(), of.dataset.openfile); return; }
    if (e.target.id === 'cp-input' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(chatId()); }
  });
  panel.addEventListener('input', (e) => {
    if (e.target.id !== 'cp-input') return;
    ui.drafts[chatId()] = e.target.value;
    growInput(e.target);
  });
  panel.addEventListener('submit', (e) => { e.preventDefault(); send(chatId()); });
  panel.addEventListener('paste', (e) => {
    if (e.target.id !== 'cp-input') return;
    const files = [...(e.clipboardData ? e.clipboardData.files : [])];
    if (files.length) { e.preventDefault(); addDroppedFiles(chatId(), files); }
  });
  // Drop any files onto the panel.
  panel.addEventListener('dragover', (e) => { if (!hasDragFiles(e)) return; e.preventDefault(); e.stopPropagation(); panel.classList.add('dropping'); });
  panel.addEventListener('dragleave', (e) => { if (!panel.contains(e.relatedTarget)) panel.classList.remove('dropping'); });
  panel.addEventListener('drop', (e) => {
    if (!hasDragFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    panel.classList.remove('dropping');
    addDroppedFiles(chatId(), e.dataTransfer.files);
  });

  pill.addEventListener('click', () => { if (pill.dataset.agent) openChat(pill.dataset.agent); });

  // Keep it inside the canvas when the window or the terminal panel changes size.
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => placePanel()).observe($('#canvas'));
  window.addEventListener('resize', placePanel);
  // "Working for 12s" counts up while a reply is being written.
  setInterval(() => {
    document.querySelectorAll('#cp-msgs .cp-steps.live').forEach((el) => {
      const s = el.querySelector('span');
      if (s) s.textContent = 'Working for ' + secs(Date.now() - Number(el.dataset.started));
    });
  }, 1000);
}

function openFileChip(id, key) {
  let f = null;
  if (key.startsWith('p:')) f = (ui.attach[id] || [])[Number(key.slice(2))];
  else {
    const [i, j] = key.split(':').map(Number);
    const m = (chats[id] || [])[i];
    f = m ? filesOf(m)[j] : null;
  }
  if (!f || !f.path) return;
  api.openUpload(S.cwd, f.path).then((r) => {
    if (r && !r.ok) { f.missing = !!r.missing; if (r.missing) scheduleMessages(true); else notice('Could not open ' + f.name + ': ' + r.error, 'bad'); }
  });
}

async function copyText(text, btn) {
  let ok = true;
  try { await navigator.clipboard.writeText(String(text || '')); } catch (e) { ok = false; }
  if (!ok) {
    const ta = document.createElement('textarea');
    ta.value = String(text || '');
    document.body.appendChild(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
  }
  if (btn) { const old = btn.textContent; btn.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { btn.textContent = old; }, 1200); }
}
