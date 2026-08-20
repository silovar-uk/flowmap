/* Flowmap v0.28 — startup board chooser, clean view, board PNG export and data workspace */
let flowmapBootState = 'loading';
let flowmapExperienceInstalledV28 = false;

function currentFlowmapBootState() {
  return flowmapBootState;
}

async function resolveFlowmapStartupRecord() {
  let record = await resolveActiveBoardRecord();
  if (!record) record = await migrateLocalStorageBoard();
  return record;
}

function ensureStartupBoardDialogV28() {
  let dialog = document.getElementById('startup-board-dialog');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'startup-board-dialog';
  dialog.className = 'app-dialog startup-board-dialog-v28';
  dialog.innerHTML = `
    <div class="startup-board-card-v28" role="document">
      <span class="startup-kicker-v28">START</span>
      <h2>新しいボードを開きますか？</h2>
      <p>前回のボードが残っています。新しく始めるか、前回の続きから始めるか選んでください。</p>
      <div class="startup-board-actions-v28">
        <button type="button" class="startup-new-v28" data-startup-choice="new">
          <span aria-hidden="true">＋</span><strong>新しいボード</strong><small>前回のボードはそのまま残します</small>
        </button>
        <button type="button" class="startup-previous-v28" data-startup-choice="previous">
          <span aria-hidden="true">↶</span><strong>前回のボードを開く</strong><small id="startup-previous-board-name"></small>
        </button>
      </div>
    </div>`;
  dialog.addEventListener('cancel', (event) => event.preventDefault());
  document.body.append(dialog);
  return dialog;
}

function chooseStartupBoardV28(record) {
  const dialog = ensureStartupBoardDialogV28();
  const name = document.getElementById('startup-previous-board-name');
  if (name) name.textContent = `「${boardRecordName(record)}」の続きから開始`;
  flowmapBootState = 'choosingBoard';
  dialog.showModal();
  return new Promise((resolve) => {
    const onClick = (event) => {
      const button = event.target.closest('[data-startup-choice]');
      if (!button) return;
      dialog.removeEventListener('click', onClick);
      dialog.close();
      resolve(button.dataset.startupChoice);
    };
    dialog.addEventListener('click', onClick);
  });
}

async function prepareFlowmapStartup() {
  flowmapBootState = 'loading';
  try {
    const previous = await resolveFlowmapStartupRecord();
    if (!previous) {
      flowmapBootState = 'ready';
      return { mode: 'first-run', record: null };
    }
    const choice = await chooseStartupBoardV28(previous);
    if (choice === 'new') {
      const boardId = createBoardId();
      const record = await persistStateImmediately(blankBoardState(), {
        boardId,
        name: '新しいボード',
        activate: true
      });
      flowmapBootState = 'ready';
      return { mode: 'new', record };
    }
    await setFlowmapMeta(FLOWMAP_ACTIVE_BOARD_KEY, previous.id);
    flowmapBootState = 'ready';
    return { mode: 'previous', record: previous };
  } catch (error) {
    flowmapBootState = 'ready';
    console.error('[Flowmap] Startup board choice failed', error);
    return { mode: 'fallback', record: null, error };
  }
}

function isCleanViewV28() {
  return document.body.dataset.cleanView === 'true';
}

function setCleanViewV28(enabled) {
  const next = Boolean(enabled);
  if (next && typeof currentFlowMode === 'function' && currentFlowMode() === 'outline') {
    toast('クリーン表示は「作る」「確認」「見せる」で利用できます');
    return;
  }
  if (next) document.body.dataset.cleanView = 'true';
  else delete document.body.dataset.cleanView;
  document.getElementById('clean-view-button')?.setAttribute('aria-pressed', String(next));
  document.getElementById('clean-view-button')?.classList.toggle('is-active', next);
}

function installCleanViewV28() {
  if (document.getElementById('clean-view-button')) return;
  const toolbar = document.querySelector('.toolbar-view');
  const dataButton = document.getElementById('data-button');
  if (!toolbar || !dataButton) return;
  const button = document.createElement('button');
  button.id = 'clean-view-button';
  button.className = 'button quiet';
  button.type = 'button';
  button.textContent = 'クリーン';
  button.title = '編集UIを隠してボードだけ表示（Shift+F / Escで解除）';
  button.setAttribute('aria-pressed', 'false');
  toolbar.insertBefore(button, dataButton);
  button.addEventListener('click', () => setCleanViewV28(!isCleanViewV28()));

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
}

