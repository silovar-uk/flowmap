function unifiedApplyColor(ids, color) {
  const validColor = unifiedNormalizeColor(color);
  const items = ids.map((id) => getNote(id)).filter(Boolean);
  if (!items.length) return;
  mutate(items.length > 1 ? `${items.length}件の付箋色を変更` : '付箋色を変更', () => {
    items.forEach((item) => { item.appearanceColor = validColor; });
  }, items.length === 1 ? items[0].id : null);
}

function unifiedApplyCustomWidth(ids, width) {
  const resolved = clamp(Number(width) || 224, 120, 900);
  const items = ids.map((id) => getNote(id)).filter(Boolean);
  if (!items.length) return;
  mutate(items.length > 1 ? `${items.length}件の横幅を変更` : '付箋の横幅を変更', () => {
    items.forEach((item) => {
      item.widthPreset = 'custom';
      item.customWidth = resolved;
      item.customHeight = null;
      item.w = resolved;
    });
  }, items.length === 1 ? items[0].id : null);
}

function unifiedApplyWidthPreset(ids, preset) {
  if (!(preset in NOTE_WIDTH_PRESETS)) return;
  const items = ids.map((id) => getNote(id)).filter(Boolean);
  if (!items.length) return;
  mutate(items.length > 1 ? `${items.length}件の横幅を変更` : '付箋の横幅を変更', () => {
    items.forEach((item) => {
      item.widthPreset = preset;
      item.customWidth = NOTE_WIDTH_PRESETS[preset];
      item.customHeight = null;
      const size = typeof alignmentResolvedSize === 'function' ? alignmentResolvedSize(item) : noteDisplaySize(item);
      item.w = size.w;
      item.h = size.h;
    });
  }, items.length === 1 ? items[0].id : null);
}

function unifiedInstallMultiToolbar() {
  const toolbar = document.getElementById('multi-selection-toolbar');
  if (!toolbar || toolbar.dataset.unified === 'true') return;
  toolbar.dataset.unified = 'true';
  toolbar.innerHTML = `
    <strong id="multi-selection-count">0件を選択</strong>
    <button type="button" data-open-alignment title="端や中央を揃える">整列</button>
    <button type="button" data-multi-distribute="horizontal" title="左右端を固定して横の余白を揃える">横間隔</button>
    <button type="button" data-multi-distribute="vertical" title="上下端を固定して縦の余白を揃える">縦間隔</button>
    <button class="multi-group-button" type="button" data-group-selected title="選択した付箋の外側に囲みを作る">囲む</button>
    <button type="button" data-multi-popover="color">色</button>
    <button type="button" data-multi-popover="width">幅</button>
    <button class="multi-delete-button" type="button" data-delete-multi>削除</button>
    <button class="multi-clear-button" type="button" data-clear-multi>解除</button>`;
  if (typeof alignmentInstallUi === 'function') alignmentInstallUi();
}

function unifiedUpdateMultiToolbar() {
  unifiedInstallMultiToolbar();
  const ids = unifiedCurrentSelectedIds();
  const count = document.getElementById('multi-selection-count');
  if (count) count.textContent = `${ids.length}件を選択`;
  document.querySelectorAll('[data-multi-distribute]').forEach((button) => {
    button.disabled = ids.length < 3;
    button.title = ids.length < 3 ? '等間隔は3件以上で利用できます' : button.title;
  });
  if (typeof alignmentUpdateUi === 'function') alignmentUpdateUi();
}

function unifiedPopoverHtml(kind) {
  if (kind === 'color') {
    return `<header><strong>付箋の色</strong><button type="button" data-close-multi-popover>×</button></header><div class="multi-color-grid">
      ${Object.entries(NOTE_COLOR_LABELS).map(([value, label]) => `<button type="button" data-multi-color="${value}"><i data-color="${value}"></i><span>${label}</span></button>`).join('')}
    </div>`;
  }
  return `<header><strong>付箋の横幅</strong><button type="button" data-close-multi-popover>×</button></header><div class="multi-width-list">
    ${Object.entries(NOTE_WIDTH_LABELS).map(([value, label]) => `<button type="button" data-multi-width="${value}"><strong>${label}</strong><span>${NOTE_WIDTH_PRESETS[value] ? `${NOTE_WIDTH_PRESETS[value]}px` : '内容に合わせる'}</span></button>`).join('')}
  </div>`;
}

function unifiedOpenMultiPopover(kind) {
  unifiedCloseMultiPopover();
  const toolbar = document.getElementById('multi-selection-toolbar');
  if (!toolbar) return;
  const popover = document.createElement('section');
  popover.id = 'multi-appearance-popover';
  popover.className = 'multi-appearance-popover';
  popover.dataset.kind = kind;
  popover.innerHTML = unifiedPopoverHtml(kind);
  toolbar.append(popover);
  unifiedUiState.popover = popover;
}

function unifiedCloseMultiPopover() {
  document.getElementById('multi-appearance-popover')?.remove();
  unifiedUiState.popover = null;
}

/* Preserve unspecified dimensions when matching only width or height. */
if (typeof alignmentUnifySize === 'function') {
  alignmentUnifySize = function alignmentUnifySizeIndependent(mode) {
    const items = alignmentSelectedItems();
    if (items.length < 2) return;
    const targetWidth = alignmentTargetSize(items, 'w');
    const targetHeight = alignmentTargetSize(items, 'h');
    const labels = { width: '幅を揃える', height: '高さを揃える', both: '大きさを揃える' };
    mutate(labels[mode], () => {
      items.forEach((item) => {
        const before = alignmentResolvedSize(item);
        const centerX = item.x + before.w / 2;
        const centerY = item.y + before.h / 2;
        const minimum = alignmentMinimumSize(item);
        if (mode === 'width' || mode === 'both') {
          item.customWidth = Math.max(minimum.w, targetWidth);
          item.widthPreset = Object.entries(NOTE_WIDTH_PRESETS).find(([, value]) => value === item.customWidth)?.[0] || 'custom';
        }
        if (mode === 'height' || mode === 'both') item.customHeight = Math.max(minimum.h, targetHeight);
        const after = alignmentResolvedSize(item);
        item.w = after.w;
        item.h = after.h;
        item.x = centerX - after.w / 2;
        item.y = centerY - after.h / 2;
      });
      if (alignmentState.mode !== 'primary') alignmentConstrainItems(items);
    });
  };
}
