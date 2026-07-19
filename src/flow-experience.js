/* Flowmap v0.14 — touch the flow, follow the path */
const FLOW_VIEW_MODES = new Set(['build', 'check', 'present']);
let flowExperienceBound = false;
let flowFocus = null;
let flowPlayback = null;
let flowPlaybackTimer = null;

const normalizeFlowExperienceBefore = normalizeFlowchartState;
normalizeFlowchartState = function normalizeFlowExperienceState(next) {
  const normalized = normalizeFlowExperienceBefore(next);
  if (!normalized) return normalized;
  normalized.settings ||= {};
  if (!FLOW_VIEW_MODES.has(normalized.settings.viewMode)) normalized.settings.viewMode = 'build';
  return normalized;
};

function currentFlowMode() {
  return FLOW_VIEW_MODES.has(state?.settings?.viewMode) ? state.settings.viewMode : 'build';
}

function installFlowModeSwitch() {
  if (document.getElementById('flow-mode-switch')) return;
  const toolbar = document.querySelector('.toolbar-view');
  if (!toolbar) return;
  const switcher = document.createElement('div');
  switcher.id = 'flow-mode-switch';
  switcher.className = 'flow-mode-switch';
  switcher.setAttribute('aria-label', '表示モード');
  switcher.innerHTML = `
    <button type="button" data-flow-mode="build" title="図形と接続を作る">作る</button>
    <button type="button" data-flow-mode="check" title="状態と補足を確認する">確認</button>
    <button type="button" data-flow-mode="present" title="編集UIを隠して流れを見せる">見せる</button>`;
  toolbar.prepend(switcher);
}

function installFlowFocusToolbar() {
  if (document.getElementById('flow-focus-toolbar')) return;
  const toolbar = document.createElement('div');
  toolbar.id = 'flow-focus-toolbar';
  toolbar.className = 'flow-focus-toolbar';
  toolbar.innerHTML = `
    <div class="flow-focus-copy"><span>FLOW</span><strong id="flow-focus-title">図形を選ぶ</strong></div>
    <div class="flow-focus-actions">
      <button type="button" data-flow-focus="downstream" title="選択した工程から後ろを強調">ここから先</button>
      <button type="button" data-flow-focus="upstream" title="選択した工程までの前工程を強調">ここまで</button>
      <button type="button" data-flow-focus="both" title="前後の関係をまとめて強調">前後</button>
      <button class="flow-play-button" type="button" data-flow-play title="選択地点から流れを再生"><span>▶</span> 流す</button>
      <button class="flow-clear-button" type="button" data-flow-clear title="経路表示を解除">×</button>
    </div>`;
  els.board.append(toolbar);
}

const installHeaderBeforeFlowExperience = v12InstallHeader;
v12InstallHeader = function installHeaderFlowExperience() {
  installHeaderBeforeFlowExperience();
  installFlowModeSwitch();
};

const installCanvasToolsBeforeFlowExperience = v12InstallCanvasTools;
v12InstallCanvasTools = function installCanvasToolsFlowExperience() {
  installCanvasToolsBeforeFlowExperience();
  installFlowFocusToolbar();
};

function outgoingEdges(noteId) {
  return state.edges.filter((item) => item.from === noteId && getNote(item.to));
}

function incomingEdges(noteId) {
  return state.edges.filter((item) => item.to === noteId && getNote(item.from));
}

function collectFlowPath(originId, direction = 'downstream') {
  const nodeIds = new Set([originId]);
  const edgeIds = new Set();
  const queue = [originId];
  while (queue.length) {
    const current = queue.shift();
    const candidates = direction === 'downstream'
      ? outgoingEdges(current)
      : direction === 'upstream'
        ? incomingEdges(current)
        : [...outgoingEdges(current), ...incomingEdges(current)];
    candidates.forEach((item) => {
      edgeIds.add(item.id);
      const nextId = item.from === current ? item.to : item.from;
      if (nodeIds.has(nextId)) return;
      nodeIds.add(nextId);
      queue.push(nextId);
    });
  }
  return { originId, direction, nodeIds, edgeIds };
}

