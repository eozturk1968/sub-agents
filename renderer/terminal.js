'use strict';
/* global api, S, save, $, esc, Terminal, FitAddon */
// Terminal panel under the canvas: real shells (node-pty in the main process) and
// read-only "live" tabs that mirror what an agent's CLI prints while the app runs it.
// Loaded before renderer.js; its functions run after renderer.js has set up.

const TERM_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3"/><path d="M13 15h4"/></svg>';
const TERM_THEME = {
  background: '#111827', foreground: '#E5E7EB', cursor: '#E5E7EB', cursorAccent: '#111827', selectionBackground: '#334155',
  black: '#1F2937', red: '#F87171', green: '#4ADE80', yellow: '#FBBF24', blue: '#60A5FA', magenta: '#F472B6', cyan: '#2DD4BF', white: '#E5E7EB',
  brightBlack: '#6B7280', brightRed: '#FCA5A5', brightGreen: '#86EFAC', brightYellow: '#FDE68A', brightBlue: '#93C5FD', brightMagenta: '#F9A8D4', brightCyan: '#5EEAD4', brightWhite: '#F9FAFB'
};
const A = { dim: '\x1b[90m', teal: '\x1b[36m', mag: '\x1b[1;35m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', bold: '\x1b[1m', off: '\x1b[0m' };
const LIVE_MAX_LINES = 2000;
const TERM_MIN_H = 120;

const TERMS = [];      // open tabs: { id, kind: 'shell'|'live', title, agent, ptyId, term, fit, el, exited }
let termActive = null; // id of the tab shown
let termSeq = 0;
const LIVE = {};       // agent name -> text of its recent runs (ANSI), not saved

function termState() {
  if (!S.terminal || typeof S.terminal !== 'object') S.terminal = { open: false, height: 280 };
  return S.terminal;
}

// ---------- Live log (always recorded, even with no tab open) ----------
const crlf = (t) => String(t).replace(/\r?\n/g, '\r\n');
function liveWrite(agent, text) {
  if (!agent || !text) return;
  let buf = (LIVE[agent] || '') + text;
  const lines = buf.split('\n');
  if (lines.length > LIVE_MAX_LINES) buf = lines.slice(-LIVE_MAX_LINES).join('\n');
  LIVE[agent] = buf;
  for (const t of TERMS) if (t.kind === 'live' && t.agent === agent) t.term.write(crlf(text));
}
function liveStart(agent, task, from) {
  const sep = LIVE[agent] ? '\n' + A.dim + '────────────────────────────────────────' + A.off + '\n' : '';
  const when = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const who = from ? 'Task from ' + from : 'Task from you';
  liveWrite(agent, sep + A.dim + when + A.off + '  ' + A.mag + '▶ ' + who + A.off + '  ' + oneLine(task, 400) + '\n\n');
}
function liveChunk(agent, text) { liveWrite(agent, text); }
function liveEnd(agent, ok, error) {
  liveWrite(agent, '\n' + (ok ? A.green + '✓ finished' : A.red + '✗ failed' + (error ? ': ' + oneLine(error, 300) : '')) + A.off + '\n');
}
function liveSubCall(from, agent, task) {
  liveWrite(from, '\n' + A.teal + '●' + A.off + ' ' + A.bold + 'subagent' + A.off + ' ' + agent + ' ' + A.dim + '"' + oneLine(task, 160) + '"' + A.off + '\n');
}
function liveSubDone(from, agent, ok) {
  liveWrite(from, '  ' + A.dim + '⎿' + A.off + '  ' + (ok ? A.green + '[sub-agent finished] ' : A.red + '[sub-agent failed] ') + agent + A.off + '\n');
}
function liveRename(from, to) {
  if (LIVE[from] !== undefined) { LIVE[to] = LIVE[from]; delete LIVE[from]; }
  for (const t of TERMS) if (t.kind === 'live' && t.agent === from) { t.agent = to; t.title = to + ' (live)'; }
  renderTermTabs();
}
function liveForget(agent) {
  delete LIVE[agent];
  for (const t of TERMS.slice()) if (t.kind === 'live' && t.agent === agent) closeTermTab(t.id);
}
function oneLine(s, max) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > max ? s.slice(0, max - 1) + '…' : s; }

