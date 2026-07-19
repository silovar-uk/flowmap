/* Flowmap v0.16 — intentional canvas add mode */
const CANVAS_ADD_IS_MAC = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
const CANVAS_ADD_GRID = 28;
const CANVAS_ADD_PADDING = 16;
const CANVAS_ADD_MAX_DISTANCE = 700;
const CANVAS_ADD_GROUP_HEADER = 52;
const CANVAS_ADD_PROCESS_SIZE = typeof informationNoteSize === 'function'
  ? informationNoteSize({ type: 'process' })
  : { w: 184, h: 88 };

let canvasAddEventsBound = false;
let canvasAddPrimaryHeld = false;
let canvasAddFreeHeld = false;
let canvasAddLastPointer = null;
let canvasAddPreviewFrame = null;
let canvasAddPlacementCache = null;

function canvasAddPrimaryFromEvent(event) {
  return CANVAS_ADD_IS_MAC ? event.metaKey : event.ctrlKey;
}

function canvasAddModeAvailable() {
  return typeof currentFlowMode !== 'function' || currentFlowMode() === 'build';
}

function canvasAddInteractiveTarget(target) {
  return target instanceof Element && Boolean(target.closest(
    '.sticky-note,.v12-draft-node,.group-header,.phase-title,.edge-hit,.edge-endpoint,' +
    '.connector-handle,.flow-grow-controls,button,input,textarea,select,[contenteditable="true"],' +
    '#connection-drop-zones,#connection-drop-ghost,#multi-selection-toolbar,#flow-focus-toolbar'
  ));
}

function canvasAddBlankTarget(target) {
  return target instanceof Element && els.stage.contains(target) && !canvasAddInteractiveTarget(target);
}

function canvasAddPointInside(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function canvasAddCollapsedGroupAt(x, y) {
  return state.groups.find((group) => {
    if (!group.collapsed) return false;
    const bounds = typeof groupWorkflowDisplayBounds === 'function'
      ? groupWorkflowDisplayBounds(group)
      : { x: group.x, y: group.y, w: Math.min(group.w, 360), h: 52 };
    return canvasAddPointInside(bounds, x, y);
  }) || null;
}

function canvasAddRectOverlap(a, b, padding = 0) {
  return a.x < b.x + b.w + padding &&
    a.x + a.w > b.x - padding &&
    a.y < b.y + b.h + padding &&
    a.y + a.h > b.y - padding;
}

function canvasAddCanonicalNoteSize(item) {
  if (typeof informationNoteSize === 'function') return informationNoteSize(item);
  return { w: item.w || 224, h: item.h || 116 };
}

function canvasAddCandidateRect(x, y) {
  return { x, y, w: CANVAS_ADD_PROCESS_SIZE.w, h: CANVAS_ADD_PROCESS_SIZE.h };
}

function canvasAddContextAt(worldPoint) {
  const collapsedGroup = canvasAddCollapsedGroupAt(worldPoint.x, worldPoint.y);
  if (collapsedGroup) return { collapsedGroup, group: null, phase: null };
  const group = findGroupAt(worldPoint.x, worldPoint.y) || null;
  const phase = group ? getPhase(group.phaseId) : findPhaseAt(worldPoint.x, worldPoint.y) || null;
  return { collapsedGroup: null, group, phase };
}

function canvasAddWithinContext(rect, context) {
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > WORLD.width || rect.y + rect.h > WORLD.height) return false;

  if (context.group) {
    const group = context.group;
    return rect.x >= group.x + 14 &&
      rect.y >= group.y + CANVAS_ADD_GROUP_HEADER + 8 &&
      rect.x + rect.w <= group.x + group.w - 14 &&
      rect.y + rect.h <= group.y + group.h - 14;
  }

  if (context.phase) {
    const phase = context.phase;
    if (rect.x < phase.x + 12 || rect.y < phase.y + 42 || rect.x + rect.w > phase.x + phase.w - 12 || rect.y + rect.h > phase.y + phase.h - 12) return false;
  }

  return true;
}

function canvasAddObstacles(context) {
  const notes = state.notes
    .filter((item) => !getGroup(item.groupId)?.collapsed)
    .map((item) => {
      const size = canvasAddCanonicalNoteSize(item);
      return { x: item.x, y: item.y, w: size.w, h: size.h, kind: 'note' };
    });

  const groups = state.groups.flatMap((group) => {
    if (context.group?.id === group.id) return [];
    const bounds = group.collapsed && typeof groupWorkflowDisplayBounds === 'function'
      ? groupWorkflowDisplayBounds(group)
      : { x: group.x, y: group.y, w: group.w, h: group.h };
    return [{ ...bounds, kind: 'group' }];
  });

  return [...notes, ...groups];
}

