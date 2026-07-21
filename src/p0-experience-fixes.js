/* Flowmap v0.23.0 — reliable presentation flow and clear file import/export */
'use strict';

const FLOWMAP_P0_VERSION = '0.23.0';
let p0PresentationBound = false;
let p0ModeSwitchBound = false;

function p0SetVersionBadge() {
  const badge = document.querySelector('.version-badge');
  if (badge) badge.textContent = `v${FLOWMAP_P0_VERSION}`;
}

function p0InstallPresentationLaunchButton() {
  const toolbar = document.querySelector('.toolbar-view');
  const switcher = document.getElementById('flow-mode-switch');
  if (!toolbar || !switcher) return null;
  let button = document.getElementById('presentation-launch-button');
  if (!button) {
    button = document.createElement('button');
    button.id = 'presentation-launch-button';
    button.className = 'button presentation-launch-button';
    button.type = 'button';
    button.innerHTML = '<span aria-hidden="true">▶</span><span>プレゼン</span>';
    button.title = '図全体を確認してから、工程を順番に説明する';
    switcher.after(button);
  }
  return button;
}

installFlowModeSwitch = function installFlowModeSwitchP0() {
  const toolbar = document.querySelector('.toolbar-view');
  if (!toolbar) return;
  let switcher = document.getElementById('flow-mode-switch');
  if (!switcher) {
    switcher = document.createElement('div');
    switcher.id = 'flow-mode-switch';
    switcher.className = 'flow-mode-switch';
    switcher.setAttribute('aria-label', '作業画面');
    toolbar.prepend(switcher);
  }
  switcher.innerHTML = `
    <button type="button" data-flow-mode="outline" title="文章と階層で工程を組み立てる">アウトライン</button>
    <button type="button" data-flow-mode="build" title="図形と接続を編集する">ボード</button>
    <button type="button" data-flow-mode="check" title="状態・期限・担当を確認する">進捗確認</button>`;
  p0InstallPresentationLaunchButton();
};

flowmapModeLabel = function flowmapModeLabelP0(mode) {
  return ({ outline: 'アウトライン', build: 'ボード', check: '進捗確認', present: 'プレゼン' })[mode] || 'ボード';
};

