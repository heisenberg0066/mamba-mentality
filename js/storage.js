const MM_STORAGE_KEY = 'mamba-mentality-v1'; // same key: v2 migrates in place
const MM_VERSION = 2;

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

/** Chain default deadlines course after course (topicsPerWeek pace). */
function mmAutoDeadlines(courses, topicsPerWeek, fromDate) {
  let cursor = fromDate || mmTodayStr();
  courses.forEach((c) => {
    if (c.priority === 'later') { return; }
    const left = c.topics.filter((t) => !t.done).length;
    if (!left) return;
    const weeks = Math.max(1, Math.ceil(left / topicsPerWeek));
    cursor = mmAddDays(cursor, weeks * 7);
    c.deadline = cursor;
  });
  return courses;
}

function mmSeedCourse(c) {
  const topics = (MM_TOPICS[c.code] || []).map((n) => ({ id: mmUid('t'), name: n, done: false }));
  return {
    id: c.code, code: c.code, title: c.title, priority: c.priority,
    topics, hours: topics.length * 3, deadline: null, notes: '', links: ''
  };
}

function mmDefaultPrayer() {
  return { method: 'MWL', asr: 'standard', highLat: 'AngleBased', offsets: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 } };
}

function mmDefaultState() {
  const courses = MM_SEED.courses.map(mmSeedCourse);
  mmAutoDeadlines(courses, 4, '2026-10-19');
  return {
    version: MM_VERSION,
    settings: {
      lang: 'en', jobMode: 'none', restDay: 'sunday', restMovedTo: null, gotJob: false,
      solidWorksStart: MM_SEED.solidWorksStart, morningRecapDismissedDate: null,
      activeCourse: null, calView: 'day',
      prayer: mmDefaultPrayer()
    },
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
    reminders: []
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
  s.notes = Array.isArray(parsed.notes) ? parsed.notes : [];

  // Swedish: v1 had { id: {done, doneAt} }
  if (!Array.isArray(parsed.swedishChapters)) {
    const old = parsed.swedish || {};
    s.swedishChapters = base.swedishChapters.map((c) => ({
      ...c, done: !!(old[c.id] && old[c.id].done), doneDate: (old[c.id] && old[c.id].doneAt) || null
    }));
  }
  delete s.swedish;

  // Courses: v1 had { code, title, priority, progress }
  if (Array.isArray(parsed.courses)) {
    s.courses = parsed.courses.map((c) => {
      if (Array.isArray(c.topics)) return { ...mmSeedCourse(c), ...c };
      const seeded = mmSeedCourse(c);
      const pct = Number(c.progress || 0);
      const nDone = Math.round((pct / 100) * seeded.topics.length);
      seeded.topics.forEach((t, i) => { t.done = i < nDone; });
      return seeded;
    });
    if (!parsed.courses.some((c) => c.deadline)) mmAutoDeadlines(s.courses, 4, '2026-10-19');
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
    return raw ? mmMigrate(JSON.parse(raw)) : mmDefaultState();
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