function canvasAddCandidateAvailable(rect, context, obstacles) {
  if (!canvasAddWithinContext(rect, context)) return false;
  return !obstacles.some((obstacle) => canvasAddRectOverlap(rect, obstacle, CANVAS_ADD_PADDING));
}

function canvasAddDirectionRank(dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 0 : 2;
  return dy >= 0 ? 1 : 3;
}

const CANVAS_ADD_SEARCH_OFFSETS = (() => {
  const stepCount = Math.ceil(CANVAS_ADD_MAX_DISTANCE / CANVAS_ADD_GRID);
  const offsets = [];
  for (let gx = -stepCount; gx <= stepCount; gx += 1) {
    for (let gy = -stepCount; gy <= stepCount; gy += 1) {
      if (!gx && !gy) continue;
      const dx = gx * CANVAS_ADD_GRID;
      const dy = gy * CANVAS_ADD_GRID;
      const distance = Math.hypot(dx, dy);
      if (distance > CANVAS_ADD_MAX_DISTANCE) continue;
      offsets.push({ dx, dy, distance, rank: canvasAddDirectionRank(dx, dy) });
    }
  }
  offsets.sort((a, b) => a.distance - b.distance || a.rank - b.rank || Math.abs(a.dy) - Math.abs(b.dy) || Math.abs(a.dx) - Math.abs(b.dx));
  return offsets;
})();

function canvasAddBasePosition(worldPoint, freePlacement) {
  let x = worldPoint.x - CANVAS_ADD_PROCESS_SIZE.w / 2;
  let y = worldPoint.y - CANVAS_ADD_PROCESS_SIZE.h / 2;
  if (!freePlacement) {
    x = Math.round(x / CANVAS_ADD_GRID) * CANVAS_ADD_GRID;
    y = Math.round(y / CANVAS_ADD_GRID) * CANVAS_ADD_GRID;
  }
  return {
    x: clamp(x, 0, WORLD.width - CANVAS_ADD_PROCESS_SIZE.w),
    y: clamp(y, 0, WORLD.height - CANVAS_ADD_PROCESS_SIZE.h)
  };
}

function canvasAddResolvePlacement(clientX, clientY, freePlacement = canvasAddFreeHeld) {
  const worldPoint = screenToWorld(clientX, clientY);
  const context = canvasAddContextAt(worldPoint);
  const base = canvasAddBasePosition(worldPoint, freePlacement);
  if (context.collapsedGroup) {
    return { available: false, reason: 'collapsed', x: base.x, y: base.y, baseX: base.x, baseY: base.y, worldPoint, context, adjusted: false };
  }

  const obstacles = canvasAddObstacles(context);
  const baseRect = canvasAddCandidateRect(base.x, base.y);
  if (canvasAddCandidateAvailable(baseRect, context, obstacles)) {
    return { available: true, x: base.x, y: base.y, baseX: base.x, baseY: base.y, worldPoint, context, adjusted: false };
  }

  for (const offset of CANVAS_ADD_SEARCH_OFFSETS) {
    const x = base.x + offset.dx;
    const y = base.y + offset.dy;
    const rect = canvasAddCandidateRect(x, y);
    if (!canvasAddCandidateAvailable(rect, context, obstacles)) continue;
    return { available: true, x, y, baseX: base.x, baseY: base.y, worldPoint, context, adjusted: true };
  }

  return { available: false, reason: 'full', x: base.x, y: base.y, baseX: base.x, baseY: base.y, worldPoint, context, adjusted: false };
}

function canvasAddRemovePreview() {
  document.getElementById('canvas-add-preview')?.remove();
  document.getElementById('canvas-add-guide')?.remove();
  document.getElementById('canvas-add-origin')?.remove();
  canvasAddPlacementCache = null;
}

function canvasAddGuideElement(placement) {
  const fromX = placement.baseX + CANVAS_ADD_PROCESS_SIZE.w / 2;
  const fromY = placement.baseY + CANVAS_ADD_PROCESS_SIZE.h / 2;
  const toX = placement.x + CANVAS_ADD_PROCESS_SIZE.w / 2;
  const toY = placement.y + CANVAS_ADD_PROCESS_SIZE.h / 2;
  const length = Math.hypot(toX - fromX, toY - fromY);
  const angle = Math.atan2(toY - fromY, toX - fromX) * 180 / Math.PI;
  const guide = document.createElement('div');
  guide.id = 'canvas-add-guide';
  guide.className = 'canvas-add-guide';
  Object.assign(guide.style, {
    left: `${fromX}px`,
    top: `${fromY}px`,
    width: `${length}px`,
    transform: `rotate(${angle}deg)`
  });
  const origin = document.createElement('span');
  origin.id = 'canvas-add-origin';
  origin.className = 'canvas-add-origin';
  Object.assign(origin.style, { left: `${fromX}px`, top: `${fromY}px` });
  els['node-layer'].append(guide, origin);
}

