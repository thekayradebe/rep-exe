// REP.exe — data model. Pure functions only (no DOM, no storage) so they can be tested in Node.
import { PLAN, PLAN_VERSION, EXERCISES, TIMEZONE } from './plan.js';

export const SCHEMA_VERSION = 1;
export const APP_ID = 'REP.exe';
const DAY_MS = 86400000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- Dates (all as YYYY-MM-DD local calendar strings) ---------- */

export function todayISO(now = new Date(), tz = TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function toEpoch(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
export function toISO(ms) { return new Date(ms).toISOString().slice(0, 10); }
export function addDays(iso, n) { return toISO(toEpoch(iso) + n * DAY_MS); }
/** Monday = 0 … Sunday = 6 */
export function weekdayIndex(iso) { return (new Date(toEpoch(iso)).getUTCDay() + 6) % 7; }
export function mondayOf(iso) { return addDays(iso, -weekdayIndex(iso)); }
export function isStrengthDay(iso) { return weekdayIndex(iso) < 5; }
export function isValidISO(iso) {
  return typeof iso === 'string' && ISO_RE.test(iso) && toISO(toEpoch(iso)) === iso;
}
export function formatDate(iso, opts = { day: 'numeric', month: 'short' }) {
  return new Date(toEpoch(iso)).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
}
export function weekLabel(monday) {
  const fri = addDays(monday, 4);
  const sameMonth = monday.slice(0, 7) === fri.slice(0, 7);
  const left = sameMonth ? formatDate(monday, { day: 'numeric' }) : formatDate(monday);
  return `${left} – ${formatDate(fri)} ${fri.slice(0, 4)}`;
}

/* ---------- Sessions ---------- */

export function emptyData() { return { schemaVersion: SCHEMA_VERSION, sessions: {} }; }

/** A fresh session snapshot for a weekday, copying today's plan so history keeps its own prescription. */
export function newSession(iso) {
  const day = PLAN[weekdayIndex(iso)];
  if (!day) throw new Error(`No strength session on ${iso}`);
  return {
    date: iso,
    planVersion: PLAN_VERSION,
    exercises: day.slots.map((s) => {
      const ex = EXERCISES[s.exercise];
      const capacity = s.sets + (s.optionalExtraSet ? 1 : 0);
      return {
        slot: s.slot,
        exerciseId: s.exercise,
        name: ex.name,
        targetSets: s.sets,
        targetReps: s.reps,
        perSide: ex.perSide,
        weightUnit: 'kg',
        weightConvention: ex.weight,
        optionalExtraSet: !!s.optionalExtraSet,
        extraSetAdded: false,
        skippable: !!s.skippable,
        skipped: false,
        sets: Array.from({ length: capacity }, (_, i) => blankSet(i + 1)),
      };
    }),
  };
}
function blankSet(n) { return { set: n, reps: null, left: null, right: null, kg: null, done: false }; }

/** Read-only view of a date: the saved session, or a blank one from the current plan. */
export function getSession(data, iso) { return data.sessions[iso] || newSession(iso); }
/** Session for writing: creates and stores it on first edit. */
export function ensureSession(data, iso) {
  if (!data.sessions[iso]) data.sessions[iso] = newSession(iso);
  return data.sessions[iso];
}

export function activeSetCount(ex) { return ex.targetSets + (ex.extraSetAdded ? 1 : 0); }

export function sessionStats(session) {
  let done = 0, total = 0, skipped = 0;
  for (const ex of session.exercises) {
    const n = activeSetCount(ex);
    if (ex.skipped) { skipped += n; continue; }
    total += n;
    done += ex.sets.slice(0, n).filter((s) => s.done).length;
  }
  return { done, total, skipped, finished: total > 0 && done === total };
}

/** 0 empty · 1 some (≤50%) · 2 more than half · 3 finished */
export function levelFor({ done, total }) {
  if (!total || !done) return 0;
  if (done === total) return 3;
  return done / total > 0.5 ? 2 : 1;
}

/* ---------- Validation helpers ---------- */

export function parseReps(raw) {
  if (raw === null || raw === undefined) return null;
  const t = String(raw).trim();
  if (t === '') return null;
  if (!/^\d+$/.test(t)) return NaN;
  const n = Number(t);
  return n >= 1 ? n : NaN;
}
export function parseKg(raw) {
  if (raw === null || raw === undefined) return null;
  const t = String(raw).trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100) / 100;
}
export function setIsLoggable(ex, set) {
  const ok = (v) => Number.isInteger(v) && v >= 1;
  return ex.perSide ? ok(set.left) && ok(set.right) : ok(set.reps);
}

/* ---------- Mutations (return { ok, message?, unticked? }) ---------- */

/** field: 'reps' | 'left' | 'right' | 'kg'. Changing reps on a ticked set unticks it so totals stay honest. */
export function updateField(data, iso, exIdx, setIdx, field, raw) {
  const ex = ensureSession(data, iso).exercises[exIdx];
  const set = ex.sets[setIdx];
  if (field === 'kg') {
    const v = parseKg(raw);
    if (Number.isNaN(v)) return { ok: false, message: 'Weight must be 0 or more.' };
    set.kg = v;
    return { ok: true };
  }
  const v = parseReps(raw);
  const stored = Number.isNaN(v) ? null : v;
  const changed = set[field] !== stored;
  set[field] = stored;
  if (set.done && changed) {
    set.done = false;
    return { ok: true, unticked: true, message: 'Reps changed — tick the set again to confirm.' };
  }
  if (Number.isNaN(v)) return { ok: true, message: 'Reps must be a whole number of 1 or more.' };
  return { ok: true };
}

export function setDone(data, iso, exIdx, setIdx, done, today) {
  if (done && iso > today) return { ok: false, message: 'This workout is upcoming. You can tick sets on the day.' };
  const session = done ? ensureSession(data, iso) : data.sessions[iso];
  if (!session) return { ok: true };
  const ex = session.exercises[exIdx];
  if (ex.skipped) return { ok: false, message: 'This exercise is skipped. Include it first.' };
  const set = ex.sets[setIdx];
  if (done && !setIsLoggable(ex, set)) {
    return { ok: false, message: ex.perSide ? 'Enter reps for both sides first.' : 'Enter your actual reps first.' };
  }
  set.done = !!done;
  return { ok: true };
}

export function setExtraSet(data, iso, exIdx, on) {
  const ex = ensureSession(data, iso).exercises[exIdx];
  if (!ex.optionalExtraSet) return { ok: false };
  if (!on && ex.sets[ex.targetSets]?.done) {
    return { ok: false, message: 'Untick the second set before removing it.' };
  }
  ex.extraSetAdded = !!on;
  return { ok: true };
}

export function setSkipped(data, iso, exIdx, on) {
  const ex = ensureSession(data, iso).exercises[exIdx];
  if (!ex.skippable) return { ok: false };
  if (on && ex.sets.slice(0, activeSetCount(ex)).some((s) => s.done)) {
    return { ok: false, message: 'Untick the logged sets before skipping this exercise.' };
  }
  ex.skipped = !!on;
  return { ok: true };
}

/* ---------- Progress ranges ---------- */

export const RANGES = { week: 'This week', month: 'This month', ninety: 'Last 90 days' };

export function rangeBounds(range, today) {
  if (range === 'week') { const s = mondayOf(today); return { start: s, end: addDays(s, 6) }; }
  if (range === 'month') {
    const [y, m] = today.split('-').map(Number);
    const start = `${today.slice(0, 7)}-01`;
    const end = toISO(Date.UTC(y, m, 0)); // day 0 of next month = last day of this month
    return { start, end };
  }
  return { start: addDays(today, -89), end: today };
}

/** Columns = calendar weeks (Monday-based), rows = Mon–Fri. */
export function gridColumns(start, end) {
  const cols = [];
  for (let m = mondayOf(start); m <= end; m = addDays(m, 7)) {
    const dates = Array.from({ length: 5 }, (_, d) => addDays(m, d));
    if (dates.some((d) => d >= start && d <= end)) cols.push({ monday: m, dates });
  }
  return cols;
}

export function cellState(data, iso, today, start, end) {
  if (iso < start || iso > end) return { outside: true };
  if (iso > today) return { future: true, level: 0 };
  const stats = sessionStats(getSession(data, iso));
  return { ...stats, level: levelFor(stats) };
}

export function rangeSummary(data, range, today) {
  const { start, end } = rangeBounds(range, today);
  let scheduled = 0, finished = 0, sets = 0;
  for (let d = start; d <= end && d <= today; d = addDays(d, 1)) {
    if (!isStrengthDay(d)) continue;
    scheduled++;
    const st = sessionStats(getSession(data, d));
    sets += st.done;
    if (st.finished) finished++;
  }
  return { start, end, scheduled, finished, sets };
}

/* ---------- Backup ---------- */

export function exportData(data, now = new Date()) {
  return JSON.stringify({ app: APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), sessions: data.sessions }, null, 2);
}

