const MM_APP_VERSION = '4.5.0';
const MM_STORAGE_KEY = 'mamba-mentality-v1'; // same key: v2 migrates in place
const MM_VERSION = 6; // v3: planner items (appointments/tasks), plan start date · v4: KTH MSc course group, 'ignore' priority
                      // v5: real study progress (partial units, progress log), repeating appointments, per-day drops
                      // v6: strictly sequential course revision (one whole course at a time) — course deadlines re-planned once

function mmUid(p) { return (p || 'id') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function mmTodayStr(d) {
  const x = d || new Date();
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
}
function mmNowHM() {
  const x = new Date();
  return String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0');
}
function mmAddDays(ds, n) { const d = new Date(ds + 'T12:00:00'); d.setDate(d.getDate() + n); return mmTodayStr(d); }
function mmMonthKey(d) { const x = d || new Date(); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); }
function mmIsoWeek(d) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return x.getUTCFullYear() + '-W' + String(Math.ceil(((x - y0) / 864e5 + 1) / 7)).padStart(2, '0');
}

const MM_PRIORITIES = ['high', 'quick', 'later', 'ignore']; // high = KEEP; ignore is never scheduled, later comes after the main run
const MM_GROUPS = ['kfupm', 'kth'];
const MM_PACE = { none: 4, 'part-time': 2.5, 'full-time': 1.5 }; // topics / week (same as PACE_BY_MODE)
function mmIsScheduled(c) { return !!c && (c.priority === 'high' || c.priority === 'quick' || c.priority === 'later'); }
/** Time weight of one topic: a quick pass gets half the time of a full topic. */
function mmTopicWeight(c) { return c && c.priority === 'quick' ? 0.5 : 1; }
function mmCodeKey(code) { return String(code || '').toUpperCase().replace(/[\s\-_.]/g, ''); }
function mmCourseGroup(c) { return MM_GROUPS.includes(c && c.group) ? c.group : 'kfupm'; }

/** Course number parts: 'MATH 101' → { pre: 'MATH', num: 101 }, 'SE1025' → { pre: 'SE', num: 1025 }. */
function mmCodeParts(code) {
  const m = /^\s*([A-Za-z]+)\s*-?\s*(\d+)/.exec(String(code || ''));
  return m ? { pre: m[1].toUpperCase(), num: Number(m[2]) } : { pre: String(code || '').toUpperCase(), num: 9999 };
}
/**
 * v4.5 course order (one whole course at a time).
 *  KFUPM (high + quick together = the main run): all MATH by number → all PHYS by number → the rest by
 *  study year (1xx = year 1 … 4xx = year 4), then number, then code. A quick course keeps its year position.
 *  Then KFUPM 'later' courses (same rule). Then KTH MSc: high → quick → later, each by course code.
 *  'ignore' is never scheduled.
 */
function mmCourseSortKey(c) {
  const g = MM_GROUPS.indexOf(mmCourseGroup(c));
  const { pre, num } = mmCodeParts(c.code);
  const code = String(c.code || '').toUpperCase();
  if (mmCourseGroup(c) === 'kfupm') {
    const tier = c.priority === 'later' ? 1 : 0;
    const band = pre === 'MATH' ? 0 : pre === 'PHYS' ? 1 : 2;
    const level = num < 1000 ? Math.floor(num / 100) : 9;
    return [g, tier, band, level, num, code];
  }
  return [g, { high: 0, quick: 1, later: 2 }[c.priority] ?? 3, 0, 0, 0, code];
}
function mmCompareKeys(a, b) {
  for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; }
  return 0;
}
/** Every scheduled course (done ones included) in revision order. */
function mmCourseOrder(courses) {
  const list = (courses || []).filter((c) => mmIsScheduled(c) && Array.isArray(c.topics));
  return list.map((c, i) => ({ c, i, k: mmCourseSortKey(c) })).sort((x, y) => mmCompareKeys(x.k, y.k) || x.i - y.i).map((x) => x.c);
}
/**
 * Revision order as a flat list of { course, topic }: strictly one course after the other (mmCourseOrder),
 * never interleaved. Done topics are skipped, so finished courses/topics stay finished and the sequence starts at the
 * first unfinished topic of the first unfinished course. Inside a course a topic you already started comes first.
 * (activeCode is accepted for compatibility and ignored: the order decides.)
 */