function p0UpdateModeChrome() {
  installFlowModeSwitch();
  const mode = currentFlowMode();
  document.querySelectorAll('[data-flow-mode]').forEach((button) => {
    const active = button.dataset.flowMode === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const launch = p0InstallPresentationLaunchButton();
  if (launch) {
    const active = mode === 'present';
    launch.classList.toggle('is-active', active);
    launch.setAttribute('aria-pressed', String(active));
    launch.title = active ? 'プレゼンを終了してボードへ戻る' : '図全体を確認してから、工程を順番に説明する';
  }
  p0SetVersionBadge();
}

function p0ConsolidateModeSwitchEvents() {
  if (p0ModeSwitchBound) return;
  const current = document.getElementById('flow-mode-switch');
  if (!current) return;
  const clean = current.cloneNode(true);
  clean.removeAttribute('data-v2-bound');
  current.replaceWith(clean);
  clean.addEventListener('click', (event) => {
    const button = event.target.closest('[data-flow-mode]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    setFlowMode(button.dataset.flowMode);
  });
  const launch = document.getElementById('presentation-launch-button');
  if (launch) {
    const cleanLaunch = launch.cloneNode(true);
    launch.replaceWith(cleanLaunch);
    cleanLaunch.addEventListener('click', (event) => {
      event.preventDefault();
      setFlowMode(currentFlowMode() === 'present' ? 'build' : 'present');
    });
  }
  p0ModeSwitchBound = true;
  p0UpdateModeChrome();
}

installPresentationV2 = function installPresentationV2P0() {
  let controller = document.getElementById('presentation-controller');
  if (!controller) {
    controller = document.createElement('section');
    controller.id = 'presentation-controller';
    controller.className = 'presentation-controller';
    els.board.append(controller);
  }
  controller.hidden = true;
  controller.innerHTML = `
    <div class="presentation-copy">
      <span id="presentation-counter">全体表示</span>
      <strong id="presentation-title">プレゼンを開始</strong>
      <p id="presentation-summary">図全体を確認してから、最初の工程へ進みます。</p>
    </div>
    <div class="presentation-actions">
      <button type="button" data-presentation-prev>← 戻る</button>
      <button type="button" class="primary presentation-start" data-presentation-start>開始する</button>
      <button type="button" class="primary" data-presentation-play>▶ 自動再生</button>
      <button type="button" data-presentation-next>次へ →</button>
      <button type="button" data-presentation-all>全体を見る</button>
      <button type="button" data-presentation-exit>終了</button>
    </div>`;
};

function p0PresentationStarted() {
  return Boolean(presentationV2.started);
}

presentationRenderNodeState = function presentationRenderNodeStateP0() {
  if (currentFlowMode() !== 'present') return;
  const started = p0PresentationStarted();
  const current = started && !presentationV2.showingAll ? presentationCurrentNote() : null;
  const previousId = started ? presentationV2.sequence[presentationV2.index - 1] : null;
  const nextId = started ? presentationV2.sequence[presentationV2.index + 1] : null;
  $$('.sticky-note', els['node-layer']).forEach((card) => {
    const id = card.dataset.noteId;
    card.classList.toggle('is-presentation-current', id === current?.id);
    card.classList.toggle('is-presentation-near', Boolean(current && (id === previousId || id === nextId)));
    card.classList.toggle('is-presentation-muted', Boolean(current && id !== current.id && id !== previousId && id !== nextId));
  });
  state.edges.forEach((edgeItem) => {
    const group = els.edges.querySelector(`[data-edge-group="${edgeItem.id}"]`);
    if (!group) return;
    const near = Boolean(current && (edgeItem.from === current.id || edgeItem.to === current.id));
    group.classList.toggle('is-presentation-near', near);
    group.classList.toggle('is-presentation-muted', Boolean(current && !near));
  });
  els.board.classList.toggle('is-presentation-overview', !current);
};

presentationRenderUi = function presentationRenderUiP0() {
  installPresentationV2();
  const controller = document.getElementById('presentation-controller');
  if (!controller) return;
  const active = currentFlowMode() === 'present';
  controller.hidden = !active;
  if (!active) return;

  const started = p0PresentationStarted();
  const item = started ? presentationCurrentNote() : null;
  const counter = document.getElementById('presentation-counter');
  const title = document.getElementById('presentation-title');
  const summary = document.getElementById('presentation-summary');
  const start = controller.querySelector('[data-presentation-start]');
  const previous = controller.querySelector('[data-presentation-prev]');
  const next = controller.querySelector('[data-presentation-next]');
  const play = controller.querySelector('[data-presentation-play]');
  const all = controller.querySelector('[data-presentation-all]');

  if (!presentationV2.sequence.length) {
    counter.textContent = '0 / 0';
    title.textContent = '工程がありません';
    summary.textContent = '「アウトライン」または「ボード」で工程を追加してください。';
  } else if (!started) {
    counter.textContent = `${presentationV2.sequence.length}工程`;
    title.textContent = 'プレゼンを開始';
    summary.textContent = '図全体と開始位置を確認してから、工程を順番に表示します。';
  } else if (presentationV2.showingAll) {
    counter.textContent = `${presentationV2.index + 1} / ${presentationV2.sequence.length}`;
    title.textContent = '図全体を表示中';
    summary.textContent = '「次へ」で現在位置から説明を再開できます。';
  } else {
    counter.textContent = `${presentationV2.index + 1} / ${presentationV2.sequence.length}`;
    title.textContent = item?.title || '工程がありません';
    summary.textContent = item?.summary || item?.note || [item?.assignee, item?.due].filter(Boolean).join('・') || '次の工程とのつながりを確認します。';
  }

  start.hidden = started;
  start.disabled = !presentationV2.sequence.length;
  previous.hidden = !started;
  next.hidden = !started;
  play.hidden = !started;
  all.hidden = !started;
  previous.disabled = !item || presentationV2.index <= 0;
  next.disabled = !presentationV2.sequence.length || (!presentationV2.showingAll && presentationV2.index >= presentationV2.sequence.length - 1);
  play.disabled = !item || presentationV2.sequence.length < 2 || presentationV2.showingAll;
  play.textContent = presentationV2.playing ? '■ 停止' : '▶ 自動再生';
  all.classList.toggle('is-active', presentationV2.showingAll);
  presentationRenderNodeState();
  p0UpdateModeChrome();
};

presentationEnter = function presentationEnterP0() {
  installPresentationV2();
  presentationStop();
  presentationV2.sequence = presentationBuildSequence();
  const selectedIndex = selection.type === 'note' ? presentationV2.sequence.indexOf(selection.id) : -1;
  presentationV2.index = selectedIndex >= 0 ? selectedIndex : 0;
  presentationV2.started = false;
  presentationV2.showingAll = true;
  renderAll();
  requestAnimationFrame(() => fitView());
};

presentationLeave = function presentationLeaveP0() {
  presentationStop();
  presentationV2.sequence = [];
  presentationV2.index = 0;
  presentationV2.started = false;
  presentationV2.showingAll = false;
  document.getElementById('presentation-controller')?.setAttribute('hidden', '');
  els.board?.classList.remove('is-presentation-overview');
};

function presentationStartP0() {
  if (!presentationV2.sequence.length) return;
  presentationStop();
  presentationV2.started = true;
  presentationV2.showingAll = false;
  presentationSelect(presentationV2.index, { fit: true });
}

presentationSelect = function presentationSelectP0(index, { fit = true } = {}) {
  if (!presentationV2.sequence.length) return;
  presentationV2.started = true;
  presentationV2.index = clamp(index, 0, presentationV2.sequence.length - 1);
  presentationV2.showingAll = false;
  const item = presentationCurrentNote();
  if (item) {
    selection = { type: 'note', id: item.id };
    if (typeof selectedNoteIds !== 'undefined') selectedNoteIds = new Set([item.id]);
  }
  renderAll();
  if (fit && item) requestAnimationFrame(() => fitView(item.id));
};

presentationShowAll = function presentationShowAllP0() {
  if (!presentationV2.sequence.length) return;
  presentationStop();
  presentationV2.started = true;
  presentationV2.showingAll = true;
  renderAll();
  requestAnimationFrame(() => fitView());
};

presentationTogglePlay = function presentationTogglePlayP0() {
  if (!presentationV2.sequence.length) return;
  if (!p0PresentationStarted() || presentationV2.showingAll) presentationStartP0();
  presentationV2.playing = !presentationV2.playing;
  presentationRenderUi();
  if (presentationV2.playing) presentationScheduleNext();
  else presentationStop();
};

bindPresentationV2 = function bindPresentationV2P0() {
  if (p0PresentationBound) return;
  p0PresentationBound = true;
  installPresentationV2();
  const controller = document.getElementById('presentation-controller');
  controller.addEventListener('click', (event) => {
    if (event.target.closest('[data-presentation-start]')) return presentationStartP0();
    if (event.target.closest('[data-presentation-prev]')) return presentationSelect(presentationV2.index - 1);
    if (event.target.closest('[data-presentation-next]')) {
      if (!p0PresentationStarted() || presentationV2.showingAll) return presentationSelect(presentationV2.index);
      return presentationSelect(presentationV2.index + 1);
    }
    if (event.target.closest('[data-presentation-play]')) return presentationTogglePlay();
    if (event.target.closest('[data-presentation-all]')) return presentationShowAll();
    if (event.target.closest('[data-presentation-exit]')) return setFlowMode('build');
  });
  document.addEventListener('keydown', (event) => {
    if (currentFlowMode() !== 'present' || event.target.matches('input,textarea,select,[contenteditable="true"]')) return;
    if (event.key === 'ArrowLeft' && p0PresentationStarted()) {
      event.preventDefault();
      presentationSelect(presentationV2.index - 1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (!p0PresentationStarted() || presentationV2.showingAll) presentationSelect(presentationV2.index);
      else presentationSelect(presentationV2.index + 1);
    }
    if (event.key === ' ') {
      event.preventDefault();
      presentationTogglePlay();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setFlowMode('build');
    }
  }, true);
};

restorePresentationSessionIfNeeded = function restorePresentationSessionIfNeededP0() {
  if (currentFlowMode() !== 'present' || presentationV2.sequence.length || !state.notes.length) return;
  presentationV2.sequence = presentationBuildSequence();
  const selectedIndex = selection.type === 'note' ? presentationV2.sequence.indexOf(selection.id) : -1;
  presentationV2.index = selectedIndex >= 0 ? selectedIndex : 0;
  presentationV2.started = false;
  presentationV2.showingAll = true;
  presentationRenderUi();
  requestAnimationFrame(() => fitView());
};

registerFlowmapMode('present', { enter: presentationEnter, leave: presentationLeave });

function p0ImportBoardName(fileName) {
  return String(fileName || '読み込んだボード')
    .replace(/\.(json|ya?ml)$/i, '')
    .trim()
    .slice(0, 80) || '読み込んだボード';
}

function p0InstallImportHandler({ force = false } = {}) {
  const oldInput = document.getElementById('import-file');
  if (!oldInput || (!force && oldInput.dataset.p0FinalBound === 'true')) return;
  const input = oldInput.cloneNode(true);
  input.dataset.p0FinalBound = 'true';
  oldInput.replaceWith(input);
  els['import-file'] = input;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const mode = document.querySelector('input[name="import-mode"]:checked')?.value || 'new';
    try {
      const text = await file.text();
      const data = file.name.toLowerCase().endsWith('.json') ? JSON.parse(text) : window.jsyaml.load(text);
      validateImport(data);
      const imported = normalizeFlowchartState({ ...data, version: 7 });
      imported.settings ||= {};
      imported.settings.viewMode = 'build';
      imported.settings.navigatorOpen = true;
      imported.settings.inspectorOpen = false;
      if (mode === 'replace') {
        undoStack.push(snapshot());
        state = imported;
        redoStack.length = 0;
        selection = { type: null, id: null };
        saveState();
        renderAll();
        toast('現在のボードを読み込んだデータで置き換えました');
      } else {
        await flushStateSave();
        const boardId = createBoardId();
        const record = await persistStateImmediately(imported, {
          boardId,
          name: p0ImportBoardName(file.name),
          activate: true
        });
        await switchToBoardRecord(record);
        updateBoardManagementState();
        requestAnimationFrame(() => fitView());
        toast('新しいボードとして読み込みました');
      }
      els['data-dialog'].close();
    } catch (error) {
      console.error('[Flowmap] Import failed', error);
      toast(error?.message === 'Invalid flowmap data' ? 'Flowmap形式のファイルではありません' : '読み込みに失敗しました');
    } finally {
      input.value = '';
    }
  });
}

function p0Section(title, description, className) {
  const section = document.createElement('section');
  section.className = `io-section ${className}`;
  section.innerHTML = `<header><strong>${title}</strong><span>${description}</span></header><div class="io-card-grid"></div>`;
  return section;
}

function p0InstallInputOutputUi() {
  const dialog = document.getElementById('data-dialog');
  const grid = dialog?.querySelector('.dialog-grid');
  if (!dialog || !grid) return;
  const dataButton = document.getElementById('data-button');
  if (dataButton) {
    dataButton.textContent = '入出力';
    dataButton.title = 'PDF・JSON・YAMLの書き出しとファイルの読み込み';
  }
  const kicker = dialog.querySelector('header span');
  const heading = dialog.querySelector('header h2');
  if (kicker) kicker.textContent = 'FILES';
  if (heading) heading.textContent = 'ファイルの入出力';
  if (grid.dataset.p0Structured === 'true') {
    const exportGrid = grid.querySelector('.io-export-section .io-card-grid');
    const importGrid = grid.querySelector('.io-import-section .io-card-grid');
    const otherGrid = grid.querySelector('.io-other-section .io-card-grid');
    ['export-pdf-card', 'export-json', 'export-yaml'].forEach((id) => {
      const element = document.getElementById(id);
      if (element && exportGrid && element.parentElement !== exportGrid) exportGrid.append(element);
    });
    const importLabel = document.getElementById('import-file')?.closest('label');
    if (importLabel && importGrid && importLabel.parentElement !== importGrid) importGrid.append(importLabel);
    ['reset-sample', 'clear-all-button'].forEach((id) => {
      const element = document.getElementById(id);
      if (element && otherGrid && element.parentElement !== otherGrid) otherGrid.append(element);
    });
    p0InstallImportHandler();
    return;
  }

  const exportSection = p0Section('書き出す', '共有・バックアップ用のファイルを作成', 'io-export-section');
  const importSection = p0Section('読み込む', '既存ファイルを安全にボードへ取り込む', 'io-import-section');
  const otherSection = p0Section('その他', 'サンプル復元と現在のボードの初期化', 'io-other-section');
  const exportGrid = exportSection.querySelector('.io-card-grid');
  const importGrid = importSection.querySelector('.io-card-grid');
  const otherGrid = otherSection.querySelector('.io-card-grid');

  ['export-pdf-card', 'export-json', 'export-yaml'].forEach((id) => {
    const element = document.getElementById(id);
    if (element) exportGrid.append(element);
  });
  const importLabel = document.getElementById('import-file')?.closest('label');
  if (importLabel) {
    importLabel.classList.add('io-import-card');
    importGrid.append(importLabel);
  }
  const mode = document.createElement('fieldset');
  mode.className = 'import-mode-choice';
  mode.innerHTML = `
    <legend>読み込み方法</legend>
    <label><input type="radio" name="import-mode" value="new" checked><span><strong>新しいボードとして読み込む</strong><small>現在のボードを残す、安全な方法</small></span></label>
    <label><input type="radio" name="import-mode" value="replace"><span><strong>現在のボードを置き換える</strong><small>今の内容は読み込んだデータに変わります</small></span></label>`;
  importSection.insertBefore(mode, importGrid);

  ['reset-sample', 'clear-all-button'].forEach((id) => {
    const element = document.getElementById(id);
    if (element) otherGrid.append(element);
  });
  const reset = document.getElementById('reset-sample');
  if (reset) {
    reset.querySelector('strong').textContent = 'サンプルボードに戻す';
    reset.querySelector('span').textContent = '現在の内容をサンプルで置き換える';
  }

  grid.replaceChildren(exportSection, importSection, otherSection);
  grid.dataset.p0Structured = 'true';
  p0InstallImportHandler();
}

const updateFlowExperienceUiBeforeP0 = updateFlowExperienceUi;
updateFlowExperienceUi = function updateFlowExperienceUiP0() {
  updateFlowExperienceUiBeforeP0();
  p0UpdateModeChrome();
  p0InstallInputOutputUi();
};

const bindEventsBeforeP0 = bindEvents;
bindEvents = function bindEventsP0() {
  bindEventsBeforeP0();
  p0InstallInputOutputUi();
  p0InstallImportHandler({ force: true });
  p0ConsolidateModeSwitchEvents();
};
