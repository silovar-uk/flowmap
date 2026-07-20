/* Flowmap v0.21.0 — final responsive and geometry safeguards */
let unifiedMeasuredGeometryFrame = 0;
let unifiedCompactViewport = window.innerWidth < 900;
let unifiedCompactListenersBound = false;
let unifiedCompactStartupApplied = false;

function unifiedPolishMultiToolbar() {
  const opener = document.querySelector('[data-open-alignment]');
  opener?.classList.add('multi-align-button');
  document.querySelectorAll('[data-multi-distribute]').forEach((button) => {
    const horizontal = button.dataset.multiDistribute === 'horizontal';
    button.title = unifiedCurrentSelectedIds().length < 3
      ? '等間隔は3件以上で利用できます'
      : horizontal
        ? '左右端を固定して横の余白を揃える'
        : '上下端を固定して縦の余白を揃える';
  });
  const openPanel = document.getElementById('open-navigator');
  if (openPanel) {
    openPanel.textContent = 'メニュー';
    openPanel.title = '工程・選択・関係メニューを開く';
  }
}

const unifiedUpdateMultiToolbarBeforeFinalPolish = unifiedUpdateMultiToolbar;
unifiedUpdateMultiToolbar = function unifiedUpdateMultiToolbarFinalPolish() {
  unifiedUpdateMultiToolbarBeforeFinalPolish();
  unifiedPolishMultiToolbar();
};

const renderNotesBeforeUnifiedFinalPolish = renderNotes;
renderNotes = function renderNotesUnifiedFinalPolish() {
  const result = renderNotesBeforeUnifiedFinalPolish();
  cancelAnimationFrame(unifiedMeasuredGeometryFrame);
  unifiedMeasuredGeometryFrame = requestAnimationFrame(() => {
    if (!state || !els['node-layer']) return;
    renderEdges();
    renderMinimap();
  });
  return result;
};

function unifiedApplyCompactEntry() {
  const compact = window.innerWidth < 900;
  if (compact && !unifiedCompactViewport && state?.settings) {
    state.settings.navigatorOpen = false;
    saveState();
    renderAll();
  }
  unifiedCompactViewport = compact;
}

function unifiedApplyCompactStartup() {
  if (unifiedCompactStartupApplied || !state?.settings) return;
  unifiedCompactStartupApplied = true;
  if (window.innerWidth < 900) state.settings.navigatorOpen = false;
  state.settings.inspectorOpen = false;
}

const renderAllBeforeUnifiedFinalPolish = renderAll;
renderAll = function renderAllUnifiedFinalPolish() {
  unifiedApplyCompactStartup();
  const result = renderAllBeforeUnifiedFinalPolish();
  unifiedPolishMultiToolbar();
  return result;
};

const bindEventsBeforeUnifiedFinalPolish = bindEvents;
bindEvents = function bindEventsUnifiedFinalPolish() {
  unifiedApplyCompactStartup();
  bindEventsBeforeUnifiedFinalPolish();
  if (!unifiedCompactListenersBound) {
    unifiedCompactListenersBound = true;
    window.addEventListener('resize', unifiedApplyCompactEntry);
  }
  unifiedPolishMultiToolbar();
};
