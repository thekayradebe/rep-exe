// REP.exe — UI. All records live in localStorage on this device; see model.js for the rules.
import * as M from './model.js?v=6';
import { PLAN, EXERCISES } from './plan.js?v=6';
import * as Sync from './sync.js?v=6';

const STORAGE_KEY = 'repexe:data:v1';
const $content = document.getElementById('content');
const $toast = document.getElementById('toast');
const $status = document.getElementById('save-status');

/* ---------- Storage ---------- */

let data;

function load() {
  let raw = null, ok = true;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch { ok = false; }
  const res = M.loadData(raw);
  if (res.error) {
    try { localStorage.setItem(`repexe:unreadable:${Date.now()}`, raw); } catch { /* ignore */ }
    toast('Saved log was unreadable. A copy was kept.', true);
  }
  data = res.data;
  if (M.dropStaleBlankSessions(data, M.todayISO()) && raw) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* status below reports storage */ }
  }
  // Prove storage works before ever claiming "saved".
  try { localStorage.setItem('repexe:probe', '1'); localStorage.removeItem('repexe:probe'); } catch { ok = false; }
  setStatus(ok);
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}

function save({ push = true } = {}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setStatus(true);
    if (push) schedulePush();
    return true;
  } catch {
    setStatus(false);
    toast('Not saving on this device. Export a backup.', true);
    return false;
  }
}

let storageOk = true;
function setStatus(ok = storageOk) {
  storageOk = ok;
  if (!ok) { $status.dataset.state = 'error'; $status.textContent = '⚠ not saving'; return; }
  const label = { syncing: '↻ syncing', synced: '♥ synced', offline: '♥ saved · offline', error: '♥ saved · sync paused' }[sy.state];
  $status.dataset.state = 'saved';
  $status.textContent = label || '♥ saved';
}

/* ---------- Sync (secret GitHub gist) ---------- */
// The key and gist id stay on this device. Each device merges its log with the gist, newest edit per day wins.

const SYNC_KEY = 'repexe:sync:v1';
const sy = { state: 'off', error: '', running: false, again: false, overwrite: false, timer: null, setup: false, busy: false };
let sync = readSyncCfg(); // { token, gistId, lastSync } or null
if (sync) sy.state = 'syncing';

function readSyncCfg() {
  try { const c = JSON.parse(localStorage.getItem(SYNC_KEY)); return c?.token && c?.gistId ? c : null; } catch { return null; }
}
function writeSyncCfg() {
  try { if (sync) localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); else localStorage.removeItem(SYNC_KEY); } catch { /* ignore */ }
}
function setSync(state, error = '') {
  sy.state = state; sy.error = error;
  setStatus();
  if (s.view === 'progress' && !document.activeElement?.matches?.('input')) render();
}
function schedulePush() {
  if (!sync) return;
  clearTimeout(sy.timer);
  sy.timer = setTimeout(() => syncNow(), 1500);
}

/** Pull the gist, merge it with this device, and push back if anything differs. overwrite: push this device's log as-is. */
async function syncNow({ overwrite = false } = {}) {
  if (!sync) return;
  if (sy.running) { sy.again = true; sy.overwrite ||= overwrite; return; }
  sy.running = true;
  clearTimeout(sy.timer);
  setSync('syncing');
  try {
    let needWrite = true;
    if (!overwrite) {
      const text = await Sync.read(sync.token, sync.gistId);
      if (text !== null) {
        const remote = M.parseImport(text);
        if (!remote.ok) throw new Sync.SyncError('http', `The synced log couldn’t be read: ${remote.error}`);
        const m = M.mergeSessions(data.sessions, remote.sessions);
        needWrite = m.remoteChanged;
        if (m.localChanged) {
          data.sessions = m.sessions;
          if (M.dropStaleBlankSessions(data, today)) needWrite = true;
          save({ push: false });
          if (!document.activeElement?.matches?.('input')) render();
        }
      }
    }
    if (needWrite) await Sync.write(sync.token, sync.gistId, M.exportData(data));
    sync.lastSync = Date.now();
    writeSyncCfg();
    setSync('synced');
  } catch (e) {
    if (e.code === 'missing') {
      // The gist was deleted on GitHub: make a fresh one from this device's log.
      try { sync.gistId = (await Sync.connect(sync.token, M.exportData(data))).gistId; writeSyncCfg(); sy.again = true; }
      catch (e2) { setSync(e2.code === 'offline' ? 'offline' : 'error', e2.message); }
    } else {
      setSync(e.code === 'offline' ? 'offline' : 'error', e.message || 'Sync failed.');
    }
  } finally {
    sy.running = false;
    if (sy.again) { const ow = sy.overwrite; sy.again = false; sy.overwrite = false; syncNow({ overwrite: ow }); }
  }
}

