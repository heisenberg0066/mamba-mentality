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
  assert.strictEqual(s.version, 3);
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
