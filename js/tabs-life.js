/* Mamba Mentality v2 — Money, Goals, More, shell */
function monthCfg(mk) {
  const m = MM.state.money;
  if (m.months[mk]) return { ...m.months[mk] };
  const prev = Object.keys(m.months).filter((k) => k < mk).sort().pop();
  return prev ? { ...m.months[prev] } : { income: m.income, fixed: m.fixed, life: m.life };
}
function monthSpent(mk) { return MM.state.money.spends.filter((s) => (s.date || '').startsWith(mk)).reduce((a, s) => a + Number(s.amount || 0), 0); }
function monthHistory() {
  const m = MM.state.money; const cur = mmMonthKey();
  const keys = new Set([cur, ...Object.keys(m.months), ...m.spends.map((s) => (s.date || '').slice(0, 7)).filter(Boolean)]);
  let carry = 0;
  return [...keys].filter((k) => k <= cur).sort().map((k) => {
    const cfg = monthCfg(k); const spent = monthSpent(k); const left = cfg.life + (m.rollover ? carry : 0) - spent;
    const row = { k, cfg, spent, left, carryIn: carry };
    carry = m.rollover ? left : 0; row.carryOut = carry;
    return row;
  });
}
function catLabel(c) { return t('cat' + c[0].toUpperCase() + c.slice(1)); }
function renderMoney(root) {
  const m = MM.state.money; const mk = MM.moneyMonth || mmMonthKey(); MM.moneyMonth = mk;
  const cfg = monthCfg(mk); const hist = monthHistory(); const row = hist.find((r) => r.k === mk);
  const carryIn = m.rollover && row ? row.carryIn : 0;
  const spent = monthSpent(mk); const avail = cfg.life + carryIn; const remaining = avail - spent;
  const isCur = mk === mmMonthKey(); const [yy, mo] = mk.split('-').map(Number); const dim = new Date(yy, mo, 0).getDate();
  const daysLeft = isCur ? Math.max(1, dim - new Date().getDate() + 1) : dim;
  const pct = Math.min(100, (spent / Math.max(1, avail)) * 100); const barCls = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : '';
  const se = esc(t('se'));
  let h = `<div class="card"><div class="row between"><button class="nav-arrow" id="mo-prev">‹</button><h2 style="margin:0">${esc(monthNames()[mo - 1])} ${yy}</h2><button class="nav-arrow" id="mo-next">›</button></div>
    <div class="stat-grid" style="margin-top:12px">
      <div class="stat"><div class="label">${esc(t('income'))}</div><div class="value">${cfg.income} <small>${se}</small></div></div>
      <div class="stat"><div class="label">${esc(t('fixed'))}</div><div class="value">${cfg.fixed} <small>${se}</small></div></div>
      <div class="stat"><div class="label">${esc(t('lifeBudget'))}${carryIn ? ` <small>(${carryIn > 0 ? '+' : ''}${Math.round(carryIn)})</small>` : ''}</div><div class="value gold">${Math.round(avail)} <small>${se}</small></div></div>
      <div class="stat"><div class="label">${esc(t('remaining'))}</div><div class="value ${remaining < 0 ? 'red' : 'green'}">${Math.round(remaining)} <small>${se}</small></div></div></div>
    <div style="margin-top:14px"><div class="row between"><span class="muted">${esc(t('monthlyBar'))}</span><span>${Math.round(pct)}%</span></div>
      <div class="progress life ${barCls}" style="margin-top:6px"><span style="width:${pct}%"></span></div></div>
    <div class="stat" style="margin-top:12px"><div class="label">${esc(t('safeDaily'))}</div><div class="value gold">${Math.max(0, Math.floor(remaining / daysLeft))} ${se}</div></div>
    ${cfg.income - cfg.fixed - cfg.life ? `<p class="muted small">${esc(t('unallocated'))}: ${cfg.income - cfg.fixed - cfg.life} ${se}</p>` : ''}</div>`;
  h += `<div class="card"><h3>${esc(t('monthSettings'))} · ${mk}</h3><div class="grid3">
    <label class="field">${esc(t('income'))}<input type="number" id="ms-inc" value="${cfg.income}"></label>
    <label class="field">${esc(t('fixed'))}<input type="number" id="ms-fix" value="${cfg.fixed}"></label>
    <label class="field">${esc(t('lifeBudget'))}<input type="number" id="ms-life" value="${cfg.life}"></label></div>
    <label class="check-row"><input type="checkbox" id="ms-roll" ${m.rollover ? 'checked' : ''}> ${esc(t('rollover'))}</label>
    <button class="btn" id="ms-save">${esc(t('save'))}</button></div>`;
  h += `<div class="card"><h3>${esc(t('logSpend'))}</h3><div class="stack">
    <div class="grid2"><label class="field">${esc(t('amount'))}<input type="number" id="spend-amt" min="1" inputmode="decimal"></label>
    <label class="field">${esc(t('category'))}<select id="spend-cat">${['food', 'hygiene', 'fun', 'other'].map((c) => `<option value="${c}">${esc(catLabel(c))}</option>`).join('')}</select></label></div>
    <label class="field">${esc(t('note'))}<input id="spend-note"></label>
    <button class="btn primary" id="spend-add">${esc(t('logSpend'))}</button></div></div>`;
  const ms = m.spends.filter((s) => (s.date || '').startsWith(mk)).slice().reverse();
  h += `<div class="card"><h3>${esc(t('spent'))} · ${mk}</h3>${ms.length ? ms.map((s) => `<div class="list-item"><div><b>${s.amount} ${se}</b> · ${esc(catLabel(s.category))}<div class="muted">${esc(s.date)}${s.note ? ' · ' + esc(s.note) : ''}</div></div><button class="btn sm danger" data-del-spend="${s.id}">✕</button></div>`).join('') : `<p class="muted">${esc(t('empty'))}</p>`}</div>`;
  h += `<div class="card"><h3>${esc(t('history'))}</h3><table class="hist"><thead><tr><th></th><th>${esc(t('lifeBudget'))}</th><th>${esc(t('spent'))}</th><th>${esc(t('left'))}</th></tr></thead><tbody>
    ${hist.slice().reverse().map((r) => `<tr class="${r.k === mk ? 'sel' : ''}" data-hist="${r.k}"><td>${r.k}</td><td>${r.cfg.life}${m.rollover && r.carryIn ? `<small> ${r.carryIn > 0 ? '+' : ''}${Math.round(r.carryIn)}</small>` : ''}</td><td>${Math.round(r.spent)}</td><td class="${r.left < 0 ? 'red' : 'green'}">${Math.round(r.left)}</td></tr>`).join('')}</tbody></table>
    ${m.rollover ? `<p class="muted small">${esc(t('withRollover'))}</p>` : ''}</div>`;
  h += `<div class="card"><h3>${esc(t('examGoal'))}</h3><p class="muted">${esc(t('examGoalHint'))}</p>
    <div class="row"><input type="number" id="exam-goal" value="${m.examGoal == null ? '' : m.examGoal}" placeholder="—" style="flex:1"><button class="btn" id="save-exam">${esc(t('save'))}</button></div></div>`;
  h += `<div class="card"><h3>${esc(t('plannedPurchases'))}</h3><div class="grid2"><input id="plan-name" placeholder="${esc(t('note'))}"><input type="number" id="plan-amt" placeholder="${esc(t('amount'))}"></div>
    <button class="btn block" id="plan-add" style="margin-top:8px">${esc(t('addPurchase'))}</button>
    ${m.planned.map((p) => `<div class="list-item"><div>${esc(p.name)}<div class="muted">${p.amount} ${se}</div></div><button class="btn sm danger" data-del-plan="${p.id}">✕</button></div>`).join('')}</div>`;
  root.innerHTML = h;
  const shift = (n) => { MM.moneyMonth = mmMonthKey(new Date(yy, mo - 1 + n, 1)); render(); };
  $('#mo-prev', root).onclick = () => shift(-1); $('#mo-next', root).onclick = () => shift(1);
  $$('[data-hist]', root).forEach((r) => { r.onclick = () => { MM.moneyMonth = r.dataset.hist; render(); }; });
  $('#ms-save', root).onclick = () => {
    m.months[mk] = { income: Number($('#ms-inc', root).value) || 0, fixed: Number($('#ms-fix', root).value) || 0, life: Number($('#ms-life', root).value) || 0 };
    m.rollover = $('#ms-roll', root).checked; persist(); toast(t('saved')); render();
  };
  $('#spend-add', root).onclick = () => {
    const amount = Number($('#spend-amt', root).value); if (!amount || amount <= 0) return;
    m.spends.push({ id: mmUid('s'), date: isCur ? mmTodayStr() : `${mk}-01`, amount, category: $('#spend-cat', root).value, note: $('#spend-note', root).value.trim() }); persist(); render();
  };
  $$('[data-del-spend]', root).forEach((b) => { b.onclick = () => { m.spends = m.spends.filter((s) => s.id !== b.dataset.delSpend); persist(); render(); }; });
  $('#save-exam', root).onclick = () => { const v = $('#exam-goal', root).value; m.examGoal = v === '' ? null : Number(v); persist(); toast(t('saved')); };
  $('#plan-add', root).onclick = () => { const name = $('#plan-name', root).value.trim(); if (!name) return; m.planned.push({ id: mmUid('p'), name, amount: Number($('#plan-amt', root).value) || 0 }); persist(); render(); };
  $$('[data-del-plan]', root).forEach((b) => { b.onclick = () => { m.planned = m.planned.filter((p) => p.id !== b.dataset.delPlan); persist(); render(); }; });
}

