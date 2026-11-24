#!/usr/bin/env node
// Called by the group leader to hand a task to a sub-agent:
//   node subagent.js AGENT_NAME "TASK"
// It asks the running Sub-Agents app to run that model's own CLI,
// so the call shows up on the sub-agent's box and in its chat window.
const http = require('http');
const fs = require('fs');
const path = require('path');

const [agent, ...rest] = process.argv.slice(2);
const task = rest.join(' ').trim();
if (!agent || !task) {
  console.error('Usage: node subagent.js AGENT_NAME "TASK"');
  process.exit(2);
}

let bridge;
try {
  bridge = JSON.parse(fs.readFileSync(path.join(require('os').homedir(), '.sub-agents', 'bridge.json'), 'utf8'));
} catch (e) {
  console.error('The Sub-Agents app is not running, so the sub-agent cannot be called.');
  process.exit(1);
}

const body = JSON.stringify({ token: bridge.token, agent, task });
const req = http.request({
  host: '127.0.0.1',
  port: bridge.port,
  path: '/run',
  method: 'POST',
  headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }
}, (res) => {
  let tail = '';
  res.on('data', (d) => {
    const t = d.toString();
    (res.statusCode === 200 ? process.stdout : process.stderr).write(t);
    tail = (tail + t).slice(-400);
  });
  res.on('end', () => {
    if (res.statusCode !== 200) process.exit(1);
    // Only the app's own last line says how the call ended.
    process.exit(tail.trimEnd().endsWith('[sub-agent finished]') ? 0 : 1);
  });
});
req.on('error', (e) => {
  console.error('Could not reach the Sub-Agents app: ' + e.message);
  process.exit(1);
});
req.end(body);
