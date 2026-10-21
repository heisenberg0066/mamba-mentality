/* Mamba Mentality v4.3 — "＋ Add" flow (repeating appointments, smarter clash handling): appointments, deadline tasks, free time; items list; replan summary + undo */
const EFFORT_OPTS = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480];
const DUR_OPTS = [15, 30, 45, 60, 90, 120, 180, 240];
function fmtDur(m) {
  m = Math.round(m || 0); const h = Math.floor(m / 60), r = m % 60;
  return (h ? h + ' ' + t('durH') : '') + (h && r ? ' ' : '') + (r || !h ? r + ' ' + t('durM') : '');
}
function fmtDay(ds) {
  if (!ds) return ''; const mn = monthNames()[Number(ds.slice(5, 7)) - 1];
  return `${wdName(ds)} ${Number(ds.slice(8))} ${MM.state.settings.lang === 'ar' ? mn : mn.slice(0, 3)}`;
}
function wdOfDow(d) { return wdNames()[(Number(d) + 6) % 7]; }
function repeatText(it) {
  const r = it.repeat || {};
  if (r.mode === 'weekly') {
    const days = (r.days && r.days.length ? r.days : [dow(it.date)]).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    return `🔁 ${t('repEvery')} ${days.map(wdOfDow).join(', ')}${r.until ? ` · ${t('repUntil')} ${fmtDay(r.until)}` : r.count ? ` · ${r.count}×` : ''}`;
  }
  if (r.mode === 'dates') { const ds = r.dates || []; return `🔁 ${ds.length} ${t('repDatesN')}: ${ds.slice(0, 3).map(fmtDay).join(', ')}${ds.length > 3 ? '…' : ''}`; }
  return '';
}
function nextOccurrence(it, from) {
  if (!isSeries(it)) return it.date;
  const f = from || mmTodayStr(); return MMPlanner.occurrenceDates(it, f, mmAddDays(f, 400))[0] || null;
}
function itemWhen(it) {
  if (!it) return '';
  if (it.kind === 'appt') {
    const T = MMPlanner.apptTimes(it); const times = `${fromMin(T.s)}–${fromMin(T.e)}${T.bs < T.s || T.be > T.e ? ` · 🚶 ${fromMin(T.bs)}–${fromMin(T.be)}` : ''}`;
    if (isSeries(it)) { const n = nextOccurrence(it); return `${repeatText(it)} · ${times}${n ? ` · ${t('repNext')} ${fmtDay(n)}` : ''}`; }
    return `${fmtDay(it.date)} ${times}`;
  }
  return `${t('dueOn')} ${fmtDay(it.deadline)} · ${fmtDur(it.effort)} · ${t('prio_' + (it.priority || 'normal'))}`;
}
function itemById(id) { return planItems().find((x) => x.id === id); }
function apptUpcoming(x) { return isSeries(x) ? !!nextOccurrence(x) : (x.date || '') >= mmTodayStr(); }
function openItemCount() { return planItems().filter((x) => !x.done && (x.kind === 'task' || apptUpcoming(x))).length; }
function logLabel(x) { return x.title || (x.labelKey ? t(x.labelKey) : t('type_' + (x.type || 'other'))); }

/* ---------- chooser ---------- */
function openAddChooser(ds, time) {
  const opt = (id, ico, title, hint) => `<button class="add-opt" data-opt="${id}"><span class="add-ico">${ico}</span><span><b>${esc(t(title))}</b><small>${esc(t(hint))}</small></span></button>`;
  openSheet(t('addWhat'), `<div class="stack">
    ${opt('appt', '📍', 'addAppt', 'addApptHint')}
    ${opt('task', '✅', 'addTask', 'addTaskHint')}
    ${opt('free', '⚡', 'addFree', 'addFreeHint')}
    ${opt('block', '▦', 'addCustom', 'addCustomHint')}</div>`, (root, close) => {
    $$('[data-opt]', root).forEach((b) => { b.onclick = () => {
      close(); const o = b.dataset.opt;
      if (o === 'appt') openApptSheet(null, ds, time);
      else if (o === 'task') openTaskSheet(null);
      else if (o === 'free') { MM.tab = 'free'; render(); window.scrollTo(0, 0); }
      else openBlockSheet(ds, null, time);
    }; });
  });
}