/* Goals */
function weekApps() {
  const k = mmIsoWeek(new Date());
  if (!MM.state.jobApps[k]) MM.state.jobApps[k] = { field: 0, retail: 0 };
  return MM.state.jobApps[k];
}
function goalMetaLine(id) {
  const g = MM.state.goalsMeta[id]; if (!g) return '';
  return `${g.target ? `<div class="muted small">🎯 ${esc(g.target)}</div>` : ''}${g.notes ? `<div class="muted small">📝 ${esc(g.notes)}</div>` : ''}${g.link ? `<a class="link small" href="${esc(g.link)}" target="_blank" rel="noopener">↗ ${esc(g.link)}</a>` : ''}`;
}
function appBar(n, min, max) {
  return `<div class="progress app-bar ${n >= min ? 'hit' : ''}"><span style="width:${Math.min(100, (n / max) * 100)}%"></span><i class="min-mark" style="inset-inline-start:${(min / max) * 100}%"></i></div>`;
}
function renderGoals(root) {
  const s = MM.state.settings; const gotJob = !!s.gotJob; const wa = weekApps();
  const st = swedishStats(); const sw = MM.state.solidworks;
  const rc = MM.state.courses.filter(mmIsScheduled);
  const totT = rc.reduce((a, c) => a + c.topics.length, 0); const leftT = rc.reduce((a, c) => a + courseLeft(c), 0);
  const proj = mmAddDays(mmTodayStr(), Math.ceil((leftT / (PACE_BY_MODE[s.jobMode] || 4)) * 7));
  const swDone = sw.items.filter((i) => i.done).length;
  const card = (id, num, title, inner, locked) => `<div class="card goal ${num === 1 ? 'goal-top' : ''} ${locked ? 'locked-card' : ''}">
    <div class="row between"><div class="goal-title"><span class="goal-num">${num}</span>${esc(title)}</div><button class="btn sm ghost" data-goal-edit="${id}" aria-label="${esc(t('editGoal'))}">✎</button></div>${inner}${goalMetaLine(id)}</div>`;
  const appRow = (k, label, min, max) => `<div class="app-row"><div class="app-label"><b>${esc(label)}</b><span class="muted small">${esc(t('target'))} ${min}–${max}</span></div>
      <div class="app-count">${wa[k]}</div><button class="btn sm ghost" data-app="${k}" data-d="-1" aria-label="-1">−</button><button class="btn primary plus" data-app="${k}" data-d="1">+1</button></div>${appBar(wa[k], min, max)}`;
  let h = `<h2 class="page-title">${esc(t('goalsTitle'))}</h2>`;
  h += card('job', 1, t('goalJob'), `<div class="muted small">${esc(t('thisWeek'))} · ${mmIsoWeek(new Date())}</div>
    ${appRow('field', t('inField'), 15, 20)}${appRow('retail', t('retail'), 20, 30)}
    <label class="check-row" style="margin-top:8px"><input type="checkbox" id="got-job" ${gotJob ? 'checked' : ''}> ${esc(t('gotJob'))}</label>`);
  h += card('revision', 2, t('goalRevision'), `<div class="progress" style="margin:8px 0"><span style="width:${totT ? ((totT - leftT) / totT) * 100 : 0}%"></span></div>
    <div class="muted">${totT - leftT}/${totT} · ${esc(t('projected'))}: <b>${proj}</b></div>
    ${s.jobMode === 'full-time' ? `<div class="muted small">⏳ ${esc(t('revisionPaused'))}</div>` : ''}`);
  h += card('cswp', 3, t('goalCSWP'), `<div class="progress" style="margin:8px 0"><span style="width:${(swDone / Math.max(1, sw.items.length)) * 100}%"></span></div>
    <div class="muted">${swDone}/${sw.items.length} ${esc(t('items'))} · ${sw.logs.length} ${esc(t('practiceLogs'))}</div>`);
  h += card('swedish', 4, t('goalSwedish'), `<div class="progress" style="margin:8px 0"><span style="width:${(st.done / Math.max(1, st.total)) * 100}%"></span></div>
    <div class="muted">${st.done}/${st.total} · ${st.pace} ${esc(t('swedishPerWeek'))} · ${esc(t(st.track))}</div>`);
  h += card('print3d', 5, t('goal3D'), `<div class="muted">${gotJob ? '🔓' : '🔒 ' + esc(t('lockedUntilJob'))}</div>`, !gotJob);
  const mode = s.jobMode || 'none';
  h += `<div class="card"><h3>${esc(t('jobMode'))}</h3><div class="seg" id="job-mode">
    ${[['none', 'jobNone'], ['part-time', 'jobPart'], ['full-time', 'jobFull']].map(([v, k]) => `<button data-mode="${v}" class="${mode === v ? 'active' : ''}">${esc(t(k))}</button>`).join('')}</div>
    <p class="muted" style="margin-top:10px">${mode === 'full-time' ? esc(t('jobFullHint')) : mode === 'part-time' ? esc(t('jobPartHint')) : ''}</p></div>`;
  root.innerHTML = h;
  $$('[data-app]', root).forEach((b) => { b.onclick = () => { const k = b.dataset.app; wa[k] = Math.max(0, wa[k] + Number(b.dataset.d)); persist(); render(); }; });
  $('#got-job', root).onchange = (e) => { s.gotJob = e.target.checked; persist(); render(); };
  $$('#job-mode button', root).forEach((b) => { b.onclick = () => { s.jobMode = b.dataset.mode; persist(); render(); }; });
  $$('[data-goal-edit]', root).forEach((b) => { b.onclick = () => openGoalSheet(b.dataset.goalEdit); });
}
function openGoalSheet(id) {
  const g = { notes: '', target: '', link: '', ...(MM.state.goalsMeta[id] || {}) };
  const names = { job: 'goalJob', revision: 'goalRevision', cswp: 'goalCSWP', swedish: 'goalSwedish', print3d: 'goal3D' };
  openSheet(`${t('editGoal')} · ${t(names[id])}`, `<div class="stack">
    <label class="field">${esc(t('targetDate'))}<input type="date" id="g-target" value="${esc(g.target)}"></label>
    <label class="field">${esc(t('notes'))}<textarea id="g-notes">${esc(g.notes)}</textarea></label>
    <label class="field">${esc(t('link'))}<input id="g-link" value="${esc(g.link)}" placeholder="https://"></label>
    <button class="btn primary block" id="g-save">${esc(t('save'))}</button></div>`, (root, close) => {
    $('#g-save', root).onclick = () => { MM.state.goalsMeta[id] = { target: $('#g-target', root).value, notes: $('#g-notes', root).value, link: $('#g-link', root).value.trim() }; persist(); close(); render(); };
  });
}

