/* Flowmap v0.15 — multiple selection for fast grouping */
let selectedNoteIds = new Set();
let multiSelectionEventsBound = false;

function validSelectedNoteIds() {
  return [...selectedNoteIds].filter((id) => Boolean(getNote(id)));
}

function syncMultiSelectionState() {
  selectedNoteIds = new Set(validSelectedNoteIds());
  if (selection.type === 'note' && selection.id && getNote(selection.id)) {
    if (!selectedNoteIds.has(selection.id)) selectedNoteIds = new Set([selection.id]);
  } else if (selection.type !== 'note') {
    selectedNoteIds.clear();
  }
}

function setMultiSelection(ids, primaryId = null, options = {}) {
  const valid = [...new Set(ids)].filter((id) => Boolean(getNote(id)));
  selectedNoteIds = new Set(valid);
  const resolvedPrimary = valid.includes(primaryId) ? primaryId : valid.at(-1) || null;
  if (resolvedPrimary) {
    selection = { type: 'note', id: resolvedPrimary };
    if (options.openInspector !== false) state.settings.inspectorOpen = true;
  } else {
    selection = { type: null, id: null };
    if (options.closeInspector !== false && typeof v12PracticeSession !== 'undefined' && !v12PracticeSession) state.settings.inspectorOpen = false;
  }
  if (typeof stopFlowPlayback === 'function') stopFlowPlayback({ keepFocus: false, render: false });
  closeQuickPopover();
  renderAll();
}

function toggleMultiSelectedNote(noteId) {
  const next = new Set(validSelectedNoteIds());
  if (next.has(noteId)) next.delete(noteId); else next.add(noteId);
  const primary = next.has(noteId) ? noteId : [...next].at(-1) || null;
  setMultiSelection([...next], primary);
}

function multiSelectionBounds(ids = validSelectedNoteIds()) {
  const items = ids.map((id) => getNote(id)).filter(Boolean);
  if (!items.length) return null;
  return {
    minX: Math.min(...items.map((item) => item.x)),
    minY: Math.min(...items.map((item) => item.y)),
    maxX: Math.max(...items.map((item) => item.x + noteDisplaySize(item).w)),
    maxY: Math.max(...items.map((item) => item.y + noteDisplaySize(item).h))
  };
}

function installMultiSelectionUi() {
  if (!document.getElementById('multi-selection-toolbar')) {
    const toolbar = document.createElement('div');
    toolbar.id = 'multi-selection-toolbar';
    toolbar.className = 'multi-selection-toolbar';
    toolbar.hidden = true;
    toolbar.innerHTML = '<strong id="multi-selection-count">0件を選択</strong><button class="multi-group-button" type="button" data-group-selected>囲みにする</button><button class="multi-clear-button" type="button" data-clear-multi>解除</button>';
    els.board.append(toolbar);
  }
  const hint = els['canvas-hint'];
  if (hint) hint.innerHTML = '<strong>空白をクリック</strong>して入力　・　ドラッグで範囲選択　・　Space＋ドラッグで移動';
  const helpGrid = els['help-dialog']?.querySelector('.shortcut-grid');
  if (helpGrid && !helpGrid.querySelector('[data-shortcut="multi-select"]')) {
    const row = document.createElement('div');
    row.dataset.shortcut = 'multi-select';
    row.innerHTML = '<kbd>Shift＋クリック／範囲ドラッグ</kbd><span>複数の図形を選び、位置を変えずに囲みにする</span>';
    helpGrid.append(row);
  }
}