/* ---------- change + summary + undo ---------- */
function planSnapshot() { return clone({ items: planItems(), stamp: MM.state.planStamp, planStart: MM.state.settings.planStart, dayDrops: MM.state.dayDrops || {}, missedQueue: MM.state.missedQueue }); }
function restoreSnapshot(snap) {
  MM.state.items = snap.items; MM.state.planStamp = snap.stamp; MM.state.settings.planStart = snap.planStart;
  if (snap.dayDrops) MM.state.dayDrops = snap.dayDrops; if (snap.missedQueue) MM.state.missedQueue = snap.missedQueue;
  persist();
}
/** Change something, re-run the whole planner from now on, show what changed (+ clash help) with Undo. */
function commitPlanChange(mutate, focusId, opts) {
  const snap = planSnapshot();
  restamp(); MM.rev++;           // replan from "now" — and compare against the plan as of now
  const before = currentPlan();
  const r = mutate();
  if (r === false) { MM.rev++; return null; }
  persist();
  const after = currentPlan();
  const focus = focusId ? itemById(focusId) : null;
  const clash = (opts && opts.clashOf) ? clashReport(before, after, opts.clashOf) : (opts && opts.clash && focus && focus.kind === 'appt') ? clashReport(before, after, focusId) : null;
  if (opts && opts.silent) return { before, after, clash, snap }; // (tests / batch use)
  showPlanSummary(before, after, snap, focusId, clash, opts);
  render();
  return { before, after, clash };
}
function warnKey(w) { return JSON.stringify([w.t, w.item || '', w.ds || '', w.a || '', w.b || '', w.need || '', w.placed || '', w.title || '']); }
function showPlanSummary(before, after, snap, focusId, clash, opts) {
  const rank = { placed: 0, moved: 1, shortened: 2, dropped: 3 };
  const changes = MMPlanner.diffLogs(before.log, after.log).sort((a, b) => (rank[a.t] - rank[b.t]) || ((a.ds || a.fromDs) + (a.s || a.fromS)).localeCompare((b.ds || b.fromDs) + (b.s || b.fromS)));
  const focus = focusId ? itemById(focusId) : null;
  const oldW = new Set(before.warnings.map(warnKey));
  const warns = after.warnings.filter((w) => !oldW.has(warnKey(w)) || (focusId && (w.item === focusId || w.a === focusId || w.b === focusId)));
  const shown = changes.slice(0, 14);
  const line = (x) => {
    if (x.t === 'placed') return `<li class="chg placed">✅ <b>${esc(x.title)}</b> → ${esc(fmtDay(x.ds))} ${x.s}–${x.e}</li>`;
    if (x.t === 'moved') return `<li class="chg moved">↪ <b>${esc(logLabel(x))}</b> <span class="muted">${esc(fmtDay(x.fromDs))} ${x.fromS}–${x.fromE}</span> → ${esc(fmtDay(x.ds))} ${x.s}–${x.e}</li>`;
    if (x.t === 'shortened') return `<li class="chg short">✂ <b>${esc(logLabel(x))}</b> <span class="muted">${esc(fmtDay(x.fromDs || x.ds))} ${x.fromS}–${x.fromE}</span> · ${esc(t('logShortened'))}${x.lost ? ' −' + esc(fmtDur(x.lost)) : ' → ' + esc(fmtDur(x.len))}</li>`;
    return `<li class="chg dropped">✕ <b>${esc(logLabel(x))}</b> <span class="muted">${esc(fmtDay(x.fromDs))} ${x.fromS}–${x.fromE}</span> · ${esc(t('logDropped'))}</li>`;
  };
  const hasClash = clash && (clash.moved.length || clash.unplaced.length);
  const unplacedTasks = new Set(clash ? clash.unplaced.filter((u) => u.kind === 'task').map((u) => u.itemId) : []);
  const html = `<div class="stack">
    ${opts && opts.note ? `<div class="sum-note">${esc(opts.note)}</div>` : ''}
    ${focus ? `<div class="sum-head">${focus.kind === 'appt' ? '📍' : '✅'} <b>${esc(focus.title)}</b>${focus.done ? ' ✓' : ''}<div class="muted small">${esc(itemWhen(focus))}</div></div>` : ''}
    ${clash ? clashHtml(clash) : ''}
    ${warns.filter((w) => !(w.t === 'overflow' && unplacedTasks.has(w.item))).map(warningHtml).join('')}
    ${hasClash ? `<details class="all-chg"><summary class="field-label">${esc(t('allChanges'))} (${changes.length})</summary>` : ''}
    ${shown.length ? `<ul class="chg-list">${shown.map(line).join('')}</ul>${changes.length > shown.length ? `<p class="muted small">+${changes.length - shown.length} ${esc(t('moreChanges'))}</p>` : ''}` : `<p class="muted">${esc(t('summaryNoChanges'))}</p>`}
    ${hasClash ? '</details>' : ''}
    <div class="row sum-actions"><button class="btn" id="sum-undo">↶ ${esc(t('undo'))}</button><button class="btn primary" id="sum-ok" style="flex:1">${esc(t('ok'))}</button></div></div>`;
  openSheet(clash && clash.unplaced.length ? t('clashTitle') : t('summaryTitle'), html, (root, close) => {
    $('#sum-ok', root).onclick = close;
    $('#sum-undo', root).onclick = () => { restoreSnapshot(snap); close(); toast(t('undone')); render(); };
    wireWarnings(root, close);
    if (clash) wireClash(root, close, clash, focusId);
  });
}
/* ---------- clash section ---------- */
const HOW_ICON = { sameDay: '↪', commute: '🚶', laterDay: '📅' };
function fixLabel(f, u) {
  const X = u.title;
  if (f.code === 'tomorrow') return (f.extends ? t('fixTomorrowExt') : t('fixTomorrow')).replace('{x}', X).replace('{d}', fmtDay(f.to));
  if (f.code === 'swap' && f.withBase) return t('fixSwapRoutine').replace('{x}', X).replace('{y}', f.withTitle + (f.withTime ? ` ${f.withTime}` : ''));
  if (f.code === 'swap') return t('fixSwap').replace('{x}', X).replace('{y}', f.withTitle + (f.withTime ? ` ${f.withTime}` : '')).replace('{d}', f.to ? fmtDay(f.to) : t('fixSwapDropped'));
  if (f.code === 'split') return t('sugSplit');
  if (f.code === 'drop') return (f.routine ? t('fixDropRoutine') : t('fixDrop')).replace('{x}', X);
  return '';
}
function clashHtml(c) {
  const mvRow = (m) => `
      <div class="mv-row"><span class="mv-ico">${HOW_ICON[m.how] || '↪'}</span><div class="mv-main"><b>${esc(m.title)}</b>
        <div class="small"><span class="muted"><s>${esc(fmtDay(m.fromDs))} ${m.fromS}</s></span> → <b>${esc(fmtDay(m.ds))} ${m.s}–${m.e}</b></div>
        <span class="how-tag how-${m.how}">${esc(t('how_' + m.how))}${m.deadline ? ` · ${esc(t('dueOn'))} ${esc(fmtDay(m.deadline))}` : ''}</span></div></div>`;
  const mv = c.moved.slice().sort((a, b) => (a.kind === 'task' ? 0 : 1) - (b.kind === 'task' ? 0 : 1) || (a.fromDs + a.fromS).localeCompare(b.fromDs + b.fromS));
  const movedHtml = mv.length ? `<div class="clash-sec ok"><div class="clash-h">✅ ${esc(t('clashMoved'))} <span class="muted small">· ${mv.length}</span></div>${mv.slice(0, 4).map(mvRow).join('')}
      ${mv.length > 4 ? `<details class="more-mv"><summary class="muted small">+${mv.length - 4} ${esc(t('moreChanges'))}</summary>${mv.slice(4, 40).map(mvRow).join('')}</details>` : ''}</div>` : '';
  const unCard = (u, i) => `
      <div class="un-card"><div><b>${u.kind === 'task' ? '✅' : '▦'} ${esc(u.title)}</b> <span class="muted small">${esc(fmtDay(u.ds))}${u.fromS ? ' ' + u.fromS : ''} · ${esc(fmtDur(u.lost))}</span></div>
        <div class="fix-list">${u.suggestions.slice(0, 3).map((f, j) => `<button class="fix-btn ${j === 0 ? 'best' : ''}" data-fixc="${i}:${j}">${j === 0 ? `<span class="best-tag">${esc(t('bestPick'))}</span>` : ''}${esc(fixLabel(f, u))}</button>`).join('')}</div></div>`;
  const un = c.unplaced.map((u, i) => ({ u, i }));
  const unHtml = un.length ? `<div class="clash-sec bad"><div class="clash-h">⚠ ${esc(t('clashUnplaced'))} <span class="muted small">· ${un.length}</span></div>${un.slice(0, 3).map((x) => unCard(x.u, x.i)).join('')}
      ${un.length > 3 ? `<details class="more-mv"><summary class="muted small">+${un.length - 3} ${esc(t('moreToSort'))}</summary>${un.slice(3).map((x) => unCard(x.u, x.i)).join('')}</details>` : ''}</div>` : '';
  const days = c.days.filter((d) => c.dayLists[d] && c.dayLists[d].length);
  const listHtml = days.length ? `<details class="clash-sec day-pick" ${c.unplaced.length ? 'open' : ''}><summary class="clash-h">📋 ${esc(t('clashDayList'))}</summary>
      <p class="muted small">${esc(t('clashDayHint'))}</p>
      ${days.length > 1 ? `<div class="seg day-seg">${days.slice(0, 6).map((d, i) => `<button data-cday="${d}" class="${i ? '' : 'active'}">${esc(fmtDay(d))}</button>`).join('')}</div>` : ''}
      ${days.map((d, i) => `<div class="day-list ${i ? 'hidden' : ''}" data-dlist="${d}">${c.dayLists[d].map((x, k) => {
        const can = !x.self && ['routine', 'task', 'queue'].includes(x.kind) && x.type !== 'wake';
        return `<label class="dl-row ${can ? '' : 'fixed'}"><i class="bar ev-${esc(x.type)}"></i><span class="dl-time">${x.start}–${x.end}</span><span class="dl-main"><b>${esc(x.title)}</b>${x.detail ? `<small>${esc(x.detail)}</small>` : ''}</span>
          ${can ? `<input type="checkbox" data-drop="${esc(d)}:${k}" aria-label="${esc(t('dropThis'))}">` : `<span class="dl-lock">${x.self ? '📍' : '🔒'}</span>`}</label>`;
      }).join('')}</div>`).join('')}
      <button class="btn danger block" id="dl-apply" disabled>✕ ${esc(t('dropSelected'))}</button></details>` : '';
  return unHtml + movedHtml + listHtml;
}
function wireClash(root, close, c, focusId) {
  $$('[data-fixc]', root).forEach((b) => { b.onclick = () => {
    const [i, j] = b.dataset.fixc.split(':').map(Number); const u = c.unplaced[i]; const f = u.suggestions[j];
    close();
    if (f.routine && f.code === 'drop') { toast(t('keptDropped')); return; }
    commitPlanChange(() => applyClashFix(f), focusId, { clashOf: c.itemId, note: '✓ ' + fixLabel(f, u) });
  }; });
  $$('[data-cday]', root).forEach((b) => { b.onclick = () => {
    $$('[data-cday]', root).forEach((x) => x.classList.toggle('active', x === b));
    $$('[data-dlist]', root).forEach((x) => x.classList.toggle('hidden', x.dataset.dlist !== b.dataset.cday));
  }; });
  const ap = $('#dl-apply', root);
  const sel = () => $$('[data-drop]', root).filter((x) => x.checked).map((x) => { const [d, k] = x.dataset.drop.split(':'); return c.dayLists[d][Number(k)]; });
  $$('[data-drop]', root).forEach((x) => { x.onchange = () => { const n = sel().length; ap.disabled = !n; ap.textContent = `✕ ${t('dropSelected')}${n ? ` (${n})` : ''}`; }; });
  if (ap) ap.onclick = () => {
    const list = sel(); if (!list.length) return; close();
    commitPlanChange(() => applyDayDrops(list), focusId, { clashOf: c.itemId, note: `✓ ${t('droppedN').replace('{n}', list.length)}: ${list.map((x) => x.title).join(', ')}` });
  };
}
function warningHtml(w) {
  if (w.t === 'overflow') {
    const sug = (w.suggestions || []).map((s) => {
      if (s.code === 'split') return `<li>${esc(t('sugSplit'))} <button class="btn sm" data-fix="split" data-id="${esc(w.item)}">${esc(t('apply'))}</button></li>`;
      if (s.code === 'shorten') return `<li>${esc(t('sugShorten').replace('{x}', fmtDur(s.mins)))} <button class="btn sm" data-fix="shorten" data-id="${esc(w.item)}" data-mins="${s.mins}">${esc(t('apply'))}</button></li>`;
      if (s.code === 'drop') return `<li>${esc(t('sugDrop').replace('{x}', s.title).replace('{y}', fmtDur(s.mins) + ' · ' + t('prio_' + s.priority)))} <button class="btn sm" data-fix="open" data-id="${esc(s.itemId)}">${esc(t('openItem'))}</button></li>`;
      if (s.code === 'extend') return `<li>${esc(t('sugExtend'))} <button class="btn sm" data-fix="open" data-id="${esc(w.item)}">${esc(t('openItem'))}</button></li>`;
      if (s.code === 'planStart') return `<li>${esc(t('sugPlanStart').replace('{x}', fmtDay(s.date)))}</li>`;
      if (s.code === 'pastDeadline') return `<li>${esc(t('sugPast'))}</li>`;
      return '';
    }).join('');
    return `<div class="warn-card"><b>⚠ ${esc(w.title || t('type_task'))}: ${esc(t('warnOverflow'))}</b>
      <div class="small">${esc((w.placed ? t('warnOverflowDetail') : t('warnOverflowNone')).replace('{placed}', fmtDur(w.placed)).replace('{need}', fmtDur(w.need)).replace('{date}', fmtDay(w.deadline)))}</div>
      ${sug ? `<div class="small muted" style="margin-top:6px">${esc(t('suggestions'))}</div><ul class="sug-list">${sug}</ul>` : ''}</div>`;
  }
  if (w.t === 'conflict') return `<div class="warn-card"><b>⚠ ${esc(t('warnConflict'))}</b><div class="small">${esc(fmtDay(w.ds))}: ${esc(w.titleA || '')} ↔ ${esc(w.titleB || '')}</div></div>`;
  if (w.t === 'essential') return `<div class="warn-card"><b>⚠ ${esc(t('warnEssential'))} ${esc(logLabel(w))}</b><div class="small">${esc(fmtDay(w.ds))} ${w.s}–${w.e}</div></div>`;
  if (w.t === 'chill') return `<div class="warn-card soft"><b>⚠ ${esc(t('warnChill'))}</b><div class="small">${esc(fmtDay(w.ds))} · ${esc(fmtDur(w.len))}</div></div>`;
  return '';
}
function wireWarnings(root, close) {
  $$('[data-fix]', root).forEach((b) => { b.onclick = () => {
    const it = itemById(b.dataset.id); if (!it) return; close();
    if (b.dataset.fix === 'open') { openItemSheet(it.id); return; }
    commitPlanChange(() => {
      if (b.dataset.fix === 'split') { it.splittable = true; it.chunk = it.chunk || 60; }
      if (b.dataset.fix === 'shorten') it.effort = Number(b.dataset.mins);
    }, it.id);
  }; });
}
function planBanner() {
  const ws = planWarnings().filter((w) => w.t === 'overflow' || w.t === 'conflict' || w.t === 'essential');
  if (!ws.length) return '';
  return `<button class="card plan-warn" data-planwarn>⚠ ${ws.length} ${esc(t('needAttention'))} · ${esc(ws[0].title || ws[0].titleA || logLabel(ws[0]))} ›</button>`;
}

