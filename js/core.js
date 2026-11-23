/* Gym Tracker — core: utilities, seed data, storage, training/nutrition logic.
   Plain globals on purpose (no build step). */
'use strict';

const APP_VERSION = '1.0.0';
const DATA_VERSION = 1;
const MUSCLES = ['chest', 'side delts', 'back/lats', 'traps', 'triceps', 'biceps', 'quads', 'hamstrings', 'calves'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* ---------- small utils ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => String(n).padStart(2, '0');
// LOCAL calendar date (never toISOString: that is UTC and shifts days in UTC+4)
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const dow = s => parseYmd(s).getDay();
const weekStart = s => addDays(s, -((dow(s) + 6) % 7)); // Monday
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
const fmtDate = s => parseYmd(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const fmtShort = s => parseYmd(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const round05 = x => Math.round(x * 2) / 2;
const r1 = x => Math.round(x * 10) / 10;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDur = sec => {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };

/* ---------- seed program ---------- */
const CUES = {
  'Shoulder press machine': 'Set the seat so the handles start at shoulder height; keep your back on the pad; press up without shrugging.',
  'Assisted pull-up (wide)': 'Chest up; pull your elbows down toward your hips; lower fully under control, no swinging.',
  'Incline press machine': 'Shoulder blades back and down; lower slowly; elbows about 45-60 degrees from your body.',
  'Lat pulldown': 'Lean back slightly; pull the bar to your upper chest; elbows go down, not behind you.',
  'Lateral raise': 'Slight elbow bend; lift out to shoulder height, leading with the elbows; light weight, no swinging.',
  'Decline press machine': "Keep shoulders still against the pad; control the way down; don't bounce.",
  'Triceps pushdown': "Elbows pinned to your sides; fully straighten; don't lean over the weight; split the rope at the bottom.",
  'Shrug machine': 'Lift straight up toward your ears; pause 1 second at the top; no rolling, no bent elbows.',
  'Barbell squat (rack)': 'Bar on your upper back; feet about shoulder width; brace your core; knees track over toes; set the safety pins just below your lowest depth.',
  'Leg press': "Feet shoulder width, mid-platform; lower until your knees are about 90 degrees without your lower back lifting; don't lock your knees.",
  'Leg extension': "Pad on your lower shin; lift with control; pause at the top; don't swing.",
  'Seated leg curl': 'Hips pinned back; curl your heels toward your glutes; lower slowly.',
  'Calf raise': 'Full stretch at the bottom; pause at the top; slow reps.',
  'Knee raises (stand)': 'Back on the pad, forearms on the arm rests; lift your knees to hip height by curling your pelvis; slow down, no swinging.',
  'Flat bench (machine/Smith)': 'Shoulder blades back and down; feet planted; lower to your lower chest; on the Smith set the stops just above your chest.',
  'T-bar row': 'Hinge at the hips with a flat back; pull your elbows back; squeeze your shoulder blades; no jerking.',
  'Cable fly': 'Keep a fixed slight elbow bend; hug a big barrel; stretch without overextending your shoulders.',
  'Reverse fly machine': 'Chest on the pad; lead with the elbows; squeeze your rear delts; light weight.',
  'Bicep curl': 'Elbows fixed at your sides; full range; no swinging.',
  'Rope pushdown': "Elbows pinned to your sides; fully straighten; don't lean over the weight; split the rope at the bottom.",
  'Romanian deadlift': 'Soft knees; push your hips back; keep the weight close to your legs; flat back; stop when your hamstrings stretch, then squeeze your glutes to stand.',
};
// name, sets, repMin, repMax, compound?, muscles, extra
const EXDEF = {
  'Shoulder press machine': [true, ['side delts'], { main: true }],
  'Assisted pull-up (wide)': [true, ['back/lats', 'biceps'], { main: true, assisted: true, notes: 'Weight = assistance kg (less is better).' }],
  'Incline press machine': [true, ['chest'], { main: true }],
  'Lat pulldown': [true, ['back/lats'], { main: true }],
  'Lateral raise': [false, ['side delts'], {}],
  'Decline press machine': [true, ['chest'], {}],
  'Triceps pushdown': [false, ['triceps'], {}],
  'Shrug machine': [false, ['traps'], {}],
  'Barbell squat (rack)': [true, ['quads'], { main: true, notes: 'Start from program week 3.' }],
  'Leg press': [true, ['quads'], { main: true }],
  'Leg extension': [false, ['quads'], {}],
  'Seated leg curl': [false, ['hamstrings'], {}],
  'Calf raise': [false, ['calves'], {}],
  'Knee raises (stand)': [false, [], { bodyweight: true }],
  'Flat bench (machine/Smith)': [true, ['chest'], { main: true }],
  'T-bar row': [true, ['back/lats', 'traps'], { main: true }],
  'Cable fly': [false, ['chest'], {}],
  'Reverse fly machine': [false, [], { notes: 'Rear delts (not in the weekly-sets groups; tag it if you want).' }],
  'Bicep curl': [false, ['biceps'], {}],
  'Rope pushdown': [false, ['triceps'], {}],
  'Romanian deadlift': [true, ['hamstrings'], { main: true }],
};
function mkEx(name, sets, repMin, repMax) {
  const [compound, muscles, extra] = EXDEF[name];
  return {
    id: uid(), name, sets, repMin, repMax: repMax ?? repMin,
    rest: compound ? 150 : 90, compound, muscles: [...muscles],
    main: !!extra.main, assisted: !!extra.assisted, bodyweight: !!extra.bodyweight,
    inc: compound ? 2.5 : 1, notes: extra.notes || '',
    cues: (CUES[name] || '').split(';').map(s => s.trim()).filter(Boolean).map(s => s[0].toUpperCase() + s.slice(1)),
  };
}
function seedProgram() {
  return [
    { id: uid(), name: 'Upper 1', day: 1, exercises: [
      mkEx('Shoulder press machine', 4, 8, 10), mkEx('Assisted pull-up (wide)', 4, 8, 10), mkEx('Incline press machine', 3, 8, 10),
      mkEx('Lat pulldown', 3, 10, 12), mkEx('Lateral raise', 4, 12, 15), mkEx('Decline press machine', 3, 10, 12),
      mkEx('Triceps pushdown', 3, 10, 12), mkEx('Shrug machine', 3, 10, 15)] },
    { id: uid(), name: 'Lower 1', day: 2, exercises: [
      mkEx('Barbell squat (rack)', 3, 6, 8), mkEx('Leg press', 3, 10, 12), mkEx('Leg extension', 3, 12),
      mkEx('Seated leg curl', 3, 10, 12), mkEx('Calf raise', 4, 12, 15), mkEx('Knee raises (stand)', 3, 8, 12)] },
    { id: uid(), name: 'Upper 2', day: 3, exercises: [
      mkEx('Flat bench (machine/Smith)', 4, 8), mkEx('T-bar row', 4, 8, 10), mkEx('Lateral raise', 3, 12, 15),
      mkEx('Cable fly', 3, 12, 15), mkEx('Reverse fly machine', 3, 15), mkEx('Bicep curl', 3, 10, 12),
      mkEx('Rope pushdown', 3, 10, 12), mkEx('Shrug machine', 3, 10, 15), mkEx('Knee raises (stand)', 3, 8, 12)] },
    { id: uid(), name: 'Lower 2', day: 4, exercises: [
      mkEx('Romanian deadlift', 3, 8, 10), mkEx('Seated leg curl', 3, 10, 12), mkEx('Leg press', 3, 12),
      mkEx('Calf raise', 4, 15), mkEx('Lateral raise', 3, 15, 20), mkEx('Knee raises (stand)', 3, 10, 12)] },
  ];
}
function defaultState() {
  const today = ymd();
  return {
    dataVersion: DATA_VERSION,
    createdAt: Date.now(),
    settings: {
      startDate: today, trainingDays: [1, 2, 3, 4], phase: 'normal', bodyPhase: 'maintain', cutStart: today,
      kcalTarget: 2400, proteinTarget: 170, weighDays: [1, 3, 5], sound: true, lastBackupAt: null,
      muscleTargets: Object.fromEntries(MUSCLES.map(m => [m, 10])), bwFallback: 90,
    },
    program: seedProgram(),
    sessions: [],
    active: null,
    pauses: [{ id: uid(), start: '2026-12-07', end: '2027-01-08', label: 'Trip' }],
    deload: { weeks: [false, false, false, false, false, false], pendingBanner: false, activeUntil: null, dismissedLowKey: null },
    foods: [],
    foodLog: [],
    body: { weighins: [], waist: [] },
  };
}

/* ---------- storage: IndexedDB primary, localStorage mirror ---------- */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      if (!('indexedDB' in window)) return rej(new Error('no idb'));
      const rq = indexedDB.open('gymtracker', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
      rq.onsuccess = () => { this.db = rq.result; res(); };
      rq.onerror = () => rej(rq.error);
    });
  },
  get(key) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction('kv', 'readonly').objectStore('kv').get(key);
      tx.onsuccess = () => res(tx.result); tx.onerror = () => rej(tx.error);
    });
  },
  put(key, val) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(val, key);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
  },
};
let S = null; // the whole app state, in memory
let saveTimer = null;
async function loadState() {
  let st = null;
  try { await DB.open(); st = await DB.get('state'); } catch (e) { console.warn('IDB unavailable', e); }
  if (!st) { try { const raw = localStorage.getItem('gym_state_mirror'); if (raw) st = JSON.parse(raw); } catch (e) {} }
  S = migrate(st || defaultState());
  return S;
}
function migrate(st) {
  const d = defaultState();
  st.settings = Object.assign({}, d.settings, st.settings || {});
  st.settings.muscleTargets = Object.assign({}, d.settings.muscleTargets, st.settings.muscleTargets || {});
  st.deload = Object.assign({}, d.deload, st.deload || {});
  st.body = Object.assign({ weighins: [], waist: [] }, st.body || {});
  for (const k of ['sessions', 'foods', 'foodLog', 'pauses', 'program']) if (!Array.isArray(st[k])) st[k] = k === 'program' ? d.program : [];
  st.dataVersion = DATA_VERSION;
  return st;
}
function save(now = false) {
  clearTimeout(saveTimer);
  const doSave = async () => {
    const snap = JSON.parse(JSON.stringify(S));
    try { if (DB.db) await DB.put('state', snap); } catch (e) { console.error('IDB save failed', e); }
    try { localStorage.setItem('gym_state_mirror', JSON.stringify(snap)); } catch (e) { /* quota: IDB is primary */ }
  };
  if (now) return doSave();
  saveTimer = setTimeout(doSave, 250);
}

