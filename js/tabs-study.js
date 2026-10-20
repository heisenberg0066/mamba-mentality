/* Mamba Mentality v2 — Free time, Swedish, Study tabs */
function suggestFreeTasks(mins, place) {
  const out = [];
  const swActive = mmTodayStr() >= (MM.state.settings.solidWorksStart || MM_SEED.solidWorksStart);
  const next = nextSwedishChapter();
  if (place === 'commute' && mins >= 10) out.push({ key: 'suggestionFamily', mins: 15 });
  if (next && mins >= 15) out.push({ key: 'suggestionSwedish', mins: Math.min(mins, next.mins), detail: `${next.book} ch.${next.num}` });
  if (mins >= 15 && mins < 45) out.push({ key: 'suggestionRetail', mins, detail: `${Math.max(1, Math.floor(mins / 10))} apps` });
  if (swActive && mins >= 20 && ['library', 'home', 'waiting'].includes(place)) { const it = nextSwItem(); out.push({ key: 'suggestionSW', mins: Math.min(mins, 40), detail: it ? it.title : '' }); }
  const ac = activeCourse();
  if (ac && mins >= 20) { const tp = ac.topics.find((x) => !x.done); out.push({ key: 'suggestionCourse', mins: Math.min(mins, 45), detail: `${ac.code}${tp ? ' — ' + tp.name : ''}` }); }
  if (mins >= 10 && mins <= 30) out.push({ key: 'suggestionChill', mins });
  if (!out.length) out.push({ key: 'freeNoPending', mins });
  return out.slice(0, 4);
}
function renderFree(root) {
  root.innerHTML = `<div class="card"><h2>${esc(t('freeTitle'))}</h2><div class="stack">
    <label class="field">${esc(t('freeMinutes'))}<input type="number" id="free-mins" min="5" max="240" step="5" value="30"></label>
    <label class="field">${esc(t('freePlace'))}<select id="free-place">
      ${['train', 'waiting', 'library', 'home', 'commute'].map((p) => `<option value="${p}">${esc(t('place' + p[0].toUpperCase() + p.slice(1)))}</option>`).join('')}</select></label>
    <button class="btn primary block" id="free-go">${esc(t('freeSuggest'))}</button></div></div><div id="free-results"></div>`;
  $('#free-go', root).onclick = () => {
    const list = suggestFreeTasks(Number($('#free-mins', root).value) || 30, $('#free-place', root).value);
    $('#free-results', root).innerHTML = list.map((s) => `<div class="card"><b>${esc(t(s.key))}</b><div class="muted">${s.detail ? esc(s.detail) + ' · ' : ''}~${s.mins} min</div></div>`).join('');
  };
}