/* ---------- item sheets ---------- */
function openItemSheet(id, occ) { const it = itemById(id); if (!it) return; if (it.kind === 'appt') openApptSheet(id, null, null, occ); else openTaskSheet(id); }
function itemActions(it) {
  return it ? `<div class="row">
    <button class="btn success ${it.done ? 'on' : ''}" id="it-done" style="flex:1">${it.done ? '↺ ' + esc(t('markIncomplete')) : '✓ ' + esc(t('markComplete'))}</button>
    <button class="btn danger" id="it-del">${esc(t('delete'))}</button></div>` : '';
}
function wireItemActions(root, close, it) {
  if (!it) return;
  $('#it-done', root).onclick = () => { close(); commitPlanChange(() => { it.done = !it.done; it.doneAt = it.done ? mmTodayStr() : null; }, it.id); };
  $('#it-del', root).onclick = () => { if (!confirm(t('confirmDelete'))) return; close(); commitPlanChange(() => { MM.state.items = planItems().filter((x) => x.id !== it.id); }, it.id); };
}
function openApptSheet(id, ds, time, occ) {
  const existing = id ? itemById(id) : null;
  const series = existing && isSeries(existing);
  const occDs = series ? (occ || nextOccurrence(existing) || existing.date) : null;
  const ov = series && existing.overrides && existing.overrides[occDs] ? existing.overrides[occDs] : {};
  const a = existing ? clone(existing) : { id: mmUid('ap'), kind: 'appt', title: '', notes: '', date: ds && ds >= mmTodayStr() ? ds : mmTodayStr(), start: time || '10:00', endMode: 'duration', duration: 60, end: '', travelBefore: 0, travelAfter: 0, done: false, repeat: { mode: 'none' }, skip: [], overrides: {} };
  a.repeat = a.repeat && a.repeat.mode ? a.repeat : { mode: 'none' };
  // when opened on one occurrence, show that occurrence's own values
  const o = series ? { ...a, ...ov, date: ov.date || occDs } : a;
  const durOpts = DUR_OPTS.concat(DUR_OPTS.includes(Number(o.duration)) ? [] : [Number(o.duration) || 60]).sort((x, y) => x - y);
  const rep = clone(a.repeat);
  rep.days = rep.days && rep.days.length ? rep.days : [dow(a.date)];
  rep.dates = rep.dates && rep.dates.length ? rep.dates : [a.date];
  const endMode0 = rep.until ? 'until' : rep.count ? 'count' : 'never';
  const wdBtns = [1, 2, 3, 4, 5, 6, 0].map((d) => `<button type="button" class="wd-chip ${rep.days.includes(d) ? 'on' : ''}" data-wd="${d}">${esc(wdOfDow(d))}</button>`).join('');
  openSheet(existing ? (series ? t('editOccurrence') : t('editAppt')) : t('newAppt'), `<div class="stack">
    ${series ? `<div class="seg" id="ap-scope"><button data-sc="one" class="active">📅 ${esc(t('scopeOne'))} · ${esc(fmtDay(occDs))}</button><button data-sc="all">🔁 ${esc(t('scopeSeries'))}</button></div>` : ''}
    <label class="field">${esc(t('title'))}<input id="ap-title" value="${esc(o.title)}" placeholder="${esc(t('apptPlaceholder'))}"></label>
    <div class="grid2"><label class="field" id="ap-date-f">${esc(t('date'))}<input type="date" id="ap-date" value="${esc(o.date)}"></label>
      <label class="field">${esc(t('start'))}<input type="time" id="ap-start" value="${esc(o.start)}" step="300"></label></div>
    <div class="seg" id="ap-mode"><button data-m="duration" class="${o.endMode !== 'end' ? 'active' : ''}">${esc(t('duration'))}</button><button data-m="end" class="${o.endMode === 'end' ? 'active' : ''}">${esc(t('endTime'))}</button></div>
    <label class="field ${o.endMode === 'end' ? 'hidden' : ''}" id="ap-dur-f">${esc(t('duration'))}<select id="ap-dur">${durOpts.map((m) => `<option value="${m}" ${Number(o.duration) === m ? 'selected' : ''}>${esc(fmtDur(m))}</option>`).join('')}</select></label>
    <label class="field ${o.endMode === 'end' ? '' : 'hidden'}" id="ap-end-f">${esc(t('endTime'))}<input type="time" id="ap-end" value="${esc(o.end || fromMin(toMin(o.start) + 60))}" step="300"></label>
    <div class="grid2"><label class="field">${esc(t('travelBefore'))}<input type="number" id="ap-tb" min="0" max="240" step="5" value="${Number(o.travelBefore) || 0}" inputmode="numeric"></label>
      <label class="field">${esc(t('travelAfter'))}<input type="number" id="ap-ta" min="0" max="240" step="5" value="${Number(o.travelAfter) || 0}" inputmode="numeric"></label></div>
    <div class="rep-box ${series ? 'hidden' : ''}" id="ap-rep">
      <div class="field-label">🔁 ${esc(t('repeat'))}</div>
      <div class="seg" id="rep-mode"><button data-r="none">${esc(t('repNone'))}</button><button data-r="weekly">${esc(t('repWeekly'))}</button><button data-r="dates">${esc(t('repDates'))}</button></div>
      <div id="rep-weekly" class="stack-sm">
        <div class="wd-row">${wdBtns}</div>
        <div class="seg" id="rep-end"><button data-e="never">${esc(t('repNever'))}</button><button data-e="until">${esc(t('repUntilBtn'))}</button><button data-e="count">${esc(t('repCount'))}</button></div>
        <label class="field" id="rep-until-f">${esc(t('repEndDate'))}<input type="date" id="rep-until" value="${esc(rep.until || mmAddDays(a.date, 56))}"></label>
        <label class="field" id="rep-count-f">${esc(t('repTimes'))}<input type="number" id="rep-count" min="1" max="200" value="${Number(rep.count) || 8}" inputmode="numeric"></label>
      </div>
      <div id="rep-dates" class="stack-sm">
        <p class="muted small">${esc(t('repDatesHint'))}</p>
        <div class="row"><input type="date" id="rep-new" value="${esc(mmAddDays(a.date, 7))}" style="flex:1"><button type="button" class="btn sm primary" id="rep-add">＋ ${esc(t('repAddDate'))}</button></div>
        <div class="date-chips" id="rep-chips"></div>
      </div>
      <div class="muted small" id="rep-sum"></div>
    </div>
    <p class="muted small">${esc(t('apptBlocksHint'))}</p>
    <label class="field">${esc(t('notes'))}<textarea id="ap-notes">${esc(o.notes || '')}</textarea></label>
    <button class="btn primary block" id="ap-save">${esc(existing ? t('save') : t('addAndReplan'))}</button>
    ${existing ? `<div class="row">
      <button class="btn success ${(series ? ov.done : existing.done) ? 'on' : ''}" id="it-done" style="flex:1">${(series ? ov.done : existing.done) ? '↺ ' + esc(t('markIncomplete')) : '✓ ' + esc(t('markComplete'))}</button>
      <button class="btn danger" id="it-del">${esc(t('delete'))}</button></div>` : ''}</div>`, (root, close) => {
    let mode = o.endMode === 'end' ? 'end' : 'duration';
    let scope = series ? 'one' : 'all';
    let rmode = rep.mode || 'none'; let emode = endMode0;
    const syncRep = () => {
      $$('#rep-mode button', root).forEach((x) => x.classList.toggle('active', x.dataset.r === rmode));
      $('#rep-weekly', root).classList.toggle('hidden', rmode !== 'weekly');
      $('#rep-dates', root).classList.toggle('hidden', rmode !== 'dates');
      $$('#rep-end button', root).forEach((x) => x.classList.toggle('active', x.dataset.e === emode));
      $('#rep-until-f', root).classList.toggle('hidden', emode !== 'until'); $('#rep-count-f', root).classList.toggle('hidden', emode !== 'count');
      $('#ap-date-f', root).classList.toggle('dim', rmode === 'dates' && scope === 'all');
      $$('.wd-chip', root).forEach((x) => x.classList.toggle('on', rep.days.includes(Number(x.dataset.wd))));
      rep.dates = Array.from(new Set(rep.dates)).sort();
      $('#rep-chips', root).innerHTML = rep.dates.map((d) => `<span class="date-chip">${esc(fmtDay(d))} <small>${d.slice(0, 4)}</small><button type="button" data-rmd="${d}" aria-label="${esc(t('delete'))}">✕</button></span>`).join('');
      $$('[data-rmd]', root).forEach((x) => { x.onclick = () => { rep.dates = rep.dates.filter((d) => d !== x.dataset.rmd); syncRep(); }; });
      const r = readRep(); const sum = $('#rep-sum', root);
      if (r.mode === 'none') sum.textContent = '';
      else { const n = MMPlanner.occurrenceDates({ ...a, kind: 'appt', date: $('#ap-date', root).value || a.date, repeat: r, skip: [], overrides: {} }, mmTodayStr(), mmAddDays(mmTodayStr(), 120)); sum.textContent = n.length ? `→ ${n.length}× ${t('repNext120')}: ${n.slice(0, 4).map(fmtDay).join(', ')}${n.length > 4 ? '…' : ''}` : ''; }
    };
    const readRep = () => {
      if (rmode === 'weekly') return { mode: 'weekly', days: rep.days.slice().sort(), ...(emode === 'until' ? { until: $('#rep-until', root).value || null } : {}), ...(emode === 'count' ? { count: Math.max(1, Number($('#rep-count', root).value) || 1) } : {}) };
      if (rmode === 'dates') return { mode: 'dates', dates: rep.dates.slice() };
      return { mode: 'none' };
    };
    $$('#rep-mode button', root).forEach((b) => { b.onclick = () => { rmode = b.dataset.r; syncRep(); }; });
    $$('#rep-end button', root).forEach((b) => { b.onclick = () => { emode = b.dataset.e; syncRep(); }; });
    $$('.wd-chip', root).forEach((b) => { b.onclick = () => { const d = Number(b.dataset.wd); rep.days = rep.days.includes(d) ? rep.days.filter((x) => x !== d) : rep.days.concat(d); if (!rep.days.length) rep.days = [d]; syncRep(); }; });
    $('#rep-add', root).onclick = () => { const v = $('#rep-new', root).value; if (v) { rep.dates.push(v); $('#rep-new', root).value = mmAddDays(v, 7); syncRep(); } };
    $('#ap-date', root).onchange = () => { if (rmode !== 'dates') syncRep(); };
    $('#rep-until', root).onchange = syncRep; $('#rep-count', root).oninput = syncRep;
    syncRep();
    $$('#ap-scope button', root).forEach((b) => { b.onclick = () => {
      scope = b.dataset.sc; $$('#ap-scope button', root).forEach((x) => x.classList.toggle('active', x === b));
      $('#ap-rep', root).classList.toggle('hidden', scope !== 'all');
      $('#ap-date', root).value = scope === 'all' ? a.date : (ov.date || occDs);
      syncRep();
    }; });
    $$('#ap-mode button', root).forEach((b) => { b.onclick = () => {
      mode = b.dataset.m; $$('#ap-mode button', root).forEach((x) => x.classList.toggle('active', x === b));
      $('#ap-dur-f', root).classList.toggle('hidden', mode !== 'duration'); $('#ap-end-f', root).classList.toggle('hidden', mode !== 'end');
    }; });
    $('#ap-save', root).onclick = () => {
      const v = { title: $('#ap-title', root).value.trim() || t('type_appt'), notes: $('#ap-notes', root).value, date: $('#ap-date', root).value, start: $('#ap-start', root).value,
        endMode: mode, travelBefore: Math.max(0, Math.min(240, Number($('#ap-tb', root).value) || 0)), travelAfter: Math.max(0, Math.min(240, Number($('#ap-ta', root).value) || 0)) };
      const r = scope === 'all' ? readRep() : null;
      if (r && r.mode === 'dates') { if (!r.dates.length) { toast(t('repPickDates')); return; } v.date = r.dates[0]; }
      if (!v.date || !v.start) { toast(t('fillDateTime')); return; }
      if (mode === 'end') { v.end = $('#ap-end', root).value; v.duration = endMin(v.end) - toMin(v.start); } else { v.duration = Number($('#ap-dur', root).value) || 60; v.end = ''; }
      if (mode === 'end' && (!v.end || endMin(v.end) <= toMin(v.start))) { toast(`${t('end')} > ${t('start')}`); return; }
      if (toMin(v.start) + v.duration > 1440) { toast(t('beforeMidnight')); return; }
      close();
      commitPlanChange(() => {
        if (existing && series && scope === 'one') { // just this occurrence
          const oo = occOverride(existing, occDs); Object.assign(oo, v); if (oo.date === occDs) delete oo.date;
          return;
        }
        if (r) v.repeat = r;
        if (existing) Object.assign(existing, v); else planItems().push({ ...a, ...v, createdAt: new Date().toISOString() });
      }, a.id, { clash: true });
    };
    if (existing) {
      $('#it-done', root).onclick = () => { close(); commitPlanChange(() => {
        if (series && scope === 'one') { const oo = occOverride(existing, occDs); oo.done = !oo.done; } else { existing.done = !existing.done; existing.doneAt = existing.done ? mmTodayStr() : null; }
      }, existing.id); };
      $('#it-del', root).onclick = () => {
        const one = series && scope === 'one';
        if (!confirm(one ? t('confirmDeleteOne') : series ? t('confirmDeleteSeries') : t('confirmDelete'))) return; close();
        commitPlanChange(() => {
          if (one) { existing.skip = pushUnique(existing.skip || [], occDs); if (existing.overrides) delete existing.overrides[occDs]; }
          else MM.state.items = planItems().filter((x) => x.id !== existing.id);
        }, one ? existing.id : null, one ? { note: '✕ ' + t('occDeleted').replace('{d}', fmtDay(occDs)) } : { note: '✕ ' + existing.title });
      };
    }
  });
}
function openTaskSheet(id) {
  const existing = id ? itemById(id) : null;
  const today = mmTodayStr();
  const k = existing ? clone(existing) : { id: mmUid('tk'), kind: 'task', title: '', notes: '', dueMode: 'days', dueDays: 7, deadline: mmAddDays(today, 7), effort: 120, splittable: true, chunk: 60, priority: 'normal', done: false, log: [] };
  const effOpts = EFFORT_OPTS.concat(EFFORT_OPTS.includes(Number(k.effort)) ? [] : [Number(k.effort)]).sort((x, y) => x - y);
  const info = currentPlan().tasks[k.id];
  const doneMin = (Number(k.effort) || 0) - MMPlanner.taskRemaining(k);
  const chunks = info ? info.chunks : [];
  openSheet(existing ? t('editTask') : t('newTask'), `<div class="stack">
    <label class="field">${esc(t('title'))}<input id="tk-title" value="${esc(k.title)}" placeholder="${esc(t('taskPlaceholder'))}"></label>
    <div class="field-label">${esc(t('dueLabel'))}</div>
    <div class="seg" id="tk-due"><button data-d="today">${esc(t('dueToday'))}</button><button data-d="date">${esc(t('dueByDate'))}</button><button data-d="days">${esc(t('dueWithin'))}</button></div>
    <label class="field" id="tk-date-f">${esc(t('date'))}<input type="date" id="tk-date" value="${esc(k.deadline || today)}" min="${today}"></label>
    <label class="field" id="tk-days-f">${esc(t('daysCount'))}<input type="number" id="tk-days" min="1" max="60" value="${Number(k.dueDays) || 7}" inputmode="numeric"></label>
    <div class="muted small" id="tk-due-out"></div>
    <div class="grid2"><label class="field">${esc(t('effort'))}<select id="tk-eff">${effOpts.map((m) => `<option value="${m}" ${Number(k.effort) === m ? 'selected' : ''}>${esc(fmtDur(m))}</option>`).join('')}</select></label>
      <label class="field">${esc(t('priority'))}<select id="tk-prio">${['high', 'normal', 'low'].map((p) => `<option value="${p}" ${k.priority === p ? 'selected' : ''}>${esc(t('prio_' + p))}</option>`).join('')}</select></label></div>
    <label class="check-row"><input type="checkbox" id="tk-split" ${k.splittable ? 'checked' : ''}> ${esc(t('splittable'))}</label>
    <label class="check-row"><input type="checkbox" id="tk-commute" ${k.commute ? 'checked' : ''}> 🚶 ${esc(t('commuteOk'))}</label>
    <label class="field ${k.splittable ? '' : 'hidden'}" id="tk-chunk-f">${esc(t('chunkSize'))}<select id="tk-chunk">${[30, 45, 60, 90, 120].map((m) => `<option value="${m}" ${Number(k.chunk) === m ? 'selected' : ''}>${esc(fmtDur(m))}</option>`).join('')}</select></label>
    <label class="field">${esc(t('notes'))}<textarea id="tk-notes">${esc(k.notes || '')}</textarea></label>
    ${existing ? `<div class="card inner"><div class="muted small">${esc(t('scheduledLabel'))}${doneMin ? ` · ✓ ${esc(fmtDur(doneMin))} ${esc(t('doneSoFar'))}` : ''}</div>
      ${chunks.length ? chunks.map((c) => `<div class="small">${c.commute ? '🚶' : '📅'} ${esc(fmtDay(c.ds))} ${fromMin(c.s)}–${fromMin(c.e)}${c.commute ? ' · ' + esc(t('how_commute')) : ''}</div>`).join('') : `<div class="small muted">—</div>`}
      ${info && info.placed < info.need ? `<div class="small red">⚠ ${esc(t('warnOverflow'))}</div>` : ''}</div>` : ''}
    <button class="btn primary block" id="tk-save">${esc(existing ? t('save') : t('addAndReplan'))}</button>
    ${itemActions(existing)}</div>`, (root, close) => {
    let due = k.dueMode || 'date';
    const sync = () => {
      $$('#tk-due button', root).forEach((x) => x.classList.toggle('active', x.dataset.d === due));
      $('#tk-date-f', root).classList.toggle('hidden', due !== 'date'); $('#tk-days-f', root).classList.toggle('hidden', due !== 'days');
      $('#tk-due-out', root).textContent = '→ ' + t('dueOn') + ' ' + fmtDay(dl());
    };
    const dl = () => due === 'today' ? today : due === 'days' ? mmAddDays(today, Math.max(1, Number($('#tk-days', root).value) || 1)) : ($('#tk-date', root).value || today);
    $$('#tk-due button', root).forEach((b) => { b.onclick = () => { due = b.dataset.d; sync(); }; });
    $('#tk-days', root).oninput = sync; $('#tk-date', root).onchange = sync;
    $('#tk-split', root).onchange = (e) => $('#tk-chunk-f', root).classList.toggle('hidden', !e.target.checked);
    sync();
    $('#tk-save', root).onclick = () => {
      const v = { title: $('#tk-title', root).value.trim() || t('type_task'), notes: $('#tk-notes', root).value, dueMode: due, dueDays: Number($('#tk-days', root).value) || 7,
        deadline: dl(), effort: Number($('#tk-eff', root).value) || 60, priority: $('#tk-prio', root).value, splittable: $('#tk-split', root).checked, chunk: Number($('#tk-chunk', root).value) || 60, commute: $('#tk-commute', root).checked };
      close();
      commitPlanChange(() => {
        if (existing) { Object.assign(existing, v); if (existing.done && MMPlanner.taskRemaining(existing) > 0 && v.effort !== k.effort) existing.done = false; }
        else planItems().push({ ...k, ...v, log: [], createdAt: new Date().toISOString() });
      }, k.id);
    };
    wireItemActions(root, close, existing);
  });
}

