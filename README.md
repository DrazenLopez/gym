# Gym Tracker: offline PWA for iPhone

Plain HTML, CSS and JS. No build step and no CDN. Everything is cached on the phone, so it works with no wifi or data.

```
index.html             app shell
app.css                dark, thumb-friendly styles
js/core.js             data model, seed program, storage, targets, streaks, nutrition
js/charts.js           tiny built-in SVG charts (no library)
js/ui.js               screens, timers, actions
sw.js                  service worker (cache-first, versioned)
manifest.webmanifest   install metadata
icons/                 192, 512 and 180 (apple-touch) icons
```

## 1. Host it free on GitHub Pages (about 5 minutes)
1. Sign in at github.com and tap **New repository**. Name it `gym` and make it **Public**. Pages is free for public repos, and the app holds no personal data because your logs stay on your phone. Tap **Create**.
2. Tap **uploading an existing file**. Drag in the *contents* of this folder: `index.html`, `app.css`, `sw.js`, `manifest.webmanifest`, `README.md` and the `js/` and `icons/` folders. Commit.
3. Go to **Settings → Pages**. Under *Build and deployment*, set Source to **Deploy from a branch**, Branch to **main** and folder to **/(root)**, then tap **Save**.
4. Wait 1–2 minutes and refresh. You'll see `https://<your-username>.github.io/gym/`. That's HTTPS, which the service worker needs.

**To update later:** edit the files, then bump `CACHE_VERSION` in `sw.js` (e.g. `gym-v1.0.1`) and commit. Next time the app opens **with internet**, a "New version ready · Reload" banner appears. Your data is in IndexedDB, which updates never touch.

## 2. Install on the iPhone
1. Open the URL in **Safari** (not Chrome) while you have internet.
2. Tap **Share → Add to Home Screen → Add**.
3. Open it **from the Home Screen icon** once while still online and wait about 5 seconds. That fills the offline cache. Then always launch it from the icon. Safari tabs and the Home Screen app keep **separate** storage.

## 3. Airplane-mode test checklist
Do this at home before your first gym session.
1. With internet on, open the app from the Home Screen icon, then fully close it (swipe up).
2. Turn on **Airplane Mode**, and make sure Wi-Fi is off too.
3. Open the app from the icon. It should load normally, with no "offline" page.
4. **Train → Start Upper 1** → rate 2/3/3 → tap Continue. The low-readiness suggestion appears; tap **Ignore**.
5. Enter 40 kg × 10 on Set 1 and tap **✓**. The set turns colored, the session timer starts, and the rest bar counts down from 2:30.
6. Tap **+15**, **−15** and **Skip**. Log another set, then lock the phone for 30 s and unlock it. The rest timer has kept counting correctly.
7. Wait for the rest timer to reach 0. You get a green screen flash and a beep (the ring switch must be **on** for sound).
8. Tap **How** on an exercise. The cues open; tap again to close.
9. Tap **Finish → Finish & save**. A toast shows the duration.
10. Fully close the app, reopen it (still in airplane mode) and check **Recent sessions**. The session is still there.
11. **Food → + New** to add a food, then **+ Log food**. The "protein left" number at the top drops.
12. **More → Backup & data → Export** → **Save to Files**. This works offline.
13. Turn Airplane Mode off.

## 4. Backups (important)
iOS can clear web-app storage, for example if the phone runs low on space or the app is deleted. The app requests persistent storage and mirrors your data to a second store, but **a JSON export is your real safety net**. A banner reminds you weekly. Keep the file in iCloud Drive / Files. **Import** restores everything; before replacing, the app saves a copy of your current data internally.

## How the rules work (assumptions I made)
- **Beat-last-time targets:** if *every* set last time reached the top of the rep range, the target is +inc kg at the bottom of the range. The step is 2.5 kg for compounds and 1 kg for isolation, and you can edit it per exercise. Otherwise each set targets +1 rep at the same weight, capped at the top of the range. History is matched by **exercise name**, so "Lateral raise" shares history across all 4 days. Deload sessions are ignored when picking "last time".
- **Colors:** green means you beat the target, yellow means you matched it and red means you fell short. If you go heavier but do fewer reps (or the reverse), the estimated 1RM decides.
- **Assisted pull-up:** the weight you enter is the *assistance*, so less is better. Targets reduce the assistance. 1RM uses your latest weigh-in minus the assistance.
- **PR:** a set's estimated 1RM (Epley) beats every earlier set of that exercise. Knee raises (bodyweight) use reps. The first-ever session sets the baseline and isn't marked as a PR.
- **Modes:** ramp-up = half the sets (rounded up). Deload = half the sets at 15% less weight, the middle of your 10–20%. Accepting the low-readiness trim = one set fewer and 10% less weight for that session only.
- **Low readiness:** total ≤ 12 out of 15, or any rating of 1. If two sessions in a row are low, an "early deload" banner appears.
- **Streaks:** only your training days count (Mon–Thu by default; you can change them). Rest days and paused days never break a streak. Today doesn't count as missed until it's over. Streak tracking starts on the day you first open the app, and you can change that date in Settings. A pause for **Dec 7 – Jan 8** is pre-filled; edit it under Stats → Pause mode.
- **Deload checklist:** ticking W6 shows a full-screen "Deload week" the next time you open the app. Starting it gives 7 days of deload mode and resets the checklist to W1.
- **Hard sets / muscle:** every logged set counts 1 for each muscle tagged on the exercise. Tags are primary muscles only, and you can edit them in Program. The default target is 10 sets per week for each muscle; change it in Settings.
- **Body:** the target line (−0.5% per week, compounding) appears only when the phase is set to **cut**, starting from the weekly average of the week the cut started.
- **Storage:** everything is stored in IndexedDB as one state object, with a localStorage mirror as a fallback.

## iPhone limits handled
- No offline push notifications, so reminders appear as banners: backup, weigh-in morning, waist due, deload.
- No vibration, so the rest timer uses a screen flash plus a beep. Sound starts working after your first tap in the app.
- Timers are based on timestamps, so a locked screen doesn't throw them off. The Screen Wake Lock keeps the screen on during a session where iOS supports it (iOS 18.4+ for Home Screen apps). If it isn't supported, the header says "screen may lock" and the timers stay correct anyway.

## Suggested extras (not built yet)
1. **Make-up sessions:** let a Friday/Saturday session count for a missed Mon–Thu day in the same week.
2. **Plate/pin helper:** show the next weight on that machine's stack, since machines jump 5 kg while the targets assume 2.5.
3. **Warm-up sets generator** for squat/RDL (e.g. 50%×8, 70%×4, 85%×2) that don't count toward targets.
4. **Creatine/whey checkbox** on the Food screen, plus a "whey scoop" quick button for closing the protein gap.
5. **Auto-tick the deload week** when all 4 scheduled sessions of a week are logged.
6. **Progress photos** stored locally (large: export would need a zip).
