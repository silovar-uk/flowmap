/* Flowmap v0.21.0 — unified left work panel, reliable multi-selection and responsive canvas */
const FLOWMAP_UNIFIED_VERSION = '0.21.0';
const UNIFIED_PANEL_TABS = new Set(['outline', 'selection', 'relation']);
const NOTE_APPEARANCE_COLORS = new Set(['auto', 'yellow', 'blue', 'green', 'pink', 'purple', 'gray', 'white']);
const NOTE_WIDTH_PRESETS = {
  auto: null,
  compact: 160,
  standard: 224,
  wide: 300,
  long: 400,
  xlong: 520
};
const NOTE_WIDTH_LABELS = {
  auto: '自動',
  compact: '小',
  standard: '標準',
  wide: '横長',
  long: '長横',
  xlong: '特長'
};
const NOTE_COLOR_LABELS = {
  auto: '自動',
  yellow: '黄',
  blue: '青',
  green: '緑',
  pink: '桃',
  purple: '紫',
  gray: '灰',
  white: '白'
};

let unifiedUiState = {
  installed: false,
  bound: false,
  panelTab: 'outline',
  lastSelectionKey: '',
  popover: null,
  stageRect: null,
  resizeTimer: null,
  initialVisibilityChecked: false
};

function unifiedNormalizeColor(value) {
  return NOTE_APPEARANCE_COLORS.has(value) ? value : 'auto';
}

function unifiedWidthPresetFor(item) {
  if (NOTE_WIDTH_PRESETS[item?.widthPreset] !== undefined) return item.widthPreset;
  const width = Number(item?.customWidth);
  if (!Number.isFinite(width) || width <= 0) return 'auto';
  const match = Object.entries(NOTE_WIDTH_PRESETS).find(([, value]) => value === width);
  return match?.[0] || 'custom';
}

const normalizeBeforeUnifiedPanel = normalizeFlowchartState;
normalizeFlowchartState = function normalizeUnifiedPanelState(next) {
  const normalized = normalizeBeforeUnifiedPanel(next);
  if (!normalized) return normalized;
  normalized.settings ||= {};
  normalized.settings.workPanelTab = UNIFIED_PANEL_TABS.has(normalized.settings.workPanelTab)
    ? normalized.settings.workPanelTab
    : 'outline';
  normalized.settings.inspectorOpen = false;
  (normalized.notes || []).forEach((item) => {
    item.appearanceColor = unifiedNormalizeColor(item.appearanceColor);
    item.widthPreset = unifiedWidthPresetFor(item);
  });
  return normalized;
};

const noteBeforeUnifiedPanel = note;
note = function noteUnifiedPanel(id, title, x, y, phaseId, groupId, extra = {}) {
  const item = noteBeforeUnifiedPanel(id, title, x, y, phaseId, groupId, extra);
  item.appearanceColor = unifiedNormalizeColor(extra.appearanceColor);
  item.widthPreset = NOTE_WIDTH_PRESETS[extra.widthPreset] !== undefined ? extra.widthPreset : unifiedWidthPresetFor(item);
  return item;
};

function unifiedCurrentSelectedIds() {
  return typeof validSelectedNoteIds === 'function' ? validSelectedNoteIds() : [];
}

function unifiedAppearanceColor(item) {
  return unifiedNormalizeColor(item?.appearanceColor);
}

function unifiedApplyRenderedCardAppearance() {
  state.notes.forEach((item) => {
    const card = els['node-layer']?.querySelector(`[data-note-id="${item.id}"]`);
    if (!card) return;
    card.dataset.noteColor = unifiedAppearanceColor(item);
    card.dataset.widthPreset = unifiedWidthPresetFor(item);
    const size = typeof alignmentResolvedSize === 'function'
      ? alignmentResolvedSize(item)
      : noteDisplaySize(item);
    card.style.width = `${size.w}px`;
    if (Number.isFinite(Number(item.customHeight)) && Number(item.customHeight) > 0) {
      card.style.height = `${size.h}px`;
      card.style.minHeight = `${size.h}px`;
    } else {
      card.style.height = 'auto';
      card.style.minHeight = `${size.h}px`;
    }
    card.classList.toggle('has-custom-size', Boolean(item.customWidth || item.customHeight));
  });
}

if (typeof alignmentApplyRenderedSizes === 'function') {
  alignmentApplyRenderedSizes = unifiedApplyRenderedCardAppearance;
}