// ---------- Panel ----------
function termAvailable() { return typeof Terminal === 'function' && typeof FitAddon === 'object'; }

function makeTerm(readOnly) {
  const term = new Terminal({
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12.5, lineHeight: 1.25,
    theme: TERM_THEME, cursorBlink: !readOnly, disableStdin: !!readOnly, scrollback: 5000, allowProposedApi: false,
    convertEol: false
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  const el = document.createElement('div');
  el.className = 'term-view';
  $('#term-views').appendChild(el);
  term.open(el);
  return { term, fit, el };
}

async function newShellTab() {
  if (!termAvailable()) { notice('The terminal could not load.', 'bad'); return; }
  openTermPanel(false);
  const id = 't' + (++termSeq);
  const { term, fit, el } = makeTerm(false);
  const tab = { id, kind: 'shell', title: 'shell', term, fit, el, ptyId: null };
  TERMS.push(tab);
  activateTermTab(id);
  const dims = safeFit(tab);
  const r = await api.ptyCreate({ cwd: S.cwd, cols: dims.cols, rows: dims.rows });
  if (!TERMS.includes(tab)) { if (r.ok) api.ptyKill(r.id); return; } // closed while starting
  if (!r.ok) { term.write(A.red + r.error + A.off + '\r\n'); tab.exited = true; return; }
  tab.ptyId = r.id;
  tab.title = r.shell + ' — ' + termBaseName(r.cwd);
  term.onData((d) => { if (tab.ptyId && !tab.exited) api.ptyWrite(tab.ptyId, d); });
  term.onResize(({ cols, rows }) => { if (tab.ptyId && !tab.exited) api.ptyResize(tab.ptyId, cols, rows); });
  renderTermTabs();
  term.focus();
}

function openLiveTab(agent) {
  if (!termAvailable()) { notice('The terminal could not load.', 'bad'); return; }
  openTermPanel(false);
  const found = TERMS.find((t) => t.kind === 'live' && t.agent === agent);
  if (found) { activateTermTab(found.id); return; }
  const id = 't' + (++termSeq);
  const { term, fit, el } = makeTerm(true);
  const tab = { id, kind: 'live', agent, title: agent + ' (live)', term, fit, el };
  TERMS.push(tab);
  term.write(A.dim + 'Live view of ' + agent + ' · read-only · shows what its tool prints while the app runs it' + A.off + '\r\n\r\n');
  if (LIVE[agent]) term.write(crlf(LIVE[agent]));
  else term.write(A.dim + 'Nothing yet. Give it a task, or let its leader call it.' + A.off + '\r\n');
  activateTermTab(id);
}

function termBaseName(p) { return String(p || '').split(/[\\/]/).filter(Boolean).pop() || '~'; }

function activateTermTab(id) {
  termActive = id;
  for (const t of TERMS) t.el.hidden = t.id !== id;
  renderTermTabs();
  const t = TERMS.find((x) => x.id === id);
  if (t) requestAnimationFrame(() => { safeFit(t); if (t.kind === 'shell') t.term.focus(); });
  if (typeof renderNodes === 'function') renderNodes();
}

function closeTermTab(id) {
  const i = TERMS.findIndex((t) => t.id === id);
  if (i < 0) return;
  const t = TERMS[i];
  if (t.ptyId && !t.exited) api.ptyKill(t.ptyId);
  try { t.term.dispose(); } catch (e) { /* already gone */ }
  t.el.remove();
  TERMS.splice(i, 1);
  if (termActive === id) termActive = TERMS.length ? TERMS[Math.min(i, TERMS.length - 1)].id : null;
  if (termActive) activateTermTab(termActive);
  else { renderTermTabs(); if (typeof renderNodes === 'function') renderNodes(); }
}

function safeFit(t) {
  try { if (!t.el.hidden && t.el.clientWidth > 0) t.fit.fit(); } catch (e) { /* not laid out yet */ }
  return { cols: t.term.cols || 80, rows: t.term.rows || 24 };
}
function fitActive() { const t = TERMS.find((x) => x.id === termActive); if (t) safeFit(t); }

function openTermPanel(startShell) {
  const st = termState();
  const was = st.open;
  st.open = true;
  applyTermPanel();
  if (!was) save();
  if (startShell && !TERMS.length) newShellTab();
}
function hideTermPanel() { termState().open = false; applyTermPanel(); save(); }
function closeAllTerms() { for (const t of TERMS.slice()) closeTermTab(t.id); hideTermPanel(); }
function toggleTermPanel() { if (termState().open) hideTermPanel(); else openTermPanel(true); }

function applyTermPanel() {
  const st = termState();
  const panel = $('#term-panel');
  panel.hidden = !st.open;
  panel.style.height = clampTermH(st.height) + 'px';
  document.querySelector('.main').classList.toggle('term-open', !!st.open);
  const b = $('#term-toggle');
  b.classList.toggle('on', !!st.open);
  b.setAttribute('aria-pressed', st.open ? 'true' : 'false');
  if (st.open) requestAnimationFrame(fitActive);
}
function clampTermH(h) {
  const max = Math.max(TERM_MIN_H, window.innerHeight - 260);
  return Math.min(max, Math.max(TERM_MIN_H, Number(h) || 280));
}

function renderTermTabs() {
  const box = $('#term-tabs');
  if (!box) return;
  box.innerHTML = TERMS.map((t) =>
    '<button type="button" role="tab" class="term-tab' + (t.kind === 'live' ? ' live' : '') + '" data-t="' + t.id + '" aria-selected="' + (t.id === termActive) + '" title="' + esc(t.title) + '">' +
    '<span class="tdot' + (t.kind === 'live' ? ' live' : '') + (t.exited ? ' dead' : '') + '"></span><span class="tname">' + esc(t.title) + '</span>' +
    '<span class="tx" data-tclose="' + t.id + '" role="button" aria-label="Close ' + esc(t.title) + '">×</span></button>').join('') +
    '<button type="button" class="term-add" data-tnew="1" aria-label="New terminal" title="New terminal">+</button>';
}

// Agent card button: is a live tab open for this agent?
function liveOpenFor(agent) { return TERMS.some((t) => t.kind === 'live' && t.agent === agent && t.id === termActive) && termState().open; }

function bindTerminal() {
  if (!termAvailable()) { $('#term-toggle').title = 'The terminal could not load'; }
  $('#term-toggle').addEventListener('click', toggleTermPanel);
  $('#term-min').addEventListener('click', hideTermPanel);
  $('#term-close').addEventListener('click', closeAllTerms);
  $('#term-tabs').addEventListener('click', (e) => {
    const c = e.target.closest('[data-tclose]');
    if (c) { e.stopPropagation(); closeTermTab(c.dataset.tclose); return; }
    if (e.target.closest('[data-tnew]')) { newShellTab(); return; }
    const t = e.target.closest('[data-t]');
    if (t) activateTermTab(t.dataset.t);
  });
  // Drag the top edge to resize.
  const grip = $('#term-resize');
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = $('#term-panel').getBoundingClientRect().height;
    try { grip.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
    const move = (ev) => {
      termState().height = clampTermH(startH + (startY - ev.clientY));
      $('#term-panel').style.height = termState().height + 'px';
      fitActive();
    };
    const up = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); save(); };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
  });
  window.addEventListener('resize', () => { if (termState().open) { $('#term-panel').style.height = clampTermH(termState().height) + 'px'; fitActive(); } });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => fitActive()).observe($('#term-views'));

  api.onPtyData(({ id, data }) => { const t = TERMS.find((x) => x.ptyId === id); if (t) t.term.write(data); });
  api.onPtyExit(({ id, code }) => {
    const t = TERMS.find((x) => x.ptyId === id);
    if (!t) return;
    t.exited = true;
    t.term.write('\r\n' + A.dim + '[process exited' + (code ? ' with code ' + code : '') + ' · close this tab or press + for a new one]' + A.off + '\r\n');
    renderTermTabs();
  });
  renderTermTabs();
  applyTermPanel();
  // Shells aren't saved: if the panel was open last time, start a fresh one.
  if (termState().open && termAvailable()) newShellTab();
}

