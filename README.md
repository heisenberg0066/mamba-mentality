# Mamba Mentality (v4.5)

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

## v4.5 — one whole course at a time
- Revision is strictly sequential, never interleaved: all MATH (101 → 102 → 201 → 202 → 333) → PHYS 101 → 102 → the rest of KFUPM by study year (course number level), then number → KFUPM “Later / if time” → KTH MSc (Must/want, then Quick pass, then Later, each by course code). “Ignore” is never scheduled.
- A study block holds one course only. If a course ends inside a block, that block stops at the course end and the next course starts in the next block. Recording more than planned carries on into the next course, because that is what you really did.
- Quick pass topics take half the time of a full topic, and the course keeps its year position.
- Study tab: “▶ Now: MATH 101 — topic 3/8 · Next: MATH 102” and a numbered **Course order** list (✓ done · ▶ now). Today's recap shows the same line.
- Data v6: done topics and partial progress are kept. Course deadlines are re-planned once along the new order, and the old data is kept as `mamba-mentality-v1-backup-v5`.

## v4.4 — cross out notes
- Tap the round ○ on a sticky note (or swipe it sideways, or use **✓ Cross out** in the note sheet) to cross it out. It stays struck through and dimmed, with a "⏳ disappears in Xh" hint.
- 24 hours after being crossed out it is removed automatically. This is checked on load, when the app regains focus or becomes visible, and every minute while it is open.
- Un-crossing (↺ Restore) within 24 h cancels the removal. Notes store `done` and `doneAt`, and older notes are normalized on load.

## Plan start date
More → Plan → *Plan start date* (default 2026-10-21). Nothing is generated before it; your own appointments still show.

## Tests
`node --test tests/planner.test.js` (also runs in the Pages and Windows workflows before deploying/building).
