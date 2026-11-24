'use strict';
/* global api, S, ui, $, esc, chats, lastCall, syncDock, renderNodes, renderAllChats, renderToolbar, renderModal,
   applyView, fitAll, refreshFiles, filesUI, saveTeam, teamDirtyOf, notice, renderBubbles */
// Team tabs, LTspice style: every open team has its own canvas.
// The active tab's canvas lives in S (S.nodes, S.leader, ...), so the rest of the app works on it as before.
// Other tabs are kept in TABS. Chats, runs and drafts are keyed by agent name, and agent names are
// unique across all tabs, so agents in background tabs keep running and keep their chats.
// Loaded before renderer.js; everything here runs after renderer.js has set up.

const TAB_FIELDS = ['nodes', 'leader', 'nextKey', 'cwd', 'view', 'teamName', 'teamSaved'];
let TABS = [];        // [{ id, title, nodes, leader, ... , dock: { open, bubbles } }]
let ACTIVE = null;    // id of the tab shown on the canvas
let tabSeq = 1;

const currentTab = () => TABS.find((t) => t.id === ACTIVE) || null;
const newTabId = () => 't' + Date.now().toString(36) + (tabSeq++);

function blankTab(title, cwd) {
  return { id: newTabId(), title, nodes: [], leader: null, nextKey: 1, cwd: cwd || null, view: { x: 0, y: 0, z: 1 },
    teamName: null, teamSaved: null, dock: { open: [], bubbles: [] } };
}

function nextTeamTitle() {
  const used = new Set(TABS.map((t) => t.title));
  for (let i = 1; ; i++) if (!used.has('Team ' + i)) return 'Team ' + i;
}

// Copy the live canvas (S) and the chat dock back into the active tab.
function syncActiveTab() {
  const t = currentTab();
  if (!t) return;
  TAB_FIELDS.forEach((f) => { t[f] = S[f]; });
  t.dock = { open: ui.open.slice(), bubbles: ui.bubbles.slice() };
}

// Agents in every tab (the active one from S, the rest from TABS).
function allNodes() {
  const out = S.nodes.slice();
  TABS.forEach((t) => { if (t.id !== ACTIVE) out.push(...(t.nodes || [])); });
  return out;
}
function tabOfAgent(name) {
  if (S.nodes.some((n) => n.name === name)) return currentTab();
  return TABS.find((t) => t.id !== ACTIVE && (t.nodes || []).some((n) => n.name === name)) || null;
}

// What gets written to state.json: global settings plus every tab.
function serializeState() {
  syncActiveTab();
  const out = {};
  Object.keys(S).forEach((k) => { if (!TAB_FIELDS.includes(k) && k !== 'tabs' && k !== 'active') out[k] = S[k]; });
  out.tabs = TABS.map((t) => {
    const o = { id: t.id, title: t.title };
    TAB_FIELDS.forEach((f) => { o[f] = t[f]; });
    return o;
  });
  out.active = ACTIVE;
  return out;
}

// Load state.json. A save from before tabs had one canvas at the top level: it becomes "Team 1".
function loadSavedState(saved) {
  saved = saved || {};
  const globals = {};
  Object.keys(saved).forEach((k) => { if (!TAB_FIELDS.includes(k) && k !== 'tabs' && k !== 'active') globals[k] = saved[k]; });
  Object.assign(S, globals);
  if (Array.isArray(saved.tabs) && saved.tabs.length) {
    TABS = saved.tabs.map((t) => Object.assign(blankTab(t.title || 'Team'), t, { dock: { open: [], bubbles: [] } }));
  } else {
    const t = blankTab(saved.teamName || 'Team 1');
    TAB_FIELDS.forEach((f) => { if (saved[f] !== undefined) t[f] = saved[f]; });
    TABS = [t];
  }
  TABS.forEach((t) => {
    if (!t.id) t.id = newTabId();
    if (!Array.isArray(t.nodes)) t.nodes = [];
    if (!t.nextKey) t.nextKey = Math.max(0, ...t.nodes.map((n) => n.key)) + 1;
  });
  ACTIVE = TABS.some((t) => t.id === saved.active) ? saved.active : TABS[0].id;
  putTabInS(currentTab());
}

