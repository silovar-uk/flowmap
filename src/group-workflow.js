/* Flowmap v0.15 — group selected work, collapse it, and keep the flow readable */
let groupWorkflowEventsBound = false;
let openGroupListId = null;

const normalizeBeforeGroupWorkflow = normalizeFlowchartState;
normalizeFlowchartState = function normalizeGroupWorkflowState(next) {
  const normalized = normalizeBeforeGroupWorkflow(next);
  if (!normalized?.groups) return normalized;
  normalized.groups.forEach((group) => {
    group.collapsed = Boolean(group.collapsed);
    if (group.expandedBounds && typeof group.expandedBounds === 'object') {
      group.expandedBounds = {
        x: Number.isFinite(group.expandedBounds.x) ? group.expandedBounds.x : group.x,
        y: Number.isFinite(group.expandedBounds.y) ? group.expandedBounds.y : group.y,
        w: Number.isFinite(group.expandedBounds.w) ? group.expandedBounds.w : group.w,
        h: Number.isFinite(group.expandedBounds.h) ? group.expandedBounds.h : group.h
      };
    } else {
      group.expandedBounds = null;
    }
  });
  return normalized;
};

function groupWorkflowNotes(groupId) {
  return state.notes.filter((item) => item.groupId === groupId);
}

function groupWorkflowStats(groupId) {
  const notes = groupWorkflowNotes(groupId);
  const done = notes.filter((item) => item.status === 'done').length;
  return { notes, total: notes.length, done, allDone: notes.length > 0 && done === notes.length };
}

function groupWorkflowDisplayBounds(group) {
  if (!group.collapsed) return { x: group.x, y: group.y, w: group.w, h: group.h };
  const titleWidth = Math.min(120, Math.max(0, String(group.title || '').length * 5));
  return { x: group.x, y: group.y, w: clamp(230 + titleWidth, 230, 360), h: 52 };
}

function closeGroupListPopover() {
  document.getElementById('group-list-popover')?.remove();
  openGroupListId = null;
}

renderGroups = function renderGroupWorkflowGroups() {
  closeGroupListPopover();
  els['group-layer'].innerHTML = state.groups.map((group) => {
    const bounds = groupWorkflowDisplayBounds(group);
    const stats = groupWorkflowStats(group.id);
    const progress = stats.total ? `${stats.done}/${stats.total}完了` : '工程なし';
    return `<section class="group-card ${group.collapsed ? 'is-collapsed' : ''} ${stats.allDone ? 'is-all-done' : ''} ${isSelected('group', group.id) ? 'is-selected' : ''}" data-group-id="${group.id}" data-color="${group.color}" style="left:${bounds.x}px;top:${bounds.y}px;width:${bounds.w}px;height:${bounds.h}px">
      <div class="group-header" data-drag-group="${group.id}">
        <strong title="${esc(group.title)}">${esc(group.title)}</strong>
        <span class="group-progress-summary">${progress}</span>
        <button class="group-count-button" type="button" data-group-list="${group.id}" aria-label="${esc(group.title)}の工程一覧を表示">${stats.total}件</button>
        <button class="group-collapse-button" type="button" data-collapse-group="${group.id}" title="${group.collapsed ? '展開' : '折りたたみ'}" aria-label="${group.collapsed ? '囲みを展開' : '囲みを折りたたむ'}">${group.collapsed ? '＋' : '−'}</button>
      </div>
    </section>`;
  }).join('');
};

function endpointRectForGroupWorkflow(noteItem) {
  const group = noteItem?.groupId ? getGroup(noteItem.groupId) : null;
  if (group?.collapsed) return { ...groupWorkflowDisplayBounds(group), groupId: group.id, collapsed: true };
  const size = noteDisplaySize(noteItem);
  return { x: noteItem.x, y: noteItem.y, w: size.w, h: size.h, groupId: null, collapsed: false };
}

function groupWorkflowPort(rect, toward) {
  const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0
    ? { x: rect.x + rect.w, y: center.y }
    : { x: rect.x, y: center.y };
  return dy >= 0
    ? { x: center.x, y: rect.y + rect.h }
    : { x: center.x, y: rect.y };
}