function stopFlowPlayback({ keepFocus = true, render = true } = {}) {
  clearTimeout(flowPlaybackTimer);
  flowPlaybackTimer = null;
  flowPlayback = null;
  if (!keepFocus) flowFocus = null;
  if (render) renderAll();
}

function clearFlowFocus({ render = true } = {}) {
  stopFlowPlayback({ keepFocus: false, render: false });
  if (render) renderAll();
}

function setFlowFocus(direction) {
  if (selection.type !== 'note' || !getNote(selection.id)) {
    toast('流れの起点にする図形を選んでください');
    return;
  }
  stopFlowPlayback({ keepFocus: true, render: false });
  flowFocus = collectFlowPath(selection.id, direction);
  renderAll();
}

function buildFlowPlayback(originId, direction) {
  const mode = direction === 'upstream' ? 'upstream' : 'downstream';
  const steps = [];
  const visited = new Set();
  function walk(noteId) {
    if (visited.has(noteId)) return;
    visited.add(noteId);
    steps.push({ type: 'node', id: noteId });
    const edges = mode === 'upstream' ? incomingEdges(noteId) : outgoingEdges(noteId);
    edges.forEach((item) => {
      steps.push({ type: 'edge', id: item.id });
      walk(mode === 'upstream' ? item.from : item.to);
    });
  }
  walk(originId);
  return { originId, direction: mode, steps, index: 0, current: steps[0] || null };
}

function advanceFlowPlayback() {
  if (!flowPlayback) return;
  flowPlayback.index += 1;
  if (flowPlayback.index >= flowPlayback.steps.length) {
    flowPlayback.current = null;
    const title = getNote(flowPlayback.originId)?.title || '選択した工程';
    stopFlowPlayback({ keepFocus: true, render: true });
    toast(`「${title}」からの流れを確認しました`);
    return;
  }
  flowPlayback.current = flowPlayback.steps[flowPlayback.index];
  renderAll();
  flowPlaybackTimer = setTimeout(advanceFlowPlayback, flowPlayback.current.type === 'edge' ? 720 : 520);
}

function playFlow() {
  if (flowPlayback) {
    stopFlowPlayback({ keepFocus: true, render: true });
    return;
  }
  if (selection.type !== 'note' || !getNote(selection.id)) {
    toast('再生を始める図形を選んでください');
    return;
  }
  const direction = flowFocus?.originId === selection.id ? flowFocus.direction : 'downstream';
  const playbackDirection = direction === 'upstream' ? 'upstream' : 'downstream';
  flowFocus = collectFlowPath(selection.id, playbackDirection);
  flowPlayback = buildFlowPlayback(selection.id, playbackDirection);
  if (!flowPlayback.steps.length) return;
  renderAll();
  flowPlaybackTimer = setTimeout(advanceFlowPlayback, 560);
}

function edgePulseSvg(path) {
  return `<circle class="flow-running-pulse" r="5"><animateMotion dur="0.7s" repeatCount="1" path="${path.d}"></animateMotion></circle>`;
}

function applyFlowEdgeState() {
  const active = Boolean(flowFocus);
  els.board.classList.toggle('has-flow-focus', active);
  state.edges.forEach((item) => {
    const group = els.edges.querySelector(`[data-edge-group="${item.id}"]`);
    if (!group) return;
    const onPath = flowFocus?.edgeIds.has(item.id);
    group.classList.toggle('is-flow-path', Boolean(onPath));
    group.classList.toggle('is-flow-dim', active && !onPath);
    const current = flowPlayback?.current?.type === 'edge' && flowPlayback.current.id === item.id;
    group.classList.toggle('is-flow-current', current);
    if (current) group.insertAdjacentHTML('beforeend', edgePulseSvg(edgePath(item)));
  });
}