function visibleBoardElementsV28() {
  return [
    ...els['phase-layer'].querySelectorAll('.phase-card'),
    ...els['group-layer'].querySelectorAll('.group-card'),
    ...els['node-layer'].querySelectorAll('.sticky-note')
  ].filter((element) => {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

function boardExportBoundsV28() {
  const worldRect = els.world.getBoundingClientRect();
  const boxes = visibleBoardElementsV28().map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left - worldRect.left,
      top: rect.top - worldRect.top,
      right: rect.right - worldRect.left,
      bottom: rect.bottom - worldRect.top
    };
  });
  try {
    const edgeBox = els.edges.getBBox();
    if (edgeBox.width || edgeBox.height) {
      boxes.push({ left: edgeBox.x, top: edgeBox.y, right: edgeBox.x + edgeBox.width, bottom: edgeBox.y + edgeBox.height });
    }
  } catch (error) {
    console.warn('[Flowmap] Edge bounds unavailable', error);
  }
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.right));
  const bottom = Math.max(...boxes.map((box) => box.bottom));
  const padding = 96;
  return {
    x: Math.floor(left - padding),
    y: Math.floor(top - padding),
    width: Math.max(320, Math.ceil(right - left + padding * 2)),
    height: Math.max(220, Math.ceil(bottom - top + padding * 2))
  };
}

function collectExportCssV28() {
  const chunks = [];
  for (const sheet of document.styleSheets) {
    try {
      chunks.push([...sheet.cssRules].map((rule) => rule.cssText).join('\n'));
    } catch (error) {
      // Cross-origin styles are intentionally skipped. Flowmap's board styles are same-origin.
    }
  }
  return chunks.join('\n');
}

function copyCssVariablesV28(source, target) {
  const computed = getComputedStyle(source);
  for (let index = 0; index < computed.length; index += 1) {
    const name = computed[index];
    if (!name.startsWith('--')) continue;
    target.style.setProperty(name, computed.getPropertyValue(name));
  }
}

function sanitizeExportCloneV28(worldClone) {
  worldClone.style.transform = 'none';
  worldClone.querySelectorAll('.node-quick-actions,.connector-handle,.edge-endpoint,.connection-preview,.v12-draft-node,#connection-drop-zones,#connection-drop-ghost').forEach((node) => node.remove());
  worldClone.querySelectorAll('.group-header button,[data-node-command]').forEach((node) => node.remove());
  worldClone.querySelectorAll('.is-selected,.is-search-match,.is-connect-target,.is-connect-source,.tutorial-target').forEach((node) => {
    node.classList.remove('is-selected', 'is-search-match', 'is-connect-target', 'is-connect-source', 'tutorial-target');
  });
  return worldClone;
}

function exportScaleV28(width, height) {
  const requested = Math.max(2, window.devicePixelRatio || 1);
  const maxDimension = 16384;
  const maxPixels = 64_000_000;
  return Math.max(1, Math.min(
    requested,
    maxDimension / width,
    maxDimension / height,
    Math.sqrt(maxPixels / Math.max(1, width * height))
  ));
}

function pngFilenameV28() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `flowmap-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.png`;
}

function downloadBlobV28(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportBoardPngV28() {
  if (!state) return;
  const viewportBefore = clone(state.viewport);
  const selectionBefore = clone(selection);
  const selectedBefore = typeof selectedNoteIds !== 'undefined' ? new Set(selectedNoteIds) : null;
  const cleanBefore = isCleanViewV28();
  document.body.dataset.exporting = 'true';
  try {
    state.viewport = { ...state.viewport, x: 0, y: 0, scale: 1 };
    selection = { type: null, id: null };
    if (typeof selectedNoteIds !== 'undefined') selectedNoteIds = new Set();
    renderAll();

    const bounds = boardExportBoundsV28();
    if (!bounds) throw new Error('書き出す図形がありません');
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
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('PNG用の描画を生成できませんでした'));
      image.src = svgUrl;
    });
    URL.revokeObjectURL(svgUrl);

    const scale = exportScaleV28(bounds.width, bounds.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bounds.width * scale));
    canvas.height = Math.max(1, Math.round(bounds.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvasを初期化できませんでした');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNGを生成できませんでした');
    downloadBlobV28(pngFilenameV28(), blob);
    toast('ボード全体をPNGで書き出しました');
  } catch (error) {
    console.error('[Flowmap] PNG export failed', error);
    toast(error.message || 'PNGを書き出せませんでした');
  } finally {
    state.viewport = viewportBefore;
    selection = selectionBefore;
    if (typeof selectedNoteIds !== 'undefined' && selectedBefore) selectedNoteIds = selectedBefore;
    renderAll();
    if (cleanBefore) document.body.dataset.cleanView = 'true';
    else delete document.body.dataset.cleanView;
    delete document.body.dataset.exporting;
  }
}