function mmRevisionSequence(courses) {
  const seq = [];
  mmCourseOrder(courses).forEach((c) => {
    const open = c.topics.filter((x) => !x.done);
    const part = (x) => Number(x.part) > 0 && Number(x.part) < 1;
    open.filter(part).concat(open.filter((x) => !part(x))).forEach((tp) => seq.push({ course: c, topic: tp }));
  });
  return seq;
}

/** Default deadlines from the sequential revision order (topicsPerWeek pace, quick topics count half). onlyCodes: limit which courses get one. */
function mmAutoDeadlines(courses, topicsPerWeek, fromDate, activeCode, onlyCodes) {
  const from = fromDate || mmTodayStr(); const pace = Math.max(0.1, Number(topicsPerWeek) || 4);
  const lastPos = new Map(); let acc = 0;
  mmRevisionSequence(courses).forEach((x) => { acc += mmTopicWeight(x.course) * Math.max(0, 1 - (Number(x.topic.part) || 0)); lastPos.set(x.course, acc); });
  lastPos.forEach((pos, c) => {
    if (onlyCodes && !onlyCodes.includes(c.code)) return;
    c.deadline = mmAddDays(from, Math.max(7, Math.ceil((pos / pace) * 7)));
  });
  return courses;
}

function mmSeedCourse(c) {
  const topics = (MM_TOPICS[c.code] || []).map((n) => ({ id: mmUid('t'), name: n, done: false }));
  return {
    id: c.code, code: c.code, title: c.title, priority: c.priority, group: mmCourseGroup(c),
    topics, hours: topics.length * 3, deadline: null, notes: c.notes || '', links: c.links || '',
    ...(c.swLink ? { swLink: true } : {})
  };
}

function mmKthSeedCourses() { return MM_SEED.kthCourses.map((c) => mmSeedCourse({ ...c, group: 'kth' })); }

function mmDefaultPrayer() {
  return { method: 'MWL', asr: 'standard', highLat: 'AngleBased', offsets: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 } };
}

function mmDefaultState() {
  const courses = MM_SEED.courses.map(mmSeedCourse).concat(mmKthSeedCourses());
  mmAutoDeadlines(courses, 4, MM_SEED.planStart);
  return {
    version: MM_VERSION,
    settings: {
      lang: 'en', jobMode: 'none', restDay: 'sunday', restMovedTo: null, gotJob: false,
      solidWorksStart: MM_SEED.solidWorksStart, morningRecapDismissedDate: null,
      activeCourse: null, calView: 'day',
      prayer: mmDefaultPrayer(),
      planStart: MM_SEED.planStart
    },
    items: [],          // planner items: { kind:'appt'|'task', ... } — see js/items.js
    planStamp: null,    // { date, min } — the moment the plan was last recalculated
    template: {},       // { '0'..'6', 'rest': [blocks] } — only when customised
    days: {},           // { 'YYYY-MM-DD': [blocks] } — per-day overrides
    dayStatus: {},
    missedQueue: [],
    swedishChapters: MM_SEED.swedishChapters.map((c) => ({ ...c, done: false, doneDate: null, notes: '' })),
    courses,
    solidworks: {
      logs: [],
      items: MM_SW_ITEMS.map((t) => ({ id: mmUid('sw'), title: t, done: false, notes: '', link: '', date: null }))
    },
    money: {
      income: 7000, fixed: 5500, life: 1500, // defaults for months without own settings
      months: {}, rollover: true, examGoal: null, spends: [], planned: []
    },
    jobApps: {},        // { '2026-W42': { field, retail } }
    goalsMeta: {},      // { goalId: { notes, target, link } }
    sunday: { checklist: { reviewGoals: false, backup: false, restDay: false, courses: false, swedish: false }, notes: '', weekKey: null },
    notes: [],
    reminders: [],
    progress: [],       // v5: [{ id, ds, blockId, baseId, homeDs, stream, planned, actual, at, undo:[...] }] — what you really finished
    dayDrops: {}        // v5: { 'YYYY-MM-DD': [routine block ids you chose to drop that day] }
  };
}

