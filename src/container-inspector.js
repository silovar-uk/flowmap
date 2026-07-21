/* Flowmap v0.22.0 — compact numeric phase/group editing in the unified left panel */
let containerInspectorBound = false;

function containerGeometrySectionHtml(type) {
  return `<section class="container-inspector-geometry" data-container-inspector-geometry="${type}">
    <header><strong>位置とサイズ</strong><small>キャンバスの四隅からも変更できます</small></header>
    <div class="container-field-grid">
      <label><span>X</span><input type="number" min="0" max="2400" step="10" data-container-field="x" data-container-type="${type}"></label>
      <label><span>Y</span><input type="number" min="0" max="1600" step="10" data-container-field="y" data-container-type="${type}"></label>
      <label><span>幅</span><input type="number" min="${CONTAINER_TYPES[type].minWidth}" max="2400" step="10" data-container-field="w" data-container-type="${type}"></label>
      <label><span>高さ</span><input type="number" min="${CONTAINER_TYPES[type].minHeight}" max="1600" step="10" data-container-field="h" data-container-type="${type}"></label>
    </div>
    <div class="container-inspector-actions">
      <button type="button" data-container-action="fit" data-container-type="${type}">内容に合わせる</button>
      <button type="button" data-container-action="focus" data-container-type="${type}">この範囲を見る</button>
    </div>
  </section>`;
}

function containerInstallInspector() {
  const phase = els['phase-inspector'];
  const group = els['group-inspector'];
  if (phase && !phase.querySelector('[data-container-inspector-geometry="phase"]')) {
    phase.querySelector('.form-stack')?.insertAdjacentHTML('afterend', '<p class="container-inspector-help">フェーズは大きな工程区分です。見出しをドラッグすると、中の囲みと付箋も一緒に動きます。</p>' + containerGeometrySectionHtml('phase'));
  }
  if (group && !group.querySelector('[data-container-inspector-geometry="group"]')) {
    group.querySelector('.form-stack')?.insertAdjacentHTML('afterend', '<p class="container-inspector-help">囲みは関連する付箋のまとまりです。ヘッダーをドラッグすると、中の付箋も一緒に動きます。</p>' + containerGeometrySectionHtml('group'));
  }
  if (els['delete-group']) {
    els['delete-group'].textContent = '囲みだけ解除';
    els['delete-group'].title = '中の付箋を残して囲みだけ削除します';
  }
}

function containerUpdateInspector() {
  containerInstallInspector();
  ['phase', 'group'].forEach((type) => {
    const item = selection.type === type ? containerGet(type, selection.id) : null;
    document.querySelectorAll(`[data-container-field][data-container-type="${type}"]`).forEach((input) => {
      input.disabled = !item || (type === 'group' && item.collapsed && ['w', 'h'].includes(input.dataset.containerField));
      if (item) input.value = Math.round(Number(item[input.dataset.containerField]) || 0);
    });
    document.querySelectorAll(`.container-inspector-geometry [data-container-action][data-container-type="${type}"]`).forEach((button) => {
      if (item) button.dataset.containerId = item.id;
      else delete button.dataset.containerId;
    });
  });
}

function containerCommitNumericField(type, id, field, rawValue) {
  const item = containerGet(type, id);
  const value = Number(rawValue);
  if (!item || !Number.isFinite(value) || !['x', 'y', 'w', 'h'].includes(field)) return;
  const labels = { x: 'X位置', y: 'Y位置', w: '幅', h: '高さ' };
  mutate(`${containerLabel(type)}の${labels[field]}を変更`, () => {
    if (field === 'x' || field === 'y') {
      const dx = field === 'x' ? value - item.x : 0;
      const dy = field === 'y' ? value - item.y : 0;
      containerMoveAndChildren(type, id, dx, dy);
      return;
    }
    const next = containerClampGeometry(type, id, {
      x: item.x,
      y: item.y,
      w: field === 'w' ? value : item.w,
      h: field === 'h' ? value : item.h
    }, { protectContents: true });
    containerApplyGeometry(type, id, next);
  });
}

