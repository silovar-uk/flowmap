/* Flowmap v0.18.1 — duplicate a step and connect the new copy back to its source */
let reverseDuplicateShortcutHelpInstalled = false;

function reverseDuplicateSelectedNote() {
  const original = selection.type === 'note' ? getNote(selection.id) : null;
  if (!original) return false;

  const originalSize = noteDisplaySize(original);
  const now = new Date().toISOString();

  mutate('工程を複製して元へ接続', () => {
    const copy = clone(original);
    copy.id = uid('note');
    copy.title = `${original.title}（コピー）`;
    copy.x = clamp(original.x + 36, 0, WORLD.width - originalSize.w);
    copy.y = clamp(original.y + 36, 0, WORLD.height - originalSize.h);
    copy.createdAt = now;
    copy.updatedAt = now;
    copy.checklist = (copy.checklist || []).map((item) => ({ ...item, id: uid('check') }));
    copy.memoItems = (copy.memoItems || []).map((item) => ({ ...item, id: uid('memo'), updatedAt: now }));

    state.notes.push(copy);

    if (typeof outlineSortedNotes === 'function' && typeof outlineRenumber === 'function') {
      const orderedIds = outlineSortedNotes(state)
        .filter((item) => item.id !== copy.id)
        .map((item) => item.id);
      const originalIndex = orderedIds.indexOf(original.id);
      orderedIds.splice(originalIndex >= 0 ? originalIndex : orderedIds.length, 0, copy.id);
      outlineRenumber(state, orderedIds);
    } else if (Number.isFinite(Number(original.order))) {
      copy.order = Number(original.order) - 1;
    }

    const relation = edge(
      uid('edge'),
      copy.id,
      original.id,
      '',
      { source: 'manual', kind: 'sequence', routing: 'auto' }
    );
    relation.source = 'manual';
    relation.kind = relation.kind || 'sequence';
    relation.routing = relation.routing || 'auto';
    state.edges.push(relation);

    if (typeof outlineUnsuppressPair === 'function') outlineUnsuppressPair(copy.id, original.id);
    if (typeof outlineSyncAutoEdges === 'function') outlineSyncAutoEdges(state);

    if (typeof selectedNoteIds !== 'undefined') selectedNoteIds = new Set([copy.id]);
    selection = { type: 'note', id: copy.id };
    state.settings.inspectorOpen = true;
  });

  toast('複製した工程から元の工程へ矢印をつなぎました');
  return true;
}

function reverseDuplicateInstallHelp() {
  if (reverseDuplicateShortcutHelpInstalled) return;
  const grid = els['help-dialog']?.querySelector('.shortcut-grid');
  if (!grid) return;
  reverseDuplicateShortcutHelpInstalled = true;

  if (![...grid.querySelectorAll('kbd')].some((item) => item.textContent.includes('Shift＋D'))) {
    const row = document.createElement('div');
    row.dataset.shortcut = 'reverse-duplicate';
    row.innerHTML = '<kbd>Ctrl／Cmd＋Shift＋D</kbd><span>選択した工程を複製し、新しい工程から元の工程へ接続</span>';
    grid.append(row);
  }
}

const handleKeyDownBeforeReverseDuplicate = handleKeyDown;
handleKeyDown = function handleKeyDownReverseDuplicate(event) {
  const typing = event.target instanceof Element && event.target.matches('input,textarea,select,[contenteditable="true"]');
  const primary = event.ctrlKey || event.metaKey;
  if (!typing && primary && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'd') {
    if (selection.type !== 'note' || !getNote(selection.id)) return handleKeyDownBeforeReverseDuplicate(event);
    event.preventDefault();
    event.stopPropagation();
    if (typeof v12CancelDraft === 'function') v12CancelDraft();
    closeQuickPopover();
    reverseDuplicateSelectedNote();
    return;
  }
  return handleKeyDownBeforeReverseDuplicate(event);
};

const renderNotesBeforeReverseDuplicate = renderNotes;
renderNotes = function renderNotesReverseDuplicate() {
  renderNotesBeforeReverseDuplicate();
  $$('.sticky-note', els['node-layer']).forEach((card) => {
    const shortcuts = new Set((card.getAttribute('aria-keyshortcuts') || '').split(/\s+/).filter(Boolean));
    shortcuts.add('Control+Shift+D');
    shortcuts.add('Meta+Shift+D');
    card.setAttribute('aria-keyshortcuts', [...shortcuts].join(' '));
  });
};

const updateFlowExperienceUiBeforeReverseDuplicate = updateFlowExperienceUi;
updateFlowExperienceUi = function updateFlowExperienceUiReverseDuplicate() {
  updateFlowExperienceUiBeforeReverseDuplicate();
  const badge = document.querySelector('.version-badge');
  if (badge) badge.textContent = 'v0.18.1';
  reverseDuplicateInstallHelp();
};