async function connectSync(token) {
  token = (token || '').trim();
  if (!token) { toast('Paste your GitHub key first.'); return; }
  sy.busy = true; render();
  try {
    const r = await Sync.connect(token, M.exportData(data));
    sync = { token, gistId: r.gistId, lastSync: null };
    writeSyncCfg();
    sy.setup = false;
    toast(r.created ? 'Sync on ✓ Your log is saved to GitHub.' : 'Sync on ✓ Merging your log from GitHub…');
    await syncNow();
  } catch (e) {
    toast(e.message || 'Couldn’t connect.', true);
  } finally {
    sy.busy = false; render();
  }
}

function disconnectSync() {
  sync = null; writeSyncCfg();
  clearTimeout(sy.timer);
  setSync('off');
  toast('Sync off on this device. Your gist on GitHub is untouched.');
}

let toastTimer;
function toast(msg, sticky = false) {
  clearTimeout(toastTimer);
  $toast.textContent = msg || '';
  $toast.hidden = !msg;
  if (msg && !sticky) toastTimer = setTimeout(() => { $toast.hidden = true; }, 2600);
}

/* ---------- State ---------- */

const s = {
  view: 'workout',
  date: null,      // selected weekday (YYYY-MM-DD)
  rest: false,     // weekend landing
  open: {},        // date -> open exercise index (or -1)
  form: null,      // exercise index on the form screen
  range: 'week',
  logWeek: null,
  logOpen: null,
  peek: null,
  importing: null,
};
let today = M.todayISO();

function goToday() {
  today = M.todayISO();
  if (M.isWorkoutDay(today)) { s.date = today; s.rest = false; }
  else { s.date = M.mondayOf(today); s.rest = true; }
  s.form = null;
}

/* ---------- Helpers ---------- */

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dayName = (iso) => PLAN[M.weekdayIndex(iso)]?.day ?? '';
const exInfo = (ex) => EXERCISES[ex.exerciseId] || {};
const rx = (ex) => {
  const sets = ex.optionalExtraSet ? `${ex.targetSets}–${ex.targetSets + 1}` : ex.targetSets;
  const target = ex.measure === 'seconds' ? `${ex.targetSeconds} sec` : ex.targetReps;
  return `${sets} × ${target}${ex.perSide ? ' each side' : ''}`;
};
const weightAria = { each: 'kilograms per dumbbell', single: 'kilograms, one dumbbell' };
const doneCount = (ex) => ex.sets.slice(0, M.activeSetCount(ex)).filter((x) => x.done).length;
const shortWeek = (monday) => M.weekLabel(monday, false);

function defaultOpen(session) {
  return session.exercises.findIndex((ex) => !ex.skipped && doneCount(ex) < M.activeSetCount(ex));
}

/* ---------- Render ---------- */

