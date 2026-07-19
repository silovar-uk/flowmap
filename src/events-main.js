/* Flowmap v0.11 — on-demand guidance and direct canvas actions */

function installV011Styles() {
  if (document.getElementById('v011-styles')) return;
  const style = document.createElement('style');
  style.id = 'v011-styles';
  style.textContent = `
    .stage{cursor:crosshair}.stage.is-panning{cursor:grabbing}
    .sticky-note.is-connect-source{opacity:.82;filter:saturate(.88)}
    .sticky-note.is-connect-target{outline:3px solid #6d9f72;outline-offset:6px;filter:drop-shadow(0 8px 14px rgba(57,103,62,.18))}
    .sticky-note.is-connect-target .connector-handle{opacity:1}
    .tutorial-actions .button:disabled{opacity:.62;cursor:default;background:#eef1ec;border-color:#d5dbd6;color:#758078}
  `;
  document.head.append(style);
}

function clearConnectTargets() {
  $$('.sticky-note.is-connect-target,.sticky-note.is-connect-source', els['node-layer'])
    .forEach((node) => node.classList.remove('is-connect-target', 'is-connect-source'));
}

function bestOverlapTarget(item, threshold = .32) {
  let best = null;
  let ratio = threshold;
  state.notes.forEach((other) => {
    if (other.id === item.id) return;
    const next = overlapRatio(item, other);
    if (next > ratio) { best = other; ratio = next; }
  });
  return best;
}

beginPan = function beginDirectPan(event) {
  if (event.defaultPrevented) return false;
  const shortcutPan = spaceHeld || event.button === 1;
  const interactive = event.target.closest('.sticky-note,.group-header,.phase-title,.edge-hit,.edge-endpoint,button,input,textarea,select,[contenteditable="true"]');
  const createOnClick = event.button === 0 && !shortcutPan && !interactive;
  if (!shortcutPan && !createOnClick) return false;
  const point = screenToWorld(event.clientX, event.clientY);
  drag = {
    type: 'pan', clientX: event.clientX, clientY: event.clientY,
    x: state.viewport.x, y: state.viewport.y, moved: false,
    createOnClick, createX: point.x, createY: point.y
  };
  els.stage.classList.add('is-panning');
  event.preventDefault();
  return true;
};

const moveBeforeV011 = handlePointerMove;
handlePointerMove = function handleDirectPointerMove(event) {
  moveBeforeV011(event);
  if (drag?.type !== 'note') return;
  const item = getNote(drag.id);
  if (!item) return;
  clearConnectTargets();
  const target = bestOverlapTarget(item);
  drag.connectTargetId = target?.id || null;
  if (!target) return;
  $(`[data-note-id="${item.id}"]`, els['node-layer'])?.classList.add('is-connect-source');
  $(`[data-note-id="${target.id}"]`, els['node-layer'])?.classList.add('is-connect-target');
};

function connectOverlappedNote(item, context = {}) {
  const target = getNote(context.connectTargetId) || bestOverlapTarget(item, .28);
  if (!target) return false;

  const size = noteDisplaySize(item);
  const targetSize = noteDisplaySize(target);
  const targetCenter = { x: target.x + targetSize.w / 2, y: target.y + targetSize.h / 2 };
  const originalCenter = {
    x: Number.isFinite(context.originalX) ? context.originalX + size.w / 2 : item.x + size.w / 2,
    y: Number.isFinite(context.originalY) ? context.originalY + size.h / 2 : item.y + size.h / 2
  };
  let dx = originalCenter.x - targetCenter.x;
  const dy = originalCenter.y - targetCenter.y;
  if (Math.abs(dx) < 8 && Math.abs(dy) < 8) dx = -1;

  const gap = 72;
  let from = item;
  let to = target;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx <= 0) {
      item.x = target.x - size.w - gap; item.y = target.y;
    } else {
      item.x = target.x + targetSize.w + gap; item.y = target.y; from = target; to = item;
    }
  } else if (dy <= 0) {
    item.x = target.x; item.y = target.y - size.h - gap;
  } else {
    item.x = target.x; item.y = target.y + targetSize.h + gap; from = target; to = item;
  }
  item.x = clamp(item.x, 0, WORLD.width - size.w);
  item.y = clamp(item.y, 0, WORLD.height - size.h);
  item.groupId = target.groupId || '';
  item.phaseId = target.phaseId || item.phaseId;

  const exists = state.edges.some((edgeItem) =>
    (edgeItem.from === item.id && edgeItem.to === target.id) ||
    (edgeItem.from === target.id && edgeItem.to === item.id)
  );
  if (!exists) state.edges.push(edge(uid('edge'), from.id, to.id));
  recordActivity(exists ? '接続済みの図形を整列' : '図形を重ねて接続', item.id);
  toast(exists ? 'すでに接続されています' : '図形をつなぎました');
  document.dispatchEvent(new CustomEvent('flowmap:nodes-connected', { detail: { fromId: from.id, toId: to.id } }));
  return true;
}

