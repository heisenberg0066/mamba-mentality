// Scheduler tests — run with: node --test tests/planner.test.js
const test = require('node:test');
const assert = require('node:assert');
const { loadApp, run, P, tm, te, setItems, day, plan, overlaps, isFixedItem, newlyPlaced, dates, rng } = require('./helpers.js');

// ---------- plan start date ----------
test('plan start: defaults to Wed 2026-10-21; nothing planned Mon 19 / Tue 20', () => {
  const app = loadApp();
  assert.strictEqual(run(app, 'planStartDate()'), '2026-10-21');
  assert.strictEqual(day(app, '2026-10-19').blocks.length, 0);
  assert.strictEqual(day(app, '2026-10-20').blocks.length, 0);
  assert.ok(day(app, '2026-10-21').blocks.length > 5, 'Wednesday has the routine');
  assert.ok(day(app, '2026-10-21').blocks.some((b) => b.type === 'revision'));
});
test('plan start: tasks are never scheduled before the start date; own appointments still show', () => {
  const app = loadApp();
  setItems(app, [
    { id: 'a1', kind: 'appt', title: 'Dentist', date: '2026-10-20', start: '10:00', duration: 60, travelBefore: 15, travelAfter: 15 },
    { id: 't1', kind: 'task', title: 'CV', deadline: '2026-10-25', effort: 180, splittable: true, chunk: 60, priority: 'high', log: [] }
  ]);
  const d20 = day(app, '2026-10-20');
  assert.deepStrictEqual(d20.blocks.map((b) => b.type).sort(), ['appt', 'travel', 'travel']);
  const p = plan(app);
  assert.ok(Object.keys(p.days).every((d) => d >= '2026-10-21'));
  p.tasks.t1.chunks.forEach((c) => assert.ok(c.ds >= '2026-10-21' && c.ds <= '2026-10-25'));
  assert.strictEqual(p.tasks.t1.placed, 180);
});
test('plan start: is a configurable setting and the routine follows it', () => {
  const app = loadApp();
  run(app, "MM.state.settings.planStart = '2026-10-23'; MM.rev++;");
  assert.strictEqual(day(app, '2026-10-22').blocks.length, 0);
  assert.ok(day(app, '2026-10-23').blocks.length > 5);
});
test('migration: old v2 data gets planStart 2026-10-21, empty items, keeps its data', () => {
  const app = loadApp();
  const old = { version: 2, settings: { lang: 'sv', jobMode: 'part-time', restDay: 'sunday' }, notes: [{ id: 'n1', text: 'hej' }], dayStatus: { '2026-10-15': { jobs: 'done' } }, money: { income: 9000 } };
  app.__old = old;
  const s = run(app, 'mmMigrate(JSON.parse(JSON.stringify(__old)))');
  assert.strictEqual(s.version, run(app, 'MM_VERSION'));
  assert.strictEqual(s.settings.planStart, '2026-10-21');
  assert.strictEqual(s.settings.lang, 'sv');
  assert.strictEqual(s.settings.jobMode, 'part-time');
  assert.strictEqual(JSON.stringify(s.items), '[]');
  assert.strictEqual(s.notes.length, 1);
  assert.strictEqual(s.money.income, 9000);
  // items + planStart survive an export → import round trip
  app.__s2 = { ...s, items: [{ id: 'x', kind: 'appt', title: 'A', date: '2026-10-22', start: '09:00', duration: 30 }], settings: { ...s.settings, planStart: '2026-10-24' } };
  const s2 = run(app, 'mmMigrate(JSON.parse(JSON.stringify(__s2)))');
  assert.strictEqual(s2.items.length, 1); assert.strictEqual(s2.settings.planStart, '2026-10-24');
});

// ---------- the doctor appointment case ----------
test('doctor appointment: blocks the slot + travel completely, displaced study is moved, not overlapped', () => {
  const app = loadApp();
  const before = day(app, '2026-10-21');
  const rev = before.blocks.find((b) => b.type === 'revision');
  assert.strictEqual(rev.start, '10:00'); // routine: revision 10:00–12:00 on a no-job Wednesday
  setItems(app, [{ id: 'doc', kind: 'appt', title: 'Doctor', date: '2026-10-21', start: '10:00', duration: 60, travelBefore: 30, travelAfter: 30 }]);
  const d = day(app, '2026-10-21');
  const appt = d.blocks.find((b) => b.type === 'appt');
  assert.strictEqual(appt.start, '10:00'); assert.strictEqual(appt.end, '11:00');
  const blocked = [tm('09:30'), tm('11:30')];
  d.blocks.filter((b) => !isFixedItem(b)).forEach((b) => {
    assert.ok(te(b.end) <= blocked[0] || tm(b.start) >= blocked[1], `${b.type} ${b.start}-${b.end} overlaps the doctor slot`);
  });
  assert.deepStrictEqual(overlaps(d.blocks), []);
  const p = plan(app);
  const movedRev = p.log.filter((x) => x.t === 'moved' && x.type === 'revision');
  assert.ok(movedRev.length >= 1, 'revision minutes were re-homed');
  movedRev.forEach((m) => { const dd = day(app, m.ds); assert.deepStrictEqual(overlaps(dd.blocks), []); });
  // The 30 min of Swedish (09:00–10:00 cut to 09:00–09:30) still exists
  assert.ok(d.blocks.some((b) => b.type === 'swedish' && b.start === '09:00' && b.end === '09:30'));
});
test('appointment over lunch: lunch is re-placed next to it (not dropped, not overlapped)', () => {
  const app = loadApp();
  setItems(app, [{ id: 'int', kind: 'appt', title: 'Interview', date: '2026-10-22', start: '11:30', end: '13:00', travelBefore: 30, travelAfter: 30 }]);
  const d = day(app, '2026-10-22');
  const lunch = d.blocks.find((b) => b.labelKey === 'blockLunch');
  assert.ok(lunch, 'lunch still exists');
  assert.ok(tm(lunch.start) >= tm('13:30') || te(lunch.end) <= tm('11:00'));
  assert.ok(te(lunch.end) - tm(lunch.start) >= 30);
  assert.deepStrictEqual(overlaps(d.blocks), []);
});
test('evening appointment cuts chill but keeps the rest of it; warns if under 1 h', () => {
  const app = loadApp();
  const chillOf = (d) => d.blocks.filter((b) => b.type === 'chill').reduce((a, b) => a + te(b.end) - tm(b.start), 0);
  setItems(app, [{ id: 'm', kind: 'appt', title: 'Meetup', date: '2026-10-22', start: '19:30', end: '20:30', travelBefore: 20, travelAfter: 20 }]);
  let d = day(app, '2026-10-22');
  assert.deepStrictEqual(overlaps(d.blocks), []);
  assert.strictEqual(chillOf(d), 70); // 20:50–22:00 kept (19:00–19:10 is too short to keep)
  assert.ok(plan(app).log.some((x) => x.t === 'shortened' && x.type === 'chill' && x.ds === '2026-10-22'));
  assert.strictEqual(plan(app).warnings.filter((x) => x.t === 'chill').length, 0);
  // a long evening event eats the whole chill → explicit warning
  setItems(app, [{ id: 'm', kind: 'appt', title: 'Meetup', date: '2026-10-22', start: '19:30', end: '21:30', travelBefore: 20, travelAfter: 20 }]);
  d = day(app, '2026-10-22');
  assert.deepStrictEqual(overlaps(d.blocks), []);
  assert.ok(chillOf(d) < 60);
  assert.strictEqual(plan(app).warnings.filter((x) => x.t === 'chill' && x.ds === '2026-10-22').length, 1);
});

