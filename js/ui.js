/* Gym Tracker — UI: views, actions, timers. */
'use strict';

const UI = { tab: 'train', more: null, editWorkout: null, foodDate: ymd(), lift: null, muscleWeek: 0, modalStack: [], updateReady: null, wake: null, restAlerted: false };
const $ = (sel, root = document) => root.querySelector(sel);
const app = () => $('#app');

/* ---------- helpers ---------- */
function exOf(ae) { return findEx(ae.exId) || ae; } // ad-hoc session exercises carry their own fields
function fmtW(ex, w) {
  if (ex && ex.bodyweight && !w) return 'BW';
  return ex && ex.assisted ? `${w} kg assist` : `${w} kg`;
}
function fmtSet(ex, s) { return s ? `${fmtW(ex, s.w)} × ${s.r}` : '—'; }
function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
}
function modal(html) {
  const m = $('#modal'); m.innerHTML = `<div class="sheet">${html}</div>`; m.classList.add('open');
  const f = m.querySelector('input:not([type=checkbox]):not([type=hidden])'); if (f && f.dataset.autofocus !== undefined) f.focus();
}
function closeModal() { const m = $('#modal'); m.classList.remove('open'); m.innerHTML = ''; }
function confirmBox(text, yesLabel, onYes, danger = true) {
  UI._confirm = onYes;
  modal(`<h3>${esc(text)}</h3><div class="row gap"><button class="btn" data-a="closeModal">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-a="confirmYes">${esc(yesLabel)}</button></div>`);
}
function bar(v, max, cls = '') { const p = clamp(max ? v / max * 100 : 0, 0, 100); return `<div class="pbar ${cls}"><i style="width:${p}%"></i></div>`; }
function banner(cls, html) { return `<div class="banner ${cls}">${html}</div>`; }

/* ---------- audio + flash (iOS: no vibration; audio needs a prior tap) ---------- */
let AC = null;
function unlockAudio() {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    // silent blip to fully unlock on iOS
    const o = AC.createOscillator(), g = AC.createGain(); g.gain.value = 0.0001; o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + 0.02);
  } catch (e) {}
}
function beep(times = 3) {
  if (!S.settings.sound || !AC) return;
  try {
    for (let i = 0; i < times; i++) {
      const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + i * 0.35;
      o.frequency.value = 880; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + 0.3);
    }
  } catch (e) {}
}
function flash() { document.body.classList.remove('flash'); void document.body.offsetWidth; document.body.classList.add('flash'); }

/* ---------- wake lock ---------- */
async function wakeOn() {
  if (!S.active) return;
  try {
    if ('wakeLock' in navigator && (!UI.wake || UI.wake.released)) {
      UI.wake = await navigator.wakeLock.request('screen');
      UI.wake.addEventListener?.('release', () => updateWakeBadge());
    }
  } catch (e) { UI.wake = null; }
  updateWakeBadge();
}
function wakeOff() { try { UI.wake && UI.wake.release(); } catch (e) {} UI.wake = null; }
function updateWakeBadge() {
  const el = $('#wakeBadge'); if (!el) return;
  const on = UI.wake && !UI.wake.released;
  el.textContent = on ? '☀ screen stays on' : ('wakeLock' in navigator ? 'screen may lock' : 'screen may lock (timers stay correct)');
  el.className = 'tiny ' + (on ? 'ok' : 'muted');
}

/* ---------- rendering ---------- */
function render() {
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === UI.tab));
  let h = '';
  if (UI.tab === 'train') h = S.active ? viewSession() : viewTrainHome();
  else if (UI.tab === 'stats') h = viewStats();
  else if (UI.tab === 'food') h = viewFood();
  else if (UI.tab === 'body') h = viewBody();
  else h = viewMore();
  app().innerHTML = h;
  renderRestBar();
  tick();
  if (UI.tab === 'stats') { const hm = $('.heatwrap'); if (hm) hm.scrollLeft = hm.scrollWidth; }
}

function globalBanners() {
  let h = '';
  if (UI.updateReady) h += banner('info', `New version ready. <button class="btn sm primary" data-a="applyUpdate">Reload</button>`);
  const hasData = S.sessions.length || S.foodLog.length || S.body.weighins.length;
  const last = S.settings.lastBackupAt;
  if (hasData && (!last || Date.now() - last > 7 * 86400000))
    h += banner('warn', `💾 ${last ? `Last backup ${Math.floor((Date.now() - last) / 86400000)} days ago.` : 'You have never backed up.'} iPhone offline data can be lost. <button class="btn sm primary" data-a="exportJSON">Back up now</button>`);
  return h;
}

/* ===== TRAIN: home ===== */
function currentMode() { return S.deload.activeUntil ? 'deload' : S.settings.phase; }
function modeLabel(m) { return { normal: 'Normal', rampup: 'Ramp-up (½ sets)', deload: 'Deload (½ sets, −15%)' }[m] || m; }
function viewTrainHome() {
  const today = ymd(), d = dow(today);
  let h = globalBanners();
  if (S.deload.activeUntil) h += banner('deload', `🧘 Deload week until ${fmtDate(S.deload.activeUntil)} — half sets, ~15% lighter.`);
  if (isPaused(today)) h += banner('info', `⏸ Pause mode is on — your streak is frozen, not broken.`);
  // readiness low 2 sessions in a row → early deload suggestion
  const withR = completedSessions().filter(s => s.readiness).sort((a, b) => b.startedAt - a.startedAt);
  if (!S.deload.activeUntil && withR.length >= 2 && readinessLow(withR[0].readiness) && readinessLow(withR[1].readiness) && S.deload.dismissedLowKey !== withR[0].id)
    h += banner('warn', `😴 Readiness was low two sessions in a row. Consider an early deload.<div class="row gap mt"><button class="btn sm primary" data-a="deloadNow">Deload now</button><button class="btn sm" data-a="dismissLow" data-id="${withR[0].id}">Dismiss</button></div>`);
  if (S.settings.weighDays.includes(d) && !S.body.weighins.some(w => w.date === today))
    h += banner('info', `⚖️ Weigh-in morning. <button class="btn sm" data-a="tab" data-tab="body">Log weight</button>`);

  const todays = S.program.filter(w => w.day === d);
  const sched = isScheduled(today);
  const doneToday = completedSessions().some(s => s.date === today);
  h += `<div class="card"><div class="row between"><h2>${fmtDate(today)}</h2><span class="chip ${currentMode()}">${modeLabel(currentMode())}</span></div>`;
  if (doneToday) h += `<p class="ok">✅ Trained today. Nice.</p>`;
  else if (!sched) h += `<p class="muted">Rest day — your streak is safe.</p>`;
  if (todays.length) h += todays.map(w => `<button class="btn big primary block" data-a="startWorkout" data-id="${w.id}">▶ Start ${esc(w.name)}</button>`).join('');
  h += `<details class="mt"><summary>Start a different workout</summary>${S.program.map(w => `<button class="btn block" data-a="startWorkout" data-id="${w.id}">${esc(w.name)} <span class="muted">${w.day != null ? DAY_NAMES[w.day] : ''}</span></button>`).join('')}</details></div>`;

  // deload checklist
  h += `<div class="card"><div class="row between"><h3>Deload checklist</h3><button class="btn sm" data-a="deloadNow">Deload now</button></div>
    <div class="weeks">${S.deload.weeks.map((on, i) => `<button class="wk ${on ? 'on' : ''}" data-a="toggleWeek" data-i="${i}">W${i + 1}${on ? ' ✓' : ''}</button>`).join('')}</div>
    <p class="tiny muted">Tick each week when it's done. Ticking W6 triggers a deload week next time you open the app.</p></div>`;

  // recent
  const recent = [...S.sessions].sort((a, b) => b.startedAt - a.startedAt).slice(0, 6);
  h += `<div class="card"><h3>Recent sessions</h3>${recent.length ? recent.map(s => `<button class="li" data-a="showSession" data-id="${s.id}"><b>${esc(s.workoutName)}</b><span class="muted">${fmtDate(s.date)} · ${fmtDur(s.durationSec || 0)}${s.exercises.some(e => e.sets.some(x => x.pr)) ? ' · 🏆' : ''}</span></button>`).join('') : '<p class="muted">No sessions yet.</p>'}</div>`;
  return h;
}

/* ===== TRAIN: readiness + start ===== */
function startFlow(workoutId) {
  UI.pending = { workoutId, r: { sleep: null, soreness: null, energy: null } };
  readinessModal();
}
function readinessModal() {
  const r = UI.pending.r;
  const row = (k, label, lo, hi) => `<div class="rq"><div class="row between"><b>${label}</b><span class="tiny muted">1 ${lo} · 5 ${hi}</span></div><div class="rate">${[1, 2, 3, 4, 5].map(n => `<button class="${r[k] === n ? 'on' : ''}" data-a="rate" data-k="${k}" data-n="${n}">${n}</button>`).join('')}</div></div>`;
  modal(`<h3>Readiness check</h3>
    ${row('sleep', 'Sleep', 'awful', 'great')}${row('soreness', 'Soreness', 'very sore', 'fresh')}${row('energy', 'Energy', 'drained', 'high')}
    <div class="row gap mt"><button class="btn" data-a="readySkip">Skip</button><button class="btn primary" data-a="readyGo">Continue</button></div>`);
}
function beginSession(readiness, trim) {
  const w = S.program.find(x => x.id === UI.pending.workoutId);
  const mode = currentMode();
  S.active = {
    id: uid(), workoutId: w.id, workoutName: w.name, date: ymd(), createdAt: Date.now(), startedAt: null,
    mode, readiness, trim: !!trim, notes: '', drafts: {}, restEndsAt: null, restTotal: 0,
    exercises: w.exercises.map(ex => {
      const plan = planExercise(ex, mode, trim);
      return { exId: ex.id, name: ex.name, rest: ex.rest, repMin: ex.repMin, repMax: ex.repMax, muscles: [...ex.muscles], assisted: ex.assisted, bodyweight: ex.bodyweight, inc: ex.inc, plan, sets: plan.map(() => null) };
    }),
  };
  UI.pending = null;
  save(true); closeModal(); UI.tab = 'train'; render(); wakeOn();
}

