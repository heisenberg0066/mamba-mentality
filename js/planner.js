/* Mamba Mentality v4.3 — planner.
 * Fits fixed appointments (with travel buffers) and deadline tasks into the daily routine
 * WITHOUT double-booking. Pure: no DOM, no global state (works in the browser and in Node tests).
 *
 * Block classes:
 *   hard  – appointments, travel, completed task chunks, placed task chunks. Never moved, never overlapped.
 *   ess   – wake, meals, meal prep/cooking, user "other" blocks. Kept; if an appointment hits them they are
 *           re-placed as close as possible to their time (may be shortened to a minimum), pushing flexible work.
 *   trim  – chill, wind-down, rest. Only an appointment can cut into them; tasks never use them.
 *   flex  – job applications, Swedish, revision, SolidWorks, deep work, buffer. Tasks may take their time
 *           (cheapest first); displaced minutes are moved to the next real free slot (same day or up to
 *           2 days later), shortened to fit, or dropped — never overlapped.
 * Sleep (00:00–06:00) is never used; prayer times reserve a 15-minute window for anything newly placed.
 * v4.3: repeating appointments (weekly / specific dates, per-occurrence edits + skips) are expanded into
 *       fixed occurrences; commute-suitable work (Swedish listening/reading, tasks flagged `commute`) may use
 *       the travel time of an appointment; tasks honour `notBefore` / `skipDays` (move-to-tomorrow, swap).
 */
