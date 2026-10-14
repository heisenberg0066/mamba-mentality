/* Mamba Mentality v2 — core: utils, pacing, schedule model */
const MM = { state: null, tab: 'today', view: 'day', date: null, toastTimer: null };
const HOUR = 56;
const WHOUR = 34;
const TYPES = ['wake', 'jobs', 'swedish', 'revision', 'solidworks', 'deep', 'meal', 'mealprep', 'buffer', 'chill', 'wind', 'rest', 'other'];
const FOCUS_TYPES = ['jobs', 'swedish', 'revision', 'solidworks', 'deep', 'mealprep'];
const WORK_TYPES = ['jobs', 'swedish', 'revision', 'solidworks', 'deep', 'mealprep', 'other'];
const PACE_BY_MODE = { none: 4, 'part-time': 2.5, 'full-time': 1.5 };

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function persist() { mmSave(MM.state); }
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
function sortedRevision() {
  const pr = { high: 0, quick: 1 };
  return MM.state.courses.filter((x) => x.priority !== 'later' && courseLeft(x) > 0)
    .sort((a, b) => pr[a.priority] - pr[b.priority] || MM.state.courses.indexOf(a) - MM.state.courses.indexOf(b));
}
function activeCourse() {
  const s = MM.state.settings;
  let c = MM.state.courses.find((x) => x.code === s.activeCourse && courseLeft(x) > 0);
  if (!c) { c = sortedRevision()[0] || null; if (c && s.activeCourse !== c.code) { s.activeCourse = c.code; persist(); } }
  return c;
}
function revisionQueue() {
  const list = sortedRevision(); const act = activeCourse();
  if (act) { const i = list.indexOf(act); if (i > 0) { list.splice(i, 1); list.unshift(act); } }
  return list;
}
function workDaysBetween(a, b) { let n = 0; for (let d = a; d < b; d = mmAddDays(d, 1)) if (!isRestDay(d)) n++; return n; }
function projectRevision(ds) {
  const queue = revisionQueue(); if (!queue.length) return null;
  let skip = Math.floor(workDaysBetween(mmTodayStr(), ds) * ((PACE_BY_MODE[MM.state.settings.jobMode] || 4) / 6));
  for (const c of queue) {
    const left = c.topics.filter((x) => !x.done);
    if (skip < left.length) return { course: c, topic: left[skip] };
    skip -= left.length;
  }
  return null;
}
function projectSwedish(ds) {
  const left = chapters().filter((c) => !c.done); if (!left.length) return null;
  const perDay = Number(swedishStats().pace) / 6;
  return left[Math.min(left.length - 1, Math.floor(workDaysBetween(mmTodayStr(), ds) * perDay))];
}
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
function enrich(b, ds) {
  const swStart = MM.state.settings.solidWorksStart || MM_SEED.solidWorksStart;
  if (b.type === 'solidworks' && ds < swStart) { b.type = 'revision'; if (!b.title) b.labelKey = 'blockRevisionMore'; }
  b.meta = b.meta || {};
  if (!b.detailOverride) {
    if (b.type === 'swedish') {
      const ch = ds <= mmTodayStr() ? nextSwedishChapter() : projectSwedish(ds);
      b.meta.detail = ch ? `${ch.book} · ${ch.num}: ${ch.title}` : '';
    } else if (b.type === 'revision' || b.type === 'deep') {
      const p = projectRevision(ds);
      b.meta.detail = p ? `${p.course.code} — ${p.topic.name}` : '';
    } else if (b.type === 'solidworks') {
      const it = nextSwItem(); b.meta.detail = it ? it.title : '';
    }
  }
  return b;
}
function placeRescheduled(blocks, item) {
  const dur = Math.max(15, endMin(item.block.end) - toMin(item.block.start));
  const tryPlace = (ignore) => {
    const occ = blocks.filter((b) => !ignore.includes(b.type)).map((b) => [toMin(b.start), endMin(b.end)]).sort((a, b) => a[0] - b[0]);
    let cur = 6 * 60 + 30;
    for (const [s, e] of occ) { if (s - cur >= dur) return cur; cur = Math.max(cur, e); }
    return 1440 - cur >= dur ? cur : null;
  };
  let st = tryPlace(['buffer']);
  if (st == null) st = tryPlace(['buffer', 'chill']);
  if (st == null) st = tryPlace(['buffer', 'chill', 'wind', 'meal']);
  if (st == null) st = 19 * 60;
  return { start: fromMin(st), end: fromMin(Math.min(1440, st + dur)) };
}
function getDay(ds) {
  const rest = isRestDay(ds) && !MM.state.days[ds];
  const blocks = baseBlocks(ds).map((b) => enrich(b, ds));
  const status = MM.state.dayStatus[ds] || {};
  blocks.forEach((b) => { b.status = status[b.id] || ''; });
  MM.state.missedQueue.filter((q) => q.rescheduleDate === ds).forEach((q) => {
    const slot = placeRescheduled(blocks, q);
    const b = enrich({ ...clone(q.block), id: 'resched-' + q.id, ...slot }, ds);
    b.meta.rescheduled = true; b.meta.from = q.originalDate; b.meta.queueId = q.id;
    b.status = q.status || '';
    blocks.push(b);
  });
  blocks.sort((a, b) => toMin(a.start) - toMin(b.start));
  return { isRest: rest, blocks };
}
function findNextFreeDate(fromDs) {
  let d = fromDs;
  for (let i = 0; i < 28; i++) {
    d = mmAddDays(d, 1);
    if (isRestDay(d)) continue;
    if (MM.state.missedQueue.filter((q) => q.rescheduleDate === d && !q.status).length < 3) return d;
  }
  return mmAddDays(fromDs, 1);
}
function setStatus(ds, b, status) {
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
