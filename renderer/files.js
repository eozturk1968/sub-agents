'use strict';
/* global api, S, ui, $, esc, ICON, model, shortName, isReady, chats, openChat, renderChat, renderAttachRow, renderModal, isOpen */
// Files tab: browse the project folder, open and edit files, drafts, and links to chats.
// Loaded before renderer.js; everything here runs after renderer.js has set up.

const DRAFTS = '.sub-agents/drafts';
const filesUI = { tab: 'models', expanded: new Set(), entries: {}, newItem: null, error: '' };

const FICON = {
  folder: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  file: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>',
  caretR: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  caretD: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  team: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5V12M12 12l-5.5 4.5M12 12l5.5 4.5"/></svg>',
  refresh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>'
};

const baseName = (rel) => String(rel).split(/[\\/]/).pop();

// ---------- Loading ----------
async function loadDir(rel) {
  const r = await api.fsList(S.cwd, rel);
  filesUI.entries[rel] = r.ok ? r.entries : [];
  if (!r.ok) filesUI.error = r.error;
}

async function refreshFiles() {
  filesUI.entries = {};
  filesUI.error = '';
  if (S.cwd) {
    await loadDir('');
    await loadDir(DRAFTS);
    await loadDir(TEAMS);
    for (const rel of [...filesUI.expanded]) await loadDir(rel);
  }
  renderFiles();
}

// ---------- Sidebar panel ----------
function newItemRow(type) {
  if (!filesUI.newItem || filesUI.newItem.type !== type) return '';
  const ph = type === 'folder' ? 'folder-name' : type === 'draft' ? 'draft-name' : 'name.md (or docs/name.md)';
  return '<form class="new-item" data-f-form><label class="sr" for="new-item-name">Name</label>' +
    '<input id="new-item-name" placeholder="' + ph + '" autocomplete="off">' +
    '<button type="submit" class="btn sm">Create</button><button type="button" class="btn sm" data-f="cancel-new">Cancel</button></form>';
}

function treeRows(rel, depth) {
  return (filesUI.entries[rel] || []).map((e) => {
    const pad = 'padding-left:' + (8 + depth * 14) + 'px';
    if (e.dir) {
      const open = filesUI.expanded.has(e.rel);
      return '<button type="button" class="file-row" style="' + pad + '" data-toggle="' + esc(e.rel) + '" aria-expanded="' + open + '">' +
        (open ? FICON.caretD : FICON.caretR) + FICON.folder + '<span>' + esc(e.name) + '</span></button>' +
        (open ? treeRows(e.rel, depth + 1) : '');
    }
    return '<button type="button" class="file-row" style="' + pad + '" data-open-file="' + esc(e.rel) + '">' +
      '<span class="caret-space"></span>' + FICON.file + '<span>' + esc(e.name) + '</span></button>';
  }).join('');
}

