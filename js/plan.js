// REP.exe — training content.
// Edit this file to change exercises, form videos or cues. No other file needs to change.
// Past sessions keep the prescription they were logged with, so editing the plan never rewrites history.

export const TIMEZONE = 'Africa/Johannesburg';
export const PLAN_VERSION = 1;

// weight: how the optional kg field is read for this movement.
//   'each'   = kilograms per dumbbell (two dumbbells)
//   'single' = kilograms for the one dumbbell you hold
//   'none'   = bodyweight, no weight field
export const EXERCISES = {
  'goblet-squat': {
    name: 'Goblet squat',
    perSide: false,
    weight: 'single',
    video: { url: 'https://www.youtube.com/watch?v=nfX7IFK9UNI', creator: 'National Academy of Sports Medicine (NASM)', kind: 'YouTube demo' },
    cue: 'Hold the weight close to your chest. Keep your knees tracking over your feet.',
  },
  'rdl': {
    name: 'Romanian deadlift',
    short: 'RDL',
    perSide: false,
    weight: 'each',
    video: { url: 'https://www.youtube.com/watch?v=ndfZi5fDaVM', creator: 'Lift With Michelle — Exercise Form Tutorials', kind: 'YouTube tutorial' },
    cue: 'Soft knees. Move from your hips and keep the weights close to your legs.',
  },
  'one-arm-row': {
    name: 'One-arm row',
    perSide: true,
    weight: 'single',
    video: { url: 'https://www.youtube.com/watch?v=dFzUjzfih7k', creator: 'Max Euceda', kind: '2-minute YouTube tutorial' },
    cue: 'Brace on a sturdy chair or surface. Keep your torso still and lower with control.',
  },
  'floor-press': {
    name: 'Floor press',
    perSide: false,
    weight: 'each',
    video: { url: 'https://www.youtube.com/watch?v=maCG2yJl34o', creator: 'Colossus Fitness', kind: 'YouTube form video' },
    cue: 'Lie on the floor. Lower gently until your upper arms touch — no bouncing.',
  },
  'supported-split-squat': {
    name: 'Supported split squat',
    perSide: true,
    weight: 'single',
    video: { url: 'https://www.youtube.com/watch?v=7PXiTOKdYRo', creator: 'Rehab Hero', kind: 'YouTube demo' },
    cue: 'Hold a chair or counter for balance. Both feet stay on the floor in a split stance.',
    reference: 'https://www.rehabhero.ca/exercise/assisted-split-squat',
  },
  'glute-bridge': {
    name: 'Glute bridge',
    perSide: false,
    weight: 'single',
    video: { url: 'https://www.youtube.com/watch?v=CyHS1Y7VcE0', creator: 'Dr. Jacob Goodin', kind: 'YouTube demo' },
    cue: 'Feet planted. Lift your hips with control and squeeze at the top.',
  },
  'side-leg-raise': {
    name: 'Side-lying leg raise',
    perSide: true,
    weight: 'none',
    video: { url: 'https://www.youtube.com/watch?v=g9FtnmsIYgI', creator: 'Baptist Health', kind: 'YouTube demo (side-lying hip abduction)' },
    cue: 'Keep your hips stacked as the top leg lifts. Don’t roll backward.',
  },
  'sliding-hamstring-curl': {
    name: 'Sliding hamstring curl',
    perSide: false,
    weight: 'none',
    video: { url: 'https://www.youtube.com/watch?v=UaecXxAgsKA', creator: 'Theory of Motion Exercise Library', kind: 'YouTube demo' },
    cue: 'Only use the sliding setup if your floor lets you stay in control.',
  },
};

// Index 0 = Monday … 4 = Friday. Weekends are walking and recovery.
// All sets are working sets after warming up.
export const PLAN = [
  {
    day: 'Monday', theme: 'SQUAT + HINGE',
    slots: [
      { slot: 'goblet-squat', exercise: 'goblet-squat', sets: 3, reps: '8–15' },
      { slot: 'rdl', exercise: 'rdl', sets: 2, reps: '8–15' },
    ],
  },
  {
    day: 'Tuesday', theme: 'PULL + PRESS',
    slots: [
      { slot: 'one-arm-row', exercise: 'one-arm-row', sets: 3, reps: '8–15' },
      { slot: 'floor-press', exercise: 'floor-press', sets: 3, reps: '8–15' },
    ],
  },
  {
    day: 'Wednesday', theme: 'SINGLE LEG + GLUTES',
    slots: [
      { slot: 'supported-split-squat', exercise: 'supported-split-squat', sets: 3, reps: '8–12' },
      { slot: 'glute-bridge', exercise: 'glute-bridge', sets: 2, reps: '10–20' },
    ],
  },
  {
    day: 'Thursday', theme: 'UPPER BODY + HIPS',
    slots: [
      { slot: 'one-arm-row', exercise: 'one-arm-row', sets: 2, reps: '8–15' },
      { slot: 'floor-press', exercise: 'floor-press', sets: 2, reps: '8–15' },
      { slot: 'side-leg-raise', exercise: 'side-leg-raise', sets: 1, reps: '12–25', optionalExtraSet: true },
    ],
  },
  {
    day: 'Friday', theme: 'LOWER BODY',
    slots: [
      // "Squat" on Friday = goblet squat (working assumption from the design phase).
      { slot: 'goblet-squat', exercise: 'goblet-squat', sets: 2, reps: '10–15' },
      { slot: 'rdl', exercise: 'rdl', sets: 2, reps: '8–15' },
      { slot: 'sliding-hamstring-curl', exercise: 'sliding-hamstring-curl', sets: 2, reps: '6–12', skippable: true, condition: 'Only if your floor allows a controlled setup.' },
    ],
  },
];