/* ---------- training logic ---------- */
function findEx(exId) {
  for (const w of S.program) for (const e of w.exercises) if (e.id === exId) return e;
  return null;
}
function latestBW() {
  const w = [...S.body.weighins].sort((a, b) => a.date < b.date ? 1 : -1)[0];
  return w ? w.kg : S.settings.bwFallback || 90;
}
// "effective" load so that heavier = better even for assisted moves
function effLoad(ex, w) { return ex && ex.assisted ? Math.max(1, latestBW() - w) : w; }
function e1rm(ex, w, r) { const L = effLoad(ex, w); return L > 0 ? L * (1 + r / 30) : r; }
function score(ex, w, r) { return (ex && ex.bodyweight) || (!ex?.assisted && w <= 0) ? r : e1rm(ex, w, r); }
// make load lighter by factor (0.85 = 15% lighter), handles assisted
function lighten(ex, w, factor) {
  if (ex.assisted) { const bw = latestBW(); return round05(Math.max(0, bw - (bw - w) * factor)); }
  return round05(w * factor);
}
function heavier(ex, w) { return ex.assisted ? round05(Math.max(0, w - ex.inc)) : round05(w + ex.inc); }

// match history by exercise NAME (so the same lift in two workouts shares history)
function exHistory(name) {
  const out = [];
  for (const s of S.sessions) for (const e of s.exercises) if (e.name === name && e.sets.some(x => x.r > 0)) out.push({ s, e });
  return out.sort((a, b) => a.s.startedAt - b.s.startedAt);
}
function lastPerformance(name, beforeTs = Infinity) {
  const h = exHistory(name).filter(x => x.s.startedAt < beforeTs && x.s.mode !== 'deload');
  return h.length ? h[h.length - 1] : null;
}
function bestScore(ex, name, beforeTs) {
  let best = null;
  for (const { s, e } of exHistory(name)) {
    if (s.startedAt >= beforeTs) continue;
    for (const x of e.sets) if (x.r > 0) { const sc = score(ex, x.w, x.r); if (best === null || sc > best) best = sc; }
  }
  return best;
}
/* Plan the sets + targets for an exercise in a session.
   mode: normal | rampup | deload ; trim: readiness trim accepted */
