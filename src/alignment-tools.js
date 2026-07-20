/* Flowmap v0.18.0 — PowerPoint-style alignment, distribution, sizing and multi-drag */
const ALIGNMENT_MIN_SIZE = {
  process: { w: 120, h: 58 },
  decision: { w: 120, h: 82 },
  terminal: { w: 110, h: 54 },
  input: { w: 126, h: 60 },
  document: { w: 126, h: 68 }
};

let alignmentState = {
  mode: 'selection',
  panelOpen: false
};
let alignmentEventsBound = false;
let alignmentNudgeSession = null;
let alignmentNudgeTimer = null;

function alignmentDefaultSize(item) {
  if (typeof informationNoteSize === 'function') return informationNoteSize(item);
  return { w: Number(item?.w) || 224, h: Number(item?.h) || 116 };
}

function alignmentMinimumSize(item) {
  return ALIGNMENT_MIN_SIZE[item?.type] || ALIGNMENT_MIN_SIZE.process;
}

function alignmentResolvedSize(item) {
  const fallback = alignmentDefaultSize(item);
  const minimum = alignmentMinimumSize(item);
  const width = Number(item?.customWidth);
  const height = Number(item?.customHeight);
  return {
    w: Math.max(minimum.w, Number.isFinite(width) && width > 0 ? width : fallback.w),
    h: Math.max(minimum.h, Number.isFinite(height) && height > 0 ? height : fallback.h)
  };
}

const alignmentNormalizeBefore = normalizeFlowchartState;
normalizeFlowchartState = function normalizeAlignmentState(next) {
  const normalized = alignmentNormalizeBefore(next);
  if (!normalized?.notes) return normalized;
  normalized.notes.forEach((item) => {
    const minimum = alignmentMinimumSize(item);
    const width = Number(item.customWidth);
    const height = Number(item.customHeight);
    item.customWidth = Number.isFinite(width) && width > 0 ? Math.max(minimum.w, width) : null;
    item.customHeight = Number.isFinite(height) && height > 0 ? Math.max(minimum.h, height) : null;
    const size = alignmentResolvedSize(item);
    item.w = size.w;
    item.h = size.h;
  });
  return normalized;
};

const alignmentNoteFactoryBefore = note;
note = function alignmentNoteFactory(id, title, x, y, phaseId, groupId, extra = {}) {
  const item = alignmentNoteFactoryBefore(id, title, x, y, phaseId, groupId, extra);
  const extraWidth = Number(extra.customWidth);
  const extraHeight = Number(extra.customHeight);
  item.customWidth = Number.isFinite(extraWidth) && extraWidth > 0 ? extraWidth : null;
  item.customHeight = Number.isFinite(extraHeight) && extraHeight > 0 ? extraHeight : null;
  const size = alignmentResolvedSize(item);
  item.w = size.w;
  item.h = size.h;
  return item;
};

const noteDisplaySizeBeforeAlignment = noteDisplaySize;
noteDisplaySize = function alignmentNoteDisplaySize(item) {
  if (!item) return noteDisplaySizeBeforeAlignment(item);
  if (state.viewport.scale < .46 && !isSelected('note', item.id) && !item.customWidth && !item.customHeight) {
    return noteDisplaySizeBeforeAlignment(item);
  }
  return alignmentResolvedSize(item);
};

function alignmentSelectedIds() {
  return typeof validSelectedNoteIds === 'function' ? validSelectedNoteIds() : [];
}

function alignmentSelectedItems() {
  return alignmentSelectedIds().map((id) => getNote(id)).filter(Boolean);
}

function alignmentPrimaryItem(items = alignmentSelectedItems()) {
  const selectedPrimary = selection.type === 'note' ? getNote(selection.id) : null;
  return selectedPrimary && items.some((item) => item.id === selectedPrimary.id)
    ? selectedPrimary
    : items.at(-1) || null;
}

function alignmentItemRect(item) {
  const size = alignmentResolvedSize(item);
  return {
    id: item.id,
    item,
    x: item.x,
    y: item.y,
    w: size.w,
    h: size.h,
    right: item.x + size.w,
    bottom: item.y + size.h,
    centerX: item.x + size.w / 2,
    centerY: item.y + size.h / 2
  };
}

function alignmentBounds(items) {
  const rects = items.map(alignmentItemRect);
  if (!rects.length) return null;
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.right));
  const maxY = Math.max(...rects.map((rect) => rect.bottom));
  return {
    minX,
    minY,
    maxX,
    maxY,
    w: maxX - minX,
    h: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2
  };
}

