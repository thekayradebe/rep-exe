// REP.exe — UI. All records live in localStorage on this device; see model.js for the rules.
import * as M from './model.js';
import { PLAN, EXERCISES } from './plan.js';

const STORAGE_KEY = 'repexe:data:v1';
const $content = document.getElementById('content');
const $feedback = document.getElementById('feedback');
const $status = document.getElementById('save-status');

/* ---------- Storage ---------- */

let data;
let storageOK = true;

function load() {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch { storageOK = false; }
  const res = M.loadData(raw);
  if (res.error) {
    try { localStorage.setItem(`repexe:unreadable:${Date.now()}`, raw); } catch { /* ignore */ }
    say('Your saved log could not be read. A copy was kept. Starting fresh.');
  }
  data = res.data;
  // Prove storage works before ever claiming "saved".
  try {
    localStorage.setItem('repexe:probe', '1');
    localStorage.removeItem('repexe:probe');
  } catch { storageOK = false; }
  setStatus(storageOK ? 'saved' : 'error');
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    storageOK = true;
    setStatus('saved');
    return true;
  } catch {
    storageOK = false;
    setStatus('error');
    say('Couldn’t save on this device. Export a backup from Progress now.');
    return false;
  }
}

function setStatus(state) {
  $status.dataset.state = state;
  $status.textContent = state === 'saved' ? '♥ SAVED' : '⚠ NOT SAVING';
}

function say(msg) { $feedback.textContent = msg || ''; }

/* ---------- State ---------- */

const s = {
  view: 'workout',
  date: null,      // selected weekday (YYYY-MM-DD)
  recovery: false, // weekend landing card
  open: {},        // date -> open exercise index (or -1)
  form: null,      // exercise index on the form screen
  range: 'week',
  logWeek: null,   // Monday of the week shown in the progress log
  logOpen: null,   // date expanded in the weekly log
  peek: null,      // date selected in the grid
  importing: null, // parsed backup waiting for merge/replace
};
let today = M.todayISO();

function goToday() {
  today = M.todayISO();
  if (M.isStrengthDay(today)) { s.date = today; s.recovery = false; }
  else { s.date = M.mondayOf(today); s.recovery = true; }
  s.form = null;
}

/* ---------- Helpers ---------- */

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dayName = (iso) => PLAN[M.weekdayIndex(iso)]?.day ?? '';
const exInfo = (ex) => EXERCISES[ex.exerciseId] || {};
const rx = (ex) => `${ex.optionalExtraSet ? `${ex.targetSets}–${ex.targetSets + 1}` : ex.targetSets} ${ex.targetSets === 1 && !ex.optionalExtraSet ? 'set' : 'sets'} × ${ex.targetReps} reps${ex.perSide ? ' / side' : ''}`;
const weightMeta = {
  each: { head: 'KG EACH', aria: 'kilograms per dumbbell', hint: 'KG EACH = one dumbbell’s weight (you hold two).' },
  single: { head: 'KG', aria: 'kilograms, one dumbbell', hint: 'KG = the one dumbbell you hold.' },
  none: { head: '', aria: '', hint: 'Bodyweight — no weight needed.' },
};
const statsLine = (st) => `${st.done} / ${st.total} sets${st.skipped ? ` · ${st.skipped} skipped` : ''}`;