function planExercise(ex, mode, trim) {
  let sets = ex.sets;
  if (mode === 'rampup' || mode === 'deload') sets = Math.ceil(sets / 2);
  if (trim) sets = Math.max(1, sets - 1);
  const last = lastPerformance(ex.name);
  const lastSets = last ? last.e.sets.filter(x => x.r > 0) : [];
  const allTop = lastSets.length > 0 && lastSets.every(x => x.r >= ex.repMax);
  const rows = [];
  for (let i = 0; i < sets; i++) {
    const ls = lastSets[i] || lastSets[lastSets.length - 1] || null;
    let target = null, why = '';
    if (ls) {
      if (mode === 'deload') { target = { w: lighten(ex, ls.w, 0.85), r: Math.min(ls.r, ex.repMax) }; why = 'deload −15%'; }
      else if (allTop) { target = { w: heavier(ex, ls.w), r: ex.repMin }; why = 'top of range hit → add weight'; }
      else { target = { w: ls.w, r: Math.min(ls.r + 1, ex.repMax) }; why = ls.r >= ex.repMax ? 'hold, bring other sets up' : '+1 rep'; }
      if (trim && mode !== 'deload') { target = { w: lighten(ex, target.w, 0.9), r: target.r }; why += ' · −10% today'; }
    }
    rows.push({ last: ls ? { w: ls.w, r: ls.r } : null, target, why });
  }
  return rows;
}
// beat | match | below vs target
function judge(ex, set, target) {
  if (!target) return null;
  const W = v => ex.assisted ? -v : v; // lower assistance = heavier
  const w = W(set.w), tw = W(target.w);
  if (set.w === target.w && set.r === target.r) return 'match';
  if (w >= tw && set.r >= target.r) return 'beat';
  if (w <= tw && set.r <= target.r) return 'below';
  const a = score(ex, set.w, set.r), b = score(ex, target.w, target.r);
  if (Math.abs(a - b) / Math.max(b, 1) < 0.005) return 'match';
  return a > b ? 'beat' : 'below';
}
function sessionVolume(s) {
  let v = 0; for (const e of s.exercises) for (const x of e.sets) if (x.r > 0) v += (x.w || 0) * x.r; return v;
}
function completedSessions() { return S.sessions.filter(s => s.exercises.some(e => e.sets.some(x => x.r > 0))); }
function prList() {
  const best = {};
  for (const s of [...S.sessions].sort((a, b) => a.startedAt - b.startedAt))
    for (const e of s.exercises) for (const x of e.sets) if (x.pr) best[e.name] = { w: x.w, r: x.r, date: s.date };
  return Object.entries(best).map(([name, v]) => ({ name, ...v })).sort((a, b) => a.date < b.date ? 1 : -1);
}

