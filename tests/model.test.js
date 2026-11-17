import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/model.js?v=3';
import { PLAN } from '../js/plan.js?v=3';

const MON = '2026-11-16', TUE = '2026-11-17', WED = '2026-11-18', THU = '2026-11-19', FRI = '2026-11-20', SAT = '2026-11-21', SUN = '2026-11-22';

function logSet(data, iso, ex, i, reps = 10, today = '2030-01-01') {
  const e = M.getSession(data, iso).exercises[ex];
  if (e.measure === 'seconds') { M.updateField(data, iso, ex, i, 'leftSec', reps); M.updateField(data, iso, ex, i, 'rightSec', reps); }
  else if (e.perSide) { M.updateField(data, iso, ex, i, 'left', reps); M.updateField(data, iso, ex, i, 'right', reps); }
  else M.updateField(data, iso, ex, i, 'reps', reps);
  return M.setDone(data, iso, ex, i, true, today);
}

test('plan: exact exercises, order, sets and targets', () => {
  const rows = PLAN.map((d) => d.slots.map((s) => `${s.exercise}:${s.sets}:${s.target}`).join(' | '));
  assert.deepEqual(rows, [
    'goblet-squat:3:8–15 | rdl:2:8–15',
    'one-arm-row:3:8–15 | floor-press:3:8–15',
    'supported-split-squat:3:8–12 | glute-bridge:2:10–20',
    'one-arm-row:2:8–15 | floor-press:2:8–15 | side-leg-raise:1:12–25',
    'goblet-squat:2:10–15 | rdl:2:8–15 | sliding-hamstring-curl:2:6–12',
    'dead-bug:2:6–10 | reverse-crunch:2:8–12 | side-plank-knees:2:10–20',
  ]);
});

test('planned set totals per day', () => {
  const totals = [MON, TUE, WED, THU, FRI, SAT].map((d) => M.sessionStats(M.newSession(d)).total);
  assert.deepEqual(totals, [5, 6, 5, 5, 6, 6]);
  assert.equal(M.isWorkoutDay(SAT), true);
  assert.equal(M.isWorkoutDay(SUN), false);
  assert.throws(() => M.newSession(SUN));
});