function alignmentConstrainItems(items) {
  const bounds = alignmentBounds(items);
  if (!bounds) return;
  let dx = 0;
  let dy = 0;
  if (bounds.minX < 0) dx = -bounds.minX;
  else if (bounds.maxX > WORLD.width) dx = WORLD.width - bounds.maxX;
  if (bounds.minY < 0) dy = -bounds.minY;
  else if (bounds.maxY > WORLD.height) dy = WORLD.height - bounds.maxY;
  if (!dx && !dy) return;
  items.forEach((item) => {
    item.x += dx;
    item.y += dy;
  });
}

function alignmentReassignContainers(items) {
  items.forEach((item) => {
    const size = alignmentResolvedSize(item);
    const centerX = item.x + size.w / 2;
    const centerY = item.y + size.h / 2;
    const group = findGroupAt(centerX, centerY);
    const phase = group ? getPhase(group.phaseId) : findPhaseAt(centerX, centerY);
    item.groupId = group?.id || '';
    item.phaseId = group?.phaseId || phase?.id || '';
  });
}

function alignmentApplyPositionOperation(operation) {
  const items = alignmentSelectedItems();
  if (items.length < 2) return;
  const primary = alignmentPrimaryItem(items);
  const selectionBounds = alignmentBounds(items);
  const primaryRect = primary ? alignmentItemRect(primary) : null;
  const usePrimary = alignmentState.mode === 'primary' && primaryRect;
  const movingItems = usePrimary ? items.filter((item) => item.id !== primary.id) : items;

  const targets = {
    left: usePrimary ? primaryRect.x : selectionBounds.minX,
    centerX: usePrimary ? primaryRect.centerX : selectionBounds.centerX,
    right: usePrimary ? primaryRect.right : selectionBounds.maxX,
    top: usePrimary ? primaryRect.y : selectionBounds.minY,
    centerY: usePrimary ? primaryRect.centerY : selectionBounds.centerY,
    bottom: usePrimary ? primaryRect.bottom : selectionBounds.maxY
  };

  const labels = {
    left: '左揃え',
    centerX: '横中央揃え',
    right: '右揃え',
    top: '上揃え',
    centerY: '縦中央揃え',
    bottom: '下揃え'
  };

  mutate(labels[operation] || '図形を整列', () => {
    movingItems.forEach((item) => {
      const size = alignmentResolvedSize(item);
      if (operation === 'left') item.x = targets.left;
      if (operation === 'centerX') item.x = targets.centerX - size.w / 2;
      if (operation === 'right') item.x = targets.right - size.w;
      if (operation === 'top') item.y = targets.top;
      if (operation === 'centerY') item.y = targets.centerY - size.h / 2;
      if (operation === 'bottom') item.y = targets.bottom - size.h;
    });
    if (!usePrimary) alignmentConstrainItems(items);
    alignmentReassignContainers(items);
  });
}

function alignmentDistribute(axis) {
  const items = alignmentSelectedItems();
  if (items.length < 3) return toast('均等配置は3件以上で利用できます');
  const horizontal = axis === 'horizontal';
  const sorted = [...items].sort((a, b) => {
    const ar = alignmentItemRect(a);
    const br = alignmentItemRect(b);
    return horizontal ? ar.x - br.x : ar.y - br.y;
  });
  const first = alignmentItemRect(sorted[0]);
  const last = alignmentItemRect(sorted.at(-1));
  const totalSize = sorted.reduce((sum, item) => {
    const size = alignmentResolvedSize(item);
    return sum + (horizontal ? size.w : size.h);
  }, 0);
  const span = horizontal ? last.right - first.x : last.bottom - first.y;
  const gap = (span - totalSize) / (sorted.length - 1);

  mutate(horizontal ? '横方向に均等配置' : '縦方向に均等配置', () => {
    let cursor = horizontal ? first.x : first.y;
    sorted.forEach((item, index) => {
      const size = alignmentResolvedSize(item);
      if (index > 0 && index < sorted.length - 1) {
        if (horizontal) item.x = cursor;
        else item.y = cursor;
      }
      cursor += (horizontal ? size.w : size.h) + gap;
    });
    alignmentConstrainItems(items);
    alignmentReassignContainers(items);
  });
}

function alignmentTargetSize(items, dimension) {
  const primary = alignmentPrimaryItem(items);
  if (alignmentState.mode === 'primary' && primary) {
    return alignmentResolvedSize(primary)[dimension];
  }
  return Math.max(...items.map((item) => alignmentResolvedSize(item)[dimension]));
}

