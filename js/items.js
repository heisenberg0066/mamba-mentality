/* Mamba Mentality v4.1 — "＋ Add" flow: appointments, deadline tasks, free time; items list; replan summary + undo */
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
function itemWhen(it) {
  if (!it) return '';
  if (it.kind === 'appt') { const T = MMPlanner.apptTimes(it); return `${fmtDay(it.date)} ${fromMin(T.s)}–${fromMin(T.e)}${T.bs < T.s || T.be > T.e ? ` · 🚶 ${fromMin(T.bs)}–${fromMin(T.be)}` : ''}`; }
  return `${t('dueOn')} ${fmtDay(it.deadline)} · ${fmtDur(it.effort)} · ${t('prio_' + (it.priority || 'normal'))}`;
}
function itemById(id) { return planItems().find((x) => x.id === id); }
function openItemCount() { return planItems().filter((x) => !x.done && (x.kind === 'task' || (x.date || '') >= mmTodayStr())).length; }
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
function commitPlanChange(mutate, focusId) {
  const snap = clone({ items: planItems(), stamp: MM.state.planStamp, planStart: MM.state.settings.planStart });
  restamp(); MM.rev++;           // replan from "now" — and compare against the plan as of now
  const before = currentPlan();
  mutate();
  persist();
  const after = currentPlan();
  showPlanSummary(before, after, snap, focusId);
  render();
}
function warnKey(w) { return JSON.stringify([w.t, w.item || '', w.ds || '', w.a || '', w.b || '', w.need || '', w.placed || '', w.title || '']); }
function showPlanSummary(before, after, snap, focusId) {
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
  const html = `<div class="stack">
    ${focus ? `<div class="sum-head">${focus.kind === 'appt' ? '📍' : '✅'} <b>${esc(focus.title)}</b>${focus.done ? ' ✓' : ''}<div class="muted small">${esc(itemWhen(focus))}</div></div>` : ''}
    ${warns.map(warningHtml).join('')}
    ${shown.length ? `<ul class="chg-list">${shown.map(line).join('')}</ul>${changes.length > shown.length ? `<p class="muted small">+${changes.length - shown.length} ${esc(t('moreChanges'))}</p>` : ''}` : `<p class="muted">${esc(t('summaryNoChanges'))}</p>`}
    <div class="row"><button class="btn" id="sum-undo">↶ ${esc(t('undo'))}</button><button class="btn primary" id="sum-ok" style="flex:1">${esc(t('ok'))}</button></div></div>`;
  openSheet(t('summaryTitle'), html, (root, close) => {
    $('#sum-ok', root).onclick = close;
    $('#sum-undo', root).onclick = () => {
      MM.state.items = snap.items; MM.state.planStamp = snap.stamp; MM.state.settings.planStart = snap.planStart;
      persist(); close(); toast(t('undone')); render();
    };
    wireWarnings(root, close);
  });
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
function openItemSheet(id) { const it = itemById(id); if (!it) return; if (it.kind === 'appt') openApptSheet(id); else openTaskSheet(id); }
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
function openApptSheet(id, ds, time) {
  const existing = id ? itemById(id) : null;
  const a = existing ? clone(existing) : { id: mmUid('ap'), kind: 'appt', title: '', notes: '', date: ds && ds >= mmTodayStr() ? ds : mmTodayStr(), start: time || '10:00', endMode: 'duration', duration: 60, end: '', travelBefore: 0, travelAfter: 0, done: false };
  const durOpts = DUR_OPTS.concat(DUR_OPTS.includes(Number(a.duration)) ? [] : [Number(a.duration) || 60]).sort((x, y) => x - y);
  openSheet(existing ? t('editAppt') : t('newAppt'), `<div class="stack">
    <label class="field">${esc(t('title'))}<input id="ap-title" value="${esc(a.title)}" placeholder="${esc(t('apptPlaceholder'))}"></label>
    <div class="grid2"><label class="field">${esc(t('date'))}<input type="date" id="ap-date" value="${esc(a.date)}"></label>
      <label class="field">${esc(t('start'))}<input type="time" id="ap-start" value="${esc(a.start)}" step="300"></label></div>
    <div class="seg" id="ap-mode"><button data-m="duration" class="${a.endMode !== 'end' ? 'active' : ''}">${esc(t('duration'))}</button><button data-m="end" class="${a.endMode === 'end' ? 'active' : ''}">${esc(t('endTime'))}</button></div>
    <label class="field ${a.endMode === 'end' ? 'hidden' : ''}" id="ap-dur-f">${esc(t('duration'))}<select id="ap-dur">${durOpts.map((m) => `<option value="${m}" ${Number(a.duration) === m ? 'selected' : ''}>${esc(fmtDur(m))}</option>`).join('')}</select></label>
    <label class="field ${a.endMode === 'end' ? '' : 'hidden'}" id="ap-end-f">${esc(t('endTime'))}<input type="time" id="ap-end" value="${esc(a.end || fromMin(toMin(a.start) + 60))}" step="300"></label>
    <div class="grid2"><label class="field">${esc(t('travelBefore'))}<input type="number" id="ap-tb" min="0" max="240" step="5" value="${Number(a.travelBefore) || 0}" inputmode="numeric"></label>
      <label class="field">${esc(t('travelAfter'))}<input type="number" id="ap-ta" min="0" max="240" step="5" value="${Number(a.travelAfter) || 0}" inputmode="numeric"></label></div>
    <p class="muted small">${esc(t('apptBlocksHint'))}</p>
    <label class="field">${esc(t('notes'))}<textarea id="ap-notes">${esc(a.notes || '')}</textarea></label>
    <button class="btn primary block" id="ap-save">${esc(existing ? t('save') : t('addAndReplan'))}</button>
    ${itemActions(existing)}</div>`, (root, close) => {
    let mode = a.endMode === 'end' ? 'end' : 'duration';
    $$('#ap-mode button', root).forEach((b) => { b.onclick = () => {
      mode = b.dataset.m; $$('#ap-mode button', root).forEach((x) => x.classList.toggle('active', x === b));
      $('#ap-dur-f', root).classList.toggle('hidden', mode !== 'duration'); $('#ap-end-f', root).classList.toggle('hidden', mode !== 'end');
    }; });
    $('#ap-save', root).onclick = () => {
      const v = { title: $('#ap-title', root).value.trim() || t('type_appt'), notes: $('#ap-notes', root).value, date: $('#ap-date', root).value, start: $('#ap-start', root).value,
        endMode: mode, travelBefore: Math.max(0, Math.min(240, Number($('#ap-tb', root).value) || 0)), travelAfter: Math.max(0, Math.min(240, Number($('#ap-ta', root).value) || 0)) };
      if (!v.date || !v.start) { toast(t('fillDateTime')); return; }
      if (mode === 'end') { v.end = $('#ap-end', root).value; v.duration = endMin(v.end) - toMin(v.start); } else { v.duration = Number($('#ap-dur', root).value) || 60; v.end = ''; }
      if (mode === 'end' && (!v.end || endMin(v.end) <= toMin(v.start))) { toast(`${t('end')} > ${t('start')}`); return; }
      if (toMin(v.start) + v.duration > 1440) { toast(t('beforeMidnight')); return; }
      close();
      commitPlanChange(() => { if (existing) Object.assign(existing, v); else planItems().push({ ...a, ...v, createdAt: new Date().toISOString() }); }, a.id);
    };
    wireItemActions(root, close, existing);
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
    <label class="field ${k.splittable ? '' : 'hidden'}" id="tk-chunk-f">${esc(t('chunkSize'))}<select id="tk-chunk">${[30, 45, 60, 90, 120].map((m) => `<option value="${m}" ${Number(k.chunk) === m ? 'selected' : ''}>${esc(fmtDur(m))}</option>`).join('')}</select></label>
    <label class="field">${esc(t('notes'))}<textarea id="tk-notes">${esc(k.notes || '')}</textarea></label>
    ${existing ? `<div class="card inner"><div class="muted small">${esc(t('scheduledLabel'))}${doneMin ? ` · ✓ ${esc(fmtDur(doneMin))} ${esc(t('doneSoFar'))}` : ''}</div>
      ${chunks.length ? chunks.map((c) => `<div class="small">📅 ${esc(fmtDay(c.ds))} ${fromMin(c.s)}–${fromMin(c.e)}</div>`).join('') : `<div class="small muted">—</div>`}
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
        deadline: dl(), effort: Number($('#tk-eff', root).value) || 60, priority: $('#tk-prio', root).value, splittable: $('#tk-split', root).checked, chunk: Number($('#tk-chunk', root).value) || 60 };
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
  const appts = items.filter((x) => x.kind === 'appt' && !x.done && (x.date || '') >= today).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const tasks = items.filter((x) => x.kind === 'task' && !x.done).sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
  const done = items.filter((x) => x.done || (x.kind === 'appt' && (x.date || '') < today)).slice(-15).reverse();
  const row = (it) => {
    let sub = itemWhen(it);
    if (it.kind === 'task') { const inf = plan.tasks[it.id]; sub += `${inf ? ` · ${fmtDur(inf.placed)}/${fmtDur(inf.need)} ${t('scheduledShort')}` : ''}${inf && inf.placed < inf.need ? ' ⚠' : ''}`; }
    return `<div class="list-item"><button class="chapter-main" data-open="${esc(it.id)}"><b>${it.kind === 'appt' ? '📍' : '✅'} ${it.done ? '<s>' + esc(it.title) + '</s>' : esc(it.title)}</b><div class="muted small">${esc(sub)}</div></button>
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