function updateMultiSelectionUi() {
  installMultiSelectionUi();
  syncMultiSelectionState();
  const ids = validSelectedNoteIds();
  $$('.sticky-note', els['node-layer']).forEach((card) => {
    const selected = selectedNoteIds.has(card.dataset.noteId);
    card.classList.toggle('is-multi-selected', selected);
    card.classList.toggle('is-multi-primary', selected && selection.type === 'note' && selection.id === card.dataset.noteId);
    card.setAttribute('aria-selected', String(selected));
  });
  document.getElementById('multi-selection-outline')?.remove();
  if (ids.length > 1) {
    const bounds = multiSelectionBounds(ids);
    if (bounds) {
      const outline = document.createElement('div');
      outline.id = 'multi-selection-outline';
      outline.className = 'multi-selection-outline';
      Object.assign(outline.style, {
        left: `${bounds.minX - 12}px`,
        top: `${bounds.minY - 12}px`,
        width: `${bounds.maxX - bounds.minX + 24}px`,
        height: `${bounds.maxY - bounds.minY + 24}px`
      });
      els['node-layer'].append(outline);
    }
  }
  const toolbar = document.getElementById('multi-selection-toolbar');
  const count = document.getElementById('multi-selection-count');
  if (toolbar) toolbar.hidden = ids.length < 2 || currentFlowMode() !== 'build';
  if (count) count.textContent = `${ids.length}件を選択`;
}

function beginMarqueeSelection(event) {
  const point = screenToWorld(event.clientX, event.clientY);
  drag = {
    type: 'marquee',
    startClientX: event.clientX,
    startClientY: event.clientY,
    currentClientX: event.clientX,
    currentClientY: event.clientY,
    startWorldX: point.x,
    startWorldY: point.y,
    additive: event.shiftKey,
    moved: false,
    threshold: typeof v12PointThreshold === 'function' ? v12PointThreshold(event) : 8
  };
  els.stage.classList.add('is-marquee-selecting');
  event.preventDefault();
  return true;
}

function updateMarqueeElement(activeDrag) {
  let marquee = document.getElementById('multi-selection-marquee');
  if (!marquee) {
    marquee = document.createElement('div');
    marquee.id = 'multi-selection-marquee';
    marquee.className = 'multi-selection-marquee';
    els.board.append(marquee);
  }
  const rect = els.stage.getBoundingClientRect();
  const left = Math.min(activeDrag.startClientX, activeDrag.currentClientX) - rect.left;
  const top = Math.min(activeDrag.startClientY, activeDrag.currentClientY) - rect.top;
  const width = Math.abs(activeDrag.currentClientX - activeDrag.startClientX);
  const height = Math.abs(activeDrag.currentClientY - activeDrag.startClientY);
  Object.assign(marquee.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
}

function finishMarqueeSelection(activeDrag, event) {
  els.stage.classList.remove('is-marquee-selecting');
  document.getElementById('multi-selection-marquee')?.remove();
  if (!activeDrag.moved) {
    if (!activeDrag.additive) {
      if (typeof suppressClickAfterPan === 'function') suppressClickAfterPan();
      v12StartDraft(activeDrag.startWorldX, activeDrag.startWorldY, 'process');
    }
    return;
  }
  if (typeof suppressClickAfterPan === 'function') suppressClickAfterPan();
  const end = screenToWorld(event.clientX, event.clientY);
  const minX = Math.min(activeDrag.startWorldX, end.x);
  const maxX = Math.max(activeDrag.startWorldX, end.x);
  const minY = Math.min(activeDrag.startWorldY, end.y);
  const maxY = Math.max(activeDrag.startWorldY, end.y);
  const picked = state.notes.filter((item) => {
    const group = item.groupId ? getGroup(item.groupId) : null;
    if (group?.collapsed) return false;
    const size = noteDisplaySize(item);
    const cx = item.x + size.w / 2;
    const cy = item.y + size.h / 2;
    return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
  }).map((item) => item.id);
  const next = activeDrag.additive ? new Set(validSelectedNoteIds()) : new Set();
  picked.forEach((id) => next.add(id));
  const primary = picked.at(-1) || (activeDrag.additive ? selection.id : null);
  setMultiSelection([...next], primary, { openInspector: Boolean(primary) });
}

const beginPanBeforeMultiSelection = beginPan;
beginPan = function beginPanMultiSelection(event) {
  const typingOrControl = event.target.closest('.sticky-note,.v12-draft-node,.group-header,.phase-title,.edge-hit,.edge-endpoint,button,input,textarea,select,[contenteditable="true"]');
  const shouldMarquee = event.button === 0 && event.pointerType !== 'touch' && !spaceHeld && !typingOrControl && currentFlowMode() === 'build';
  if (shouldMarquee) {
    v12CancelDraft();
    return beginMarqueeSelection(event);
  }
  return beginPanBeforeMultiSelection(event);
};

const handlePointerMoveBeforeMultiSelection = handlePointerMove;
handlePointerMove = function handlePointerMoveMultiSelection(event) {
  if (drag?.type !== 'marquee') return handlePointerMoveBeforeMultiSelection(event);
  drag.currentClientX = event.clientX;
  drag.currentClientY = event.clientY;
  drag.moved ||= Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) > drag.threshold;
  if (drag.moved) updateMarqueeElement(drag);
};