function importTextDataV28() {
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
    undoStack.push(snapshot());
    state = normalizeFlowchartState({ ...data, version: 7 });
    redoStack.length = 0;
    selection = { type: null, id: null };
    saveState();
    renderAll();
    document.getElementById('data-dialog')?.close();
    if (textarea) textarea.value = '';
    toast('貼り付けたデータを読み込みました');
  } catch (error) {
    console.error('[Flowmap] Text import failed', error);
    toast('JSON / YAMLを読み込めませんでした');
  }
}

function dataSectionV28(title, description, className = '') {
  const section = document.createElement('section');
  section.className = `data-section-v28 ${className}`.trim();
  section.innerHTML = `<header><div><strong>${title}</strong><span>${description}</span></div></header><div class="data-section-grid-v28"></div>`;
  return section;
}

function installDataWorkspaceV28() {
  const dialog = document.getElementById('data-dialog');
  const oldGrid = dialog?.querySelector('.dialog-grid');
  if (!dialog || !oldGrid || dialog.querySelector('.data-layout-v28')) return;

  const png = document.createElement('button');
  png.id = 'export-png-v28';
  png.type = 'button';
  png.innerHTML = '<strong>PNGにする</strong><span>ボード全体を高解像度画像へ</span>';
  png.addEventListener('click', () => { void exportBoardPngV28(); });

  const exportSection = dataSectionV28('書き出す', '共有・バックアップ用に持ち出す');
  const importSection = dataSectionV28('読み込む', 'JSON / YAMLから現在のボードへ読み込む');
  const manageSection = dataSectionV28('データ管理', '現在のボード内容を初期化する操作', 'is-danger-v28');
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
  if (fileCard) importGrid.append(fileCard);

  const pasteCard = document.createElement('div');
  pasteCard.className = 'data-paste-card-v28';
  pasteCard.innerHTML = '<strong>テキストを貼り付ける</strong><span>JSON / YAMLを直接貼り付け</span><textarea id="import-text-v28" rows="6" spellcheck="false" placeholder="{ ... } または YAML"></textarea><button id="import-text-button-v28" type="button">貼り付け内容を読み込む</button>';
  importGrid.append(pasteCard);
  pasteCard.querySelector('#import-text-button-v28').addEventListener('click', importTextDataV28);

  [reset, clear].filter(Boolean).forEach((node) => manageGrid.append(node));
  const layout = document.createElement('div');
  layout.className = 'data-layout-v28';
  layout.append(exportSection, importSection, manageSection);
  oldGrid.replaceWith(layout);

  const title = dialog.querySelector('header h2');
  if (title) title.textContent = '書き出し・読み込み';
  const kicker = dialog.querySelector('header span');
  if (kicker) kicker.textContent = 'DATA';
}

function installFlowmapExperienceV28() {
  if (flowmapExperienceInstalledV28) return;
  flowmapExperienceInstalledV28 = true;
  installCleanViewV28();
  installDataWorkspaceV28();
  if (typeof bindPresentationV2 === 'function') bindPresentationV2();
  if (typeof installPresentationV2 === 'function') installPresentationV2();
  const badge = document.querySelector('.version-badge');
  if (badge) badge.textContent = 'v0.28.0';
  if (els['data-button']) {
    els['data-button'].textContent = '書き出し';
    els['data-button'].title = 'PNG・PDF・JSON・YAMLの書き出しと読み込み';
  }
}