/** Migrate any older (v1) or partial state to v2. */
function mmMigrate(parsed) {
  const base = mmDefaultState();
  if (!parsed || typeof parsed !== 'object') return base;
  const s = { ...base, ...parsed };
  s.settings = { ...base.settings, ...(parsed.settings || {}) };
  const pp = (parsed.settings && parsed.settings.prayer) || {};
  s.settings.prayer = { ...mmDefaultPrayer(), ...pp, offsets: { ...mmDefaultPrayer().offsets, ...(pp.offsets || {}) } };
  s.money = { ...base.money, ...(parsed.money || {}) };
  s.money.months = s.money.months || {};
  s.sunday = { ...base.sunday, ...(parsed.sunday || {}), checklist: { ...base.sunday.checklist, ...((parsed.sunday || {}).checklist || {}) } };
  s.dayStatus = parsed.dayStatus || {};
  s.missedQueue = parsed.missedQueue || [];
  s.template = parsed.template || {};
  s.days = parsed.days || {};
  s.jobApps = parsed.jobApps || {};
  s.goalsMeta = parsed.goalsMeta || {};
  s.notes = Array.isArray(parsed.notes) ? parsed.notes.filter((n) => n && typeof n === 'object') : [];
  s.notes.forEach((n) => { n.done = !!n.done; if (!n.done || !n.doneAt || isNaN(Date.parse(n.doneAt))) n.doneAt = n.done ? new Date().toISOString() : null; }); // v4.4: crossed-out notes
  // v3: planner items + plan start date
  s.items = Array.isArray(parsed.items) ? parsed.items.filter((x) => x && x.id && (x.kind === 'appt' || x.kind === 'task')) : [];
  s.items.forEach((x) => { if (x.kind === 'task' && !Array.isArray(x.log)) x.log = []; });
  s.planStamp = parsed.planStamp && parsed.planStamp.date ? parsed.planStamp : null;
  // v5: progress log, per-day drops, repeating appointments
  s.progress = Array.isArray(parsed.progress) ? parsed.progress.filter((r) => r && r.id && r.stream) : [];
  s.dayDrops = parsed.dayDrops && typeof parsed.dayDrops === 'object' && !Array.isArray(parsed.dayDrops) ? parsed.dayDrops : {};
  s.items.forEach((x) => {
    if (x.kind === 'appt') {
      const r = x.repeat && typeof x.repeat === 'object' ? x.repeat : { mode: 'none' };
      if (!['none', 'weekly', 'dates'].includes(r.mode)) r.mode = 'none';
      if (r.mode === 'weekly') r.days = Array.isArray(r.days) ? r.days.map(Number).filter((d) => d >= 0 && d <= 6) : [];
      if (r.mode === 'dates') r.dates = Array.isArray(r.dates) ? r.dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort() : [];
      x.repeat = r;
      if (!Array.isArray(x.skip)) x.skip = [];
      if (!x.overrides || typeof x.overrides !== 'object') x.overrides = {};
    }
    if (x.kind === 'task' && !Array.isArray(x.skipDays)) x.skipDays = [];
  });
  if (!s.settings.planStart || !/^\d{4}-\d{2}-\d{2}$/.test(s.settings.planStart)) s.settings.planStart = MM_SEED.planStart;

  // Swedish: v1 had { id: {done, doneAt} }
  if (!Array.isArray(parsed.swedishChapters)) {
    const old = parsed.swedish || {};
    s.swedishChapters = base.swedishChapters.map((c) => ({
      ...c, done: !!(old[c.id] && old[c.id].done), doneDate: (old[c.id] && old[c.id].doneAt) || null
    }));
  }
  delete s.swedish;

  // Courses: v1 had { code, title, priority, progress }
  const kthKeys = new Set(MM_SEED.kthCourses.map((c) => mmCodeKey(c.code)));
  if (Array.isArray(parsed.courses)) {
    s.courses = parsed.courses.filter((c) => c && typeof c === 'object').map((c) => {
      if (!MM_GROUPS.includes(c.group)) c = { ...c, group: kthKeys.has(mmCodeKey(c.code)) ? 'kth' : 'kfupm' };
      if (Array.isArray(c.topics)) return { ...mmSeedCourse(c), ...c };
      const seeded = mmSeedCourse(c);
      const pct = Number(c.progress || 0);
      const nDone = Math.round((pct / 100) * seeded.topics.length);
      seeded.topics.forEach((t, i) => { t.done = i < nDone; });
      return seeded;
    });
    if (!parsed.courses.some((c) => c && c.deadline)) mmAutoDeadlines(s.courses, 4, MM_SEED.planStart);
  }
  // v4: every course has a group + a known priority; the KTH MSc group is added once (existing data untouched)
  s.courses.forEach((c) => {
    if (!MM_GROUPS.includes(c.group)) c.group = kthKeys.has(mmCodeKey(c.code)) ? 'kth' : 'kfupm';
    if (!MM_PRIORITIES.includes(c.priority)) c.priority = 'high';
  });
  if (Array.isArray(parsed.courses) && (Number(parsed.version) || 1) < 4) {
    const have = new Set(s.courses.map((c) => mmCodeKey(c.code)));
    const added = mmKthSeedCourses().filter((c) => !have.has(mmCodeKey(c.code)));
    s.courses = s.courses.concat(added);
    const td = mmTodayStr(); const from = s.settings.planStart > td ? s.settings.planStart : td;
    mmAutoDeadlines(s.courses, MM_PACE[s.settings.jobMode] || 4, from, s.settings.activeCourse, added.map((c) => c.code));
  }

  // v6: revision became strictly sequential — re-plan the course deadlines once along the new order (done topics untouched;
  // the old data is kept in the -backup-v<old> copy by mmLoad)
  const pv = Number(parsed.version) || 1;
  if (Array.isArray(parsed.courses) && pv >= 4 && pv < 6) {
    const td = mmTodayStr(); const from = s.settings.planStart > td ? s.settings.planStart : td;
    mmAutoDeadlines(s.courses, MM_PACE[s.settings.jobMode] || 4, from);
    const first = mmRevisionSequence(s.courses)[0];
    s.settings.activeCourse = first ? first.course.code : null;
  }

  // SolidWorks
  s.solidworks = { ...base.solidworks, ...(parsed.solidworks || {}) };
  if (!Array.isArray(s.solidworks.items)) s.solidworks.items = base.solidworks.items;
  if (!Array.isArray(s.solidworks.logs)) s.solidworks.logs = [];

  s.version = MM_VERSION;
  return s;
}

