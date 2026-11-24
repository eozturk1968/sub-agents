// File access for the Files tab. Every path is relative to the project folder,
// and nothing outside that folder can be read or written.
const fs = require('fs');
const path = require('path');
const { shell } = require('electron');

const HIDDEN = new Set(['.git', 'node_modules', '.DS_Store']);
const IMAGE_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const MAX_TEXT = 2 * 1024 * 1024;
const MAX_IMAGE = 20 * 1024 * 1024;

function safePath(cwd, rel) {
  if (!cwd) throw new Error('Choose a project folder first (Folder button at the top).');
  const root = path.resolve(cwd);
  const full = path.resolve(root, String(rel || ''));
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error('That path is outside the project folder.');
  return full;
}

// Paths go to the window with forward slashes on every system.
const toRel = (p) => String(p).split(path.sep).join('/');

const wrap = (fn) => async (...args) => {
  try { return { ok: true, ...(await fn(...args)) }; } catch (e) { return { ok: false, error: e.message }; }
};

const list = wrap((cwd, rel) => {
  const dir = safePath(cwd, rel);
  if (!fs.existsSync(dir)) return { entries: [] };
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => !HIDDEN.has(d.name))
    .map((d) => ({ name: d.name, rel: toRel(path.join(rel || '', d.name)), dir: d.isDirectory() }))
    .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
  return { entries };
});

const read = wrap((cwd, rel) => {
  const full = safePath(cwd, rel);
  const st = fs.statSync(full);
  if (st.isDirectory()) throw new Error('That is a folder.');
  const ext = path.extname(full).toLowerCase();
  if (IMAGE_MIME[ext]) {
    if (st.size > MAX_IMAGE) return { kind: 'other', size: st.size };
    return { kind: 'image', size: st.size, dataUrl: 'data:' + IMAGE_MIME[ext] + ';base64,' + fs.readFileSync(full).toString('base64') };
  }
  if (st.size > MAX_TEXT) return { kind: 'other', size: st.size };
  const buf = fs.readFileSync(full);
  // A NUL byte in the first 8 KB means it's not a text file.
  if (buf.subarray(0, 8192).includes(0)) return { kind: 'other', size: st.size };
  return { kind: 'text', size: st.size, text: buf.toString('utf8') };
});

const write = wrap((cwd, rel, text) => {
  const full = safePath(cwd, rel);
  if (!rel || full === path.resolve(cwd)) throw new Error('Give the file a name.');
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, String(text));
  return { rel: toRel(path.relative(path.resolve(cwd), full)) };
});

const mkdir = wrap((cwd, rel) => {
  const full = safePath(cwd, rel);
  fs.mkdirSync(full, { recursive: true });
  return { rel: toRel(path.relative(path.resolve(cwd), full)) };
});

const exists = wrap((cwd, rel) => ({ exists: fs.existsSync(safePath(cwd, rel)) }));

const open = wrap(async (cwd, rel) => {
  const err = await shell.openPath(safePath(cwd, rel));
  if (err) throw new Error(err);
  return {};
});

const reveal = wrap((cwd, rel) => { shell.showItemInFolder(safePath(cwd, rel)); return {}; });

module.exports = { list, read, write, mkdir, exists, open, reveal, safePath };