handlePointerUp = function handleDirectPointerUp(event) {
  if (connect) return finishConnection(event);
  if (!drag) return;

  if (drag.type === 'pan') {
    const finished = drag;
    drag = null;
    els.stage.classList.remove('is-panning');
    if (finished.moved) {
      suppressClickAfterPan();
      saveState(); renderAll(); return;
    }
    if (finished.createOnClick) {
      suppressClickAfterPan();
      const created = addNoteMutation(finished.createX - 112, finished.createY - 58, {
        type: 'process', label: '空白クリックで処理を追加'
      });
      document.dispatchEvent(new CustomEvent('flowmap:blank-created', { detail: { noteId: created?.id || null } }));
      return;
    }
    saveState(); renderAll(); return;
  }

  const finished = drag;
  drag = null;
  clearConnectTargets();
  $$('.group-card.drag-over', els['group-layer']).forEach((node) => node.classList.remove('drag-over'));
  if (!finished.moved) return renderAll();

  undoStack.push(finished.before);
  redoStack.length = 0;
  if (finished.type === 'note') finalizeNoteDrop(finished.id, finished);
  if (finished.type === 'group') {
    const group = getGroup(finished.id);
    const phase = findPhaseAt(group.x + group.w / 2, group.y + 20);
    if (phase) {
      group.phaseId = phase.id;
      state.notes.filter((item) => item.groupId === group.id).forEach((item) => { item.phaseId = phase.id; });
    }
    recordActivity('囲みを移動');
  }
  saveState(); renderAll();
};

finalizeNoteDrop = function finalizeDirectDrop(noteId, context = {}) {
  const item = getNote(noteId);
  if (!item || connectOverlappedNote(item, context)) return;
  const size = noteDisplaySize(item);
  const cx = item.x + size.w / 2;
  const cy = item.y + size.h / 2;
  const group = findGroupAt(cx, cy);
  const phase = group ? getPhase(group.phaseId) : findPhaseAt(cx, cy);
  if (group?.id !== item.groupId) {
    item.groupId = group?.id || '';
    if (group) item.phaseId = group.phaseId;
  }
  if (phase) item.phaseId = phase.id;

  const edgeItem = nearestEdge(cx, cy, 24 / state.viewport.scale, noteId);
  if (edgeItem) {
    state.edges = state.edges.filter((entry) => entry.id !== edgeItem.id);
    state.edges.push(
      edge(uid('edge'), edgeItem.from, noteId, edgeItem.label || ''),
      edge(uid('edge'), noteId, edgeItem.to, '')
    );
    recordActivity('矢印の途中へ図形を挿入', noteId);
    toast('矢印の途中へ図形を挿入しました');
    return;
  }
  recordActivity('図形を移動', noteId);
};