function defaultOpen(session) {
  const i = session.exercises.findIndex((ex) => !ex.skipped && ex.sets.slice(0, M.activeSetCount(ex)).some((x) => !x.done));
  return i;
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

function renderWeekbar(monday) {
  const current = monday === M.mondayOf(today);
  return `<div class="weekbar">
    <button type="button" data-week="-1" aria-label="Previous week">‹</button>
    <div class="wk"><div>${M.weekLabel(monday)}${current ? '<span class="chip">THIS WEEK</span>' : ''}</div>
      ${current ? '' : '<button type="button" class="jump" data-jumptoday>↺ Back to today</button>'}</div>
    <button type="button" data-week="1" aria-label="Next week">›</button>
  </div>`;
}

function renderTabs(monday) {
  return `<nav class="days" aria-label="Workout day">${PLAN.map((p, i) => {
    const iso = M.addDays(monday, i);
    const st = M.sessionStats(M.getSession(data, iso));
    const pressed = !s.recovery && s.date === iso;
    const mark = st.finished ? '<span class="tab-mark" aria-hidden="true">✓</span>' : st.done ? '<span class="tab-mark partial" aria-hidden="true">·</span>' : '';
    const status = st.finished ? ', finished' : st.done ? `, ${st.done} of ${st.total} sets` : '';
    return `<button type="button" id="tab-${i}" data-day="${i}" aria-pressed="${pressed}" aria-label="${p.day} ${M.formatDate(iso)}${iso === today ? ', today' : ''}${status}">
      <span class="tab-day">${p.day.slice(0, 3).toUpperCase()}</span>
      <span class="tab-date">${iso === today ? 'TODAY' : M.formatDate(iso, { day: 'numeric' })}</span>${mark}</button>`;
  }).join('')}</nav>`;
}

function renderWorkout() {
  const monday = M.mondayOf(s.date);
  let html = renderWeekbar(monday) + renderTabs(monday);
  if (s.recovery) return html + renderRecovery();

  const session = M.getSession(data, s.date);
  const st = M.sessionStats(session);
  const plan = PLAN[M.weekdayIndex(s.date)];
  const future = s.date > today;
  if (!(s.date in s.open)) s.open[s.date] = defaultOpen(session);
  const when = s.date === today ? '<span class="chip today">TODAY</span>' : future ? '<span class="chip upcoming">UPCOMING</span>' : '';

  html += `<div class="hero">
    <div class="kicker">${plan.theme}</div>
    <h1>${plan.day}.</h1>
    <p>${M.formatDate(s.date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })} ${when}</p>
    <p class="note">${session.exercises.length} exercises · working sets after warming up</p>
    <span class="spark" aria-hidden="true">✦</span>
  </div>
  <div class="progress-label" id="progress-label"><span>${st.finished ? 'SESSION FINISHED ♡' : 'SESSION PROGRESS'}</span><span>${statsLine(st).toUpperCase()}</span></div>
  <div class="bar" role="progressbar" aria-label="Sets completed" aria-valuemin="0" aria-valuemax="${st.total}" aria-valuenow="${st.done}"><span style="width:${st.total ? (st.done / st.total) * 100 : 0}%"></span></div>`;
  if (future) html += `<p class="note" style="margin:-6px 2px 14px">Upcoming. Preview the plan now — ticks unlock on ${M.formatDate(s.date, { weekday: 'short', day: 'numeric', month: 'short' })}.</p>`;
  html += session.exercises.map((ex, i) => renderExercise(ex, i, future)).join('');
  return html;
}

function renderExercise(ex, i, future) {
  const open = s.open[s.date] === i;
  const n = M.activeSetCount(ex);
  const done = ex.sets.slice(0, n).filter((x) => x.done).length;
  const finished = !ex.skipped && done === n;
  const tag = ex.skipped ? ' · SKIPPED' : finished ? ' · DONE ✓' : ex.skippable ? ' · OPTIONAL' : '';
  const info = exInfo(ex);
  const wm = weightMeta[ex.weightConvention] || weightMeta.each;
  let body = '';
  if (open) {
    body = `<div class="ex-body" id="ex-body-${i}">
      <button type="button" class="form-button" data-form="${i}">▶ Watch form <small>${esc(info.video?.creator || '')}</small></button>
      ${ex.skippable && !ex.skipped ? `<p class="condition">${esc(PLAN[M.weekdayIndex(s.date)].slots[i]?.condition || 'Optional.')}</p>` : ''}
      ${ex.skipped
        ? `<p class="skipped-note">Skipped — floor unsuitable. This shows as skipped in your log and doesn’t count against the day.</p>`
        : `<div class="set-head" aria-hidden="true"><span>SET</span><span>${ex.perSide ? 'REPS · LEFT / RIGHT' : 'REPS'}</span><span>${wm.head}</span><span>DONE</span></div>
           ${ex.sets.slice(0, n).map((set, j) => renderSet(ex, i, set, j, future, wm)).join('')}
           <p class="hint">${ex.perSide ? 'Enter both sides, then tick — one tick = one set.' : 'Enter your actual reps, then tick the set.'} ${wm.hint}${ex.weightConvention === 'none' ? '' : ' Weight is optional.'}</p>`}
      ${ex.optionalExtraSet ? `<button type="button" class="small-button" data-extra="${i}" ${future ? 'disabled' : ''}>${ex.extraSetAdded ? '− Remove optional 2nd set' : '+ Add optional 2nd set'}</button>` : ''}
      ${ex.skippable ? `<button type="button" class="small-button" data-skip="${i}" ${future ? 'disabled' : ''}>${ex.skipped ? '↺ Include this exercise' : 'Skip · floor unsuitable'}</button>` : ''}
    </div>`;
  }
  return `<section class="window${finished ? ' ex-done' : ''}">
    <div class="titlebar"><span>EXERCISE_${String(i + 1).padStart(2, '0')}${tag}</span><span class="deco" aria-hidden="true">✦</span></div>
    <button type="button" class="ex-top" id="ex-top-${i}" data-open="${i}" aria-expanded="${open}" aria-controls="ex-body-${i}">
      <span><h2>${esc(ex.name)}</h2><span class="rx">${rx(ex)}</span></span>
      <span class="ex-count">${ex.skipped ? 'SKIP' : `${done}/${n}`}<span class="pm" aria-hidden="true">${open ? '−' : '+'}</span></span>
    </button>${body}</section>`;
}

function renderSet(ex, i, set, j, future, wm) {
  const id = (f) => `f-${s.date}-${i}-${j}-${f}`;
  const dis = future ? 'disabled' : '';
  const num = (field, value, label, ph) => `<input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" id="${id(field)}" data-ex="${i}" data-set="${j}" data-field="${field}" aria-label="${esc(label)}" value="${value ?? ''}" placeholder="${ph}" ${dis}>`;
  const name = esc(ex.name);
  const reps = ex.perSide
    ? `<div class="sides"><label>L${num('left', set.left, `${name} set ${j + 1} left side reps`, '—')}</label><label>R${num('right', set.right, `${name} set ${j + 1} right side reps`, '—')}</label></div>`
    : num('reps', set.reps, `${name} set ${j + 1} reps`, 'reps');
  const kg = ex.weightConvention === 'none'
    ? '<span class="bw" aria-label="Bodyweight">BW</span>'
    : `<input type="text" inputmode="decimal" autocomplete="off" id="${id('kg')}" data-ex="${i}" data-set="${j}" data-field="kg" aria-label="${name} set ${j + 1} ${wm.aria} (optional)" value="${set.kg ?? ''}" placeholder="—" ${dis}>`;
  return `<div class="set${set.done ? ' is-done' : ''}">
    <span>${String(j + 1).padStart(2, '0')}</span>${reps}${kg}
    <input type="checkbox" class="tick" id="${id('done')}" data-ex="${i}" data-check="${j}" ${set.done ? 'checked' : ''} ${dis}
      aria-label="Set ${j + 1} of ${name} complete${ex.perSide ? ' (both sides)' : ''}">
  </div>`;
}

function renderRecovery() {
  const nextMon = M.addDays(M.mondayOf(today), 7);
  return `<section class="window recovery">
    <div class="titlebar"><span>RECOVERY_MODE.exe</span><span class="deco" aria-hidden="true">♡</span></div>
    <div class="window-body">
      <div class="kicker">${M.formatDate(today, { weekday: 'long' }).toUpperCase()}</div>
      <h1>Recovery day.</h1>
      <p>No strength session today. Walk, stretch, rest — it all counts toward Monday.</p>
      <p class="note">Tap a day above to look back at this week’s logs.</p>
      <button type="button" class="big-button" data-goto="${nextMon}">Preview Monday ${M.formatDate(nextMon)} →</button>
      <button type="button" class="big-button alt" data-view="progress">See my progress</button>
    </div>
  </section>`;
}

function renderForm() {
  const session = M.getSession(data, s.date);
  const ex = session.exercises[s.form];
  const info = exInfo(ex);
  return `<button type="button" class="back" data-back id="back-top">‹ Back to ${dayName(s.date)}’s sets</button>
  <section class="window">
    <div class="titlebar"><span>FORM_PLAYER.exe</span><span class="deco" aria-hidden="true">✦</span></div>
    <div class="window-body">
      <h2>${esc(ex.name)}</h2>
      <p class="target-box"><strong>Your plan:</strong> ${rx(ex)}</p>
      <div class="player">
        <a href="${esc(info.video?.url)}" target="_blank" rel="noopener noreferrer">
          <span class="play" aria-hidden="true">▶</span>
          <span>Open form demo on YouTube ↗</span>
        </a>
      </div>
      <p class="source">${esc(info.video?.creator)}<br>${esc(info.video?.kind)}</p>
      <p class="cue">${esc(info.cue)}</p>
      <p class="hint">The video shows the movement. Your plan sets the sets and reps — ignore any different numbers in the video. Your entries are already saved.</p>
      ${info.reference ? `<a class="ref-link" href="${esc(info.reference)}" target="_blank" rel="noopener noreferrer">Original exercise page ↗</a>` : ''}
      <button type="button" class="big-button" data-back>Back to my sets</button>
    </div>
  </section>`;
}

/* ---------- Progress ---------- */

function renderProgress() {
  const { start, end } = M.rangeBounds(s.range, today);
  const sum = M.rangeSummary(data, s.range, today);
  const yearEnd = end.slice(0, 4);
  return `<div class="hero">
    <div class="kicker">A LITTLE STRONGER, EVERY WEEK</div>
    <h1>Your progress.</h1>
    <p>Watch your consistency build, square by square.</p>
    <span class="spark" aria-hidden="true">✦</span>
  </div>
  <div class="ranges" role="group" aria-label="Progress period">${Object.entries(M.RANGES).map(([k, v]) =>
    `<button type="button" id="range-${k}" data-range="${k}" aria-pressed="${s.range === k}">${v}</button>`).join('')}</div>
  <section class="window">
    <div class="titlebar"><span>CONSISTENCY.exe</span><span class="deco" aria-hidden="true">✦</span></div>
    <div class="window-body">
      <h2>${M.RANGES[s.range]}</h2>
      <p class="summary"><strong>${sum.finished} / ${sum.scheduled}</strong> workouts finished · <strong>${sum.sets}</strong> ${sum.sets === 1 ? "set" : "sets"} logged</p>
      ${renderGrid(start, end)}
      <div class="legend" aria-hidden="true"><span>None</span>${[0, 1, 2, 3].map((l) => `<span class="cell" data-level="${l}"></span>`).join('')}<span>Finished</span></div>
      <p class="range-dates">${M.formatDate(start)}${start.slice(0, 4) !== yearEnd ? ` ${start.slice(0, 4)}` : ''} – ${M.formatDate(end)} ${yearEnd}</p>
      <p class="note">One square = one weekday workout. Fill = share of that day’s planned sets ticked. Dashed = upcoming. Weekends are recovery and never count as missed. Tap a square for details.</p>
      ${renderPeek()}
    </div>
  </section>
  ${renderLog()}
  ${renderBackup()}`;
}

function cellHTML(iso, start, end) {
  const c = M.cellState(data, iso, today, start, end);
  if (c.outside) return '<span class="cell" data-outside="true" aria-hidden="true"></span>';
  const label = `${dayName(iso)} ${M.formatDate(iso)}`;
  if (c.future) return `<span class="cell" data-future="true" role="img" aria-label="${label}: upcoming"></span>`;
  const status = c.finished ? 'finished' : c.done ? `${c.done} of ${c.total} sets` : 'no sets logged';
  return `<button type="button" class="cell" id="cell-${iso}" data-peek="${iso}" data-level="${c.level}" data-today="${iso === today}" aria-pressed="${s.peek === iso}" aria-label="${label}: ${status}${c.skipped ? `, ${c.skipped} skipped` : ''}"></button>`;
}

function renderGrid(start, end) {
  const cols = M.gridColumns(start, end);
  if (s.range === 'week') {
    const dates = cols[0].dates;
    return `<div class="heat week" style="grid-template-columns:repeat(5,minmax(0,1fr))" role="group" aria-label="This week’s workouts">
      ${dates.map((d) => `<span class="lbl" aria-hidden="true">${dayName(d).slice(0, 3).toUpperCase()}</span>`).join('')}
      ${dates.map((d) => cellHTML(d, start, end)).join('')}
      ${dates.map((d) => `<span class="lbl" aria-hidden="true">${M.formatDate(d, { day: 'numeric' })}</span>`).join('')}
    </div>`;
  }
  const head = cols.map((c, i) => {
    let label = '';
    if (s.range === 'month') label = M.formatDate(c.monday < start ? start : c.monday, { day: 'numeric' });
    else {
      const first = c.dates.find((d) => d >= start) || c.monday;
      const prev = cols[i - 1];
      if (!prev || prev.dates[4].slice(0, 7) !== c.dates[4].slice(0, 7)) label = M.formatDate(i === 0 ? first : c.dates[4], { month: 'short' });
    }
    return `<span class="lbl" aria-hidden="true">${label}</span>`;
  }).join('');
  const rows = [0, 1, 2, 3, 4].map((r) =>
    `<span class="lbl rowlbl" aria-hidden="true">${PLAN[r].day[0]}</span>${cols.map((c) => cellHTML(c.dates[r], start, end)).join('')}`).join('');
  return `<div class="heat" style="grid-template-columns:14px repeat(${cols.length},minmax(0,1fr))" role="group" aria-label="Workouts by week, Monday to Friday rows">
    <span></span>${head}${rows}</div>`;
}

function renderPeek() {
  if (!s.peek) return '';
  const st = M.sessionStats(M.getSession(data, s.peek));
  return `<div class="peek" aria-live="polite"><span><strong>${dayName(s.peek).slice(0, 3)} ${M.formatDate(s.peek)}</strong><br>${st.finished ? 'Finished ✓' : statsLine(st)}</span>
    <button type="button" class="small-button" style="margin:0" data-goto="${s.peek}">Open log →</button></div>`;
}

function renderLog() {
  const monday = s.logWeek;
  const rows = PLAN.map((p, i) => {
    const iso = M.addDays(monday, i);
    const session = M.getSession(data, iso);
    const st = M.sessionStats(session);
    const future = iso > today;
    const open = s.logOpen === iso;
    const state = future ? 'Upcoming' : st.finished ? 'Finished ✓' : statsLine(st);
    return `<div class="log-row">
      <div class="log-sum"><span><strong>${p.day}</strong> <small>${M.formatDate(iso)} · ${state}${future && st.skipped ? ` · ${st.skipped} skipped` : ''}</small></span>
        <button type="button" id="log-${iso}" data-logopen="${iso}" aria-expanded="${open}">${open ? 'Hide' : 'Details'}</button></div>
      ${open ? `<div class="log-detail">${renderLogDetail(session, future)}
        <button type="button" class="small-button open-day" data-goto="${iso}">${future ? 'Preview in workout →' : 'Edit in workout →'}</button></div>` : ''}
    </div>`;
  }).join('');
  return `<div class="log-head">
      <button type="button" data-logweek="-1" aria-label="Previous week">‹</button>
      <span class="lh-title">WEEKLY LOG<br>${M.weekLabel(monday)}</span>
      <button type="button" data-logweek="1" aria-label="Next week">›</button>
    </div>
    <section class="window"><div class="titlebar"><span>WORKOUT_HISTORY.exe</span><span class="deco" aria-hidden="true">♡</span></div>${rows}</section>`;
}

function renderLogDetail(session, future) {
  return session.exercises.map((ex) => {
    const n = M.activeSetCount(ex);
    const unit = ex.weightConvention === 'each' ? ' kg each' : ' kg';
    let lines;
    if (ex.skipped) lines = '<li>Skipped — floor unsuitable</li>';
    else {
      const sets = ex.sets.slice(0, n).map((x, j) => {
        const reps = ex.perSide ? (x.left || x.right ? `L ${x.left ?? '–'} / R ${x.right ?? '–'}` : '') : (x.reps ? `${x.reps} reps` : '');
        if (!reps && !x.done && x.kg === null) return '';
        return `<li>Set ${j + 1}: ${reps || 'no reps'}${x.kg !== null ? ` · ${x.kg}${unit}` : ''} · ${x.done ? '✓ done' : 'not ticked'}</li>`;
      }).filter(Boolean);
      lines = sets.length ? sets.join('') : `<li>${future ? 'Upcoming' : 'Nothing logged'}</li>`;
    }
    const extra = ex.optionalExtraSet ? (ex.extraSetAdded ? ' · +2nd set' : '') : '';
    return `<h3>${esc(ex.name)} <small style="font-weight:400">(${ex.targetSets} × ${ex.targetReps}${ex.perSide ? '/side' : ''}${extra})</small></h3><ul>${lines}</ul>`;
  }).join('');
}

function renderBackup() {
  const count = Object.keys(data.sessions).length;
  let confirm = '';
  if (s.importing) {
    const p = s.importing;
    confirm = `<div class="import-confirm" role="alertdialog" aria-labelledby="imp-t">
      <p id="imp-t"><strong>Backup found:</strong> ${p.count} workout day${p.count === 1 ? '' : 's'}${p.count ? ` (${M.formatDate(p.first)} ${p.first.slice(0, 4)} – ${M.formatDate(p.last)} ${p.last.slice(0, 4)})` : ''}.</p>
      <p><strong>Merge</strong> keeps your current log; days in the file replace the same days here.<br><strong>Replace</strong> deletes your current log (${count} day${count === 1 ? '' : 's'}) and uses only the file.</p>
      <div class="row"><button type="button" class="small-button" id="imp-merge" data-import="merge">Merge</button><button type="button" class="small-button" data-import="replace">Replace</button><button type="button" class="small-button" data-import="cancel">Cancel</button></div>
    </div>`;
  }
  return `<section class="window backup" style="margin-top:22px">
    <div class="titlebar"><span>BACKUP.exe</span><span class="deco" aria-hidden="true">✦</span></div>
    <div class="window-body">
      <p>Your log is saved in this browser on this device only — it isn’t synced anywhere. Download a backup now and then.</p>
      <div class="row">
        <button type="button" class="small-button" data-export>⇩ Export backup</button>
        <label class="small-button" for="import-file">⇧ Import backup</label>
      </div>
      <input type="file" id="import-file" accept="application/json,.json" class="sr-only">
      ${confirm}
    </div>
  </section>`;
}

/* ---------- Events ---------- */

document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  let msg = '';
  if (d.view) {
    s.view = d.view; s.form = null;
    if (s.view === 'progress') { s.logWeek = M.mondayOf(s.date); s.logOpen = null; }
    scrollTo(0, 0);
  } else if (d.week) {
    s.date = M.addDays(s.recovery ? M.mondayOf(s.date) : s.date, 7 * Number(d.week)); s.recovery = false; s.form = null;
  } else if ('jumptoday' in d) {
    goToday();
  } else if (d.day !== undefined) {
    s.date = M.addDays(M.mondayOf(s.date), Number(d.day)); s.recovery = false; s.form = null;
  } else if (d.goto) {
    s.date = d.goto; s.recovery = false; s.form = null; s.view = 'workout'; s.peek = null;
    scrollTo(0, 0);
  } else if (d.open !== undefined) {
    const i = Number(d.open);
    s.open[s.date] = s.open[s.date] === i ? -1 : i;
  } else if (d.form !== undefined) {
    s.form = Number(d.form); scrollTo(0, 0);
  } else if ('back' in d) {
    const i = s.form; s.form = null; render();
    document.getElementById(`ex-top-${i}`)?.scrollIntoView({ block: 'start' });
    say(''); return;
  } else if (d.extra !== undefined) {
    const ex = M.getSession(data, s.date).exercises[Number(d.extra)];
    const r = M.setExtraSet(data, s.date, Number(d.extra), !ex.extraSetAdded);
    if (r.ok) save(); msg = r.message || '';
  } else if (d.skip !== undefined) {
    const on = !M.getSession(data, s.date).exercises[Number(d.skip)].skipped;
    const r = M.setSkipped(data, s.date, Number(d.skip), on);
    if (r.ok) { save(); msg = on ? 'Marked as skipped.' : 'Exercise included again.'; } else msg = r.message || '';
  } else if (d.range) {
    s.range = d.range; s.peek = null;
  } else if (d.peek) {
    s.peek = s.peek === d.peek ? null : d.peek;
  } else if (d.logweek) {
    s.logWeek = M.addDays(s.logWeek, 7 * Number(d.logweek)); s.logOpen = null;
  } else if (d.logopen) {
    s.logOpen = s.logOpen === d.logopen ? null : d.logopen;
  } else if ('export' in d) {
    exportBackup(); return;
  } else if (d.import) {
    if (d.import !== 'cancel' && s.importing) {
      M.applyImport(data, s.importing.sessions, d.import);
      msg = save() ? `Backup ${d.import === 'merge' ? 'merged' : 'restored'} ✓ (${s.importing.count} days)` : '';
    }
    s.importing = null;
  } else return;
  say(msg);
  render();
});

