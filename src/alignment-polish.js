/* Flowmap v0.18.0 — keep anchor labels separate from shape pseudo-elements */
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
