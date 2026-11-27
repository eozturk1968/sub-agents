'use strict';
/* global api, ui, chats, agentNode, TABS, renderMessages */
// Chat history kept between launches: saved to chats.json in the app's data folder.
// Loaded before renderer.js; everything here runs after renderer.js has set up.

const CHAT_LIMIT = 500;       // messages kept per agent
let lastChatJson = null;

// The saved form of one message. Image data stays out: only the file name and path.
// A reply still being written when the app closed is kept, marked as interrupted.
function storedMessage(m) {
  const o = { role: m.role, text: m.text || '' };
  if (m.from) o.from = m.from;
  if (m.images && m.images.length && !(m.files && m.files.length)) o.images = m.images.map((im) => ({ name: im.name, path: im.path || null }));
  if (m.files && m.files.length) o.files = m.files.map((f) => ({ name: f.name, path: f.path || null, rel: f.rel || null, size: f.size == null ? null : f.size, image: !!f.image }));
  if (m.elapsed) o.elapsed = m.elapsed;
  if (m.live) o.text = (o.text ? o.text + '\n' : '') + '(interrupted)';
  return o;
}

function chatSnapshot() {
  const out = {};
  Object.keys(chats).forEach((name) => {
    const list = chats[name];
    if (!Array.isArray(list)) return;
    if (list.length > CHAT_LIMIT) list.splice(0, list.length - CHAT_LIMIT); // in place: running tasks keep their list
    const kept = list.filter((m) => m.role !== 'assistant' || m.text || m.live).map(storedMessage);
    if (kept.length) out[name] = kept;
  });
  return JSON.stringify({ version: 1, chats: out, unread: [...ui.unread] });
}

// Save when something changed. Runs twice a second; the write itself happens in the main process.
function persistChats() {
  let json;
  try { json = chatSnapshot(); } catch (e) { return; }
  if (json === lastChatJson) return;
  lastChatJson = json;
  api.saveChats(json);
}

// Put saved chats back. Call before the tabs are checked, so renames carry the chats along.
async function restoreChats() {
  let saved = null;
  try { saved = await api.loadChats(); } catch (e) { saved = null; }
  if (!saved || typeof saved !== 'object' || !saved.chats) return;
  Object.keys(saved.chats).forEach((name) => {
    const list = saved.chats[name];
    if (!Array.isArray(list)) return;
    chats[name] = list.slice(-CHAT_LIMIT).filter((m) => m && typeof m.role === 'string').map((m) => {
      const o = { role: m.role, text: typeof m.text === 'string' ? m.text : '' };
      if (m.from) o.from = String(m.from);
      if (Array.isArray(m.images)) o.images = m.images.map((im) => ({ name: String((im && im.name) || 'image'), path: im && im.path ? String(im.path) : null }));
      if (Array.isArray(m.files)) {
        o.files = m.files.filter((f) => f && typeof f === 'object').map((f) => ({
          name: String(f.name || 'file'), path: f.path ? String(f.path) : null, rel: f.rel ? String(f.rel) : null,
          size: typeof f.size === 'number' ? f.size : null, image: !!f.image
        }));
      }
      if (typeof m.elapsed === 'number') o.elapsed = m.elapsed;
      return o;
    });
  });
  (saved.unread || []).forEach((n) => { if (typeof n === 'string') ui.unread.add(n); });
}

// After the tabs are checked: forget chats of agents that are no longer on any canvas.
function pruneChats() {
  const names = new Set();
  TABS.forEach((t) => (t.nodes || []).forEach((n) => names.add(n.name)));
  Object.keys(chats).forEach((name) => { if (!names.has(name)) delete chats[name]; });
  [...ui.unread].forEach((name) => { if (!names.has(name)) ui.unread.delete(name); });
}

// Restored images have only a path: read the picture when the chat is shown.
function loadChatImage(id, im) {
  if (im.dataUrl || im.missing || im.loading) return;
  if (!im.path) { im.missing = true; return; }
  im.loading = true;
  api.readImage(im.path).then((url) => {
    im.loading = false;
    if (url) im.dataUrl = url; else im.missing = true;
    renderMessages(id);
  }, () => { im.loading = false; im.missing = true; renderMessages(id); });
}

function startChatStore() {
  lastChatJson = chatSnapshot(); // nothing new to write right after loading
  setInterval(persistChats, 500);
  // Closing the window: write anything not yet saved before the app quits.
  window.addEventListener('beforeunload', () => {
    try { const json = chatSnapshot(); if (json !== lastChatJson) { lastChatJson = json; api.flushChats(json); } } catch (e) { /* ignore */ }
  });
}
