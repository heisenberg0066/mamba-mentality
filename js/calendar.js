/* Mamba Mentality v2 — iPhone-Calendar-style views, block sheet, ICS export */
function openBlockSheet(ds, blockId, presetStart) {
  const day = getDay(ds);
  const existing = day.blocks.find((b) => b.id === blockId);
  const isNew = !existing;
  const st0 = presetStart || '10:00';
  const b = existing ? clone(existing) : { id: mmUid('b'), type: 'other', start: st0, end: fromMin(toMin(st0) + 60), notes: '', link: '', subtasks: [], meta: {} };
  b.subtasks = b.subtasks || []; b.meta = b.meta || {};
  const resched = !!b.meta.queueId;
  const dayLabel = isRestDay(ds) ? t('templateRest') : longDayName(dow(ds));
  const typeOpts = TYPES.map((x) => `<option value="${x}" ${b.type === x ? 'selected' : ''}>${esc(t('type_' + x))}</option>`).join('');
  const html = `<div class="stack">
    <div class="sheet-meta"><span class="dot-lg ev-${esc(b.type)}"></span>${esc(wdName(ds))} ${ds}${resched ? ` · <span class="badge">${esc(t('rescheduled'))} ← ${esc(b.meta.from)}</span>` : ''}</div>
    <label class="field">${esc(t('title'))}<input id="bs-title" value="${esc(isNew ? '' : blockTitle(b))}"></label>
    <div class="grid2">
      <label class="field">${esc(t('start'))}<input type="time" id="bs-start" value="${esc(b.start)}" step="300"></label>
      <label class="field">${esc(t('end'))}<input type="time" id="bs-end" value="${esc(b.end)}" step="300"></label></div>
    <label class="field">${esc(t('type'))}<select id="bs-type">${typeOpts}</select></label>
    ${b.meta.detail ? `<div class="detail-chip">📌 ${esc(b.meta.detail)}</div>` : ''}
    <label class="field">${esc(t('notes'))}<textarea id="bs-notes">${esc(b.notes || '')}</textarea></label>
    <label class="field">${esc(t('link'))}<input type="url" id="bs-link" value="${esc(b.link || '')}" placeholder="https://"></label>
    ${b.link ? `<a class="link" href="${esc(b.link)}" target="_blank" rel="noopener">↗ ${esc(b.link)}</a>` : ''}
    <div class="field-label">${esc(t('subtasks'))}</div><div id="bs-subs">${subtaskEditor(b.subtasks)}</div>
    ${!isNew ? `<div class="field-label">${esc(t('status'))}</div><div class="row">
      <button class="btn sm success ${b.status === 'done' ? 'on' : ''}" id="bs-done">✓ ${esc(t('markDone'))}</button>
      <button class="btn sm danger ${b.status === 'missed' ? 'on' : ''}" id="bs-missed">↻ ${esc(t('markMissed'))}</button></div>` : ''}
    ${resched ? '' : `<div class="field-label">${esc(t('scopeLabel'))}</div>
    <div class="seg" id="bs-scope"><button data-scope="day" class="active">${esc(t('scopeDay'))}</button><button data-scope="template">${esc(t('scopeTemplate'))} ${esc(dayLabel)}</button></div>`}
    <button class="btn primary block" id="bs-save">${esc(t('save'))}</button>
    ${!isNew ? `<button class="btn danger block" id="bs-del">${esc(t('delete'))}</button>` : ''}</div>`;
  openSheet(isNew ? t('newBlock') : t('editBlock'), html, (root, close) => {
    let scope = 'day';
    const rewire = () => { $('#bs-subs', root).innerHTML = subtaskEditor(b.subtasks); wireSubtasks(root, b.subtasks, rewire); };
    wireSubtasks(root, b.subtasks, rewire);
    $$('#bs-scope button', root).forEach((btn) => { btn.onclick = () => { scope = btn.dataset.scope; $$('#bs-scope button', root).forEach((x) => x.classList.toggle('active', x === btn)); }; });
    $('#bs-save', root).onclick = () => {
      const title = $('#bs-title', root).value.trim();
      b.type = $('#bs-type', root).value;
      const auto = blockTitle({ type: b.type, labelKey: b.labelKey });
      if (title && title !== auto) b.title = title; else delete b.title;
      b.start = $('#bs-start', root).value || b.start; b.end = $('#bs-end', root).value || b.end;
      b.notes = $('#bs-notes', root).value; b.link = $('#bs-link', root).value.trim();
      if (endMin(b.end) <= toMin(b.start)) { toast(`${t('end')} > ${t('start')}`); return; }
      saveBlock(ds, b, scope, isNew); close(); toast(t('saved')); render();
    };
    const del = $('#bs-del', root);
    if (del) del.onclick = () => { if (confirm(t('confirmDelete'))) { deleteBlock(ds, b, scope); close(); toast(t('deleted')); render(); } };
    const dn = $('#bs-done', root); if (dn) dn.onclick = () => { setStatus(ds, existing, 'done'); close(); render(); };
    const ms = $('#bs-missed', root); if (ms) ms.onclick = () => { setStatus(ds, existing, 'missed'); close(); render(); };
  });
}