const edgePathBeforeGroupWorkflow = edgePath;
edgePath = function edgePathGroupWorkflow(item) {
  const from = getNote(item.from);
  const to = getNote(item.to);
  if (!from || !to) return edgePathBeforeGroupWorkflow(item);
  const fromRect = endpointRectForGroupWorkflow(from);
  const toRect = endpointRectForGroupWorkflow(to);
  if (fromRect.collapsed && toRect.collapsed && fromRect.groupId === toRect.groupId) {
    return { d: '', points: [], start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, labelPoint: { x: 0, y: 0 } };
  }
  const fromCenter = { x: fromRect.x + fromRect.w / 2, y: fromRect.y + fromRect.h / 2 };
  const toCenter = { x: toRect.x + toRect.w / 2, y: toRect.y + toRect.h / 2 };
  const start = groupWorkflowPort(fromRect, toCenter);
  const end = groupWorkflowPort(toRect, fromCenter);
  const horizontalFirst = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  const elbow = horizontalFirst ? { x: end.x, y: start.y } : { x: start.x, y: end.y };
  const d = horizontalFirst
    ? `M ${start.x} ${start.y} H ${end.x} V ${end.y}`
    : `M ${start.x} ${start.y} V ${end.y} H ${end.x}`;
  const firstLength = Math.hypot(elbow.x - start.x, elbow.y - start.y);
  const secondLength = Math.hypot(end.x - elbow.x, end.y - elbow.y);
  const labelPoint = firstLength >= secondLength
    ? { x: (start.x + elbow.x) / 2, y: (start.y + elbow.y) / 2 - 7 }
    : { x: (elbow.x + end.x) / 2 + 7, y: (elbow.y + end.y) / 2 };
  return { d, points: [start, elbow, end], start, end, labelPoint };
};

const renderEdgesBeforeGroupWorkflow = renderEdges;
renderEdges = function renderEdgesGroupWorkflow() {
  renderEdgesBeforeGroupWorkflow();
  state.edges.forEach((item) => {
    const from = getNote(item.from);
    const to = getNote(item.to);
    const fromGroup = from?.groupId ? getGroup(from.groupId) : null;
    const toGroup = to?.groupId ? getGroup(to.groupId) : null;
    const element = els.edges.querySelector(`[data-edge-group="${item.id}"]`);
    if (!element) return;
    const hiddenInside = Boolean(fromGroup?.collapsed && toGroup?.collapsed && fromGroup.id === toGroup.id);
    element.hidden = hiddenInside;
    element.classList.toggle('is-collapsed-group-edge', !hiddenInside && Boolean(fromGroup?.collapsed || toGroup?.collapsed));
  });
};

const renderMinimapBeforeGroupWorkflow = renderMinimap;
renderMinimap = function renderMinimapGroupWorkflow() {
  if (!state?.groups || !state?.notes) return renderMinimapBeforeGroupWorkflow();
  const scaleX = 176 / WORLD.width;
  const scaleY = 116 / WORLD.height;
  const groupShapes = state.groups.map((group) => {
    const bounds = groupWorkflowDisplayBounds(group);
    return `<rect x="${bounds.x * scaleX}" y="${bounds.y * scaleY}" width="${bounds.w * scaleX}" height="${bounds.h * scaleY}" rx="2" fill="rgba(112,126,117,.08)" stroke="rgba(112,126,117,.35)" />`;
  }).join('');
  const noteShapes = state.notes.filter((item) => !getGroup(item.groupId)?.collapsed).map((item) => `<rect x="${item.x * scaleX}" y="${item.y * scaleY}" width="${Math.max(3, noteDisplaySize(item).w * scaleX)}" height="${Math.max(2, noteDisplaySize(item).h * scaleY)}" rx="1" fill="${item.status === 'done' ? '#aeb1ae' : item.status === 'doing' ? '#9eb5dc' : item.status === 'waiting' ? '#d8b68e' : '#d7c66f'}" />`).join('');
  els['minimap-svg'].innerHTML = groupShapes + noteShapes;
  const rect = els.stage.getBoundingClientRect();
  const { x, y, scale } = state.viewport;
  const worldLeft = -x / scale;
  const worldTop = -y / scale;
  const worldW = rect.width / scale;
  const worldH = rect.height / scale;
  Object.assign(els['minimap-viewport'].style, {
    left: `${clamp(worldLeft * scaleX, 0, 176)}px`,
    top: `${clamp(worldTop * scaleY, 0, 116)}px`,
    width: `${clamp(worldW * scaleX, 4, 176)}px`,
    height: `${clamp(worldH * scaleY, 4, 116)}px`
  });
};