function containerFocusInspectorField(type, id, field = 'title') {
  if (!containerGet(type, id)) return;
  selection = { type, id };
  state.settings ||= {};
  state.settings.workPanelTab = 'selection';
  state.settings.navigatorOpen = true;
  state.settings.inspectorOpen = false;
  renderAll();
  requestAnimationFrame(() => {
    const target = type === 'phase'
      ? els['phase-title-field']
      : field === 'color'
        ? els['group-color-field']
        : els['group-title-field'];
    target?.focus();
    target?.select?.();
  });
}

const renderInspectorBeforeContainerInspector = renderInspector;
renderInspector = function renderInspectorContainerInspector() {
  const result = renderInspectorBeforeContainerInspector();
  containerUpdateInspector();
  return result;
};

function containerInstallHelp() {
  const grid = els['help-dialog']?.querySelector('.shortcut-grid');
  if (!grid || grid.querySelector('[data-shortcut="container-edit"]')) return;
  grid.insertAdjacentHTML('beforeend', '<div data-shortcut="container-edit"><kbd>フェーズ／囲みを選択</kbd><span>見出し・ヘッダーで移動、四隅でサイズ変更。左の「選択」で数値編集</span></div>');
}

function containerBindInspector() {
  if (containerInspectorBound) return;
  containerInspectorBound = true;
  containerInstallInspector();
  containerInstallHelp();
  document.addEventListener('change', (event) => {
    const input = event.target.closest('[data-container-field]');
    if (!input) return;
    const type = input.dataset.containerType;
    const id = selection.type === type ? selection.id : '';
    if (id) containerCommitNumericField(type, id, input.dataset.containerField, input.value);
  });
  document.addEventListener('click', (event) => {
    const button = event.target.closest('.container-inspector-geometry [data-container-action]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    containerHandleAction(button);
  });
}

const bindEventsBeforeContainerInspector = bindEvents;
bindEvents = function bindEventsContainerInspector() {
  bindEventsBeforeContainerInspector();
  containerBindInspector();
};

const updateFlowExperienceUiBeforeContainerInspector = updateFlowExperienceUi;
updateFlowExperienceUi = function updateFlowExperienceUiContainerInspector() {
  updateFlowExperienceUiBeforeContainerInspector();
  containerUpdateInspector();
  const badge = document.querySelector('.version-badge');
  if (badge) badge.textContent = `v${FLOWMAP_CONTAINER_VERSION}`;
};

/* Keep a collapsed group's remembered expanded position aligned with its phase. */
const containerBeginPhaseMoveBeforeContainerInspectorPolish = containerBeginPhaseMove;
containerBeginPhaseMove = function containerBeginPhaseMoveInspectorPolish(event, header) {
  const result = containerBeginPhaseMoveBeforeContainerInspectorPolish(event, header);
  if (containerGesture?.kind === 'phase-move') {
    containerGesture.groupOrigins.forEach((origin) => {
      const item = getGroup(origin.id);
      origin.expandedBounds = item?.expandedBounds ? clone(item.expandedBounds) : null;
    });
  }
  return result;
};

const containerUpdateGestureBeforeContainerInspectorPolish = containerUpdateGesture;
containerUpdateGesture = function containerUpdateGestureInspectorPolish(event) {
  const active = containerGesture?.kind === 'phase-move' ? containerGesture : null;
  const result = containerUpdateGestureBeforeContainerInspectorPolish(event);
  if (active?.moved) {
    active.groupOrigins.forEach((origin) => {
      if (!origin.expandedBounds) return;
      const item = getGroup(origin.id);
      if (!item) return;
      const dx = item.x - origin.x;
      const dy = item.y - origin.y;
      item.expandedBounds = {
        ...origin.expandedBounds,
        x: origin.expandedBounds.x + dx,
        y: origin.expandedBounds.y + dy
      };
    });
  }
  return result;
};