const noteDisplaySizeBeforeUnifiedPanel = noteDisplaySize;
noteDisplaySize = function noteDisplaySizeUnifiedPanel(item) {
  const base = noteDisplaySizeBeforeUnifiedPanel(item);
  if (!item || Number(item.customHeight) > 0) return base;
  const card = els['node-layer']?.querySelector(`[data-note-id="${item.id}"]`);
  const renderedHeight = Number(card?.offsetHeight);
  return Number.isFinite(renderedHeight) && renderedHeight > base.h
    ? { ...base, h: renderedHeight }
    : base;
};

function unifiedPanelTabForSelection() {
  if (selection.type === 'edge') return 'relation';
  if (selection.type && selection.id) return 'selection';
  if (unifiedCurrentSelectedIds().length > 1) return 'selection';
  return 'outline';
}

function unifiedPaneHtml(tab) {
  return `<section class="work-panel-pane" data-work-panel-pane="${tab}" hidden></section>`;
}

function unifiedInstallPanel() {
  if (unifiedUiState.installed || !els.navigator || !els.inspector) return;
  unifiedUiState.installed = true;
  const navigator = els.navigator;
  navigator.classList.add('work-panel');
  navigator.setAttribute('aria-label', '工程と選択項目の編集');

  const oldHeader = navigator.querySelector('.panel-header');
  if (oldHeader) {
    oldHeader.classList.add('work-panel-header');
    oldHeader.innerHTML = `
      <div><span class="panel-kicker">WORK</span><h2 id="work-panel-heading">工程</h2></div>
      <button id="collapse-navigator" class="icon-button subtle" type="button" title="閉じる">‹</button>`;
    els['collapse-navigator'] = oldHeader.querySelector('#collapse-navigator');
  }

  const tabs = document.createElement('div');
  tabs.id = 'work-panel-tabs';
  tabs.className = 'work-panel-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.innerHTML = `
    <button type="button" data-work-panel-tab="outline" role="tab">工程</button>
    <button type="button" data-work-panel-tab="selection" role="tab">選択</button>
    <button type="button" data-work-panel-tab="relation" role="tab">関係</button>`;
  oldHeader?.after(tabs);

  const outlinePane = document.createElement('section');
  outlinePane.className = 'work-panel-pane work-panel-outline-pane';
  outlinePane.dataset.workPanelPane = 'outline';
  [navigator.querySelector('.navigator-search-wrap'), els['structure-tree'], navigator.querySelector('.navigator-footer')]
    .filter(Boolean)
    .forEach((node) => outlinePane.append(node));
  navigator.append(outlinePane);

  navigator.insertAdjacentHTML('beforeend', unifiedPaneHtml('selection') + unifiedPaneHtml('relation'));
  const selectionPane = navigator.querySelector('[data-work-panel-pane="selection"]');
  const relationPane = navigator.querySelector('[data-work-panel-pane="relation"]');

  [els['inspector-empty'], els['node-inspector'], els['group-inspector'], els['phase-inspector']]
    .filter(Boolean)
    .forEach((node) => selectionPane.append(node));
  if (els['edge-inspector']) relationPane.append(els['edge-inspector']);
  relationPane.insertAdjacentHTML('beforeend', '<div id="relation-panel-empty" class="work-panel-empty"><strong>矢印を選択</strong><span>接続元、接続先、向き、削除をここで編集します。</span></div>');

  els.inspector.hidden = true;
  els.inspector.setAttribute('aria-hidden', 'true');
  state.settings.inspectorOpen = false;

  if (typeof ensureInformationInspector === 'function') ensureInformationInspector();
  unifiedInstallAppearanceEditor();
  unifiedCompactInspectorFields();

  if (Array.isArray(FLOWMAP_TUTORIAL_STEPS) && FLOWMAP_TUTORIAL_STEPS[3]) {
    FLOWMAP_TUTORIAL_STEPS[3].selector = '#work-panel-tabs';
    FLOWMAP_TUTORIAL_STEPS[3].title = '4. 左側で詳細を編集する';
    FLOWMAP_TUTORIAL_STEPS[3].body = '「選択」では図形、色、幅、期限、担当を編集し、「関係」では矢印を編集します。';
  }
}

function unifiedCompactInspectorFields() {
  const fullWidthIds = ['field-summary', 'field-tags', 'field-link', 'field-note'];
  fullWidthIds.forEach((id) => document.getElementById(id)?.closest('label')?.classList.add('work-field-wide'));
  document.getElementById('field-location')?.closest('label')?.classList.add('work-field-wide-on-small');
}

function unifiedInstallAppearanceEditor() {
  const detailStack = document.querySelector('#node-inspector [data-tab-panel="detail"] .form-stack');
  if (!detailStack || document.getElementById('note-appearance-editor')) return;
  const section = document.createElement('section');
  section.id = 'note-appearance-editor';
  section.className = 'note-appearance-editor work-field-wide';
  section.innerHTML = `
    <div class="appearance-field">
      <span>付箋の色</span>
      <div class="appearance-color-grid" role="radiogroup" aria-label="付箋の色">
        ${Object.entries(NOTE_COLOR_LABELS).map(([value, label]) => `<button type="button" data-note-color="${value}" title="${label}" aria-label="${label}"><i data-color="${value}"></i><small>${label}</small></button>`).join('')}
      </div>
    </div>
    <label class="appearance-field"><span>横幅</span><div class="appearance-width-row"><select id="field-note-width-preset">
      ${Object.entries(NOTE_WIDTH_LABELS).map(([value, label]) => `<option value="${value}">${label}${NOTE_WIDTH_PRESETS[value] ? `（${NOTE_WIDTH_PRESETS[value]}px）` : ''}</option>`).join('')}
      <option value="custom">自由設定</option>
    </select><input id="field-note-width-custom" type="number" min="120" max="900" step="10" aria-label="付箋の横幅を数値指定"><span>px</span></div><small>幅だけ変更し、高さは文章量に合わせます。</small></label>`;
  detailStack.prepend(section);
}

function unifiedRenderAppearanceEditor() {
  const item = selection.type === 'note' ? getNote(selection.id) : null;
  const editor = document.getElementById('note-appearance-editor');
  if (!editor) return;
  editor.hidden = !item;
  if (!item) return;
  editor.querySelectorAll('[data-note-color]').forEach((button) => {
    const active = button.dataset.noteColor === unifiedAppearanceColor(item);
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-checked', String(active));
  });
  const preset = unifiedWidthPresetFor(item);
  const width = document.getElementById('field-note-width-preset');
  if (width) width.value = preset;
  const custom = document.getElementById('field-note-width-custom');
  if (custom) {
    custom.value = Math.round(Number(item.customWidth) || (typeof alignmentResolvedSize === 'function' ? alignmentResolvedSize(item).w : noteDisplaySize(item).w));
    custom.hidden = preset !== 'custom';
    custom.nextElementSibling?.toggleAttribute('hidden', preset !== 'custom');
  }
}

function unifiedSwitchPanelTab(tab, { save = true, open = save } = {}) {
  const resolved = UNIFIED_PANEL_TABS.has(tab) ? tab : 'outline';
  unifiedUiState.panelTab = resolved;
  if (state?.settings) {
    state.settings.workPanelTab = resolved;
    if (open && ['build', 'check'].includes(currentFlowMode())) state.settings.navigatorOpen = true;
    state.settings.inspectorOpen = false;
  }
  document.querySelectorAll('[data-work-panel-tab]').forEach((button) => {
    const active = button.dataset.workPanelTab === resolved;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-work-panel-pane]').forEach((pane) => {
    pane.hidden = pane.dataset.workPanelPane !== resolved;
  });
  const heading = document.getElementById('work-panel-heading');
  if (heading) heading.textContent = ({ outline: '工程', selection: '選択', relation: '関係' })[resolved];
  if (save) saveState();
}

function unifiedRenderPanel() {
  unifiedInstallPanel();
  unifiedInstallAppearanceEditor();
  unifiedCompactInspectorFields();
  const selectionKey = `${selection.type || ''}:${selection.id || ''}:${unifiedCurrentSelectedIds().join('|')}`;
  if (selectionKey !== unifiedUiState.lastSelectionKey) {
    unifiedUiState.lastSelectionKey = selectionKey;
    unifiedUiState.panelTab = unifiedPanelTabForSelection();
    if (state?.settings) state.settings.workPanelTab = unifiedUiState.panelTab;
  } else if (UNIFIED_PANEL_TABS.has(state?.settings?.workPanelTab)) {
    unifiedUiState.panelTab = state.settings.workPanelTab;
  }
  unifiedSwitchPanelTab(unifiedUiState.panelTab, { save: false, open: false });
  const relationEmpty = document.getElementById('relation-panel-empty');
  if (relationEmpty) relationEmpty.hidden = selection.type === 'edge' && Boolean(selection.id);
  unifiedRenderAppearanceEditor();
}