function layoutColumns(blocks) {
  const items = blocks.map((b) => ({ b, s: toMin(b.start), e: endMin(b.end), col: 0, cols: 1 }));
  const groups = []; let cur = []; let curEnd = -1;
  items.forEach((it) => { if (it.s >= curEnd && cur.length) { groups.push(cur); cur = []; } cur.push(it); curEnd = Math.max(curEnd, it.e); });
  if (cur.length) groups.push(cur);
  groups.forEach((g) => {
    const ends = [];
    g.forEach((it) => { let c = ends.findIndex((e) => e <= it.s); if (c < 0) { c = ends.length; ends.push(0); } ends[c] = it.e; it.col = c; });
    g.forEach((it) => { it.cols = ends.length; });
  });
  return items;
}
function hourLabels(px) {
  let h = '';
  for (let i = 0; i <= 24; i++) h += `<div class="hr" style="top:${i * px}px"><span>${String(i % 24).padStart(2, '0')}:00</span></div>`;
  return h;
}
function prayerLines(px, ds) {
  return prayersFor(ds).map((p) => `<div class="prayer-line" style="top:${(toMin(p.time) / 60) * px}px"><span>${esc(t(p.key))} ${p.time}</span></div>`).join('');
}
function nowLine(ds, px, label) {
  if (ds !== mmTodayStr()) return '';
  const n = new Date(); const m = n.getHours() * 60 + n.getMinutes();
  return `<div class="now-line" style="top:${(m / 60) * px}px">${label ? `<span class="now-time">${mmNowHM()}</span>` : ''}</div>`;
}
function calToolbar() {
  const [y, m] = MM.date.split('-').map(Number);
  return `<div class="cal-toolbar">
    <div class="row between">
      <button class="nav-arrow" data-nav="-1" aria-label="prev">‹</button>
      <div class="cal-title">${esc(monthNames()[m - 1])} ${y}</div>
      <button class="nav-arrow" data-nav="1" aria-label="next">›</button></div>
    <div class="row between tb-row">
      <button class="btn sm today-btn" data-today>${esc(t('todayBtn'))}</button>
      <div class="seg cal-seg">${['day', 'week', 'month', 'list'].map((x) => `<button data-view="${x}" class="${MM.view === x ? 'active' : ''}">${esc(t('view' + x[0].toUpperCase() + x.slice(1)))}</button>`).join('')}</div>
      <button class="btn sm" data-ics aria-label="${esc(t('icsExport'))}">📆</button>
      <button class="btn sm primary add-btn" data-add aria-label="${esc(t('addBlock'))}">＋</button>
    </div></div>`;
}
function weekStrip(ds) {
  const ws = weekStart(ds); const today = mmTodayStr(); let h = '<div class="week-strip">';
  for (let i = 0; i < 7; i++) {
    const d = mmAddDays(ws, i);
    h += `<button class="ws-day ${d === ds ? 'sel' : ''} ${d === today ? 'today' : ''} ${isRestDay(d) ? 'rest' : ''}" data-pick="${d}"><span class="ws-wd">${esc(wdNames()[i])}</span><span class="ws-num">${Number(d.slice(8))}</span></button>`;
  }
  return h + '</div>';
}
function eventHtml(it, px, ds, compact) {
  const b = it.b; const top = (it.s / 60) * px; const h = Math.max(compact ? 14 : 22, ((it.e - it.s) / 60) * px - 2);
  const w = 100 / it.cols; const left = it.col * w;
  const cls = ['ev', 'ev-' + b.type, b.status ? 'st-' + b.status : '', b.meta && b.meta.rescheduled ? 'resched' : '', compact ? 'compact' : ''].join(' ');
  const mark = b.status === 'done' ? '✓ ' : b.status === 'missed' ? '↻ ' : '';
  return `<button class="${cls}" data-ev="${esc(b.id)}" data-date="${ds}" style="top:${top}px;height:${h}px;inset-inline-start:calc(${left}% + 1px);width:calc(${w}% - 3px)">
    <span class="ev-title">${mark}${esc(blockTitle(b))}</span>
    ${!compact && h > 34 ? `<span class="ev-time">${b.start} – ${b.end}</span>` : ''}
    ${!compact && h > 52 && b.meta && b.meta.detail ? `<span class="ev-detail">${esc(b.meta.detail)}</span>` : ''}</button>`;
}
function renderDayView(ds) {
  const day = getDay(ds);
  return `${weekStrip(ds)}
    <div class="day-head">${esc(longDayName(dow(ds)))} ${Number(ds.slice(8))} ${esc(monthNames()[Number(ds.slice(5, 7)) - 1])}${day.isRest ? ` · <span class="badge">${esc(t('restDay'))}</span>` : ''}</div>
    <div class="cal-scroll" id="cal-scroll"><div class="grid day-grid" style="height:${24 * HOUR}px">
      ${hourLabels(HOUR)}${prayerLines(HOUR, ds)}
      <div class="ev-layer">${layoutColumns(day.blocks).map((it) => eventHtml(it, HOUR, ds, false)).join('')}</div>
      ${nowLine(ds, HOUR, true)}</div></div>`;
}
function renderWeekView(ds) {
  const ws = weekStart(ds); const today = mmTodayStr();
  let head = '<div class="wk-head"><div class="wk-gutter"></div>'; let cols = '';
  for (let i = 0; i < 7; i++) {
    const d = mmAddDays(ws, i);
    head += `<button class="wk-hd ${d === today ? 'today' : ''} ${d === ds ? 'sel' : ''}" data-pickday="${d}"><span>${esc(wdNames()[i])}</span><b>${Number(d.slice(8))}</b></button>`;
    cols += `<div class="wk-col ${isRestDay(d) ? 'rest' : ''}">${layoutColumns(getDay(d).blocks).map((it) => eventHtml(it, WHOUR, d, true)).join('')}${nowLine(d, WHOUR, false)}</div>`;
  }
  return `${head}</div><div class="cal-scroll" id="cal-scroll"><div class="grid wk-grid" style="height:${24 * WHOUR}px">${hourLabels(WHOUR)}<div class="wk-cols">${cols}</div></div></div>`;
}
function renderMonthView(ds) {
  const [, m] = ds.split('-').map(Number);
  let d = weekStart(ds.slice(0, 8) + '01'); const today = mmTodayStr();
  let h = `<div class="mo-head">${wdNames().map((w) => `<span>${esc(w)}</span>`).join('')}</div><div class="mo-grid">`;
  for (let i = 0; i < 42; i++) {
    if (i % 7 === 0 && i >= 28 && Number(d.slice(5, 7)) !== m) break;
    const inMonth = Number(d.slice(5, 7)) === m; const day = getDay(d);
    const focus = day.blocks.filter((b) => FOCUS_TYPES.includes(b.type));
    const types = [...new Set(focus.map((b) => b.type))].slice(0, 5);
    const allDone = focus.length && focus.every((b) => b.status === 'done');
    h += `<button class="mo-cell ${inMonth ? '' : 'out'} ${d === today ? 'today' : ''} ${d === ds ? 'sel' : ''}" data-pick="${d}">
      <span class="mo-num">${Number(d.slice(8))}</span>
      <span class="mo-dots">${day.isRest ? '<i class="dot ev-rest"></i>' : types.map((x) => `<i class="dot ev-${x}"></i>`).join('')}</span>${allDone ? '<span class="mo-done">✓</span>' : ''}</button>`;
    d = mmAddDays(d, 1);
  }
  const sel = getDay(ds);
  h += `</div><div class="mo-list"><div class="day-head">${esc(longDayName(dow(ds)))} ${ds}</div>${sel.blocks.map((b) => `
    <button class="mo-item" data-ev="${esc(b.id)}" data-date="${ds}"><i class="bar ev-${b.type}"></i>
      <span class="mo-item-main"><b>${b.status === 'done' ? '✓ ' : ''}${esc(blockTitle(b))}</b>${b.meta && b.meta.detail ? `<small>${esc(b.meta.detail)}</small>` : ''}</span>
      <span class="mo-item-time">${b.start}<br>${b.end}</span></button>`).join('')}</div>`;
  return h;
}
function renderListView(ds) {
  const day = getDay(ds);
  return `${weekStrip(ds)}<div class="card">${day.blocks.map((b, i) => `
    <div class="list-block ${b.status ? 'st-' + b.status : ''}"><i class="bar ev-${b.type}"></i>
      <button class="lb-main" data-ev="${esc(b.id)}" data-date="${ds}"><span class="time">${b.start}–${b.end}</span><b>${esc(blockTitle(b))}</b>${b.meta && b.meta.detail ? `<small>${esc(b.meta.detail)}</small>` : ''}</button>
      ${b.meta && b.meta.queueId ? '' : `<div class="lb-move"><button class="btn sm ghost" data-move="${esc(b.id)}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="${esc(t('moveUp'))}">▲</button><button class="btn sm ghost" data-move="${esc(b.id)}" data-dir="1" ${i === day.blocks.length - 1 ? 'disabled' : ''} aria-label="${esc(t('moveDown'))}">▼</button></div>`}
      <div class="lb-status"><button class="btn sm success ${b.status === 'done' ? 'on' : ''}" data-quick="done" data-id="${esc(b.id)}">✓</button><button class="btn sm danger ${b.status === 'missed' ? 'on' : ''}" data-quick="missed" data-id="${esc(b.id)}">↻</button></div>
    </div>`).join('')}</div>`;
}
function renderToday(root) {
  const today = mmTodayStr();
  let recap = '';
  if (MM.state.settings.morningRecapDismissedDate !== today) {
    const day = getDay(today); const ch = nextSwedishChapter(); const ac = activeCourse();
    const due = MM.state.missedQueue.filter((q) => q.rescheduleDate === today && !q.status).length;
    const n = day.blocks.filter((b) => FOCUS_TYPES.includes(b.type)).length;
    recap = `<div class="card recap compact-recap"><div class="row between"><b>☀️ ${esc(t('morningRecap'))}</b><button class="btn sm ghost" data-action="dismiss-recap" aria-label="${esc(t('dismiss'))}">✕</button></div>
      <div class="muted small">${n} × ${esc(t('type_deep'))}${ch ? ' · 🇸🇪 ' + esc(ch.book + ' ' + ch.num) : ''}${ac ? ' · 📚 ' + esc(ac.code) : ''}${due ? ' · ↻ ' + due : ''}</div></div>`;
  }
  const views = { day: renderDayView, week: renderWeekView, month: renderMonthView, list: renderListView };
  root.innerHTML = recap + calToolbar() + (views[MM.view] || renderDayView)(MM.date);
  const go = (d) => { MM.date = d; render(); };
  $$('[data-nav]', root).forEach((b) => { b.onclick = () => {
    const n = Number(b.dataset.nav);
    if (MM.view === 'month') { const [y, m] = MM.date.split('-').map(Number); go(mmTodayStr(new Date(y, m - 1 + n, 1))); }
    else go(mmAddDays(MM.date, MM.view === 'week' ? 7 * n : n));
  }; });
  $$('[data-view]', root).forEach((b) => { b.onclick = () => { MM.view = b.dataset.view; MM.state.settings.calView = MM.view; persist(); render(); }; });
  $('[data-today]', root).onclick = () => go(today);
  $('[data-add]', root).onclick = () => openBlockSheet(MM.date, null);
  $('[data-ics]', root).onclick = () => openIcsSheet();
  $$('[data-pick]', root).forEach((b) => { b.onclick = () => go(b.dataset.pick); });
  $$('[data-pickday]', root).forEach((b) => { b.onclick = () => { MM.view = 'day'; go(b.dataset.pickday); }; });
  $$('[data-ev]', root).forEach((b) => { b.onclick = (e) => { e.stopPropagation(); openBlockSheet(b.dataset.date, b.dataset.ev); }; });
  $$('[data-move]', root).forEach((b) => { b.onclick = () => { moveBlock(MM.date, b.dataset.move, Number(b.dataset.dir)); render(); }; });
  $$('[data-quick]', root).forEach((b) => { b.onclick = () => {
    const blk = getDay(MM.date).blocks.find((x) => x.id === b.dataset.id); if (blk) { setStatus(MM.date, blk, b.dataset.quick); render(); }
  }; });
  const grid = $('.day-grid', root);
  if (grid) grid.addEventListener('click', (e) => {
    if (e.target.closest('.ev')) return;
    const r = grid.getBoundingClientRect();
    openBlockSheet(MM.date, null, fromMin(Math.floor(((e.clientY - r.top) / HOUR) * 4) * 15));
  });
  const dis = $('[data-action="dismiss-recap"]', root);
  if (dis) dis.onclick = () => { MM.state.settings.morningRecapDismissedDate = today; persist(); render(); };
  const sc = $('#cal-scroll', root);
  if (sc) {
    const nav = $('nav.tabs'); const top = sc.getBoundingClientRect().top + window.scrollY;
    sc.style.height = Math.max(300, window.innerHeight - top - (nav ? nav.offsetHeight : 64) - 4) + 'px';
    const n = new Date(); const fm = MM.date === today ? n.getHours() * 60 + n.getMinutes() - 90 : 6 * 60 - 20;
    sc.scrollTop = Math.max(0, (fm / 60) * (MM.view === 'week' ? WHOUR : HOUR));
  }
}

