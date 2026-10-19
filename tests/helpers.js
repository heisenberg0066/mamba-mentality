// Test helpers: load the real app scripts into a sandbox
const fs = require('fs'); const path = require('path'); const vm = require('vm');

// Load the real app scripts (same files the browser loads) into one sandbox.
function loadApp(fakeNow) {
  const store = {};
  const RealDate = Date;
  const NOW = new RealDate(fakeNow || '2026-10-19T09:00:00');
  class FakeDate extends RealDate { constructor(...a) { if (!a.length) super(NOW.getTime()); else super(...a); } static now() { return NOW.getTime(); } }
  const ctx = {
    console, Date: FakeDate, Math, JSON, setTimeout, clearTimeout, setInterval: () => 0,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    document: { querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, documentElement: { setAttribute() {} }, createElement: () => ({ style: {} }), body: { appendChild() {} } },
    navigator: {}, location: { search: '', protocol: 'file:' }, URLSearchParams
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.addEventListener = () => {};
  vm.createContext(ctx);
  ['data', 'i18n', 'i18n-v2', 'storage', 'ics', 'prayertimes', 'planner', 'core', 'calendar', 'items', 'tabs-study', 'notes', 'tabs-life']
    .forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' }));
  vm.runInContext('MM.state = mmDefaultState(); window.MM = MM;', ctx);
  ctx.store = store;
  return ctx;
}
const run = (app, code) => vm.runInContext(code, app);
const P = require('../js/planner.js');
const { tm, te } = P;

// ---------- helpers ----------
function setItems(app, items, stamp) {
  app.__items = items; app.__stamp = stamp || { date: '2026-10-19', min: 9 * 60 };
  run(app, 'MM.state.items = JSON.parse(JSON.stringify(__items)); MM.state.planStamp = __stamp; MM.rev++;');
}
function day(app, ds) { app.__ds = ds; return run(app, 'getDay(__ds)'); }
function plan(app) { return run(app, 'currentPlan()'); }
function overlaps(blocks) {
  const bad = []; const L = blocks.map((b) => ({ b, s: tm(b.start), e: te(b.end) }));
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    if (Math.min(L[i].e, L[j].e) > Math.max(L[i].s, L[j].s)) bad.push([L[i].b, L[j].b]);
  }
  return bad;
}
const isFixedItem = (b) => b.meta && b.meta.itemId && (b.meta.kind === 'appt' || b.meta.kind === 'travel');
const newlyPlaced = (b) => b.meta && (b.meta.auto || b.meta.rescheduled || (b.meta.itemId && b.meta.kind === 'task' && b.meta.doneChunk == null));
function dates(from, n) { const o = []; for (let i = 0; i < n; i++) o.push(P.addDays(from, i)); return o; }
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }


module.exports = { loadApp, run, P, tm, te, setItems, day, plan, overlaps, isFixedItem, newlyPlaced, dates, rng };