/* Guided tour: never starts automatically; action steps advance by actual use. */
FLOWMAP_TUTORIAL_STEPS.splice(0, FLOWMAP_TUTORIAL_STEPS.length,
  { selector:'#add-note', title:'1. まずは、このボタンを押す', body:'「＋処理」を押してみてください。処理が追加されると自動で次へ進みます。', actionEvent:'click', actionSelector:'#add-note' },
  { selector:'#stage', title:'2. 空いている場所をクリックする', body:'図形がない場所をクリックしてみてください。その場所に処理ができます。ドラッグした場合はボード移動です。', actionEvent:'flowmap:blank-created' },
  { selector:'#stage', prepare:'close-editor', title:'3. 図形を重ねてつなぐ', body:'どちらかの図形を、もう一方へ重ねて離してください。接続先が強調され、そのまま矢印でつながります。', actionEvent:'flowmap:nodes-connected' },
  { selector:'#inspector', prepare:'open-inspector', title:'4. 詳細は右側で編集する', body:'図形を選ぶと、種類、期限、担当、タグ、チェックリスト、メモを更新できます。' },
  { selector:'#save-board-button', title:'5. 必要なときに保存・一覧を使う', body:'内容は自動保存されます。「保存」で名前を付け、「一覧」で別のボードを開けます。使い方は、このボタンを押した時だけ開きます。' }
);

maybeStartTutorial = async function noAutomaticTutorial() {};
let tutorialAdvanceTimer = null;

prepareTutorialStep = function prepareV011Tutorial(step) {
  if (step.prepare === 'close-editor') document.querySelector('.inline-title-editor')?.blur();
  if (step.prepare === 'open-inspector') {
    state.settings.inspectorOpen = true;
    if (state.notes.length) selection = { type:'note', id:state.notes[0].id };
    renderAll();
  }
};

showTutorialStep = function showV011TutorialStep(index) {
  tutorialStepIndex = clamp(index, 0, FLOWMAP_TUTORIAL_STEPS.length - 1);
  const step = FLOWMAP_TUTORIAL_STEPS[tutorialStepIndex];
  tutorialTarget?.classList.remove('tutorial-target');
  prepareTutorialStep(step);
  tutorialTarget = findTutorialTarget(step);
  tutorialTarget?.classList.add('tutorial-target');

  document.getElementById('tutorial-count').textContent = `${tutorialStepIndex + 1} / ${FLOWMAP_TUTORIAL_STEPS.length}`;
  document.getElementById('tutorial-title').textContent = step.title;
  document.getElementById('tutorial-copy').textContent = step.body;
  document.getElementById('tutorial-back').disabled = tutorialStepIndex === 0;
  const next = document.getElementById('tutorial-next');
  next.disabled = Boolean(step.actionEvent);
  next.textContent = step.actionEvent ? '操作すると進みます' :
    (tutorialStepIndex === FLOWMAP_TUTORIAL_STEPS.length - 1 ? '完了' : '次へ');
  requestAnimationFrame(positionTutorial);
};

startTutorial = function startV011Tutorial() {
  clearTimeout(tutorialAdvanceTimer);
  tutorialRunning = true;
  document.getElementById('tutorial-layer').hidden = false;
  showTutorialStep(0);
};

finishTutorial = async function finishV011Tutorial() {
  clearTimeout(tutorialAdvanceTimer);
  tutorialRunning = false;
  document.getElementById('tutorial-layer').hidden = true;
  tutorialTarget?.classList.remove('tutorial-target');
  tutorialTarget = null;
};

function handleTutorialAction(event) {
  if (!tutorialRunning) return;
  const step = FLOWMAP_TUTORIAL_STEPS[tutorialStepIndex];
  if (!step?.actionEvent || event.type !== step.actionEvent) return;
  if (step.actionSelector) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest(step.actionSelector)) return;
  }
  clearTimeout(tutorialAdvanceTimer);
  tutorialAdvanceTimer = setTimeout(() => {
    if (tutorialRunning) showTutorialStep(tutorialStepIndex + 1);
  }, 240);
}