// Typing: update the record on every keystroke without re-rendering (keeps the keyboard open).
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.dataset?.field) return;
  const i = Number(el.dataset.ex), j = Number(el.dataset.set);
  const r = M.updateField(data, s.date, i, j, el.dataset.field, el.value);
  if (!r.ok) { say(r.message); return; }
  save();
  if (r.unticked) {
    const row = el.closest('.set');
    row.classList.remove('is-done');
    row.querySelector('.tick').checked = false;
    refreshSessionHeader();
  }
  say(r.message || '');
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'import-file') { readImport(el.files?.[0]); el.value = ''; return; }
  if (el.dataset?.check === undefined) return;
  const r = M.setDone(data, s.date, Number(el.dataset.ex), Number(el.dataset.check), el.checked, today);
  if (!r.ok) { el.checked = !el.checked; say(r.message); return; }
  save();
  const st = M.sessionStats(M.getSession(data, s.date));
  const finishedNow = st.finished && el.checked;
  say(el.checked ? (finishedNow ? 'Session finished ♡ Nice work.' : 'Set logged ♡') : 'Set unticked.');
  // Move on to the next exercise once this one is complete.
  const ex = M.getSession(data, s.date).exercises[Number(el.dataset.ex)];
  if (el.checked && ex.sets.slice(0, M.activeSetCount(ex)).every((x) => x.done)) {
    s.open[s.date] = defaultOpen(M.getSession(data, s.date));
  }
  render();
});

function refreshSessionHeader() {
  const st = M.sessionStats(M.getSession(data, s.date));
  const label = document.getElementById('progress-label');
  if (label) label.innerHTML = `<span>${st.finished ? 'SESSION FINISHED ♡' : 'SESSION PROGRESS'}</span><span>${statsLine(st).toUpperCase()}</span>`;
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
  say(`Backup downloaded (${Object.keys(data.sessions).length} days).`);
}

function readImport(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const p = M.parseImport(String(reader.result));
    if (!p.ok) { s.importing = null; say(`Import stopped: ${p.error}`); render(); return; }
    s.importing = p; say(''); render();
    document.getElementById('imp-merge')?.focus();
  };
  reader.onerror = () => say('Couldn’t read that file.');
  reader.readAsText(file);
}

// Coming back to the app on a new day: move "today" forward.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const now = M.todayISO();
  if (now === today) return;
  const wasOnToday = s.date === today || s.recovery;
  today = now;
  if (wasOnToday) goToday();
  render();
});

/* ---------- Start ---------- */

load();
goToday();
render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