function render() {
  const active = document.activeElement?.id;
  document.querySelectorAll('.bottom [data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === s.view)));
  if (s.view === 'progress') $content.innerHTML = renderProgress();
  else if (s.form !== null) $content.innerHTML = renderForm();
  else $content.innerHTML = renderWorkout();
  if (active) document.getElementById(active)?.focus({ preventScroll: true });
}

function renderWeekbar(monday, attr = 'week') {
  const current = monday === M.mondayOf(today);
  return `<div class="weekbar">
    <button type="button" class="arrow" data-${attr}="-1" aria-label="Previous week">‹</button>
    <span class="wk">${shortWeek(monday)}${!current && attr === 'week' ? ' <button type="button" class="jump" data-jumptoday>Today</button>' : ''}</span>
    <button type="button" class="arrow" data-${attr}="1" aria-label="Next week">›</button>
  </div>`;
}

function renderTabs(monday) {
  return `<nav class="days" aria-label="Day">${PLAN.map((p, i) => {
    const iso = M.addDays(monday, i);
    const st = M.sessionStats(M.getSession(data, iso));
    const pressed = !s.rest && s.date === iso;
    const isToday = iso === today;
    const status = st.finished ? ', finished' : st.done ? `, ${st.done} of ${st.total} sets` : '';
    return `<button type="button" id="tab-${i}" data-day="${i}" aria-pressed="${pressed}" class="${isToday ? 'is-today' : ''}"
      aria-label="${p.day} ${M.formatDate(iso)}${isToday ? ', today' : ''}${status}">
      <span class="tab-day">${p.day.slice(0, 3)}</span><span class="tab-date">${M.formatDate(iso, { day: 'numeric' })}</span>
      ${st.finished ? '<span class="tab-mark" aria-hidden="true">✓</span>' : st.done ? '<span class="tab-mark partial" aria-hidden="true"></span>' : ''}
    </button>`;
  }).join('')}</nav>`;
}

function renderWorkout() {
  const monday = M.mondayOf(s.date);
  let html = renderWeekbar(monday) + renderTabs(monday);
  if (s.rest) {
    const next = M.addDays(M.mondayOf(today), 7);
    return html + `<section class="card rest"><h1>Sunday rest ♡</h1>
      <button type="button" class="big-button" data-goto="${next}">Preview Monday</button></section>`;
  }
  const session = M.getSession(data, s.date);
  const st = M.sessionStats(session);
  const future = s.date > today;
  if (!(s.date in s.open)) s.open[s.date] = defaultOpen(session);

  const label = PLAN[M.weekdayIndex(s.date)].label;
  html += `<div class="day-head">
    <h1>${dayName(s.date)}${label ? `<small>${label}</small>` : ''}</h1>
    <span class="day-count${st.finished ? ' done' : ''}">${st.finished ? 'Done ♡' : `${st.done}/${st.total}`}</span>
  </div>
  <div class="bar" role="progressbar" aria-label="Sets completed" aria-valuemin="0" aria-valuemax="${st.total}" aria-valuenow="${st.done}"><span style="width:${st.total ? (st.done / st.total) * 100 : 0}%"></span></div>`;
  html += `<div class="${future ? 'is-future' : ''}">${session.exercises.map((ex, i) => renderExercise(ex, i, future)).join('')}</div>`;
  return html;
}

function renderExercise(ex, i, future) {
  const open = s.open[s.date] === i;
  const n = M.activeSetCount(ex);
  const done = doneCount(ex);
  const finished = !ex.skipped && done === n;
  const bw = ex.weightConvention === 'none';
  let body = '';
  if (open) {
    const sets = ex.skipped ? '' : ex.sets.slice(0, n).map((set, j) => renderSet(ex, i, set, j, future, bw)).join('');
    const extras = [
      `<button type="button" class="pill form-pill" data-form="${i}">▶ Form & muscles</button>`,
      ex.optionalExtraSet ? `<button type="button" class="pill" data-extra="${i}" ${future ? 'disabled' : ''}>${ex.extraSetAdded ? '− 2nd set' : '+ 2nd set'}</button>` : '',
      ex.skippable ? `<button type="button" class="pill" data-skip="${i}" ${future ? 'disabled' : ''}>${ex.skipped ? 'Include' : 'Skip'}</button>` : '',
    ].join('');
    body = `<div class="ex-body" id="ex-body-${i}">${sets}<div class="pills">${extras}</div></div>`;
  }
  const count = ex.skipped ? 'skipped' : finished ? '✓' : `${done}/${n}`;
  return `<section class="card ex${finished ? ' is-finished' : ''}${ex.skipped ? ' is-skipped' : ''}">
    <button type="button" class="ex-top" id="ex-top-${i}" data-open="${i}" aria-expanded="${open}" aria-controls="ex-body-${i}">
      <span class="ex-name"><h2>${esc(ex.name)}</h2><span class="rx">${rx(ex)}</span></span>
      <span class="ex-count">${count}</span>
    </button>${body}</section>`;
}

function renderSet(ex, i, set, j, future, bw) {
  const id = (f) => `f-${s.date}-${i}-${j}-${f}`;
  const dis = future ? 'disabled' : '';
  const name = esc(ex.name);
  const num = (field, value, label, ph, mode = 'numeric') =>
    `<input type="text" inputmode="${mode}" ${mode === 'numeric' ? 'pattern="[0-9]*"' : ''} autocomplete="off" id="${id(field)}" data-ex="${i}" data-set="${j}" data-field="${field}" aria-label="${esc(label)}" value="${value ?? ''}" placeholder="${ph}" ${dis}>`;
  const reps = ex.measure === 'seconds'
    ? num('leftSec', set.leftSec, `${name} set ${j + 1} left side seconds`, 'L sec') + num('rightSec', set.rightSec, `${name} set ${j + 1} right side seconds`, 'R sec')
    : ex.perSide
      ? num('left', set.left, `${name} set ${j + 1} left reps`, 'L') + num('right', set.right, `${name} set ${j + 1} right reps`, 'R')
      : num('reps', set.reps, `${name} set ${j + 1} reps`, 'reps');
  const kg = bw ? '' : num('kg', set.kg, `${name} set ${j + 1} ${weightAria[ex.weightConvention] || 'kilograms'}, optional`, 'kg', 'decimal');
  return `<div class="set${set.done ? ' is-done' : ''}${ex.perSide || ex.measure === 'seconds' ? ' sided' : ''}${bw ? ' bw' : ''}">
    <span class="set-n" aria-hidden="true">${j + 1}</span>${reps}${kg}
    <input type="checkbox" class="tick" id="${id('done')}" data-ex="${i}" data-check="${j}" ${set.done ? 'checked' : ''} ${dis}
      aria-label="${name} set ${j + 1} done${ex.perSide ? ', both sides' : ''}">
  </div>`;
}

function renderForm() {
  const ex = M.getSession(data, s.date).exercises[s.form];
  const info = exInfo(ex);
  const m = info.muscles;
  const img = info.image ? `images/anatomy/${info.image}.webp` : '';
  return `<button type="button" class="back" data-back id="back-top">‹ Back</button>
  <section class="card form">
    <h1>${esc(ex.name)}</h1>
    <p class="rx">${rx(ex)}</p>
    ${img ? `<a class="anatomy" href="${img}" target="_blank" rel="noopener">
      <img src="${img}" width="1000" height="1000" alt="${esc(ex.name)} muscle map. Main: ${esc(m?.main)}. Supporting: ${esc(m?.support)}.">
    </a>` : ''}
    <a class="big-button watch" href="${esc(info.video?.url)}" target="_blank" rel="noopener noreferrer">▶ Watch form</a>
    <p class="credit">${esc(info.video?.creator || '')} · YouTube</p>
    ${info.cue ? `<p class="cue">${esc(info.cue)}</p>` : ''}
  </section>`;
}

/* ---------- Progress ---------- */

function renderProgress() {
  const { start, end } = M.rangeBounds(s.range, today);
  const sum = M.rangeSummary(data, s.range, today);
  return `<h1 class="page-title">Progress</h1>
  <div class="ranges" role="group" aria-label="Period">${Object.entries(M.RANGES).map(([k, v]) =>
    `<button type="button" id="range-${k}" data-range="${k}" aria-pressed="${s.range === k}">${v}</button>`).join('')}</div>
  <section class="card">
    <div class="stats">
      <div><strong>${sum.finished}<small>/${sum.scheduled}</small></strong><span>workouts</span></div>
      <div><strong>${sum.sets}</strong><span>${sum.sets === 1 ? 'set' : 'sets'}</span></div>
    </div>
    ${renderGrid(start, end)}
    ${renderPeek()}
  </section>
  ${renderWeekbar(s.logWeek, 'logweek')}
  <section class="card log">${renderLogRows()}</section>
  ${renderBackup()}`;
}

function cellHTML(iso, start, end) {
  const c = M.cellState(data, iso, today, start, end);
  if (c.outside) return '<span class="cell" data-outside="true" aria-hidden="true"></span>';
  const label = `${dayName(iso)} ${M.formatDate(iso)}`;
  if (c.future) return `<span class="cell" data-future="true" role="img" aria-label="${label}: upcoming"></span>`;
  const status = c.finished ? 'finished' : c.done ? `${c.done} of ${c.total} sets` : 'no sets';
  return `<button type="button" class="cell" id="cell-${iso}" data-peek="${iso}" data-level="${c.level}" data-today="${iso === today}" aria-pressed="${s.peek === iso}" aria-label="${label}: ${status}"></button>`;
}

function renderGrid(start, end) {
  const cols = M.gridColumns(start, end);
  if (s.range === 'week') {
    const dates = cols[0].dates;
    return `<div class="heat week" style="grid-template-columns:repeat(${dates.length},minmax(0,1fr))" role="group" aria-label="This week">
      ${dates.map((d) => cellHTML(d, start, end)).join('')}
      ${dates.map((d) => `<span class="lbl" aria-hidden="true">${dayName(d).slice(0, 3)}</span>`).join('')}
    </div>`;
  }
  const head = cols.map((c, i) => {
    let label = '';
    if (s.range === 'month') label = M.formatDate(c.monday < start ? start : c.monday, { day: 'numeric' });
    else {
      const prev = cols[i - 1];
      const mid = c.dates[3];
      if (!prev || prev.dates[3].slice(0, 7) !== mid.slice(0, 7)) label = M.formatDate(i === 0 ? (c.dates.find((d) => d >= start) || c.monday) : mid, { month: 'short' });
    }
    return `<span class="lbl" aria-hidden="true">${label}</span>`;
  }).join('');
  const rows = PLAN.map((_, r) =>
    `<span class="lbl rowlbl" aria-hidden="true">${PLAN[r].day[0]}</span>${cols.map((c) => cellHTML(c.dates[r], start, end)).join('')}`).join('');
  return `<div class="heat" style="grid-template-columns:14px repeat(${cols.length},minmax(0,1fr))" role="group" aria-label="Workouts by week">
    <span></span>${head}${rows}</div>`;
}

function renderPeek() {
  if (!s.peek) return '';
  const st = M.sessionStats(M.getSession(data, s.peek));
  return `<button type="button" class="peek" data-goto="${s.peek}">
    <span>${dayName(s.peek).slice(0, 3)} ${M.formatDate(s.peek)} · ${st.finished ? 'done ✓' : `${st.done}/${st.total}`}</span><span aria-hidden="true">›</span></button>`;
}

function renderLogRows() {
  return PLAN.map((p, i) => {
    const iso = M.addDays(s.logWeek, i);
    const session = M.getSession(data, iso);
    const st = M.sessionStats(session);
    const future = iso > today;
    const open = s.logOpen === iso;
    const state = future ? '' : st.finished ? '✓' : `${st.done}/${st.total}`;
    return `<div class="log-row">
      <button type="button" class="log-sum" id="log-${iso}" data-logopen="${iso}" aria-expanded="${open}">
        <span>${p.day}</span><span class="log-state">${state}</span><span class="chev" aria-hidden="true">${open ? '−' : '+'}</span>
      </button>
      ${open ? `<div class="log-detail">${renderLogDetail(session)}
        <button type="button" class="pill" data-goto="${iso}">Open day</button></div>` : ''}
    </div>`;
  }).join('');
}

function renderLogDetail(session) {
  return session.exercises.map((ex) => {
    const n = M.activeSetCount(ex);
    let lines;
    if (ex.skipped) lines = '<li>skipped</li>';
    else {
      lines = ex.sets.slice(0, n).map((x) => {
        if (!x.done) return '';
        const reps = ex.measure === 'seconds' ? `${x.leftSec}s L / ${x.rightSec}s R` : ex.perSide ? `${x.left}L / ${x.right}R` : `${x.reps}`;
        return `<li>${reps}${x.kg !== null ? ` · ${x.kg} kg` : ''}</li>`;
      }).join('') || '<li class="muted">—</li>';
    }
    return `<div class="log-ex"><span>${esc(ex.name)}</span><ul>${lines}</ul></div>`;
  }).join('');
}

function renderBackup() {
  let confirm = '';
  if (s.importing) {
    const p = s.importing;
    confirm = `<div class="import-confirm" role="alertdialog" aria-labelledby="imp-t">
      <p id="imp-t">${p.count} day${p.count === 1 ? '' : 's'} in this backup. <strong>Merge</strong> adds them to your log. <strong>Replace</strong> erases your log first.</p>
      <div class="pills"><button type="button" class="pill" id="imp-merge" data-import="merge">Merge</button><button type="button" class="pill" data-import="replace">Replace</button><button type="button" class="pill" data-import="cancel">Cancel</button></div>
    </div>`;
  }
  return `${renderSync()}<div class="backup">
    <span>Backup file</span>
    <span class="links"><button type="button" class="link" data-export>Export</button> · <label class="link" for="import-file">Import</label></span>
    <input type="file" id="import-file" accept="application/json,.json" class="sr-only">
  </div>${confirm}`;
}

function renderSync() {
  if (sync) {
    const when = sync.lastSync ? new Date(sync.lastSync).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
    const line = {
      syncing: 'Syncing with GitHub…',
      synced: `Synced with GitHub${when ? ` · ${when}` : ''}`,
      offline: 'Offline · will sync when you’re back online',
      error: esc(sy.error || 'Sync paused.'),
    }[sy.state] || 'Sync on';
    return `<div class="sync${sy.state === 'error' ? ' is-error' : ''}" role="status">
      <span>${line}</span>
      <span class="links"><button type="button" class="link" data-syncnow>Sync now</button> · <button type="button" class="link" data-syncoff>Turn off</button></span>
    </div>`;
  }
  if (!sy.setup) {
    return `<div class="sync"><span>Saved on this device only</span>
      <span class="links"><button type="button" class="link" data-syncsetup>Sync with GitHub</button></span></div>`;
  }
  return `<div class="sync-setup">
    <p>Sync keeps every device on the same log. It's saved in a secret gist in your GitHub account.</p>
    <ol>
      <li><a href="https://github.com/settings/tokens/new?scopes=gist&amp;description=REP.exe%20sync" target="_blank" rel="noopener noreferrer">Make a GitHub key</a> with only <strong>gist</strong> ticked.</li>
      <li>Paste it below. It stays on this device.</li>
    </ol>
    <label class="sr-only" for="sync-token">GitHub key</label>
    <input type="password" id="sync-token" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="ghp_…" ${sy.busy ? 'disabled' : ''}>
    <div class="pills">
      <button type="button" class="pill" data-syncconnect ${sy.busy ? 'disabled' : ''}>${sy.busy ? 'Connecting…' : 'Connect'}</button>
      <button type="button" class="pill" data-syncsetup ${sy.busy ? 'disabled' : ''}>Cancel</button>
    </div>
  </div>`;
}

/* ---------- Events ---------- */

document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if (d.view) {
    s.view = d.view; s.form = null;
    if (s.view === 'progress') { s.logWeek = M.mondayOf(s.date); s.logOpen = null; }
    scrollTo(0, 0);
  } else if (d.week) {
    s.date = M.addDays(s.rest ? M.mondayOf(s.date) : s.date, 7 * Number(d.week)); s.rest = false; s.form = null;
  } else if ('jumptoday' in d) {
    goToday();
  } else if (d.day !== undefined) {
    s.date = M.addDays(M.mondayOf(s.date), Number(d.day)); s.rest = false; s.form = null;
  } else if (d.goto) {
    s.date = d.goto; s.rest = false; s.form = null; s.view = 'workout'; s.peek = null;
    scrollTo(0, 0);
  } else if (d.open !== undefined) {
    const i = Number(d.open);
    s.open[s.date] = s.open[s.date] === i ? -1 : i;
  } else if (d.form !== undefined) {
    s.form = Number(d.form); scrollTo(0, 0);
  } else if ('back' in d) {
    const i = s.form; s.form = null; render();
    document.getElementById(`ex-top-${i}`)?.scrollIntoView({ block: 'start' });
    return;
  } else if (d.extra !== undefined) {
    const on = !M.getSession(data, s.date).exercises[Number(d.extra)].extraSetAdded;
    const r = M.setExtraSet(data, s.date, Number(d.extra), on);
    if (r.ok) save(); else if (r.message) toast(r.message);
  } else if (d.skip !== undefined) {
    const on = !M.getSession(data, s.date).exercises[Number(d.skip)].skipped;
    const r = M.setSkipped(data, s.date, Number(d.skip), on);
    if (r.ok) save(); else if (r.message) toast(r.message);
  } else if (d.range) {
    s.range = d.range; s.peek = null;
  } else if (d.peek) {
    s.peek = s.peek === d.peek ? null : d.peek;
  } else if (d.logweek) {
    s.logWeek = M.addDays(s.logWeek, 7 * Number(d.logweek)); s.logOpen = null;
  } else if (d.logopen) {
    s.logOpen = s.logOpen === d.logopen ? null : d.logopen;
  } else if ('syncsetup' in d) {
    sy.setup = !sy.setup;
    if (sy.setup) { render(); document.getElementById('sync-token')?.focus(); return; }
  } else if ('syncconnect' in d) {
    connectSync(document.getElementById('sync-token')?.value); return;
  } else if ('syncnow' in d) {
    syncNow(); return;
  } else if ('syncoff' in d) {
    disconnectSync(); return;
  } else if ('export' in d) {
    exportBackup(); return;
  } else if (d.import) {
    if (d.import !== 'cancel' && s.importing && (M.applyImport(data, s.importing.sessions, d.import), save({ push: false }))) {
      toast(`Backup ${d.import === 'merge' ? 'merged' : 'restored'} ✓`);
      syncNow({ overwrite: d.import === 'replace' }); // replace: this log becomes the synced log
    }
    s.importing = null;
  } else return;
  render();
});

