/* Flowmap v0.22.0 — visible phase/group controls and direct manipulation */
let containerGesture = null;
let containerControlsBound = false;

function containerControlsEditable() {
  return typeof currentFlowMode !== 'function' || currentFlowMode() === 'build';
}

function containerActionButton(type, id, action, label, title = '') {
  return `<button type="button" data-container-action="${action}" data-container-type="${type}" data-container-id="${id}"${title ? ` title="${esc(title)}"` : ''}>${label}</button>`;
}

function containerInstallHandles(element, type, id) {
  ['nw', 'ne', 'se', 'sw'].forEach((corner) => {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = `container-resize-handle handle-${corner}`;
    handle.dataset.containerResize = corner;
    handle.dataset.containerType = type;
    handle.dataset.containerId = id;
    handle.title = `${containerLabel(type)}のサイズを変更`;
    handle.setAttribute('aria-label', `${containerLabel(type)}の${corner}角でサイズ変更`);
    element.append(handle);
  });
  const badge = document.createElement('span');
  badge.className = 'container-size-badge';
  badge.dataset.containerSizeBadge = `${type}:${id}`;
  const item = containerGet(type, id);
  badge.textContent = `${Math.round(item.w)} × ${Math.round(containerDisplayHeight(type, item))}`;
  element.append(badge);
}

function containerEnhancePhase(element, phase) {
  const title = element.querySelector('.phase-title');
  if (title) {
    title.classList.add('phase-interaction-header');
    title.dataset.dragPhase = phase.id;
    title.title = 'ドラッグしてフェーズと中身をまとめて移動';
    title.innerHTML = `<span class="container-kind-badge">フェーズ</span><strong>${esc(phase.title)}</strong><small>ここをドラッグして移動</small>`;
  }
  if (!isSelected('phase', phase.id) || !containerControlsEditable()) return;
  element.insertAdjacentHTML('beforeend', `<div class="container-selected-label">選択中</div><div class="container-action-bar phase-actions">
    ${containerActionButton('phase', phase.id, 'rename', '名前')}
    ${containerActionButton('phase', phase.id, 'fit', '内容に合わせる')}
    ${containerActionButton('phase', phase.id, 'focus', 'この範囲を見る')}
  </div>`);
  containerInstallHandles(element, 'phase', phase.id);
}

function containerEnhanceGroup(element, group) {
  const header = element.querySelector('.group-header');
  if (header && !header.querySelector('.container-drag-hint')) {
    header.insertAdjacentHTML('afterbegin', '<span class="container-drag-hint" aria-hidden="true">⠿</span>');
    header.title = 'ヘッダーをドラッグすると、中の付箋ごと移動します';
  }
  if (!isSelected('group', group.id) || !containerControlsEditable()) return;
  element.insertAdjacentHTML('beforeend', `<div class="container-selected-label">選択中</div><div class="container-action-bar group-actions">
    ${containerActionButton('group', group.id, 'rename', '名前')}
    ${containerActionButton('group', group.id, 'color', '色')}
    ${containerActionButton('group', group.id, 'collapse', group.collapsed ? '展開' : '折りたたむ')}
    ${containerActionButton('group', group.id, 'list', '中身')}
    ${containerActionButton('group', group.id, 'fit', '内容に合わせる')}
    ${containerActionButton('group', group.id, 'release', '囲みだけ解除')}
  </div>`);
  if (!group.collapsed) containerInstallHandles(element, 'group', group.id);
}

const renderPhasesBeforeContainerControls = renderPhases;
renderPhases = function renderPhasesContainerControls() {
  renderPhasesBeforeContainerControls();
  state.phases.forEach((phase) => {
    const element = els['phase-layer']?.querySelector(`[data-phase-id="${phase.id}"]`);
    if (element) containerEnhancePhase(element, phase);
  });
};

const renderGroupsBeforeContainerControls = renderGroups;
renderGroups = function renderGroupsContainerControls() {
  renderGroupsBeforeContainerControls();
  state.groups.forEach((group) => {
    const element = els['group-layer']?.querySelector(`[data-group-id="${group.id}"]`);
    if (element) containerEnhanceGroup(element, group);
  });
};