/* ===== TRAIN: active session ===== */
function viewSession() {
  const a = S.active;
  let h = `<div class="sticky sesshead"><div class="row between"><div><b>${esc(a.workoutName)}</b> <span class="chip ${a.mode}">${modeLabel(a.mode)}</span>${a.trim ? ' <span class="chip warn">trimmed −1 set, −10%</span>' : ''}</div>
    <button class="btn sm primary" data-a="finish">Finish</button></div>
    <div class="row between mt"><div class="sesstime"><span id="sessTime">0:00</span>${a.startedAt ? '' : ' <button class="btn sm" data-a="startTimer">Start timer</button>'}</div><span id="wakeBadge" class="tiny muted"></span></div></div>`;
  a.exercises.forEach((ae, ei) => {
    const ex = exOf(ae);
    const cues = (findEx(ae.exId) || {}).cues || [];
    const notes = (findEx(ae.exId) || {}).notes || '';
    h += `<div class="card ex"><div class="row between"><h3>${esc(ae.name)}</h3><span class="tiny muted">${ae.repMin}${ae.repMax !== ae.repMin ? '–' + ae.repMax : ''} reps · rest ${ae.rest}s</span></div>`;
    if (cues.length) h += `<details class="how"><summary>How</summary><ul>${cues.map(c => `<li>${esc(c)}</li>`).join('')}</ul></details>`;
    if (notes) h += `<p class="tiny muted">${esc(notes)}</p>`;
    if (!ae.plan.some(p => p.last)) h += `<p class="tiny muted">First time: pick a weight you could do for about ${ae.repMax + 2} reps.</p>`;
    ae.plan.forEach((p, si) => {
      const s = ae.sets[si], dk = `${ei}-${si}`, d = a.drafts[dk] || {};
      const wVal = d.w ?? (s ? s.w : (p.target ? p.target.w : (p.last ? p.last.w : '')));
      const rVal = d.r ?? (s ? s.r : '');
      const rirVal = d.rir ?? (s && s.rir != null ? s.rir : '');
      const tgt = p.target ? `target <b>${fmtSet(ex, p.target)}</b>` : '';
      const last = p.last ? `last ${fmtSet(ex, p.last)}` : 'no history';
      h += `<div class="set ${s ? s.result || 'logged' : ''}" data-ei="${ei}" data-si="${si}">
        <div class="setinfo"><span class="sn">Set ${si + 1}</span> <span class="muted">${last}</span>${tgt ? ` → ${tgt}` : ''}${s && s.pr ? ' <span class="pr">🏆 PR</span>' : ''}${s ? ` <span class="res">${{ beat: 'beat ↑', match: 'matched', below: 'below' }[s.result] || 'logged'}</span>` : ''}</div>
        <div class="setin">
          <label><input class="in" inputmode="decimal" data-f="w" value="${esc(wVal)}" placeholder="kg"><span>kg</span></label>
          <label><input class="in" inputmode="numeric" data-f="r" value="${esc(rVal)}" placeholder="${p.target ? p.target.r : 'reps'}"><span>reps</span></label>
          <label class="rir"><input class="in" inputmode="numeric" data-f="rir" value="${esc(rirVal)}" placeholder="–"><span>RIR</span></label>
          <button class="btn log ${s ? 'done' : 'primary'}" data-a="logSet" data-ei="${ei}" data-si="${si}">${s ? '↻' : '✓'}</button>
        </div></div>`;
    });
    h += `<div class="row gap"><button class="btn sm" data-a="addSet" data-ei="${ei}">+ set</button>${ae.plan.length > 1 && !ae.sets[ae.sets.length - 1] ? `<button class="btn sm" data-a="removeSet" data-ei="${ei}">− set</button>` : ''}</div></div>`;
  });
  h += `<div class="card"><button class="btn block" data-a="addSessionEx">+ Add exercise to this session</button>
    <h3 class="mt">Session notes</h3><textarea id="sessNotes" rows="3" placeholder="How did it feel? Machine settings?">${esc(a.notes)}</textarea></div>
    <div class="card"><button class="btn big primary block" data-a="finish">Finish workout</button><button class="btn block danger mt" data-a="discard">Discard session</button></div>`;
  return h;
}
function renderRestBar() {
  const rb = $('#restbar'), a = S.active;
  if (!a || !a.restEndsAt || UI.tab !== 'train') { rb.classList.remove('show'); return; }
  rb.classList.add('show');
  rb.innerHTML = `<div class="rest-t"><span class="tiny muted">REST</span> <span id="restTime">0:00</span></div>
    <div class="row gap"><button class="btn" data-a="rest" data-d="-15">−15</button><button class="btn" data-a="rest" data-d="15">+15</button><button class="btn" data-a="restSkip">Skip</button></div>
    <div class="restprog"><i id="restProg"></i></div>`;
}
function tick() {
  const a = S.active; if (!a) return;
  const now = Date.now();
  const st = $('#sessTime'); if (st) st.textContent = a.startedAt ? fmtDur((now - a.startedAt) / 1000) : '0:00';
  if (a.restEndsAt) {
    const left = (a.restEndsAt - now) / 1000;
    const rt = $('#restTime'), rp = $('#restProg');
    if (rt) rt.textContent = left > 0 ? fmtDur(Math.ceil(left)) : 'GO!';
    if (rp) rp.style.width = clamp(100 - left / a.restTotal * 100, 0, 100) + '%';
    if (left <= 0 && !UI.restAlerted) {
      UI.restAlerted = true; flash(); beep(3); $('#restbar')?.classList.add('done');
      // keep "GO!" visible briefly, then hide
      setTimeout(() => { if (S.active && S.active.restEndsAt && Date.now() >= S.active.restEndsAt) { S.active.restEndsAt = null; save(); renderRestBar(); $('#restbar')?.classList.remove('done'); } }, 6000);
    }
  }
}
function readRow(ei, si) {
  const row = document.querySelector(`.set[data-ei="${ei}"][data-si="${si}"]`);
  const g = f => row.querySelector(`[data-f="${f}"]`).value.trim();
  return { w: num(g('w')), r: num(g('r')), rir: g('rir') === '' ? null : num(g('rir')) };
}
function logSet(ei, si) {
  const a = S.active, ae = a.exercises[ei], ex = exOf(ae), p = ae.plan[si];
  const v = readRow(ei, si);
  if (!(v.r > 0)) { toast('Enter reps first'); return; }
  const w = v.w == null ? 0 : v.w;
  const set = { w, r: Math.round(v.r), rir: v.rir, target: p.target, t: Date.now() };
  set.result = judge(ex, set, p.target);
  // PR: beats all previous sessions AND earlier sets this session
  let best = bestScore(ex, ae.name, a.createdAt);
  ae.sets.forEach((x, i) => { if (x && i !== si) { const sc = score(ex, x.w, x.r); if (best === null || sc > best) best = sc; } });
  set.pr = best !== null && score(ex, w, set.r) > best + 1e-9 && a.mode !== 'deload';
  ae.sets[si] = set;
  delete a.drafts[`${ei}-${si}`];
  const now = Date.now();
  if (!a.startedAt) a.startedAt = now;
  a.restTotal = ae.rest; a.restEndsAt = now + ae.rest * 1000; UI.restAlerted = false;
  save(true);
  render();
  if (set.pr) toast('🏆 New PR!');
}
function finishSession() {
  const a = S.active, now = Date.now();
  a.notes = $('#sessNotes')?.value ?? a.notes;
  const sess = {
    id: a.id, workoutId: a.workoutId, workoutName: a.workoutName, date: a.startedAt ? ymd(new Date(a.startedAt)) : a.date,
    startedAt: a.startedAt || a.createdAt, endedAt: now, durationSec: a.startedAt ? Math.round((now - a.startedAt) / 1000) : 0,
    mode: a.mode, readiness: a.readiness, trim: a.trim, notes: a.notes,
    exercises: a.exercises.map(ae => ({ exId: ae.exId, name: ae.name, muscles: ae.muscles, sets: ae.sets.filter(Boolean) })).filter(e => e.sets.length),
  };
  if (!sess.exercises.length) { toast('No sets logged — use Discard instead'); return; }
  S.sessions.push(sess); S.active = null; wakeOff(); save(true); closeModal(); render();
  const prs = sess.exercises.reduce((n, e) => n + e.sets.filter(x => x.pr).length, 0);
  toast(`Saved · ${fmtDur(sess.durationSec)}${prs ? ` · ${prs} PR${prs > 1 ? 's' : ''} 🏆` : ''}`, 3500);
}
function sessionDetail(id) {
  const s = S.sessions.find(x => x.id === id); if (!s) return;
  const r = s.readiness ? `Readiness ${s.readiness.sleep}/${s.readiness.soreness}/${s.readiness.energy}` : 'Readiness skipped';
  modal(`<h3>${esc(s.workoutName)}</h3><p class="muted">${fmtDate(s.date)} · ${fmtDur(s.durationSec || 0)} · ${modeLabel(s.mode)} · ${r}</p>
    ${s.exercises.map(e => `<div class="mt"><b>${esc(e.name)}</b><div class="tiny">${e.sets.map(x => `<span class="pill ${x.result || ''}">${x.w}×${x.r}${x.rir != null ? ` @${x.rir}` : ''}${x.pr ? ' 🏆' : ''}</span>`).join(' ')}</div></div>`).join('')}
    ${s.notes ? `<p class="mt">${esc(s.notes)}</p>` : ''}
    <div class="row gap mt"><button class="btn danger" data-a="deleteSession" data-id="${s.id}">Delete</button><button class="btn primary" data-a="closeModal">Close</button></div>`);
}