// ---------- deadline fitting ----------
test('deadline task (splittable) is fully placed before its deadline in real free slots', () => {
  const app = loadApp();
  setItems(app, [{ id: 'cl', kind: 'task', title: 'Cover letter', deadline: '2026-10-23', effort: 120, splittable: true, chunk: 60, priority: 'normal', log: [] }]);
  const p = plan(app);
  assert.strictEqual(p.tasks.cl.placed, 120);
  p.tasks.cl.chunks.forEach((c) => { assert.ok(c.ds >= '2026-10-21' && c.ds <= '2026-10-23'); });
  // first choice is a free buffer hour (costs no routine work), and it does not clash with a prayer time
  const first = p.tasks.cl.chunks[0];
  const base = run(app, `planBaseDay('${first.ds}')`).blocks.find((b) => b.type === 'buffer');
  assert.ok(first.s >= tm(base.start) && first.e <= te(base.end), 'placed in the free buffer');
  run(app, `prayersFor('${first.ds}')`).forEach((x) => { const pm = tm(x.time); assert.ok(first.e <= pm || first.s >= pm + 15); });
  dates('2026-10-21', 3).forEach((ds) => assert.deepStrictEqual(overlaps(day(app, ds).blocks), []));
  assert.strictEqual(p.warnings.filter((w) => w.t === 'overflow').length, 0);
});
test('non-splittable 4 h task gets one contiguous slot, avoids prayers/meals/chill, displaced work is re-homed', () => {
  const app = loadApp();
  setItems(app, [{ id: 'rep', kind: 'task', title: 'Thesis report', deadline: '2026-10-22', effort: 240, splittable: false, priority: 'high', log: [] }]);
  const p = plan(app);
  assert.strictEqual(p.tasks.rep.chunks.length, 1);
  const c = p.tasks.rep.chunks[0]; assert.strictEqual(c.e - c.s, 240);
  const d = day(app, c.ds);
  assert.deepStrictEqual(overlaps(d.blocks), []);
  const prayers = run(app, `prayersFor('${c.ds}')`).map((x) => tm(x.time));
  prayers.forEach((pm) => assert.ok(c.e <= pm || c.s >= pm + 15, 'task overlaps a prayer window'));
  assert.ok(p.log.some((x) => x.t === 'moved' || x.t === 'dropped' || x.t === 'shortened'), 'routine work was displaced visibly');
});
test('higher urgency first: two tasks compete, earliest deadline is placed first', () => {
  const app = loadApp();
  setItems(app, [
    { id: 'late', kind: 'task', title: 'Later', deadline: '2026-10-30', effort: 60, splittable: false, priority: 'normal', log: [], createdAt: '1' },
    { id: 'soon', kind: 'task', title: 'Soon', deadline: '2026-10-21', effort: 60, splittable: false, priority: 'normal', log: [], createdAt: '2' }
  ]);
  const p = plan(app);
  assert.strictEqual(p.tasks.soon.chunks[0].ds, '2026-10-21');
  assert.strictEqual(p.tasks.late.placed, 60);
});
test('completing a chunk records it and the rest is replanned; completing the task frees its time', () => {
  const app = loadApp();
  setItems(app, [{ id: 'x', kind: 'task', title: 'Portfolio', deadline: '2026-10-24', effort: 120, splittable: true, chunk: 60, priority: 'normal', log: [] }]);
  const p = plan(app); const c = p.tasks.x.chunks[0];
  app.__c = c;
  run(app, "const _b = getDay(__c.ds).blocks.find((b) => b.meta.itemId === 'x' && b.start === MMPlanner.hm(__c.s)); setStatus(__c.ds, _b, 'done');");
  const it = run(app, "MM.state.items.find((i) => i.id === 'x')");
  assert.strictEqual(it.log.length, 1); assert.strictEqual(P.taskRemaining(it), 60);
  const p2 = plan(app); assert.strictEqual(p2.tasks.x.need, 60); assert.strictEqual(p2.tasks.x.placed, 60);
  assert.ok(day(app, c.ds).blocks.some((b) => b.meta.itemId === 'x' && b.status === 'done'));
  run(app, "MM.state.items[0].done = true; MM.rev++;");
  assert.strictEqual(plan(app).tasks.x, undefined);
});

