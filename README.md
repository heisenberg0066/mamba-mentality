# Mamba Mentality (v4.1)

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

## Plan start date
More → Plan → *Plan start date* (default 2026-10-21). Nothing is generated before it; your own appointments still show.

## Tests
`node --test tests/planner.test.js` (also runs in the Pages and Windows workflows before deploying/building).