function canvasAddRenderPreview(placement) {
  canvasAddRemovePreview();
  canvasAddPlacementCache = placement;
  const preview = document.createElement('article');
  preview.id = 'canvas-add-preview';
  preview.className = `canvas-add-preview${placement.available ? '' : ' is-blocked'}${placement.adjusted ? ' is-adjusted' : ''}`;
  Object.assign(preview.style, {
    left: `${placement.x}px`,
    top: `${placement.y}px`,
    width: `${CANVAS_ADD_PROCESS_SIZE.w}px`,
    minHeight: `${CANVAS_ADD_PROCESS_SIZE.h}px`
  });
  const message = placement.available
    ? placement.adjusted ? '最寄りの空き位置' : '処理を追加'
    : placement.reason === 'collapsed' ? '囲みを展開してください' : '空き位置がありません';
  preview.innerHTML = `<span>▭ 処理</span><strong>${message}</strong><small>${CANVAS_ADD_IS_MAC ? '⌘クリック' : 'Ctrl＋クリック'}</small>`;
  if (placement.adjusted) canvasAddGuideElement(placement);
  els['node-layer'].append(preview);
}

function canvasAddPointerTarget() {
  if (!canvasAddLastPointer) return null;
  return document.elementFromPoint(canvasAddLastPointer.clientX, canvasAddLastPointer.clientY);
}

function canvasAddRefreshPreview() {
  canvasAddPreviewFrame = null;
  const active = canvasAddPrimaryHeld && canvasAddModeAvailable();
  els.board.classList.toggle('is-canvas-add-mode', active);
  canvasAddUpdateHint();
  if (!active || !canvasAddLastPointer || !canvasAddBlankTarget(canvasAddPointerTarget())) {
    canvasAddRemovePreview();
    return;
  }
  const placement = canvasAddResolvePlacement(canvasAddLastPointer.clientX, canvasAddLastPointer.clientY, canvasAddFreeHeld);
  canvasAddRenderPreview(placement);
}

function canvasAddSchedulePreview() {
  if (canvasAddPreviewFrame != null) return;
  canvasAddPreviewFrame = requestAnimationFrame(canvasAddRefreshPreview);
}

function canvasAddClearMode() {
  canvasAddPrimaryHeld = false;
  canvasAddFreeHeld = false;
  els.board.classList.remove('is-canvas-add-mode');
  if (canvasAddPreviewFrame != null) cancelAnimationFrame(canvasAddPreviewFrame);
  canvasAddPreviewFrame = null;
  canvasAddRemovePreview();
  canvasAddUpdateHint();
}

function canvasAddUpdateHint() {
  const hint = els['canvas-hint'];
  if (!hint) return;
  const primary = CANVAS_ADD_IS_MAC ? 'Cmd' : 'Ctrl';
  const free = CANVAS_ADD_IS_MAC ? 'Option' : 'Alt';
  hint.innerHTML = canvasAddPrimaryHeld && canvasAddModeAvailable()
    ? `<strong>クリックして処理を追加</strong>　・　${free}で自由配置　・　重なる場合は近い空き位置へ移動`
    : `<strong>ドラッグ</strong>で範囲選択　・　Space＋ドラッグで移動　・　${primary}＋クリックで処理を追加`;
}

function canvasAddInstallHelp() {
  const grid = els['help-dialog']?.querySelector('.shortcut-grid');
  if (!grid) return;
  [...grid.children].forEach((row) => {
    const key = row.querySelector('kbd')?.textContent.trim() || '';
    if (key === '空白をクリック' || key === '空白クリック') {
      row.querySelector('kbd').textContent = '空白クリック';
      const description = row.querySelector('span');
      if (description) description.textContent = '選択を解除。図形は追加しない';
    }
    if (key === '空白をドラッグ') {
      row.querySelector('kbd').textContent = 'Space＋ドラッグ';
      const description = row.querySelector('span');
      if (description) description.textContent = 'ボードを移動';
    }
  });
  if (!grid.querySelector('[data-shortcut="canvas-add"]')) {
    const add = document.createElement('div');
    add.dataset.shortcut = 'canvas-add';
    add.innerHTML = `<kbd>${CANVAS_ADD_IS_MAC ? 'Cmd' : 'Ctrl'}＋空白クリック</kbd><span>その位置へ処理を追加し、すぐタイトル入力</span>`;
    grid.append(add);
    const free = document.createElement('div');
    free.dataset.shortcut = 'canvas-add-free';
    free.innerHTML = `<kbd>${CANVAS_ADD_IS_MAC ? 'Cmd＋Option' : 'Ctrl＋Alt'}＋クリック</kbd><span>方眼に吸着せず自由配置</span>`;
    grid.append(free);
  }
}