// ---------- realism: overflow warning ----------
test('overflow: an impossible task produces a warning with suggestions (no silent overbooking)', () => {
  const app = loadApp();
  setItems(app, [
    { id: 'small', kind: 'task', title: 'Small low task', deadline: '2026-10-21', effort: 60, splittable: false, priority: 'low', log: [], createdAt: '1' },
    { id: 'huge', kind: 'task', title: 'Huge', deadline: '2026-10-21', effort: 900, splittable: false, priority: 'high', log: [], createdAt: '2' }
  ]);
  const p = plan(app);
  const w = p.warnings.find((x) => x.t === 'overflow' && x.item === 'huge');
  assert.ok(w, 'warning present'); assert.strictEqual(w.placed, 0); assert.strictEqual(w.need, 900);
  const codes = w.suggestions.map((s) => s.code);
  assert.ok(codes.includes('split')); assert.ok(codes.includes('shorten')); assert.ok(codes.includes('extend'));
  assert.deepStrictEqual(overlaps(day(app, '2026-10-21').blocks), []);
  // a splittable version places what fits and warns about the rest
  setItems(app, [{ id: 'huge', kind: 'task', title: 'Huge', deadline: '2026-10-21', effort: 900, splittable: true, chunk: 60, priority: 'high', log: [] }]);
  const p2 = plan(app); const w2 = p2.warnings.find((x) => x.item === 'huge');
  assert.ok(w2 && w2.placed > 0 && w2.placed < 900);
  assert.deepStrictEqual(overlaps(day(app, '2026-10-21').blocks), []);
});
test('overflow: a task due today (before the plan start) warns and points to the plan start date', () => {
  const app = loadApp();
  setItems(app, [{ id: 'td', kind: 'task', title: 'Call Arbetsförmedlingen', deadline: '2026-10-19', effort: 30, splittable: false, priority: 'high', log: [] }]);
  const w = plan(app).warnings.find((x) => x.item === 'td');
  assert.ok(w); assert.ok(w.suggestions.some((s) => s.code === 'planStart' && s.date === '2026-10-21'));
});
test('summary diff + undo data: diffLogs only reports what changed', () => {
  const a = [{ t: 'moved', title: '', type: 'revision', fromDs: 'd', fromS: '10:00', ds: 'd', s: '15:00', e: '16:00' }];
  const b = a.concat([{ t: 'placed', item: 'z', title: 'Z', type: 'task', ds: 'd', s: '09:00', e: '10:00' }]);
  assert.deepStrictEqual(P.diffLogs(a, b).map((x) => x.t), ['placed']);
});

// ---------- many random scenarios: never double-book ----------
test('random scenarios: never any overlap, tasks within [start, deadline], no prayer clashes for new placements', () => {
  const R = rng(20261019);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  let checkedDays = 0, scenarios = 0;
  for (let n = 0; n < 60; n++) {
    const app = loadApp();
    run(app, `MM.state.settings.jobMode = '${pick(['none', 'part-time', 'full-time'])}'; MM.state.settings.restDay = '${pick(['sunday', 'saturday'])}';`);
    const days = dates('2026-10-19', 14);
    const items = [];
    const nA = Math.floor(R() * 8);
    for (let i = 0; i < nA; i++) {
      const s = 6 * 60 + Math.floor(R() * 60) * 15 - 60; const dur = pick([15, 30, 45, 60, 90, 120, 180, 240]);
      const st = Math.max(0, Math.min(23 * 60, s));
      items.push({ id: 'a' + i, kind: 'appt', title: 'A' + i, date: pick(days), start: P.hm(st), duration: Math.min(dur, 1440 - st), travelBefore: pick([0, 0, 15, 30, 45]), travelAfter: pick([0, 15, 30, 60]) });
    }
    const nT = Math.floor(R() * 7);
    for (let i = 0; i < nT; i++) {
      items.push({ id: 't' + i, kind: 'task', title: 'T' + i, deadline: pick(days), effort: pick([15, 30, 60, 90, 120, 240, 480, 720]), splittable: R() < 0.6, chunk: pick([30, 60, 90, 120]), priority: pick(['high', 'normal', 'low']), log: [], createdAt: String(i) });
    }
    setItems(app, items, { date: '2026-10-19', min: Math.floor(R() * 64) * 15 + 360 });
    // random missed blocks too
    if (R() < 0.5) run(app, `MM.state.missedQueue.push({ id: 'q1', originalDate: '2026-10-21', rescheduleDate: '2026-10-22', status: '', block: { id: 'swedish', type: 'swedish', start: '09:00', end: '10:00', labelKey: 'blockSwedish' } }); MM.rev++;`);
    const p = plan(app); scenarios++;
    days.forEach((ds) => {
      const d = day(app, ds); checkedDays++;
      const bad = overlaps(d.blocks).filter(([x, y]) => !(isFixedItem(x) && isFixedItem(y) && x.meta.itemId !== y.meta.itemId));
      assert.deepStrictEqual(bad.map(([x, y]) => `${ds} ${x.id} ${x.start}-${x.end} × ${y.id} ${y.start}-${y.end}`), []);
      // pairs of overlapping appointments must be reported as conflicts
      overlaps(d.blocks).filter(([x, y]) => isFixedItem(x) && isFixedItem(y) && x.meta.itemId !== y.meta.itemId).forEach(([x, y]) => {
        assert.ok(p.warnings.some((w) => w.t === 'conflict' && [w.a, w.b].includes(x.meta.itemId) && [w.a, w.b].includes(y.meta.itemId)));
      });
      if (ds < '2026-10-21') assert.ok(d.blocks.every(isFixedItem), 'only own appointments before plan start');
      d.blocks.forEach((b) => assert.ok(te(b.end) > tm(b.start), 'positive length ' + b.id));
      const prayers = ds >= '2026-10-21' ? run(app, `prayersFor('${ds}')`).map((x) => tm(x.time)) : [];
      d.blocks.filter(newlyPlaced).forEach((b) => {
        assert.ok(tm(b.start) >= 360, 'nothing new placed in sleep time');
        prayers.forEach((pm) => assert.ok(te(b.end) <= pm || tm(b.start) >= pm + 15, `${b.id} clashes with prayer`));
      });
      d.blocks.filter((b) => b.meta && b.meta.kind === 'task' && b.meta.doneChunk == null).forEach((b) => {
        const it = items.find((x) => x.id === b.meta.itemId);
        assert.ok(ds >= '2026-10-21' && ds <= it.deadline, 'task inside its window');
        assert.ok(!d.isRest, 'tasks are not put on the rest day');
      });
    });
    items.filter((x) => x.kind === 'task').forEach((it) => {
      const inf = p.tasks[it.id];
      assert.ok(inf.placed <= it.effort);
      if (!it.splittable && inf.placed) assert.strictEqual(inf.chunks.length, 1);
      if (inf.placed < it.effort) assert.ok(p.warnings.some((w) => w.t === 'overflow' && w.item === it.id), 'unfit task must warn');
    });
  }
  assert.ok(scenarios === 60 && checkedDays === 840);
});

