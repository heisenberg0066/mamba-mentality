/* Mamba Mentality v4.3 — smarter clash handling when an appointment lands on planned work.
 * clashReport(before, after, itemId) → { days, moved, unplaced, dayLists }:
 *   moved     – what the planner relocated by itself (same day / commute / later day before its deadline)
 *   unplaced  – what could not be relocated, each with ranked suggestions (drop / swap / move to tomorrow / split)
 *   dayLists  – everything planned on each clash day, so you can pick what to drop yourself
 * applyClashFix(fix) / applyDayDrops(list) change the data; the caller re-runs the planner (commitPlanChange). */
const PRIO_RANK = { high: 0, normal: 1, low: 2 };
function clashDaysOf(it, plan) {
  if (!it || it.kind !== 'appt') return [];
  const r = plan.range || { from: planStartDate(), to: planHorizon() };
  return MMPlanner.occurrenceDates(it, r.from, r.to).filter((d) => plan.days[d]).slice(0, 12);
}
function routineKind(b) {
  const m = b.meta || {};
  if (m.itemId) return m.kind === 'task' ? (m.doneChunk != null ? 'done' : 'task') : 'fixed';
  if (m.queueId) return 'queue';
  return 'routine';
}
function clashReport(before, after, itemId) {
  const it = itemById(itemId);
  const days = clashDaysOf(it, after);
  const daySet = new Set(days);
  const changes = MMPlanner.diffLogs(before.log, after.log);
  const moved = []; const unplaced = [];
  const how = (fromDs, ds, commute) => (commute ? 'commute' : ds === fromDs ? 'sameDay' : 'laterDay');
  changes.filter((x) => x.t === 'moved').forEach((x) => {
    moved.push({ kind: 'block', title: logLabel(x), type: x.type, fromDs: x.fromDs, fromS: x.fromS, fromE: x.fromE, ds: x.ds, s: x.s, e: x.e, how: how(x.fromDs, x.ds, x.commute) });
  });
  // tasks whose time changed
  const key = (c) => c.ds + '|' + c.s + '|' + c.e;
  Object.keys(after.tasks || {}).forEach((id) => {
    if (id === itemId) return;
    const tk = itemById(id); if (!tk) return;
    const b = ((before.tasks || {})[id] || { chunks: [] }).chunks; const a = after.tasks[id].chunks;
    const bk = new Set(b.map(key)); const ak = new Set(a.map(key));
    const gone = b.filter((c) => !ak.has(key(c))); const added = a.filter((c) => !bk.has(key(c)));
    if (!gone.length || !added.length) return;
    added.forEach((c, i) => {
      const g = gone[Math.min(i, gone.length - 1)];
      moved.push({ kind: 'task', itemId: id, title: tk.title, type: 'task', fromDs: g.ds, fromS: fromMin(g.s), fromE: fromMin(g.e), ds: c.ds, s: fromMin(c.s), e: fromMin(c.e), how: how(g.ds, c.ds, c.commute), deadline: tk.deadline });
    });
  });
  // tasks that lost time / no longer fit
  const bw = {}; (before.warnings || []).filter((w) => w.t === 'overflow').forEach((w) => { bw[w.item] = w; });
  (after.warnings || []).filter((w) => w.t === 'overflow' && w.item !== itemId).forEach((w) => {
    const old = bw[w.item]; if (old && old.placed <= w.placed) return;
    const tk = itemById(w.item); if (!tk) return;
    const lostDs = (((before.tasks || {})[w.item] || { chunks: [] }).chunks.find((c) => daySet.has(c.ds)) || {}).ds || days[0] || tk.deadline;
    unplaced.push({ kind: 'task', itemId: tk.id, title: tk.title, ds: lostDs, lost: w.need - w.placed, need: w.need, placed: w.placed, deadline: tk.deadline, priority: tk.priority || 'normal' });
  });
  // routine work that found no new home
  const rmap = {};
  changes.filter((x) => (x.t === 'dropped' || x.t === 'shortened') && x.type in MMPlanner.FLEX_W && x.baseId).forEach((x) => {
    const k = x.fromDs + '|' + x.baseId; const lost = x.lost || x.len || 0;
    if (rmap[k]) { rmap[k].lost += lost; if (x.fromS < rmap[k].fromS) rmap[k].fromS = x.fromS; if (x.fromE > rmap[k].fromE) rmap[k].fromE = x.fromE; return; }
    unplaced.push(rmap[k] = { kind: 'routine', title: logLabel(x), type: x.type, ds: x.fromDs, fromS: x.fromS, fromE: x.fromE, lost, baseId: x.baseId, labelKey: x.labelKey, rawTitle: x.title, detail: x.detail || '', queueId: x.queueId });
  });
  unplaced.sort((a, b) => (a.kind === 'task' ? 0 : 1) - (b.kind === 'task' ? 0 : 1) || String(a.ds).localeCompare(String(b.ds)) || String(a.fromS || '').localeCompare(String(b.fromS || '')));
  unplaced.forEach((u) => { u.suggestions = clashSuggestions(u, after); });
  const dayLists = {};
  days.forEach((ds) => { dayLists[ds] = getDay(ds).blocks.map((b) => ({ id: b.id, ds, title: blockTitle(b), type: b.type, start: b.start, end: b.end, kind: routineKind(b), self: b.meta && b.meta.itemId === itemId, itemId: b.meta && b.meta.itemId, baseId: (b.meta && b.meta.baseId) || String(b.id).split('~')[0], home: (b.meta && (b.meta.movedFrom || b.meta.from)) || ds, queueId: b.meta && b.meta.queueId, detail: (b.meta && b.meta.detail) || '' })); });
  return { itemId, days, moved, unplaced, dayLists };
}
/** Ranked options for something that couldn't be relocated (lower score = suggested first). */
function clashSuggestions(u, plan) {
  const out = []; const D = u.ds; const tmr = mmAddDays(D, 1);
  const blocksOn = (getDay(D) || { blocks: [] }).blocks;
  if (u.kind === 'task') {
    const tk = itemById(u.itemId); const pr = PRIO_RANK[u.priority] ?? 1;
    const ext = (tk.deadline || D) < tmr;
    out.push({ code: 'tomorrow', itemId: u.itemId, ds: D, to: tmr, extends: ext, score: ext ? 45 : 10 });
    // swap with another task that holds time that day: it moves to tomorrow, this one takes its time
    const seen = new Set();
    blocksOn.filter((b) => b.meta && b.meta.kind === 'task' && b.meta.doneChunk == null && b.meta.itemId !== u.itemId).forEach((b) => {
      const y = itemById(b.meta.itemId); if (!y || seen.has(y.id)) return; seen.add(y.id);
      const py = PRIO_RANK[y.priority] ?? 1;
      if (py < pr) return; // never push a more important task aside automatically
      out.push({ code: 'swap', itemId: u.itemId, withItem: y.id, withTitle: y.title, ds: D, to: tmr, extends: (y.deadline || D) < tmr, score: 20 + (2 - py) * 5 + ((y.deadline || D) < tmr ? 10 : 0) });
    });
    if (tk && !tk.splittable) out.push({ code: 'split', itemId: u.itemId, score: 15 });
    out.push({ code: 'drop', itemId: u.itemId, score: [30, 60, 90][pr] });
  } else {
    out.push({ code: 'tomorrow', routine: true, ds: D, to: tmr, u: { type: u.type, labelKey: u.labelKey, title: u.rawTitle, detail: u.detail, fromS: u.fromS, lost: u.lost, baseId: u.baseId }, score: 10 });
    const w = MMPlanner.FLEX_W[u.type] ?? 3;
    blocksOn.filter((b) => routineKind(b) === 'routine' && b.type in MMPlanner.FLEX_W && b.type !== u.type && !(streamOf(b.type) && streamOf(b.type) === streamOf(u.type)) && MMPlanner.FLEX_W[b.type] < w && b.status !== 'done' && endMin(b.end) - toMin(b.start) >= Math.min(60, u.lost || 30)).forEach((b) => {
      out.push({ code: 'swap', routine: true, ds: D, withBase: (b.meta && b.meta.baseId) || b.id, withTitle: blockTitle(b), withTime: `${b.start}–${b.end}`, score: 20 + MMPlanner.FLEX_W[b.type] });
    });
    const seen = new Set();
    blocksOn.filter((b) => b.meta && b.meta.kind === 'task' && b.meta.doneChunk == null).forEach((b) => {
      const y = itemById(b.meta.itemId); if (!y || seen.has(y.id) || (y.deadline || D) <= D) return; seen.add(y.id);
      out.push({ code: 'swap', routine: true, ds: D, withItem: y.id, withTitle: y.title, withTime: `${b.start}–${b.end}`, to: tmr, score: 28 });
    });
    out.push({ code: 'drop', routine: true, ds: D, score: 40 });
  }
  return out.sort((a, b) => a.score - b.score).slice(0, 5);
}
function pushUnique(arr, v) { if (!arr.includes(v)) arr.push(v); return arr; }
function moveTaskOff(tk, ds, to) { // not on `ds` any more; earliest `to`, deadline moved if needed
  tk.notBefore = to; if ((tk.deadline || ds) < to) { tk.deadline = to; tk.dueMode = 'date'; }
  tk.skipDays = pushUnique(tk.skipDays || [], ds);
}
/** Apply one suggestion. Returns false if nothing to do (e.g. accepting a drop of routine work). */
function applyClashFix(f) {
  if (f.routine) {
    if (f.code === 'drop') return false;
    if (f.code === 'tomorrow') {
      const u = f.u; const s = toMin(u.fromS || '09:00'); const len = Math.max(15, Number(u.lost) || 30);
      MM.state.missedQueue.push({ id: mmUid('rq'), originalDate: f.ds, rescheduleDate: f.to, status: '',
        block: { id: (u.baseId || 'blk') + '-' + f.ds, type: u.type, start: fromMin(s), end: fromMin(Math.min(1440, s + len)), ...(u.labelKey ? { labelKey: u.labelKey } : {}), ...(u.title ? { title: u.title } : {}), meta: { detail: u.detail || '' } } });
      return true;
    }
    if (f.code === 'swap' && f.withBase) { MM.state.dayDrops = MM.state.dayDrops || {}; MM.state.dayDrops[f.ds] = pushUnique(MM.state.dayDrops[f.ds] || [], f.withBase); return true; }
    if (f.code === 'swap' && f.withItem) { const y = itemById(f.withItem); if (y) moveTaskOff(y, f.ds, f.to); return !!y; }
    return false;
  }
  const tk = itemById(f.itemId); if (!tk) return false;
  if (f.code === 'tomorrow') moveTaskOff(tk, f.ds, f.to);
  else if (f.code === 'swap') { const y = itemById(f.withItem); if (!y) return false; moveTaskOff(y, f.ds, f.to); }
  else if (f.code === 'split') { tk.splittable = true; tk.chunk = tk.chunk || 60; }
  else if (f.code === 'drop') MM.state.items = planItems().filter((x) => x.id !== tk.id);
  else return false;
  return true;
}
/** Drop the chosen entries of a day list (routine blocks that day, task time that day, moved-in work). */
function applyDayDrops(list) {
  MM.state.dayDrops = MM.state.dayDrops || {};
  list.forEach((x) => {
    if (x.kind === 'routine') MM.state.dayDrops[x.home] = pushUnique(MM.state.dayDrops[x.home] || [], x.baseId);
    else if (x.kind === 'queue') MM.state.missedQueue = MM.state.missedQueue.filter((q) => q.id !== x.queueId);
    else if (x.kind === 'task') { const tk = itemById(x.itemId); if (tk) tk.skipDays = pushUnique(tk.skipDays || [], x.ds); }
  });
  return list.length > 0;
}