const fitViewBeforeGroupWorkflow = fitView;
fitView = function fitViewGroupWorkflow(targetNoteId = null) {
  if (targetNoteId) {
    const item = getNote(targetNoteId);
    const group = item?.groupId ? getGroup(item.groupId) : null;
    if (!group?.collapsed) return fitViewBeforeGroupWorkflow(targetNoteId);
    const rect = els.stage.getBoundingClientRect();
    const bounds = groupWorkflowDisplayBounds(group);
    const padding = 150;
    const scale = clamp(Math.min(rect.width / (bounds.w + padding * 2), rect.height / (bounds.h + padding * 2)), .28, 1.22);
    state.viewport.scale = scale;
    state.viewport.x = (rect.width - bounds.w * scale) / 2 - bounds.x * scale;
    state.viewport.y = (rect.height - bounds.h * scale) / 2 - bounds.y * scale;
    saveState(); renderAll();
    return;
  }
  const rect = els.stage.getBoundingClientRect();
  const framePadding = clamp(Math.min(rect.width, rect.height) * .09, 76, 128);
  const objects = [
    ...state.notes.filter((item) => !getGroup(item.groupId)?.collapsed).map((item) => ({ x: item.x, y: item.y, w: noteDisplaySize(item).w, h: noteDisplaySize(item).h })),
    ...state.groups.map((group) => groupWorkflowDisplayBounds(group))
  ];
  if (!objects.length) return;
  const bounds = {
    minX: Math.min(...objects.map((item) => item.x)) - framePadding,
    minY: Math.min(...objects.map((item) => item.y)) - framePadding,
    maxX: Math.max(...objects.map((item) => item.x + item.w)) + framePadding,
    maxY: Math.max(...objects.map((item) => item.y + item.h)) + framePadding
  };
  const scale = clamp(Math.min(rect.width / (bounds.maxX - bounds.minX), rect.height / (bounds.maxY - bounds.minY)), .28, 1.16);
  state.viewport.scale = scale;
  state.viewport.x = (rect.width - (bounds.maxX - bounds.minX) * scale) / 2 - bounds.minX * scale;
  state.viewport.y = (rect.height - (bounds.maxY - bounds.minY) * scale) / 2 - bounds.minY * scale;
  saveState(); renderAll();
};

function groupSelectedNotes() {
  const ids = typeof validSelectedNoteIds === 'function' ? validSelectedNoteIds() : [];
  const notes = ids.map((id) => getNote(id)).filter(Boolean);
  if (notes.length < 2) return toast('2件以上の図形を選択してください');
  const phaseIds = [...new Set(notes.map((item) => item.phaseId || ''))];
  if (phaseIds.length > 1) return toast('異なるフェーズの図形は、ひとつの囲みにできません');
  const minX = Math.min(...notes.map((item) => item.x));
  const minY = Math.min(...notes.map((item) => item.y));
  const maxX = Math.max(...notes.map((item) => item.x + noteDisplaySize(item).w));
  const maxY = Math.max(...notes.map((item) => item.y + noteDisplaySize(item).h));
  let x = Math.max(0, minX - 28);
  let y = Math.max(0, minY - 52);
  let right = Math.min(WORLD.width, maxX + 28);
  let bottom = Math.min(WORLD.height, maxY + 28);
  let w = Math.max(230, right - x);
  let h = Math.max(120, bottom - y);
  if (x + w > WORLD.width) x = Math.max(0, WORLD.width - w);
  if (y + h > WORLD.height) y = Math.max(0, WORLD.height - h);
  const groupId = uid('group');
  if (typeof stopFlowPlayback === 'function') stopFlowPlayback({ keepFocus: false, render: false });
  mutate('選択した図形を囲みにまとめる', () => {
    state.groups.push({
      id: groupId,
      phaseId: phaseIds[0] || state.phases[0]?.id || '',
      title: '新しい囲み',
      x, y, w, h,
      color: 'gray',
      collapsed: false,
      expandedBounds: null
    });
    notes.forEach((item) => { item.groupId = groupId; });
    selectedNoteIds.clear();
    selection = { type: 'group', id: groupId };
    state.settings.inspectorOpen = true;
  });
  requestAnimationFrame(() => {
    const field = els['group-title-field'];
    if (field) { field.focus(); field.select(); }
  });
}

function setGroupWorkflowCollapsed(groupId, collapsed) {
  const group = getGroup(groupId);
  if (!group || group.collapsed === collapsed) return;
  closeGroupListPopover();
  mutate(collapsed ? '囲みを折りたたむ' : '囲みを展開', () => {
    if (collapsed) {
      group.expandedBounds = { x: group.x, y: group.y, w: group.w, h: group.h };
      group.collapsed = true;
    } else {
      group.collapsed = false;
      if (group.expandedBounds) {
        group.w = group.expandedBounds.w;
        group.h = group.expandedBounds.h;
      }
    }
  });
}

function toggleGroupWorkflowCollapsed(groupId) {
  const group = getGroup(groupId);
  if (group) setGroupWorkflowCollapsed(groupId, !group.collapsed);
}