function alignmentUnifySize(mode) {
  const items = alignmentSelectedItems();
  if (items.length < 2) return;
  const targetWidth = alignmentTargetSize(items, 'w');
  const targetHeight = alignmentTargetSize(items, 'h');
  const labels = {
    width: '幅を揃える',
    height: '高さを揃える',
    both: '大きさを揃える'
  };

  mutate(labels[mode], () => {
    items.forEach((item) => {
      const before = alignmentResolvedSize(item);
      const centerX = item.x + before.w / 2;
      const centerY = item.y + before.h / 2;
      const minimum = alignmentMinimumSize(item);
      const nextWidth = mode === 'height' ? before.w : Math.max(minimum.w, targetWidth);
      const nextHeight = mode === 'width' ? before.h : Math.max(minimum.h, targetHeight);
      item.customWidth = nextWidth;
      item.customHeight = nextHeight;
      item.w = nextWidth;
      item.h = nextHeight;
      item.x = centerX - nextWidth / 2;
      item.y = centerY - nextHeight / 2;
    });
    if (alignmentState.mode !== 'primary') alignmentConstrainItems(items);
  });
}

function alignmentInstallUi() {
  const toolbar = document.getElementById('multi-selection-toolbar');
  if (!toolbar) return;

  if (!toolbar.querySelector('[data-open-alignment]')) {
    const button = document.createElement('button');
    button.className = 'multi-align-button';
    button.type = 'button';
    button.dataset.openAlignment = '';
    button.setAttribute('aria-expanded', 'false');
    button.textContent = '整列・配置';
    const group = toolbar.querySelector('[data-group-selected]');
    if (group) toolbar.insertBefore(button, group); else toolbar.append(button);
  }

  if (!document.getElementById('alignment-panel')) {
    const panel = document.createElement('section');
    panel.id = 'alignment-panel';
    panel.className = 'alignment-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', '整列と配置');
    panel.innerHTML = `
      <header><strong>整列・配置</strong><span>選択した工程だけを調整</span></header>
      <div class="alignment-section">
        <span class="alignment-section-title">基準</span>
        <div class="alignment-mode-switch" role="radiogroup" aria-label="整列基準">
          <button type="button" data-alignment-mode="selection" role="radio">選択範囲</button>
          <button type="button" data-alignment-mode="primary" role="radio">最後の図形を固定</button>
        </div>
      </div>
      <div class="alignment-section">
        <span class="alignment-section-title">整列</span>
        <div class="alignment-grid alignment-grid-six">
          <button type="button" data-align="left" title="左揃え"><b>↤</b><span>左</span></button>
          <button type="button" data-align="centerX" title="横中央揃え"><b>↔</b><span>横中央</span></button>
          <button type="button" data-align="right" title="右揃え"><b>↦</b><span>右</span></button>
          <button type="button" data-align="top" title="上揃え"><b>↥</b><span>上</span></button>
          <button type="button" data-align="centerY" title="縦中央揃え"><b>↕</b><span>縦中央</span></button>
          <button type="button" data-align="bottom" title="下揃え"><b>↧</b><span>下</span></button>
        </div>
      </div>
      <div class="alignment-section">
        <span class="alignment-section-title">均等配置</span>
        <div class="alignment-grid alignment-grid-two">
          <button type="button" data-distribute="horizontal"><b>⇹</b><span>横方向</span></button>
          <button type="button" data-distribute="vertical"><b>⇳</b><span>縦方向</span></button>
        </div>
        <small>両端の図形を固定して、図形間の余白を揃えます</small>
      </div>
      <div class="alignment-section">
        <span class="alignment-section-title">サイズ</span>
        <div class="alignment-grid alignment-grid-three">
          <button type="button" data-size="width"><b>↔</b><span>同じ幅</span></button>
          <button type="button" data-size="height"><b>↕</b><span>同じ高さ</span></button>
          <button type="button" data-size="both"><b>□</b><span>同じ大きさ</span></button>
        </div>
      </div>`;
    toolbar.append(panel);
  }
}

function alignmentClosePanel() {
  alignmentState.panelOpen = false;
  alignmentUpdateUi();
}