function renderFiles() {
  const el = $('#panel-files');
  if (!el) return;
  if (!S.cwd) {
    el.innerHTML = '<p class="muted small">Choose a project folder to see its files, drafts, role files and attachments.</p>' +
      '<button type="button" class="btn" data-f="pick">Choose project folder</button>';
    return;
  }
  const drafts = (filesUI.entries[DRAFTS] || []).filter((e) => !e.dir);
  const folderName = S.cwd.split(/[\\/]/).filter(Boolean).pop();
  const teams = (filesUI.entries[TEAMS] || []).filter((e) => !e.dir && /\.json$/i.test(e.name));
  el.innerHTML =
    '<div class="files-head"><span class="section-label">Drafts</span><span class="grow"></span>' +
    '<button type="button" class="icon-btn" data-f="new-draft" aria-label="New draft" title="New draft">' + FICON.plus + '</button></div>' +
    newItemRow('draft') +
    (drafts.length
      ? '<div class="file-list">' + drafts.map((e) => '<button type="button" class="file-row" data-open-file="' + esc(e.rel) + '"><span class="caret-space"></span>' + FICON.file + '<span>' + esc(e.name) + '</span></button>').join('') + '</div>'
      : '<p class="muted small">No drafts yet. Use + to write one, or "Save as draft" on any reply.</p>') +
    '<div class="files-head"><span class="section-label">Teams</span></div>' +
    (teams.length
      ? '<div class="file-list">' + teams.map((e) => '<button type="button" class="file-row" data-open-team="' + esc(e.rel) + '" title="Open this team on the canvas"><span class="caret-space"></span>' + FICON.team + '<span>' + esc(e.name.replace(/\.team\.json$|\.json$/i, '')) + '</span></button>').join('') + '</div>'
      : '<p class="muted small">No saved teams yet. Use Save team at the top.</p>') +
    '<div class="files-head"><span class="section-label" title="' + esc(S.cwd) + '">' + esc(folderName) + '</span><span class="grow"></span>' +
    '<button type="button" class="icon-btn" data-f="new-file" aria-label="New file" title="New file">' + FICON.plus + '</button>' +
    '<button type="button" class="icon-btn" data-f="new-folder" aria-label="New folder" title="New folder">' + FICON.folder + '</button>' +
    '<button type="button" class="icon-btn" data-f="refresh" aria-label="Refresh" title="Refresh">' + FICON.refresh + '</button></div>' +
    newItemRow('file') + newItemRow('folder') +
    (filesUI.error ? '<p class="error">' + esc(filesUI.error) + '</p>' : '') +
    '<div class="file-list">' + (treeRows('', 0) || '<p class="muted small">This folder is empty.</p>') + '</div>';
  const inp = $('#new-item-name');
  if (inp) inp.focus();
}

function showTab(tab) {
  filesUI.tab = tab;
  ['models', 'files'].forEach((t) => {
    $('#tab-' + t).setAttribute('aria-selected', String(t === tab));
    $('#panel-' + t).hidden = t !== tab;
  });
  if (tab === 'files') refreshFiles();
}

async function createItem(name) {
  const it = filesUI.newItem;
  name = String(name || '').trim();
  if (!it || !name) return;
  let rel;
  if (it.type === 'draft') rel = DRAFTS + '/' + (/\.[a-z0-9]+$/i.test(name) ? name : name + '.md');
  else rel = name;
  if (it.type === 'folder') {
    const r = await api.fsMkdir(S.cwd, rel);
    if (!r.ok) { filesUI.error = r.error; renderFiles(); return; }
    filesUI.expanded.add(r.rel);
    filesUI.newItem = null;
    await refreshFiles();
    return;
  }
  const ex = await api.fsExists(S.cwd, rel);
  if (!ex.ok) { filesUI.error = ex.error; renderFiles(); return; }
  if (!ex.exists) {
    const w = await api.fsWrite(S.cwd, rel, '');
    if (!w.ok) { filesUI.error = w.error; renderFiles(); return; }
  }
  filesUI.newItem = null;
  await refreshFiles();
  openEditor(rel);
}

// ---------- Editor ----------
function sendTargets() {
  return S.nodes.filter((n) => model(n.modelId) && isReady(n.modelId)).map((n) => n.name);
}

async function openEditor(rel) {
  const r = await api.fsRead(S.cwd, rel);
  if (!r.ok) { filesUI.error = r.error; renderFiles(); return; }
  const targets = sendTargets();
  ui.editor = {
    rel, saveAs: rel, kind: r.kind, text: r.text || '', orig: r.text || '', dataUrl: r.dataUrl, size: r.size,
    msg: '', confirmClose: false, confirmReplace: false, sendTo: targets[0] || ''
  };
  renderModal();
}

function editorDirty() {
  const e = ui.editor;
  return !!e && e.kind === 'text' && e.text !== e.orig;
}

