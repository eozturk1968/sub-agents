'use strict';
/* global api, S, ui, $, esc, model, shortName, uniqueAgentName, fixTree, save, renderNodes, renderList, renderAllChats, renderToolbar, renderModal, refreshFiles, ICON */
// Save the canvas as a named team file, and open team files again.
// Loaded before renderer.js; everything here runs after renderer.js has set up.

const TEAMS = '.sub-agents/teams';

function teamLayout() {
  return {
    leader: S.leader,
    allowLeaderRun: !!S.allowLeaderRun,
    nodes: S.nodes.map((n) => ({
      key: n.key, modelId: n.modelId, name: n.name, x: Math.round(n.x), y: Math.round(n.y), parent: n.parent == null ? null : n.parent
    }))
  };
}
const layoutKey = () => JSON.stringify(teamLayout());
const teamDirty = () => S.nodes.length > 0 && layoutKey() !== (S.teamSaved || '');

function teamLabel() {
  if (!S.teamName) return S.nodes.length ? ' · <span class="muted">not saved as a team</span>' : '';
  return ' · Team: <strong>' + esc(S.teamName) + '</strong>' + (teamDirty() ? ' <span class="muted">(unsaved changes)</span>' : '');
}

let noticeTimer = null;
function notice(text, kind) {
  const el = $('#notice');
  el.className = 'notice ' + (kind || '');
  el.innerHTML = '<span class="grow">' + esc(text) + '</span><button type="button" class="icon-btn" data-dismiss-notice aria-label="Dismiss">' + ICON.x + '</button>';
  el.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { el.hidden = true; }, 10000);
}

async function saveTeam() {
  if (!S.nodes.length) { notice('Add some agents to the canvas before saving a team.', 'bad'); return false; }
  const r = await api.saveTeam(S.cwd, teamLayout(), S.teamName || 'my-team');
  if (r.canceled) return false;
  if (!r.ok) { notice('Could not save the team: ' + r.error, 'bad'); return false; }
  S.teamName = r.name;
  S.teamSaved = layoutKey();
  save();
  renderToolbar();
  const inProject = S.cwd && r.path.startsWith(S.cwd);
  notice('Saved team "' + r.name + '".' + (inProject ? '' : ' It\'s outside the project folder, so it won\'t show in the Files tab.'), 'ok');
  refreshFiles();
  return true;
}

function parseTeam(text) {
  let t;
  try { t = JSON.parse(text); } catch (e) { throw new Error('That file isn\'t a team file (it isn\'t valid JSON).'); }
  if (!t || t.app !== 'sub-agents' || !Array.isArray(t.nodes)) throw new Error('That file isn\'t a Sub-Agents team file.');
  return t;
}

function requestLoad(team) {
  if (teamDirty()) { ui.teamConfirm = { team }; renderModal(); return; }
  loadTeam(team);
}

async function loadTeam(team) {
  const known = team.nodes.filter((n) => model(n.modelId));
  const skipped = [...new Set(team.nodes.filter((n) => !model(n.modelId)).map((n) => n.modelId))];
  S.nodes = [];
  known.forEach((n) => {
    S.nodes.push({
      key: Number(n.key), modelId: n.modelId, name: uniqueAgentName(n.name || shortName(n.modelId)),
      x: Number(n.x) || 0, y: Number(n.y) || 0, parent: n.parent == null ? null : Number(n.parent)
    });
  });
  // Older team files keyed roles by model id; map them to agent names.
  const roleTexts = {};
  const src = team.roles || {};
  S.nodes.forEach((n, i) => {
    const orig = known[i];
    const t = src[orig.name] != null ? src[orig.name] : src[n.modelId];
    if (t != null) roleTexts[n.name] = t;
  });
  const leader = Number(team.leader);
  S.leader = S.nodes.some((n) => n.key === leader) ? leader : (S.nodes[0] ? S.nodes[0].key : null);
  S.nextKey = Math.max(0, ...S.nodes.map((n) => n.key)) + 1;
  S.allowLeaderRun = !!team.allowLeaderRun;
  fixTree();
  S.teamName = team.name || 'team';
  S.teamSaved = layoutKey();
  save();
  renderNodes();
  renderList();
  renderAllChats();
  renderToolbar();

  const rr = await api.applyTeamRoles(S.cwd, roleTexts);
  const parts = ['Opened team "' + S.teamName + '".'];
  if (rr.created.length) parts.push('Added role files for ' + rr.created.length + ' agent' + (rr.created.length === 1 ? '' : 's') + '.');
  if (rr.kept.length) parts.push('Kept this project\'s own roles for: ' + rr.kept.join(', ') + '.');
  if (skipped.length) parts.push('Skipped models not in models.json: ' + skipped.join(', ') + '.');
  notice(parts.join(' '), skipped.length ? 'bad' : 'ok');
  refreshFiles();
}

async function openTeamDialog() {
  const r = await api.pickTeam(S.cwd);
  if (r.canceled) return;
  if (!r.ok) { notice('Could not open the team: ' + r.error, 'bad'); return; }
  try { requestLoad(parseTeam(r.text)); } catch (e) { notice(e.message, 'bad'); }
}

async function openTeamFromProject(rel) {
  const r = await api.fsRead(S.cwd, rel);
  if (!r.ok || r.kind !== 'text') { notice('Could not open the team: ' + (r.error || 'not a text file'), 'bad'); return; }
  try { requestLoad(parseTeam(r.text)); } catch (e) { notice(e.message, 'bad'); }
}

function renderTeamConfirm() {
  const t = ui.teamConfirm.team;
  $('#modal').innerHTML = '<div class="overlay"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="tc-title">' +
    '<h2 id="tc-title">Open team "' + esc(t.name || 'team') + '"?</h2>' +
    '<p class="small">Your current canvas has changes that aren\'t saved in a team file. Opening this team replaces the canvas.</p>' +
    '<div class="actions"><button type="button" class="btn" data-t="cancel">Cancel</button>' +
    '<button type="button" class="btn" data-t="save-first">Save current team first</button>' +
    '<button type="button" class="btn primary" data-t="replace">Open without saving</button></div>' +
    '</div></div>';
}

function bindTeams() {
  $('#save-team').addEventListener('click', saveTeam);
  $('#open-team').addEventListener('click', openTeamDialog);
  $('#notice').addEventListener('click', (e) => { if (e.target.closest('[data-dismiss-notice]')) $('#notice').hidden = true; });
  $('#modal').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-t]');
    if (!b || !ui.teamConfirm) return;
    const team = ui.teamConfirm.team;
    const act = b.dataset.t;
    ui.teamConfirm = null;
    renderModal();
    if (act === 'replace') loadTeam(team);
    else if (act === 'save-first') { if (await saveTeam()) loadTeam(team); }
  });
  $('#panel-files').addEventListener('click', (e) => {
    const o = e.target.closest('[data-open-team]');
    if (o) openTeamFromProject(o.dataset.openTeam);
  });
}
