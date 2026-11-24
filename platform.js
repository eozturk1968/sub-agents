// Platform differences (macOS/Linux vs Windows) in one place, as plain functions
// that take the platform as an argument so they can be tested on any machine.
const path = require('path');

// Quote for sh (macOS/Linux, and Git Bash on Windows).
const shQuote = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
// Git Bash understands C:/Users/... paths; backslashes would need escaping.
const fwd = (p) => String(p).replace(/\\/g, '/');
// In a .cmd file, % starts a variable, so a literal % must be doubled.
const cmdEscape = (p) => String(p).replace(/%/g, '%%');

// Files to write so leaders can run sub-agents. binDir is ~/.sub-agents/bin.
// macOS/Linux: one sh script. Windows: subagent.cmd (PowerShell and CMD) and an
// extensionless sh script named subagent (Git Bash, which Claude Code's Bash tool uses).
function launcherFiles(platform, { binDir, execPath, scriptJs }) {
  const sh = (exe, js) => [
    '#!/bin/sh',
    '# Sub-Agents: hands a task to a sub-agent through the running app.',
    '# Usage: subagent AGENT_NAME "TASK"   (rewritten each time the app starts)',
    'ELECTRON_RUN_AS_NODE=1 exec ' + shQuote(exe) + ' ' + shQuote(js) + ' "$@"',
    ''
  ].join('\n');
  if (platform !== 'win32') {
    return [{ file: path.join(binDir, 'subagent'), content: sh(execPath, scriptJs), mode: 0o755 }];
  }
  const cmd = [
    '@echo off',
    'rem Sub-Agents: hands a task to a sub-agent through the running app.',
    'rem Usage: subagent AGENT_NAME "TASK"   (rewritten each time the app starts)',
    'setlocal',
    'set "ELECTRON_RUN_AS_NODE=1"',
    '"' + cmdEscape(execPath) + '" "' + cmdEscape(scriptJs) + '" %*',
    'exit /b %ERRORLEVEL%',
    ''
  ].join('\r\n');
  return [
    { file: path.win32.join(binDir, 'subagent.cmd'), content: cmd },
    { file: path.win32.join(binDir, 'subagent'), content: sh(fwd(execPath), fwd(scriptJs)) }
  ];
}

// What a leader types to call a sub-agent. On Windows the launcher folder is put on
// the PATH of every tool the app starts, so the plain name works in Git Bash,
// PowerShell and CMD, and a user name with spaces in it doesn't matter.
function subagentCommand(platform, script) {
  return platform === 'win32' ? 'subagent' : script;
}

// Permissions a Claude leader always gets: running the launcher.
// On Windows Claude Code may use its Bash tool (Git Bash) or its PowerShell tool.
function leaderBaseTools(platform, script) {
  if (platform === 'win32') return ['Bash(subagent:*)', 'PowerShell(subagent *)'];
  return ['Bash(' + script + ':*)'];
}

// Folders where claude, codex and agy are usually installed on Windows. GUI apps
// get the PATH from when you logged in, so tools installed later may be missing.
function windowsToolDirs(env, home) {
  const e = (k) => env[k] || '';
  return [
    path.win32.join(home, '.sub-agents', 'bin'),
    path.win32.join(home, '.local', 'bin'), // Claude Code native installer
    e('APPDATA') && path.win32.join(e('APPDATA'), 'npm'), // npm install -g (Codex)
    e('LOCALAPPDATA') && path.win32.join(e('LOCALAPPDATA'), 'Microsoft', 'WinGet', 'Links'),
    e('LOCALAPPDATA') && path.win32.join(e('LOCALAPPDATA'), 'Programs', 'agy'),
    e('LOCALAPPDATA') && path.win32.join(e('LOCALAPPDATA'), 'Programs', 'antigravity-cli'),
    e('ProgramData') && path.win32.join(e('ProgramData'), 'chocolatey', 'bin'),
    e('ProgramFiles') && path.win32.join(e('ProgramFiles'), 'Git', 'cmd'),
    e('ProgramFiles') && path.win32.join(e('ProgramFiles'), 'nodejs')
  ].filter(Boolean);
}

// Expand %VAR% in a PATH read from the registry.
function expandWinVars(s, env) {
  return String(s).replace(/%([^%]+)%/g, (m, k) => {
    const hit = Object.keys(env).find((x) => x.toLowerCase() === k.toLowerCase());
    return hit ? env[hit] : m;
  });
}

// Pull the Path value out of `reg query ... /v Path` output.
function parseRegPath(out) {
  const m = /^\s*Path\s+REG_(?:EXPAND_)?SZ\s+(.*)$/im.exec(String(out));
  return m ? m[1].trim() : '';
}

// Merge PATH lists, keeping order and dropping duplicates (case-insensitive on Windows).
function mergePath(platform, lists) {
  const seen = new Set();
  const out = [];
  const delim = platform === 'win32' ? ';' : ':';
  for (const list of lists) {
    for (const p of String(list || '').split(delim).concat([]).filter(Boolean)) {
      const k = platform === 'win32' ? p.toLowerCase().replace(/[\\/]+$/, '') : p;
      if (!seen.has(k)) { seen.add(k); out.push(p); }
    }
  }
  return out.join(delim);
}

// Words that differ in the interface.
function labels(platform) {
  const mac = platform === 'darwin';
  return {
    mod: mac ? 'Cmd' : 'Ctrl',
    fileManager: mac ? 'Finder' : platform === 'win32' ? 'File Explorer' : 'file manager',
    terminal: platform === 'win32' ? 'PowerShell' : 'Terminal'
  };
}

module.exports = { launcherFiles, subagentCommand, leaderBaseTools, windowsToolDirs, expandWinVars, parseRegPath, mergePath, labels, shQuote, fwd };