function renderSwedish(root) {
  const st = swedishStats();
  let h = `<div class="card"><h2>${esc(t('swedishTitle').replace('38', st.total))}</h2>
    <div class="row between"><span class="muted">${esc(t('swedishDeadline'))}</span><b>${MM_SEED.swedishDeadline}</b></div>
    <div class="progress" style="margin:12px 0"><span style="width:${(st.done / Math.max(1, st.total)) * 100}%"></span></div>
    <div class="stat-grid">
      <div class="stat"><div class="label">${esc(t('swedishDone'))}</div><div class="value gold">${st.done}/${st.total}</div></div>
      <div class="stat"><div class="label">${esc(t('swedishPace'))}</div><div class="value">${st.pace} <small class="muted">${esc(t('swedishPerWeek'))}</small></div></div>
      <div class="stat"><div class="label">${esc(t('chaptersLeft'))}</div><div class="value">${st.left}</div></div>
      <div class="stat"><div class="label">${esc(t('weeksLeft'))}</div><div class="value">${st.weeksLeft}</div></div></div>
    <p class="muted" style="margin-top:10px">${esc(t(st.track))}</p>
    <button class="btn block" id="ch-add">＋ ${esc(t('addChapter'))}</button></div>`;
  [['easy', 'difficultyEasy'], ['moderate', 'difficultyModerate'], ['hard', 'difficultyHard']].forEach(([diff, key]) => {
    const list = chapters().filter((c) => c.difficulty === diff); if (!list.length) return;
    h += `<div class="card"><h3>${esc(t(key))}</h3>${list.map((c) => `
      <div class="chapter row between">
        <button class="chapter-main" data-ch-edit="${esc(c.id)}"><b>${esc(c.book)} · ${c.num}</b><div class="muted">${esc(c.title)}${c.notes ? ' · 📝' : ''}</div>
          <div class="muted small">~${c.mins} min${c.done && c.doneDate ? ' · ✓ ' + esc(c.doneDate) : ''} · ✎</div></button>
        <button class="btn sm ${c.done ? 'success on' : 'primary'}" data-ch-toggle="${esc(c.id)}">${c.done ? '✓' : esc(t('markChapterDone'))}</button></div>`).join('')}</div>`;
  });
  root.innerHTML = h;
  $$('[data-ch-toggle]', root).forEach((b) => { b.onclick = () => { const c = chapters().find((x) => x.id === b.dataset.chToggle); c.done = !c.done; c.doneDate = c.done ? mmTodayStr() : null; persist(); render(); }; });
  $$('[data-ch-edit]', root).forEach((b) => { b.onclick = () => openChapterSheet(b.dataset.chEdit); });
  $('#ch-add', root).onclick = () => openChapterSheet(null);
}
function openChapterSheet(id) {
  const existing = chapters().find((x) => x.id === id);
  const c = existing ? clone(existing) : { id: mmUid('ch'), book: 'Rivstart B1/B2', num: 1, title: '', difficulty: 'moderate', mins: 60, done: false, doneDate: null, notes: '' };
  const diffs = [['easy', 'difficultyEasy'], ['moderate', 'difficultyModerate'], ['hard', 'difficultyHard']];
  openSheet(existing ? t('editChapter') : t('addChapter'), `<div class="stack">
    <div class="grid2"><label class="field">${esc(t('book'))}<input id="c-book" value="${esc(c.book)}"></label>
    <label class="field">${esc(t('number'))}<input type="number" id="c-num" value="${c.num}"></label></div>
    <label class="field">${esc(t('title'))}<input id="c-title" value="${esc(c.title)}"></label>
    <div class="grid2"><label class="field">${esc(t('difficulty'))}<select id="c-diff">${diffs.map(([v, k]) => `<option value="${v}" ${c.difficulty === v ? 'selected' : ''}>${esc(t(k))}</option>`).join('')}</select></label>
    <label class="field">${esc(t('minutes'))}<input type="number" id="c-mins" value="${c.mins}"></label></div>
    <label class="check-row"><input type="checkbox" id="c-done" ${c.done ? 'checked' : ''}> ${esc(t('done'))}</label>
    <label class="field">${esc(t('doneDate'))}<input type="date" id="c-date" value="${esc(c.doneDate || '')}"></label>
    <label class="field">${esc(t('notes'))}<textarea id="c-notes">${esc(c.notes || '')}</textarea></label>
    <button class="btn primary block" id="c-save">${esc(t('save'))}</button>
    ${existing ? `<button class="btn danger block" id="c-del">${esc(t('delete'))}</button>` : ''}</div>`, (root, close) => {
    $('#c-save', root).onclick = () => {
      Object.assign(c, { book: $('#c-book', root).value.trim(), num: Number($('#c-num', root).value) || c.num, title: $('#c-title', root).value.trim(),
        difficulty: $('#c-diff', root).value, mins: Number($('#c-mins', root).value) || c.mins, done: $('#c-done', root).checked,
        doneDate: $('#c-date', root).value || null, notes: $('#c-notes', root).value });
      if (c.done && !c.doneDate) c.doneDate = mmTodayStr();
      if (!c.done) c.doneDate = null;
      if (existing) Object.assign(existing, c); else chapters().push(c);
      persist(); close(); toast(t('saved')); render();
    };
    const d = $('#c-del', root);
    if (d) d.onclick = () => { if (confirm(t('confirmDelete'))) { MM.state.swedishChapters = chapters().filter((x) => x.id !== id); persist(); close(); render(); } };
  });
}

