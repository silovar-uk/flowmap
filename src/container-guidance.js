/* Flowmap v0.22.0 — selection guidance, creation POPs and membership previews */
let containerGuideTimer = null;
let containerGuideSelectionTimer = null;
let containerGuidanceBound = false;

function containerGuideElement(type, id) {
  const layer = type === 'phase' ? els['phase-layer'] : els['group-layer'];
  return layer?.querySelector(`[data-${type}-id="${id}"]`) || null;
}

function containerCloseGuide() {
  clearTimeout(containerGuideTimer);
  document.getElementById('container-guide-popover')?.remove();
}

function containerGuidePosition(popover, anchor) {
  if (!popover || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(350, window.innerWidth - 20);
  popover.style.width = `${width}px`;
  const measured = popover.getBoundingClientRect();
  let left = clamp(rect.left, 10, Math.max(10, window.innerWidth - width - 10));
  let top = rect.top - measured.height - 10;
  if (top < 10) top = Math.min(window.innerHeight - measured.height - 10, rect.top + 48);
  Object.assign(popover.style, { left: `${left}px`, top: `${Math.max(10, top)}px` });
}

function containerShowGuide(type, id, { created = false, detailed = null } = {}) {
  const item = containerGet(type, id);
  const anchor = containerGuideElement(type, id);
  if (!item || !anchor || !['build', 'check'].includes(currentFlowMode())) return;
  containerCloseGuide();
  state.settings ||= {};
  state.settings.containerGuidesSeen ||= { phase: false, group: false };
  const showDetailed = detailed == null ? !state.settings.containerGuidesSeen[type] : detailed;
  const popover = document.createElement('section');
  popover.id = 'container-guide-popover';
  popover.className = `container-guide-popover is-${type}${created ? ' is-created' : ''}`;
  const isPhase = type === 'phase';
  const title = created ? `${containerLabel(type)}を追加しました` : `${containerLabel(type)}を選択しました`;
  const detail = isPhase
    ? '<li>見出しをドラッグすると、中身ごと移動</li><li>四隅をドラッグするとサイズ変更</li><li>左の「選択」で位置・幅・高さを数値編集</li>'
    : '<li>ヘッダーをドラッグすると、中の付箋ごと移動</li><li>四隅をドラッグするとサイズ変更</li><li>付箋をドラッグして出し入れ</li>';
  popover.innerHTML = `<header><div><span>${created ? 'NEW' : 'SELECTED'}</span><strong>${esc(title)}</strong></div><button type="button" data-container-guide-close aria-label="閉じる">×</button></header>
    <p><b>${esc(item.title)}</b>${created ? 'を選択しています。' : ''}</p>
    ${showDetailed ? `<ul>${detail}</ul>` : `<small>${isPhase ? '見出し＝移動、四隅＝サイズ変更' : 'ヘッダー＝移動、四隅＝サイズ変更'}</small>`}
    <div class="container-guide-actions"><button type="button" data-container-guide-action="rename" data-container-type="${type}" data-container-id="${id}">名前を変更</button><button type="button" data-container-guide-action="focus" data-container-type="${type}" data-container-id="${id}">この範囲を見る</button></div>`;
  document.body.append(popover);
  containerGuidePosition(popover, anchor);
  if (showDetailed) {
    state.settings.containerGuidesSeen[type] = true;
    saveState();
  }
  containerGuideTimer = setTimeout(containerCloseGuide, created ? 9000 : 5600);
}

function containerShowActionNotice(message, { undoable = false } = {}) {
  let notice = document.getElementById('container-action-notice');
  if (!notice) {
    notice = document.createElement('section');
    notice.id = 'container-action-notice';
    notice.className = 'container-action-notice';
    document.body.append(notice);
  }
  notice.innerHTML = `<strong>${esc(message)}</strong>${undoable ? '<button type="button" data-container-notice-undo>元に戻す</button>' : ''}`;
  notice.hidden = false;
  notice.classList.add('is-visible');
  clearTimeout(notice._hideTimer);
  notice._hideTimer = setTimeout(() => {
    notice.classList.remove('is-visible');
    setTimeout(() => { notice.hidden = true; }, 180);
  }, 4600);
}

function containerScheduleSelectionGuide(type, id) {
  clearTimeout(containerGuideSelectionTimer);
  containerGuideSelectionTimer = setTimeout(() => {
    if (containerGesture?.moved || drag?.moved) return;
    if (selection.type === type && selection.id === id) containerShowGuide(type, id);
  }, 280);
}

const selectBeforeContainerGuidance = select;
select = function selectContainerGuidance(type, id, options = {}) {
  const before = `${selection.type || ''}:${selection.id || ''}`;
  const result = selectBeforeContainerGuidance(type, id, options);
  const after = `${type || ''}:${id || ''}`;
  if (before !== after && ['phase', 'group'].includes(type)) containerScheduleSelectionGuide(type, id);
  else if (!type) containerCloseGuide();
  return result;
};

function containerInstallCreationGuides() {
  [els['add-phase'], els['nav-add-phase']].filter(Boolean).forEach((button) => {
    if (button.dataset.containerGuideBound === 'true') return;
    button.dataset.containerGuideBound = 'true';
    button.addEventListener('click', () => {
      requestAnimationFrame(() => {
        if (selection.type !== 'phase' || !getPhase(selection.id)) return;
        containerFocusView('phase', selection.id);
        requestAnimationFrame(() => containerShowGuide('phase', selection.id, { created: true, detailed: true }));
      });
    });
  });
  if (els['add-group'] && els['add-group'].dataset.containerGuideBound !== 'true') {
    els['add-group'].dataset.containerGuideBound = 'true';
    els['add-group'].addEventListener('click', () => {
      requestAnimationFrame(() => {
        if (selection.type === 'group' && getGroup(selection.id)) containerShowGuide('group', selection.id, { created: true, detailed: true });
      });
    });
  }
}

function containerClearMembershipPreview() {
  document.querySelectorAll('.group-card.is-membership-drop-target').forEach((element) => {
    element.classList.remove('is-membership-drop-target');
    delete element.dataset.dropMessage;
  });
}

function containerUpdateMembershipPreview() {
  containerClearMembershipPreview();
  if (!drag?.moved || !['note', 'multi-note'].includes(drag.type)) return;
  const ids = drag.type === 'note' ? [drag.id] : drag.noteOrigins.map((item) => item.id);
  const notes = ids.map((id) => getNote(id)).filter(Boolean);
  if (!notes.length) return;
  const target = diagramMembershipTarget(notes[0]);
  const group = target.groupId ? getGroup(target.groupId) : null;
  if (!group || notes.some((item) => diagramMembershipTarget(item).groupId !== group.id)) return;
  const element = els['group-layer']?.querySelector(`[data-group-id="${group.id}"]`);
  if (!element) return;
  element.classList.add('is-membership-drop-target');
  element.dataset.dropMessage = notes.length > 1
    ? `${notes.length}件を「${group.title}」に入れる`
    : notes[0].groupId === group.id
      ? 'この囲みの中'
      : `「${group.title}」に入れる`;
}

const handlePointerMoveBeforeContainerGuidance = handlePointerMove;
handlePointerMove = function handlePointerMoveContainerGuidance(event) {
  const result = handlePointerMoveBeforeContainerGuidance(event);
  containerUpdateMembershipPreview();
  return result;
};

const handlePointerUpBeforeContainerGuidance = handlePointerUp;
handlePointerUp = function handlePointerUpContainerGuidance(event) {
  const pending = drag && ['note', 'multi-note'].includes(drag.type)
    ? {
        ids: drag.type === 'note' ? [drag.id] : drag.noteOrigins.map((item) => item.id),
        before: new Map((drag.before?.notes || []).map((item) => [item.id, { groupId: item.groupId || '', phaseId: item.phaseId || '', title: item.title }]))
      }
    : null;
  const result = handlePointerUpBeforeContainerGuidance(event);
  containerClearMembershipPreview();
  if (pending) {
    const changed = pending.ids.map((id) => ({ item: getNote(id), before: pending.before.get(id) })).filter(({ item, before }) => item && before && (item.groupId !== before.groupId || item.phaseId !== before.phaseId));
    if (changed.length) {
      const first = changed[0].item;
      const destination = first.groupId ? `「${getGroup(first.groupId)?.title || '囲み'}」へ移動` : first.phaseId ? `「${getPhase(first.phaseId)?.title || 'フェーズ'}」へ移動` : '囲みから外しました';
      const message = changed.length > 1 ? `${changed.length}件を${destination}` : `「${first.title}」を${destination}`;
      containerShowActionNotice(message, { undoable: true });
    }
  }
  return result;
};

function containerBindGuidance() {
  if (containerGuidanceBound) return;
  containerGuidanceBound = true;
  containerInstallCreationGuides();
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-container-guide-close]')) return containerCloseGuide();
    const action = event.target.closest('[data-container-guide-action]');
    if (action) {
      const type = action.dataset.containerType;
      const id = action.dataset.containerId;
      if (action.dataset.containerGuideAction === 'focus') containerFocusView(type, id);
      if (action.dataset.containerGuideAction === 'rename' && typeof containerFocusInspectorField === 'function') containerFocusInspectorField(type, id, 'title');
      containerCloseGuide();
      return;
    }
    if (event.target.closest('[data-container-notice-undo]')) {
      document.getElementById('container-action-notice')?.classList.remove('is-visible');
      undo();
    }
  });
  window.addEventListener('resize', containerCloseGuide);
}

const bindEventsBeforeContainerGuidance = bindEvents;
bindEvents = function bindEventsContainerGuidance() {
  bindEventsBeforeContainerGuidance();
  containerBindGuidance();
};