// ---------- KTH MSc revision group (v4.2) ----------
const KTH_HIGH = ['SE1025', 'SE2132', 'SE2860', 'SE2126', 'SE2137', 'SE2139', 'SD2420', 'SD2150', 'MF2019'];
const KTH_QUICK = ['SE2123', 'MG2033', 'SG2211', 'SE202X'];
const KTH_IGNORE = ['AK2030', 'SA2002'];
const revCodes = (app, from, n) => dates(from, n).flatMap((ds) => day(app, ds).blocks
  .filter((b) => b.type === 'revision' || b.type === 'deep').map((b) => (b.meta.detail || '').split(' — ')[0]));

test('KTH courses appear in revision blocks, interleaved with KFUPM, from the plan start (no overlaps)', () => {
  const app = loadApp();
  const kth = run(app, "MM.state.courses.filter((c) => c.group === 'kth').map((c) => c.code + ':' + c.priority)");
  assert.deepStrictEqual(Array.from(kth), [...KTH_HIGH.map((c) => c + ':high'), ...KTH_QUICK.map((c) => c + ':quick'), ...KTH_IGNORE.map((c) => c + ':ignore')]);
  const codes = revCodes(app, '2026-10-21', 14);
  assert.ok(codes.some((c) => KTH_HIGH.includes(c)), 'a KTH course is in a revision block within 2 weeks');
  assert.ok(codes.some((c) => /^(MATH|PHYS|ME) /.test(c)), 'KFUPM revision continues too');
  assert.ok(day(app, '2026-10-23').blocks.some((b) => b.type === 'revision' && /^SE1025 — /.test(b.meta.detail)));
  // the interleaved sequence alternates groups while both have topics left
  const seq = run(app, "revisionSequence().slice(0, 10).map((x) => x.course.group)");
  assert.deepStrictEqual(Array.from(seq), ['kfupm', 'kth', 'kfupm', 'kth', 'kfupm', 'kth', 'kfupm', 'kth', 'kfupm', 'kth']);
  assert.strictEqual(day(app, '2026-10-20').blocks.length, 0, 'still nothing before the plan start');
  dates('2026-10-21', 14).forEach((ds) => assert.deepStrictEqual(overlaps(day(app, ds).blocks), []));
});
test('KTH priorities: ignore / later never scheduled; changing priority in the app reschedules', () => {
  const app = loadApp();
  const all = () => new Set(Array.from(run(app, 'revisionSequence().map((x) => x.course.code)')));
  KTH_IGNORE.forEach((c) => assert.ok(!all().has(c)));
  [...KTH_HIGH, ...KTH_QUICK].forEach((c) => assert.ok(all().has(c), c + ' is scheduled'));
  run(app, "setCoursePriority('SE1025', 'ignore'); setCoursePriority('AK2030', 'high');");
  assert.ok(!all().has('SE1025')); assert.ok(all().has('AK2030'));
  assert.ok(!revCodes(app, '2026-10-21', 21).includes('SE1025'));
  run(app, "setCoursePriority('SE2137', 'later');");
  assert.ok(!all().has('SE2137'));
  assert.strictEqual(run(app, "MM.state.courses.find((c) => c.code === 'SE2137').priority"), 'later');
});
test('migration v3 → v4: KTH group added once, KFUPM courses + progress + other data untouched', () => {
  const app = loadApp();
  run(app, `__v3 = mmDefaultState(); __v3.version = 3;
    __v3.courses = __v3.courses.filter((c) => c.group !== 'kth').map((c) => { const o = JSON.parse(JSON.stringify(c)); delete o.group; return o; });
    __v3.courses[0].topics[0].done = true; __v3.courses[0].deadline = '2026-11-30'; __v3.courses[5].priority = 'later';
    __v3.courses.push({ id: 'cx', code: 'SE 2137', title: 'Fatigue (mine)', priority: 'quick', topics: [{ id: 'q', name: 'my topic', done: true }], hours: 3, deadline: null, notes: 'n', links: '' });
    __v3.notes = [{ id: 'n1', text: 'keep' }]; __v3.settings.activeCourse = 'MATH 101';`);
  const before = run(app, 'JSON.stringify(__v3.courses)');
  const s = run(app, 'mmMigrate(JSON.parse(JSON.stringify(__v3)))');
  assert.strictEqual(s.version, run(app, 'MM_VERSION'));
  const old = JSON.parse(before);
  old.forEach((c, i) => { const n = s.courses[i]; assert.strictEqual(n.code, c.code); assert.strictEqual(n.priority, c.priority); assert.strictEqual(n.deadline, c.deadline); assert.deepStrictEqual(n.topics, c.topics); });
  assert.ok(s.courses.slice(0, old.length - 1).every((c) => c.group === 'kfupm'));
  const mine = s.courses.find((c) => c.code === 'SE 2137');
  assert.strictEqual(mine.group, 'kth'); assert.strictEqual(mine.title, 'Fatigue (mine)'); assert.strictEqual(mine.topics.length, 1);
  assert.ok(!s.courses.some((c) => c.code === 'SE2137'), 'no duplicate of an existing course');
  assert.strictEqual(s.courses.filter((c) => c.group === 'kth').length, 15);
  assert.ok(s.courses.filter((c) => c.group === 'kth' && c.priority === 'high').every((c) => c.deadline >= '2026-10-21'));
  assert.strictEqual(s.notes.length, 1); assert.strictEqual(s.settings.activeCourse, 'MATH 101');
  // idempotent; a KTH course the user deletes later is not re-added
  app.__s = s;
  const again = run(app, 'mmMigrate(JSON.parse(JSON.stringify(__s)))');
  assert.strictEqual(again.courses.length, s.courses.length);
  app.__s.courses = s.courses.filter((c) => c.code !== 'AK2030');
  assert.ok(!run(app, 'mmMigrate(JSON.parse(JSON.stringify(__s)))').courses.some((c) => c.code === 'AK2030'));
  // mmLoad keeps an untouched copy of the old data and saves the upgrade
  run(app, "localStorage.setItem(MM_STORAGE_KEY, JSON.stringify(__v3)); MM.state = mmLoad();");
  assert.strictEqual(app.store['mamba-mentality-v1-backup-v3'], JSON.stringify(run(app, '__v3')));
  assert.strictEqual(JSON.parse(app.store['mamba-mentality-v1']).version, run(app, 'MM_VERSION'));
});
test('KFUPM seed list is unchanged by the KTH addition', () => {
  const app = loadApp();
  const k = Array.from(run(app, "MM.state.courses.filter((c) => c.group === 'kfupm').map((c) => c.code + ':' + c.priority)"));
  assert.deepStrictEqual(k, Array.from(run(app, "MM_SEED.courses.map((c) => c.code + ':' + c.priority)")));
  assert.strictEqual(k.length, 30);
  assert.strictEqual(k.filter((x) => x.endsWith(':high')).length, 19);
});