/* ===== STATS ===== */
function heatmap() {
  const today = ymd(), trained = trainedDates();
  const start = addDays(weekStart(today), -52 * 7);
  let cells = '';
  for (let d = start; d <= addDays(weekStart(today), 6); d = addDays(d, 1)) {
    const st = dayStatus(d, trained, today);
    cells += `<i class="hm ${st}" data-a="hmTap" data-d="${d}" data-s="${st}"></i>`;
  }
  return `<div class="heatwrap"><div class="heat">${cells}</div></div>
    <div class="legend"><span><i class="hm trained"></i>trained</span><span><i class="hm missed"></i>missed</span><span><i class="hm rest"></i>rest</span><span><i class="hm paused"></i>paused</span></div>`;
}
function weekMuscleSets(ws) {
  const out = Object.fromEntries(MUSCLES.map(m => [m, 0])), we = addDays(ws, 6);
  for (const s of completedSessions()) if (s.date >= ws && s.date <= we)
    for (const e of s.exercises) {
      const mus = e.muscles || (findEx(e.exId) || {}).muscles || [];
      const n = e.sets.filter(x => x.r > 0).length;
      for (const m of mus) if (m in out) out[m] += n;
    }
  return out;
}
function viewStats() {
  const st = streaks(), today = ymd();
  let h = `<div class="tiles">
    <div class="tile"><b>${st.cur}</b><span>session streak</span><em>best ${st.longest}</em></div>
    <div class="tile"><b>${st.wkCur}</b><span>perfect weeks</span><em>best ${st.wkLongest}</em></div></div>`;
  h += `<div class="card"><h3>Year</h3>${heatmap()}</div>`;
  // pauses
  h += `<div class="card"><div class="row between"><h3>Pause mode</h3><button class="btn sm" data-a="addPause">+ Pause</button></div>
    ${S.pauses.length ? S.pauses.map(p => `<div class="row between li2"><span>${esc(p.label || 'Pause')}: ${fmtShort(p.start)} → ${fmtShort(p.end)}${today >= p.start && today <= p.end ? ' <span class="chip">active</span>' : ''}</span><span><button class="btn sm" data-a="editPause" data-id="${p.id}">Edit</button></span></div>`).join('') : '<p class="muted">No pauses.</p>'}
    <p class="tiny muted">Paused days freeze your streaks instead of breaking them.</p></div>`;
  // sessions per week
  const ws0 = weekStart(today), weeks = [];
  for (let i = 7; i >= 0; i--) { const ws = addDays(ws0, -7 * i); weeks.push({ label: `${parseYmd(ws).getDate()}/${parseYmd(ws).getMonth() + 1}`, v: completedSessions().filter(s => s.date >= ws && s.date <= addDays(ws, 6)).length }); }
  h += `<div class="card"><h3>Sessions per week</h3>${Charts.bars(weeks, { target: S.settings.trainingDays.length })}</div>`;
  // muscle sets
  const mws = addDays(ws0, -7 * UI.muscleWeek), ms = weekMuscleSets(mws);
  h += `<div class="card"><div class="row between"><h3>Hard sets / muscle</h3><div class="seg"><button class="${UI.muscleWeek === 0 ? 'on' : ''}" data-a="mweek" data-w="0">This</button><button class="${UI.muscleWeek === 1 ? 'on' : ''}" data-a="mweek" data-w="1">Last</button></div></div>
    ${MUSCLES.map(m => { const t = S.settings.muscleTargets[m] || 10, v = ms[m]; return `<div class="mrow"><span>${m}</span>${bar(v, t, v >= t ? 'good' : '')}<b>${v}/${t}</b></div>`; }).join('')}</div>`;
  // e1RM trend
  const names = [...new Set(S.sessions.flatMap(s => s.exercises.map(e => e.name)))];
  const mains = S.program.flatMap(w => w.exercises).filter(e => e.main).map(e => e.name);
  const opts = [...new Set([...mains.filter(n => names.includes(n)), ...names])];
  if (!UI.lift || !opts.includes(UI.lift)) UI.lift = opts[0] || null;
  if (UI.lift) {
    const ex = S.program.flatMap(w => w.exercises).find(e => e.name === UI.lift) || {};
    const pts = exHistory(UI.lift).map(({ s, e }) => ({ x: s.startedAt / 86400000, y: r1(Math.max(...e.sets.filter(x => x.r > 0).map(x => score(ex, x.w, x.r)))) }));
    const bw = ex.bodyweight;
    h += `<div class="card"><h3>${bw ? 'Best reps' : 'Estimated 1RM'} trend</h3><select id="liftSel">${opts.map(n => `<option ${n === UI.lift ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      ${Charts.line([{ name: UI.lift, color: 'var(--acc)', points: pts }], { xLabel: x => fmtShort(ymd(new Date(x * 86400000))) })}
      <p class="tiny muted">${ex.assisted ? 'Assisted: uses bodyweight − assistance. ' : ''}Epley: kg × (1 + reps/30).</p></div>`;
  } else h += `<div class="card"><h3>Estimated 1RM trend</h3><p class="muted">Log a session to see trends.</p></div>`;
  // PRs
  const prs = prList();
  h += `<div class="card"><h3>PRs</h3>${prs.length ? prs.slice(0, 20).map(p => `<div class="row between li2"><span>🏆 ${esc(p.name)}</span><span class="muted">${p.w} kg × ${p.r} · ${fmtShort(p.date)}</span></div>`).join('') : '<p class="muted">PRs appear here automatically.</p>'}</div>`;
  // totals
  const cs = completedSessions(), recent = [...cs].sort((a, b) => b.startedAt - a.startedAt).slice(0, 10).filter(s => s.durationSec > 0);
  const wkVol = cs.filter(s => s.date >= ws0).reduce((a, s) => a + sessionVolume(s), 0), allVol = cs.reduce((a, s) => a + sessionVolume(s), 0);
  const avgLen = recent.length ? recent.reduce((a, s) => a + s.durationSec, 0) / recent.length : 0;
  h += `<div class="tiles"><div class="tile"><b>${Math.round(wkVol).toLocaleString()}</b><span>kg volume this week</span><em>all-time ${Math.round(allVol).toLocaleString()}</em></div>
    <div class="tile"><b>${avgLen ? fmtDur(avgLen) : '—'}</b><span>avg session</span><em>${cs.length} sessions total</em></div></div>`;
  // readiness history
  const rs = cs.filter(s => s.readiness).sort((a, b) => a.startedAt - b.startedAt).map(s => ({ x: s.startedAt / 86400000, y: s.readiness.sleep + s.readiness.soreness + s.readiness.energy }));
  h += `<div class="card"><h3>Readiness (3–15)</h3>${Charts.line([{ name: 'readiness', color: '#7aa2ff', points: rs }], { yMin: 3, yMax: 15, refLine: { y: 12, color: '#ff6b6b' }, xLabel: x => fmtShort(ymd(new Date(x * 86400000))), yFmt: Math.round })}<p class="tiny muted">Dashed line = "low" threshold (12 or less).</p></div>`;
  return h;
}

/* ===== FOOD ===== */
function viewFood() {
  const d = UI.foodDate, t = dayTotals(d), st = S.settings, left = r1(st.proteinTarget - t.p);
  let h = '';
  // WHAT'S LEFT — top of screen
  if (left <= 0) h += `<div class="card left done"><div class="big">✅ Protein reached</div><div class="muted">${t.p} / ${st.proteinTarget} g</div></div>`;
  else {
    const sug = proteinSuggestions(left);
    h += `<div class="card left"><div class="big"><b>${left} g</b> protein left</div>
      ${S.foods.length ? (sug.length ? sug.map(s => `<button class="li" data-a="logSuggest" data-id="${s.food.id}" data-g="${s.grams ?? ''}" data-s="${s.servings ?? ''}"><b>${esc(s.food.name)}</b><span class="muted">${s.grams != null ? `eat ${s.grams} g` : ''}${s.grams != null && s.servings != null ? ' · ' : ''}${s.servings != null ? `${s.servings} serving${s.servings === 1 ? '' : 's'}` : ''}${s.pps ? ` (${s.pps} g/serving)` : ''}</span></button>`).join('') : '<p class="tiny muted">No foods with protein in your library yet.</p>')
        : '<p class="tiny muted">Add foods to your library (below) and I\'ll suggest what closes the gap.</p>'}</div>`;
  }
  h += `<div class="card"><div class="row between"><button class="btn sm" data-a="fday" data-d="-1">‹</button><b>${d === ymd() ? 'Today' : fmtDate(d)}</b><button class="btn sm" data-a="fday" data-d="1" ${d >= ymd() ? 'disabled' : ''}>›</button></div>
    <div class="mrow"><span>kcal</span>${bar(t.kcal, st.kcalTarget, t.kcal > st.kcalTarget ? 'over' : '')}<b>${Math.round(t.kcal)}/${st.kcalTarget}</b></div>
    <div class="mrow"><span>protein</span>${bar(t.p, st.proteinTarget, t.p >= st.proteinTarget ? 'good' : '')}<b>${t.p}/${st.proteinTarget}</b></div>
    <p class="tiny muted">carbs ${t.c} g · fat ${t.f} g</p>
    <div class="grid3"><button class="btn primary" data-a="logFood">+ Log food</button><button class="btn" data-a="quickAdd">Quick add</button><button class="btn" data-a="copyYesterday">Copy yesterday</button></div></div>`;
  const entries = S.foodLog.filter(x => x.date === d).sort((a, b) => a.t - b.t);
  h += `<div class="card"><h3>Log</h3>${entries.length ? entries.map(x => `<button class="li" data-a="editEntry" data-id="${x.id}"><b>${esc(x.name)}</b><span class="muted">${x.amount ? `${x.amount}${x.unit === 'g' ? ' g' : ' serv'} · ` : ''}${Math.round(x.kcal)} kcal · ${x.p} g P</span></button>`).join('') : '<p class="muted">Nothing logged.</p>'}</div>`;
  // library
  const foods = [...S.foods].sort((a, b) => (b.fav - a.fav) || a.name.localeCompare(b.name));
  h += `<div class="card"><div class="row between"><h3>Food library</h3><button class="btn sm" data-a="newFood">+ New</button></div>
    ${foods.length ? foods.map(f => `<div class="row between li2"><span><button class="star ${f.fav ? 'on' : ''}" data-a="favFood" data-id="${f.id}">★</button> ${esc(f.name)}</span><span class="row gap"><span class="tiny muted">${foodSummary(f)}</span><button class="btn sm" data-a="editFood" data-id="${f.id}">Edit</button></span></div>`).join('') : '<p class="muted">Empty. Save the dishes you eat often.</p>'}</div>`;
  // dashboard
  h += foodDashboard();
  return h;
}
function foodSummary(f) {
  if (f.perServing) return `${Math.round(f.perServing.kcal)} kcal · ${f.perServing.p} P /serv${f.servingG ? ` (${f.servingG} g)` : ''}`;
  if (f.per100) return `${Math.round(f.per100.kcal)} kcal · ${f.per100.p} P /100 g`;
  return '';
}
function foodDashboard() {
  const st = S.settings, today = ymd(), days = [];
  for (let i = 29; i >= 0; i--) { const d = addDays(today, -i); days.push({ d, t: dayTotals(d) }); }
  const logged = days.filter(x => x.t.n > 0), hits = logged.filter(x => x.t.p >= st.proteinTarget).length;
  const bars = days.map(x => ({ label: x.d.slice(8), v: x.t.kcal, color: x.t.n === 0 ? '#333' : (x.t.p >= st.proteinTarget ? 'var(--good)' : 'var(--acc)') }));
  let wk = '';
  for (let i = 0; i < 4; i++) {
    const ws = addDays(weekStart(today), -7 * i), ld = [];
    for (let j = 0; j < 7; j++) { const d = addDays(ws, j); if (d > today) break; const t = dayTotals(d); if (t.n) ld.push(t); }
    const avg = k => ld.length ? Math.round(ld.reduce((a, t) => a + t[k], 0) / ld.length) : '—';
    wk += `<tr><td>${fmtShort(ws)}</td><td>${avg('kcal')}</td><td>${avg('p')}</td><td>${ld.length}</td></tr>`;
  }
  return `<div class="card"><h3>Last 30 days</h3>
    <div class="tiles"><div class="tile"><b>${logged.length ? Math.round(hits / logged.length * 100) : 0}%</b><span>protein hit-rate</span><em>${hits}/${logged.length} logged days</em></div></div>
    <p class="tiny muted">Calories per day vs target (green = protein hit)</p>${Charts.bars(bars, { target: st.kcalTarget })}
    <table class="tbl"><tr><th>Week of</th><th>kcal avg</th><th>P avg</th><th>days</th></tr>${wk}</table></div>`;
}
function foodForm(f) {
  f = f || { name: '', servingG: '', perServing: null, per100: null, fav: false };
  const base = f.perServing || f.per100 || {};
  const per = f.perServing ? 'serving' : (f.per100 ? '100g' : 'serving');
  modal(`<h3>${f.id ? 'Edit food' : 'New food'}</h3><form data-form="food"><input type="hidden" name="id" value="${f.id || ''}">
    <label class="fl">Name<input name="name" required value="${esc(f.name)}" data-autofocus></label>
    <label class="fl">Serving size (g) <span class="tiny muted">optional — enables both units</span><input name="servingG" inputmode="decimal" value="${esc(f.servingG || '')}"></label>
    <div class="seg mt"><label><input type="radio" name="per" value="serving" ${per === 'serving' ? 'checked' : ''}> per serving</label><label><input type="radio" name="per" value="100g" ${per === '100g' ? 'checked' : ''}> per 100 g</label></div>
    <div class="grid2"><label class="fl">kcal<input name="kcal" inputmode="decimal" required value="${esc(base.kcal ?? '')}"></label><label class="fl">Protein g<input name="p" inputmode="decimal" required value="${esc(base.p ?? '')}"></label>
    <label class="fl">Carbs g<input name="c" inputmode="decimal" value="${esc(base.c ?? '')}"></label><label class="fl">Fat g<input name="f" inputmode="decimal" value="${esc(base.f ?? '')}"></label></div>
    <label class="chk"><input type="checkbox" name="fav" ${f.fav ? 'checked' : ''}> Favourite</label>
    <div class="row gap mt">${f.id ? `<button type="button" class="btn danger" data-a="deleteFood" data-id="${f.id}">Delete</button>` : ''}<button type="button" class="btn" data-a="closeModal">Cancel</button><button class="btn primary">Save</button></div></form>`);
}
function logFoodPicker(filter = '') {
  const foods = [...S.foods].sort((a, b) => (b.fav - a.fav) || a.name.localeCompare(b.name)).filter(f => f.name.toLowerCase().includes(filter.toLowerCase()));
  modal(`<h3>Log food</h3><input id="foodSearch" placeholder="Search…" value="${esc(filter)}">
    <div class="list">${foods.map(f => `<button class="li" data-a="pickFood" data-id="${f.id}"><b>${f.fav ? '★ ' : ''}${esc(f.name)}</b><span class="muted">${foodSummary(f)}</span></button>`).join('') || '<p class="muted">No foods. Use "+ New" in the library or Quick add.</p>'}</div>
    <button class="btn block mt" data-a="closeModal">Close</button>`);
}
function amountModal(foodId, preset, entryId) {
  const f = S.foods.find(x => x.id === foodId);
  const units = [f.per100 && 'g', f.perServing && 'serv'].filter(Boolean);
  const unit = preset?.unit && units.includes(preset.unit) ? preset.unit : units[0];
  const amt = preset?.amount ?? (unit === 'g' ? (f.servingG || 100) : 1);
  UI.amt = { foodId, unit, entryId };
  modal(`<h3>${esc(f.name)}</h3><form data-form="amount">
    <div class="seg">${units.map(u => `<button type="button" class="${u === unit ? 'on' : ''}" data-a="amtUnit" data-u="${u}">${u === 'g' ? 'grams' : 'servings'}</button>`).join('')}</div>
    <label class="fl">Amount (${unit === 'g' ? 'g' : 'servings'})<input id="amtIn" name="amount" inputmode="decimal" value="${amt}" required></label>
    <p id="amtPrev" class="muted"></p>
    <div class="row gap mt">${entryId ? `<button type="button" class="btn danger" data-a="deleteEntry" data-id="${entryId}">Delete</button>` : ''}<button type="button" class="btn" data-a="closeModal">Cancel</button><button class="btn primary">${entryId ? 'Save' : 'Log'}</button></div></form>`);
  amtPreview();
}
function amtPreview() {
  const f = S.foods.find(x => x.id === UI.amt.foodId), a = num($('#amtIn')?.value), el = $('#amtPrev');
  if (!el) return;
  const n = a > 0 ? nutrientsFor(f, a, UI.amt.unit === 'g' ? 'g' : 'serv') : null;
  el.textContent = n ? `${Math.round(n.kcal)} kcal · ${n.p} g protein${n.c != null ? ` · ${n.c} C` : ''}${n.f != null ? ` · ${n.f} F` : ''}` : '';
}
function quickAddModal(entry) {
  const e = entry || {};
  modal(`<h3>${entry ? 'Edit entry' : 'Quick add'}</h3><form data-form="quick"><input type="hidden" name="id" value="${e.id || ''}">
    <label class="fl">Name<input name="name" value="${esc(e.name || '')}" placeholder="e.g. Shawarma"></label>
    <div class="grid2"><label class="fl">kcal<input name="kcal" inputmode="decimal" required value="${esc(e.kcal ?? '')}"></label><label class="fl">Protein g<input name="p" inputmode="decimal" required value="${esc(e.p ?? '')}"></label>
    <label class="fl">Carbs g<input name="c" inputmode="decimal" value="${esc(e.c ?? '')}"></label><label class="fl">Fat g<input name="f" inputmode="decimal" value="${esc(e.f ?? '')}"></label></div>
    ${entry ? '' : '<label class="chk"><input type="checkbox" name="save"> Also save to library (as 1 serving)</label>'}
    <div class="row gap mt">${entry ? `<button type="button" class="btn danger" data-a="deleteEntry" data-id="${e.id}">Delete</button>` : ''}<button type="button" class="btn" data-a="closeModal">Cancel</button><button class="btn primary">Save</button></div></form>`);
}

/* ===== BODY ===== */
function viewBody() {
  const today = ymd(), st = S.settings;
  let h = '';
  if (st.weighDays.includes(dow(today)) && !S.body.weighins.some(w => w.date === today)) h += banner('info', '⚖️ Weigh-in morning — log it below (after the bathroom, before food).');
  const lastWaist = [...S.body.waist].sort((a, b) => a.date < b.date ? 1 : -1)[0];
  if (!lastWaist || daysBetween(lastWaist.date, today) >= 14) h += banner('info', '📏 Waist measurement due (every 2 weeks).');
  h += `<div class="card"><h3>Log</h3><form data-form="weigh" class="grid2">
      <label class="fl">Weight kg<input name="kg" inputmode="decimal" required></label><label class="fl">Date<input type="date" name="date" value="${today}" max="${today}"></label>
      <button class="btn primary span2">Save weigh-in</button></form>
    <form data-form="waist" class="grid2 mt"><label class="fl">Waist cm<input name="cm" inputmode="decimal" required></label><label class="fl">Date<input type="date" name="date" value="${today}" max="${today}"></label>
      <button class="btn span2">Save waist</button></form></div>`;
  // chart
  const W = [...S.body.weighins].sort((a, b) => a.date < b.date ? -1 : 1), avgs = weeklyAverages();
  const X = d => parseYmd(d) / 86400000;
  const series = [{ name: 'weigh-ins', color: '#8a8f98', points: W.map(w => ({ x: X(w.date), y: w.kg })), dots: true },
    { name: 'weekly avg', color: 'var(--acc)', points: avgs.map(a => ({ x: X(addDays(a.week, 3)), y: a.avg })) }];
  if (st.bodyPhase === 'cut' && W.length) {
    const cs = weekStart(st.cutStart);
    const baseAvg = avgs.find(a => a.week >= cs) || avgs[avgs.length - 1];
    if (baseAvg) {
      const end = addDays(weekStart(W[W.length - 1].date > today ? W[W.length - 1].date : today), 28), pts = [];
      for (let w = baseAvg.week, i = 0; w <= end; w = addDays(w, 7), i++) pts.push({ x: X(addDays(w, 3)), y: r1(baseAvg.avg * Math.pow(0.995, i)) });
      series.push({ name: 'target −0.5%/wk', color: '#f5c542', points: pts, dash: true, dots: false });
    }
  }
  h += `<div class="card"><div class="row between"><h3>Bodyweight</h3><select id="bodyPhase">${['maintain', 'bulk', 'cut'].map(p => `<option ${st.bodyPhase === p ? 'selected' : ''} value="${p}">${p}</option>`).join('')}</select></div>
    ${st.bodyPhase === 'cut' ? `<label class="fl">Cut started<input type="date" id="cutStart" value="${st.cutStart}"></label>` : ''}
    ${Charts.line(series, { xLabel: x => fmtShort(ymd(new Date(x * 86400000))) })}</div>`;
  // weekly table
  const rows = avgs.slice(-8).reverse();
  h += `<div class="card"><h3>Weekly averages</h3>${rows.length ? `<table class="tbl"><tr><th>Week of</th><th>avg kg</th><th>Δ%</th><th>n</th></tr>${rows.map((a, i) => { const prev = rows[i + 1]; const dp = prev ? r1((a.avg - prev.avg) / prev.avg * 100) : ''; return `<tr><td>${fmtShort(a.week)}</td><td>${a.avg}</td><td>${dp === '' ? '' : (dp > 0 ? '+' : '') + dp}</td><td>${a.n}</td></tr>`; }).join('')}</table>` : '<p class="muted">Weigh in 3 mornings a week.</p>'}</div>`;
  h += `<div class="card"><h3>Entries</h3>${[...W].reverse().slice(0, 15).map(w => `<div class="row between li2"><span>${fmtDate(w.date)}</span><span>${w.kg} kg <button class="btn sm" data-a="delWeigh" data-id="${w.id}">✕</button></span></div>`).join('') || '<p class="muted">No weigh-ins.</p>'}
    <h3 class="mt">Waist</h3>${[...S.body.waist].sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 10).map(w => `<div class="row between li2"><span>${fmtDate(w.date)}</span><span>${w.cm} cm <button class="btn sm" data-a="delWaist" data-id="${w.id}">✕</button></span></div>`).join('') || '<p class="muted">No waist entries.</p>'}</div>`;
  return h;
}

/* ===== MORE: program editor, settings, data ===== */
function viewMore() {
  if (UI.more === 'program') return viewProgram();
  if (UI.more === 'workout') return viewWorkoutEdit();
  if (UI.more === 'settings') return viewSettings();
  if (UI.more === 'data') return viewData();
  return globalBanners() + `<div class="card menu">
    <button class="li" data-a="more" data-m="program"><b>🏋️ Program</b><span class="muted">workouts, exercises, cues</span></button>
    <button class="li" data-a="more" data-m="settings"><b>⚙️ Settings</b><span class="muted">phase, deload, targets, schedule</span></button>
    <button class="li" data-a="more" data-m="data"><b>💾 Backup & data</b><span class="muted">export, import, CSV</span></button></div>
    <p class="tiny muted center">Gym Tracker v${APP_VERSION} · works fully offline</p>`;
}
const back = (to = null) => `<button class="btn sm" data-a="more" data-m="${to || ''}">‹ Back</button>`;
function viewProgram() {
  return `<div class="row between">${back()}<button class="btn sm primary" data-a="addWorkout">+ Workout</button></div>` +
    S.program.map((w, i) => `<div class="card"><div class="row between"><div><b>${esc(w.name)}</b> <span class="muted">${w.day != null ? DAY_NAMES[w.day] : 'any day'} · ${w.exercises.length} exercises</span></div>
      <div class="row gap"><button class="btn sm" data-a="moveWorkout" data-i="${i}" data-d="-1">↑</button><button class="btn sm" data-a="moveWorkout" data-i="${i}" data-d="1">↓</button><button class="btn sm primary" data-a="editWorkout" data-id="${w.id}">Edit</button></div></div></div>`).join('');
}
function viewWorkoutEdit() {
  const w = S.program.find(x => x.id === UI.editWorkout); if (!w) { UI.more = 'program'; return viewProgram(); }
  return `<div class="row between">${back('program')}<button class="btn sm danger" data-a="deleteWorkout" data-id="${w.id}">Delete workout</button></div>
    <div class="card"><label class="fl">Name<input id="wName" value="${esc(w.name)}"></label>
    <label class="fl">Day<select id="wDay"><option value="">Any day</option>${DAY_NAMES.map((n, i) => `<option value="${i}" ${w.day === i ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
    ${w.exercises.map((e, i) => `<div class="card"><div class="row between"><div><b>${esc(e.name)}</b><div class="tiny muted">${e.sets}×${e.repMin}${e.repMax !== e.repMin ? '–' + e.repMax : ''} · ${e.rest}s · ${e.muscles.join(', ') || 'no muscle tag'}</div></div>
      <div class="row gap"><button class="btn sm" data-a="moveEx" data-i="${i}" data-d="-1">↑</button><button class="btn sm" data-a="moveEx" data-i="${i}" data-d="1">↓</button><button class="btn sm primary" data-a="editEx" data-id="${e.id}">Edit</button></div></div></div>`).join('')}
    <button class="btn block primary" data-a="editEx" data-id="">+ Add exercise</button>`;
}
function exForm(e, sessionOnly = false) {
  e = e || { id: '', name: '', sets: 3, repMin: 8, repMax: 12, rest: 90, compound: false, muscles: [], main: false, assisted: false, bodyweight: false, inc: 1, notes: '', cues: [] };
  modal(`<h3>${sessionOnly ? 'Add to this session' : (e.id ? 'Edit exercise' : 'New exercise')}</h3><form data-form="${sessionOnly ? 'sessEx' : 'ex'}"><input type="hidden" name="id" value="${e.id}">
    <label class="fl">Name<input name="name" required value="${esc(e.name)}" list="exNames"></label>
    <datalist id="exNames">${[...new Set(S.program.flatMap(w => w.exercises.map(x => x.name)))].map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="grid3"><label class="fl">Sets<input name="sets" inputmode="numeric" value="${e.sets}"></label><label class="fl">Reps min<input name="repMin" inputmode="numeric" value="${e.repMin}"></label><label class="fl">Reps max<input name="repMax" inputmode="numeric" value="${e.repMax}"></label></div>
    <div class="grid2"><label class="fl">Rest (s)<input name="rest" inputmode="numeric" value="${e.rest}"></label><label class="fl">Weight step (kg)<input name="inc" inputmode="decimal" value="${e.inc}"></label></div>
    ${sessionOnly ? '' : `<label class="fl">Form cues (one per line, 2–4)<textarea name="cues" rows="4">${esc(e.cues.join('\n'))}</textarea></label>
    <label class="fl">Notes<input name="notes" value="${esc(e.notes)}"></label>
    <div class="fl">Muscles (weekly sets)<div class="chips">${MUSCLES.map(m => `<label class="chipchk"><input type="checkbox" name="m_${m}" ${e.muscles.includes(m) ? 'checked' : ''}><span>${m}</span></label>`).join('')}</div></div>
    <label class="chk"><input type="checkbox" name="compound" ${e.compound ? 'checked' : ''}> Compound</label>
    <label class="chk"><input type="checkbox" name="main" ${e.main ? 'checked' : ''}> Main lift (1RM chart)</label>
    <label class="chk"><input type="checkbox" name="assisted" ${e.assisted ? 'checked' : ''}> Assisted (weight = assistance, less is better)</label>
    <label class="chk"><input type="checkbox" name="bodyweight" ${e.bodyweight ? 'checked' : ''}> Bodyweight (reps only)</label>`}
    <div class="row gap mt">${e.id && !sessionOnly ? `<button type="button" class="btn danger" data-a="deleteEx" data-id="${e.id}">Delete</button>` : ''}<button type="button" class="btn" data-a="closeModal">Cancel</button><button class="btn primary">Save</button></div></form>`);
}
function viewSettings() {
  const st = S.settings;
  return `<div class="row between">${back()}</div>
  <div class="card"><h3>Training phase</h3><div class="seg">${['normal', 'rampup'].map(p => `<button class="${st.phase === p ? 'on' : ''}" data-a="phase" data-p="${p}">${p === 'normal' ? 'Normal' : 'Ramp-up (½ sets)'}</button>`).join('')}</div>
    <h3 class="mt">Deload</h3>${S.deload.activeUntil ? `<p>Active until ${fmtDate(S.deload.activeUntil)}.</p><button class="btn" data-a="endDeload">End deload now</button>` : `<p class="muted">Not active. Half sets at ~15% less weight for 7 days.</p><button class="btn" data-a="deloadNow">Deload now</button>`}</div>
  <div class="card"><h3>Schedule</h3><div class="chips">${DAY_NAMES.map((n, i) => `<label class="chipchk"><input type="checkbox" data-a="tday" data-i="${i}" ${st.trainingDays.includes(i) ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div>
    <label class="fl">Streak tracking starts<input type="date" data-s="startDate" value="${st.startDate}"></label>
    <h3 class="mt">Weigh-in mornings</h3><div class="chips">${DAY_NAMES.map((n, i) => `<label class="chipchk"><input type="checkbox" data-a="wday" data-i="${i}" ${st.weighDays.includes(i) ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div></div>
  <div class="card"><h3>Nutrition targets</h3><div class="grid2"><label class="fl">kcal<input inputmode="numeric" data-s="kcalTarget" value="${st.kcalTarget}"></label><label class="fl">Protein g<input inputmode="numeric" data-s="proteinTarget" value="${st.proteinTarget}"></label></div></div>
  <div class="card"><h3>Weekly hard-set targets</h3><div class="grid3">${MUSCLES.map(m => `<label class="fl">${m}<input inputmode="numeric" data-mt="${m}" value="${st.muscleTargets[m]}"></label>`).join('')}</div>
    <label class="fl">Bodyweight for assisted lifts if no weigh-in (kg)<input inputmode="decimal" data-s="bwFallback" value="${st.bwFallback}"></label></div>
  <div class="card"><h3>Alerts & device</h3><label class="chk"><input type="checkbox" data-a="soundToggle" ${st.sound ? 'checked' : ''}> Rest-timer sound</label>
    <button class="btn" data-a="testAlert">Test sound + flash</button><p class="tiny muted">iPhone: the ring/silent switch can mute web sounds. No vibration on iOS.</p>
    <p id="persistStatus" class="tiny"></p><button class="btn" data-a="persist">Request persistent storage</button></div>`;
}
function viewData() {
  const last = S.settings.lastBackupAt;
  return `<div class="row between">${back()}</div>
  <div class="card"><h3>Backup</h3><p class="muted">Last backup: ${last ? new Date(last).toLocaleString() : 'never'}</p>
    <button class="btn big primary block" data-a="exportJSON">Export everything (JSON)</button>
    <p class="tiny muted">On iPhone choose "Save to Files" (or AirDrop / email it to yourself).</p>
    <label class="btn block mt">Import JSON backup<input type="file" id="importFile" accept="application/json,.json" hidden></label></div>
  <div class="card"><h3>CSV</h3><button class="btn block" data-a="csv" data-k="workouts">Workouts CSV (one row per set)</button><button class="btn block mt" data-a="csv" data-k="food">Food log CSV</button></div>
  <div class="card"><h3>Danger zone</h3><button class="btn danger block" data-a="resetAll">Erase all data</button></div>`;
}

/* ---------- export / import ---------- */
async function shareOrDownload(name, text, mime) {
  const blob = new Blob([text], { type: mime });
  try {
    const file = new File([blob], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return true; }
  } catch (e) { if (e.name === 'AbortError') return false; }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}
async function exportJSON() {
  const { active, ...rest } = S;
  const payload = { app: 'gymtracker', dataVersion: DATA_VERSION, exportedAt: new Date().toISOString(), state: { ...rest, active } };
  const ok = await shareOrDownload(`gym-backup-${ymd()}.json`, JSON.stringify(payload, null, 1), 'application/json');
  if (ok) { S.settings.lastBackupAt = Date.now(); save(true); render(); toast('Backup exported'); }
}
function importFile(file) {
  const rd = new FileReader();
  rd.onload = () => {
    let data;
    try { data = JSON.parse(rd.result); } catch (e) { toast('Not a valid JSON file'); return; }
    const st = data && data.app === 'gymtracker' ? data.state : null;
    if (!st || !Array.isArray(st.program) || !Array.isArray(st.sessions)) { toast('This is not a Gym Tracker backup'); return; }
    confirmBox(`Replace ALL current data with the backup from ${data.exportedAt ? new Date(data.exportedAt).toLocaleString() : 'unknown date'}? (${st.sessions.length} sessions, ${(st.foodLog || []).length} food entries)`, 'Replace', async () => {
      try { if (DB.db) await DB.put('preImport', JSON.parse(JSON.stringify(S))); } catch (e) {}
      S = migrate(st); await save(true); closeModal(); render(); toast('Backup restored');
    });
  };
  rd.readAsText(file);
}

/* ---------- deload ---------- */
function startDeload() {
  S.deload.activeUntil = addDays(ymd(), 6);
  S.deload.weeks = [false, false, false, false, false, false];
  S.deload.pendingBanner = false;
  save(true);
}
function checkDeloadExpiry() {
  if (S.deload.activeUntil && ymd() > S.deload.activeUntil) { S.deload.activeUntil = null; save(); toast('Deload finished — back to normal training'); }
}
function showDeloadOverlay() {
  const o = $('#overlay');
  o.innerHTML = `<div class="ovbox"><div class="ovicon">🧘</div><h1>Deload week</h1><p>You finished 6 weeks. This week: half the sets, ~15% lighter. Recover, then the checklist resets to Week 1.</p>
    <button class="btn big primary block" data-a="acceptDeload">Start deload week</button><button class="btn block mt" data-a="laterDeload">Remind me next time</button></div>`;
  o.classList.add('open');
}

/* ---------- actions ---------- */
const A = {
  tab: el => { UI.tab = el.dataset.tab; if (UI.tab !== 'more') UI.more = null; render(); window.scrollTo(0, 0); },
  more: el => { UI.more = el.dataset.m || null; render(); window.scrollTo(0, 0); },
  closeModal, confirmYes: () => { const f = UI._confirm; UI._confirm = null; f && f(); },
  applyUpdate: () => { UI.updateReady && UI.updateReady.postMessage('skipWaiting'); },
  exportJSON, csv: el => shareOrDownload(`gym-${el.dataset.k}-${ymd()}.csv`, el.dataset.k === 'food' ? foodCSV() : workoutsCSV(), 'text/csv'),
  resetAll: () => confirmBox('Erase ALL data on this phone? Export a backup first!', 'Erase everything', () => confirmBox('Really erase? This cannot be undone.', 'Yes, erase', async () => { S = defaultState(); await save(true); closeModal(); render(); })),
  // training
  startWorkout: el => { if (S.active) { toast('Finish or discard the current session first'); return; } startFlow(el.dataset.id); },
  rate: el => { UI.pending.r[el.dataset.k] = +el.dataset.n; readinessModal(); },
  readySkip: () => beginSession(null, false),
  readyGo: () => {
    const r = UI.pending.r;
    if (Object.values(r).some(v => v == null)) { toast('Rate all three, or tap Skip'); return; }
    if (readinessLow(r)) {
      UI.pending.readiness = r;
      modal(`<h3>Low readiness today (${r.sleep + r.soreness + r.energy}/15)</h3><p>Suggestion: one set fewer per exercise and about 10% less weight. Your call.</p>
        <div class="row gap"><button class="btn" data-a="trimIgnore">Ignore</button><button class="btn primary" data-a="trimAccept">Accept</button></div>`);
    } else beginSession(r, false);
  },
  trimAccept: () => beginSession(UI.pending.readiness, true),
  trimIgnore: () => beginSession(UI.pending.readiness, false),
  startTimer: () => { if (S.active && !S.active.startedAt) { S.active.startedAt = Date.now(); save(); render(); } },
  logSet: el => logSet(+el.dataset.ei, +el.dataset.si),
  addSet: el => { const ae = S.active.exercises[+el.dataset.ei]; const p = ae.plan[ae.plan.length - 1] || { last: null, target: null }; ae.plan.push({ ...p }); ae.sets.push(null); save(); render(); },
  removeSet: el => { const ae = S.active.exercises[+el.dataset.ei]; if (ae.plan.length > 1 && !ae.sets[ae.sets.length - 1]) { ae.plan.pop(); ae.sets.pop(); save(); render(); } },
  rest: el => { const a = S.active; if (!a.restEndsAt) return; a.restEndsAt += +el.dataset.d * 1000; a.restTotal = Math.max(1, a.restTotal + +el.dataset.d); if (a.restEndsAt > Date.now()) { UI.restAlerted = false; $('#restbar')?.classList.remove('done'); } save(); tick(); },
  restSkip: () => { S.active.restEndsAt = null; save(); renderRestBar(); },
  addSessionEx: () => exForm(null, true),
  finish: () => {
    S.active.notes = $('#sessNotes')?.value ?? S.active.notes;
    const n = S.active.exercises.reduce((a, e) => a + e.sets.filter(Boolean).length, 0);
    const dur = S.active.startedAt ? fmtDur((Date.now() - S.active.startedAt) / 1000) : '0:00';
    confirmBox(`Finish workout? ${n} sets logged · ${dur}`, 'Finish & save', finishSession, false);
  },
  discard: () => confirmBox('Discard this session? Logged sets will be lost.', 'Discard', () => { S.active = null; wakeOff(); save(true); closeModal(); render(); }),
  showSession: el => sessionDetail(el.dataset.id),
  deleteSession: el => confirmBox('Delete this session?', 'Delete', () => { S.sessions = S.sessions.filter(s => s.id !== el.dataset.id); save(); closeModal(); render(); }),
  toggleWeek: el => {
    const i = +el.dataset.i; S.deload.weeks[i] = !S.deload.weeks[i];
    if (i === 5 && S.deload.weeks[5]) { S.deload.pendingBanner = true; toast('Week 6 done — deload week starts next time you open the app'); }
    if (i === 5 && !S.deload.weeks[5]) S.deload.pendingBanner = false;
    save(); render();
  },
  deloadNow: () => confirmBox('Start a deload week now? Half sets, ~15% lighter for 7 days, checklist resets to Week 1.', 'Start deload', () => { startDeload(); closeModal(); render(); }, false),
  endDeload: () => { S.deload.activeUntil = null; save(); render(); },
  acceptDeload: () => { startDeload(); $('#overlay').classList.remove('open'); render(); },
  laterDeload: () => { $('#overlay').classList.remove('open'); },
  dismissLow: el => { S.deload.dismissedLowKey = el.dataset.id; save(); render(); },
  // stats
  hmTap: el => toast(`${fmtDate(el.dataset.d)}: ${el.dataset.s}`),
  mweek: el => { UI.muscleWeek = +el.dataset.w; render(); },
  addPause: () => pauseForm(),
  editPause: el => pauseForm(S.pauses.find(p => p.id === el.dataset.id)),
  deletePause: el => { S.pauses = S.pauses.filter(p => p.id !== el.dataset.id); save(); closeModal(); render(); },
  // food
  fday: el => { const n = addDays(UI.foodDate, +el.dataset.d); if (n <= ymd()) { UI.foodDate = n; render(); } },
  logFood: () => logFoodPicker(),
  pickFood: el => amountModal(el.dataset.id),
  logSuggest: el => { const g = el.dataset.g, s = el.dataset.s; amountModal(el.dataset.id, g ? { unit: 'g', amount: +g } : { unit: 'serv', amount: +s }); },
  amtUnit: el => { const a = num($('#amtIn').value); amountModal(UI.amt.foodId, { unit: el.dataset.u, amount: undefined }, UI.amt.entryId); },
  quickAdd: () => quickAddModal(),
  copyYesterday: () => {
    const y = addDays(UI.foodDate, -1), src = S.foodLog.filter(x => x.date === y);
    if (!src.length) { toast('Nothing logged the day before'); return; }
    const go = () => { const t = Date.now(); src.forEach((x, i) => S.foodLog.push({ ...x, id: uid(), date: UI.foodDate, t: t + i })); save(); closeModal(); render(); toast(`Copied ${src.length} entries`); };
    if (S.foodLog.some(x => x.date === UI.foodDate)) confirmBox(`Add ${src.length} entries from the day before to this day?`, 'Copy', go, false); else go();
  },
  editEntry: el => { const e = S.foodLog.find(x => x.id === el.dataset.id); if (e.foodId && S.foods.some(f => f.id === e.foodId) && e.amount) amountModal(e.foodId, { unit: e.unit, amount: e.amount }, e.id); else quickAddModal(e); },
  deleteEntry: el => { S.foodLog = S.foodLog.filter(x => x.id !== el.dataset.id); save(); closeModal(); render(); },
  newFood: () => foodForm(),
  editFood: el => foodForm(S.foods.find(f => f.id === el.dataset.id)),
  favFood: el => { const f = S.foods.find(x => x.id === el.dataset.id); f.fav = !f.fav; save(); render(); },
  deleteFood: el => confirmBox('Delete this food from the library? (Logged entries stay.)', 'Delete', () => { S.foods = S.foods.filter(f => f.id !== el.dataset.id); save(); closeModal(); render(); }),
  // body
  delWeigh: el => { S.body.weighins = S.body.weighins.filter(x => x.id !== el.dataset.id); save(); render(); },
  delWaist: el => { S.body.waist = S.body.waist.filter(x => x.id !== el.dataset.id); save(); render(); },
  // program
  addWorkout: () => { const w = { id: uid(), name: 'Custom workout', day: null, exercises: [] }; S.program.push(w); save(); UI.editWorkout = w.id; UI.more = 'workout'; render(); },
  editWorkout: el => { UI.editWorkout = el.dataset.id; UI.more = 'workout'; render(); window.scrollTo(0, 0); },
  moveWorkout: el => { move(S.program, +el.dataset.i, +el.dataset.d); save(); render(); },
  deleteWorkout: el => confirmBox('Delete this workout? Past sessions are kept.', 'Delete', () => { S.program = S.program.filter(w => w.id !== el.dataset.id); UI.more = 'program'; save(); closeModal(); render(); }),
  moveEx: el => { const w = S.program.find(x => x.id === UI.editWorkout); move(w.exercises, +el.dataset.i, +el.dataset.d); save(); render(); },
  editEx: el => { const w = S.program.find(x => x.id === UI.editWorkout); exForm(el.dataset.id ? w.exercises.find(e => e.id === el.dataset.id) : null); },
  deleteEx: el => confirmBox('Delete this exercise from the workout?', 'Delete', () => { const w = S.program.find(x => x.id === UI.editWorkout); w.exercises = w.exercises.filter(e => e.id !== el.dataset.id); save(); closeModal(); render(); }),
  // settings
  phase: el => { S.settings.phase = el.dataset.p; save(); render(); },
  testAlert: () => { unlockAudio(); flash(); const s = S.settings.sound; S.settings.sound = true; beep(2); S.settings.sound = s; },
  persist: async () => { if (navigator.storage?.persist) { const ok = await navigator.storage.persist(); toast(ok ? 'Storage is persistent' : 'Browser declined (Home Screen apps are usually kept anyway)'); showPersist(); } else toast('Not supported here'); },
};
function move(arr, i, d) { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; }
function pauseForm(p) {
  p = p || { id: '', label: 'Trip', start: ymd(), end: addDays(ymd(), 7) };
  modal(`<h3>${p.id ? 'Edit pause' : 'New pause'}</h3><form data-form="pause"><input type="hidden" name="id" value="${p.id}">
    <label class="fl">Label<input name="label" value="${esc(p.label || '')}"></label>
    <div class="grid2"><label class="fl">Start<input type="date" name="start" required value="${p.start}"></label><label class="fl">End<input type="date" name="end" required value="${p.end}"></label></div>
    <div class="row gap mt">${p.id ? `<button type="button" class="btn danger" data-a="deletePause" data-id="${p.id}">Delete</button>` : ''}<button type="button" class="btn" data-a="closeModal">Cancel</button><button class="btn primary">Save</button></div></form>`);
}
async function showPersist() {
  const el = $('#persistStatus'); if (!el) return;
  try {
    const p = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
    const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    el.textContent = `Persistent storage: ${p == null ? 'unknown' : p ? 'yes ✅' : 'not granted'}${est ? ` · using ${(est.usage / 1024).toFixed(0)} KB` : ''}`;
  } catch (e) {}
}

/* ---------- forms ---------- */
const F = {
  food: fd => {
    const id = fd.get('id'), per = fd.get('per'), sg = num(fd.get('servingG'));
    const vals = { kcal: num(fd.get('kcal')) || 0, p: num(fd.get('p')) || 0, c: num(fd.get('c')), f: num(fd.get('f')) };
    const f = id ? S.foods.find(x => x.id === id) : { id: uid() };
    Object.assign(f, { name: fd.get('name').trim(), servingG: sg > 0 ? sg : null, fav: !!fd.get('fav'), perServing: per === 'serving' ? vals : null, per100: per === '100g' ? vals : null });
    normalizeFood(f);
    if (!id) S.foods.push(f);
    save(); closeModal(); render();
  },
  amount: fd => {
    const amount = num(fd.get('amount')); if (!(amount > 0)) return;
    const f = S.foods.find(x => x.id === UI.amt.foodId), unit = UI.amt.unit === 'g' ? 'g' : 'serv';
    const n = nutrientsFor(f, amount, unit);
    const entry = UI.amt.entryId ? S.foodLog.find(x => x.id === UI.amt.entryId) : { id: uid(), date: UI.foodDate, t: Date.now() };
    Object.assign(entry, { foodId: f.id, name: f.name, amount, unit, ...n });
    if (!UI.amt.entryId) S.foodLog.push(entry);
    save(); closeModal(); render();
  },
  quick: fd => {
    const id = fd.get('id');
    const v = { name: (fd.get('name') || '').trim() || 'Quick add', kcal: num(fd.get('kcal')) || 0, p: num(fd.get('p')) || 0, c: num(fd.get('c')), f: num(fd.get('f')) };
    if (id) Object.assign(S.foodLog.find(x => x.id === id), v);
    else {
      let foodId = null;
      if (fd.get('save')) { const f = { id: uid(), name: v.name, servingG: null, fav: false, perServing: { kcal: v.kcal, p: v.p, c: v.c, f: v.f }, per100: null }; S.foods.push(f); foodId = f.id; }
      S.foodLog.push({ id: uid(), date: UI.foodDate, t: Date.now(), foodId, amount: foodId ? 1 : null, unit: foodId ? 'serv' : null, ...v });
    }
    save(); closeModal(); render();
  },
  weigh: (fd, form) => { const kg = num(fd.get('kg')); if (!(kg > 20)) { toast('Check the number'); return; } const date = fd.get('date') || ymd(); S.body.weighins = S.body.weighins.filter(w => w.date !== date); S.body.weighins.push({ id: uid(), date, kg }); save(); render(); toast('Weigh-in saved'); },
  waist: fd => { const cm = num(fd.get('cm')); if (!(cm > 30)) { toast('Check the number'); return; } S.body.waist.push({ id: uid(), date: fd.get('date') || ymd(), cm }); save(); render(); toast('Waist saved'); },
  pause: fd => {
    const id = fd.get('id'), start = fd.get('start'), end = fd.get('end');
    if (end < start) { toast('End must be after start'); return; }
    const p = id ? S.pauses.find(x => x.id === id) : { id: uid() };
    Object.assign(p, { label: fd.get('label'), start, end }); if (!id) S.pauses.push(p);
    save(); closeModal(); render();
  },
  ex: fd => {
    const w = S.program.find(x => x.id === UI.editWorkout), id = fd.get('id');
    const e = id ? w.exercises.find(x => x.id === id) : { id: uid() };
    const repMin = Math.max(1, parseInt(fd.get('repMin')) || 8);
    Object.assign(e, {
      name: fd.get('name').trim(), sets: Math.max(1, parseInt(fd.get('sets')) || 3), repMin, repMax: Math.max(repMin, parseInt(fd.get('repMax')) || repMin),
      rest: Math.max(10, parseInt(fd.get('rest')) || 90), inc: num(fd.get('inc')) || 1,
      cues: (fd.get('cues') || '').split('\n').map(s => s.trim()).filter(Boolean), notes: fd.get('notes') || '',
      muscles: MUSCLES.filter(m => fd.get('m_' + m)), compound: !!fd.get('compound'), main: !!fd.get('main'), assisted: !!fd.get('assisted'), bodyweight: !!fd.get('bodyweight'),
    });
    if (!id) w.exercises.push(e);
    save(); closeModal(); render();
  },
  sessEx: fd => {
    const name = fd.get('name').trim(), repMin = Math.max(1, parseInt(fd.get('repMin')) || 8);
    const known = S.program.flatMap(w => w.exercises).find(e => e.name === name);
    const ex = known ? { ...known } : { id: null, name, assisted: false, bodyweight: false, muscles: [], inc: num(fd.get('inc')) || 1 };
    Object.assign(ex, { sets: Math.max(1, parseInt(fd.get('sets')) || 3), repMin, repMax: Math.max(repMin, parseInt(fd.get('repMax')) || repMin), rest: Math.max(10, parseInt(fd.get('rest')) || 90) });
    const plan = planExercise(ex, S.active.mode, S.active.trim);
    S.active.exercises.push({ exId: known ? known.id : null, name, rest: ex.rest, repMin: ex.repMin, repMax: ex.repMax, muscles: [...(ex.muscles || [])], assisted: ex.assisted, bodyweight: ex.bodyweight, inc: ex.inc, plan, sets: plan.map(() => null) });
    save(); closeModal(); render();
  },
};

/* ---------- events ---------- */
function bindEvents() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-a]'); if (!el) return;
    if (el.tagName === 'INPUT' && el.type === 'checkbox') return; // handled on change
    const fn = A[el.dataset.a]; if (fn) { e.preventDefault(); fn(el); }
  });
  document.addEventListener('pointerdown', unlockAudio, { once: false, passive: true });
  document.addEventListener('submit', e => {
    const f = e.target.closest('form[data-form]'); if (!f) return;
    e.preventDefault(); F[f.dataset.form] && F[f.dataset.form](new FormData(f), f);
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.matches('.set input')) { const row = t.closest('.set'); const k = `${row.dataset.ei}-${row.dataset.si}`; const d = S.active.drafts[k] = S.active.drafts[k] || {}; d[t.dataset.f] = t.value; save(); }
    else if (t.id === 'sessNotes') { S.active.notes = t.value; save(); }
    else if (t.id === 'amtIn') amtPreview();
    else if (t.id === 'foodSearch') { const v = t.value, pos = t.selectionStart; logFoodPicker(v); const n = $('#foodSearch'); n.focus(); n.setSelectionRange(pos, pos); }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'liftSel') { UI.lift = t.value; render(); }
    else if (t.id === 'bodyPhase') { S.settings.bodyPhase = t.value; save(); render(); }
    else if (t.id === 'cutStart') { S.settings.cutStart = t.value; save(); render(); }
    else if (t.id === 'wName') { const w = S.program.find(x => x.id === UI.editWorkout); w.name = t.value.trim() || w.name; save(); }
    else if (t.id === 'wDay') { const w = S.program.find(x => x.id === UI.editWorkout); w.day = t.value === '' ? null : +t.value; save(); }
    else if (t.id === 'importFile' && t.files[0]) { importFile(t.files[0]); t.value = ''; }
    else if (t.dataset.s) { const k = t.dataset.s; S.settings[k] = t.type === 'date' ? t.value : (num(t.value) ?? S.settings[k]); save(); }
    else if (t.dataset.mt) { S.settings.muscleTargets[t.dataset.mt] = num(t.value) ?? 10; save(); }
    else if (t.dataset.a === 'tday' || t.dataset.a === 'wday') {
      const key = t.dataset.a === 'tday' ? 'trainingDays' : 'weighDays', i = +t.dataset.i;
      S.settings[key] = t.checked ? [...new Set([...S.settings[key], i])].sort() : S.settings[key].filter(x => x !== i); save();
    }
    else if (t.dataset.a === 'soundToggle') { S.settings.sound = t.checked; save(); }
  });
  document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => A.tab(b)));
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { checkDeloadExpiry(); if (S.active) wakeOn(); tick(); if (S.deload.pendingBanner) showDeloadOverlay(); }
  });
  setInterval(tick, 250);
  const mo = new MutationObserver(() => { if ($('#persistStatus')) showPersist(); updateWakeBadge(); });
  mo.observe(app(), { childList: true });
}

/* ---------- service worker ---------- */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then(reg => {
    const watch = w => w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) { UI.updateReady = w; render(); } });
    if (reg.waiting && navigator.serviceWorker.controller) { UI.updateReady = reg.waiting; render(); }
    reg.addEventListener('updatefound', () => watch(reg.installing));
    // check for updates when online & visible (harmless offline)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {}); });
  }).catch(e => console.warn('SW failed', e));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading || !UI.updateReady) return; reloading = true; save(true).then(() => location.reload()); });
}

/* ---------- boot ---------- */
(async function boot() {
  await loadState();
  bindEvents();
  checkDeloadExpiry();
  render();
  if (S.active) { wakeOn(); }
  if (S.deload.pendingBanner) showDeloadOverlay();
  try { if (navigator.storage?.persist) navigator.storage.persist(); } catch (e) {}
  registerSW();
})();
