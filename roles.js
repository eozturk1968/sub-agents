// Role files: one Markdown file per agent, kept in the project folder at
//   PROJECT/.sub-agents/roles/MODEL.md
// The file is put at the top of every task the agent gets, and lines the agent
// writes as "REMEMBER: ..." are added to its "# Memory" section.
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEMPLATE = (modelId) => [
  '# Role',
  'You are ' + modelId + ' on a team of AI agents. Describe this agent\'s job here.',
  '',
  '# Rules',
  '- Keep answers clear and short.',
  '',
  '# Memory',
  ''
].join('\n');

function roleDir(cwd) {
  return path.join(cwd || os.homedir(), '.sub-agents', 'roles');
}

function rolePath(cwd, modelId) {
  return path.join(roleDir(cwd), String(modelId).replace(/[^A-Za-z0-9._-]/g, '_') + '.md');
}

function readRole(cwd, modelId) {
  const p = rolePath(cwd, modelId);
  try { return { path: p, text: fs.readFileSync(p, 'utf8'), exists: true }; }
  catch (e) { return { path: p, text: TEMPLATE(modelId), exists: false }; }
}

function writeRole(cwd, modelId, text) {
  const p = rolePath(cwd, modelId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, String(text));
  return p;
}

// Text that goes at the top of every task.
function rolePrompt(cwd, modelId) {
  const r = readRole(cwd, modelId);
  const parts = [];
  if (r.exists && r.text.trim()) {
    parts.push('Your role file (' + r.path + '). Read it and follow it before working:\n---\n' + r.text.trim() + '\n---');
  }
  parts.push('If you learn something important for future tasks (a decision, a preference, a key fact about this project), ' +
    'add it at the very end of your reply as a line starting with "REMEMBER: ". One short fact per line. Only add what really matters.');
  return parts.join('\n\n');
}

function extractRemember(text) {
  return String(text || '').split('\n')
    .map((l) => l.trim())
    .filter((l) => /^REMEMBER:/i.test(l))
    .map((l) => l.replace(/^REMEMBER:\s*/i, '').trim())
    .filter(Boolean);
}

// Add new memory lines under "# Memory" (creating the file or section if needed).
function remember(cwd, modelId, replyText) {
  const lines = extractRemember(replyText);
  if (!lines.length) return [];
  const r = readRole(cwd, modelId);
  let text = r.text.replace(/\s+$/, '');
  const existing = new Set(text.split('\n').map((l) => l.replace(/^-\s*/, '').trim()));
  const fresh = lines.filter((l) => !existing.has(l));
  if (!fresh.length) return [];
  if (!/^# Memory\s*$/m.test(text)) text += '\n\n# Memory';
  // Append at the end of the Memory section (before the next "# " heading, if any).
  const idx = text.search(/^# Memory\s*$/m);
  const after = text.slice(idx);
  const next = after.slice(1).search(/^# /m);
  const insertAt = next === -1 ? text.length : idx + 1 + next;
  const block = fresh.map((l) => '- ' + l).join('\n');
  const before = text.slice(0, insertAt).replace(/\s+$/, '');
  const rest = text.slice(insertAt);
  text = before + '\n' + block + (rest ? '\n\n' + rest : '') + '\n';
  writeRole(cwd, modelId, text);
  return fresh;
}

// Move a role file to a new agent name, only if the new name has no role file yet.
function renameRole(cwd, from, to) {
  const a = rolePath(cwd, from);
  const b = rolePath(cwd, to);
  if (a === b || !fs.existsSync(a) || fs.existsSync(b)) return false;
  fs.renameSync(a, b);
  return true;
}

// When an agent is removed from the canvas: move its role file and save its chat
// into PROJECT/.sub-agents/removed, so nothing is lost but the agent starts blank
// if it is added again. Returns the paths written.
function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
}
function archiveAgent(cwd, name, chatMarkdown, now) {
  const safe = String(name).replace(/[^A-Za-z0-9._-]/g, '_');
  const dir = path.join(cwd || os.homedir(), '.sub-agents', 'removed');
  const src = rolePath(cwd, name);
  const hasRole = fs.existsSync(src);
  const hasChat = !!(chatMarkdown && String(chatMarkdown).trim());
  if (!hasRole && !hasChat) return [];
  fs.mkdirSync(dir, { recursive: true });
  // Pick a base name not used by an earlier removal: NAME-DATE, NAME-DATE-2, ...
  const base0 = safe + '-' + stamp(now || new Date());
  let base = base0;
  for (let i = 2; fs.existsSync(path.join(dir, base + '.md')) || fs.existsSync(path.join(dir, base + '-chat.md')); i++) base = base0 + '-' + i;
  const out = [];
  if (hasRole) {
    const dest = path.join(dir, base + '.md');
    try { fs.renameSync(src, dest); } catch (e) { fs.copyFileSync(src, dest); fs.unlinkSync(src); }
    out.push(dest);
  }
  if (hasChat) {
    const dest = path.join(dir, base + '-chat.md');
    fs.writeFileSync(dest, String(chatMarkdown));
    out.push(dest);
  }
  return out;
}

module.exports = { rolePath, readRole, writeRole, rolePrompt, remember, extractRemember, renameRole, archiveAgent };
