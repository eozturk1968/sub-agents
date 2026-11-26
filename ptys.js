'use strict';
// Terminal tabs: real shells (zsh/bash on Mac and Linux, PowerShell on Windows) run with node-pty.
// The window only sees the text going in and out. Shells are not saved between launches.

const fs = require('fs');
const os = require('os');
const path = require('path');

let pty = null;
let loadError = null;
function loadPty() {
  if (pty || loadError) return pty;
  try { pty = require('@lydell/node-pty'); } catch (e) { loadError = e; }
  return pty;
}

const sessions = new Map(); // id -> pty process
let seq = 0;

function shellFor(platform, env) {
  if (platform === 'win32') return { file: 'powershell.exe', args: ['-NoLogo'] };
  const sh = env.SHELL || (platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
  return { file: sh, args: ['-l'] };
}

// binDir goes first on PATH so `subagent` works in the terminal like it does for leaders.
function shellEnv(base, binDir, platform) {
  const env = { ...base };
  delete env.ELECTRON_RUN_AS_NODE;
  const key = platform === 'win32' ? (Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'Path') : 'PATH';
  const sep = platform === 'win32' ? ';' : ':';
  const parts = (env[key] || '').split(sep).filter(Boolean).filter((p) => p !== binDir);
  env[key] = [binDir, ...parts].join(sep);
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  env.TERM_PROGRAM = 'Sub-Agents';
  return env;
}

function pickCwd(cwd) {
  try { if (cwd && fs.statSync(cwd).isDirectory()) return cwd; } catch (e) { /* missing */ }
  return os.homedir();
}

function create(opts, binDir, send) {
  const p = loadPty();
  if (!p) return { ok: false, error: 'The terminal could not start: ' + (loadError && loadError.message ? loadError.message.split('\n')[0] : 'node-pty is missing.') };
  const sh = shellFor(process.platform, process.env);
  const cwd = pickCwd(opts && opts.cwd);
  let proc;
  try {
    proc = p.spawn(sh.file, sh.args, {
      name: 'xterm-256color',
      cols: Math.max(20, (opts && opts.cols) | 0 || 80),
      rows: Math.max(5, (opts && opts.rows) | 0 || 24),
      cwd,
      env: shellEnv(process.env, binDir, process.platform)
    });
  } catch (e) {
    return { ok: false, error: 'Could not start ' + path.basename(sh.file) + ': ' + e.message };
  }
  const id = 'pty' + (++seq);
  sessions.set(id, proc);
  proc.onData((data) => send('pty:data', { id, data }));
  proc.onExit(({ exitCode }) => { sessions.delete(id); send('pty:exit', { id, code: exitCode }); });
  return { ok: true, id, shell: path.basename(sh.file).replace(/\.exe$/i, ''), cwd };
}

function write(id, data) { const s = sessions.get(id); if (s && typeof data === 'string') s.write(data); }
function resize(id, cols, rows) {
  const s = sessions.get(id);
  if (s && cols > 0 && rows > 0) { try { s.resize(cols | 0, rows | 0); } catch (e) { /* already exited */ } }
}
function kill(id) {
  const s = sessions.get(id);
  sessions.delete(id);
  if (s) { try { s.kill(); } catch (e) { /* already exited */ } }
}
function killAll() { for (const id of [...sessions.keys()]) kill(id); }

module.exports = { create, write, resize, kill, killAll, shellFor, shellEnv, pickCwd };
