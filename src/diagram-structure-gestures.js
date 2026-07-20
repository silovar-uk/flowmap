/* Flowmap v0.20.0 — ordinary drag changes layout/membership; hierarchy moves only from the structure handle */
let structureGesture = null;
let structureGestureBound = false;

function diagramMembershipTarget(item) {
  const size = noteDisplaySize(item);
  const centerX = item.x + size.w / 2;
  const centerY = item.y + size.h / 2;
  const group = findGroupAt(centerX, centerY);
  const phase = group ? getPhase(group.phaseId) : findPhaseAt(centerX, centerY);
  return { groupId: group?.id || '', phaseId: group?.phaseId || phase?.id || '' };
}

function diagramApplyMembership(item) {
  const before = syncNoteState(item);
  const target = diagramMembershipTarget(item);
  item.groupId = target.groupId;
  item.phaseId = target.phaseId;
  if (before.groupId !== item.groupId || before.phaseId !== item.phaseId) {
    /* Do not infer a new parent from the destination's visual position. */
    item.depth = 0;
    item.parentId = '';
  }
  return syncDiffNoteStructure(before, syncNoteState(item));
}

/* Ordinary drag no longer inserts a card into an arrow. Connections remain explicit. */
finalizeNoteDrop = function finalizeNoteDropSafeStructure(noteId) {
  const item = getNote(noteId);
  if (!item) return;
  const changes = diagramApplyMembership(item);
  const afterContainer = syncHumanContainer(item.phaseId, item.groupId);
  const overlap = state.notes.find((other) => other.id !== noteId && overlapRatio(item, other) > .38);
  if (overlap && (!item.groupId || item.groupId !== overlap.groupId)) {
    actionToast('重なった2枚を囲みにまとめますか？', 'まとめる', () => groupPair(noteId, overlap.id));
  }
  recordActivity(changes.length ? `工程を「${afterContainer}」へ移動` : '工程を移動', noteId);
};

const alignmentReassignContainersBeforeSafeStructure = alignmentReassignContainers;
alignmentReassignContainers = function alignmentReassignContainersSafeStructure(items) {
  if (!Array.isArray(items)) return alignmentReassignContainersBeforeSafeStructure(items);
  items.forEach((item) => { diagramApplyMembership(item); });
};

function diagramPendingDropContext() {
  if (!drag || !['note', 'multi-note'].includes(drag.type)) return null;
  const ids = drag.type === 'note' ? [drag.id] : drag.noteOrigins.map((item) => item.id);
  const before = new Map((drag.before?.notes || []).filter((item) => ids.includes(item.id)).map((item) => [item.id, syncNoteState(item)]));
  return { ids, before };
}

const handlePointerUpBeforeSafeStructure = handlePointerUp;
handlePointerUp = function handlePointerUpSafeStructure(event) {
  const pending = diagramPendingDropContext();
  const result = handlePointerUpBeforeSafeStructure(event);
  if (!pending) return result;

  const changes = [];
  const affectedIds = [];
  pending.ids.forEach((id) => {
    const item = getNote(id);
    if (!item) return;
    const itemChanges = syncDiffNoteStructure(pending.before.get(id), syncNoteState(item));
    if (itemChanges.length) {
      changes.push(...itemChanges);
      affectedIds.push(id);
    }
  });
  if (changes.length) {
    const label = affectedIds.length === 1
      ? `「${getNote(affectedIds[0])?.title || '工程'}」の所属を変更`
      : `${affectedIds.length}件の工程の所属を変更`;
    syncRecordExternalChange({ label, origin: 'diagram', changes, affectedIds });
  }
  return result;
};