function renderEditor() {
  const e = ui.editor;
  const targets = sendTargets();
  if (!targets.includes(e.sendTo)) e.sendTo = targets[0] || '';
  let body;
  if (e.kind === 'text') body = '<label class="sr" for="editor-text">File contents</label><textarea id="editor-text" class="role-text mono" spellcheck="false"></textarea>';
  else if (e.kind === 'image') body = '<div class="editor-image"><img src="' + e.dataUrl + '" alt="' + esc(baseName(e.rel)) + '"></div>';
  else body = '<p class="note">This file can\'t be shown here. Open it in its own app instead.</p>';
  const isDraft = e.rel.startsWith(DRAFTS + '/');
  $('#modal').innerHTML = '<div class="overlay"><div class="dialog wide" role="dialog" aria-modal="true" aria-labelledby="editor-title">' +
    '<div class="row top"><div class="col grow gap4"><h2 id="editor-title">' + (isDraft ? 'Draft' : 'File') + '</h2>' +
    (e.kind === 'text'
      ? '<label class="small muted" for="editor-path">Path in the project folder (change it to save a copy under a new name)</label><input id="editor-path" class="path-input mono">'
      : '<span class="mono small">' + esc(e.rel) + '</span>') +
    '</div><button type="button" class="icon-btn" data-e="close" aria-label="Close">' + ICON.x + '</button></div>' +
    body +
    '<p id="editor-status" class="small ' + (e.msg && /^Saved/.test(e.msg) ? 'ok-text' : 'muted') + '" role="status">' + esc(e.msg || (editorDirty() ? 'Unsaved changes. ' + MOD + '+S saves.' : ' ')) + '</p>' +
    '<div class="actions editor-actions">' +
    '<button type="button" class="btn" data-e="open">Open in its app</button>' +
    '<button type="button" class="btn" data-e="reveal">Show in ' + FILE_MANAGER + '</button>' +
    '<span class="send-to"><label class="sr" for="editor-send">Agent</label>' +
    (targets.length
      ? '<select id="editor-send">' + targets.map((id) => '<option value="' + esc(id) + '"' + (id === e.sendTo ? ' selected' : '') + '>' + esc(id) + '</option>').join('') + '</select>' +
        '<button type="button" class="btn" data-e="send">Send to chat</button>'
      : '<span class="muted small">Connect an agent to send this to a chat.</span>') +
    '</span><span class="grow"></span>' +
    '<button type="button" class="btn" data-e="close">Close</button>' +
    (e.kind === 'text' ? '<button type="button" class="btn primary" data-e="save">Save</button>' : '') +
    '</div></div></div>';
  const t = $('#editor-text');
  if (t) {
    t.value = e.text;
    t.addEventListener('input', (ev) => {
      const wasDirty = editorDirty();
      e.text = ev.target.value; e.msg = ''; e.confirmClose = false;
      if (wasDirty !== editorDirty()) updateEditorStatus();
    });
    t.addEventListener('keydown', (ev) => { if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); saveEditor(); } });
    t.focus();
  }
  const p = $('#editor-path');
  if (p) {
    p.value = e.saveAs;
    p.addEventListener('input', (ev) => { e.saveAs = ev.target.value; e.confirmReplace = false; });
    p.addEventListener('keydown', (ev) => { if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); saveEditor(); } });
  }
  const sel = $('#editor-send');
  if (sel) sel.addEventListener('change', (ev) => { e.sendTo = ev.target.value; });
}

function updateEditorStatus() {
  const e = ui.editor;
  const el = $('#editor-status');
  if (el && e) el.textContent = e.msg || (editorDirty() ? 'Unsaved changes. ' + MOD + '+S saves.' : ' ');
}

async function saveEditor() {
  const e = ui.editor;
  if (!e || e.kind !== 'text') return true;
  const target = e.saveAs.trim();
  if (!target) { e.msg = 'Give the file a name.'; renderEditor(); return false; }
  if (target !== e.rel && !e.confirmReplace) {
    const ex = await api.fsExists(S.cwd, target);
    if (ex.ok && ex.exists) { e.confirmReplace = true; e.msg = target + ' already exists. Click Save again to replace it.'; renderEditor(); return false; }
  }
  const r = await api.fsWrite(S.cwd, target, e.text);
  if (!r.ok) { e.msg = 'Could not save: ' + r.error; renderEditor(); return false; }
  e.rel = r.rel; e.saveAs = r.rel; e.orig = e.text; e.confirmReplace = false; e.confirmClose = false;
  e.msg = 'Saved ' + r.rel + ' at ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '.';
  renderEditor();
  refreshFiles();
  return true;
}