/* ICS */
function collectIcsEvents(from, to, opts) {
  const evs = [];
  for (let d = from; d <= to; d = mmAddDays(d, 1)) {
    getDay(d).blocks.forEach((b) => {
      if (opts.focusOnly && !FOCUS_TYPES.includes(b.type) && b.type !== 'other') return;
      const detail = b.meta && b.meta.detail ? b.meta.detail : '';
      const parts = [];
      if (detail) parts.push(detail);
      if (b.notes) parts.push(b.notes);
      if (b.subtasks && b.subtasks.length) parts.push(b.subtasks.map((s) => (s.done ? '☑ ' : '☐ ') + s.t).join('\n'));
      if (b.meta && b.meta.rescheduled) parts.push(`${t('rescheduled')} ← ${b.meta.from}`);
      evs.push({ date: d, start: b.start, end: b.end, id: b.id, title: blockTitle(b) + (detail ? ` — ${detail}` : ''), description: parts.join('\n\n'), url: b.link || '', category: t('type_' + b.type), alarmMin: opts.alarm, alarmText: blockTitle(b) });
    });
    if (opts.prayers) prayersFor(d).forEach((p) => {
      evs.push({ date: d, start: p.time, end: fromMin(Math.min(1439, toMin(p.time) + 15)), id: 'prayer-' + p.id, title: '🕌 ' + t(p.key), description: `${t(p.key)} ${p.time} · Stockholm`, transparent: true, category: t('prayers'), alarmMin: opts.prayerAlarm, alarmText: `${t(p.key)} ${p.time}` });
    });
  }
  return evs;
}
function icsRange(mode, value) {
  if (mode === 'month') { const [y, m] = value.split('-').map(Number); return { from: `${value}-01`, to: mmTodayStr(new Date(y, m, 0)), name: `mamba-${value}.ics` }; }
  const from = weekStart(value); return { from, to: mmAddDays(from, 6), name: `mamba-week-${from}.ics` };
}
function openIcsSheet() {
  const mk = MM.date.slice(0, 7);
  openSheet(t('icsExport'), `<div class="stack">
    <div class="seg" id="ics-mode"><button data-m="month" class="active">${esc(t('icsMonth'))}</button><button data-m="week">${esc(t('icsWeek'))}</button></div>
    <label class="field" id="ics-month-f">${esc(t('icsMonth'))}<input type="month" id="ics-month" value="${mk}"></label>
    <label class="field hidden" id="ics-week-f">${esc(t('icsWeek'))}<input type="date" id="ics-week" value="${weekStart(MM.date)}"></label>
    <label class="check-row"><input type="checkbox" id="ics-focus"> ${esc(t('icsFocusOnly'))}</label>
    <label class="field">${esc(t('icsAlert'))}<select id="ics-alarm">${[0, 5, 10, 15].map((n) => `<option value="${n}" ${n === 5 ? 'selected' : ''}>${n ? n + ' ' + esc(t('minBefore')) : esc(t('atStart'))}</option>`).join('')}<option value="-1">${esc(t('noAlert'))}</option></select></label>
    <label class="check-row"><input type="checkbox" id="ics-pray" checked> ${esc(t('icsIncludePrayers'))}</label>
    <label class="field" id="ics-palarm-f">${esc(t('icsPrayerAlert'))}<select id="ics-palarm">${[0, 5, 10, 15].map((n) => `<option value="${n}">${n ? n + ' ' + esc(t('minBefore')) : esc(t('atTime'))}</option>`).join('')}<option value="-1">${esc(t('noAlert'))}</option></select></label>
    <p class="muted small">${esc(t('icsHint'))}</p>
    <button class="btn primary block" id="ics-go">${esc(t('icsGenerate'))}</button></div>`, (root) => {
    let mode = 'month';
    $('#ics-pray', root).onchange = (e) => { $('#ics-palarm-f', root).classList.toggle('hidden', !e.target.checked); };
    $$('#ics-mode button', root).forEach((b) => { b.onclick = () => {
      mode = b.dataset.m; $$('#ics-mode button', root).forEach((x) => x.classList.toggle('active', x === b));
      $('#ics-month-f', root).classList.toggle('hidden', mode !== 'month'); $('#ics-week-f', root).classList.toggle('hidden', mode !== 'week');
    }; });
    $('#ics-go', root).onclick = async () => {
      const r = icsRange(mode, mode === 'month' ? ($('#ics-month', root).value || mk) : ($('#ics-week', root).value || MM.date));
      const ics = mmBuildIcs(collectIcsEvents(r.from, r.to, { focusOnly: $('#ics-focus', root).checked, prayers: $('#ics-pray', root).checked, alarm: Number($('#ics-alarm', root).value), prayerAlarm: Number($('#ics-palarm', root).value) }), { calName: 'Mamba Mentality' });
      window.__lastIcs = ics;
      try {
        const file = new File([ics], r.name, { type: 'text/calendar' });
        if (!/Electron/.test(navigator.userAgent) && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: r.name }); toast(t('icsDone')); return; }
      } catch (e) { /* fall back to download */ }
      mmDownload(r.name, ics, 'text/calendar;charset=utf-8');
      toast(t('icsDone'));
    };
  });
}