function flowGrowControlHtml(noteId) {
  return `<div class="flow-grow-controls" aria-label="前後の工程を追加">
    <button type="button" class="grow-top" data-grow-note="${noteId}" data-grow-side="top" title="前の工程を上に追加">＋<small>↑</small></button>
    <button type="button" class="grow-right" data-grow-note="${noteId}" data-grow-side="right" title="次の工程を右に追加">＋<small>→</small></button>
    <button type="button" class="grow-bottom" data-grow-note="${noteId}" data-grow-side="bottom" title="次の工程を下に追加">＋<small>↓</small></button>
    <button type="button" class="grow-left" data-grow-note="${noteId}" data-grow-side="left" title="前の工程を左に追加">＋<small>←</small></button>
  </div>`;
}

function applyFlowNodeState() {
  const active = Boolean(flowFocus);
  state.notes.forEach((item) => {
    const card = els['node-layer'].querySelector(`[data-note-id="${item.id}"]`);
    if (!card) return;
    const onPath = flowFocus?.nodeIds.has(item.id);
    card.classList.toggle('is-flow-path', Boolean(onPath));
    card.classList.toggle('is-flow-dim', active && !onPath);
    card.classList.toggle('is-flow-origin', flowFocus?.originId === item.id);
    card.classList.toggle('is-flow-current', flowPlayback?.current?.type === 'node' && flowPlayback.current.id === item.id);
    if (currentFlowMode() === 'build' && isSelected('note', item.id) && !card.querySelector('.flow-grow-controls')) {
      card.insertAdjacentHTML('beforeend', flowGrowControlHtml(item.id));
    }
  });
}

const renderEdgesBeforeFlowExperience = renderEdges;
renderEdges = function renderEdgesFlowExperience() {
  renderEdgesBeforeFlowExperience();
  applyFlowEdgeState();
};

const renderNotesBeforeFlowExperience = renderNotes;
renderNotes = function renderNotesFlowExperience() {
  renderNotesBeforeFlowExperience();
  applyFlowNodeState();
};