function containerApplySelectionContext() {
  const phaseId = selection.type === 'phase' ? selection.id : '';
  const groupId = selection.type === 'group' ? selection.id : '';
  els.board?.classList.toggle('has-selected-phase', Boolean(phaseId));
  els.board?.classList.toggle('has-selected-group', Boolean(groupId));
  state.notes.forEach((item) => {
    const card = els['node-layer']?.querySelector(`[data-note-id="${item.id}"]`);
    if (!card) return;
    card.classList.toggle('is-in-selected-phase', Boolean(phaseId && item.phaseId === phaseId));
    card.classList.toggle('is-in-selected-group', Boolean(groupId && item.groupId === groupId));
  });
}

const renderNotesBeforeContainerControls = renderNotes;
renderNotes = function renderNotesContainerControls() {
  const result = renderNotesBeforeContainerControls();
  containerApplySelectionContext();
  return result;
};

function containerSelectForGesture(type, id) {
  if (selection.type === type && selection.id === id) return;
  selection = { type, id };
  state.settings ||= {};
  state.settings.workPanelTab = 'selection';
  state.settings.navigatorOpen = true;
  state.settings.inspectorOpen = false;
  if (typeof selectedNoteIds !== 'undefined') selectedNoteIds.clear();
  renderAll();
}

