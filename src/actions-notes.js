function addNoteAt(x, y, options = {}) {
  const point = { x: clamp(x, 0, WORLD.width - 240), y: clamp(y, 0, WORLD.height - 140) };
  const containingGroup = findGroupAt(point.x + 112, point.y + 58);
  const containingPhase = containingGroup ? getPhase(containingGroup.phaseId) : findPhaseAt(point.x, point.y);
  const item = note(uid('note'), options.title || '新しい付箋', point.x, point.y, containingPhase?.id || state.phases[0]?.id || '', containingGroup?.id || '', { now: new Date().toISOString() });
  state.notes.push(item);
  if (options.connectFrom) state.edges.push(edge(uid('edge'), options.connectFrom, item.id));
  recordActivity(options.label || '付箋を追加', item.id);
  selection = { type: 'note', id: item.id };
  saveState();
  renderAll();
  requestAnimationFrame(() => startInlineEdit(item.id, options.editMode || 'default'));
  return item;
}

function addNoteMutation(x, y, options = {}) {
  undoStack.push(snapshot());
  redoStack.length = 0;
  return addNoteAt(x, y, options);
}

function addSibling(noteId, editMode = 'default') {
  const base = getNote(noteId);
  if (!base) return;
  return addNoteMutation(base.x, base.y + 150, { editMode });
}

function addChild(noteId, editMode = 'default') {
  const base = getNote(noteId);
  if (!base) return;
  return addNoteMutation(base.x + 310, base.y, { connectFrom: base.id, editMode, label: '子付箋を追加' });
}

function duplicateSelected() {
  if (selection.type !== 'note') return;
  const base = getNote(selection.id);
  if (!base) return;
  mutate('付箋を複製', () => {
    const copy = clone(base);
    copy.id = uid('note'); copy.x += 32; copy.y += 32; copy.title += '（コピー）'; copy.createdAt = new Date().toISOString(); copy.updatedAt = copy.createdAt;
    copy.checklist = copy.checklist.map((check) => ({ ...check, id: uid('check') }));
    state.notes.push(copy);
    selection = { type: 'note', id: copy.id };
  }, null);
}

function startInlineEdit(noteId, mode = 'default') {
  const item = getNote(noteId);
  const card = $(`[data-note-id="${noteId}"]`, els['node-layer']);
  if (!item || !card) return;
  const title = $('.node-title', card);
  if (!title || $('.inline-title-editor', card)) return;
  title.hidden = true;
  const editor = document.createElement('textarea');
  editor.className = 'inline-title-editor';
  editor.value = item.title === '新しい付箋' ? '' : item.title;
  editor.rows = 2;
  title.after(editor);
  editor.focus(); editor.select();
  const original = item.title;
  let finished = false;
  const commit = (nextAction = 'none') => {
    if (finished) return;
    finished = true;
    const value = editor.value.trim() || original || '無題の付箋';
    editor.remove(); title.hidden = false;
    if (value !== item.title) mutate('付箋名を変更', () => { item.title = value; }, item.id);
    else renderAll();
    if (nextAction === 'below') addSibling(item.id);
    if (nextAction === 'child') addChild(item.id);
  };
  editor.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); finished = true; editor.remove(); title.hidden = false; renderAll(); }
    else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); commit('none'); }
    else if (event.key === 'Enter' && event.shiftKey) { event.preventDefault(); commit('child'); }
    else if (event.key === 'Enter') { event.preventDefault(); commit('below'); }
    else if (event.key === 'Tab') { event.preventDefault(); commit('below'); }
  });
  editor.addEventListener('blur', () => { if (!finished && document.body.contains(editor)) commit('none'); }, { once: true });
}

function deleteSelection() {
  if (!selection.type || !selection.id) return;
  if (selection.type === 'note') {
    const item = getNote(selection.id);
    if (!item) return;
    mutate('付箋を削除', () => {
      state.notes = state.notes.filter((noteItem) => noteItem.id !== item.id);
      state.edges = state.edges.filter((edgeItem) => edgeItem.from !== item.id && edgeItem.to !== item.id);
      selection = { type: null, id: null };
    });
  } else if (selection.type === 'edge') {
    mutate('矢印を削除', () => { state.edges = state.edges.filter((item) => item.id !== selection.id); selection = { type:null,id:null }; });
  } else if (selection.type === 'group') {
    const id = selection.id;
    mutate('囲みを削除', () => {
      state.groups = state.groups.filter((item) => item.id !== id);
      state.notes.forEach((item) => { if (item.groupId === id) item.groupId = ''; });
      selection = { type:null,id:null };
    });
  } else if (selection.type === 'phase') {
    if (state.phases.length <= 1) return toast('フェーズは1つ以上必要です');
    const id = selection.id;
    const fallback = state.phases.find((item) => item.id !== id);
    mutate('フェーズを削除', () => {
      state.phases = state.phases.filter((item) => item.id !== id);
      state.groups.forEach((item) => { if (item.phaseId === id) item.phaseId = fallback.id; });
      state.notes.forEach((item) => { if (item.phaseId === id) item.phaseId = fallback.id; });
      selection = { type:null,id:null };
    });
  }
}