function closeEditor() {
  const e = ui.editor;
  if (editorDirty() && !e.confirmClose) {
    e.confirmClose = true;
    e.msg = 'You have unsaved changes. Click Close again to throw them away, or Save.';
    renderEditor();
    return;
  }
  ui.editor = null;
  renderModal();
}

async function sendEditorToChat() {
  const e = ui.editor;
  const id = e.sendTo;
  if (!id) return;
  if (editorDirty() && !(await saveEditor())) return;
  const isDraft = e.rel.startsWith(DRAFTS + '/');
  if (e.kind === 'image') {
    (ui.attach[id] || (ui.attach[id] = [])).push({ name: baseName(e.rel), dataUrl: e.dataUrl });
  } else if (isDraft && e.kind === 'text') {
    ui.drafts[id] = (ui.drafts[id] ? ui.drafts[id] + '\n\n' : '') + e.text;
  } else {
    ui.drafts[id] = (ui.drafts[id] ? ui.drafts[id] + '\n\n' : '') + 'Please look at the file `' + e.rel + '` in the project folder.';
  }
  ui.editor = null;
  renderModal();
  if (!chats[id]) chats[id] = [];
  const wasOpen = isOpen(id);
  openChat(id);
  if (wasOpen) renderChat(id);
}

// ---------- Save a chat reply as a draft ----------
async function saveReplyAsDraft(id, index) {
  const msg = (chats[id] || [])[index];
  if (!msg || !msg.text) return;
  if (!S.cwd) {
    chats[id].push({ role: 'error', text: 'Choose a project folder (Folder button at the top) to save drafts.' });
    renderChat(id);
    return;
  }
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  const rel = DRAFTS + '/' + id.replace(/[^A-Za-z0-9._-]/g, '_') + '-' + stamp + '.md';
  const r = await api.fsWrite(S.cwd, rel, msg.text);
  if (!r.ok) { chats[id].push({ role: 'error', text: 'Could not save the draft: ' + r.error }); renderChat(id); return; }
  await refreshFiles();
  openEditor(r.rel);
}

// ---------- Events ----------
function bindFiles() {
  $('#tab-models').addEventListener('click', () => showTab('models'));
  $('#tab-files').addEventListener('click', () => showTab('files'));

  const panel = $('#panel-files');
  panel.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-f]');
    if (f) {
      const act = f.dataset.f;
      if (act === 'pick') { $('#folder').click(); return; }
      if (act === 'refresh') { refreshFiles(); return; }
      if (act === 'cancel-new') { filesUI.newItem = null; renderFiles(); return; }
      if (act === 'new-draft') { filesUI.newItem = { type: 'draft' }; renderFiles(); return; }
      if (act === 'new-file') { filesUI.newItem = { type: 'file' }; renderFiles(); return; }
      if (act === 'new-folder') { filesUI.newItem = { type: 'folder' }; renderFiles(); return; }
    }
    const t = e.target.closest('[data-toggle]');
    if (t) {
      const rel = t.dataset.toggle;
      if (filesUI.expanded.has(rel)) filesUI.expanded.delete(rel);
      else { filesUI.expanded.add(rel); await loadDir(rel); }
      renderFiles();
      return;
    }
    const o = e.target.closest('[data-open-file]');
    if (o) openEditor(o.dataset.openFile);
  });
  panel.addEventListener('submit', (e) => {
    if (!e.target.matches('[data-f-form]')) return;
    e.preventDefault();
    createItem($('#new-item-name').value);
  });

  $('#modal').addEventListener('click', (e) => {
    const b = e.target.closest('[data-e]');
    if (!b || !ui.editor) return;
    const act = b.dataset.e;
    if (act === 'save') saveEditor();
    else if (act === 'close') closeEditor();
    else if (act === 'open') api.fsOpen(S.cwd, ui.editor.rel);
    else if (act === 'reveal') api.fsReveal(S.cwd, ui.editor.rel);
    else if (act === 'send') sendEditorToChat();
  });
}
