# Mamba Mentality (v4.3)

Offline-first PWA planner. Open `index.html` over HTTPS (or local server), then on iPhone: Safari → Share → **Add to Home Screen**.

Data: `localStorage`. Backup: More → Export/Import JSON (includes appointments, tasks and the plan start date).

No build step. Serve the `app/` folder as static files.

## Adding things (v4.1)
Calendar tab → **＋ Add** →
- **Appointment / event** — date, start, duration *or* end time, travel before/after. The whole span is blocked; anything planned there is moved.
- **Task with a deadline** — today / by date / within N days, effort, splittable chunks, priority. Placed into real free time before the deadline.
- **Free time right now** — the existing suggestions (Free tab).
- **Custom block** — the old manual block editor.

After each change a summary shows what moved where, with **Undo**. **📋 My items** lists, edits, completes and deletes items.
The planner (`js/planner.js`) never double-books: sleep 00–06, prayers (15 min), meals/cooking, chill and wind-down are protected;
study/job/Swedish blocks give way and are re-homed to the next free slot (same day or up to 2 days later), shortened or dropped.

## Course revision (v4.2)
Study tab → two groups: **KFUPM (BSc)** and **KTH MSc**. Each course has a priority — *Must / want* (keep, high), *Quick pass*,
*Later / if time*, *Ignore* — changeable right in the list (selector next to each course) or in the course sheet (which also sets the group).
Only Must / want and Quick pass are scheduled. The planner interleaves the two groups topic by topic (active course's group first;
inside a group: active course, then high, then quick, in list order) and feeds the revision / deep-work blocks from the plan start date.
Data: state v4 adds the KTH courses once on upgrade (existing courses, progress, deadlines untouched; an untouched copy of the old data
is kept in localStorage under `mamba-mentality-v1-backup-v3`).

## v4.3 — real progress, repeating appointments, smarter clashes
- **Real progress.** Ticking ✓ on a Swedish / revision / deep-work block asks how much you finished (¼…3 or any number; default = planned).
  Progress is stored per topic/chapter (partial `part`), plus a log (`state.progress`). Every study block's content comes from a queue
  position (pace split over the day's study blocks); recording more moves the queue forward so all later sessions slide earlier, less leaves
  the rest first in the next session. Block times never change. Un-ticking restores the queue.
- **Repeating appointments.** Add → Appointment → *Repeat*: none / weekly on chosen weekdays (no end, until a date, or N times) / pick
  specific dates. Every occurrence is a fixed event. Tapping one lets you edit or delete *this one* or the *whole series*.
- **Clash handling.** When an appointment lands on planned work the planner first relocates it (same-day free slot → your commute, for
  work you can do on the go → a later day before its deadline) and lists what moved. Anything that can't be relocated gets ranked
  options (split, move to tomorrow, swap, drop), and you can tick anything on that day to drop yourself. Every choice re-runs the whole
  plan from now, with Undo.
- Data: state v5 (`progress`, `dayDrops`, appointment `repeat` / `skip` / `overrides`, task `skipDays` / `notBefore` / `commute`);
  an untouched copy of v4 data is kept under `mamba-mentality-v1-backup-v4`.

## Plan start date
More → Plan → *Plan start date* (default 2026-10-21). Nothing is generated before it; your own appointments still show.

## Tests
`node --test tests/planner.test.js` (also runs in the Pages and Windows workflows before deploying/building).
