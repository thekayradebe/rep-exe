// REP.exe — training content.
// Edit this file to change exercises, form videos, images or cues. No other file needs to change.
// Past sessions keep the prescription they were logged with, so editing the plan never rewrites history.

export const TIMEZONE = 'Africa/Johannesburg';
export const PLAN_VERSION = 2;

const MICHELLE = 'Lift With Michelle';

// weight: how the optional kg field is read for this movement.
//   'each'   = kilograms per dumbbell (two dumbbells)
//   'single' = kilograms for the one dumbbell you hold
//   'none'   = bodyweight, no weight field
// measure: 'reps' (default) or 'seconds' (timed holds; stored separately from reps)
// image: muscle map in images/anatomy/. Pink = main muscles, periwinkle = supporting.
export const EXERCISES = {
  'goblet-squat': {
    name: 'Goblet squat', perSide: false, weight: 'single',
    image: 'goblet-squat', muscles: { main: 'quads, glutes', support: 'core' },
    video: { url: 'https://www.youtube.com/watch?v=Xef_H9ZLkdY', creator: MICHELLE },
    cue: 'Hold the weight close to your chest. Keep your knees tracking over your feet.',
  },
  'rdl': {
    name: 'Romanian deadlift', perSide: false, weight: 'each',
    image: 'romanian-deadlift', muscles: { main: 'hamstrings, glutes', support: 'core, lower back' },
    video: { url: 'https://www.youtube.com/watch?v=ndfZi5fDaVM', creator: MICHELLE },
    cue: 'Soft knees. Move from your hips and keep the weights close to your legs.',
  },
  'one-arm-row': {
    name: 'One-arm row', perSide: true, weight: 'single',
    image: 'one-arm-row', muscles: { main: 'lats, upper back', support: 'biceps, rear shoulders' },
    video: { url: 'https://www.youtube.com/watch?v=0G4AD998kRM', creator: MICHELLE },
    cue: 'Brace on a sturdy chair or surface. Keep your torso still and lower with control.',
  },
  'floor-press': {
    name: 'Floor press', perSide: false, weight: 'each',
    image: 'floor-press', muscles: { main: 'chest, triceps', support: 'front shoulders' },
    video: { url: 'https://www.youtube.com/watch?v=maCG2yJl34o', creator: 'Colossus Fitness' },
    cue: 'Lie on the floor. Lower gently until your upper arms touch — no bouncing.',
  },
  'supported-split-squat': {
    name: 'Supported split squat', perSide: true, weight: 'single',
    image: 'supported-split-squat', muscles: { main: 'quads, glutes', support: 'core, outer hips' },
    video: { url: 'https://www.youtube.com/watch?v=7PXiTOKdYRo', creator: 'Rehab Hero' },
    cue: 'Hold a chair or counter for balance. Both feet stay on the floor in a split stance.',
  },
  'glute-bridge': {
    name: 'Glute bridge', perSide: false, weight: 'single',
    image: 'glute-bridge', muscles: { main: 'glutes', support: 'hamstrings, core' },
    video: { url: 'https://www.youtube.com/watch?v=KiUmVd2Q4Ds', creator: MICHELLE },
    cue: 'Feet planted. Lift your hips with control and squeeze at the top. The band in the video is optional.',
  },
  'side-leg-raise': {
    name: 'Side-lying leg raise', perSide: true, weight: 'none',
    image: 'side-lying-leg-raise', muscles: { main: 'outer hips', support: 'core' },
    video: { url: 'https://www.youtube.com/watch?v=g9FtnmsIYgI', creator: 'Baptist Health' },
    cue: 'Keep your hips stacked as the top leg lifts. Don’t roll backward.',
  },
  'sliding-hamstring-curl': {
    name: 'Sliding hamstring curl', perSide: false, weight: 'none',
    image: 'sliding-hamstring-curl', muscles: { main: 'hamstrings', support: 'glutes, core' },
    video: { url: 'https://www.youtube.com/watch?v=UaecXxAgsKA', creator: 'Theory of Motion' },
    cue: 'Only use the sliding setup if your floor lets you stay in control.',
  },
  'dead-bug': {
    name: 'Dead bug', perSide: true, weight: 'none',
    image: 'dead-bug', muscles: { main: 'abs, deep core', support: 'obliques' },
    video: { url: 'https://www.youtube.com/watch?v=iGxWcq8Wils', creator: MICHELLE },
    cue: 'Lower back stays down. Move slowly, opposite arm and leg.',
  },
  'reverse-crunch': {
    name: 'Reverse crunch', perSide: false, weight: 'none',
    image: 'reverse-crunch', muscles: { main: 'abs', support: 'obliques' },
    video: { url: 'https://www.youtube.com/watch?v=ue6j6k0Vgbc', creator: MICHELLE },
    cue: 'Curl your hips up off the floor with control. No swinging.',
  },
  'side-plank-knees': {
    name: 'Side plank from knees', perSide: true, weight: 'none', measure: 'seconds',
    image: 'side-plank-knees', muscles: { main: 'side core', support: 'shoulders, outer hips' },
    video: { url: 'https://www.youtube.com/watch?v=ipVIbFGNsIs', creator: MICHELLE },
    cue: 'Elbow under shoulder, knees down. Hold your hips high in a straight line.',
  },
};

// Index 0 = Monday … 5 = Saturday. Sunday is walking and recovery.
// All sets are working sets after warming up. `target` is reps, or seconds for timed holds.
export const PLAN = [
  {
    day: 'Monday',
    slots: [
      { slot: 'goblet-squat', exercise: 'goblet-squat', sets: 3, target: '8–15' },
      { slot: 'rdl', exercise: 'rdl', sets: 2, target: '8–15' },
    ],
  },
  {
    day: 'Tuesday',
    slots: [
      { slot: 'one-arm-row', exercise: 'one-arm-row', sets: 3, target: '8–15' },
      { slot: 'floor-press', exercise: 'floor-press', sets: 3, target: '8–15' },
    ],
  },
  {
    day: 'Wednesday',
    slots: [
      { slot: 'supported-split-squat', exercise: 'supported-split-squat', sets: 3, target: '8–12' },
      { slot: 'glute-bridge', exercise: 'glute-bridge', sets: 2, target: '10–20' },
    ],
  },
  {
    day: 'Thursday',
    slots: [
      { slot: 'one-arm-row', exercise: 'one-arm-row', sets: 2, target: '8–15' },
      { slot: 'floor-press', exercise: 'floor-press', sets: 2, target: '8–15' },
      { slot: 'side-leg-raise', exercise: 'side-leg-raise', sets: 1, target: '12–25', optionalExtraSet: true },
    ],
  },
  {
    day: 'Friday',
    slots: [
      // "Squat" on Friday = goblet squat (working assumption from the design phase).
      { slot: 'goblet-squat', exercise: 'goblet-squat', sets: 2, target: '10–15' },
      { slot: 'rdl', exercise: 'rdl', sets: 2, target: '8–15' },
      { slot: 'sliding-hamstring-curl', exercise: 'sliding-hamstring-curl', sets: 2, target: '6–12', skippable: true },
    ],
  },
  {
    day: 'Saturday', label: 'Abs & Core',
    slots: [
      { slot: 'dead-bug', exercise: 'dead-bug', sets: 2, target: '6–10' },
      { slot: 'reverse-crunch', exercise: 'reverse-crunch', sets: 2, target: '8–12' },
      { slot: 'side-plank-knees', exercise: 'side-plank-knees', sets: 2, target: '10–20' },
    ],
  },
];