const bindManagementBeforeV011 = bindWorkspaceManagementEvents;
bindWorkspaceManagementEvents = function bindV011ManagementEvents() {
  bindManagementBeforeV011();
  document.addEventListener('click', handleTutorialAction);
  document.addEventListener('flowmap:blank-created', handleTutorialAction);
  document.addEventListener('flowmap:nodes-connected', handleTutorialAction);
};

function handleKeyDown(event) {
  const typing = event.target.matches('input,textarea,select,[contenteditable="true"]');
  if (event.code === 'Space' && !typing) { spaceHeld = true; event.preventDefault(); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); els['search-input'].focus(); els['search-input'].select(); return; }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && !typing) { event.preventDefault(); duplicateSelected(); return; }
  if (typing) return;
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelection(); return; }
  if (event.key === 'Escape') { clearSelection(); return; }
  if (event.key.toLowerCase() === 'f') { event.preventDefault(); selection.type === 'note' ? fitView(selection.id) : fitView(); return; }
  if (event.key === 'Enter' && event.shiftKey && selection.type === 'note') { event.preventDefault(); addChild(selection.id); return; }
  if (event.key === 'Enter' && selection.type === 'note') { event.preventDefault(); startInlineEdit(selection.id); return; }
  if (event.key === 'Tab') {
    event.preventDefault();
    if (selection.type === 'note') addSibling(selection.id);
    else {
      const rect = els.stage.getBoundingClientRect();
      const point = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
      addNoteMutation(point.x - 112, point.y - 58, { type:'process' });
    }
  }
}

function updatePanGuidance() {
  els['add-note'].innerHTML = '<span>＋</span>処理';
  els['add-note'].title = '処理を追加';
  els['canvas-hint'].innerHTML = '<strong>空白をクリック</strong>で処理を追加　・　ドラッグでボード移動　・　図形を重ねて接続';
  const shortcuts = [...els['help-dialog'].querySelectorAll('.shortcut-grid > div')];
  const add = shortcuts.find((item) => item.textContent.includes('ダブルクリック'));
  if (add) add.innerHTML = '<kbd>空白をクリック</kbd><span>その場所に処理を追加。ドラッグならボード移動</span>';
  const pan = shortcuts.find((item) => item.textContent.includes('Space + ドラッグ'));
  if (pan) pan.innerHTML = '<kbd>空白をドラッグ</kbd><span>ボードを移動（Space＋ドラッグでも可）</span>';
  const connectHelp = shortcuts.find((item) => item.textContent.includes('右端の点') || item.textContent.includes('上下左右の点'));
  if (connectHelp) connectHelp.innerHTML = '<kbd>図形を重ねる</kbd><span>重ねた相手へ接続。接続点からのドラッグも利用可能</span>';
  document.querySelector('.version-badge').textContent = 'v0.11.0';
  els['save-indicator'].title = 'IndexedDBへ自動保存';
}

async function init() {
  cacheElements();
  updateSaveIndicator('読み込み中…', 'IndexedDBから読み込んでいます');
  try {
    const restored = await loadState();
    state = normalizeFlowchartState(restored || initialState());
  } catch (error) {
    console.error('[Flowmap] Startup restore failed', error);
    state = normalizeFlowchartState(initialState());
    updateSaveIndicator('復元失敗', error.message || '保存データを読み込めませんでした');
  }
  installV011Styles();
  updatePanGuidance();
  installFlowchartUi();
  installWorkspaceManagement();
  bindEvents();
  renderAll();
  saveState();
  updateBoardManagementState();
  requestAnimationFrame(() => fitView());
  window.Flowmap = {
    getState: () => clone(state),
    reset: () => { state = normalizeFlowchartState(initialState()); saveState(); renderAll(); },
    storage: { flush: () => flushStateSave(), list: () => listSavedBoards(), active: () => getActiveBoardInfo() },
    tutorial: { start: () => startTutorial(), finish: () => finishTutorial() }
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void init(); });
else void init();