/* ---------- items list ---------- */
function openItemsSheet() {
  const today = mmTodayStr(); const plan = currentPlan(); const items = planItems();
  const appts = items.filter((x) => x.kind === 'appt' && !x.done && apptUpcoming(x)).sort((a, b) => ((nextOccurrence(a) || '') + a.start).localeCompare((nextOccurrence(b) || '') + b.start));
  const tasks = items.filter((x) => x.kind === 'task' && !x.done).sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
  const done = items.filter((x) => x.done || (x.kind === 'appt' && !apptUpcoming(x))).slice(-15).reverse();
  const row = (it) => {
    let sub = itemWhen(it);
    if (it.kind === 'task') { const inf = plan.tasks[it.id]; sub += `${inf ? ` · ${fmtDur(inf.placed)}/${fmtDur(inf.need)} ${t('scheduledShort')}` : ''}${inf && inf.placed < inf.need ? ' ⚠' : ''}`; }
    return `<div class="list-item"><button class="chapter-main" data-open="${esc(it.id)}"><b>${it.kind === 'appt' ? (isSeries(it) ? '🔁' : '📍') : '✅'} ${it.done ? '<s>' + esc(it.title) + '</s>' : esc(it.title)}</b><div class="muted small">${esc(sub)}</div></button>
      <button class="btn sm ${it.done ? 'success on' : ''}" data-tick="${esc(it.id)}" aria-label="${esc(t('markComplete'))}">✓</button></div>`;
  };
  const ws = planWarnings();
  openSheet(t('myItems'), `<div class="stack">
    <button class="btn primary block" id="il-add">＋ ${esc(t('addBtn'))}</button>
    ${ws.map(warningHtml).join('')}
    ${!appts.length && !tasks.length ? `<p class="muted">${esc(t('itemsEmpty'))}</p>` : ''}
    ${appts.length ? `<div class="field-label">📍 ${esc(t('upcoming'))}</div>${appts.map(row).join('')}` : ''}
    ${tasks.length ? `<div class="field-label">✅ ${esc(t('tasksLabel'))}</div>${tasks.map(row).join('')}` : ''}
    ${done.length ? `<details><summary class="field-label">${esc(t('done'))} (${done.length})</summary>${done.map(row).join('')}</details>` : ''}
    <p class="muted small">${esc(t('planStartLabel'))}: ${esc(fmtDay(planStartDate()))} · ${esc(t('planStartWhere'))}</p></div>`, (root, close) => {
    $('#il-add', root).onclick = () => { close(); openAddChooser(MM.date); };
    $$('[data-open]', root).forEach((b) => { b.onclick = () => { close(); openItemSheet(b.dataset.open); }; });
    $$('[data-tick]', root).forEach((b) => { b.onclick = () => { const it = itemById(b.dataset.tick); close(); commitPlanChange(() => { it.done = !it.done; it.doneAt = it.done ? mmTodayStr() : null; }, it.id); }; });
    wireWarnings(root, close);
  });
}
