/* Flowmap v0.12.1 — keyboard editing foundation */
const handleKeyDownBeforeV121 = handleKeyDown;
handleKeyDown = function handleKeyDownV121(event) {
  const typing = event.target instanceof Element && event.target.matches('input,textarea,select,[contenteditable="true"]');
  if (!typing && event.key === 'F2') {
    if (selection.type === 'note' && selection.id && getNote(selection.id)) {
      event.preventDefault();
      v12CancelDraft();
      closeQuickPopover();
      startInlineEdit(selection.id);
    }
    return;
  }
  return handleKeyDownBeforeV121(event);
};

const renderNotesBeforeV121 = renderNotes;
renderNotes = function renderNotesV121() {
  renderNotesBeforeV121();
  $$('.sticky-note', els['node-layer']).forEach((card) => {
    card.setAttribute('aria-keyshortcuts', 'F2 Delete Control+D');
    card.title = 'クリックで選択・F2で名前を編集';
  });
};

const updatePanGuidanceBeforeV121 = updatePanGuidance;
updatePanGuidance = function updatePanGuidanceV121() {
  updatePanGuidanceBeforeV121();
  const grid = els['help-dialog']?.querySelector('.shortcut-grid');
  if (grid && !grid.querySelector('[data-shortcut="rename"]')) {
    const row = document.createElement('div');
    row.dataset.shortcut = 'rename';
    row.innerHTML = '<kbd>F2</kbd><span>選択した図形の名前を編集</span>';
    const enterRow = [...grid.children].find((item) => item.querySelector('kbd')?.textContent.trim() === 'Enter');
    if (enterRow) enterRow.before(row); else grid.prepend(row);
  }
  const badge = document.querySelector('.version-badge');
  if (badge) badge.textContent = 'v0.12.1';
};