function putTabInS(t) {
  TAB_FIELDS.forEach((f) => { S[f] = t[f]; });
  if (!Array.isArray(S.nodes)) S.nodes = [];
  if (!S.nextKey) S.nextKey = 1;
  ui.open = (t.dock && t.dock.open) ? t.dock.open.slice() : [];
  ui.bubbles = (t.dock && t.dock.bubbles) ? t.dock.bubbles.slice() : [];
}

// Show another tab: park the current canvas and chat windows, bring in the other one.
function switchTab(id) {
  if (id === ACTIVE || !TABS.some((t) => t.id === id)) return;
  syncActiveTab();
  ui.renaming = null;
  ui.drag = null;
  ACTIVE = id;
  putTabInS(currentTab());
  document.querySelectorAll('#dock .chat').forEach((el) => el.remove());
  afterTabChange();
}

function afterTabChange() {
  ui.open.forEach((w) => ui.unread.delete(w.id)); // its open chat windows are on screen again
  syncDock();
  renderNodes();
  applyView();
  renderToolbar();
  renderAllChats();
  if (filesUI && filesUI.expanded) filesUI.expanded.clear();
  refreshFiles();
  api.saveState(serializeState());
  renderTabs();
}

// A new blank tab. It starts in the same project folder as the tab you were on.
function newTab(title) {
  syncActiveTab();
  const t = blankTab(title || nextTeamTitle(), S.cwd);
  const i = TABS.findIndex((x) => x.id === ACTIVE);
  TABS.splice(i + 1, 0, t);
  switchTab(t.id);
  return t;
}

const isBlankTab = (t) => t && !(t.id === ACTIVE ? S.nodes : t.nodes).length && !t.teamName;

// A reply or task for an agent in a background tab: queue its chat as a bubble in that tab.
function notifyOtherTab(name) {
  const t = tabOfAgent(name);
  if (!t || t.id === ACTIVE) return false;
  ui.unread.add(name);
  t.dock = t.dock || { open: [], bubbles: [] };
  if (!t.dock.open.some((w) => w.id === name) && !t.dock.bubbles.includes(name)) t.dock.bubbles.unshift(name);
  renderTabs();
  return true;
}

function tabDirty(t) {
  if (t.id === ACTIVE) syncActiveTab();
  return teamDirtyOf(t);
}

function closeTab(id) {
  const t = TABS.find((x) => x.id === id);
  if (!t) return;
  if (tabDirty(t)) {
    if (id !== ACTIVE) switchTab(id);
    ui.tabClose = { id };
    renderModal();
    return;
  }
  reallyCloseTab(id);
}

// Close a tab. Its role files stay where they are; its chats are forgotten and its running tasks stop.
function reallyCloseTab(id) {
  const i = TABS.findIndex((x) => x.id === id);
  if (i < 0) return;
  if (id === ACTIVE) syncActiveTab();
  const t = TABS[i];
  (t.nodes || []).forEach((n) => {
    const name = n.name;
    if (ui.runs[name]) { try { api.stop(ui.runs[name]); } catch (e) { /* ignore */ } delete ui.runs[name]; }
    delete chats[name]; delete lastCall[name]; delete ui.drafts[name]; delete ui.attach[name];
    ui.unread.delete(name);
  });
  TABS.splice(i, 1);
  if (!TABS.length) TABS.push(blankTab('Team 1', t.cwd));
  if (id === ACTIVE) {
    ACTIVE = (TABS[i] || TABS[i - 1] || TABS[0]).id;
    putTabInS(currentTab());
    document.querySelectorAll('#dock .chat').forEach((el) => el.remove());
    afterTabChange();
  } else {
    api.saveState(serializeState());
    renderTabs();
  }
}

function renderTabCloseConfirm() {
  const t = TABS.find((x) => x.id === ui.tabClose.id);
  const name = t ? t.title : 'this team';
  $('#modal').innerHTML = '<div class="overlay"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="tclose-title">' +
    '<h2 id="tclose-title">Save "' + esc(name) + '" before closing?</h2>' +
    '<p class="small">This team has changes that aren\'t saved in a team file. Role files stay in the project folder either way.</p>' +
    '<div class="actions"><button type="button" class="btn" data-tc="cancel">Cancel</button>' +
    '<button type="button" class="btn" data-tc="discard">Don\'t save</button>' +
    '<button type="button" class="btn primary" data-tc="save">Save</button></div>' +
    '</div></div>';
}

