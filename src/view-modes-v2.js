/* Flowmap v0.19.0 — four-purpose workspace modes and readable canvas utilities */
const FLOWMAP_VIEW_MODES_V2 = new Set(['outline', 'build', 'check', 'present']);
const flowmapModeHooks = new Map();

function registerFlowmapMode(mode, hooks = {}) {
  if (!FLOWMAP_VIEW_MODES_V2.has(mode)) return;
  flowmapModeHooks.set(mode, hooks);
}

const normalizeBeforeViewModesV2 = normalizeFlowchartState;
normalizeFlowchartState = function normalizeViewModesV2(next) {
  const requestedMode = next?.settings?.viewMode;
  const normalized = normalizeBeforeViewModesV2(next);
  if (!normalized) return normalized;
  normalized.settings ||= {};
  normalized.settings.viewMode = FLOWMAP_VIEW_MODES_V2.has(requestedMode) ? requestedMode : (FLOWMAP_VIEW_MODES_V2.has(normalized.settings.viewMode) ? normalized.settings.viewMode : 'build');
  normalized.settings.writeTab = normalized.settings.writeTab === 'notation' ? 'notation' : 'tree';
  return normalized;
};

currentFlowMode = function currentFlowModeV2() {
  const mode = state?.settings?.viewMode;
  return FLOWMAP_VIEW_MODES_V2.has(mode) ? mode : 'build';
};

installFlowModeSwitch = function installFlowModeSwitchV2() {
  const toolbar = document.querySelector('.toolbar-view');
  if (!toolbar) return;
  let switcher = document.getElementById('flow-mode-switch');
  if (!switcher) {
    switcher = document.createElement('div');
    switcher.id = 'flow-mode-switch';
    switcher.className = 'flow-mode-switch';
    switcher.setAttribute('aria-label', '作業モード');
    toolbar.prepend(switcher);
  }
  switcher.innerHTML = `
    <button type="button" data-flow-mode="outline" title="文章と階層で工程を組み立てる">書く</button>
    <button type="button" data-flow-mode="build" title="図形と接続を作る">作る</button>
    <button type="button" data-flow-mode="check" title="状態と補足を確認する">確認</button>
    <button type="button" data-flow-mode="present" title="工程を順番に説明する">見せる</button>`;
};

function flowmapModeLabel(mode) {
  return ({ outline: '書く', build: '作る', check: '確認する', present: '見せる' })[mode] || '作る';
}

setFlowMode = function setFlowModeV2(mode) {
  if (!FLOWMAP_VIEW_MODES_V2.has(mode) || currentFlowMode() === mode) return;
  const previous = currentFlowMode();
  flowmapModeHooks.get(previous)?.leave?.(mode);
  if (typeof stopFlowPlayback === 'function') stopFlowPlayback({ keepFocus: false, render: false });

  state.settings ||= {};
  if (mode === 'present') {
    state.settings.beforePresentNavigatorOpen = state.settings.navigatorOpen;
    state.settings.beforePresentInspectorOpen = state.settings.inspectorOpen;
    state.settings.navigatorOpen = false;
    state.settings.inspectorOpen = false;
  } else if (previous === 'present') {
    state.settings.navigatorOpen = state.settings.beforePresentNavigatorOpen !== false;
    state.settings.inspectorOpen = state.settings.beforePresentInspectorOpen !== false;
  }
  state.settings.viewMode = mode;
  saveState();
  renderAll();
  flowmapModeHooks.get(mode)?.enter?.(previous);
  toast(`${flowmapModeLabel(mode)}モードへ切り替えました`);
};

function installCanvasUtilityLabels() {
  const items = [
    [els['center-selection'], '◎', '選択へ', '選択した図形、または図全体へ移動'],
    [els['toggle-grid'], '⌗', '方眼', '方眼の表示を切り替え'],
    [els['help-button'], '?', '操作', '操作一覧を開く']
  ];
  items.forEach(([button, icon, label, title]) => {
    if (!button) return;
    button.classList.add('canvas-utility-labeled');
    button.title = title;
    button.innerHTML = `<span aria-hidden="true">${icon}</span><small>${label}</small>`;
  });
}

const updateFlowExperienceUiBeforeViewModesV2 = updateFlowExperienceUi;
updateFlowExperienceUi = function updateFlowExperienceUiV2() {
  installFlowModeSwitch();
  updateFlowExperienceUiBeforeViewModesV2();
  const mode = currentFlowMode();
  els.app.dataset.viewMode = mode;
  document.body.dataset.flowMode = mode;
  document.querySelectorAll('[data-flow-mode]').forEach((button) => {
    const active = button.dataset.flowMode === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  installCanvasUtilityLabels();
  const badge = document.querySelector('.version-badge');
  if (badge) badge.textContent = 'v0.19.0';
};

const bindFlowExperienceEventsBeforeViewModesV2 = bindFlowExperienceEvents;
bindFlowExperienceEvents = function bindFlowExperienceEventsV2() {
  bindFlowExperienceEventsBeforeViewModesV2();
  const switcher = document.getElementById('flow-mode-switch');
  if (switcher && switcher.dataset.v2Bound !== 'true') {
    switcher.dataset.v2Bound = 'true';
    switcher.addEventListener('click', (event) => {
      const button = event.target.closest('[data-flow-mode]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setFlowMode(button.dataset.flowMode);
    }, true);
  }
};