function updateFlowExperienceUi() {
  const mode = currentFlowMode();
  els.app.dataset.viewMode = mode;
  document.body.dataset.flowMode = mode;
  document.querySelectorAll('[data-flow-mode]').forEach((button) => {
    const active = button.dataset.flowMode === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const selected = selection.type === 'note' ? getNote(selection.id) : null;
  const title = document.getElementById('flow-focus-title');
  if (title) title.textContent = selected ? selected.title : '図形を選ぶ';
  document.querySelectorAll('[data-flow-focus],[data-flow-play]').forEach((button) => { button.disabled = !selected; });
  document.querySelectorAll('[data-flow-focus]').forEach((button) => {
    button.classList.toggle('is-active', Boolean(flowFocus && flowFocus.originId === selected?.id && flowFocus.direction === button.dataset.flowFocus));
  });
  const play = document.querySelector('[data-flow-play]');
  if (play) play.innerHTML = flowPlayback ? '<span>■</span> 止める' : '<span>▶</span> 流す';
  const clear = document.querySelector('[data-flow-clear]');
  if (clear) clear.disabled = !flowFocus && !flowPlayback;
  const focusToolbar = document.getElementById('flow-focus-toolbar');
  if (focusToolbar) focusToolbar.classList.toggle('has-selection', Boolean(selected));
  document.querySelector('.version-badge').textContent = 'v0.14.0';
}

const renderAllBeforeFlowExperience = renderAll;
renderAll = function renderAllFlowExperience() {
  renderAllBeforeFlowExperience();
  updateFlowExperienceUi();
};

function setFlowMode(mode) {
  if (!FLOW_VIEW_MODES.has(mode) || currentFlowMode() === mode) return;
  stopFlowPlayback({ keepFocus: true, render: false });
  state.settings.viewMode = mode;
  if (mode === 'present') {
    state.settings.navigatorOpen = false;
    state.settings.inspectorOpen = false;
  }
  saveState();
  renderAll();
  const label = mode === 'build' ? '作る' : mode === 'check' ? '確認する' : '見せる';
  toast(`${label}モードへ切り替えました`);
}

function createConnectedNoteAtSide(baseId, side) {
  const base = getNote(baseId);
  if (!base) return;
  const baseSize = noteDisplaySize(base);
  const newSize = informationNoteSize({ type: 'process' });
  const gap = 70;
  let x = base.x;
  let y = base.y;
  let before = false;
  if (side === 'right') x = base.x + baseSize.w + gap;
  if (side === 'left') { x = base.x - newSize.w - gap; before = true; }
  if (side === 'bottom') y = base.y + baseSize.h + gap;
  if (side === 'top') { y = base.y - newSize.h - gap; before = true; }
  x = clamp(x, 0, WORLD.width - newSize.w);
  y = clamp(y, 0, WORLD.height - newSize.h);
  undoStack.push(snapshot());
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
  const item = note(uid('note'), '新しい処理', x, y, base.phaseId || '', base.groupId || '', { type: 'process', now: new Date().toISOString() });
  state.notes.push(item);
  state.edges.push(edge(uid('edge'), before ? item.id : base.id, before ? base.id : item.id));
  selection = { type: 'note', id: item.id };
  flowFocus = null;
  recordActivity(before ? '前の処理を追加して接続' : '次の処理を追加して接続', item.id);
  saveState();
  renderAll();
  requestAnimationFrame(() => startInlineEdit(item.id));
}

function bindFlowExperienceEvents() {
  if (flowExperienceBound) return;
  flowExperienceBound = true;
  document.getElementById('flow-mode-switch')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-flow-mode]');
    if (button) setFlowMode(button.dataset.flowMode);
  });
  document.getElementById('flow-focus-toolbar')?.addEventListener('click', (event) => {
    const focus = event.target.closest('[data-flow-focus]');
    if (focus) return setFlowFocus(focus.dataset.flowFocus);
    if (event.target.closest('[data-flow-play]')) return playFlow();
    if (event.target.closest('[data-flow-clear]')) return clearFlowFocus();
  });
  els['node-layer'].addEventListener('click', (event) => {
    const button = event.target.closest('[data-grow-note][data-grow-side]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    createConnectedNoteAtSide(button.dataset.growNote, button.dataset.growSide);
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || (!flowFocus && !flowPlayback)) return;
    if (event.target.matches('input,textarea,select,[contenteditable="true"]')) return;
    event.preventDefault();
    event.stopPropagation();
    clearFlowFocus();
  }, true);
}

const bindEventsBeforeFlowExperience = bindEvents;
bindEvents = function bindEventsFlowExperience() {
  bindEventsBeforeFlowExperience();
  bindFlowExperienceEvents();
};

const selectBeforeFlowExperience = select;
select = function selectFlowExperience(type, id, options = {}) {
  if (flowFocus && (type !== 'note' || id !== flowFocus.originId)) {
    stopFlowPlayback({ keepFocus: false, render: false });
  }
  return selectBeforeFlowExperience(type, id, options);
};

const clearSelectionBeforeFlowExperience = clearSelection;
clearSelection = function clearSelectionFlowExperience() {
  stopFlowPlayback({ keepFocus: false, render: false });
  return clearSelectionBeforeFlowExperience();
};

const updatePanGuidanceBeforeFlowExperience = updatePanGuidance;
updatePanGuidance = function updatePanGuidanceFlowExperience() {
  updatePanGuidanceBeforeFlowExperience();
  const tab = [...els['help-dialog'].querySelectorAll('.shortcut-grid > div')].find((item) => item.querySelector('kbd')?.textContent.trim() === 'F');
  if (tab) tab.insertAdjacentHTML('afterend', '<div><kbd>流れを見る</kbd><span>図形を選び「ここから先」「ここまで」「流す」</span></div>');
};
