// Runs each model's own CLI (Claude Code, Codex, Gemini CLI) as a child process.
const spawn = require('cross-spawn');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HARNESSES = {
  claude: {
    name: 'Claude Code',
    bin: 'claude',
    install: 'npm install -g @anthropic-ai/claude-code',
    keyEnv: ['ANTHROPIC_API_KEY'],
    provider: 'anthropic',
    args(model, prompt, opts) {
      const a = [];
      if (opts.leaderTools && opts.leaderTools.length) a.push('--allowedTools', opts.leaderTools.join(','));
      a.push('--model', model, '-p', prompt);
      return a;
    }
  },
  codex: {
    name: 'Codex',
    bin: 'codex',
    install: 'npm install -g @openai/codex',
    keyEnv: ['OPENAI_API_KEY', 'CODEX_API_KEY'],
    provider: 'openai',
    args(model, prompt, opts) {
      const a = ['exec', '--skip-git-repo-check', '--output-last-message', opts.outFile, '-m', model];
      if (opts.fullAccess) a.push('--sandbox', 'danger-full-access');
      a.push(prompt);
      return a;
    }
  },
  // Google's replacement for Gemini CLI. Uses the Google login cached by running `agy` once.
  antigravity: {
    name: 'Antigravity CLI',
    bin: 'agy',
    install: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
    keyEnv: [],
    clearEnv: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    provider: 'google',
    args(model, prompt, opts) {
      const a = [];
      if (model) a.push('--model', model);
      if (opts.fullAccess) a.push('--dangerously-skip-permissions');
      a.push('-p', prompt);
      return a;
    }
  },
  gemini: {
    name: 'Gemini CLI',
    bin: 'gemini',
    install: 'npm install -g @google/gemini-cli',
    keyEnv: ['GEMINI_API_KEY'],
    // Also cleared when using the CLI's own Google login, so a stray key isn't billed.
    clearEnv: ['GOOGLE_API_KEY'],
    provider: 'google',
    args(model, prompt, opts) {
      const a = ['-m', model];
      if (opts.fullAccess) a.push('--yolo');
      a.push('-p', prompt);
      return a;
    }
  }
};

const running = new Map();

function check(harness) {
  const h = HARNESSES[harness];
  if (!h) return false;
  const r = spawn.sync(h.bin, ['--version'], { stdio: 'ignore', timeout: 15000 });
  return !r.error;
}

// keys: { anthropic: 'sk-ant-...', ... } — only the providers this run needs.
function buildEnv(keys) {
  const env = { ...process.env };
  for (const h of Object.values(HARNESSES)) {
    const k = keys[h.provider];
    // No key for this provider means "use the tool's own login", so remove any
    // key the shell may have set, or the tool would silently bill that key.
    for (const name of h.keyEnv) { if (k) env[name] = k; else delete env[name]; }
    if (!k) for (const name of h.clearEnv || []) delete env[name];
  }
  return env;
}

function run(opts, keys, onChunk) {
  const h = HARNESSES[opts.harness];
  if (!h) return Promise.resolve({ ok: false, error: 'Unknown harness: ' + opts.harness });
  const outFile = opts.harness === 'codex' ? path.join(os.tmpdir(), 'subagents-' + Date.now() + '-' + process.pid + '.txt') : null;
  const args = h.args(opts.model, opts.prompt, { ...opts, outFile });

  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      running.delete(opts.runId);
      if (outFile) { try { fs.unlinkSync(outFile); } catch (e) { /* not written */ } }
      resolve(r);
    };

    let child;
    try {
      child = spawn(h.bin, args, { cwd: opts.cwd || os.homedir(), env: buildEnv(keys) });
    } catch (e) {
      return finish({ ok: false, error: e.message });
    }
    running.set(opts.runId, child);
    child.stdin.end();

    child.stdout.on('data', (d) => {
      const t = d.toString();
      out += t;
      if (opts.harness !== 'codex') onChunk(t);
    });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => {
      finish({
        ok: false,
        error: e.code === 'ENOENT' ? h.name + " isn't installed. Install it with: " + h.install : e.message
      });
    });
    child.on('close', (code, signal) => {
      let text = out.trim();
      if (outFile) { try { text = fs.readFileSync(outFile, 'utf8').trim() || text; } catch (e) { /* keep stdout */ } }
      if (signal) return finish({ ok: false, error: 'Stopped.' });
      if (code === 0) return finish({ ok: true, text });
      finish({ ok: false, error: (err.trim() || text || h.name + ' exited with code ' + code).slice(-2000) });
    });
  });
}

function stop(runId) {
  const c = running.get(runId);
  if (c) c.kill();
}

// Subscription sign-in. Only Codex supports it here ("Sign in with ChatGPT").
// Claude Code / Gemini CLI: check the tool is already logged in on this computer
// by running a tiny prompt with no API key.
const LOGIN_HELP = {
  claude: "Claude Code isn't logged in. Open Terminal, run: claude  then log in with your Claude account, quit it, and click the button again.",
  gemini: "Gemini CLI isn't logged in. Open Terminal, run: gemini  then choose Login with Google, finish in your browser, quit it, and click the button again.",
  antigravity: "Antigravity CLI isn't signed in. Open Terminal, run: agy  then sign in with your Google account, trust the folder if it asks, quit it with /quit, and click the button again."
};
function checkCliLogin(harness) {
  const h = HARNESSES[harness];
  return new Promise((resolve) => {
    let out = '';
    let child;
    try { child = spawn(h.bin, ['-p', 'Reply with just: OK'], { env: buildEnv({}) }); } catch (e) { return resolve({ ok: false, error: e.message }); }
    child.stdin.end();
    const timer = setTimeout(() => child.kill(), 120000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, error: e.code === 'ENOENT' ? h.name + " isn't installed. Install it with: " + h.install : e.message }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve({ ok: true });
      resolve({ ok: false, error: LOGIN_HELP[harness] + (out.trim() ? '\n\nDetails: ' + out.trim().slice(-300) : '') });
    });
  });
}

function login(harness, onUrl) {
  if (harness === 'claude' || harness === 'gemini' || harness === 'antigravity') return checkCliLogin(harness);
  if (harness !== 'codex') return Promise.resolve({ ok: false, error: 'Subscription sign-in is not available for this model.' });
  return new Promise((resolve) => {
    let log = '';
    let sentUrl = false;
    let child;
    try { child = spawn('codex', ['login']); } catch (e) { return resolve({ ok: false, error: e.message }); }
    const watch = (d) => {
      log += d.toString();
      const m = !sentUrl && log.match(/https:\/\/\S+/);
      if (m) { sentUrl = true; onUrl(m[0]); }
    };
    child.stdout.on('data', watch);
    child.stderr.on('data', watch);
    child.on('error', (e) => resolve({
      ok: false,
      error: e.code === 'ENOENT' ? "Codex isn't installed. Install it with: " + HARNESSES.codex.install : e.message
    }));
    child.on('close', (code) => resolve(code === 0 ? { ok: true } : { ok: false, error: log.trim().slice(-500) || 'Sign-in did not finish.' }));
  });
}

module.exports = { HARNESSES, check, run, stop, login };