function alignmentUpdateUi() {
  alignmentInstallUi();
  const ids = alignmentSelectedIds();
  const panel = document.getElementById('alignment-panel');
  const opener = document.querySelector('[data-open-alignment]');
  if (ids.length < 2) {
    alignmentState.panelOpen = false;
    alignmentState.mode = 'selection';
  }
  if (panel) panel.hidden = !alignmentState.panelOpen || ids.length < 2;
  if (opener) {
    opener.setAttribute('aria-expanded', String(alignmentState.panelOpen && ids.length >= 2));
    opener.classList.toggle('is-active', alignmentState.panelOpen && ids.length >= 2);
  }
  document.querySelectorAll('[data-alignment-mode]').forEach((button) => {
    const active = button.dataset.alignmentMode === alignmentState.mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-checked', String(active));
  });
  document.querySelectorAll('[data-distribute]').forEach((button) => {
    button.disabled = ids.length < 3;
  });
  $$('.sticky-note', els['node-layer']).forEach((card) => {
    const isAnchor = alignmentState.mode === 'primary' && ids.length > 1 && card.dataset.noteId === selection.id;
    card.classList.toggle('is-alignment-anchor', isAnchor);
  });
}

function alignmentApplyRenderedSizes() {
  state.notes.forEach((item) => {
    const card = els['node-layer']?.querySelector(`[data-note-id="${item.id}"]`);
    if (!card) return;
    const size = alignmentResolvedSize(item);
    card.style.width = `${size.w}px`;
    card.style.height = `${size.h}px`;
    card.style.minHeight = `${size.h}px`;
    card.classList.toggle('has-custom-size', Boolean(item.customWidth || item.customHeight));
  });
}

const renderNotesBeforeAlignment = renderNotes;
renderNotes = function renderNotesAlignment() {
  renderNotesBeforeAlignment();
  alignmentApplyRenderedSizes();
  alignmentUpdateUi();
};

const clearSelectionBeforeAlignment = clearSelection;
clearSelection = function clearSelectionAlignment() {
  alignmentState.panelOpen = false;
  alignmentState.mode = 'selection';
  alignmentNudgeSession = null;
  clearTimeout(alignmentNudgeTimer);
  return clearSelectionBeforeAlignment();
};

const beginNodeDragBeforeAlignment = beginNodeDrag;
beginNodeDrag = function beginNodeDragAlignment(event, noteId) {
  const ids = alignmentSelectedIds();
  if (event.button === 0 && !event.shiftKey && ids.length > 1 && ids.includes(noteId)) {
    const point = screenToWorld(event.clientX, event.clientY);
    drag = {
      type: 'multi-note',
      id: noteId,
      startX: point.x,
      startY: point.y,
      before: snapshot(),
      moved: false,
      noteOrigins: ids.map((id) => {
        const item = getNote(id);
        return { id, x: item.x, y: item.y, size: alignmentResolvedSize(item) };
      })
    };
    closeQuickPopover();
    event.preventDefault();
    return;
  }
  return beginNodeDragBeforeAlignment(event, noteId);
};

const handlePointerMoveBeforeAlignment = handlePointerMove;
handlePointerMove = function handlePointerMoveAlignment(event) {
  if (drag?.type !== 'multi-note') return handlePointerMoveBeforeAlignment(event);
  const point = screenToWorld(event.clientX, event.clientY);
  const rawDx = point.x - drag.startX;
  const rawDy = point.y - drag.startY;
  drag.moved ||= Math.hypot(rawDx, rawDy) > 3;
  if (!drag.moved) return;

  const minX = Math.min(...drag.noteOrigins.map((origin) => origin.x));
  const minY = Math.min(...drag.noteOrigins.map((origin) => origin.y));
  const maxX = Math.max(...drag.noteOrigins.map((origin) => origin.x + origin.size.w));
  const maxY = Math.max(...drag.noteOrigins.map((origin) => origin.y + origin.size.h));
  const dx = clamp(rawDx, -minX, WORLD.width - maxX);
  const dy = clamp(rawDy, -minY, WORLD.height - maxY);

  drag.noteOrigins.forEach((origin) => {
    const item = getNote(origin.id);
    if (!item) return;
    item.x = origin.x + dx;
    item.y = origin.y + dy;
    const card = els['node-layer']?.querySelector(`[data-note-id="${origin.id}"]`);
    if (card) {
      card.style.left = `${item.x}px`;
      card.style.top = `${item.y}px`;
    }
  });
  renderEdges();
  renderMinimap();
};

const handlePointerUpBeforeAlignment = handlePointerUp;
handlePointerUp = function handlePointerUpAlignment(event) {
  if (drag?.type !== 'multi-note') return handlePointerUpBeforeAlignment(event);
  const finished = drag;
  drag = null;
  if (!finished.moved) return renderAll();
  if (typeof suppressClickAfterPan === 'function') suppressClickAfterPan();
  undoStack.push(finished.before);
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
  const items = finished.noteOrigins.map((origin) => getNote(origin.id)).filter(Boolean);
  alignmentReassignContainers(items);
  recordActivity(`${items.length}件の工程を移動`);
  saveState();
  renderAll();
};