/** Validates a backup file. Returns { ok, sessions, count, first, last } or { ok:false, error }. */
export function parseImport(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { return { ok: false, error: 'This file isn’t valid JSON.' }; }
  if (!obj || typeof obj !== 'object' || obj.app !== APP_ID) return { ok: false, error: 'This isn’t a REP.exe backup file.' };
  if (!Number.isInteger(obj.schemaVersion) || obj.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, error: 'This backup is from a newer version of REP.exe.' };
  }
  const sessions = obj.sessions;
  if (!sessions || typeof sessions !== 'object' || Array.isArray(sessions)) return { ok: false, error: 'The backup has no workout data.' };
  const dates = Object.keys(sessions).sort();
  for (const iso of dates) {
    const err = validateSession(iso, sessions[iso]);
    if (err) return { ok: false, error: `${iso}: ${err}` };
  }
  return { ok: true, sessions, count: dates.length, first: dates[0] || null, last: dates[dates.length - 1] || null };
}

function validateSession(iso, s) {
  if (!isValidISO(iso) || !isStrengthDay(iso)) return 'not a Monday–Friday date.';
  if (!s || s.date !== iso || !Array.isArray(s.exercises)) return 'session is malformed.';
  const posIntOrNull = (v) => v === null || (Number.isInteger(v) && v >= 1);
  for (const ex of s.exercises) {
    if (typeof ex.exerciseId !== 'string' || !Number.isInteger(ex.targetSets) || ex.targetSets < 1) return 'exercise is malformed.';
    if (typeof ex.targetReps !== 'string' || typeof ex.perSide !== 'boolean') return 'exercise is malformed.';
    if (typeof ex.skipped !== 'boolean' || typeof ex.extraSetAdded !== 'boolean') return 'optional settings are malformed.';
    if (!Array.isArray(ex.sets) || ex.sets.length < activeSetCount(ex)) return 'sets are missing.';
    for (const set of ex.sets) {
      if (typeof set.done !== 'boolean') return 'set is malformed.';
      if (!posIntOrNull(set.reps) || !posIntOrNull(set.left) || !posIntOrNull(set.right)) return 'reps must be whole numbers of 1 or more.';
      if (!(set.kg === null || (typeof set.kg === 'number' && set.kg >= 0))) return 'weight must be 0 or more.';
      if (set.done && !setIsLoggable(ex, set)) return 'a ticked set has no reps.';
    }
  }
  return null;
}

export function applyImport(data, sessions, mode) {
  if (mode === 'replace') data.sessions = structuredClone(sessions);
  else data.sessions = { ...data.sessions, ...structuredClone(sessions) };
  return data;
}

/** Loads saved JSON safely. Returns { data, error }. */
export function loadData(raw) {
  if (!raw) return { data: emptyData(), error: null };
  try {
    const obj = JSON.parse(raw);
    if (obj && obj.schemaVersion === SCHEMA_VERSION && obj.sessions && typeof obj.sessions === 'object') return { data: obj, error: null };
    return { data: emptyData(), error: 'Saved data was unreadable.' };
  } catch {
    return { data: emptyData(), error: 'Saved data was unreadable.' };
  }
}
