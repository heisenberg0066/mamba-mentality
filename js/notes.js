/* Mamba Mentality v3 — sticky notes */
const NOTE_COLORS = ['yellow', 'mint', 'peach', 'lavender', 'sky'];
function notesList() { if (!Array.isArray(MM.state.notes)) MM.state.notes = []; return MM.state.notes; }
function noteDate(iso) {
  const d = new Date(iso); if (isNaN(d)) return '';
  return `${d.getDate()} ${monthNames()[d.getMonth()].slice(0, 3)} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function addNote(text) {
  const list = notesList();
  const color = NOTE_COLORS[list.length % NOTE_COLORS.length];
  const now = new Date().toISOString();
  list.push({ id: mmUid('n'), text, color, tilt: Math.round((Math.random() * 5 - 2.5) * 10) / 10, pinned: false, created: now, updated: now });
  persist();
}
function renderNotes(root) {
  const list = notesList().slice().sort((a, b) => (b.pinned - a.pinned) || (b.created < a.created ? -1 : 1));
  const rtlText = (s) => /[\u0600-\u06FF]/.test(s);
  root.innerHTML = `<h2 class="page-title">${esc(t('notesTitle'))}</h2>
    <div class="card note-compose">
      <textarea id="note-new" class="hand" dir="auto" placeholder="${esc(t('notePlaceholder'))}"></textarea>
      <button class="btn primary block" id="note-add">＋ ${esc(t('noteAdd'))}</button></div>
    ${list.length ? '' : `<p class="muted" style="text-align:center;margin-top:24px">${esc(t('notesEmpty'))}</p>`}
    <div class="notes-grid">${list.map((n) => `
      <div class="sticky note-${esc(n.color)} ${n.pinned ? 'pinned' : ''}" style="--tilt:${n.tilt || 0}deg" data-note="${esc(n.id)}">
        ${n.pinned ? '<span class="pin" aria-hidden="true"></span>' : '<span class="tape" aria-hidden="true"></span>'}
        <div class="note-text hand ${rtlText(n.text) ? 'ar' : ''}" dir="auto">${esc(n.text)}</div>
        <div class="note-foot"><span>${esc(noteDate(n.updated || n.created))}</span>${n.pinned ? '<span>📌</span>' : ''}</div>
      </div>`).join('')}</div>`;
  const ta = $('#note-new', root);
  $('#note-add', root).onclick = () => { const v = ta.value.trim(); if (!v) return; addNote(v); render(); };
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('#note-add', root).click(); });
  $$('[data-note]', root).forEach((el) => { el.onclick = () => openNoteSheet(el.dataset.note); });
}
function openNoteSheet(id) {
  const n = notesList().find((x) => x.id === id); if (!n) return;
  let color = n.color;
  openSheet(t('noteEdit'), `<div class="stack">
    <textarea id="ne-text" class="hand note-edit note-${esc(n.color)}" dir="auto">${esc(n.text)}</textarea>
    <div class="field-label">${esc(t('noteColor'))}</div>
    <div class="swatches">${NOTE_COLORS.map((c) => `<button class="swatch note-${c} ${c === n.color ? 'sel' : ''}" data-color="${c}" aria-label="${esc(t('color_' + c))}"></button>`).join('')}</div>
    <button class="btn block" id="ne-pin">📌 ${esc(n.pinned ? t('noteUnpin') : t('notePin'))}</button>
    <div class="muted small">${esc(t('noteCreated'))}: ${esc(noteDate(n.created))}</div>
    <button class="btn primary block" id="ne-save">${esc(t('save'))}</button>
    <button class="btn danger block" id="ne-del">${esc(t('delete'))}</button></div>`, (root, close) => {
    const ta = $('#ne-text', root);
    $$('[data-color]', root).forEach((b) => { b.onclick = () => {
      color = b.dataset.color; $$('[data-color]', root).forEach((x) => x.classList.toggle('sel', x === b));
      NOTE_COLORS.forEach((c) => ta.classList.remove('note-' + c)); ta.classList.add('note-' + color);
    }; });
    $('#ne-pin', root).onclick = () => { n.pinned = !n.pinned; persist(); close(); render(); };
    $('#ne-save', root).onclick = () => {
      const v = ta.value.trim(); if (!v) return;
      if (v !== n.text) n.updated = new Date().toISOString();
      n.text = v; n.color = color; persist(); close(); toast(t('saved')); render();
    };
    $('#ne-del', root).onclick = () => { if (confirm(t('confirmDelete'))) { MM.state.notes = notesList().filter((x) => x.id !== id); persist(); close(); toast(t('deleted')); render(); } };
  });
}
