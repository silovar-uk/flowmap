/* Flowmap v0.28.1 — focused fixes for reading view, PNG export and data I/O */
'use strict';

let flowmapPngExportInFlightV0281 = false;
let flowmapHtml2CanvasPromiseV0281 = null;
const FLOWMAP_HTML2CANVAS_SRC_V0281 = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';

function ensureCleanViewExitButtonV0281() {
  let button = document.getElementById('clean-view-exit-button-v28');
  if (button) return button;
  button = document.createElement('button');
  button.id = 'clean-view-exit-button-v28';
  button.type = 'button';
  button.className = 'clean-view-exit-button-v28';
  button.textContent = '編集画面に戻る';
  button.hidden = true;
  button.addEventListener('click', () => setCleanViewV28(false));
  document.body.append(button);
  return button;
}

function syncCleanViewUiV0281() {
  const active = typeof isCleanViewV28 === 'function' && isCleanViewV28();
  const toggle = document.getElementById('clean-view-button');
  const exit = ensureCleanViewExitButtonV0281();
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(active));
    toggle.classList.toggle('is-active', active);
    toggle.textContent = '閲覧表示';
    toggle.title = '編集UIを隠して、ボードだけを表示';
  }
  exit.hidden = !active;
}

setCleanViewV28 = function setCleanViewV0281(enabled) {
  const next = Boolean(enabled);
  if (next && typeof currentFlowMode === 'function' && currentFlowMode() === 'outline') {
    toast('閲覧表示は「ボード」「進捗確認」「プレゼン」で利用できます');
    return false;
  }
  if (next) document.body.dataset.cleanView = 'true';
  else delete document.body.dataset.cleanView;
  syncCleanViewUiV0281();
  return true;
};

installCleanViewV28 = function installCleanViewV0281() {
  const toolbar = document.querySelector('.toolbar-view');
  const dataButton = document.getElementById('data-button');
  if (!toolbar || !dataButton) return;

  let button = document.getElementById('clean-view-button');
  if (!button) {
    button = document.createElement('button');
    button.id = 'clean-view-button';
    button.className = 'button quiet';
    button.type = 'button';
    button.setAttribute('aria-pressed', 'false');
    toolbar.insertBefore(button, dataButton);
    button.addEventListener('click', () => setCleanViewV28(!isCleanViewV28()));
  }
  ensureCleanViewExitButtonV0281();
  syncCleanViewUiV0281();

  if (document.documentElement.dataset.cleanViewKeysBoundV0281 === 'true') return;
  document.documentElement.dataset.cleanViewKeysBoundV0281 = 'true';
  document.addEventListener('keydown', (event) => {
    const editing = event.target instanceof Element && event.target.matches('input,textarea,select,[contenteditable="true"]');
    if (event.key === 'Escape' && isCleanViewV28()) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setCleanViewV28(false);
      return;
    }
    if (!editing && event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      setCleanViewV28(!isCleanViewV28());
    }
  }, true);
};

function setPngExportBusyV0281(busy) {
  const button = document.getElementById('export-png-v28');
  if (!button) return;
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
  button.innerHTML = busy
    ? '<strong>PNGを作成中…</strong><span>ボード全体を画像へ変換しています</span>'
    : '<strong>PNGにする</strong><span>ボード全体を画像として保存</span>';
}

function waitForNextPaintV0281() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function withTimeoutV0281(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function canvasToPngBlobV0281(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('PNGを生成できませんでした'));
      resolve(blob);
    }, 'image/png');
  });
}

function loadHtml2CanvasV0281() {
  if (typeof window.html2canvas === 'function') return Promise.resolve(window.html2canvas);
  if (flowmapHtml2CanvasPromiseV0281) return flowmapHtml2CanvasPromiseV0281;
  flowmapHtml2CanvasPromiseV0281 = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-flowmap-html2canvas]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.html2canvas), { once: true });
      existing.addEventListener('error', () => reject(new Error('PNG描画ライブラリを読み込めませんでした')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = FLOWMAP_HTML2CANVAS_SRC_V0281;
    script.dataset.flowmapHtml2canvas = 'true';
    script.crossOrigin = 'anonymous';
    script.addEventListener('load', () => {
      if (typeof window.html2canvas !== 'function') return reject(new Error('PNG描画ライブラリを初期化できませんでした'));
      resolve(window.html2canvas);
    }, { once: true });
    script.addEventListener('error', () => reject(new Error('PNG描画ライブラリを読み込めませんでした')), { once: true });
    document.head.append(script);
  }).catch((error) => {
    flowmapHtml2CanvasPromiseV0281 = null;
    throw error;
  });
  return flowmapHtml2CanvasPromiseV0281;
}

