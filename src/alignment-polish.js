/* Flowmap v0.18.0 — keep anchor labels separate and preserve untouched card sizing */
const alignmentApplyRenderedSizesBeforePolish = alignmentApplyRenderedSizes;
alignmentApplyRenderedSizes = function alignmentApplyRenderedSizesPolish() {
  state.notes.forEach((item) => {
    const card = els['node-layer']?.querySelector(`[data-note-id="${item.id}"]`);
    if (!card) return;
    const size = alignmentResolvedSize(item);
    const custom = Boolean(item.customWidth || item.customHeight);
    card.style.width = `${size.w}px`;
    card.style.minHeight = `${size.h}px`;
    card.style.height = custom ? `${size.h}px` : '';
    card.classList.toggle('has-custom-size', custom);
  });
};

const alignmentUpdateUiBeforePolish = alignmentUpdateUi;
alignmentUpdateUi = function alignmentUpdateUiPolish() {
  alignmentUpdateUiBeforePolish();
  const ids = alignmentSelectedIds();
  $$('.sticky-note', els['node-layer']).forEach((card) => {
    const isAnchor = alignmentState.mode === 'primary' && ids.length > 1 && card.dataset.noteId === selection.id;
    let badge = card.querySelector('.alignment-anchor-badge');
    if (isAnchor && !badge) {
      badge = document.createElement('span');
      badge.className = 'alignment-anchor-badge';
      badge.textContent = '基準';
      card.append(badge);
    }
    if (badge) badge.hidden = !isAnchor;
  });
};
