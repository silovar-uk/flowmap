const beginPanBeforeUnifiedPanel = beginPan;
beginPan = function beginPanUnifiedPanel(event) {
  const control = event.target.closest('.sticky-note,.v12-draft-node,.group-header,.phase-title,.edge-hit,.edge-endpoint,button,input,textarea,select,[contenteditable="true"]');
  const blankLeftDrag = event.button === 0 && event.pointerType !== 'touch' && !spaceHeld && !control && currentFlowMode() === 'build';
  if (blankLeftDrag && event.shiftKey) {
    if (typeof v12CancelDraft === 'function') v12CancelDraft();
    const result = beginMarqueeSelection(event);
    if (drag?.type === 'marquee') {
      drag.additive = Boolean(event.ctrlKey || event.metaKey);
      drag.suppressDraft = true;
    }
    return result;
  }
  return beginPanBeforeUnifiedPanel(event);
};

const finishMarqueeSelectionBeforeUnifiedPanel = finishMarqueeSelection;
finishMarqueeSelection = function finishMarqueeSelectionUnifiedPanel(activeDrag, event) {
  if (activeDrag?.suppressDraft && !activeDrag.moved) {
    els.stage.classList.remove('is-marquee-selecting');
    document.getElementById('multi-selection-marquee')?.remove();
    if (typeof suppressClickAfterPan === 'function') suppressClickAfterPan();
    return;
  }
  return finishMarqueeSelectionBeforeUnifiedPanel(activeDrag, event);
};

function unifiedVisibleNoteCount(rect = els.stage?.getBoundingClientRect()) {
  if (!rect || !state?.notes?.length) return 0;
  const { x, y, scale } = state.viewport;
  const margin = 48;
  return state.notes.filter((item) => !getGroup(item.groupId)?.collapsed).filter((item) => {
    const size = noteDisplaySize(item);
    const left = x + item.x * scale;
    const top = y + item.y * scale;
    const right = left + size.w * scale;
    const bottom = top + size.h * scale;
    return right >= -margin && bottom >= -margin && left <= rect.width + margin && top <= rect.height + margin;
  }).length;
}

function unifiedEnsureBoardVisible({ force = false } = {}) {
  if (currentFlowMode() !== 'build' || !state.notes.length || !els.stage) return;
  const rect = els.stage.getBoundingClientRect();
  if (force || unifiedVisibleNoteCount(rect) === 0) fitView();
}

function unifiedHandleStageResize() {
  if (!els.stage || currentFlowMode() === 'outline') return;
  const nextRect = els.stage.getBoundingClientRect();
  const previous = unifiedUiState.stageRect;
  if (previous && previous.width > 0 && previous.height > 0 && nextRect.width > 0 && nextRect.height > 0) {
    const scale = state.viewport.scale || 1;
    const worldCenterX = (previous.width / 2 - state.viewport.x) / scale;
    const worldCenterY = (previous.height / 2 - state.viewport.y) / scale;
    state.viewport.x = nextRect.width / 2 - worldCenterX * scale;
    state.viewport.y = nextRect.height / 2 - worldCenterY * scale;
    applyLayout();
    renderMinimap();
  }
  unifiedUiState.stageRect = { width: nextRect.width, height: nextRect.height };
  clearTimeout(unifiedUiState.resizeTimer);
  unifiedUiState.resizeTimer = setTimeout(() => {
    unifiedEnsureBoardVisible();
    saveState();
  }, 180);
}

function unifiedInstallResizeGuard() {
  if (!els.stage || els.stage.dataset.resizeGuard === 'true') return;
  els.stage.dataset.resizeGuard = 'true';
  const rect = els.stage.getBoundingClientRect();
  unifiedUiState.stageRect = { width: rect.width, height: rect.height };
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => unifiedHandleStageResize());
    observer.observe(els.stage);
  } else {
    window.addEventListener('resize', unifiedHandleStageResize);
  }
}

const selectBeforeUnifiedPanel = select;
select = function selectUnifiedPanel(type, id, options = {}) {
  if (state?.settings) {
    if (['build', 'check'].includes(currentFlowMode())) state.settings.navigatorOpen = true;
    state.settings.inspectorOpen = false;
    state.settings.workPanelTab = type === 'edge' ? 'relation' : type ? 'selection' : 'outline';
  }
  return selectBeforeUnifiedPanel(type, id, { ...options, openInspector: false });
};

const clearSelectionBeforeUnifiedPanel = clearSelection;
clearSelection = function clearSelectionUnifiedPanel() {
  if (state?.settings) state.settings.workPanelTab = 'outline';
  return clearSelectionBeforeUnifiedPanel();
};

if (typeof setMultiSelection === 'function') {
  const setMultiSelectionBeforeUnifiedPanel = setMultiSelection;
  setMultiSelection = function setMultiSelectionUnifiedPanel(ids, primaryId = null, options = {}) {
    if (state?.settings) {
      if (['build', 'check'].includes(currentFlowMode())) state.settings.navigatorOpen = true;
      state.settings.inspectorOpen = false;
      state.settings.workPanelTab = ids.length ? 'selection' : 'outline';
    }
    return setMultiSelectionBeforeUnifiedPanel(ids, primaryId, { ...options, openInspector: false });
  };
}