function alignmentNudge(direction, amount) {
  const items = alignmentSelectedItems();
  if (items.length < 2) return false;
  const key = `${alignmentSelectedIds().join('|')}:${direction}`;
  if (!alignmentNudgeSession || alignmentNudgeSession.key !== key) {
    undoStack.push(snapshot());
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
    alignmentNudgeSession = { key };
    recordActivity(`${items.length}件の工程を微調整`);
  }
  clearTimeout(alignmentNudgeTimer);
  alignmentNudgeTimer = setTimeout(() => { alignmentNudgeSession = null; }, 360);

  const delta = {
    ArrowLeft: { x: -amount, y: 0 },
    ArrowRight: { x: amount, y: 0 },
    ArrowUp: { x: 0, y: -amount },
    ArrowDown: { x: 0, y: amount }
  }[direction];
  if (!delta) return false;
  items.forEach((item) => {
    item.x += delta.x;
    item.y += delta.y;
  });
  alignmentConstrainItems(items);
  alignmentReassignContainers(items);
  saveState();
  renderAll();
  return true;
}

const handleKeyDownBeforeAlignment = handleKeyDown;
handleKeyDown = function handleKeyDownAlignment(event) {
  const typing = event.target instanceof Element && event.target.matches('input,textarea,select,[contenteditable="true"]');
  if (!typing && alignmentSelectedIds().length > 1 && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault();
    event.stopPropagation();
    alignmentNudge(event.key, event.shiftKey ? 10 : 1);
    return;
  }
  if (!typing && event.key === 'Escape' && alignmentState.panelOpen) {
    event.preventDefault();
    event.stopPropagation();
    alignmentClosePanel();
    return;
  }
  return handleKeyDownBeforeAlignment(event);
};

function alignmentInstallHelp() {
  const grid = els['help-dialog']?.querySelector('.shortcut-grid');
  if (!grid) return;
  if (![...grid.querySelectorAll('kbd')].some((item) => item.textContent.includes('整列・配置'))) {
    const row = document.createElement('div');
    row.dataset.shortcut = 'alignment-tools';
    row.innerHTML = '<kbd>複数選択 → 整列・配置</kbd><span>端・中央揃え、均等配置、幅と高さの統一</span>';
    grid.append(row);
  }
  if (![...grid.querySelectorAll('kbd')].some((item) => item.textContent === '矢印キー')) {
    const row = document.createElement('div');
    row.dataset.shortcut = 'multi-nudge';
    row.innerHTML = '<kbd>矢印キー</kbd><span>複数選択を1px移動。Shiftを押すと10px</span>';
    grid.append(row);
  }
}

function bindAlignmentEvents() {
  if (alignmentEventsBound) return;
  alignmentEventsBound = true;
  alignmentInstallUi();
  alignmentInstallHelp();

  const toolbar = document.getElementById('multi-selection-toolbar');
  toolbar?.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-open-alignment]');
    if (opener) {
      event.preventDefault();
      event.stopPropagation();
      alignmentState.panelOpen = !alignmentState.panelOpen;
      alignmentUpdateUi();
      return;
    }
    const mode = event.target.closest('[data-alignment-mode]');
    if (mode) {
      alignmentState.mode = mode.dataset.alignmentMode === 'primary' ? 'primary' : 'selection';
      alignmentUpdateUi();
      return;
    }
    const align = event.target.closest('[data-align]');
    if (align) return alignmentApplyPositionOperation(align.dataset.align);
    const distribute = event.target.closest('[data-distribute]');
    if (distribute) return alignmentDistribute(distribute.dataset.distribute);
    const size = event.target.closest('[data-size]');
    if (size) return alignmentUnifySize(size.dataset.size);
  });

  document.addEventListener('pointerdown', (event) => {
    if (!alignmentState.panelOpen) return;
    if (event.target.closest('#alignment-panel,[data-open-alignment]')) return;
    alignmentClosePanel();
  }, true);
}

const updateFlowExperienceUiBeforeAlignment = updateFlowExperienceUi;
updateFlowExperienceUi = function updateFlowExperienceUiAlignment() {
  updateFlowExperienceUiBeforeAlignment();
  const badge = document.querySelector('.version-badge');
  if (badge) badge.textContent = 'v0.18.0';
  alignmentInstallUi();
  alignmentUpdateUi();
};

const bindEventsBeforeAlignment = bindEvents;
bindEvents = function bindEventsAlignment() {
  bindEventsBeforeAlignment();
  bindAlignmentEvents();
};
