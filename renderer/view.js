'use strict';
/* global S, $, save */
// Endless canvas with pan and zoom, LTspice style.
// S.view = { x, y, z }: a point (wx, wy) on the canvas shows on screen at (wx * z + x, wy * z + y).
// Loaded before renderer.js; everything here runs after renderer.js has set up.

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const DOT = 22;

function view() {
  if (!S.view || !isFinite(S.view.x) || !isFinite(S.view.y) || !isFinite(S.view.z) || S.view.z <= 0) S.view = { x: 0, y: 0, z: 1 };
  return S.view;
}

let viewFrame = 0;
let viewSaveTimer = null;
function applyView() {
  if (viewFrame) return;
  viewFrame = requestAnimationFrame(() => {
    viewFrame = 0;
    const v = view();
    const cv = $('#canvas');
    $('#world').style.transform = 'translate(' + v.x + 'px,' + v.y + 'px) scale(' + v.z + ')';
    // The dot grid moves and scales with the view; the soft color clouds stay put behind it.
    const d = DOT * v.z;
    cv.style.backgroundSize = d + 'px ' + d + 'px, 100% 100%, 100% 100%, 100% 100%, 100% 100%';
    cv.style.backgroundPosition = v.x + 'px ' + v.y + 'px, 0 0, 0 0, 0 0, 0 0';
    const pct = $('#zoom-pct');
    if (pct) pct.textContent = Math.round(v.z * 100) + '%';
  });
}

function saveViewSoon() {
  clearTimeout(viewSaveTimer);
  viewSaveTimer = setTimeout(save, 400);
}

// Screen position (clientX/Y) to canvas position.
function screenToWorld(clientX, clientY) {
  const v = view();
  const r = $('#canvas').getBoundingClientRect();
  return { x: (clientX - r.left - v.x) / v.z, y: (clientY - r.top - v.y) / v.z };
}

// Zoom by a factor, keeping the point under (cx, cy) in place. cx/cy are relative to the canvas.
function zoomAt(factor, cx, cy) {
  const v = view();
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.z * factor));
  if (z === v.z) return;
  v.x = cx - (cx - v.x) * (z / v.z);
  v.y = cy - (cy - v.y) * (z / v.z);
  v.z = z;
  applyView();
  saveViewSoon();
}

function zoomCenter(factor) {
  const cv = $('#canvas');
  zoomAt(factor, cv.clientWidth / 2, cv.clientHeight / 2);
}

function zoomReset() {
  zoomCenter(1 / view().z);
}

function panBy(dx, dy) {
  const v = view();
  v.x += dx;
  v.y += dy;
  applyView();
  saveViewSoon();
}

// Zoom and move so every agent fits on screen.
function fitAll() {
  const cv = $('#canvas');
  const W = cv.clientWidth;
  const H = cv.clientHeight;
  if (!S.nodes.length || !W || !H) { S.view = { x: 0, y: 0, z: 1 }; applyView(); saveViewSoon(); return; }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  S.nodes.forEach((n) => {
    const el = document.querySelector('.node[data-key="' + n.key + '"]');
    const w = el ? el.offsetWidth : 280;
    const h = el ? el.offsetHeight : 120;
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + w); maxY = Math.max(maxY, n.y + h);
  });
  const pad = 60;
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  const z = Math.min(1.25, Math.max(ZOOM_MIN, Math.min((W - pad * 2) / bw, (H - pad * 2) / bh)));
  S.view = { x: (W - bw * z) / 2 - minX * z, y: (H - bh * z) / 2 - minY * z, z };
  applyView();
  saveViewSoon();
}

const typingIn = (t) => t && (t.closest('input, textarea, select, [contenteditable="true"]'));
const dialogOpen = () => !!$('#modal').innerHTML.trim();

function bindView() {
  const cv = $('#canvas');

  // Drag empty space (or with the middle mouse button anywhere) to move around.
  let pan = null;
  cv.addEventListener('pointerdown', (e) => {
    const onEmpty = !e.target.closest('.node, .view-controls');
    if (!((e.button === 0 && onEmpty) || e.button === 1)) return;
    e.preventDefault();
    pan = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: view().x, oy: view().y };
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
    cv.classList.add('panning');
  });
  cv.addEventListener('pointermove', (e) => {
    if (!pan || e.pointerId !== pan.id) return;
    const v = view();
    v.x = pan.ox + e.clientX - pan.sx;
    v.y = pan.oy + e.clientY - pan.sy;
    applyView();
  });
  const endPan = (e) => {
    if (!pan || e.pointerId !== pan.id) return;
    pan = null;
    cv.classList.remove('panning');
    saveViewSoon();
  };
  cv.addEventListener('pointerup', endPan);
  cv.addEventListener('pointercancel', endPan);

  // Trackpad: two-finger scroll moves, pinch zooms. Cmd+scroll zooms.
  // With "Scroll zooms" on, plain scrolling zooms like LTspice.
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? cv.clientHeight : 1;
    const dx = e.deltaX * unit;
    const dy = e.deltaY * unit;
    // Trackpad pinch (small steps) or Ctrl + mouse wheel on Windows/Linux (big steps).
    if (e.ctrlKey) { zoomAt(Math.exp(-dy * (Math.abs(dy) < 50 ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top); return; }
    if (e.metaKey || S.scrollZooms) { zoomAt(Math.exp(-dy * 0.0015), e.clientX - r.left, e.clientY - r.top); return; }
    panBy(-dx, -dy);
  }, { passive: false });

  $('#view-controls').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    const act = b.dataset.v;
    if (act === 'in') zoomCenter(1.2);
    else if (act === 'out') zoomCenter(1 / 1.2);
    else if (act === 'reset') zoomReset();
    else if (act === 'fit') fitAll();
  });
  $('#scroll-zooms').checked = !!S.scrollZooms;
  $('#scroll-zooms').addEventListener('change', (e) => { S.scrollZooms = e.target.checked; save(); });

  // Keyboard: Cmd + / Cmd - / Cmd 0 to zoom, Space to fit everything, arrows to move.
  document.addEventListener('keydown', (e) => {
    if (typingIn(e.target) || dialogOpen()) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomCenter(1.2); }
    else if (mod && e.key === '-') { e.preventDefault(); zoomCenter(1 / 1.2); }
    else if (mod && e.key === '0') { e.preventDefault(); zoomReset(); }
    else if (!mod && e.key === ' ' && !e.target.closest('button, a')) { e.preventDefault(); fitAll(); }
    else if (!mod && e.key.startsWith('Arrow') && !e.target.closest('button, a')) {
      e.preventDefault();
      const step = e.shiftKey ? 240 : 60;
      panBy(e.key === 'ArrowLeft' ? step : e.key === 'ArrowRight' ? -step : 0, e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0);
    }
  });

  window.addEventListener('resize', applyView);
}