test('dates: weekdays, Mondays and boundaries', () => {
  assert.equal(M.weekdayIndex(MON), 0);
  assert.equal(M.weekdayIndex('2026-11-22'), 6);
  assert.equal(M.mondayOf('2026-11-22'), MON);
  assert.equal(M.mondayOf('2027-01-01'), '2026-12-28'); // crosses year
  assert.equal(M.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(M.addDays('2028-02-28', 1), '2028-02-29'); // leap year
  assert.equal(M.weekLabel('2026-12-28'), '28 Dec – 2 Jan 2027');
  assert.equal(M.weekLabel(MON), '16 – 21 Nov 2026');
  assert.equal(M.weekLabel('2026-11-30', false), '30 Nov – 5 Dec');
});

test('todayISO uses Africa/Johannesburg, not UTC', () => {
  // 23:30 UTC on 16 Nov = 01:30 on 17 Nov in Johannesburg (UTC+2)
  assert.equal(M.todayISO(new Date('2026-11-16T23:30:00Z')), '2026-11-17');
  assert.equal(M.todayISO(new Date('2026-11-16T21:59:00Z')), '2026-11-16');
});

test('unilateral set needs both sides and counts once', () => {
  const data = M.emptyData();
  M.updateField(data, TUE, 0, 0, 'left', '12');
  assert.equal(M.setDone(data, TUE, 0, 0, true, TUE).ok, false);
  M.updateField(data, TUE, 0, 0, 'right', '11');
  assert.equal(M.setDone(data, TUE, 0, 0, true, TUE).ok, true);
  assert.deepEqual(M.sessionStats(data.sessions[TUE]), { done: 1, total: 6, skipped: 0, finished: false });
});

test('reps validation: positive whole numbers only; out-of-range targets allowed', () => {
  const data = M.emptyData();
  for (const bad of ['0', '-3', '2.5', 'abc', '']) {
    M.updateField(data, MON, 0, 0, 'reps', bad);
    assert.equal(M.setDone(data, MON, 0, 0, true, MON).ok, false, bad);
  }
  M.updateField(data, MON, 0, 0, 'reps', '30'); // above 8–15 target, still allowed
  assert.equal(M.setDone(data, MON, 0, 0, true, MON).ok, true);
});

test('weight optional, non-negative, decimals allowed', () => {
  const data = M.emptyData();
  assert.equal(M.updateField(data, MON, 0, 0, 'kg', '-1').ok, false);
  M.updateField(data, MON, 0, 0, 'kg', '7,5');
  assert.equal(data.sessions[MON].exercises[0].sets[0].kg, 7.5);
  M.updateField(data, MON, 0, 0, 'reps', '10');
  M.updateField(data, MON, 0, 0, 'kg', '');
  assert.equal(M.setDone(data, MON, 0, 0, true, MON).ok, true);
});

test('editing reps on a ticked set unticks it; editing weight does not', () => {
  const data = M.emptyData();
  logSet(data, MON, 0, 0, 10);
  assert.equal(M.updateField(data, MON, 0, 0, 'kg', '8').unticked, undefined);
  assert.equal(data.sessions[MON].exercises[0].sets[0].done, true);
  assert.equal(M.updateField(data, MON, 0, 0, 'reps', '11').unticked, true);
  assert.equal(M.sessionStats(data.sessions[MON]).done, 0);
});

test('future dates cannot be ticked', () => {
  const data = M.emptyData();
  M.updateField(data, FRI, 0, 0, 'reps', '10');
  assert.equal(M.setDone(data, FRI, 0, 0, true, MON).ok, false);
});

test('Thursday optional second leg-raise set changes denominator and protects data', () => {
  const data = M.emptyData();
  assert.equal(M.sessionStats(M.getSession(data, THU)).total, 5);
  M.setExtraSet(data, THU, 2, true);
  assert.equal(M.sessionStats(data.sessions[THU]).total, 6);
  logSet(data, THU, 2, 1, 15);
  const res = M.setExtraSet(data, THU, 2, false);
  assert.equal(res.ok, false);
  assert.equal(M.sessionStats(data.sessions[THU]).total, 6);
  M.setDone(data, THU, 2, 1, false, THU);
  assert.equal(M.setExtraSet(data, THU, 2, false).ok, true);
  assert.equal(M.sessionStats(data.sessions[THU]).total, 5);
  assert.equal(data.sessions[THU].exercises[2].sets[1].left, 15); // reps kept, just hidden
});

test('Friday hamstring skip: 4-set denominator, skip recorded, blocked when sets ticked', () => {
  const data = M.emptyData();
  logSet(data, FRI, 2, 0, 8);
  assert.equal(M.setSkipped(data, FRI, 2, true).ok, false);
  M.setDone(data, FRI, 2, 0, false, FRI);
  assert.equal(M.setSkipped(data, FRI, 2, true).ok, true);
  const st = M.sessionStats(data.sessions[FRI]);
  assert.deepEqual(st, { done: 0, total: 4, skipped: 2, finished: false });
  for (const [ex, i] of [[0, 0], [0, 1], [1, 0], [1, 1]]) logSet(data, FRI, ex, i);
  assert.equal(M.sessionStats(data.sessions[FRI]).finished, true);
  assert.equal(M.setSkipped(data, FRI, 0, true).ok, false); // non-optional can't be skipped
});

test('levels: share of included planned sets', () => {
  assert.equal(M.levelFor({ done: 0, total: 5 }), 0);
  assert.equal(M.levelFor({ done: 1, total: 6 }), 1);
  assert.equal(M.levelFor({ done: 3, total: 6 }), 1); // exactly 50% = light
  assert.equal(M.levelFor({ done: 3, total: 5 }), 2);
  assert.equal(M.levelFor({ done: 5, total: 5 }), 3);
  assert.equal(M.levelFor({ done: 6, total: 6 }), 3);
});

test('weeks are stored separately and never mix', () => {
  const data = M.emptyData();
  logSet(data, MON, 0, 0, 10);
  logSet(data, '2026-11-23', 0, 0, 14);
  assert.equal(data.sessions[MON].exercises[0].sets[0].reps, 10);
  assert.equal(data.sessions['2026-11-23'].exercises[0].sets[0].reps, 14);
});

test('range bounds: week, month, trailing 90 days across year boundary', () => {
  assert.deepEqual(M.rangeBounds('week', WED), { start: MON, end: '2026-11-22' });
  assert.deepEqual(M.rangeBounds('month', WED), { start: '2026-11-01', end: '2026-11-30' });
  assert.deepEqual(M.rangeBounds('month', '2028-02-10'), { start: '2028-02-01', end: '2028-02-29' });
  assert.deepEqual(M.rangeBounds('ninety', '2027-01-15'), { start: '2026-10-18', end: '2027-01-15' });
});

test('summary ignores future days and weekends; finished vs sets logged', () => {
  const data = M.emptyData();
  for (let i = 0; i < 5; i++) logSet(data, MON, i < 3 ? 0 : 1, i < 3 ? i : i - 3); // Mon finished
  logSet(data, TUE, 1, 0); // Tue partial
  const s = M.rangeSummary(data, 'week', WED);
  assert.deepEqual({ scheduled: s.scheduled, finished: s.finished, sets: s.sets }, { scheduled: 3, finished: 1, sets: 6 });
  // Sunday: Monday–Saturday count, Sunday does not
  assert.equal(M.rangeSummary(data, 'week', SUN).scheduled, 6);
  assert.equal(M.rangeSummary(data, 'week', SAT).scheduled, 6);
  // Unticking reduces totals
  M.setDone(data, MON, 0, 0, false, WED);
  const s2 = M.rangeSummary(data, 'week', WED);
  assert.deepEqual({ finished: s2.finished, sets: s2.sets }, { finished: 0, sets: 5 });
});

test('grid columns span month correctly and mark outside/future', () => {
  const { start, end } = M.rangeBounds('month', WED);
  const cols = M.gridColumns(start, end);
  assert.equal(cols[0].monday, '2026-11-02'); // 1 Nov is a Sunday, so the first column with a November weekday starts 2 Nov
  assert.equal(M.gridColumns('2026-12-01', '2026-12-31')[0].monday, '2026-11-30'); // 1 Dec is a Tuesday
  assert.ok(cols.every((c) => c.dates.some((d) => d >= start && d <= end)));
  assert.equal(cols.at(-1).monday, '2026-11-30');
  const data = M.emptyData();
  assert.equal(M.cellState(data, '2026-10-30', WED, start, end).outside, true);
  assert.equal(M.cellState(data, FRI, WED, start, end).future, true);
  assert.equal(M.cellState(data, MON, WED, start, end).level, 0);
});

test('historical prescription survives plan change', () => {
  const data = M.emptyData();
  logSet(data, MON, 0, 0);
  const saved = data.sessions[MON];
  PLAN[0].slots[0].sets = 4; // simulate a future plan edit
  try {
    assert.equal(M.getSession(data, MON).exercises[0].targetSets, 3);
    assert.equal(M.newSession('2026-11-23').exercises[0].targetSets, 4);
  } finally { PLAN[0].slots[0].sets = 3; }
  assert.equal(saved.exercises[0].targetSets, 3);
});

test('export → import round trip preserves everything', () => {
  const data = M.emptyData();
  logSet(data, THU, 0, 0, 12);
  M.updateField(data, THU, 0, 0, 'kg', '10.5');
  M.setExtraSet(data, THU, 2, true);
  M.setSkipped(data, FRI, 2, true);
  const text = M.exportData(data);
  const parsed = M.parseImport(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.count, 2);
  const fresh = M.applyImport(M.emptyData(), parsed.sessions, 'replace');
  assert.deepEqual(fresh.sessions, data.sessions);
});

test('import validation rejects bad files; merge keeps other dates', () => {
  assert.equal(M.parseImport('nope').ok, false);
  assert.equal(M.parseImport('{"app":"Other"}').ok, false);
  const data = M.emptyData();
  logSet(data, MON, 0, 0);
  const bad = JSON.parse(M.exportData(data));
  bad.sessions[MON].exercises[0].sets[0].reps = 0;
  assert.equal(M.parseImport(JSON.stringify(bad)).ok, false);
  const weekend = JSON.parse(M.exportData(data));
  weekend.sessions[SUN] = { ...weekend.sessions[MON], date: SUN };
  assert.equal(M.parseImport(JSON.stringify(weekend)).ok, false);

  const other = M.emptyData();
  logSet(other, TUE, 1, 0);
  const merged = M.applyImport(structuredClone(data), M.parseImport(M.exportData(other)).sessions, 'merge');
  assert.deepEqual(Object.keys(merged.sessions).sort(), [MON, TUE]);
});

test('fresh start has no history', () => {
  const { data, error } = M.loadData(null);
  assert.equal(error, null);
  assert.deepEqual(data.sessions, {});
  assert.equal(M.loadData('{broken').error !== null, true);
});

test('side plank: seconds stored separately from reps, both sides required, one set per pair', () => {
  const data = M.emptyData();
  const plank = M.getSession(data, SAT).exercises[2];
  assert.equal(plank.measure, 'seconds');
  assert.equal(plank.targetSeconds, '10–20');
  assert.equal(plank.targetReps, null);
  M.updateField(data, SAT, 2, 0, 'leftSec', '15');
  assert.equal(M.setDone(data, SAT, 2, 0, true, SAT).ok, false);
  M.updateField(data, SAT, 2, 0, 'rightSec', '25'); // above target is allowed
  assert.equal(M.setDone(data, SAT, 2, 0, true, SAT).ok, true);
  const set = data.sessions[SAT].exercises[2].sets[0];
  assert.deepEqual([set.leftSec, set.rightSec, set.left, set.right, set.reps], [15, 25, null, null, null]);
  assert.equal(M.sessionStats(data.sessions[SAT]).done, 1);
  // reps fields alone don't satisfy a timed hold
  M.updateField(data, SAT, 2, 1, 'left', '15'); M.updateField(data, SAT, 2, 1, 'right', '15');
  assert.equal(M.setDone(data, SAT, 2, 1, true, SAT).ok, false);
});

test('Saturday counts in progress; finishing all six sets finishes the day', () => {
  const data = M.emptyData();
  for (const [ex, i] of [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]]) logSet(data, SAT, ex, i, 12);
  assert.equal(M.sessionStats(data.sessions[SAT]).finished, true);
  const s = M.rangeSummary(data, 'week', SUN);
  assert.deepEqual({ finished: s.finished, sets: s.sets }, { finished: 1, sets: 6 });
  const cols = M.gridColumns(...Object.values(M.rangeBounds('month', SAT)));
  assert.ok(cols.every((c) => c.dates.length === 6));
});

