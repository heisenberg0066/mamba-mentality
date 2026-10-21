/* Mamba Mentality v2 — core: utils, pacing, schedule model */
const MM = { state: null, tab: 'today', view: 'day', date: null, toastTimer: null, rev: 0, _plan: null, _seq: null };
const HOUR = 56;
const WHOUR = 34;
const TYPES = ['wake', 'jobs', 'swedish', 'revision', 'solidworks', 'deep', 'meal', 'mealprep', 'buffer', 'chill', 'wind', 'rest', 'other'];
const FOCUS_TYPES = ['jobs', 'swedish', 'revision', 'solidworks', 'deep', 'mealprep', 'appt', 'task'];
const ITEM_TYPES = ['appt', 'travel', 'task']; // planner-generated, not selectable in the block editor
const WORK_TYPES = ['jobs', 'swedish', 'revision', 'solidworks', 'deep', 'mealprep', 'other'];
const PACE_BY_MODE = { none: 4, 'part-time': 2.5, 'full-time': 1.5 };

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function persist() { MM.rev++; mmSave(MM.state); }
function toast(msg) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.style.display = 'block';
  clearTimeout(MM.toastTimer);
  MM.toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2400);
}
function toMin(hm) { if (!hm) return 0; const [h, m] = hm.split(':').map(Number); return h * 60 + m; }
function endMin(hm) { const m = toMin(hm); return m === 0 ? 1440 : m; }
function fromMin(m) { m = Math.max(0, Math.min(1440, Math.round(m))); if (m === 1440) return '00:00'; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
function dow(ds) { return new Date(ds + 'T12:00:00').getDay(); }
function wdNames() { return t('wdShort').split(','); }
function monthNames() { return t('months').split(','); }
function wdName(ds) { return wdNames()[(dow(ds) + 6) % 7]; }
function longDayName(d) { return [t('sunday'), t('monday'), t('tuesday'), t('wednesday'), t('thursday'), t('friday'), t('saturday')][d]; }
function weekStart(ds) { return mmAddDays(ds, -((dow(ds) + 6) % 7)); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function blockTitle(b) { return b.title || (b.labelKey ? t(b.labelKey) : t('type_' + (b.type || 'other'))); }
function applyLang() {
  const lang = MM.state.settings.lang || 'en';
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.body.classList.toggle('rtl', lang === 'ar');
  document.title = t('appName');
}

/* prayers (calculated daily, Stockholm) */
const _prayerCache = {};
function prayersFor(ds) {
  const key = ds + JSON.stringify(MM.state.settings.prayer);
  if (!_prayerCache[key]) _prayerCache[key] = mmPrayerList(ds, MM.state.settings.prayer);
  return _prayerCache[key];
}

/* pacing */
function chapters() { return MM.state.swedishChapters; }
function nextSwedishChapter() { return chapters().find((c) => !c.done) || null; }
function swedishStats() {
  const list = chapters(); const total = list.length; const done = list.filter((c) => c.done).length; const left = total - done;
  const deadline = new Date(MM_SEED.swedishDeadline + 'T23:59:59');
  const weeksLeft = Math.max(1, (deadline - new Date()) / (7 * 864e5));
  const totalWeeks = Math.max(1, (deadline - new Date('2026-10-14T00:00:00')) / (7 * 864e5));
  const expected = total * (1 - weeksLeft / totalWeeks);
  let track = 'onTrack'; if (done + 1 < expected) track = 'behind'; else if (done > expected + 2) track = 'ahead';
  return { total, done, left, weeksLeft: weeksLeft.toFixed(1), pace: (left / weeksLeft).toFixed(1), track };
}
function courseLeft(c) { return c.topics.filter((x) => !x.done).length; }
function coursePct(c) { return c.topics.length ? Math.round(((c.topics.length - courseLeft(c)) / c.topics.length) * 100) : 0; }
function coursePace(c) {
  if (!c.deadline) return null;
  const w = Math.max(1 / 7, (new Date(c.deadline + 'T23:59:59') - new Date()) / (7 * 864e5));
  return (courseLeft(c) / w).toFixed(1);
}
/** v4.5: courses still to revise, in the strict course order (see mmCourseOrder in storage.js). */
function sortedRevision() { return mmCourseOrder(MM.state.courses).filter((x) => courseLeft(x) > 0); }
/** The current course = the first unfinished one in the order (the order decides, not a manual pick). */
function activeCourse() {
  const s = MM.state.settings;
  const c = sortedRevision()[0] || null;
  if ((c ? c.code : null) !== (s.activeCourse || null)) s.activeCourse = c ? c.code : null; // saved with the next persist()
  return c;
}
/** Sequential topic order: one whole course after the other, see mmRevisionSequence in storage.js. */
function revisionSequence() {
  const key = MM.rev;
  if (!MM._seq || MM._seq.key !== key || MM._seq.state !== MM.state) MM._seq = { key, state: MM.state, seq: mmRevisionSequence(MM.state.courses) };
  return MM._seq.seq;
}
function revisionQueue() { return sortedRevision(); } // distinct courses in the order they come up
/** 'Now: MATH 101 — topic 3/8 · Next: MATH 102' data. */
function courseNowNext() {
  const list = sortedRevision(); const now = list[0] || null;
  if (!now) return null;
  const idx = now.topics.findIndex((x) => !x.done);
  return { now, topicNo: idx + 1, topicCount: now.topics.length, topic: now.topics[idx] || null, next: list[1] || null };
}
function workDaysBetween(a, b) { let n = 0; for (let d = a; d < b; d = mmAddDays(d, 1)) if (!isRestDay(d)) n++; return n; }
function planBaseDate() { const ps = planStartDate(); const td = mmTodayStr(); return ps > td ? ps : td; }
function nextSwItem() { return MM.state.solidworks.items.find((i) => !i.done) || null; }
function completeTopic(course, topicId) {
  const tp = course.topics.find((x) => x.id === topicId); if (!tp) return;
  tp.done = !tp.done; tp.doneDate = tp.done ? mmTodayStr() : null;
  if (courseLeft(course) === 0 && MM.state.settings.activeCourse === course.code) {
    MM.state.settings.activeCourse = null;
    const nxt = activeCourse();
    toast(nxt ? `${t('nextSubjectToast')} ${nxt.code}` : t('allCoursesDone'));
  }
  persist();
}

/* schedule model */
function isRestDay(ds) {
  const s = MM.state.settings; const d = dow(ds);
  return (s.restDay === 'sunday' && d === 0) || (s.restDay === 'saturday' && d === 6) || (s.restMovedTo != null && d === s.restMovedTo);
}
function generatedTemplate(key, ds) {
  const s = MM.state.settings;
  if (key === 'rest') {
    const ref = ds || mmTodayStr();
    return mmBuildDayTemplate(ref, { ...s, restMovedTo: dow(ref) }, null, null).blocks;
  }
  let ref = ds;
  if (!ref) { ref = s.solidWorksStart > mmTodayStr() ? s.solidWorksStart : mmTodayStr(); while (dow(ref) !== Number(key)) ref = mmAddDays(ref, 1); }
  const forced = { ...s, restMovedTo: null, restDay: dow(ref) === 0 ? 'saturday' : 'sunday' };
  return mmBuildDayTemplate(ref, forced, null, null).blocks;
}
function templateKey(ds) { return isRestDay(ds) ? 'rest' : String(dow(ds)); }
function templateFor(key, ds) {
  const custom = MM.state.template[key];
  return clone(custom && custom.length ? custom : generatedTemplate(key, ds));
}
function baseBlocks(ds) { const own = MM.state.days[ds]; return own ? clone(own) : templateFor(templateKey(ds), ds); }
function swConvert(b, ds) {
  const swStart = MM.state.settings.solidWorksStart || MM_SEED.solidWorksStart;
  if (b.type === 'solidworks' && ds < swStart) { b.type = 'revision'; if (!b.title) b.labelKey = 'blockRevisionMore'; }
  return b;
}
function droppedIds(ds) { return new Set((MM.state.dayDrops && MM.state.dayDrops[ds]) || []); }
/** Routine blocks of a day (template or own day), minus the ones you chose to drop that day. */
function routineBlocks(ds) { const drop = droppedIds(ds); return baseBlocks(ds).filter((b) => !drop.has(b.id)); }

/* ---- v4.3 real progress: study streams (units = course topics / Swedish chapters) ----
 * Every study block gets a planned amount (the stream's daily pace split over that day's study blocks by length).
 * The queue position of a block = sum of the planned amounts of the not-yet-recorded blocks before it, counted
 * from the plan base day. Recording what you really did moves the queue itself, so every later block slides:
 * more → the next items come earlier, less → the unfinished part is first in the next session. Block times never change. */
const STREAM_TYPES = { rev: ['revision', 'deep'], sw: ['swedish'] };
function streamOf(type) { return STREAM_TYPES.rev.includes(type) ? 'rev' : STREAM_TYPES.sw.includes(type) ? 'sw' : null; }
function streamQueue(stream) {
  if (stream === 'rev') return revisionSequence().map((x) => ({ key: 'tp:' + x.topic.id, obj: x.topic, label: `${x.course.code} — ${x.topic.name}`, course: x.course, w: mmTopicWeight(x.course) }));
  return chapters().filter((c) => !c.done).map((c) => ({ key: 'ch:' + c.id, obj: c, label: `${c.book} · ${c.num}: ${c.title}`, w: 1 }));
}
function streamPerDay(stream) {
  if (stream === 'rev') return (PACE_BY_MODE[MM.state.settings.jobMode] || 4) / 6;
  return Math.max(0, Number(swedishStats().pace) || 0) / 6;
}
const unitLeft = (o) => Math.max(0, 1 - (Number(o.part) || 0));
const unitW = (x, raw) => (raw ? 1 : x.w || 1);
/** Item of the queue at a fractional position (0 = the start of what is left of the first item).
 *  Positions are in study time (1 = one full topic's time; a quick-pass topic takes ½); raw = count in units instead. */
function queueAt(queue, pos, raw) {
  let acc = 0;
  for (let i = 0; i < queue.length; i++) {
    const w = unitW(queue[i], raw); const L = unitLeft(queue[i].obj) * w;
    if (acc + L > pos + 1e-9) return { i, x: queue[i], into: (Number(queue[i].obj.part) || 0) + (pos - acc) / w };
    acc += L;
  }
  return null;
}
/** Units (topics / chapters) covered by the time span [pos, pos + amount] of the queue. */
function unitsInSpan(queue, pos, amount) {
  let acc = 0; let n = 0; const end = pos + amount;
  for (const x of queue) {
    const w = unitW(x); const L = unitLeft(x.obj) * w; const a = Math.max(acc, pos); const b = Math.min(acc + L, end);
    if (b > a) n += (b - a) / w;
    acc += L; if (acc >= end) break;
  }
  if (end > acc) n += end - acc; // past the end of the queue: plain time
  return n;
}
/** End positions (study time) of each course run in the revision queue, ascending. */
function courseBounds(queue) {
  const out = []; let acc = 0;
  queue.forEach((x, i) => { acc += unitLeft(x.obj) * unitW(x); if (!queue[i + 1] || queue[i + 1].course !== x.course) out.push(acc); });
  return out;
}
function progressModel() {
  const key = MM.rev + '|' + mmTodayStr();
  if (!MM._prog || MM._prog.key !== key || MM._prog.state !== MM.state) MM._prog = { key, state: MM.state, rev: null, sw: null };
  return MM._prog;
}
const blockMins = (b) => Math.max(0, endMin(b.end) - toMin(b.start));
function recordedKeys() { const o = new Set(); (MM.state.progress || []).forEach((r) => o.add(r.homeDs + '|' + r.baseId)); return o; }
function studyBlocks(ds, stream) {
  return routineBlocks(ds).map((b) => swConvert({ ...b }, ds)).filter((b) => streamOf(b.type) === stream && blockMins(b) > 0);
}
/** Planned amount + queue position of every study block of a day: { baseId: { pos, amount, recorded } }. */
function streamDay(stream, ds) {
  const pm = progressModel();
  const base = planBaseDate();
  const plain = (d) => { const bl = studyBlocks(d, stream); const tot = bl.reduce((a, b) => a + blockMins(b), 0); const u = streamPerDay(stream); const o = {}; bl.forEach((b) => { o[b.id] = { pos: 0, amount: tot ? (u * blockMins(b)) / tot : 0, recorded: false }; }); return o; };
  if (ds < base) return plain(ds);
  if (!pm[stream]) pm[stream] = { next: base, pos: 0, at: {}, rec: recordedKeys(), bounds: stream === 'rev' ? courseBounds(streamQueue('rev')) : null };
  const m = pm[stream];
  // v4.5: a revision block holds one course only — if a course ends inside a block, that block stops at its end
  // and the next course starts with the next block (no mixing of courses in one session)
  const capAt = (pos) => { if (!m.bounds) return Infinity; const e = m.bounds.find((x) => x > pos + 1e-6); return e == null ? Infinity : e; };
  let guard = 0;
  while (m.next <= ds && guard++ < 800) {
    const d = m.next; const day = plain(d);
    Object.keys(day).forEach((id) => {
      const x = day[id]; x.pos = m.pos; x.recorded = m.rec.has(d + '|' + id); if (x.recorded) return;
      const end = capAt(m.pos); if (m.pos + x.amount > end + 1e-6) { x.amount = Math.max(0, end - m.pos); x.capped = true; }
      m.pos += x.amount;
    });
    m.at[d] = day; m.next = mmAddDays(d, 1);
  }
  return m.at[ds] || {};
}
function blockUnits(ds, b) {
  const stream = streamOf(b.type); if (!stream) return null;
  const home = (b.meta && (b.meta.movedFrom || b.meta.from)) || ds;
  const id = (b.meta && b.meta.baseId) || String(b.id).split('~')[0];
  const x = streamDay(stream, home)[id];
  if (!x) return { stream, pos: 0, amount: 0, time: 0, recorded: false };
  // amount = units (topics / chapters) planned for the block; time = its share of the study time
  return { stream, ...x, time: x.amount, amount: x.recorded ? x.amount : unitsInSpan(streamQueue(stream), x.pos, x.amount) };
}
function enrich(b, ds) {
  swConvert(b, ds);
  b.meta = b.meta || {};
  if (!b.meta.baseId) b.meta.baseId = b.id;
  if (!b.detailOverride) {
    const stream = streamOf(b.type);
    if (stream) {
      const u = blockUnits(ds, b); const at = queueAt(streamQueue(stream), u.pos);
      const rec = u.recorded ? (MM.state.progress || []).filter((r) => r.homeDs === ((b.meta.movedFrom || b.meta.from) || ds) && r.baseId === b.meta.baseId).pop() : null;
      b.meta.detail = rec ? rec.from : at ? at.x.label : '';
      if (rec) { b.meta.doneUnits = rec.actual; b.meta.plannedUnits = rec.planned; }
      b.meta.units = Math.round(u.amount * 100) / 100; b.meta.unitInto = at ? Math.round(at.into * 100) / 100 : 0;
    } else if (b.type === 'solidworks') {
      const it = nextSwItem(); b.meta.detail = it ? it.title : '';
    }
  }
  return b;
}
/* ---- planner integration (js/planner.js does the actual fitting) ---- */
function planStartDate() { return (MM.state.settings && MM.state.settings.planStart) || MM_SEED.planStart; }
function planItems() { if (!Array.isArray(MM.state.items)) MM.state.items = []; return MM.state.items; }
function nowMin() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }
function restamp(min) { MM.state.planStamp = { date: mmTodayStr(), min: min == null ? nowMin() : min }; }
function planStamp() {
  const st = MM.state.planStamp;
  if (!st || st.date < mmTodayStr()) { restamp(); mmSave(MM.state); } // first open on a new day: replan from now
  return MM.state.planStamp;
}
function planHorizon() {
  let to = mmAddDays(planBaseDate(), 21);
  const bump = (d) => { if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) { const x = mmAddDays(d, 8); if (x > to) to = x; } };
  planItems().forEach((it) => {
    bump(it.date); bump(it.deadline); (it.log || []).forEach((l) => bump(l.ds));
    if (it.repeat && it.repeat.mode === 'dates') (it.repeat.dates || []).forEach(bump);
  });
  MM.state.missedQueue.forEach((q) => bump(q.rescheduleDate));
  const cap = mmAddDays(planBaseDate(), 400); return to > cap ? cap : to;
}
function planBaseDay(ds) { return { isRest: isRestDay(ds) && !MM.state.days[ds], blocks: routineBlocks(ds).map((b) => enrich(b, ds)) }; }
function computePlan() {
  return MMPlanner.buildPlan({
    planStart: planStartDate(), to: planHorizon(), stamp: planStamp(), baseDay: planBaseDay,
    prayers: (ds) => prayersFor(ds).map((p) => p.time), items: planItems(), missed: MM.state.missedQueue
  });
}
function currentPlan() {
  planStamp();
  const key = MM.rev + '|' + mmTodayStr() + '|' + JSON.stringify(MM.state.planStamp);
  if (!MM._plan || MM._plan.key !== key) MM._plan = { key, plan: computePlan() };
  return MM._plan.plan;
}
function fixedOnlyDay(ds) { // days before the plan start: only your own appointments / done task chunks
  const items = planItems().filter((it) => (it.kind === 'appt' && MMPlanner.occurrenceDates(it, ds, ds).length) || (it.kind === 'task' && (it.log || []).some((l) => l.ds === ds))).map((it) => (it.kind === 'task' ? { ...it, done: true } : it));
  if (!items.length) return { isRest: false, blocks: [] };
  return MMPlanner.buildPlan({ planStart: ds, to: ds, stamp: { date: ds, min: 0 }, baseDay: () => ({ isRest: false, blocks: [] }), items }).days[ds];
}
function getDay(ds) {
  const ps = planStartDate();
  let day;
  if (ds < ps) day = { ...clone(fixedOnlyDay(ds)), beforeStart: true };
  else {
    const plan = currentPlan();
    day = plan.days[ds] ? clone(plan.days[ds]) : planBaseDay(ds);
  }
  const status = MM.state.dayStatus[ds] || {};
  day.blocks.forEach((b) => { b.meta = b.meta || {}; if (b.meta.itemId || b.meta.queueId) b.status = b.status || ''; else b.status = status[b.id] || ''; });
  day.blocks.sort((a, b) => toMin(a.start) - toMin(b.start));
  return day;
}
function planWarnings() {
  const today = mmTodayStr();
  return currentPlan().warnings.filter((w) => w.t === 'overflow' || ((w.ds || '') >= today));
}
function itemBlockStatus(ds, b, status) {
  const it = planItems().find((x) => x.id === b.meta.itemId); if (!it) return;
  if (it.kind === 'appt') {
    if (status !== 'done') { toast(t('apptNoMiss')); return; }
    if (isSeries(it) && b.meta.occ) { const o = occOverride(it, b.meta.occ); o.done = !o.done; } else it.done = !it.done;
  }
  else if (b.meta.doneChunk != null) { if (status === 'done') { it.log.splice(b.meta.doneChunk, 1); it.done = false; it.doneAt = null; } }
  else if (status === 'done') {
    it.log = it.log || []; it.log.push({ ds, start: b.start, end: b.end });
    if (MMPlanner.taskRemaining(it) <= 0) { it.done = true; it.doneAt = mmTodayStr(); }
  } else if (status === 'missed') {
    restamp(ds === mmTodayStr() ? Math.max(nowMin(), endMin(b.end)) : null); toast(t('replanned'));
  }
  persist();
}
function findNextFreeDate(fromDs) {
  const ps0 = mmAddDays(planStartDate(), -1);
  let d = fromDs < ps0 ? ps0 : fromDs;
  for (let i = 0; i < 28; i++) {
    d = mmAddDays(d, 1);
    if (isRestDay(d)) continue;
    if (MM.state.missedQueue.filter((q) => q.rescheduleDate === d && !q.status).length < 3) return d;
  }
  return mmAddDays(fromDs, 1);
}
function isSeries(it) { return !!(it && it.kind === 'appt' && it.repeat && it.repeat.mode && it.repeat.mode !== 'none'); }
function occOverride(it, occ) { it.overrides = it.overrides || {}; return (it.overrides[occ] = it.overrides[occ] || {}); }
function setStatus(ds, b, status) {
  if (b.meta && b.meta.itemId) { itemBlockStatus(ds, b, status); return; }
  if (status === 'done' && b.status === 'done' && streamOf(b.type)) undoProgressFor(ds, b);
  if (b.meta && b.meta.queueId) {
    const q = MM.state.missedQueue.find((x) => x.id === b.meta.queueId);
    if (q) {
      if (status === 'missed') { q.rescheduleDate = findNextFreeDate(ds); q.status = ''; toast(`${t('rescheduled')} → ${q.rescheduleDate}`); }
      else q.status = q.status === status ? '' : status;
    }
  } else {
    MM.state.dayStatus[ds] = MM.state.dayStatus[ds] || {};
    const prev = MM.state.dayStatus[ds][b.id];
    if (prev === status) { delete MM.state.dayStatus[ds][b.id]; status = ''; } else MM.state.dayStatus[ds][b.id] = status;
    MM.state.missedQueue = MM.state.missedQueue.filter((q) => !(q.originalDate === ds && q.block.id === b.id && !q.status));
    if (status === 'missed' && WORK_TYPES.includes(b.type)) {
      const nd = findNextFreeDate(ds); const raw = clone(b); delete raw.status;
      MM.state.missedQueue.push({ id: mmUid('rq'), originalDate: ds, rescheduleDate: nd, block: raw, status: '' });
      toast(`${t('rescheduled')} → ${nd}`);
    }
  }
  persist();
}
/* ---- recording real progress ---- */
function unitObj(key) {
  const [k, id] = [key.slice(0, 3), key.slice(3)];
  if (k === 'ch:') return chapters().find((c) => c.id === id) || null;
  for (const c of MM.state.courses) { const tp = (c.topics || []).find((x) => x.id === id); if (tp) return tp; }
  return null;
}
/** What happens if `amount` units are recorded now: the item you'd stop at, and how much is consumed. */
function previewProgress(stream, amount) {
  const q = streamQueue(stream); const at = queueAt(q, Math.max(0, Number(amount) || 0), true);
  return { from: q[0] || null, next: at ? at.x : null, nextInto: at ? at.into : 0, finished: q.length && !at };
}
function recordProgress(ds, b, actual) {
  const stream = streamOf(b.type); if (!stream) return null;
  const u = blockUnits(ds, b);
  const amount = Math.max(0, Math.min(50, Math.round((Number(actual) || 0) * 100) / 100));
  const q = streamQueue(stream); const undo = []; let left = amount;
  const first = q[0] ? q[0].label : '';
  for (const x of q) {
    if (left <= 1e-9) break;
    const o = x.obj; const part = Number(o.part) || 0; const rem = 1 - part;
    undo.push({ key: x.key, part: o.part, done: o.done, doneDate: o.doneDate });
    if (left >= rem - 1e-9) { o.done = true; o.doneDate = ds; delete o.part; left -= rem; }
    else { o.part = Math.round((part + left) * 1000) / 1000; left = 0; }
  }
  if (b.status !== 'done') setStatus(ds, b, 'done');
  MM.state.progress = MM.state.progress || [];
  const rec = { id: mmUid('pg'), ds, blockId: b.id, baseId: (b.meta && b.meta.baseId) || String(b.id).split('~')[0], homeDs: (b.meta && (b.meta.movedFrom || b.meta.from)) || ds,
    stream, planned: Math.round(u.amount * 100) / 100, actual: amount, at: new Date().toISOString(), from: first, undo };
  MM.state.progress.push(rec);
  if (stream === 'rev') { // finished the active course? move on, like ticking the last topic in Study
    const ac = MM.state.courses.find((c) => c.code === MM.state.settings.activeCourse);
    if (ac && courseLeft(ac) === 0) MM.state.settings.activeCourse = null;
  }
  persist();
  return rec;
}
function progressFor(ds, b) {
  const baseId = (b.meta && b.meta.baseId) || String(b.id).split('~')[0];
  return (MM.state.progress || []).filter((r) => r.ds === ds && (r.blockId === b.id || r.baseId === baseId)).pop() || null;
}
function undoProgressFor(ds, b) {
  const r = progressFor(ds, b); if (!r) return false;
  r.undo.slice().reverse().forEach((u) => { const o = unitObj(u.key); if (!o) return; o.done = !!u.done; o.doneDate = u.doneDate || null; if (u.part == null) delete o.part; else o.part = u.part; });
  MM.state.progress = MM.state.progress.filter((x) => x !== r);
  return true;
}
function materialize(ds, scope) {
  if (scope === 'day') { if (!MM.state.days[ds]) MM.state.days[ds] = baseBlocks(ds); return MM.state.days[ds]; }
  const key = templateKey(ds);
  if (!MM.state.template[key] || !MM.state.template[key].length) MM.state.template[key] = templateFor(key, ds);
  return MM.state.template[key];
}
function stripBlock(b) {
  const o = { id: b.id, type: b.type, start: b.start, end: b.end };
  if (b.title) o.title = b.title; if (b.labelKey) o.labelKey = b.labelKey;
  if (b.notes) o.notes = b.notes; if (b.link) o.link = b.link;
  if (b.subtasks && b.subtasks.length) o.subtasks = b.subtasks;
  return o;
}
function saveBlock(ds, block, scope, isNew) {
  if (block.meta && block.meta.queueId) {
    const q = MM.state.missedQueue.find((x) => x.id === block.meta.queueId);
    if (q) q.block = { ...stripBlock(block), id: q.block.id };
    persist(); return;
  }
  const lists = [materialize(ds, scope)];
  if (scope === 'template' && MM.state.days[ds]) lists.push(MM.state.days[ds]);
  lists.forEach((list) => {
    const i = list.findIndex((x) => x.id === block.id);
    if (i >= 0) list[i] = stripBlock(block); else if (isNew || scope === 'template') list.push(stripBlock(block));
    list.sort((a, b) => toMin(a.start) - toMin(b.start));
  });
  persist();
}
function deleteBlock(ds, block, scope) {
  if (block.meta && block.meta.queueId) MM.state.missedQueue = MM.state.missedQueue.filter((q) => q.id !== block.meta.queueId);
  else {
    const lists = [materialize(ds, scope)];
    if (scope === 'template' && MM.state.days[ds]) lists.push(MM.state.days[ds]);
    lists.forEach((list) => { const i = list.findIndex((x) => x.id === block.id); if (i >= 0) list.splice(i, 1); });
  }
  persist();
}
function moveBlock(ds, id, dir) {
  const list = materialize(ds, 'day');
  list.sort((a, b) => toMin(a.start) - toMin(b.start));
  const i = list.findIndex((x) => x.id === id); const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  const [a, b] = dir < 0 ? [list[j], list[i]] : [list[i], list[j]];
  const s0 = toMin(a.start); const da = endMin(a.end) - toMin(a.start); const db = endMin(b.end) - toMin(b.start);
  b.start = fromMin(s0); b.end = fromMin(s0 + db); a.start = b.end; a.end = fromMin(s0 + db + da);
  list.sort((x, y) => toMin(x.start) - toMin(y.start));
  persist();
}