const setFlowModeBeforeUnifiedPanel = setFlowMode;
setFlowMode = function setFlowModeUnifiedPanel(mode) {
  const previous = currentFlowMode();
  const result = setFlowModeBeforeUnifiedPanel(mode);
  if (mode === 'build' && previous !== 'build') requestAnimationFrame(() => unifiedEnsureBoardVisible());
  return result;
};

const renderNotesBeforeUnifiedPanel = renderNotes;
renderNotes = function renderNotesUnifiedPanel() {
  const result = renderNotesBeforeUnifiedPanel();
  unifiedApplyRenderedCardAppearance();
  unifiedUpdateMultiToolbar();
  return result;
};

const renderAllBeforeUnifiedPanel = renderAll;
renderAll = function renderAllUnifiedPanel() {
  const result = renderAllBeforeUnifiedPanel();
  unifiedRenderPanel();
  if (!unifiedUiState.initialVisibilityChecked && currentFlowMode() === 'build') {
    unifiedUiState.initialVisibilityChecked = true;
    requestAnimationFrame(() => unifiedEnsureBoardVisible());
  }
  return result;
};

function unifiedHandleDocumentClick(event) {
  const tab = event.target.closest('[data-work-panel-tab]');
  if (tab) {
    event.preventDefault();
    unifiedSwitchPanelTab(tab.dataset.workPanelTab);
    return;
  }
  const color = event.target.closest('[data-note-color]');
  if (color && selection.type === 'note') {
    unifiedApplyColor([selection.id], color.dataset.noteColor);
    return;
  }
  const popoverButton = event.target.closest('[data-multi-popover]');
  if (popoverButton) {
    event.preventDefault();
    unifiedOpenMultiPopover(popoverButton.dataset.multiPopover);
    return;
  }
  const multiColor = event.target.closest('[data-multi-color]');
  if (multiColor) {
    unifiedApplyColor(unifiedCurrentSelectedIds(), multiColor.dataset.multiColor);
    unifiedCloseMultiPopover();
    return;
  }
  const multiWidth = event.target.closest('[data-multi-width]');
  if (multiWidth) {
    unifiedApplyWidthPreset(unifiedCurrentSelectedIds(), multiWidth.dataset.multiWidth);
    unifiedCloseMultiPopover();
    return;
  }
  const distribute = event.target.closest('[data-multi-distribute]');
  if (distribute) {
    if (unifiedCurrentSelectedIds().length < 3) return toast('等間隔は3件以上で利用できます');
    alignmentDistribute(distribute.dataset.multiDistribute);
    return;
  }
  if (event.target.closest('[data-close-multi-popover]')) {
    unifiedCloseMultiPopover();
    return;
  }
  if (unifiedUiState.popover && !event.target.closest('#multi-appearance-popover,[data-multi-popover]')) unifiedCloseMultiPopover();
}

function unifiedHandleDocumentChange(event) {
  if (event.target.id === 'field-note-width-preset' && selection.type === 'note') {
    if (event.target.value === 'custom') {
      const custom = document.getElementById('field-note-width-custom');
      if (custom) { custom.hidden = false; custom.nextElementSibling?.removeAttribute('hidden'); custom.focus(); custom.select(); }
    } else unifiedApplyWidthPreset([selection.id], event.target.value);
  }
  if (event.target.id === 'field-note-width-custom' && selection.type === 'note') {
    unifiedApplyCustomWidth([selection.id], event.target.value);
  }
}

function unifiedBindEvents() {
  if (unifiedUiState.bound) return;
  unifiedUiState.bound = true;
  unifiedInstallPanel();
  unifiedInstallMultiToolbar();
  unifiedInstallResizeGuard();

  els['node-layer'].addEventListener('click', (event) => {
    const card = event.target.closest('.sticky-note[data-note-id]');
    if (!card || !event.shiftKey || event.target.closest('button,input,textarea,select,[contenteditable="true"]')) return;
    /* Shift selection is already handled on pointerdown. Prevent the later single-select click. */
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }, true);

  document.addEventListener('click', unifiedHandleDocumentClick);
  document.addEventListener('change', unifiedHandleDocumentChange);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && unifiedUiState.popover) unifiedCloseMultiPopover();
  });

  const hint = els['canvas-hint'];
  if (hint) hint.innerHTML = '<strong>ドラッグ</strong>でボード移動　・　Shift＋クリックで複数選択　・　Shift＋ドラッグで範囲選択';
}

const bindEventsBeforeUnifiedPanel = bindEvents;
bindEvents = function bindEventsUnifiedPanel() {
  unifiedInstallPanel();
  bindEventsBeforeUnifiedPanel();
  unifiedBindEvents();
};

const updateFlowExperienceUiBeforeUnifiedPanel = updateFlowExperienceUi;
updateFlowExperienceUi = function updateFlowExperienceUiUnifiedPanel() {
  updateFlowExperienceUiBeforeUnifiedPanel();
  unifiedRenderPanel();
  unifiedUpdateMultiToolbar();
  const badge = document.querySelector('.version-badge');
  if (badge) badge.textContent = `v${FLOWMAP_UNIFIED_VERSION}`;
  const hint = els['canvas-hint'];
  if (hint && currentFlowMode() === 'build') hint.innerHTML = '<strong>ドラッグ</strong>でボード移動　・　Shift＋クリックで複数選択　・　Shift＋ドラッグで範囲選択';
};