function createPngCaptureRootV0281(bounds) {
  const worldClone = sanitizeExportCloneV28(els.world.cloneNode(true));
  worldClone.style.position = 'absolute';
  worldClone.style.left = `${-bounds.x}px`;
  worldClone.style.top = `${-bounds.y}px`;
  worldClone.style.transform = 'none';

  const root = document.createElement('div');
  root.className = 'stage flowmap-png-root-v28';
  root.style.position = 'fixed';
  root.style.left = '-100000px';
  root.style.top = '0';
  root.style.width = `${bounds.width}px`;
  root.style.height = `${bounds.height}px`;
  root.style.overflow = 'hidden';
  root.style.pointerEvents = 'none';
  root.style.zIndex = '-1';

  const stageStyle = getComputedStyle(els.stage);
  root.style.backgroundColor = stageStyle.backgroundColor;
  root.style.backgroundImage = stageStyle.backgroundImage;
  root.style.backgroundSize = stageStyle.backgroundSize;
  root.style.backgroundPosition = stageStyle.backgroundPosition;
  copyCssVariablesV28(document.documentElement, root);
  root.append(worldClone);
  document.body.append(root);
  return root;
}

async function renderBoardPngWithHtml2CanvasV0281(bounds) {
  const html2canvas = await withTimeoutV0281(loadHtml2CanvasV0281(), 10000, 'PNG描画ライブラリの読み込みがタイムアウトしました');
  const captureRoot = createPngCaptureRootV0281(bounds);
  try {
    await waitForNextPaintV0281();
    const scale = exportScaleV28(bounds.width, bounds.height);
    const canvas = await withTimeoutV0281(html2canvas(captureRoot, {
      backgroundColor: getComputedStyle(els.stage).backgroundColor || '#ffffff',
      width: bounds.width,
      height: bounds.height,
      scale,
      useCORS: true,
      allowTaint: false,
      logging: false,
      removeContainer: true,
      imageTimeout: 8000
    }), 20000, 'PNGの描画がタイムアウトしました');
    return await canvasToPngBlobV0281(canvas);
  } finally {
    captureRoot.remove();
  }
}