/* sheet helpers */
function openSheet(title, body, onMount) {
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop';
  bd.innerHTML = `<div class="modal sheet" role="dialog"><div class="sheet-grip"></div>
    <div class="row between sheet-head"><h3>${esc(title)}</h3><button class="btn sm ghost" data-close>✕</button></div>
    <div class="sheet-body">${body}</div></div>`;
  document.body.appendChild(bd);
  const close = () => bd.remove();
  bd.addEventListener('click', (e) => { if (e.target === bd) close(); });
  $('[data-close]', bd).onclick = close;
  if (onMount) onMount(bd, close);
  return close;
}
function subtaskEditor(list) {
  return `<div class="subtasks">${(list || []).map((s, i) => `
    <div class="subtask-row"><input type="checkbox" data-st-done="${i}" ${s.done ? 'checked' : ''}>
      <input data-st-text="${i}" value="${esc(s.t)}"><button class="btn sm ghost" data-st-del="${i}">✕</button></div>`).join('')}
    <div class="row"><input id="st-new" placeholder="${esc(t('addSubtask'))}" style="flex:1"><button class="btn sm" id="st-add">＋</button></div></div>`;
}
function wireSubtasks(root, arr, rerender) {
  $$('[data-st-done]', root).forEach((el) => { el.onchange = () => { arr[+el.dataset.stDone].done = el.checked; }; });
  $$('[data-st-text]', root).forEach((el) => { el.oninput = () => { arr[+el.dataset.stText].t = el.value; }; });
  $$('[data-st-del]', root).forEach((el) => { el.onclick = () => { arr.splice(+el.dataset.stDel, 1); rerender(); }; });
  const add = $('#st-add', root);
  if (add) add.onclick = () => { const v = $('#st-new', root).value.trim(); if (v) { arr.push({ t: v, done: false }); rerender(); } };
}
