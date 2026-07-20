/* Flowmap v0.18.0 — independent sizing, natural card height and separate anchor labels */
alignmentApplyRenderedSizes = function alignmentApplyRenderedSizesPolish() {
  state.notes.forEach((item) => {
    const card = els['node-layer']?.querySelector(`[data-note-id="${item.id}"]`);
    if (!card) return;
    const size = alignmentResolvedSize(item);
    const customWidth = Number.isFinite(Number(item.customWidth)) && Number(item.customWidth) > 0;
    const customHeight = Number.isFinite(Number(item.customHeight)) && Number(item.customHeight) > 0;
    card.style.width = `${size.w}px`;
    card.style.minHeight = `${size.h}px`;
    card.style.height = customHeight ? `${size.h}px` : '';
    card.classList.toggle('has-custom-size', customWidth || customHeight);
    card.classList.toggle('has-custom-width', customWidth);
    card.classList.toggle('has-custom-height', customHeight);
  });
};

alignmentUnifySize = function alignmentUnifySizePolish(mode) {
  const items = alignmentSelectedItems();
  if (items.length < 2) return;
  const targetWidth = alignmentTargetSize(items, 'w');
  const targetHeight = alignmentTargetSize(items, 'h');
  const labels = {
    width: '幅を揃える',
    height: '高さを揃える',
    both: '大きさを揃える'
  };

  mutate(labels[mode] || '大きさを揃える', () => {
    items.forEach((item) => {
      const before = alignmentResolvedSize(item);
      const centerX = item.x + before.w / 2;
      const centerY = item.y + before.h / 2;
      const minimum = alignmentMinimumSize(item);

      if (mode === 'width' || mode === 'both') {
        const nextWidth = Math.max(minimum.w, targetWidth);
        item.customWidth = nextWidth;
        item.w = nextWidth;
        item.x = centerX - nextWidth / 2;
      }
      if (mode === 'height' || mode === 'both') {
        const nextHeight = Math.max(minimum.h, targetHeight);
        item.customHeight = nextHeight;
        item.h = nextHeight;
        item.y = centerY - nextHeight / 2;
      }
    });
    if (alignmentState.mode !== 'primary') alignmentConstrainItems(items);
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