test('v1 saved data (Mon–Fri, no seconds fields) upgrades without loss', () => {
  const v1 = { schemaVersion: 1, sessions: { [MON]: { date: MON, planVersion: 1, exercises: [
    { slot: 'goblet-squat', exerciseId: 'goblet-squat', name: 'Goblet squat', targetSets: 3, targetReps: '8–15', perSide: false, weightUnit: 'kg', weightConvention: 'single', optionalExtraSet: false, extraSetAdded: false, skippable: false, skipped: false,
      sets: [1, 2, 3].map((n) => ({ set: n, reps: n === 1 ? 12 : null, left: null, right: null, kg: n === 1 ? 8 : null, done: n === 1 })) },
  ] } } };
  const { data, error } = M.loadData(JSON.stringify(v1));
  assert.equal(error, null);
  assert.equal(data.schemaVersion, 2);
  const ex = data.sessions[MON].exercises[0];
  assert.equal(ex.measure, 'reps');
  assert.deepEqual([ex.sets[0].reps, ex.sets[0].kg, ex.sets[0].done, ex.sets[0].leftSec], [12, 8, true, null]);
  assert.equal(M.sessionStats(data.sessions[MON]).done, 1);
  // a v1 backup file imports too
  const parsed = M.parseImport(JSON.stringify({ app: 'REP.exe', ...v1 }));
  assert.equal(parsed.ok, true, parsed.error);
});