/* ---------- readiness ---------- */
function readinessLow(r) {
  if (!r) return false;
  const v = [r.sleep, r.soreness, r.energy];
  if (v.some(x => x == null)) return false;
  return v.reduce((a, b) => a + b, 0) <= 12 || v.some(x => x === 1);
}

/* ---------- schedule, streaks, heatmap ---------- */
function isPaused(date) { return S.pauses.some(p => date >= p.start && date <= p.end); }
function isScheduled(date) { return S.settings.trainingDays.includes(dow(date)); }
function trainedDates() {
  const set = new Set(); for (const s of completedSessions()) set.add(s.date); return set;
}
// status per date: trained | missed | rest | paused | today | future | before
function dayStatus(date, trained, today) {
  if (date < S.settings.startDate) return trained.has(date) ? 'trained' : 'before';
  if (trained.has(date)) return 'trained';
  if (date > today) return isPaused(date) ? 'paused' : 'future';
  if (isPaused(date)) return 'paused';
  if (!isScheduled(date)) return 'rest';
  if (date === today) return 'today';
  return 'missed';
}
function streaks() {
  const today = ymd(), trained = trainedDates();
  let cur = 0, longest = 0, run = 0;
  let wkCur = 0, wkLongest = 0, wkRun = 0;
  const start = S.settings.startDate;
  // session streak: forward pass over scheduled, non-paused days
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const st = dayStatus(d, trained, today);
    if (st === 'trained' && isScheduled(d)) { run++; longest = Math.max(longest, run); }
    else if (st === 'missed') run = 0;
  }
  cur = run;
  // perfect weeks
  for (let w = weekStart(start); w <= today; w = addDays(w, 7)) {
    let need = 0, done = 0, missed = false, complete = true;
    for (let i = 0; i < 7; i++) {
      const d = addDays(w, i);
      if (d < start || !isScheduled(d) || isPaused(d)) continue;
      need++;
      if (trained.has(d)) done++;
      else if (d < today) missed = true;
      else complete = false;
    }
    if (need === 0) continue;           // fully paused week: frozen
    if (missed) wkRun = 0;
    else if (done === need) { wkRun++; wkLongest = Math.max(wkLongest, wkRun); }
    // else: week in progress and nothing missed yet → doesn't break
  }
  wkCur = wkRun;
  return { cur, longest, wkCur, wkLongest };
}