function canvasAddCommit(placement) {
  if (!placement?.available) {
    toast(placement?.reason === 'collapsed'
      ? '囲みを展開してから工程を追加してください'
      : 'この付近に空き位置がありません');
    return false;
  }
  if (typeof stopFlowPlayback === 'function') stopFlowPlayback({ keepFocus: false, render: false });
  if (typeof selectedNoteIds !== 'undefined') selectedNoteIds.clear();
  addNoteMutation(placement.x, placement.y, {
    title: '新しい処理',
    type: 'process',
    label: 'キャンバスに処理を追加'
  });
  return true;
}

const beginPanBeforeCanvasAdd = beginPan;
beginPan = function beginPanCanvasAdd(event) {
  const blank = canvasAddBlankTarget(event.target);
  const addShortcut = event.button === 0 && event.pointerType !== 'touch' && blank && canvasAddModeAvailable() && canvasAddPrimaryFromEvent(event) && !spaceHeld;
  if (addShortcut) {
    v12CancelDraft();
    canvasAddLastPointer = { clientX: event.clientX, clientY: event.clientY };
    const placement = canvasAddResolvePlacement(event.clientX, event.clientY, event.altKey);
    event.preventDefault();
    if (typeof suppressClickAfterPan === 'function') suppressClickAfterPan();
    canvasAddCommit(placement);
    canvasAddSchedulePreview();
    return true;
  }

  const handled = beginPanBeforeCanvasAdd(event);
  if (handled && drag?.type === 'pan' && drag.createOnClick) {
    drag.createOnClick = false;
    drag.canvasClearOnClick = true;
  }
  return handled;
};

const handlePointerUpBeforeCanvasAdd = handlePointerUp;
handlePointerUp = function handlePointerUpCanvasAdd(event) {
  const pending = drag;
  if (pending?.type === 'pan' && pending.canvasClearOnClick) {
    const moved = pending.moved;
    handlePointerUpBeforeCanvasAdd(event);
    if (!moved) clearSelection();
    return;
  }
  return handlePointerUpBeforeCanvasAdd(event);
};

const renderNotesBeforeCanvasAdd = renderNotes;
renderNotes = function renderNotesCanvasAdd() {
  renderNotesBeforeCanvasAdd();
  canvasAddUpdateHint();
  if (canvasAddPrimaryHeld) canvasAddSchedulePreview();
};

const updateFlowExperienceUiBeforeCanvasAdd = updateFlowExperienceUi;
updateFlowExperienceUi = function updateFlowExperienceUiCanvasAdd() {
  updateFlowExperienceUiBeforeCanvasAdd();
  const badge = document.querySelector('.version-badge');
  if (badge) badge.textContent = 'v0.16.0';
  canvasAddUpdateHint();
};

function bindCanvasAddEvents() {
  if (canvasAddEventsBound) return;
  canvasAddEventsBound = true;
  canvasAddInstallHelp();
  canvasAddUpdateHint();

  document.addEventListener('pointermove', (event) => {
    canvasAddLastPointer = { clientX: event.clientX, clientY: event.clientY };
    if (canvasAddPrimaryHeld) canvasAddSchedulePreview();
  }, { passive: true });

  document.addEventListener('keydown', (event) => {
    if (event.target instanceof Element && event.target.matches('input,textarea,select,[contenteditable="true"]')) return;
    const primary = canvasAddPrimaryFromEvent(event);
    const free = event.altKey;
    if (primary === canvasAddPrimaryHeld && free === canvasAddFreeHeld) return;
    canvasAddPrimaryHeld = primary;
    canvasAddFreeHeld = free;
    canvasAddSchedulePreview();
  }, true);

  document.addEventListener('keyup', (event) => {
    const primary = canvasAddPrimaryFromEvent(event);
    const free = event.altKey;
    if (primary === canvasAddPrimaryHeld && free === canvasAddFreeHeld) return;
    canvasAddPrimaryHeld = primary;
    canvasAddFreeHeld = free;
    canvasAddSchedulePreview();
  }, true);

  els.stage.addEventListener('pointerleave', () => {
    if (!canvasAddPrimaryHeld) return;
    canvasAddRemovePreview();
  });
  els.stage.addEventListener('pointerenter', (event) => {
    canvasAddLastPointer = { clientX: event.clientX, clientY: event.clientY };
    if (canvasAddPrimaryHeld) canvasAddSchedulePreview();
  });
  window.addEventListener('blur', canvasAddClearMode);
  document.addEventListener('visibilitychange', () => { if (document.hidden) canvasAddClearMode(); });
}

const bindEventsBeforeCanvasAdd = bindEvents;
bindEvents = function bindEventsCanvasAdd() {
  bindEventsBeforeCanvasAdd();
  bindCanvasAddEvents();
};
