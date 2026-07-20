/* Flowmap v0.16.2 — move by default, select with Shift, ignore blank clicks */
let canvasNavigationEventsBound = false;
let canvasNavigationShiftHeld = false;

function canvasNavigationTypingTarget(target) {
  return target instanceof Element && target.matches('input,textarea,select,[contenteditable="true"]');
}

function canvasNavigationSelectionModeAvailable() {
  return canvasNavigationShiftHeld && canvasAddModeAvailable();
}

function canvasNavigationApplyMode() {
  const selecting = canvasNavigationSelectionModeAvailable();
  els.board.classList.toggle('is-canvas-select-mode', selecting);
  if (selecting) {
    els.board.classList.remove('is-canvas-add-mode');
    canvasAddRemovePreview();
  }
  canvasAddUpdateHint();
}

const canvasAddRefreshPreviewBeforeNavigation = canvasAddRefreshPreview;
canvasAddRefreshPreview = function canvasAddRefreshPreviewNavigation() {
  if (canvasNavigationSelectionModeAvailable()) {
    canvasAddPreviewFrame = null;
    canvasNavigationApplyMode();
    return;
  }
  els.board.classList.remove('is-canvas-select-mode');
  return canvasAddRefreshPreviewBeforeNavigation();
};

canvasAddUpdateHint = function canvasAddUpdateNavigationHint() {
  const hint = els['canvas-hint'];
  if (!hint) return;
  const primary = CANVAS_ADD_IS_MAC ? 'Cmd' : 'Ctrl';
  const free = CANVAS_ADD_IS_MAC ? 'Option' : 'Alt';

  if (canvasNavigationSelectionModeAvailable()) {
    hint.innerHTML = canvasAddPrimaryHeld
      ? '<strong>ドラッグして現在の選択へ追加</strong>　・　クリックだけでは何も変更しません'
      : `<strong>ドラッグして範囲選択</strong>　・　${primary}も押すと現在の選択へ追加`;
    return;
  }

  hint.innerHTML = canvasAddPrimaryHeld && canvasAddModeAvailable()
    ? `<strong>クリックして処理を追加</strong>　・　${free}で自由配置　・　Shift中は範囲選択`
    : `<strong>ドラッグ</strong>で移動　・　空白クリックは無操作　・　Shift＋ドラッグで範囲選択　・　${primary}＋クリックで処理を追加`;
};

const beginPanBeforeCanvasNavigation = beginPan;
beginPan = function beginPanCanvasNavigation(event) {
  const blankBuildPointer = event.button === 0 &&
    event.pointerType !== 'touch' &&
    !spaceHeld &&
    canvasAddModeAvailable() &&
    canvasAddBlankTarget(event.target);

  if (blankBuildPointer && event.shiftKey) {
    v12CancelDraft();
    const started = beginMarqueeSelection(event);
    if (started && drag?.type === 'marquee') {
      drag.additive = canvasAddPrimaryFromEvent(event);
    }
    return started;
  }

  if (blankBuildPointer && !canvasAddPrimaryFromEvent(event)) {
    const started = typeof beginPanBeforeMultiSelection === 'function'
      ? beginPanBeforeMultiSelection(event)
      : beginPanBeforeCanvasNavigation(event);
    if (started && drag?.type === 'pan') {
      drag.canvasBlankNoop = true;
      drag.clickSelection = null;
      drag.clearSelectionOnClick = false;
      drag.canvasClearOnClick = false;
    }
    return started;
  }

  return beginPanBeforeCanvasNavigation(event);
};

const handlePointerUpBeforeCanvasNavigation = handlePointerUp;
handlePointerUp = function handlePointerUpCanvasNavigation(event) {
  if (drag?.type === 'marquee' && !drag.moved) {
    drag = null;
    els.stage.classList.remove('is-marquee-selecting');
    document.getElementById('multi-selection-marquee')?.remove();
    event.preventDefault();
    if (typeof suppressClickAfterPan === 'function') suppressClickAfterPan();
    return;
  }

  if (drag?.type === 'pan' && drag.canvasBlankNoop && !drag.moved) {
    drag = null;
    els.stage.classList.remove('is-panning');
    event.preventDefault();
    if (typeof suppressClickAfterPan === 'function') suppressClickAfterPan();
    return;
  }

  return handlePointerUpBeforeCanvasNavigation(event);
};

function canvasNavigationInstallHelp() {
  const grid = els['help-dialog']?.querySelector('.shortcut-grid');
  if (!grid) return;

  [...grid.children].forEach((row) => {
    const key = row.querySelector('kbd')?.textContent.trim() || '';
    const description = row.querySelector('span');
    if (key === '空白クリック' && description) {
      description.textContent = '何もしない。選択、補足欄、ポップアップを維持';
    }
    if (key === '範囲ドラッグ' || key === 'Shift＋範囲ドラッグ') {
      row.querySelector('kbd').textContent = 'Shift＋範囲ドラッグ';
      if (description) description.textContent = '範囲内の図形だけに選び直す';
    }
    if (key === '空白ドラッグ' && description) {
      description.textContent = 'ボードを移動';
    }
    if (key === 'Space＋ドラッグ' && description) {
      description.textContent = 'ボードを移動。中ボタンドラッグも利用可能';
    }
  });

  const hasAdditiveHelp = [...grid.querySelectorAll('kbd')].some((item) => {
    const key = item.textContent;
    return key.includes('Shift') && key.includes('範囲ドラッグ') && (key.includes('Ctrl') || key.includes('Cmd'));
  });
  if (!hasAdditiveHelp) {
    const row = document.createElement('div');
    row.dataset.shortcut = 'marquee-add';
    row.innerHTML = `<kbd>${CANVAS_ADD_IS_MAC ? 'Cmd' : 'Ctrl'}＋Shift＋範囲ドラッグ</kbd><span>現在の複数選択へ範囲内の図形を追加</span>`;
    grid.append(row);
  }
}

function canvasNavigationSetShift(event) {
  if (event.type === 'keydown' && canvasNavigationTypingTarget(event.target)) return;
  const next = Boolean(event.shiftKey);
  if (next === canvasNavigationShiftHeld) return;
  canvasNavigationShiftHeld = next;
  canvasNavigationApplyMode();
  canvasAddSchedulePreview();
}

function canvasNavigationClearMode() {
  canvasNavigationShiftHeld = false;
  els.board.classList.remove('is-canvas-select-mode');
  canvasNavigationApplyMode();
}

function bindCanvasNavigationEvents() {
  if (canvasNavigationEventsBound) return;
  canvasNavigationEventsBound = true;
  canvasNavigationInstallHelp();
  canvasNavigationApplyMode();
  document.addEventListener('keydown', canvasNavigationSetShift, true);
  document.addEventListener('keyup', canvasNavigationSetShift, true);
  window.addEventListener('blur', canvasNavigationClearMode);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) canvasNavigationClearMode();
  });
}

const updateFlowExperienceUiBeforeCanvasNavigation = updateFlowExperienceUi;
updateFlowExperienceUi = function updateFlowExperienceUiCanvasNavigation() {
  updateFlowExperienceUiBeforeCanvasNavigation();
  const badge = document.querySelector('.version-badge');
  if (badge) badge.textContent = 'v0.16.2';
  canvasNavigationApplyMode();
};

const bindEventsBeforeCanvasNavigation = bindEvents;
bindEvents = function bindEventsCanvasNavigation() {
  bindEventsBeforeCanvasNavigation();
  bindCanvasNavigationEvents();
};