const handlePointerUpBeforeMultiSelection = handlePointerUp;
handlePointerUp = function handlePointerUpMultiSelection(event) {
  if (drag?.type !== 'marquee') return handlePointerUpBeforeMultiSelection(event);
  const finished = drag;
  drag = null;
  finishMarqueeSelection(finished, event);
};

const selectBeforeMultiSelection = select;
select = function selectMultiSelection(type, id, options = {}) {
  if (type === 'note' && id) selectedNoteIds = new Set([id]); else selectedNoteIds.clear();
  return selectBeforeMultiSelection(type, id, options);
};

const clearSelectionBeforeMultiSelection = clearSelection;
clearSelection = function clearSelectionMultiSelection() {
  selectedNoteIds.clear();
  return clearSelectionBeforeMultiSelection();
};

const renderNotesBeforeMultiSelection = renderNotes;
renderNotes = function renderNotesMultiSelection() {
  renderNotesBeforeMultiSelection();
  updateMultiSelectionUi();
};

const renderNavigatorBeforeMultiSelection = renderNavigator;
renderNavigator = function renderNavigatorMultiSelection() {
  renderNavigatorBeforeMultiSelection();
  $$('.tree-node', els['structure-tree']).forEach((row) => {
    row.classList.toggle('is-multi-selected', selectedNoteIds.has(row.dataset.selectId));
  });
};

const handleKeyDownBeforeMultiSelection = handleKeyDown;
handleKeyDown = function handleKeyDownMultiSelection(event) {
  const typing = event.target instanceof Element && event.target.matches('input,textarea,select,[contenteditable="true"]');
  if (!typing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
    event.preventDefault();
    const visible = state.notes.filter((item) => !getGroup(item.groupId)?.collapsed).map((item) => item.id);
    setMultiSelection(visible, visible.at(-1) || null);
    return;
  }
  if (!typing && event.key === 'Escape' && selectedNoteIds.size > 1) {
    event.preventDefault();
    clearSelection();
    return;
  }
  return handleKeyDownBeforeMultiSelection(event);
};

function bindMultiSelectionEvents() {
  if (multiSelectionEventsBound) return;
  multiSelectionEventsBound = true;
  installMultiSelectionUi();
  els['node-layer'].addEventListener('pointerdown', (event) => {
    const card = event.target.closest('.sticky-note');
    if (!card || !event.shiftKey || event.button !== 0 || event.target.closest('button,input,textarea,select,[contenteditable="true"]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  els['node-layer'].addEventListener('click', (event) => {
    const card = event.target.closest('.sticky-note');
    if (!card || !event.shiftKey || event.target.closest('button,input,textarea,select,[contenteditable="true"]')) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    toggleMultiSelectedNote(card.dataset.noteId);
  }, true);
  document.getElementById('multi-selection-toolbar')?.addEventListener('click', (event) => {
    if (event.target.closest('[data-clear-multi]')) return clearSelection();
    if (event.target.closest('[data-group-selected]')) {
      if (typeof groupSelectedNotes === 'function') groupSelectedNotes();
      else toast('囲み機能を読み込めませんでした');
    }
  });
}

const bindEventsBeforeMultiSelection = bindEvents;
bindEvents = function bindEventsMultiSelection() {
  bindEventsBeforeMultiSelection();
  bindMultiSelectionEvents();
};
