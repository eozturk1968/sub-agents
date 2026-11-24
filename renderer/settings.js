'use strict';
/* global api, S, ui, $, esc, ICON, save, renderModal, renderList, renderNodes, renderAllChats, HARNESS */
// Settings dialog: extra permissions for Claude leaders, and the model list.
// Loaded before renderer.js; everything here runs after renderer.js has set up.

function openSettings() {
  ui.settings = { text: (S.claudeLeaderTools || []).join('\n'), msg: '' };
  renderModal();
}

function renderSettings() {
  const st = ui.settings;
  $('#modal').innerHTML = '<div class="overlay"><div class="dialog wide" role="dialog" aria-modal="true" aria-labelledby="settings-title">' +
    '<div class="row top"><h2 id="settings-title" class="grow">Settings</h2>' +
    '<button type="button" class="icon-btn" data-s="close" aria-label="Close">' + ICON.x + '</button></div>' +

    '<div class="field"><label for="leader-tools"><strong>Extra permissions for Claude leaders</strong></label>' +
    '<p class="muted small">A Claude agent that leads a team may always run its sub-agents. Add more tools it may use without asking, one per line. ' +
    'Examples: <span class="mono">Bash(python3:*)</span>, <span class="mono">Bash(ffmpeg:*)</span>, <span class="mono">Read</span>, <span class="mono">Edit</span>, <span class="mono">Write</span>, <span class="mono">WebSearch</span>.</p>' +
    '<textarea id="leader-tools" class="role-text mono" style="height:180px" spellcheck="false" placeholder="Bash(python3:*)&#10;Read"></textarea>' +
    '<p class="note">Careful: tools like <span class="mono">Bash(rm:*)</span>, <span class="mono">Edit</span> and <span class="mono">Write</span> let the leader change or delete files in the project folder without asking.</p></div>' +

    '<div class="field"><strong>Model list</strong>' +
    '<p class="muted small">Add or rename models in the list file. After saving it, click Reload.</p>' +
    '<div class="row"><button type="button" class="btn" data-s="edit-models">Edit model list</button>' +
    '<button type="button" class="btn" data-s="reload-models">Reload</button></div></div>' +

    (st.msg ? '<p class="small ok-text" role="status">' + esc(st.msg) + '</p>' : '') +
    '<div class="actions"><button type="button" class="btn" data-s="close">Cancel</button>' +
    '<button type="button" class="btn primary" data-s="save">Save</button></div>' +
    '</div></div>';
  const t = $('#leader-tools');
  t.value = st.text;
  t.addEventListener('input', (e) => { st.text = e.target.value; });
}

async function reloadModels() {
  MODELS = (await api.listModels()).filter((m) => HARNESS[m.harness]);
  renderList();
  renderNodes();
  renderAllChats();
  return MODELS.length;
}

function bindSettings() {
  $('#settings').addEventListener('click', openSettings);
  $('#modal').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-s]');
    if (!b || !ui.settings) return;
    const act = b.dataset.s;
    if (act === 'close') { ui.settings = null; renderModal(); }
    else if (act === 'save') {
      S.claudeLeaderTools = ui.settings.text.split('\n').map((x) => x.trim()).filter(Boolean);
      save();
      ui.settings = null;
      renderModal();
    } else if (act === 'edit-models') {
      const r = await api.editModels();
      ui.settings.msg = r.ok ? 'Opened ' + r.path + '. Save it, then click Reload.' : 'Could not open the model list: ' + r.error;
      renderSettings();
    } else if (act === 'reload-models') {
      const n = await reloadModels();
      ui.settings.msg = 'Loaded ' + n + ' models.';
      renderSettings();
    }
  });
}