/* ---------- nutrition ---------- */
// food: {per100:{kcal,p,c,f}|null, perServing:{...}|null, servingG|null}
function normalizeFood(f) {
  const scale = (o, k) => o ? { kcal: r1(o.kcal * k), p: r1(o.p * k), c: o.c == null ? null : r1(o.c * k), f: o.f == null ? null : r1(o.f * k) } : null;
  if (f.servingG > 0) {
    if (f.perServing && !f.per100) f.per100 = scale(f.perServing, 100 / f.servingG);
    else if (f.per100 && !f.perServing) f.perServing = scale(f.per100, f.servingG / 100);
  }
  return f;
}
function nutrientsFor(food, amount, unit) {
  const base = unit === 'g' ? food.per100 : food.perServing;
  const k = unit === 'g' ? amount / 100 : amount;
  if (!base) return null;
  return { kcal: r1(base.kcal * k), p: r1(base.p * k), c: base.c == null ? null : r1(base.c * k), f: base.f == null ? null : r1(base.f * k) };
}
function dayTotals(date) {
  const t = { kcal: 0, p: 0, c: 0, f: 0, n: 0 };
  for (const x of S.foodLog) if (x.date === date) { t.kcal += x.kcal || 0; t.p += x.p || 0; t.c += x.c || 0; t.f += x.f || 0; t.n++; }
  for (const k of ['kcal', 'p', 'c', 'f']) t[k] = r1(t[k]);
  return t;
}
// up to 5 library foods whose protein per serving best fits what's left
function proteinSuggestions(remaining) {
  if (remaining <= 0) return [];
  return S.foods.map(f => {
    const pps = f.perServing ? f.perServing.p : null;
    const p100 = f.per100 ? f.per100.p : null;
    if (!(pps > 0) && !(p100 > 0)) return null;
    const fit = pps > 0 ? Math.abs(pps - remaining) : Math.abs((f.servingG ? p100 * f.servingG / 100 : 100) - remaining) + 1000;
    return {
      food: f, pps, fit,
      grams: p100 > 0 ? Math.round(remaining / p100 * 100) : null,
      servings: pps > 0 ? r1(remaining / pps) : null,
    };
  }).filter(Boolean).sort((a, b) => a.fit - b.fit).slice(0, 5);
}

/* ---------- body ---------- */
function weeklyAverages() {
  const by = {};
  for (const w of S.body.weighins) { const k = weekStart(w.date); (by[k] = by[k] || []).push(w.kg); }
  return Object.entries(by).map(([wk, a]) => ({ week: wk, avg: r1(a.reduce((x, y) => x + y, 0) / a.length), n: a.length }))
    .sort((a, b) => a.week < b.week ? -1 : 1);
}

/* ---------- export ---------- */
function csvCell(v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function toCSV(rows) { return rows.map(r => r.map(csvCell).join(',')).join('\n'); }
function workoutsCSV() {
  const rows = [['date', 'workout', 'mode', 'duration_min', 'exercise', 'set', 'weight_kg', 'reps', 'rir', 'target_kg', 'target_reps', 'result', 'pr', 'session_notes']];
  for (const s of [...S.sessions].sort((a, b) => a.startedAt - b.startedAt))
    for (const e of s.exercises) e.sets.forEach((x, i) => {
      if (!(x.r > 0)) return;
      rows.push([s.date, s.workoutName, s.mode, s.durationSec ? r1(s.durationSec / 60) : '', e.name, i + 1, x.w, x.r, x.rir ?? '', x.target?.w ?? '', x.target?.r ?? '', x.result || '', x.pr ? 'PR' : '', s.notes || '']);
    });
  return toCSV(rows);
}
function foodCSV() {
  const rows = [['date', 'food', 'amount', 'unit', 'kcal', 'protein_g', 'carbs_g', 'fat_g']];
  for (const x of [...S.foodLog].sort((a, b) => a.date < b.date ? -1 : 1)) rows.push([x.date, x.name, x.amount, x.unit, x.kcal, x.p, x.c ?? '', x.f ?? '']);
  return toCSV(rows);
}
