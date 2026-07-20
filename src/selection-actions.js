/* Flowmap v0.17.1 — clear selections on blank click and act on marquee selections */
let selectionActionsEventsBound = false;

function selectionActionsHasSelection() {
  return Boolean(selection.type && selection.id) ||
    (typeof validSelectedNoteIds === 'function' && validSelectedNoteIds().length > 0);
}

function selectionActionsDeleteSelectedNotes() {
  const ids = typeof validSelectedNoteIds === 'function' ? validSelectedNoteIds() : [];
  if (ids.length < 2) return;
  const deleting = new Set(ids);

  mutate(`${ids.length}件の工程を削除`, () => {
    state.notes = state.notes.filter((item) => !deleting.has(item.id));
    state.edges = state.edges.filter((item) => !deleting.has(item.from) && !deleting.has(item.to));

    if (state.settings && Array.isArray(state.settings.outlineSuppressedAutoPairs)) {
      state.settings.outlineSuppressedAutoPairs = state.settings.outlineSuppressedAutoPairs.filter((key) => {
        const [from, to] = String(key).split('→');
        return !deleting.has(from) && !deleting.has(to);
      });
    }

    selectedNoteIds.clear();
    selection = { type: null, id: null };
    if (typeof outlineRenumber === 'function') outlineRenumber();
    if (typeof outlineSyncAutoEdges === 'function') outlineSyncAutoEdges();
  });
  toast(`${ids.length}件の工程を削除しました`);
}

function selectionActionsInstallUi() {
  const toolbar = document.getElementById('multi-selection-toolbar');
  if (toolbar && !toolbar.querySelector('[data-delete-multi]')) {
    const button = document.createElement('button');
    button.className = 'multi-delete-button';
    button.type = 'button';
    button.dataset.deleteMulti = '';
    button.textContent = '削除';
    const clear = toolbar.querySelector('[data-clear-multi]');
    if (clear) toolbar.insertBefore(button, clear); else toolbar.append(button);
  }

  const grid = els['help-dialog']?.querySelector('.shortcut-grid');
  if (grid) {
    [...grid.children].forEach((row) => {
      const key = row.querySelector('kbd')?.textContent.trim() || '';
      const description = row.querySelector('span');
      if (key === '空白クリック' && description) description.textContent = '選択中なら解除。未選択時は何もしない';
      if (key === 'Delete' && description) description.textContent = '選択した図形を削除。複数選択時はまとめて削除';
    });
  }
}

const canvasAddUpdateHintBeforeSelectionActions = canvasAddUpdateHint;
canvasAddUpdateHint = function canvasAddUpdateHintSelectionActions() {
  canvasAddUpdateHintBeforeSelectionActions();
  if (canvasNavigationSelectionModeAvailable() || (canvasAddPrimaryHeld && canvasAddModeAvailable())) return;
  const hint = els['canvas-hint'];
  if (!hint) return;
  const primary = CANVAS_ADD_IS_MAC ? 'Cmd' : 'Ctrl';
  hint.innerHTML = `<strong>ドラッグ</strong>で移動　・　空白クリックで選択解除　・　Shift＋ドラッグで範囲選択　・　${primary}＋クリックで処理を追加`;
};

const handlePointerUpBeforeSelectionActions = handlePointerUp;
handlePointerUp = function handlePointerUpSelectionActions(event) {
  if (drag?.type === 'pan' && drag.canvasBlankNoop && !drag.moved) {
    drag = null;
    els.stage.classList.remove('is-panning');
    event.preventDefault();
    if (typeof suppressClickAfterPan === 'function') suppressClickAfterPan();
    if (selectionActionsHasSelection()) {
      closeQuickPopover();
      clearSelection();
    }
    return;
  }
  return handlePointerUpBeforeSelectionActions(event);
};

const handleKeyDownBeforeSelectionActions = handleKeyDown;
handleKeyDown = function handleKeyDownSelectionActions(event) {
  const typing = event.target instanceof Element && event.target.matches('input,textarea,select,[contenteditable="true"]');
  const ids = typeof validSelectedNoteIds === 'function' ? validSelectedNoteIds() : [];
  if (!typing && ids.length > 1 && (event.key === 'Delete' || event.key === 'Backspace')) {
    event.preventDefault();
    event.stopPropagation();
    selectionActionsDeleteSelectedNotes();
    return;
  }
  return handleKeyDownBeforeSelectionActions(event);
};

const updateFlowExperienceUiBeforeSelectionActions = updateFlowExperienceUi;
updateFlowExperienceUi = function updateFlowExperienceUiSelectionActions() {
  updateFlowExperienceUiBeforeSelectionActions();
  const badge = document.querySelector('.version-badge');
  if (badge) badge.textContent = 'v0.17.1';
  selectionActionsInstallUi();
  canvasAddUpdateHint();
};

function bindSelectionActionsEvents() {
  if (selectionActionsEventsBound) return;
  selectionActionsEventsBound = true;
  selectionActionsInstallUi();
  document.getElementById('multi-selection-toolbar')?.addEventListener('click', (event) => {
    if (event.target.closest('[data-delete-multi]')) selectionActionsDeleteSelectedNotes();
  });
}

const bindEventsBeforeSelectionActions = bindEvents;
bindEvents = function bindEventsSelectionActions() {
  bindEventsBeforeSelectionActions();
  bindSelectionActionsEvents();
};
