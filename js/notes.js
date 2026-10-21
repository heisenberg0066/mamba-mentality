/* Mamba Mentality v3 — sticky notes · v4.4: cross out (done) → stays 24 h struck through, then disappears */
const NOTE_COLORS = ['yellow', 'mint', 'peach', 'lavender', 'sky'];
function notesList() { if (!Array.isArray(MM.state.notes)) MM.state.notes = []; return MM.state.notes; }
function noteDate(iso) {
  const d = new Date(iso); if (isNaN(d)) return '';
  return `${d.getDate()} ${monthNames()[d.getMonth()].slice(0, 3)} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
const NOTE_TTL = 24 * 3600 * 1000; // a crossed-out note stays visible this long
const nowMs = (now) => (now == null ? Date.now() : Number(now));
/** Cross a note out (done, stamps doneAt) or un-cross it (cancels the removal). */
function toggleNoteDone(id, now) {
  const n = notesList().find((x) => x.id === id); if (!n) return null;
  n.done = !n.done; n.doneAt = n.done ? new Date(nowMs(now)).toISOString() : null;
  persist(); return n;
}
function noteLeftMs(n, now) { if (!n || !n.done || !n.doneAt) return null; const t0 = Date.parse(n.doneAt); return isNaN(t0) ? null : t0 + NOTE_TTL - nowMs(now); }
/** Remove crossed-out notes older than 24 h. Returns how many were removed. */
function purgeExpiredNotes(now) {
  const list = notesList(); const keep = list.filter((n) => { const left = noteLeftMs(n, now); return left == null || left > 0; });
  const gone = list.length - keep.length;
  if (gone) { MM.state.notes = keep; persist(); }
  return gone;
}
function goneInText(n) {
  const left = Math.max(0, noteLeftMs(n) || 0); const h = Math.ceil(left / 3600000);
  return t('noteGoneIn').replace('{x}', left > 3600000 ? `${h} ${t('durH')}` : `${Math.max(1, Math.ceil(left / 60000))} ${t('durM')}`);
}
function addNote(text) {
  const list = notesList();
  const color = NOTE_COLORS[list.length % NOTE_COLORS.length];
  const now = new Date().toISOString();
  list.push({ id: mmUid('n'), text, color, tilt: Math.round((Math.random() * 5 - 2.5) * 10) / 10, pinned: false, done: false, doneAt: null, created: now, updated: now });
  persist();
}
function renderNotes(root) {
  purgeExpiredNotes();
  const list = notesList().slice().sort((a, b) => (!!a.done - !!b.done) || (b.pinned - a.pinned) || (b.created < a.created ? -1 : 1));
  const rtlText = (s) => /[\u0600-\u06FF]/.test(s);
  root.innerHTML = `<h2 class="page-title">${esc(t('notesTitle'))}</h2>
    <div class="card note-compose">
      <textarea id="note-new" class="hand" dir="auto" placeholder="${esc(t('notePlaceholder'))}"></textarea>
      <button class="btn primary block" id="note-add">＋ ${esc(t('noteAdd'))}</button></div>
    ${list.length ? `<p class="muted small notes-hint">${esc(t('noteCrossHint'))}</p>` : `<p class="muted" style="text-align:center;margin-top:24px">${esc(t('notesEmpty'))}</p>`}
    <div class="notes-grid">${list.map((n) => `
      <div class="sticky note-${esc(n.color)} ${n.pinned ? 'pinned' : ''} ${n.done ? 'done' : ''}" style="--tilt:${n.tilt || 0}deg" data-note="${esc(n.id)}">
        ${n.pinned ? '<span class="pin" aria-hidden="true"></span>' : '<span class="tape" aria-hidden="true"></span>'}
        <button class="note-check ${n.done ? 'on' : ''}" data-note-done="${esc(n.id)}" aria-pressed="${n.done ? 'true' : 'false'}" aria-label="${esc(n.done ? t('noteUncross') : t('noteCross'))}">${n.done ? '✓' : ''}</button>
        <div class="note-text hand ${rtlText(n.text) ? 'ar' : ''}" dir="auto">${esc(n.text)}</div>
        <div class="note-foot">${n.done ? `<span class="gone-in">⏳ ${esc(goneInText(n))}</span>` : `<span>${esc(noteDate(n.updated || n.created))}</span>`}${n.pinned ? '<span>📌</span>' : ''}</div>
      </div>`).join('')}</div>`;
  const ta = $('#note-new', root);
  $('#note-add', root).onclick = () => { const v = ta.value.trim(); if (!v) return; addNote(v); render(); };
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('#note-add', root).click(); });
  const cross = (id) => { const n = toggleNoteDone(id); if (n) toast(n.done ? t('noteCrossedToast') : t('noteRestoredToast')); render(); };
  $$('[data-note-done]', root).forEach((b) => { b.onclick = (e) => { e.stopPropagation(); cross(b.dataset.noteDone); }; });
  $$('[data-note]', root).forEach((el) => {
    let sx = 0, sy = 0, swiped = false;
    el.addEventListener('touchstart', (e) => { const p = e.touches[0]; sx = p.clientX; sy = p.clientY; swiped = false; }, { passive: true });
    el.addEventListener('touchend', (e) => { // horizontal swipe = cross out / restore
      const p = e.changedTouches[0]; const dx = p.clientX - sx, dy = p.clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dy) < 40) { swiped = true; cross(el.dataset.note); }
    });
    el.onclick = () => { if (!swiped) openNoteSheet(el.dataset.note); };
  });
}
function openNoteSheet(id) {
  const n = notesList().find((x) => x.id === id); if (!n) return;
  let color = n.color;
  openSheet(t('noteEdit'), `<div class="stack">
    <textarea id="ne-text" class="hand note-edit note-${esc(n.color)}" dir="auto">${esc(n.text)}</textarea>
    <div class="field-label">${esc(t('noteColor'))}</div>
    <div class="swatches">${NOTE_COLORS.map((c) => `<button class="swatch note-${c} ${c === n.color ? 'sel' : ''}" data-color="${c}" aria-label="${esc(t('color_' + c))}"></button>`).join('')}</div>
    <button class="btn block ${n.done ? 'success on' : ''}" id="ne-done">${n.done ? '↺ ' + esc(t('noteUncross')) : '✓ ' + esc(t('noteCross'))}</button>
    ${n.done ? `<div class="muted small">⏳ ${esc(goneInText(n))}</div>` : ''}
    <button class="btn block" id="ne-pin">📌 ${esc(n.pinned ? t('noteUnpin') : t('notePin'))}</button>
    <div class="muted small">${esc(t('noteCreated'))}: ${esc(noteDate(n.created))}</div>
    <button class="btn primary block" id="ne-save">${esc(t('save'))}</button>
    <button class="btn danger block" id="ne-del">${esc(t('delete'))}</button></div>`, (root, close) => {
    const ta = $('#ne-text', root);
    $$('[data-color]', root).forEach((b) => { b.onclick = () => {
      color = b.dataset.color; $$('[data-color]', root).forEach((x) => x.classList.toggle('sel', x === b));
      NOTE_COLORS.forEach((c) => ta.classList.remove('note-' + c)); ta.classList.add('note-' + color);
    }; });
    $('#ne-done', root).onclick = () => { toggleNoteDone(n.id); close(); toast(n.done ? t('noteCrossedToast') : t('noteRestoredToast')); render(); };
    $('#ne-pin', root).onclick = () => { n.pinned = !n.pinned; persist(); close(); render(); };
    $('#ne-save', root).onclick = () => {
      const v = ta.value.trim(); if (!v) return;
      if (v !== n.text) n.updated = new Date().toISOString();
      n.text = v; n.color = color; persist(); close(); toast(t('saved')); render();
    };
    $('#ne-del', root).onclick = () => { if (confirm(t('confirmDelete'))) { MM.state.notes = notesList().filter((x) => x.id !== id); persist(); close(); toast(t('deleted')); render(); } };
  });
}