function renderStudy(root) {
  const ac = activeCourse(); const nextTp = ac ? ac.topics.find((x) => !x.done) : null;
  let h = '';
  if (ac) {
    h += `<div class="card recap"><div class="muted small">${esc(t('activeSubject'))}</div>
      <h2 style="margin:4px 0">${esc(ac.code)} — ${esc(ac.title)}</h2>
      <div class="progress" style="margin:8px 0"><span style="width:${coursePct(ac)}%"></span></div>
      <div class="muted">${ac.topics.length - courseLeft(ac)}/${ac.topics.length}${ac.deadline ? ' · ' + esc(t('deadline')) + ' ' + ac.deadline : ''}${coursePace(ac) ? ' · ' + coursePace(ac) + ' ' + esc(t('pacePerWeek')) : ''}</div>
      ${nextTp ? `<div class="row between" style="margin-top:10px"><div style="flex:1;min-width:0"><div class="muted small">${esc(t('nextTopic'))}</div><b>${esc(nextTp.name)}</b></div>
        <button class="btn primary" id="tp-done" data-tp="${esc(nextTp.id)}">✓ ${esc(t('topicDone'))}</button></div>` : ''}</div>`;
  } else h += `<div class="card"><b>${esc(t('allCoursesDone'))}</b></div>`;
  h += `<div class="card"><div class="row"><button class="btn primary" id="add-course-btn">＋ ${esc(t('addCourse'))}</button><button class="btn" id="auto-dl">${esc(t('autoDeadlines'))}</button></div></div>`;
  const prioOpts = (c) => COURSE_PRIOS.map(([v, k]) => `<option value="${v}" ${c.priority === v ? 'selected' : ''}>${esc(t(k))}</option>`).join('');
  const courseRow = (c) => `<div class="course-row ${ac && ac.code === c.code ? 'active' : ''}">
      <button class="course course-btn" data-course="${esc(c.code)}">
        <div class="row between"><div><b>${esc(c.code)}</b> ${ac && ac.code === c.code ? '⭐' : ''}${c.swLink ? ` <span class="badge">🔗 ${esc(t('swPrepLink'))}</span>` : ''}<div class="muted">${esc(c.title)}</div></div><span class="badge">${coursePct(c)}%</span></div>
        <div class="progress thin" style="margin-top:8px"><span style="width:${coursePct(c)}%"></span></div>
        <div class="muted small" style="margin-top:4px">${c.topics.length - courseLeft(c)}/${c.topics.length} · ${c.hours || 0} h${c.deadline && mmIsScheduled(c) ? ' · ⏱ ' + c.deadline : ''}${coursePace(c) && courseLeft(c) && mmIsScheduled(c) ? ' · ' + coursePace(c) + ' ' + esc(t('pacePerWeek')) : ''}</div></button>
      <select class="prio-sel" data-prio="${esc(c.code)}" aria-label="${esc(t('coursePriority'))} ${esc(c.code)}">${prioOpts(c)}</select></div>`;
  h += `<p class="muted small" style="margin:0 4px 10px">${esc(t('priorityHint'))} ${esc(t('interleaveNote'))}</p>`;
  MM_GROUPS.forEach((g) => {
    const gl = MM.state.courses.filter((c) => mmCourseGroup(c) === g); if (!gl.length) return;
    h += `<h2 class="page-title group-title">${esc(t('group_' + g))}</h2>`;
    COURSE_PRIOS.forEach(([p, key]) => {
      const list = gl.filter((c) => c.priority === p); if (!list.length) return;
      const rows = list.map(courseRow).join('');
      h += p === 'ignore' || p === 'later'
        ? `<div class="card"><details><summary><b>${esc(t(key))}</b> <span class="muted">· ${list.length}</span></summary>${rows}</details></div>`
        : `<div class="card"><h3>${esc(t(key))}</h3>${rows}</div>`;
    });
  });
  const sw = MM.state.solidworks; const swStart = MM.state.settings.solidWorksStart || MM_SEED.solidWorksStart;
  const swCourses = MM.state.courses.filter((c) => c.swLink);
  h += `<div class="card" id="sw-card"><h2>${esc(t('solidworksTitle'))}</h2>
    <p class="muted">${esc(t('solidworksStart'))}: <b>${swStart}</b>${mmTodayStr() >= swStart ? '' : ' · ⏳'}</p>
    ${swCourses.map((c) => `<button class="btn sm" data-course="${esc(c.code)}">🔗 ${esc(t('relatedCourse'))}: ${esc(c.code)} — ${esc(c.title)} · ${coursePct(c)}%</button>`).join('')}
    <h3>${esc(t('swItems'))} · ${sw.items.filter((i) => i.done).length}/${sw.items.length}</h3>
    ${sw.items.map((it) => `<div class="list-item"><button class="chapter-main" data-sw-edit="${esc(it.id)}"><b>${esc(it.title)}</b>${it.notes ? `<div class="muted small">${esc(it.notes)}</div>` : ''}</button>
      <button class="btn sm ${it.done ? 'success on' : ''}" data-sw-toggle="${esc(it.id)}">${it.done ? '✓' : '○'}</button></div>`).join('')}
    <button class="btn block" id="sw-add" style="margin-top:8px">＋ ${esc(t('addItem'))}</button>
    <h3 style="margin-top:16px">${esc(t('studyLog'))}</h3><div class="stack">
      <label class="field">${esc(t('practiceNote'))}<input id="sw-note" placeholder="part / assembly"></label>
      <label class="field">${esc(t('productIdea'))}<input id="sw-idea"></label>
      <button class="btn primary" id="sw-log">${esc(t('addLog'))}</button></div>
    <div style="margin-top:12px">${sw.logs.length ? sw.logs.slice().reverse().slice(0, 20).map((l) => `<div class="list-item"><div><b>${esc(l.date)}</b><div class="muted">${esc(l.note || '')}${l.idea ? ' · 💡 ' + esc(l.idea) : ''}</div></div></div>`).join('') : `<p class="muted">${esc(t('empty'))}</p>`}</div></div>`;
  root.innerHTML = h;
  const td = $('#tp-done', root); if (td) td.onclick = () => { completeTopic(ac, td.dataset.tp); render(); };
  $$('[data-course]', root).forEach((b) => { b.onclick = () => openCourseSheet(b.dataset.course); });
  $('#add-course-btn', root).onclick = () => openCourseSheet(null);
  $$('[data-prio]', root).forEach((sel) => { sel.onchange = () => { setCoursePriority(sel.dataset.prio, sel.value); render(); }; });
  $('#auto-dl', root).onclick = () => { const ac2 = activeCourse(); mmAutoDeadlines(MM.state.courses, PACE_BY_MODE[MM.state.settings.jobMode] || 4, planBaseDate(), ac2 && ac2.code); persist(); toast(t('saved')); render(); };
  $$('[data-sw-toggle]', root).forEach((b) => { b.onclick = () => { const it = sw.items.find((x) => x.id === b.dataset.swToggle); it.done = !it.done; it.date = it.done ? mmTodayStr() : null; persist(); render(); }; });
  $$('[data-sw-edit]', root).forEach((b) => { b.onclick = () => openSwItemSheet(b.dataset.swEdit); });
  $('#sw-add', root).onclick = () => openSwItemSheet(null);
  $('#sw-log', root).onclick = () => { const note = $('#sw-note', root).value.trim(); if (!note) return; sw.logs.push({ date: mmTodayStr(), note, idea: $('#sw-idea', root).value.trim() }); persist(); render(); };
}
const COURSE_PRIOS = [['high', 'priorityHigh'], ['quick', 'priorityQuick'], ['later', 'priorityLater'], ['ignore', 'priorityIgnore']];
function setCoursePriority(code, prio) {
  const c = MM.state.courses.find((x) => x.code === code); if (!c || !MM_PRIORITIES.includes(prio)) return;
  c.priority = prio;
  if (!mmIsScheduled(c) && MM.state.settings.activeCourse === c.code) MM.state.settings.activeCourse = null;
  persist(); toast(`${c.code}: ${t(COURSE_PRIOS.find((x) => x[0] === prio)[1])}`);
}
function openCourseSheet(code) {
  const existing = MM.state.courses.find((c) => c.code === code);
  const c = existing ? clone(existing) : { id: mmUid('c'), code: '', title: '', priority: 'high', group: 'kfupm', topics: [], hours: 0, deadline: null, notes: '', links: '' };
  const prios = COURSE_PRIOS;
  const topicsHtml = () => c.topics.map((tp, i) => `<div class="subtask-row">
      <input type="checkbox" data-tp-done="${i}" ${tp.done ? 'checked' : ''}><input data-tp-name="${i}" value="${esc(tp.name)}">
      <button class="btn sm ghost" data-tp-up="${i}" ${i === 0 ? 'disabled' : ''}>▲</button><button class="btn sm ghost" data-tp-del="${i}">✕</button></div>`).join('')
    + `<div class="row"><input id="tp-new" placeholder="${esc(t('addTopic'))}" style="flex:1"><button class="btn sm" id="tp-add">＋</button></div>`;
  openSheet(existing ? t('editCourse') : t('addCourse'), `<div class="stack">
    <div class="grid2"><label class="field">${esc(t('courseCode'))}<input id="cs-code" value="${esc(c.code)}"></label>
    <label class="field">${esc(t('coursePriority'))}<select id="cs-prio">${prios.map(([v, k]) => `<option value="${v}" ${c.priority === v ? 'selected' : ''}>${esc(t(k))}</option>`).join('')}</select></label></div>
    <div class="grid2"><label class="field">${esc(t('courseTitle'))}<input id="cs-title" value="${esc(c.title)}"></label>
    <label class="field">${esc(t('courseGroup'))}<select id="cs-group">${MM_GROUPS.map((g) => `<option value="${g}" ${mmCourseGroup(c) === g ? 'selected' : ''}>${esc(t('group_' + g))}</option>`).join('')}</select></label></div>
    <div class="grid2"><label class="field">${esc(t('hours'))}<input type="number" id="cs-hours" value="${c.hours || 0}"></label>
    <label class="field">${esc(t('deadline'))}<input type="date" id="cs-dl" value="${esc(c.deadline || '')}"></label></div>
    <div class="field-label">${esc(t('topics'))}</div><div id="cs-topics">${topicsHtml()}</div>
    <label class="field">${esc(t('notes'))}<textarea id="cs-notes">${esc(c.notes || '')}</textarea></label>
    <label class="field">${esc(t('link'))}<input id="cs-links" value="${esc(c.links || '')}" placeholder="https://"></label>
    ${existing ? `<button class="btn block" id="cs-active">⭐ ${esc(t('setActive'))}</button>` : ''}
    <button class="btn primary block" id="cs-save">${esc(t('save'))}</button>
    ${existing ? `<button class="btn danger block" id="cs-del">${esc(t('delete'))}</button>` : ''}</div>`, (root, close) => {
    const wire = () => {
      $$('[data-tp-done]', root).forEach((el) => { el.onchange = () => { const tp = c.topics[+el.dataset.tpDone]; tp.done = el.checked; tp.doneDate = el.checked ? mmTodayStr() : null; }; });
      $$('[data-tp-name]', root).forEach((el) => { el.oninput = () => { c.topics[+el.dataset.tpName].name = el.value; }; });
      $$('[data-tp-del]', root).forEach((el) => { el.onclick = () => { c.topics.splice(+el.dataset.tpDel, 1); redraw(); }; });
      $$('[data-tp-up]', root).forEach((el) => { el.onclick = () => { const i = +el.dataset.tpUp; [c.topics[i - 1], c.topics[i]] = [c.topics[i], c.topics[i - 1]]; redraw(); }; });
      $('#tp-add', root).onclick = () => { const v = $('#tp-new', root).value.trim(); if (v) { c.topics.push({ id: mmUid('t'), name: v, done: false }); redraw(); } };
    };
    const redraw = () => { $('#cs-topics', root).innerHTML = topicsHtml(); wire(); };
    wire();
    const read = () => Object.assign(c, { code: $('#cs-code', root).value.trim(), title: $('#cs-title', root).value.trim(), priority: $('#cs-prio', root).value, group: $('#cs-group', root).value,
      hours: Number($('#cs-hours', root).value) || 0, deadline: $('#cs-dl', root).value || null, notes: $('#cs-notes', root).value, links: $('#cs-links', root).value.trim() });
    $('#cs-save', root).onclick = () => {
      read(); if (!c.code || !c.title) return;
      const wasActive = MM.state.settings.activeCourse === code;
      if (existing) Object.assign(existing, c); else MM.state.courses.push(c);
      if (wasActive) {
        MM.state.settings.activeCourse = c.code;
        if (courseLeft(c) === 0 || !mmIsScheduled(c)) { MM.state.settings.activeCourse = null; const n = activeCourse(); toast(n ? `${t('nextSubjectToast')} ${n.code}` : t('allCoursesDone')); }
      }
      persist(); close(); render();
    };
    const a = $('#cs-active', root); if (a) a.onclick = () => { read(); Object.assign(existing, c); MM.state.settings.activeCourse = c.code; persist(); close(); toast(`${t('activeSubject')}: ${c.code}`); render(); };
    const d = $('#cs-del', root); if (d) d.onclick = () => { if (confirm(t('confirmDelete'))) { MM.state.courses = MM.state.courses.filter((x) => x.code !== code); persist(); close(); render(); } };
  });
}
function openSwItemSheet(id) {
  const items = MM.state.solidworks.items; const existing = items.find((x) => x.id === id);
  const it = existing ? clone(existing) : { id: mmUid('sw'), title: '', done: false, notes: '', link: '', date: null, subtasks: [] };
  it.subtasks = it.subtasks || [];
  openSheet(existing ? t('editItem') : t('addItem'), `<div class="stack">
    <label class="field">${esc(t('title'))}<input id="si-title" value="${esc(it.title)}"></label>
    <label class="check-row"><input type="checkbox" id="si-done" ${it.done ? 'checked' : ''}> ${esc(t('done'))}</label>
    <label class="field">${esc(t('notes'))}<textarea id="si-notes">${esc(it.notes)}</textarea></label>
    <label class="field">${esc(t('link'))}<input id="si-link" value="${esc(it.link)}" placeholder="https://"></label>
    <div class="field-label">${esc(t('subtasks'))}</div><div id="si-subs">${subtaskEditor(it.subtasks)}</div>
    <button class="btn primary block" id="si-save">${esc(t('save'))}</button>
    ${existing ? `<button class="btn danger block" id="si-del">${esc(t('delete'))}</button>` : ''}</div>`, (root, close) => {
    const rew = () => { $('#si-subs', root).innerHTML = subtaskEditor(it.subtasks); wireSubtasks(root, it.subtasks, rew); };
    wireSubtasks(root, it.subtasks, rew);
    $('#si-save', root).onclick = () => {
      Object.assign(it, { title: $('#si-title', root).value.trim(), done: $('#si-done', root).checked, notes: $('#si-notes', root).value, link: $('#si-link', root).value.trim() });
      if (!it.title) return; it.date = it.done ? (it.date || mmTodayStr()) : null;
      if (existing) Object.assign(existing, it); else items.push(it); persist(); close(); render();
    };
    const d = $('#si-del', root); if (d) d.onclick = () => { if (confirm(t('confirmDelete'))) { MM.state.solidworks.items = items.filter((x) => x.id !== id); persist(); close(); render(); } };
  });
}