function openGroupListPopover(groupId, anchor) {
  if (openGroupListId === groupId) return closeGroupListPopover();
  closeGroupListPopover();
  const group = getGroup(groupId);
  if (!group || !anchor) return;
  const stats = groupWorkflowStats(groupId);
  const popover = document.createElement('div');
  popover.id = 'group-list-popover';
  popover.className = 'group-list-popover';
  popover.dataset.groupId = groupId;
  const rows = stats.notes.length
    ? stats.notes.map((item) => {
      const overdue = item.due && item.status !== 'done' && item.due < new Date().toISOString().slice(0, 10);
      return `<button type="button" class="group-list-row ${item.status === 'done' ? 'is-done' : ''}" data-group-note="${item.id}"><span class="group-list-status" data-status="${item.status}"></span><strong>${esc(item.title)}</strong>${overdue ? '<span class="group-list-alert" title="期限超過">!</span>' : ''}</button>`;
    }).join('')
    : '<p class="group-list-empty">この囲みには工程がありません。</p>';
  popover.innerHTML = `<header><div><span>囲みの内容</span><strong>${esc(group.title)}</strong></div><button type="button" data-close-group-list aria-label="閉じる">×</button></header><div class="group-list-summary">${stats.done}/${stats.total}完了</div><div class="group-list-rows">${rows}</div>`;
  document.body.append(popover);
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(310, window.innerWidth - 16);
  const left = clamp(rect.right + 8, 8, Math.max(8, window.innerWidth - width - 8));
  const maxTop = Math.max(8, window.innerHeight - Math.min(430, popover.offsetHeight) - 8);
  const top = clamp(rect.top, 8, maxTop);
  Object.assign(popover.style, { left: `${left}px`, top: `${top}px`, width: `${width}px` });
  openGroupListId = groupId;
}

function openNoteFromCollapsedGroup(noteId) {
  const item = getNote(noteId);
  if (!item) return;
  const group = item.groupId ? getGroup(item.groupId) : null;
  closeGroupListPopover();
  if (group?.collapsed) {
    setGroupWorkflowCollapsed(group.id, false);
    requestAnimationFrame(() => {
      select('note', noteId);
      fitView(noteId);
    });
  } else {
    select('note', noteId);
    fitView(noteId);
  }
}

function bindGroupWorkflowEvents() {
  if (groupWorkflowEventsBound) return;
  groupWorkflowEventsBound = true;
  els['group-layer'].addEventListener('click', (event) => {
    const listButton = event.target.closest('[data-group-list]');
    if (listButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openGroupListPopover(listButton.dataset.groupList, listButton);
      return;
    }
    const collapse = event.target.closest('[data-collapse-group]');
    if (collapse) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      toggleGroupWorkflowCollapsed(collapse.dataset.collapseGroup);
    }
  }, true);
  els['toggle-group-collapse'].addEventListener('click', (event) => {
    const group = selection.type === 'group' ? getGroup(selection.id) : null;
    if (!group) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    toggleGroupWorkflowCollapsed(group.id);
  }, true);
  els['structure-tree'].addEventListener('click', (event) => {
    const button = event.target.closest('[data-select-type="note"]');
    const noteItem = button ? getNote(button.dataset.selectId) : null;
    const group = noteItem?.groupId ? getGroup(noteItem.groupId) : null;
    if (!button || !group?.collapsed) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openNoteFromCollapsedGroup(noteItem.id);
  }, true);
  document.addEventListener('click', (event) => {
    const popover = event.target.closest('#group-list-popover');
    if (event.target.closest('[data-close-group-list]')) return closeGroupListPopover();
    const row = event.target.closest('[data-group-note]');
    if (row) return openNoteFromCollapsedGroup(row.dataset.groupNote);
    if (!popover && !event.target.closest('[data-group-list]')) closeGroupListPopover();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !openGroupListId) return;
    event.preventDefault();
    event.stopPropagation();
    closeGroupListPopover();
  }, true);
}

const bindEventsBeforeGroupWorkflow = bindEvents;
bindEvents = function bindEventsGroupWorkflow() {
  bindEventsBeforeGroupWorkflow();
  bindGroupWorkflowEvents();
};

const updateFlowExperienceUiBeforeGroupWorkflow = updateFlowExperienceUi;
updateFlowExperienceUi = function updateFlowExperienceUiGroupWorkflow() {
  updateFlowExperienceUiBeforeGroupWorkflow();
  const badge = document.querySelector('.version-badge');
  if (badge) badge.textContent = 'v0.15.0';
};