// ---------- v4.3: real progress ----------
const studyOn = (app, ds, types = ['revision', 'deep']) => day(app, ds).blocks.filter((b) => types.includes(b.type));
const times = (app, from, n) => dates(from, n).map((ds) => day(app, ds).blocks.map((b) => `${b.id}@${b.start}-${b.end}`).join(','));
const seqLabels = (app) => Array.from(run(app, "revisionSequence().map((x) => x.course.code + ' — ' + x.topic.name)"));

test('progress overshoot: next sessions start where you stopped and the later queue slides earlier (same block times)', () => {
  const app = loadApp();
  const seq = seqLabels(app);
  const before = times(app, '2026-10-21', 7);
  const b = studyOn(app, '2026-10-21').find((x) => x.id === 'revision');
  assert.ok(b.meta.units > 0 && b.meta.units < 1, 'a session has a planned amount');
  assert.strictEqual(b.meta.detail, seq[0]);
  const laterBefore = studyOn(app, '2026-10-23')[0].meta.detail;
  app.__b = b;
  const rec = run(app, "recordProgress('2026-10-21', __b, 2.5)");
  assert.strictEqual(rec.actual, 2.5); assert.ok(rec.planned > 0 && rec.planned < 1);
  // two whole topics done, the third is half done and comes first in the queue
  const s2 = seqLabels(app);
  assert.ok(!s2.includes(seq[0]) && !s2.includes(seq[1]));
  assert.strictEqual(s2[0], seq[2]);
  assert.strictEqual(run(app, "revisionSequence()[0].topic.part"), 0.5);
  // the very next session continues the half-done topic
  const next = studyOn(app, '2026-10-21').find((x) => x.id === 'revision2');
  assert.strictEqual(next.meta.detail, seq[2]); assert.strictEqual(next.meta.unitInto, 0.5);
  // the recorded block keeps what it was about + the amount
  const done = studyOn(app, '2026-10-21').find((x) => x.id === 'revision');
  assert.strictEqual(done.status, 'done'); assert.strictEqual(done.meta.doneUnits, 2.5); assert.strictEqual(done.meta.detail, seq[0]);
  // later days are pulled forward: further along in the original order
  const laterAfter = studyOn(app, '2026-10-23')[0].meta.detail;
  assert.ok(seq.indexOf(laterAfter) > seq.indexOf(laterBefore), `${laterAfter} should come after ${laterBefore}`);
  // no cramming, no emptying: every block keeps its time
  assert.deepStrictEqual(times(app, '2026-10-21', 7), before);
  dates('2026-10-21', 7).forEach((ds) => assert.deepStrictEqual(overlaps(day(app, ds).blocks), []));
  // persisted and survives a reload
  run(app, 'MM.state = mmLoad(); MM.rev++;');
  assert.strictEqual(run(app, 'MM.state.progress.length'), 1);
  assert.strictEqual(seqLabels(app)[0], seq[2]);
  assert.strictEqual(studyOn(app, '2026-10-21').find((x) => x.id === 'revision').meta.doneUnits, 2.5);
  // un-ticking restores the queue
  app.__b2 = studyOn(app, '2026-10-21').find((x) => x.id === 'revision');
  run(app, "setStatus('2026-10-21', __b2, 'done')");
  assert.deepStrictEqual(seqLabels(app), seq);
  assert.strictEqual(run(app, 'MM.state.progress.length'), 0);
});
test('progress undershoot: the unfinished rest rolls into the next session of that subject', () => {
  const app = loadApp();
  const ch0 = run(app, 'nextSwedishChapter().id');
  const sw = studyOn(app, '2026-10-21', ['swedish'])[0];
  assert.ok(sw.meta.units >= 0.5, 'planned ≥ ½ chapter');
  app.__b = sw; run(app, "recordProgress('2026-10-21', __b, 0.25)");
  assert.strictEqual(run(app, 'nextSwedishChapter().id'), ch0, 'chapter not finished');
  assert.strictEqual(run(app, 'nextSwedishChapter().part'), 0.25);
  const nxt = studyOn(app, '2026-10-22', ['swedish'])[0];
  assert.match(nxt.meta.detail, new RegExp(run(app, 'nextSwedishChapter().title').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.strictEqual(nxt.meta.unitInto, 0.25, 'next session starts at the rest');
  // revision: a smaller amount than planned keeps the same topic first
  const seq = seqLabels(app);
  app.__r = studyOn(app, '2026-10-21').find((x) => x.id === 'revision');
  run(app, "recordProgress('2026-10-21', __r, 0.1)");
  assert.strictEqual(seqLabels(app)[0], seq[0]);
  assert.strictEqual(studyOn(app, '2026-10-21').find((x) => x.id === 'revision2').meta.detail, seq[0]);
});
test('migration v4 → v5: progress + day drops added, repeat fields normalised, old data backed up', () => {
  const app = loadApp();
  run(app, `__v4 = mmDefaultState(); __v4.version = 4; delete __v4.progress; delete __v4.dayDrops;
    __v4.items = [{ id: 'a', kind: 'appt', title: 'A', date: '2026-10-22', start: '09:00', duration: 30 }, { id: 't', kind: 'task', title: 'T', deadline: '2026-10-25', effort: 60, log: [] }];
    __v4.courses[0].topics[0].done = true; localStorage.setItem(MM_STORAGE_KEY, JSON.stringify(__v4)); MM.state = mmLoad();`);
  assert.strictEqual(app.store['mamba-mentality-v1-backup-v4'], JSON.stringify(run(app, '__v4')));
  const s = JSON.parse(app.store['mamba-mentality-v1']);
  assert.strictEqual(s.version, 5);
  assert.deepStrictEqual(s.progress, []); assert.deepStrictEqual(s.dayDrops, {});
  assert.strictEqual(s.items[0].repeat.mode, 'none'); assert.deepStrictEqual(s.items[1].skipDays, []);
  assert.strictEqual(s.courses[0].topics[0].done, true);
});

// ---------- v4.3: repeating appointments ----------
const apptOn = (app, ds, id) => day(app, ds).blocks.find((b) => b.type === 'appt' && b.meta.itemId === id);
test('weekly repeating appointment blocks every occurrence (count), per-occurrence edit / delete, whole series delete', () => {
  const app = loadApp();
  setItems(app, [{ id: 'gym', kind: 'appt', title: 'Physio', date: '2026-10-21', start: '10:00', duration: 60, travelBefore: 15, travelAfter: 15, repeat: { mode: 'weekly', days: [1, 3], count: 4 }, skip: [], overrides: {} },
    { id: 'tk', kind: 'task', title: 'Essay', deadline: '2026-11-03', effort: 600, splittable: true, chunk: 60, priority: 'normal', log: [] }]);
  const occ = ['2026-10-21', '2026-10-26', '2026-10-28', '2026-11-02'];
  occ.forEach((ds) => {
    const a = apptOn(app, ds, 'gym'); assert.ok(a, 'occurrence on ' + ds);
    assert.strictEqual(a.start, '10:00'); assert.strictEqual(a.meta.occ, ds);
    const d = day(app, ds); assert.deepStrictEqual(overlaps(d.blocks), []);
    d.blocks.filter((b) => !isFixedItem(b)).forEach((b) => assert.ok(te(b.end) <= tm('09:45') || tm(b.start) >= tm('11:15'), `${ds} ${b.type} ${b.start} overlaps`));
  });
  ['2026-10-22', '2026-10-23', '2026-11-04', '2026-11-09'].forEach((ds) => assert.ok(!apptOn(app, ds, 'gym'), 'no occurrence on ' + ds));
  assert.strictEqual(plan(app).tasks.tk.placed, 600);
  // edit one occurrence, delete another
  run(app, "const it = itemById('gym'); occOverride(it, '2026-10-28').start = '15:00'; it.skip.push('2026-10-26'); MM.rev++;");
  assert.strictEqual(apptOn(app, '2026-10-28', 'gym').start, '15:00');
  assert.strictEqual(apptOn(app, '2026-10-21', 'gym').start, '10:00');
  assert.ok(!apptOn(app, '2026-10-26', 'gym'));
  assert.deepStrictEqual(overlaps(day(app, '2026-10-28').blocks), []);
  // until date instead of a count
  run(app, "itemById('gym').repeat = { mode: 'weekly', days: [3], until: '2026-11-11' }; MM.rev++;");
  assert.ok(apptOn(app, '2026-11-11', 'gym')); assert.ok(!apptOn(app, '2026-11-18', 'gym'));
  // whole series
  run(app, "MM.state.items = MM.state.items.filter((x) => x.id !== 'gym'); MM.rev++;");
  occ.forEach((ds) => assert.ok(!apptOn(app, ds, 'gym')));
});
test('specific-dates series: only on the picked dates (dates that vary month to month), planner works around each', () => {
  const app = loadApp();
  const picked = ['2026-10-22', '2026-11-03', '2026-11-17', '2026-12-08'];
  setItems(app, [{ id: 'mig', kind: 'appt', title: 'Migrationsverket', date: picked[0], start: '13:00', end: '14:30', endMode: 'end', travelBefore: 45, travelAfter: 45, repeat: { mode: 'dates', dates: picked }, skip: [], overrides: {} }]);
  picked.forEach((ds) => {
    const a = apptOn(app, ds, 'mig'); assert.ok(a, ds); assert.strictEqual(a.end, '14:30');
    const d = day(app, ds); assert.deepStrictEqual(overlaps(d.blocks), []);
    assert.strictEqual(d.blocks.filter((b) => b.type === 'travel' && b.meta.itemId === 'mig').length, 2);
  });
  dates('2026-10-21', 60).filter((d) => !picked.includes(d)).forEach((ds) => assert.ok(!apptOn(app, ds, 'mig'), 'not on ' + ds));
  assert.ok(run(app, "itemWhen(itemById('mig'))").includes('4'));
});

// ---------- v4.3: smarter clash handling ----------
function addAppt(app, appt) {
  app.__ap = appt;
  run(app, "__before = currentPlan(); MM.state.items.push(JSON.parse(JSON.stringify(__ap))); MM.rev++; __after = currentPlan(); __rep = clashReport(__before, __after, __ap.id);");
  return run(app, 'JSON.parse(JSON.stringify(__rep))');
}
test('clash: a displaced task is relocated automatically before its deadline and shown as moved', () => {
  const app = loadApp();
  setItems(app, [{ id: 'cv', kind: 'task', title: 'CV update', deadline: '2026-10-23', effort: 60, splittable: false, priority: 'normal', log: [] }]);
  const c0 = plan(app).tasks.cv.chunks[0];
  assert.ok(c0.ds < '2026-10-23');
  const r = addAppt(app, { id: 'den', kind: 'appt', title: 'Dentist', date: c0.ds, start: P.hm(c0.s), duration: 60, travelBefore: 0, travelAfter: 0, repeat: { mode: 'none' } });
  const p = plan(app);
  assert.strictEqual(p.tasks.cv.placed, 60);
  const c1 = p.tasks.cv.chunks[0]; assert.ok(c1.ds >= '2026-10-21' && c1.ds <= '2026-10-23');
  assert.ok(c1.ds !== c0.ds || c1.s >= c0.s + 60 || c1.e <= c0.s, 'not on the dentist slot');
  const mv = r.moved.find((m) => m.kind === 'task' && m.itemId === 'cv');
  assert.ok(mv, 'reported as moved'); assert.ok(['sameDay', 'laterDay'].includes(mv.how)); assert.strictEqual(mv.ds, c1.ds);
  assert.ok(!r.unplaced.some((u) => u.itemId === 'cv'));
  dates('2026-10-21', 3).forEach((ds) => assert.deepStrictEqual(overlaps(day(app, ds).blocks), []));
});
test('clash: commute-suitable work moves into the travel time (task + Swedish), no overlaps', () => {
  const app = loadApp();
  setItems(app, [{ id: 'fc', kind: 'task', title: 'Flashcards', deadline: '2026-10-21', effort: 30, splittable: false, priority: 'normal', commute: true, log: [] }]);
  const c0 = plan(app).tasks.fc.chunks[0]; assert.ok(!c0.commute, 'free slot first while there is one');
  const r = addAppt(app, { id: 'kth', kind: 'appt', title: 'KTH meeting', date: '2026-10-21', start: '14:00', end: '16:00', endMode: 'end', travelBefore: 30, travelAfter: 0, repeat: { mode: 'none' } });
  const c1 = plan(app).tasks.fc.chunks[0];
  assert.ok(c1.commute, 'placed on the commute'); assert.strictEqual(c1.ds, '2026-10-21');
  assert.ok(c1.s >= tm('13:30') && c1.e <= tm('14:00'));
  const tr = day(app, '2026-10-21').blocks.find((b) => b.type === 'travel' && b.meta.itemId === 'kth');
  assert.strictEqual(tr.meta.commute.itemId, 'fc');
  assert.ok(r.moved.some((m) => m.itemId === 'fc' && m.how === 'commute'));
  assert.deepStrictEqual(overlaps(day(app, '2026-10-21').blocks), []);
  // routine Swedish (listening / reading) also uses a commute when the same day has no free slot
  const app2 = loadApp();
  const r2 = addAppt(app2, { id: 'doc', kind: 'appt', title: 'Doctor', date: '2026-10-21', start: '09:00', end: '17:00', endMode: 'end', travelBefore: 0, travelAfter: 20, repeat: { mode: 'none' } });
  assert.ok(r2.moved.some((m) => m.type === 'swedish' && m.how === 'commute' && m.ds === '2026-10-21'));
  const tr2 = day(app2, '2026-10-21').blocks.find((b) => b.type === 'travel' && b.meta.itemId === 'doc');
  assert.strictEqual(tr2.meta.commute.type, 'swedish');
  assert.deepStrictEqual(overlaps(day(app2, '2026-10-21').blocks), []);
});
function crowdedDay() {
  const app = loadApp();
  setItems(app, [
    { id: 'Y', kind: 'task', title: 'Report', deadline: '2026-10-21', effort: 165, splittable: false, priority: 'normal', log: [], createdAt: '1' },
    { id: 'X', kind: 'task', title: 'Slides', deadline: '2026-10-21', effort: 165, splittable: false, priority: 'normal', log: [], createdAt: '2' }
  ]);
  assert.strictEqual(plan(app).tasks.X.placed, 165); assert.strictEqual(plan(app).tasks.Y.placed, 165);
  const r = addAppt(app, { id: 'cl', kind: 'appt', title: 'Clinic', date: '2026-10-21', start: '13:00', end: '17:00', endMode: 'end', travelBefore: 30, travelAfter: 30, repeat: { mode: 'none' } });
  return { app, r };
}
const noOverlaps = (app, n = 4) => dates('2026-10-21', n).forEach((ds) => assert.deepStrictEqual(overlaps(day(app, ds).blocks), []));
test('clash: what cannot be relocated gets ranked drop / swap / tomorrow options; swap → full replan, no overlaps', () => {
  const { app, r } = crowdedDay();
  const u = r.unplaced.find((x) => x.kind === 'task' && x.itemId === 'X');
  assert.ok(u, 'Slides cannot fit any more'); assert.strictEqual(u.ds, '2026-10-21');
  const codes = u.suggestions.map((s) => s.code);
  ['drop', 'swap', 'tomorrow'].forEach((c) => assert.ok(codes.includes(c), c));
  const scores = u.suggestions.map((s) => s.score); assert.deepStrictEqual(scores, scores.slice().sort((a, b) => a - b), 'ranked');
  assert.strictEqual(u.suggestions.find((s) => s.code === 'swap').withItem, 'Y');
  assert.ok(r.dayLists['2026-10-21'].some((x) => x.itemId === 'Y' && x.kind === 'task'), 'day list shows everything planned');
  assert.ok(r.dayLists['2026-10-21'].some((x) => x.self), 'and the new event itself');
  noOverlaps(app);
  // swap: Slides now, Report → tomorrow
  app.__f = u.suggestions.find((s) => s.code === 'swap');
  run(app, 'commitPlanChange(() => applyClashFix(__f), "cl", { clashOf: "cl", silent: true })');
  const p = plan(app);
  assert.strictEqual(p.tasks.X.placed, 165); assert.strictEqual(p.tasks.X.chunks[0].ds, '2026-10-21');
  assert.strictEqual(p.tasks.Y.placed, 165); assert.strictEqual(p.tasks.Y.chunks[0].ds, '2026-10-22');
  assert.strictEqual(run(app, "itemById('Y').deadline"), '2026-10-22');
  noOverlaps(app);
});
test('clash: drop option and dropping from the full day list both replan the whole schedule with no overlaps', () => {
  let { app, r } = crowdedDay();
  app.__f = r.unplaced.find((x) => x.itemId === 'X').suggestions.find((s) => s.code === 'drop');
  run(app, 'commitPlanChange(() => applyClashFix(__f), "cl", { clashOf: "cl", silent: true })');
  assert.ok(!run(app, "itemById('X')")); assert.strictEqual(plan(app).tasks.X, undefined);
  assert.ok(!plan(app).warnings.some((w) => w.t === 'overflow')); noOverlaps(app);
  // move to tomorrow
  ({ app, r } = crowdedDay());
  app.__f = r.unplaced.find((x) => x.itemId === 'X').suggestions.find((s) => s.code === 'tomorrow');
  run(app, 'commitPlanChange(() => applyClashFix(__f), "cl", { clashOf: "cl", silent: true })');
  assert.strictEqual(plan(app).tasks.X.chunks[0].ds, '2026-10-22'); noOverlaps(app);
  // pick freely from the day list: drop Report's time that day + the job-applications block → Slides fits that day
  ({ app, r } = crowdedDay());
  const pick = r.dayLists['2026-10-21'].filter((x) => x.type === 'jobs' || x.itemId === 'Y');
  assert.ok(pick.some((x) => x.kind === 'routine') && pick.some((x) => x.kind === 'task'));
  app.__l = pick;
  const res = run(app, 'commitPlanChange(() => applyDayDrops(__l), "cl", { clashOf: "cl", silent: true })');
  assert.ok(!day(app, '2026-10-21').blocks.some((b) => b.type === 'jobs' || b.meta.itemId === 'Y'));
  assert.ok(day(app, '2026-10-22').blocks.some((b) => b.type === 'jobs'), 'routine dropped only that day');
  const p = plan(app); assert.strictEqual(p.tasks.X.placed, 165); assert.strictEqual(p.tasks.X.chunks[0].ds, '2026-10-21');
  assert.ok(p.warnings.some((w) => w.t === 'overflow' && w.item === 'Y'), 'dropped task is flagged, not silently lost');
  assert.ok(res.clash.days.includes('2026-10-21'));
  noOverlaps(app);
  // Undo brings the previous plan back
  app.__snap = res.snap; run(app, 'restoreSnapshot(__snap)');
  assert.ok(day(app, '2026-10-21').blocks.some((b) => b.meta.itemId === 'Y'));
  assert.ok(day(app, '2026-10-21').blocks.some((b) => b.type === 'jobs'));
});
test('random v4.3 scenarios: repeating appointments, commute tasks, moved/skipped tasks, day drops → never any overlap', () => {
  const R = rng(20261021); const pick = (arr) => arr[Math.floor(R() * arr.length)];
  for (let n = 0; n < 30; n++) {
    const app = loadApp(); const days = dates('2026-10-21', 14); const items = [];
    for (let i = 0; i < 3; i++) {
      const st = 6 * 60 + Math.floor(R() * 60) * 15; const rep = pick(['none', 'weekly', 'dates']);
      items.push({ id: 'r' + i, kind: 'appt', title: 'R' + i, date: pick(days.slice(0, 5)), start: P.hm(Math.min(22 * 60, st)), duration: pick([30, 60, 120]), travelBefore: pick([0, 20, 40]), travelAfter: pick([0, 30]),
        repeat: rep === 'weekly' ? { mode: 'weekly', days: [pick([1, 2, 3, 4, 5]), pick([0, 6, 3])], count: pick([0, 3, 6]) } : rep === 'dates' ? { mode: 'dates', dates: [pick(days), pick(days), pick(days)] } : { mode: 'none' }, skip: [], overrides: {} });
    }
    for (let i = 0; i < 4; i++) items.push({ id: 't' + i, kind: 'task', title: 'T' + i, deadline: pick(days), effort: pick([30, 60, 120, 240]), splittable: R() < 0.5, chunk: 60, priority: pick(['high', 'normal', 'low']), commute: R() < 0.5, log: [], createdAt: String(i), skipDays: R() < 0.3 ? [pick(days)] : [], ...(R() < 0.2 ? { notBefore: pick(days) } : {}) });
    setItems(app, items);
    if (R() < 0.5) { app.__d = pick(days); run(app, "MM.state.dayDrops[__d] = ['jobs', 'lunch', 'deep']; MM.rev++;"); }
    const p = plan(app);
    days.forEach((ds) => {
      const d = day(app, ds);
      const bad = overlaps(d.blocks).filter(([x, y]) => !(isFixedItem(x) && isFixedItem(y) && x.meta.itemId !== y.meta.itemId));
      assert.deepStrictEqual(bad.map(([x, y]) => `${ds} ${x.id} × ${y.id}`), []);
      d.blocks.filter((b) => b.meta && b.meta.kind === 'task' && b.meta.doneChunk == null).forEach((b) => {
        const it = items.find((x) => x.id === b.meta.itemId);
        assert.ok(ds <= it.deadline && !(it.skipDays || []).includes(ds) && (!it.notBefore || ds >= it.notBefore));
      });
    });
    items.filter((x) => x.kind === 'task').forEach((it) => { const inf = p.tasks[it.id]; assert.ok(inf.placed <= it.effort); if (inf.placed < it.effort) assert.ok(p.warnings.some((w) => w.t === 'overflow' && w.item === it.id)); });
  }
});