async function renderBoardPngNativeV0281(bounds) {
  const worldClone = sanitizeExportCloneV28(els.world.cloneNode(true));
  worldClone.style.position = 'absolute';
  worldClone.style.left = `${-bounds.x}px`;
  worldClone.style.top = `${-bounds.y}px`;

  const root = document.createElement('div');
  root.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  root.className = 'flowmap-png-root-v28';
  root.style.position = 'relative';
  root.style.width = `${bounds.width}px`;
  root.style.height = `${bounds.height}px`;
  root.style.overflow = 'hidden';
  const stageStyle = getComputedStyle(els.stage);
  root.style.backgroundColor = stageStyle.backgroundColor;
  root.style.backgroundImage = stageStyle.backgroundImage;
  root.style.backgroundSize = stageStyle.backgroundSize;
  root.style.backgroundPosition = stageStyle.backgroundPosition;
  copyCssVariablesV28(document.documentElement, root);

  const style = document.createElement('style');
  style.textContent = `${collectExportCssV28()}\n.flowmap-png-root-v28 .node-quick-actions,.flowmap-png-root-v28 .connector-handle,.flowmap-png-root-v28 .edge-endpoint{display:none!important}`;
  root.append(style, worldClone);

  const xhtml = new XMLSerializer().serializeToString(root);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}"><foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await withTimeoutV0281(new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('PNG用の描画を生成できませんでした'));
      image.src = svgUrl;
    }), 10000, 'PNG用の描画がタイムアウトしました');

    const scale = exportScaleV28(bounds.width, bounds.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bounds.width * scale));
    canvas.height = Math.max(1, Math.round(bounds.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvasを初期化できませんでした');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await canvasToPngBlobV0281(canvas);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

exportBoardPngV28 = async function exportBoardPngV0281() {
  if (!state || flowmapPngExportInFlightV0281) return;
  flowmapPngExportInFlightV0281 = true;
  const viewportBefore = clone(state.viewport);
  const selectionBefore = clone(selection);
  const selectedBefore = typeof selectedNoteIds !== 'undefined' ? new Set(selectedNoteIds) : null;
  const cleanBefore = isCleanViewV28();
  document.body.dataset.exporting = 'true';
  setPngExportBusyV0281(true);
  toast('PNGを作成しています…');
  try {
    state.viewport = { ...state.viewport, x: 0, y: 0, scale: 1 };
    selection = { type: null, id: null };
    if (typeof selectedNoteIds !== 'undefined') selectedNoteIds = new Set();
    renderAll();
    await waitForNextPaintV0281();

    const bounds = boardExportBoundsV28();
    if (!bounds) throw new Error('書き出す図形がありません');

    let blob;
    try {
      blob = await renderBoardPngWithHtml2CanvasV0281(bounds);
      console.info('[Flowmap] PNG export renderer: html2canvas');
    } catch (primaryError) {
      console.warn('[Flowmap] html2canvas PNG export failed; trying native fallback', primaryError);
      blob = await renderBoardPngNativeV0281(bounds);
      console.info('[Flowmap] PNG export renderer: native foreignObject fallback');
    }

    if (!blob || !blob.size) throw new Error('PNGを生成できませんでした');
    downloadBlobV28(pngFilenameV28(), blob);
    toast('PNGを書き出しました');
  } catch (error) {
    console.error('[Flowmap] PNG export failed', error);
    toast(error?.message || 'PNGを書き出せませんでした');
  } finally {
    state.viewport = viewportBefore;
    selection = selectionBefore;
    if (typeof selectedNoteIds !== 'undefined' && selectedBefore) selectedNoteIds = selectedBefore;
    renderAll();
    if (cleanBefore) document.body.dataset.cleanView = 'true';
    else delete document.body.dataset.cleanView;
    syncCleanViewUiV0281();
    delete document.body.dataset.exporting;
    flowmapPngExportInFlightV0281 = false;
    setPngExportBusyV0281(false);
  }
};

function normalizeImportedStateV0281(data) {
  const imported = normalizeFlowchartState({ ...data, version: 7 });
  imported.settings ||= {};
  imported.settings.viewMode = 'build';
  imported.settings.navigatorOpen = true;
  imported.settings.inspectorOpen = false;
  return imported;
}

async function applyImportedStateV0281(imported, mode, name = '読み込んだボード') {
  if (mode === 'replace') {
    undoStack.push(snapshot());
    state = imported;
    redoStack.length = 0;
    selection = { type: null, id: null };
    saveState();
    renderAll();
    toast('現在のボードを読み込んだデータで置き換えました');
    return;
  }

  await flushStateSave();
  const boardId = createBoardId();
  const record = await persistStateImmediately(imported, { boardId, name, activate: true });
  await switchToBoardRecord(record);
  if (typeof updateBoardManagementState === 'function') updateBoardManagementState();
  requestAnimationFrame(() => fitView());
  toast('新しいボードとして読み込みました');
}

importTextDataV28 = async function importTextDataV0281() {
  const textarea = document.getElementById('import-text-v28');
  const text = textarea?.value.trim();
  if (!text) return toast('読み込むJSON / YAMLを貼り付けてください');
  try {
    let data;
    try {
      data = JSON.parse(text);
    } catch (jsonError) {
      if (!window.jsyaml) throw jsonError;
      data = window.jsyaml.load(text);
    }
    validateImport(data);
    const imported = normalizeImportedStateV0281(data);
    const mode = document.querySelector('input[name="import-mode"]:checked')?.value || 'new';
    await applyImportedStateV0281(imported, mode);
    document.getElementById('data-dialog')?.close();
    if (textarea) textarea.value = '';
  } catch (error) {
    console.error('[Flowmap] Text import failed', error);
    toast('JSON / YAMLを読み込めませんでした');
  }
};

function createImportModeChoiceV0281() {
  const mode = document.createElement('fieldset');
  mode.className = 'import-mode-choice';
  mode.innerHTML = `
    <legend>読み込み方法</legend>
    <label><input type="radio" name="import-mode" value="new" checked><span><strong>新しいボードとして読み込む</strong><small>現在のボードを残す、安全な方法</small></span></label>
    <label><input type="radio" name="import-mode" value="replace"><span><strong>現在のボードを置き換える</strong><small>今の内容は読み込んだデータに変わります</small></span></label>`;
  return mode;
}

function configureDataWorkspaceLabelsV0281(dialog = document.getElementById('data-dialog')) {
  const dataButton = document.getElementById('data-button');
  if (dataButton) {
    dataButton.textContent = '入出力';
    dataButton.title = 'PNG・PDF・JSON・YAMLの書き出しとデータの読み込み';
  }
  if (!dialog) return;
  const title = dialog.querySelector('header h2');
  if (title) title.textContent = '入出力';
  const kicker = dialog.querySelector('header span');
  if (kicker) kicker.textContent = 'FILES';

  const pdf = document.getElementById('export-pdf-card');
  if (pdf) {
    pdf.querySelector('strong')?.replaceChildren('PDFにする');
    pdf.querySelector('span')?.replaceChildren('共有・印刷用のPDFを作成');
  }
  const json = document.getElementById('export-json');
  if (json) {
    json.querySelector('strong')?.replaceChildren('JSONを書き出す');
    json.querySelector('span')?.replaceChildren('完全なバックアップ');
  }
  const yaml = document.getElementById('export-yaml');
  if (yaml) {
    yaml.querySelector('strong')?.replaceChildren('YAMLを書き出す');
    yaml.querySelector('span')?.replaceChildren('テキスト編集しやすい形式');
  }
  const reset = document.getElementById('reset-sample');
  if (reset) {
    reset.querySelector('strong')?.replaceChildren('サンプルを読み込む');
    reset.querySelector('span')?.replaceChildren('現在のボードをサンプルで置き換える');
  }
  const clear = document.getElementById('clear-all-button');
  if (clear) {
    clear.querySelector('strong')?.replaceChildren('現在のボードを空にする');
    clear.querySelector('span')?.replaceChildren('工程・囲み・矢印をすべて削除');
  }
}

installDataWorkspaceV28 = function installDataWorkspaceV0281() {
  const dialog = document.getElementById('data-dialog');
  if (!dialog) return;
  if (dialog.querySelector('.data-layout-v28')) {
    configureDataWorkspaceLabelsV0281(dialog);
    return;
  }

  const oldGrid = dialog.querySelector('.dialog-grid');
  if (!oldGrid) return;

  const png = document.createElement('button');
  png.id = 'export-png-v28';
  png.type = 'button';
  png.innerHTML = '<strong>PNGにする</strong><span>ボード全体を画像として保存</span>';
  png.addEventListener('click', () => { void exportBoardPngV28(); });

  const exportSection = dataSectionV28('書き出す', '共有・バックアップ用のファイルを作成');
  const importSection = dataSectionV28('読み込む', 'JSON / YAMLからボードへ取り込む');
  const manageSection = dataSectionV28('データ管理', '現在のボード内容を変更する操作', 'is-danger-v28');
  const exportGrid = exportSection.querySelector('.data-section-grid-v28');
  const importGrid = importSection.querySelector('.data-section-grid-v28');
  const manageGrid = manageSection.querySelector('.data-section-grid-v28');

  const pdf = document.getElementById('export-pdf-card');
  const json = document.getElementById('export-json');
  const yaml = document.getElementById('export-yaml');
  const fileInput = document.getElementById('import-file');
  const fileCard = fileInput?.closest('label');
  const reset = document.getElementById('reset-sample');
  const clear = document.getElementById('clear-all-button');
  [png, pdf, json, yaml].filter(Boolean).forEach((node) => exportGrid.append(node));

  const existingModeChoice = oldGrid.querySelector('.import-mode-choice') || dialog.querySelector('.import-mode-choice');
  const modeChoice = existingModeChoice || createImportModeChoiceV0281();
  importSection.insertBefore(modeChoice, importGrid);

  if (fileCard) {
    fileCard.classList.add('data-file-card-v28');
    const strong = fileCard.querySelector('strong');
    const span = fileCard.querySelector('span');
    if (strong) strong.textContent = 'ファイルを選ぶ';
    if (span) span.textContent = 'JSON / YAMLファイルを読み込む';
    importGrid.append(fileCard);
  }

  const pasteCard = document.createElement('div');
  pasteCard.className = 'data-paste-card-v28';
  pasteCard.innerHTML = '<strong>テキストを貼り付ける</strong><span>JSON / YAMLを直接貼り付け</span><textarea id="import-text-v28" rows="6" spellcheck="false" placeholder="{ ... } または YAML"></textarea><button id="import-text-button-v28" type="button">貼り付け内容を読み込む</button>';
  importGrid.append(pasteCard);
  pasteCard.querySelector('#import-text-button-v28').addEventListener('click', () => { void importTextDataV28(); });

  [reset, clear].filter(Boolean).forEach((node) => manageGrid.append(node));
  const layout = document.createElement('div');
  layout.className = 'data-layout-v28';
  layout.append(exportSection, importSection, manageSection);
  oldGrid.replaceWith(layout);

  configureDataWorkspaceLabelsV0281(dialog);
};

window.configureDataWorkspaceLabelsV28 = configureDataWorkspaceLabelsV0281;
window.syncCleanViewUiV28 = syncCleanViewUiV0281;