// Typing: update the record on every keystroke without re-rendering (keeps the keyboard open).
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.dataset?.field) return;
  const r = M.updateField(data, s.date, Number(el.dataset.ex), Number(el.dataset.set), el.dataset.field, el.value);
  if (!r.ok) { toast(r.message); return; }
  save();
  if (r.unticked) {
    const row = el.closest('.set');
    row.classList.remove('is-done');
    row.querySelector('.tick').checked = false;
    refreshDayHead();
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'import-file') { readImport(el.files?.[0]); el.value = ''; return; }
  if (el.dataset?.check === undefined) return;
  const r = M.setDone(data, s.date, Number(el.dataset.ex), Number(el.dataset.check), el.checked, today);
  if (!r.ok) { el.checked = !el.checked; toast(r.message); return; }
  save();
  const session = M.getSession(data, s.date);
  if (el.checked && M.sessionStats(session).finished) toast('Workout done ♡');
  // Move on to the next exercise once this one is complete.
  const ex = session.exercises[Number(el.dataset.ex)];
  if (el.checked && doneCount(ex) === M.activeSetCount(ex)) s.open[s.date] = defaultOpen(session);
  render();
});

function refreshDayHead() {
  const st = M.sessionStats(M.getSession(data, s.date));
  const count = document.querySelector('.day-count');
  if (count) { count.textContent = `${st.done}/${st.total}`; count.classList.remove('done'); }
  const bar = document.querySelector('.bar');
  if (bar) { bar.setAttribute('aria-valuenow', st.done); bar.firstElementChild.style.width = `${st.total ? (st.done / st.total) * 100 : 0}%`; }
}

function exportBackup() {
  const blob = new Blob([M.exportData(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `rep-exe-backup-${today}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function readImport(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const p = M.parseImport(String(reader.result));
    s.importing = p.ok ? p : null;
    if (!p.ok) toast(p.error);
    render();
    if (p.ok) document.getElementById('imp-merge')?.focus();
  };
  reader.onerror = () => toast('Couldn’t read that file.');
  reader.readAsText(file);
}

// Coming back to the app on a new day: move "today" forward.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  syncNow();
  const now = M.todayISO();
  if (now === today) return;
  const wasOnToday = s.date === today || s.rest;
  today = now;
  if (wasOnToday) goToday();
  render();
});

// Another open copy of the app saved: pick up its changes.
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY) return;
  data = M.loadData(e.newValue).data;
  render();
});

/* ---------- Start ---------- */

load();
goToday();
render();
syncNow();
window.addEventListener('online', () => syncNow());

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