function structureInstallHandle() {
  if (currentFlowMode() !== 'build' || selection.type !== 'note') return;
  const card = els['node-layer']?.querySelector(`[data-note-id="${selection.id}"]`);
  if (!card || card.querySelector('[data-structure-handle]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'note-structure-handle';
  button.dataset.structureHandle = selection.id;
  button.title = '構造として移動（前・後・子）';
  button.setAttribute('aria-label', `${getNote(selection.id)?.title || '工程'}を構造として移動`);
  button.innerHTML = '<span>⠿</span><small>構造</small>';
  card.append(button);
}

function structureClearTarget() {
  document.querySelectorAll('.sticky-note.is-structure-before,.sticky-note.is-structure-after,.sticky-note.is-structure-child')
    .forEach((item) => item.classList.remove('is-structure-before', 'is-structure-after', 'is-structure-child'));
  const badge = document.getElementById('structure-drop-badge');
  if (badge) badge.hidden = true;
}

function structureInstallBadge() {
  if (document.getElementById('structure-drop-badge')) return;
  const badge = document.createElement('div');
  badge.id = 'structure-drop-badge';
  badge.className = 'structure-drop-badge';
  badge.hidden = true;
  els.board.append(badge);
}

function structureResolveTarget(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  const card = element?.closest?.('.sticky-note[data-note-id]');
  if (!card || card.dataset.noteId === structureGesture?.noteId) return null;
  const rect = card.getBoundingClientRect();
  const ratio = clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1);
  const placement = ratio < .3 ? 'before' : ratio > .7 ? 'after' : 'child';
  return { card, noteId: card.dataset.noteId, placement };
}

function structureShowTarget(target, clientX, clientY) {
  structureClearTarget();
  structureInstallBadge();
  if (!target) {
    structureGesture.target = null;
    return;
  }
  target.card.classList.add(`is-structure-${target.placement}`);
  structureGesture.target = { noteId: target.noteId, placement: target.placement };
  const targetNote = getNote(target.noteId);
  const labels = { before: '前へ', after: '後へ', child: '子にする' };
  const badge = document.getElementById('structure-drop-badge');
  badge.textContent = `${labels[target.placement]}：${targetNote?.title || '工程'}`;
  badge.hidden = false;
  const boardRect = els.board.getBoundingClientRect();
  badge.style.left = `${clientX - boardRect.left + 14}px`;
  badge.style.top = `${clientY - boardRect.top + 14}px`;
}

function structureBegin(event, button) {
  if (event.button !== 0) return;
  const noteId = button.dataset.structureHandle;
  if (!getNote(noteId)) return;
  structureGesture = { pointerId: event.pointerId, noteId, target: null };
  structureInstallBadge();
  button.setPointerCapture?.(event.pointerId);
  document.body.classList.add('is-structure-dragging');
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function structureMove(event) {
  if (!structureGesture || event.pointerId !== structureGesture.pointerId) return;
  structureShowTarget(structureResolveTarget(event.clientX, event.clientY), event.clientX, event.clientY);
  event.preventDefault();
}

function structureFinish(event) {
  if (!structureGesture || event.pointerId !== structureGesture.pointerId) return;
  const finished = structureGesture;
  structureGesture = null;
  structureClearTarget();
  document.body.classList.remove('is-structure-dragging');
  if (finished.target) {
    executeFlowCommand({
      type: 'note.structure',
      origin: 'diagram',
      payload: { noteId: finished.noteId, targetId: finished.target.noteId, placement: finished.target.placement }
    });
  }
  event.preventDefault();
  event.stopPropagation();
}

function structureBindEvents() {
  if (structureGestureBound) return;
  structureGestureBound = true;
  els['node-layer'].addEventListener('pointerdown', (event) => {
    const button = event.target.closest('[data-structure-handle]');
    if (button) structureBegin(event, button);
  }, true);
  document.addEventListener('pointermove', structureMove, true);
  document.addEventListener('pointerup', structureFinish, true);
  document.addEventListener('pointercancel', structureFinish, true);
}

const renderNotesBeforeStructureGestures = renderNotes;
renderNotes = function renderNotesStructureGestures() {
  renderNotesBeforeStructureGestures();
  structureInstallHandle();
};

const bindEventsBeforeStructureGestures = bindEvents;
bindEvents = function bindEventsStructureGestures() {
  bindEventsBeforeStructureGestures();
  structureBindEvents();
};