function containerBeginResize(event, handle) {
  if (!containerControlsEditable() || event.button !== 0) return;
  const type = handle.dataset.containerType;
  const id = handle.dataset.containerId;
  const item = containerGet(type, id);
  if (!item || (type === 'group' && item.collapsed)) return;
  containerSelectForGesture(type, id);
  const point = screenToWorld(event.clientX, event.clientY);
  containerGesture = {
    kind: 'resize', type, id, corner: handle.dataset.containerResize,
    pointerId: event.pointerId, start: point,
    original: { x: item.x, y: item.y, w: item.w, h: item.h },
    before: snapshot(), moved: false
  };
  document.body.classList.add('is-container-resizing');
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function containerBeginPhaseMove(event, header) {
  if (!containerControlsEditable() || event.button !== 0 || event.target.closest('button')) return;
  const id = header.dataset.dragPhase;
  const phase = getPhase(id);
  if (!phase) return;
  containerSelectForGesture('phase', id);
  const point = screenToWorld(event.clientX, event.clientY);
  const children = containerChildren('phase', id);
  containerGesture = {
    kind: 'phase-move', type: 'phase', id,
    pointerId: event.pointerId, start: point,
    original: { x: phase.x, y: phase.y },
    groupOrigins: children.groups.map((item) => ({ id: item.id, x: item.x, y: item.y })),
    noteOrigins: children.notes.map((item) => ({ id: item.id, x: item.x, y: item.y })),
    moveBounds: (() => {
      const objects = containerMovementObjects('phase', id);
      return {
        minX: Math.min(...objects.map((item) => item.x)),
        minY: Math.min(...objects.map((item) => item.y)),
        maxX: Math.max(...objects.map((item) => item.x + item.w)),
        maxY: Math.max(...objects.map((item) => item.y + item.h))
      };
    })(),
    before: snapshot(), moved: false
  };
  document.body.classList.add('is-container-moving');
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function containerUpdateGeometryDom(type, id) {
  const item = containerGet(type, id);
  const layer = type === 'phase' ? els['phase-layer'] : els['group-layer'];
  const element = layer?.querySelector(`[data-${type}-id="${id}"]`);
  if (!item || !element) return;
  element.style.left = `${item.x}px`;
  element.style.top = `${item.y}px`;
  element.style.width = `${item.w}px`;
  element.style.height = `${containerDisplayHeight(type, item)}px`;
  const badge = element.querySelector('.container-size-badge');
  if (badge) badge.textContent = `${Math.round(item.w)} × ${Math.round(containerDisplayHeight(type, item))}`;
}

function containerUpdateGesture(event) {
  if (!containerGesture || event.pointerId !== containerGesture.pointerId) return;
  const point = screenToWorld(event.clientX, event.clientY);
  const dx = point.x - containerGesture.start.x;
  const dy = point.y - containerGesture.start.y;
  containerGesture.moved ||= Math.hypot(dx, dy) > 3;
  if (!containerGesture.moved) return;

  if (containerGesture.kind === 'resize') {
    const next = containerResizeFromCorner(
      containerGesture.type,
      containerGesture.id,
      containerGesture.original,
      containerGesture.corner,
      dx,
      dy
    );
    containerApplyGeometry(containerGesture.type, containerGesture.id, next);
    containerUpdateGeometryDom(containerGesture.type, containerGesture.id);
  } else if (containerGesture.kind === 'phase-move') {
    const phase = getPhase(containerGesture.id);
    if (!phase) return;
    const bounds = containerGesture.moveBounds;
    const delta = {
      dx: clamp(dx, -bounds.minX, WORLD.width - bounds.maxX),
      dy: clamp(dy, -bounds.minY, WORLD.height - bounds.maxY)
    };
    phase.x = containerGesture.original.x + delta.dx;
    phase.y = containerGesture.original.y + delta.dy;
    containerGesture.groupOrigins.forEach((origin) => {
      const item = getGroup(origin.id);
      if (item) { item.x = origin.x + delta.dx; item.y = origin.y + delta.dy; }
    });
    containerGesture.noteOrigins.forEach((origin) => {
      const item = getNote(origin.id);
      if (item) { item.x = origin.x + delta.dx; item.y = origin.y + delta.dy; }
    });
    containerUpdateGeometryDom('phase', phase.id);
    renderGroups();
    renderNotes();
  }
  renderEdges();
  renderMinimap();
  event.preventDefault();
}

function containerFinishGesture(event, cancelled = false) {
  if (!containerGesture || (event.pointerId != null && event.pointerId !== containerGesture.pointerId)) return;
  const finished = containerGesture;
  containerGesture = null;
  document.body.classList.remove('is-container-resizing', 'is-container-moving');
  if (cancelled) {
    state = clone(finished.before);
    saveState();
    renderAll();
    toast('操作を取り消しました');
    return;
  }
  if (!finished.moved) {
    renderAll();
    if (finished.type === 'phase' && typeof containerScheduleSelectionGuide === 'function') {
      containerScheduleSelectionGuide('phase', finished.id);
    }
    return;
  }
  undoStack.push(finished.before);
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
  const label = finished.kind === 'phase-move'
    ? 'フェーズを中身ごと移動'
    : `${containerLabel(finished.type)}のサイズを変更`;
  recordActivity(label);
  saveState();
  renderAll();
  if (typeof containerShowActionNotice === 'function') {
    containerShowActionNotice(label, { undoable: true });
  } else toast(label);
  event?.preventDefault?.();
  if (finished.moved && typeof suppressClickAfterPan === 'function') suppressClickAfterPan();
}

function containerHandleAction(button) {
  const type = button.dataset.containerType;
  const id = button.dataset.containerId;
  const action = button.dataset.containerAction;
  const item = containerGet(type, id);
  if (!item) return;
  if (action === 'rename' || action === 'color') {
    if (typeof containerFocusInspectorField === 'function') containerFocusInspectorField(type, id, action === 'color' ? 'color' : 'title');
    return;
  }
  if (action === 'fit') return containerFitToContents(type, id);
  if (action === 'focus') return containerFocusView(type, id);
  if (action === 'collapse' && type === 'group') {
    if (typeof toggleGroupWorkflowCollapsed === 'function') toggleGroupWorkflowCollapsed(id);
    else mutate(item.collapsed ? '囲みを展開' : '囲みを折りたたむ', () => { item.collapsed = !item.collapsed; });
    return;
  }
  if (action === 'list' && type === 'group') {
    if (typeof openGroupListPopover === 'function') openGroupListPopover(id, button);
    return;
  }
  if (action === 'release' && type === 'group') return containerReleaseGroup(id);
}

function containerBindControls() {
  if (containerControlsBound) return;
  containerControlsBound = true;
  els.board.addEventListener('pointerdown', (event) => {
    const resize = event.target.closest('[data-container-resize]');
    if (resize) return containerBeginResize(event, resize);
    const phaseHeader = event.target.closest('[data-drag-phase]');
    if (phaseHeader) return containerBeginPhaseMove(event, phaseHeader);
  }, true);
  els.board.addEventListener('click', (event) => {
    const action = event.target.closest('[data-container-action]');
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    containerHandleAction(action);
  }, true);
  document.addEventListener('pointermove', containerUpdateGesture, true);
  document.addEventListener('pointerup', (event) => containerFinishGesture(event), true);
  document.addEventListener('pointercancel', (event) => containerFinishGesture(event, true), true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && containerGesture) {
      event.preventDefault();
      containerFinishGesture({ pointerId: containerGesture.pointerId }, true);
    }
  }, true);
}

const bindEventsBeforeContainerControls = bindEvents;
bindEvents = function bindEventsContainerControls() {
  bindEventsBeforeContainerControls();
  containerBindControls();
};