(function (G) {
  const DAY_START = 360, DAY_END = 1440, STEP = 15, PRAYER_MIN = 15, MIN_PIECE = 30, CARRY_DAYS = 2, ESS_RANGE = 180;
  const FLEX_W = { buffer: 0, deep: 1, solidworks: 2, revision: 3, swedish: 4, jobs: 5 };
  const TRIM = { chill: 1, wind: 1, rest: 1 };
  const ESS_MIN = { wake: 15, meal: 30, mealprep: 45 };
  const CHILL_MIN = 60;
  const PRIO = { high: 0, normal: 1, low: 2 };

  const tm = (hm) => { if (!hm) return 0; const p = String(hm).split(':').map(Number); return p[0] * 60 + (p[1] || 0); };
  const te = (hm) => { const m = tm(hm); return m === 0 ? 1440 : m; };
  const hm = (m) => { m = Math.max(0, Math.min(1440, Math.round(m))); if (m === 1440) return '00:00'; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  function addDays(ds, n) { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  const ov = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function klass(b) { if (b._hard) return 'hard'; if (b.type in FLEX_W) return 'flex'; if (b.type in TRIM) return 'trim'; return 'ess'; }
  function subtract(s, e, ints) {
    let segs = [[s, e]];
    ints.forEach(([a, b]) => {
      const out = [];
      segs.forEach(([x, y]) => { if (b <= x || a >= y) out.push([x, y]); else { if (a > x) out.push([x, a]); if (b < y) out.push([b, y]); } });
      segs = out;
    });
    return segs.filter(([x, y]) => y > x);
  }

  /** Appointment interval helpers (exported for the UI). */
  function apptTimes(it) {
    const s = tm(it.start);
    let e = it.end ? te(it.end) : s + (Number(it.duration) || 60);
    e = Math.min(1440, Math.max(s + 5, e));
    const tb = Math.max(0, Number(it.travelBefore) || 0), ta = Math.max(0, Number(it.travelAfter) || 0);
    return { s, e, bs: Math.max(0, s - tb), be: Math.min(1440, e + ta) };
  }
  const isDs = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const dowOf = (ds) => new Date(ds + 'T12:00:00Z').getUTCDay();
  /** Occurrences of an appointment in [from, to] (a plain appointment is its own single occurrence). */
  function occurrences(it, from, to) {
    if (!it || it.kind !== 'appt') return [];
    const r = it.repeat;
    if (!r || !r.mode || r.mode === 'none') return it.date && it.date >= from && it.date <= to ? [it] : [];
    let dates = [];
    if (r.mode === 'dates') dates = Array.from(new Set((r.dates || []).filter(isDs))).sort();
    else if (r.mode === 'weekly' && isDs(it.date)) {
      const wd = (Array.isArray(r.days) && r.days.length ? r.days : [dowOf(it.date)]).map(Number);
      const until = isDs(r.until) ? r.until : '9999-12-31'; const max = Math.max(0, Number(r.count) || 0);
      let n = 0;
      for (let d = it.date; d <= until && d <= to; d = addDays(d, 1)) {
        if (!wd.includes(dowOf(d))) continue;
        n++; if (max && n > max) break;
        dates.push(d);
      }
    }
    const skip = new Set(it.skip || []); const ovr = it.overrides || {};
    const out = [];
    dates.forEach((ds) => {
      if (skip.has(ds)) return;
      const o = ovr[ds] || {};
      const occ = { ...it, ...o, id: it.id, kind: 'appt', date: isDs(o.date) ? o.date : ds, occ: ds, seriesId: it.id, done: !!(o.done || it.done) };
      delete occ.repeat; delete occ.overrides; delete occ.skip;
      if (occ.date >= from && occ.date <= to) out.push(occ);
    });
    return out;
  }
  /** All dates a (repeating) appointment occurs on, limited to [from, to]. */
  function occurrenceDates(it, from, to) { return occurrences(it, from, to).map((o) => o.date); }
  function isCommuteBlock(b) { return !!b && (b.type === 'swedish' || !!(b.meta && b.meta.commute === true)); }
  function taskRemaining(it) { return Math.max(0, (Number(it.effort) || 0) - (it.log || []).reduce((a, l) => a + (te(l.end) - tm(l.start)), 0)); }

  /**
   * ctx = { planStart, from?, to, stamp:{date,min}, baseDay(ds)->{isRest,blocks}, prayers(ds)->['HH:MM'],
   *         items:[...], missed:[{id, rescheduleDate, originalDate, block, status}] }
   * returns { days:{ds:{isRest,blocks}}, log:[...], warnings:[...], tasks:{id:{placed,need,chunks}} }
   */
  function buildPlan(ctx) {
    const planStart = ctx.planStart;
    const from = ctx.from && ctx.from > planStart ? ctx.from : planStart;
    const stamp = ctx.stamp || { date: from, min: 0 };
    const eligibleStart = stamp.date > from ? stamp.date : from;
    const items = (ctx.items || []).filter((x) => x && !x.deleted);
    const log = [], warnings = [], tasks = {};
    const days = {}, order = [];
    for (let d = from; d <= ctx.to; d = addDays(d, 1)) {
      const base = ctx.baseDay(d) || { isRest: false, blocks: [] };
      const day = {
        ds: d, isRest: !!base.isRest,
        blocks: (base.blocks || []).map((b) => ({ ...clone(b), _s: tm(b.start), _e: te(b.end) })).filter((b) => b._e > b._s),
        pray: (ctx.prayers ? ctx.prayers(d) : []).map((p) => { const s = tm(p); return [s, s + PRAYER_MIN]; }),
        minStart: d === stamp.date && stamp.date >= from ? Math.ceil((stamp.min || 0) / STEP) * STEP : 0,
        chill0: (base.blocks || []).filter((b) => b.type === 'chill').map((b) => [tm(b.start), te(b.end)]),
        ess: []
      };
      days[d] = day; order.push(d);
    }
    const pending = []; // displaced flexible minutes waiting for a new home

    // ---------- carving ----------
    function carve(day, s, e, why) {
      const keep = [];
      day.blocks.forEach((b) => {
        const k = klass(b);
        if (k === 'hard' || !ov(b._s, b._e, s, e)) { keep.push(b); return; }
        if (k === 'ess') { day.ess.push(b); return; }
        const segs = subtract(b._s, b._e, [[s, e]]);
        if (k === 'trim') {
          const kept = segs.filter(([x, y]) => y - x >= 15);
          kept.forEach(([x, y], i) => keep.push({ ...b, id: i ? b.id + '~' + i : b.id, _s: x, _e: y }));
          return;
        }
        // flex
        const kept = segs.filter(([x, y]) => y - x >= MIN_PIECE);
        kept.forEach(([x, y], i) => keep.push({ ...b, id: i ? b.id + '~' + i : b.id, _s: x, _e: y, meta: { ...(b.meta || {}), trimmed: true } }));
        const removed = (b._e - b._s) - kept.reduce((a, [x, y]) => a + y - x, 0);
        if (removed > 0 && b.type !== 'buffer') {
          pending.push({ block: b, len: removed, homeDs: day.ds, fromS: Math.max(b._s, s), fromE: Math.min(b._e, e), w: FLEX_W[b.type], why });
        }
      });
      day.blocks = keep;
    }
    function addHard(day, blk) { carve(day, blk._s, blk._e, blk.meta && blk.meta.itemId); blk._hard = true; day.blocks.push(blk); }
    // validity of a new placement [s,e) in a day. mode 'replace' → may overlap flex (cost = weight × minutes); 'free' → only buffer
    function slotCost(day, s, e, mode) {
      if (s < Math.max(DAY_START, day.minStart) || e > DAY_END) return -1;
      for (const [a, b] of day.pray) if (ov(s, e, a, b)) return -1;
      let cost = 0;
      for (const b of day.blocks) {
        const o = ov(s, e, b._s, b._e); if (!o) continue;
        const k = klass(b);
        if (k !== 'flex') return -1;
        if (mode === 'free' && b.type !== 'buffer') return -1;
        cost += FLEX_W[b.type] * o;
      }
      return cost;
    }

    // ---------- 1. fixed things: appointments (+travel) and completed task chunks ----------
    const apptsByDay = {};
    const occs = [];
    items.forEach((it) => {
      if (it.kind !== 'appt') return;
      if (!it.repeat || !it.repeat.mode || it.repeat.mode === 'none') { if (it.date) occs.push(it); return; }
      occurrences(it, '0000-01-01', ctx.to).forEach((o) => occs.push(o));
    });
    occs.forEach((it) => {
      (apptsByDay[it.date] = apptsByDay[it.date] || []).push({ it, T: apptTimes(it) });
      if (days[it.date]) {
        const day = days[it.date]; const T = apptTimes(it);
        const om = it.seriesId ? { occ: it.occ, series: true } : {};
        if (T.bs < T.s) addHard(day, { id: 'item-' + it.id + '-tb', type: 'travel', labelKey: 'blockTravel', _s: T.bs, _e: T.s, meta: { itemId: it.id, kind: 'travel', detail: it.title || '', ...om } });
        addHard(day, { id: 'item-' + it.id, type: 'appt', title: it.title || '', notes: it.notes || '', _s: T.s, _e: T.e, meta: { itemId: it.id, kind: 'appt', detail: it.notes || '', ...om }, status: it.done ? 'done' : '' });
        if (T.be > T.e) addHard(day, { id: 'item-' + it.id + '-ta', type: 'travel', labelKey: 'blockTravel', _s: T.e, _e: T.be, meta: { itemId: it.id, kind: 'travel', detail: it.title || '', ...om } });
      }
    });
    items.forEach((it) => {
      if (it.kind === 'task') (it.log || []).forEach((l, i) => {
        if (!days[l.ds]) return;
        addHard(days[l.ds], { id: 'item-' + it.id + '-d' + i, type: 'task', title: it.title || '', _s: tm(l.start), _e: te(l.end), meta: { itemId: it.id, kind: 'task', doneChunk: i }, status: 'done' });
      });
    });
    Object.keys(apptsByDay).forEach((ds) => {
      const L = apptsByDay[ds];
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
        if (ov(L[i].T.bs, L[i].T.be, L[j].T.bs, L[j].T.be)) warnings.push({ t: 'conflict', ds, a: L[i].it.id, b: L[j].it.id, titleA: L[i].it.title, titleB: L[j].it.title });
      }
    });

    // ---------- 2. re-place essentials knocked out by fixed things ----------
    order.forEach((ds) => {
      const day = days[ds];
      day.ess.sort((a, b) => a._s - b._s).forEach((b) => {
        const full = b._e - b._s; const minLen = Math.min(full, ESS_MIN[b.type] || full);
        let best = null;
        for (let len = full; len >= minLen && !best; len -= STEP) {
          for (let k = 0; k <= ESS_RANGE / STEP * 2 && !best; k++) {
            const delta = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * STEP; // 0, +15, -15, +30, ...
            const s = b._s + delta; const c = slotCost({ ...day, minStart: 0 }, s, s + len, 'replace');
            if (c >= 0) best = { s, e: s + len };
          }
          if (len - STEP < minLen && len !== minLen && !best) len = minLen + STEP; // make sure minLen itself is tried
        }
        if (best) {
          carve(day, best.s, best.e, 'ess');
          day.blocks.push({ ...b, _s: best.s, _e: best.e, meta: { ...(b.meta || {}), auto: true } });
          log.push({ t: 'moved', title: b.title || '', labelKey: b.labelKey, type: b.type, fromDs: ds, fromS: b._s, fromE: b._e, ds, s: best.s, e: best.e });
        } else {
          log.push({ t: 'dropped', title: b.title || '', labelKey: b.labelKey, type: b.type, fromDs: ds, fromS: b._s, fromE: b._e, len: full });
          warnings.push({ t: 'essential', ds, title: b.title || '', labelKey: b.labelKey, type: b.type, s: b._s, e: b._e });
        }
      });
      day.ess = [];
      const chill = day.blocks.filter((b) => b.type === 'chill').reduce((a, b) => a + b._e - b._s, 0);
      const chill0 = day.chill0.reduce((a, [x, y]) => a + y - x, 0);
      if (chill < chill0) log.push({ t: 'shortened', title: '', labelKey: 'blockChill', type: 'chill', ds, fromDs: ds, fromS: day.chill0[0][0], fromE: day.chill0[day.chill0.length - 1][1], len: chill, lost: chill0 - chill });
      if (chill0 && chill < Math.min(CHILL_MIN, chill0)) warnings.push({ t: 'chill', ds, len: chill });
    });

    // ---------- 3. deadline tasks (earliest deadline first, then priority) ----------
    const open = items.filter((it) => it.kind === 'task' && !it.done && taskRemaining(it) > 0)
      .sort((a, b) => (a.deadline || '9999') < (b.deadline || '9999') ? -1 : (a.deadline || '9999') > (b.deadline || '9999') ? 1
        : (PRIO[a.priority] ?? 1) - (PRIO[b.priority] ?? 1) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    function taskDays(it) {
      const skip = new Set(it.skipDays || []);
      return order.filter((d) => d >= eligibleStart && d <= (it.deadline || d) && !days[d].isRest && !skip.has(d) && (!it.notBefore || d >= it.notBefore));
    }
    // a free stretch of an appointment's travel time (commute) — for light work you can do on the go
    function commuteSlot(day, want, minLen) {
      let best = null;
      day.blocks.forEach((b) => {
        if (b.type !== 'travel' || !b._hard || (b.meta && b.meta.commute)) return;
        const segs = subtract(Math.max(b._s, DAY_START, day.minStart), b._e, day.pray);
        segs.forEach(([x, y]) => { const len = Math.min(want, y - x); if (len >= minLen && (!best || len > best.e - best.s)) best = { b, s: x, e: x + len }; });
      });
      return best;
    }
    function findCommute(dlist, want, minLen) {
      for (const d of dlist) { const c = commuteSlot(days[d], want, minLen); if (c) return { ...c, ds: d }; }
      return null;
    }
    function useCommute(c, what) { c.b.meta = { ...(c.b.meta || {}), commute: { ...what, s: hm(c.s), e: hm(c.e) } }; }
    function findSlot(dlist, len, mode) {
      let best = null;
      for (const d of dlist) {
        const day = days[d];
        for (let s = Math.max(DAY_START, day.minStart); s + len <= DAY_END; s += STEP) {
          const c = slotCost(day, s, s + len, mode);
          if (c < 0) continue;
          if (!best || c < best.cost) best = { ds: d, s, e: s + len, cost: c };
          if (c === 0) break; // earliest zero-cost slot of this day
        }
        if (best && best.cost === 0) break; // earliest day with a free slot
      }
      return best;
    }
    open.forEach((it) => {
      const dlist = taskDays(it);
      let rem = taskRemaining(it); const need = rem; let placed = 0; let n = 0;
      const chunk = it.splittable ? Math.max(MIN_PIECE, Number(it.chunk) || 60) : rem;
      const info = tasks[it.id] = { need, placed: 0, chunks: [] };
      while (rem > 0) {
        let size = Math.min(chunk, rem);
        if (it.splittable && rem - size > 0 && rem - size < MIN_PIECE) size = rem;
        let slot = findSlot(dlist, size, 'replace');
        if (!slot && it.splittable) for (let z = size - STEP; z >= Math.min(MIN_PIECE, rem) && !slot; z -= STEP) { slot = findSlot(dlist, z, 'replace'); }
        if (it.commute) { // same-day free time first, then the commute, before pushing routine work aside or using a later day
          const c = findCommute(dlist, it.splittable ? size : rem, it.splittable ? Math.min(15, rem) : rem);
          if (c && (!slot || c.ds < slot.ds || (c.ds === slot.ds && slot.cost > 0))) {
            useCommute(c, { kind: 'task', itemId: it.id, title: it.title || '', type: 'task' });
            log.push({ t: 'placed', item: it.id, title: it.title || '', type: 'task', ds: c.ds, s: c.s, e: c.e, commute: true });
            info.chunks.push({ ds: c.ds, s: c.s, e: c.e, commute: true });
            const L = c.e - c.s; rem -= L; placed += L; continue;
          }
        }
        if (!slot) break;
        const day = days[slot.ds];
        carve(day, slot.s, slot.e, it.id);
        day.blocks.push({ id: 'item-' + it.id + '-c' + (n++), type: 'task', title: it.title || '', notes: it.notes || '', _s: slot.s, _e: slot.e, _hard: true, meta: { itemId: it.id, kind: 'task', detail: it.notes || '', priority: it.priority || 'normal', deadline: it.deadline } });
        log.push({ t: 'placed', item: it.id, title: it.title || '', type: 'task', ds: slot.ds, s: slot.s, e: slot.e });
        info.chunks.push({ ds: slot.ds, s: slot.s, e: slot.e });
        const L = slot.e - slot.s; rem -= L; placed += L;
      }
      info.placed = placed;
      if (rem > 0) warnings.push(overflowWarning(it, need, placed, dlist));
    });
    function overflowWarning(it, need, placed, dlist) {
      const sug = [];
      if (it.deadline && it.deadline < planStart) sug.push({ code: 'planStart', date: planStart });
      else if (it.deadline && it.deadline < (stamp.date || '')) sug.push({ code: 'pastDeadline' });
      if (!it.splittable && dlist.length) sug.push({ code: 'split' });
      // longest piece that still fits (for non-splittable) / what got placed (splittable)
      let fit = 0;
      if (it.splittable) fit = placed;
      else for (let z = need - STEP; z >= STEP; z -= STEP) { if (findSlot(dlist, z, 'replace')) { fit = z; break; } }
      const done = (Number(it.effort) || 0) - need;
      if (fit > 0) sug.push({ code: 'shorten', mins: fit + done });
      // tasks of equal/lower priority already holding time in the same window
      Object.keys(tasks).forEach((id) => {
        if (id === it.id) return; const o = items.find((x) => x.id === id); if (!o) return;
        if ((PRIO[o.priority] ?? 1) < (PRIO[it.priority] ?? 1)) return;
        const mins = tasks[id].chunks.filter((c) => c.ds <= (it.deadline || c.ds) && c.ds >= eligibleStart).reduce((a, c) => a + c.e - c.s, 0);
        if (mins > 0) sug.push({ code: 'drop', itemId: id, title: o.title || '', mins, priority: o.priority || 'normal' });
      });
      const drops = sug.filter((x) => x.code === 'drop').sort((a, b) => (PRIO[b.priority] ?? 1) - (PRIO[a.priority] ?? 1) || b.mins - a.mins).slice(0, 2);
      const rest = sug.filter((x) => x.code !== 'drop');
      if (it.deadline) rest.push({ code: 'extend' });
      return { t: 'overflow', item: it.id, title: it.title || '', need, placed, deadline: it.deadline, suggestions: rest.concat(drops) };
    }

    // ---------- 4. missed (↻) items from the existing queue join the displaced work ----------
    (ctx.missed || []).forEach((q) => {
      if (!q || !q.block) return;
      const home = q.rescheduleDate < from ? from : q.rescheduleDate;
      if (!days[home]) return;
      const b = { ...clone(q.block) };
      const len = Math.max(15, te(b.end) - tm(b.start));
      pending.push({ block: b, len, homeDs: home, fromS: tm(b.start), fromE: te(b.end), w: FLEX_W[b.type] ?? 3, queue: q });
    });

    // ---------- 5. re-home displaced flexible work into real free time (same day → up to 2 days later) ----------
    pending.sort((a, b) => (a.homeDs < b.homeDs ? -1 : a.homeDs > b.homeDs ? 1 : (b.w - a.w) || (a.fromS - b.fromS)));
    const usedIds = {};
    const ref = (p) => ({ blockId: p.block.id, baseId: (p.block.meta && p.block.meta.baseId) || String(p.block.id).split('~')[0], detail: (p.block.meta && p.block.meta.detail) || '', queueId: p.queue ? p.queue.id : undefined });
    pending.forEach((p) => {
      let rem = p.len; let part = 0; const placedParts = [];
      for (let k = 0; k <= CARRY_DAYS && rem > 0; k++) {
        const d = addDays(p.homeDs, k); const day = days[d];
        if (!day || day.isRest || d < planStart) continue;
        if (!p.queue && d < eligibleStart && d !== p.homeDs) continue;
        // free gaps (buffer counts as free)
        const obst = day.blocks.filter((b) => b.type !== 'buffer' || klass(b) !== 'flex').map((b) => [b._s, b._e]).concat(day.pray);
        const gaps = subtract(Math.max(DAY_START, day.minStart), DAY_END, obst);
        for (const [gs0, ge] of gaps) {
          if (rem <= 0) break;
          const gs = Math.ceil(gs0 / STEP) * STEP; if (ge <= gs) continue;
          const want = Math.min(rem, ge - gs);
          if (want < Math.min(MIN_PIECE, rem)) continue;
          const s = gs, e = gs + want;
          carve(day, s, e, 'move');
          const meta = { ...(p.block.meta || {}), auto: true, movedFrom: p.homeDs, movedFromTime: hm(p.fromS) };
          let id = 'mv-' + p.homeDs + '-' + p.block.id + '-' + p.fromS + '-' + part;
          while (usedIds[id]) id += '+'; usedIds[id] = 1;
          if (p.queue) { id = 'resched-' + p.queue.id + (part ? '-' + part : ''); meta.rescheduled = true; meta.from = p.queue.originalDate; meta.queueId = p.queue.id; delete meta.auto; }
          day.blocks.push({ ...clone(p.block), id, _s: s, _e: e, meta, status: p.queue ? (p.queue.status || '') : '' });
          placedParts.push({ ds: d, s, e });
          log.push({ t: 'moved', title: p.block.title || '', labelKey: p.block.labelKey, type: p.block.type, fromDs: p.queue ? p.queue.originalDate : p.homeDs, fromS: p.fromS, fromE: p.fromE, ds: d, s, e, why: p.why, ...ref(p) });
          rem -= want; part++;
        }
        // same day (then each later day): the commute, for work you can do on the go
        if (rem > 0 && isCommuteBlock(p.block)) {
          const c = commuteSlot(day, rem, Math.min(15, rem));
          if (c) {
            useCommute(c, { kind: 'block', title: p.block.title || '', labelKey: p.block.labelKey, type: p.block.type, detail: (p.block.meta && p.block.meta.detail) || '' });
            placedParts.push({ ds: d, s: c.s, e: c.e });
            log.push({ t: 'moved', title: p.block.title || '', labelKey: p.block.labelKey, type: p.block.type, fromDs: p.queue ? p.queue.originalDate : p.homeDs, fromS: p.fromS, fromE: p.fromE, ds: d, s: c.s, e: c.e, why: p.why, commute: true, ...ref(p) });
            rem -= c.e - c.s;
          }
        }
      }
      if (rem > 0) log.push({ t: placedParts.length ? 'shortened' : 'dropped', title: p.block.title || '', labelKey: p.block.labelKey, type: p.block.type, fromDs: p.homeDs, fromS: p.fromS, fromE: p.fromE, len: p.len - rem, lost: rem, why: p.why, ...ref(p) });
    });

    // ---------- output ----------
    const out = {};
    order.forEach((d) => {
      const day = days[d];
      out[d] = { isRest: day.isRest, blocks: day.blocks.sort((a, b) => a._s - b._s || a._e - b._e).map((b) => {
        const o = { ...b, start: hm(b._s), end: hm(b._e) }; delete o._s; delete o._e; delete o._hard; return o;
      }) };
    });
    const fmt = (x) => { const o = { ...x }; ['s', 'e', 'fromS', 'fromE'].forEach((k) => { if (typeof o[k] === 'number') o[k] = hm(o[k]); }); return o; };
    return { days: out, log: log.map(fmt), warnings: warnings.map(fmt), tasks, range: { from, to: ctx.to } };
  }

  /** Entries present in `after` but not in `before` (what changed because of an edit). */
  function diffLogs(before, after) {
    const key = (x) => JSON.stringify([x.t, x.item || '', x.title, x.labelKey || '', x.type, x.fromDs || '', x.fromS || '', x.ds || '', x.s || '', x.e || '', x.len || '']);
    const seen = {}; (before || []).forEach((x) => { const k = key(x); seen[k] = (seen[k] || 0) + 1; });
    return (after || []).filter((x) => { const k = key(x); if (seen[k]) { seen[k]--; return false; } return true; });
  }

  const API = { buildPlan, diffLogs, apptTimes, taskRemaining, occurrences, occurrenceDates, isCommuteBlock, addDays, tm, te, hm, ov, FLEX_W, DAY_START, PRAYER_MIN, MIN_PIECE };
  G.MMPlanner = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