function mmLoad() {
  try {
    const raw = localStorage.getItem(MM_STORAGE_KEY);
    if (!raw) return mmDefaultState();
    const parsed = JSON.parse(raw);
    const v = Number(parsed && parsed.version) || 1;
    if (v < MM_VERSION) { // keep an untouched copy of the old data before upgrading it
      const bk = MM_STORAGE_KEY + '-backup-v' + v;
      try { if (!localStorage.getItem(bk)) localStorage.setItem(bk, raw); } catch (e) { console.warn('backup failed', e); }
    }
    const s = mmMigrate(parsed);
    if (v < MM_VERSION) mmSave(s);
    return s;
  } catch (e) {
    console.warn('load failed', e);
    return mmDefaultState();
  }
}
function mmSave(state) { localStorage.setItem(MM_STORAGE_KEY, JSON.stringify(state)); }

function mmDownload(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function mmExport(state) {
  mmDownload(`mamba-mentality-backup-${mmTodayStr()}.json`, JSON.stringify(state, null, 2), 'application/json');
}
function mmImport(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!d || typeof d !== 'object' || !d.settings) throw new Error('bad');
        resolve(mmMigrate(d));
      } catch (e) { reject(e); }
    };
    r.onerror = reject;
    r.readAsText(file);
  });
}