let renamingTab = null;
function renderTabs() {
  const bar = $('#team-tabs');
  if (!bar) return;
  if (ACTIVE) syncActiveTab();
  const busy = new Set(Object.keys(ui.runs));
  bar.innerHTML = TABS.map((t) => {
    const active = t.id === ACTIVE;
    const dirty = teamDirtyOf(t);
    const running = (t.nodes || []).some((n) => busy.has(n.name));
    const unread = !active && (t.nodes || []).some((n) => ui.unread.has(n.name));
    const name = renamingTab === t.id
      ? '<form class="tt-rename" data-tab-rename="' + esc(t.id) + '"><input aria-label="Team name" maxlength="60" value="' + esc(t.title) + '"></form>'
      : '<span class="tt-name">' + esc(t.title) + '</span>';
    return '<div class="team-tab' + (active ? ' active' : '') + '" role="tab" aria-selected="' + active + '" tabindex="0" data-tab="' + esc(t.id) + '" title="' + esc(t.title) + (t.cwd ? ' · ' + esc(t.cwd) : '') + '. Double-click to rename.">' +
      name +
      (running ? '<span class="tt-busy" title="An agent is working"></span>' : unread ? '<span class="tt-unread" title="New messages"></span>' : '') +
      (dirty ? '<span class="tt-dot" title="Unsaved changes"></span>' : '') +
      '<button type="button" class="tt-x" data-tab-close="' + esc(t.id) + '" aria-label="Close ' + esc(t.title) + '">&times;</button></div>';
  }).join('') + '<button type="button" class="tt-new" data-tab-new aria-label="New team" title="New team">+</button>';
  if (renamingTab) {
    const inp = bar.querySelector('.tt-rename input');
    if (inp) { inp.focus(); inp.select(); }
  }
}

function commitTabRename(id, value) {
  const t = TABS.find((x) => x.id === id);
  renamingTab = null;
  const v = String(value || '').trim().slice(0, 60);
  if (t && v) t.title = v;
  api.saveState(serializeState());
  renderTabs();
}

function bindTabs() {
  const bar = $('#team-tabs');
  $('#new-team').addEventListener('click', () => newTab());
  bar.addEventListener('click', (e) => {
    if (e.target.closest('[data-tab-new]')) { newTab(); return; }
    const x = e.target.closest('[data-tab-close]');
    if (x) { e.stopPropagation(); closeTab(x.dataset.tabClose); return; }
    if (e.target.closest('.tt-rename')) return;
    const t = e.target.closest('[data-tab]');
    if (t) switchTab(t.dataset.tab);
  });
  bar.addEventListener('keydown', (e) => {
    const t = e.target.closest('[data-tab]');
    if (!t || e.target.closest('.tt-rename')) {
      if (e.key === 'Escape' && renamingTab) { renamingTab = null; renderTabs(); }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchTab(t.dataset.tab); }
    if (e.key === 'F2') { e.preventDefault(); renamingTab = t.dataset.tab; renderTabs(); }
  });
  bar.addEventListener('dblclick', (e) => {
    const t = e.target.closest('[data-tab]');
    if (!t || e.target.closest('[data-tab-close]')) return;
    renamingTab = t.dataset.tab;
    renderTabs();
  });
  bar.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-tab-rename]');
    if (!f) return;
    e.preventDefault();
    commitTabRename(f.dataset.tabRename, f.querySelector('input').value);
  });
  bar.addEventListener('focusout', (e) => {
    const f = e.target.closest('[data-tab-rename]');
    if (f && renamingTab) commitTabRename(f.dataset.tabRename, f.querySelector('input').value);
  });
  $('#modal').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tc]');
    if (!b || !ui.tabClose) return;
    const id = ui.tabClose.id;
    const act = b.dataset.tc;
    ui.tabClose = null;
    renderModal();
    if (act === 'discard') reallyCloseTab(id);
    else if (act === 'save') { if (await saveTeam()) reallyCloseTab(id); }
  });
}