/* More: Sunday replan, weekly template, settings, backup */
function k2label(k) { return k === 'rest' ? t('templateRest') : longDayName(Number(k)); }
function renderMore(root) {
  const s = MM.state.settings; const wk = mmIsoWeek(new Date());
  if (MM.state.sunday.weekKey !== wk) { MM.state.sunday.weekKey = wk; Object.keys(MM.state.sunday.checklist).forEach((k) => { MM.state.sunday.checklist[k] = false; }); persist(); }
  const cl = MM.state.sunday.checklist;
  const tk = MM.tplKey || '1'; MM.tplKey = tk;
  const tpl = templateFor(tk); const custom = !!(MM.state.template[tk] && MM.state.template[tk].length);
  let h = `<div class="card" id="plan-card"><h2>🗓️ ${esc(t('planCard'))}</h2><div class="stack">
    <label class="field">${esc(t('planStartLabel'))}<input type="date" id="set-planstart" value="${esc(planStartDate())}"></label>
    <p class="muted small">${esc(t('planStartHint'))}</p>
    <div class="row"><button class="btn primary" id="plan-add">＋ ${esc(t('addBtn'))}</button><button class="btn" id="plan-items">📋 ${esc(t('myItems'))}</button><button class="btn" id="plan-replan">↻ ${esc(t('replanNow'))}</button></div></div></div>`;
  h += `<div class="card"><h2>${esc(t('sundayReplan'))}</h2><div class="stack">
    ${[['reviewGoals', 'checkReviewGoals'], ['backup', 'checkBackup'], ['restDay', 'checkRestDay'], ['courses', 'checkCourses'], ['swedish', 'checkSwedish']].map(([k, l]) => `<label class="check-row"><input type="checkbox" data-cl="${k}" ${cl[k] ? 'checked' : ''}> ${esc(t(l))}</label>`).join('')}
    <label class="field">${esc(t('sundayNotes'))}<textarea id="sun-notes">${esc(MM.state.sunday.notes || '')}</textarea></label>
    <button class="btn" id="sun-save">${esc(t('save'))}</button></div></div>`;
  h += `<div class="card"><h2>${esc(t('weeklyTemplate'))}</h2>
    <div class="tpl-days">${['1', '2', '3', '4', '5', '6', '0', 'rest'].map((k) => `<button class="${k === tk ? 'active' : ''}" data-tpl="${k}">${k === 'rest' ? '💤' : esc(wdNames()[(Number(k) + 6) % 7])}</button>`).join('')}</div>
    <p class="muted small">${esc(k2label(tk))} · ${esc(custom ? t('templateCustom') : t('templateAuto'))}</p>
    ${tpl.map((b, i) => `<div class="list-block"><i class="bar ev-${b.type}"></i>
      <button class="lb-main" data-tpl-edit="${i}"><span class="time">${b.start}–${b.end}</span><b>${esc(blockTitle(b))}</b></button>
      <div class="lb-move"><button class="btn sm ghost" data-tpl-del="${i}" aria-label="${esc(t('delete'))}">✕</button></div></div>`).join('')}
    <div class="row" style="margin-top:8px"><button class="btn primary" id="tpl-add">＋ ${esc(t('addBlock'))}</button>${custom ? `<button class="btn" id="tpl-reset">${esc(t('resetTemplate'))}</button>` : ''}</div></div>`;
  const pr = s.prayer; const todayP = prayersFor(mmTodayStr());
  h += `<div class="card"><h2>🕌 ${esc(t('prayerSettings'))}</h2>
    <div class="prayer-today">${todayP.map((p) => `<div><span class="muted small">${esc(t(p.key))}</span><b>${p.time}</b></div>`).join('')}</div>
    <p class="muted small">Stockholm 59.33°N 18.07°E · ${mmTodayStr()}</p>
    <div class="stack">
    <label class="field">${esc(t('prayerMethod'))}<select id="pr-method">${Object.entries(MM_PRAYER_METHODS).map(([k, v]) => `<option value="${k}" ${pr.method === k ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
    <label class="field">${esc(t('prayerAsrMethod'))}<select id="pr-asr"><option value="standard" ${pr.asr === 'standard' ? 'selected' : ''}>${esc(t('asrStandard'))}</option><option value="hanafi" ${pr.asr === 'hanafi' ? 'selected' : ''}>${esc(t('asrHanafi'))}</option></select></label>
    <label class="field">${esc(t('prayerHighLat'))}<select id="pr-hl">${['AngleBased', 'OneSeventh', 'NightMiddle', 'None'].map((k) => `<option value="${k}" ${pr.highLat === k ? 'selected' : ''}>${esc(t('hl_' + k))}</option>`).join('')}</select></label>
    <div class="field-label">${esc(t('prayerOffsets'))}</div>
    <div class="offsets">${MM_PRAYER_IDS.map((id) => `<label class="field">${esc(t('prayer' + id[0].toUpperCase() + id.slice(1)))}<input type="number" step="1" min="-30" max="30" data-off="${id}" value="${pr.offsets[id] || 0}"></label>`).join('')}</div>
    </div></div>`;
  h += `<div class="card"><h2>${esc(t('settings'))}</h2><div class="stack">
    <label class="field">${esc(t('language'))}<select id="set-lang"><option value="en" ${s.lang === 'en' ? 'selected' : ''}>English</option><option value="ar" ${s.lang === 'ar' ? 'selected' : ''}>العربية</option><option value="sv" ${s.lang === 'sv' ? 'selected' : ''}>Svenska</option></select></label>
    <label class="field">${esc(t('restDaySetting'))}<select id="set-rest"><option value="saturday" ${s.restDay === 'saturday' ? 'selected' : ''}>${esc(t('saturday'))}</option><option value="sunday" ${s.restDay === 'sunday' ? 'selected' : ''}>${esc(t('sunday'))}</option></select></label>
    <label class="field">${esc(t('moveRestTo'))}<select id="set-move"><option value="">${esc(t('none'))}</option>${[1, 2, 3, 4, 5].map((d) => `<option value="${d}" ${s.restMovedTo === d ? 'selected' : ''}>${esc(longDayName(d))}</option>`).join('')}</select></label>
    <label class="field">${esc(t('solidworksStart'))}<input type="date" id="set-sw" value="${esc(s.solidWorksStart)}"></label>
    <button class="btn" id="ics-btn">📆 ${esc(t('icsExport'))}</button>
    <button class="btn primary" id="export-btn">${esc(t('exportData'))}</button>
    <label class="btn ghost block" style="cursor:pointer">${esc(t('importData'))}<input type="file" id="import-file" accept="application/json,.json" hidden></label>
    <button class="btn danger" id="reset-day">${esc(t('resetDay'))}</button></div></div>
    <div class="card"><h3>${esc(t('about'))}</h3><p class="muted">v${MM_APP_VERSION} · offline PWA · localStorage</p></div>`;
  root.innerHTML = h;
  $('#pr-method', root).onchange = (e) => { pr.method = e.target.value; persist(); render(); };
  $('#pr-asr', root).onchange = (e) => { pr.asr = e.target.value; persist(); render(); };
  $('#pr-hl', root).onchange = (e) => { pr.highLat = e.target.value; persist(); render(); };
  $$('[data-off]', root).forEach((i) => { i.onchange = () => { pr.offsets[i.dataset.off] = Math.max(-60, Math.min(60, Number(i.value) || 0)); persist(); render(); }; });
  $$('[data-tpl]', root).forEach((b) => { b.onclick = () => { MM.tplKey = b.dataset.tpl; render(); }; });
  $$('[data-tpl-del]', root).forEach((b) => { b.onclick = () => { if (!custom) MM.state.template[tk] = tpl; MM.state.template[tk].splice(+b.dataset.tplDel, 1); persist(); render(); }; });
  $$('[data-tpl-edit]', root).forEach((b) => { b.onclick = () => openTplBlockSheet(tk, +b.dataset.tplEdit); });
  $('#tpl-add', root).onclick = () => openTplBlockSheet(tk, -1);
  const rs = $('#tpl-reset', root); if (rs) rs.onclick = () => { delete MM.state.template[tk]; persist(); render(); };
  $$('[data-cl]', root).forEach((i) => { i.onchange = () => { cl[i.dataset.cl] = i.checked; persist(); }; });
  $('#sun-save', root).onclick = () => { MM.state.sunday.notes = $('#sun-notes', root).value; persist(); toast(t('saved')); };
  $('#set-lang', root).onchange = (e) => { s.lang = e.target.value; persist(); render(); };
  $('#set-rest', root).onchange = (e) => { s.restDay = e.target.value; persist(); };
  $('#set-move', root).onchange = (e) => { s.restMovedTo = e.target.value === '' ? null : Number(e.target.value); persist(); };
  $('#set-sw', root).onchange = (e) => { s.solidWorksStart = e.target.value || MM_SEED.solidWorksStart; persist(); };
  $('#ics-btn', root).onclick = () => openIcsSheet();
  $('#set-planstart', root).onchange = (e) => { const v = e.target.value; if (!v) return; commitPlanChange(() => { MM.state.settings.planStart = v; }); };
  $('#plan-add', root).onclick = () => openAddChooser(MM.date);
  $('#plan-items', root).onclick = () => openItemsSheet();
  $('#plan-replan', root).onclick = () => { restamp(); persist(); toast(t('replanned')); render(); };
  $('#export-btn', root).onclick = () => { mmExport(MM.state); cl.backup = true; persist(); };
  $('#import-file', root).onchange = async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { MM.state = await mmImport(f); persist(); toast(t('importOk')); render(); } catch (err) { toast(t('importFail')); }
  };
  $('#reset-day', root).onclick = () => { delete MM.state.dayStatus[mmTodayStr()]; delete MM.state.days[mmTodayStr()]; persist(); toast(t('resetDay')); };
}
function openTplBlockSheet(key, idx) {
  const list = templateFor(key);
  const b = idx >= 0 ? clone(list[idx]) : { id: mmUid('b'), type: 'other', start: '10:00', end: '11:00' };
  openSheet(`${t('weeklyTemplate')} · ${k2label(key)}`, `<div class="stack">
    <label class="field">${esc(t('title'))}<input id="tb-title" value="${esc(idx >= 0 ? blockTitle(b) : '')}"></label>
    <div class="grid2"><label class="field">${esc(t('start'))}<input type="time" id="tb-start" value="${b.start}" step="300"></label>
    <label class="field">${esc(t('end'))}<input type="time" id="tb-end" value="${b.end}" step="300"></label></div>
    <label class="field">${esc(t('type'))}<select id="tb-type">${TYPES.map((x) => `<option value="${x}" ${b.type === x ? 'selected' : ''}>${esc(t('type_' + x))}</option>`).join('')}</select></label>
    <label class="field">${esc(t('notes'))}<textarea id="tb-notes">${esc(b.notes || '')}</textarea></label>
    <button class="btn primary block" id="tb-save">${esc(t('save'))}</button></div>`, (root, close) => {
    $('#tb-save', root).onclick = () => {
      const title = $('#tb-title', root).value.trim(); b.type = $('#tb-type', root).value;
      if (title && title !== blockTitle({ type: b.type, labelKey: b.labelKey })) b.title = title; else delete b.title;
      b.start = $('#tb-start', root).value; b.end = $('#tb-end', root).value; b.notes = $('#tb-notes', root).value;
      if (endMin(b.end) <= toMin(b.start)) { toast(`${t('end')} > ${t('start')}`); return; }
      const l = MM.state.template[key] && MM.state.template[key].length ? MM.state.template[key] : (MM.state.template[key] = list);
      if (idx >= 0) l[idx] = stripBlock(b); else l.push(stripBlock(b));
      l.sort((x, y) => toMin(x.start) - toMin(y.start)); persist(); close(); render();
    };
  });
}

/* shell */
function render() {
  applyLang();
  $('#brand-name').textContent = t('appName');
  $('#header-meta').innerHTML = `<strong>${mmNowHM()}</strong><br>${mmTodayStr()}`;
  const tabMap = { today: 'tabToday', free: 'tabFree', swedish: 'tabSwedish', study: 'tabStudy', money: 'tabMoney', goals: 'tabGoals', notes: 'tabNotes', more: 'tabMore' };
  Object.keys(tabMap).forEach((k) => { const btn = $(`nav.tabs button[data-tab="${k}"]`); if (btn) { $('.lbl', btn).textContent = t(tabMap[k]); btn.classList.toggle('active', MM.tab === k); } });
  $$('main .panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + MM.tab));
  const root = $('#panel-' + MM.tab); if (!root) return;
  ({ today: renderToday, free: renderFree, swedish: renderSwedish, study: renderStudy, money: renderMoney, goals: renderGoals, notes: renderNotes, more: renderMore }[MM.tab] || renderToday)(root);
}
function init() {
  MM.state = mmLoad(); persist();
  window.MM = MM; MM.date = mmTodayStr(); MM.view = MM.state.settings.calView || 'day';
  const p = new URLSearchParams(location.search);
  if (p.get('tab')) MM.tab = p.get('tab');
  if (p.get('view')) MM.view = p.get('view');
  if (p.get('date')) MM.date = p.get('date');
  if (p.get('lang')) MM.state.settings.lang = p.get('lang');
  if (p.get('dismiss')) MM.state.settings.morningRecapDismissedDate = mmTodayStr();
  $$('nav.tabs button').forEach((btn) => { btn.onclick = () => { MM.tab = btn.dataset.tab; render(); window.scrollTo(0, 0); }; });
  render();
  if (p.get('open')) openBlockSheet(MM.date, p.get('open'));
  setInterval(() => {
    if (MM.tab === 'today' && !$('.modal-backdrop')) { const sc = $('#cal-scroll'); const top = sc ? sc.scrollTop : 0; render(); const sc2 = $('#cal-scroll'); if (sc2) sc2.scrollTop = top; }
    else $('#header-meta').innerHTML = `<strong>${mmNowHM()}</strong><br>${mmTodayStr()}`;
  }, 60000);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const hadController = !!navigator.serviceWorker.controller; let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded && !$('.modal-backdrop')) { reloaded = true; location.reload(); } });
    navigator.serviceWorker.register('./sw.js').then((r) => r.update && r.update()).catch((e) => console.warn('SW', e));
  }
}
window.addEventListener('error', (e) => { document.documentElement.setAttribute('data-js-error', String(e.message)); });
document.addEventListener('DOMContentLoaded', init);
