/* Flowmap v0.12 — predictable direct manipulation and focused chrome */
let v12UiInstalled = false;
let v12DraftNode = null;
let v12DirectionalDrop = null;
let v12PracticeSession = null;
let v12BoardMenuOpen = false;
const FLOWMAP_V12_UI_META = 'uiV12Prepared';

const saveStateBeforeV12 = saveState;
saveState = function saveStateV12() {
  if (v12PracticeSession) return;
  return saveStateBeforeV12();
};

function v12PointThreshold(event) {
  return event.pointerType === 'touch' ? 12 : 8;
}

function v12CloseBoardMenu() {
  const menu = document.getElementById('board-menu-popover');
  if (menu) menu.hidden = true;
  v12BoardMenuOpen = false;
}

function v12UpdateHeader() {
  const button = document.getElementById('current-board-button');
  const label = document.getElementById('current-board-name');
  const info = typeof getActiveBoardInfo === 'function' ? getActiveBoardInfo() : { name: '無題のボード' };
  const name = v12PracticeSession ? '操作練習' : info.name;
  if (label) label.textContent = name;
  if (button) button.title = v12PracticeSession ? '練習中（保存されません）' : `「${name}」のボードメニュー`;
  document.title = `${name} — Flowmap`;
}

const updateBoardManagementStateBeforeV12 = updateBoardManagementState;
updateBoardManagementState = function updateBoardManagementStateV12() {
  updateBoardManagementStateBeforeV12();
  v12UpdateHeader();
};

function v12BoardMenuHtml() {
  return `<div id="board-menu-popover" class="board-menu-popover" hidden>
    <button type="button" data-board-menu-action="list"><span>▤</span><strong>保存したボード</strong><small>一覧から開く・整理する</small></button>
    <button type="button" data-board-menu-action="new"><span>＋</span><strong>新しいボード</strong><small>現在の内容はそのまま残す</small></button>
    <hr>
    <button type="button" data-board-menu-action="rename"><span>✎</span><strong>名前を変更</strong></button>
    <button type="button" data-board-menu-action="duplicate"><span>⧉</span><strong>複製して開く</strong></button>
    <button class="danger" type="button" data-board-menu-action="delete"><span>×</span><strong>このボードを削除</strong></button>
  </div>`;
}

function v12InstallHeader() {
  const topbar = document.querySelector('.topbar');
  const brand = document.querySelector('.brand');
  const mainToolbar = document.querySelector('.toolbar-main');
  const viewToolbar = document.querySelector('.toolbar-view');
  if (!topbar || !brand || !mainToolbar || !viewToolbar) return;

  let boardButton = document.getElementById('current-board-button');
  if (!boardButton) {
    boardButton = document.createElement('button');
    boardButton.id = 'current-board-button';
    boardButton.className = 'current-board-button';
    boardButton.type = 'button';
    boardButton.innerHTML = '<span class="board-state-dot" aria-hidden="true"></span><span id="current-board-name">無題のボード</span><span class="board-menu-caret">⌄</span>';
    brand.after(boardButton);
  }

  if (!document.getElementById('board-menu-popover')) document.body.insertAdjacentHTML('beforeend', v12BoardMenuHtml());
  boardButton.after(els['save-indicator']);

  let history = document.getElementById('history-controls');
  if (!history) {
    history = document.createElement('div');
    history.id = 'history-controls';
    history.className = 'history-controls';
    history.append(els.undo, els.redo);
    els['save-indicator'].after(history);
  }

  const oldSave = document.getElementById('save-board-button');
  const oldList = document.getElementById('board-list-button');
  if (oldSave) oldSave.hidden = true;
  if (oldList) oldList.hidden = true;

  const tutorial = document.getElementById('tutorial-button');
  if (tutorial) {
    tutorial.classList.add('header-help-button');
    tutorial.innerHTML = '<span aria-hidden="true">?</span><span class="management-label">使い方</span>';
  }
  els['data-button'].textContent = '書き出し';
  els['data-button'].title = 'PDF・JSON・YAMLの書き出しとデータ管理';
  els['print-button'].hidden = true;
  mainToolbar.hidden = true;

  const pdfCard = document.querySelector('#data-dialog .dialog-grid');
  if (pdfCard && !document.getElementById('export-pdf-card')) {
    const button = document.createElement('button');
    button.id = 'export-pdf-card';
    button.type = 'button';
    button.innerHTML = '<strong>PDFにする</strong><span>印刷・共有用に出力</span>';
    button.addEventListener('click', () => els['print-button'].click());
    pdfCard.prepend(button);
  }

  v12UpdateHeader();
}

function v12InstallCanvasTools() {
  if (document.getElementById('canvas-create-toolbar')) return;
  const shape = document.getElementById('add-flowchart-shape');
  const toolbar = document.createElement('div');
  toolbar.id = 'canvas-create-toolbar';
  toolbar.className = 'canvas-create-toolbar';
  toolbar.innerHTML = '<span class="canvas-tool-label">追加</span>';
  const split = document.createElement('div');
  split.className = 'split-add-control';
  split.append(els['add-note']);
  if (shape) split.append(shape);
  toolbar.append(split, els['add-group'], els['add-phase'], els['auto-layout']);
  els.board.append(toolbar);

  els['add-note'].classList.add('canvas-primary-add');
  els['add-note'].innerHTML = '<span>＋</span><span>処理</span>';
  if (shape) {
    shape.classList.add('shape-menu-trigger');
    shape.innerHTML = '<span aria-hidden="true">⌄</span>';
    shape.title = '追加する図形を選ぶ';
  }
  els['add-group'].innerHTML = '<span>▣</span><span>囲み</span>';
  els['add-phase'].innerHTML = '<span>┃</span><span>フェーズ</span>';
  els['auto-layout'].innerHTML = '<span>整える</span><span aria-hidden="true">⌄</span>';

  const viewTools = document.createElement('div');
  viewTools.id = 'canvas-view-tools';
  viewTools.className = 'canvas-view-tools';
  const zoom = document.querySelector('.zoom-control');
  if (zoom) viewTools.append(zoom);
  viewTools.append(els['fit-view']);
  els.board.append(viewTools);
}

function v12OpenBoardMenu() {
  const menu = document.getElementById('board-menu-popover');
  const anchor = document.getElementById('current-board-button');
  if (!menu || !anchor || v12PracticeSession) return;
  const rect = anchor.getBoundingClientRect();
  menu.hidden = false;
  menu.style.left = `${clamp(rect.left, 8, window.innerWidth - 300)}px`;
  menu.style.top = `${rect.bottom + 7}px`;
  v12BoardMenuOpen = true;
}

async function v12HandleBoardMenuAction(action) {
  const info = getActiveBoardInfo();
  v12CloseBoardMenu();
  if (action === 'list') return openBoardListDialog();
  if (action === 'new') return openBoardNameDialog('new');
  if (action === 'rename') return openBoardNameDialog('rename', info.id, info.name);
  if (action === 'duplicate') {
    try {
      const copy = await duplicateSavedBoard(info.id);
      await openSavedBoard(copy.id);
      updateBoardManagementState();
      requestAnimationFrame(() => fitView());
      toast('複製したボードを開きました');
    } catch (error) {
      console.error(error);
      toast(error.message || '複製できませんでした');
    }
    return;
  }
  if (action === 'delete') {
    openConfirmAction({
      title: 'このボードを削除',
      copy: `「${info.name}」を保存一覧から削除します。`,
      buttonLabel: 'ボードを削除',
      action: async () => {
        await deleteSavedBoard(info.id);
        updateBoardManagementState();
        requestAnimationFrame(() => fitView());
        toast('ボードを削除しました');
      }
    });
  }
}

function v12CancelDraft() {
  if (!v12DraftNode) return;
  v12DraftNode.element?.remove();
  v12DraftNode = null;
}

function v12CommitDraft() {
  if (!v12DraftNode) return null;
  const draft = v12DraftNode;
  const value = draft.input.value.trim();
  v12DraftNode = null;
  draft.element.remove();
  if (!value) return null;
  const created = addNoteMutation(draft.x, draft.y, {
    type: draft.type,
    title: value,
    label: '空白クリックで処理を追加',
    editMode: 'skip'
  });
  document.dispatchEvent(new CustomEvent('flowmap:blank-created', { detail: { noteId: created?.id || null } }));
  return created;
}

function v12StartDraft(worldX, worldY, type = 'process') {
  v12CancelDraft();
  clearSelection();
  const x = clamp(worldX - 112, 0, WORLD.width - 224);
  const y = clamp(worldY - 58, 0, WORLD.height - 116);
  const element = document.createElement('div');
  element.className = `v12-draft-node node-type-${type}`;
  element.style.left = `${x}px`;
  element.style.top = `${y}px`;
  element.innerHTML = `<span>${nodeTypeIcon(type)} ${nodeTypeLabel(type)}</span><textarea rows="2" maxlength="140" placeholder="処理を入力して Enter"></textarea><small>Escで取消・Shift＋Enterで改行</small>`;
  els['node-layer'].append(element);
  const input = element.querySelector('textarea');
  v12DraftNode = { x, y, type, element, input, finishing: false };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      v12CancelDraft();
      els.stage.focus();
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      v12CommitDraft();
    }
  });
  input.addEventListener('blur', () => {
    const current = v12DraftNode;
    if (!current || current.input !== input) return;
    queueMicrotask(() => {
      if (!v12DraftNode || v12DraftNode.input !== input) return;
      if (input.value.trim()) v12CommitDraft();
      else v12CancelDraft();
    });
  });
  requestAnimationFrame(() => input.focus());
}

beginNodeDrag = function beginNodeDragV12(event, noteId) {
  const item = getNote(noteId);
  if (!item || event.button !== 0 || spaceHeld) return;
  v12CancelDraft();
  const point = screenToWorld(event.clientX, event.clientY);
  drag = {
    type: 'note', id: noteId, startX: point.x, startY: point.y,
    originalX: item.x, originalY: item.y, before: snapshot(), moved: false,
    threshold: v12PointThreshold(event), pointerType: event.pointerType
  };
  select('note', noteId, { openInspector: false });
  event.preventDefault();
};

beginGroupDrag = function beginGroupDragV12(event, groupId) {
  const group = getGroup(groupId);
  if (!group || event.button !== 0 || spaceHeld) return;
  const point = screenToWorld(event.clientX, event.clientY);
  drag = {
    type: 'group', id: groupId, startX: point.x, startY: point.y,
    originalX: group.x, originalY: group.y, before: snapshot(), moved: false,
    threshold: v12PointThreshold(event),
    noteOrigins: state.notes.filter((item) => item.groupId === groupId).map((item) => ({ id: item.id, x: item.x, y: item.y }))
  };
  select('group', groupId, { openInspector: false });
  event.preventDefault();
};

beginPan = function beginPanV12(event) {
  if (event.defaultPrevented) return false;
  const shortcutPan = spaceHeld || event.button === 1;
  const interactive = event.target.closest('.sticky-note,.v12-draft-node,.group-header,.phase-title,.edge-hit,.edge-endpoint,button,input,textarea,select,[contenteditable="true"]');
  const directCanvas = event.button === 0 && !shortcutPan && !interactive;
  if (!shortcutPan && !directCanvas) return false;
  const point = screenToWorld(event.clientX, event.clientY);
  drag = {
    type: 'pan', clientX: event.clientX, clientY: event.clientY,
    x: state.viewport.x, y: state.viewport.y, moved: false,
    createOnClick: directCanvas, createX: point.x, createY: point.y,
    threshold: v12PointThreshold(event)
  };
  els.stage.classList.add('is-panning');
  event.preventDefault();
  return true;
};

function v12ClearDirectionalPreview() {
  v12DirectionalDrop = null;
  document.getElementById('connection-drop-zones')?.remove();
  document.getElementById('connection-drop-ghost')?.remove();
  $$('.sticky-note.is-connect-target,.sticky-note.is-connect-source', els['node-layer'])
    .forEach((node) => node.classList.remove('is-connect-target', 'is-connect-source'));
  if (!connect) {
    els['connection-preview'].hidden = true;
    els['connection-preview'].setAttribute('d', '');
  }
}

function v12DropTargetAt(point, sourceId) {
  let best = null;
  let bestDistance = Infinity;
  state.notes.forEach((item) => {
    if (item.id === sourceId) return;
    const size = noteDisplaySize(item);
    const pad = 38;
    if (point.x < item.x - pad || point.x > item.x + size.w + pad || point.y < item.y - pad || point.y > item.y + size.h + pad) return;
    const cx = item.x + size.w / 2;
    const cy = item.y + size.h / 2;
    const distance = Math.hypot(point.x - cx, point.y - cy);
    if (distance < bestDistance) { best = item; bestDistance = distance; }
  });
  return best;
}

function v12DropSide(point, target) {
  const size = noteDisplaySize(target);
  const cx = target.x + size.w / 2;
  const cy = target.y + size.h / 2;
  const nx = (point.x - cx) / Math.max(1, size.w / 2);
  const ny = (point.y - cy) / Math.max(1, size.h / 2);
  if (Math.abs(nx) < .30 && Math.abs(ny) < .30) return null;
  if (Math.abs(nx) >= Math.abs(ny)) return nx < 0 ? 'left' : 'right';
  return ny < 0 ? 'top' : 'bottom';
}

function v12FinalDrop(item, target, side) {
  const size = noteDisplaySize(item);
  const targetSize = noteDisplaySize(target);
  const gap = 72;
  const result = { side, fromId: item.id, toId: target.id, x: item.x, y: item.y };
  if (side === 'left') {
    result.x = target.x - size.w - gap; result.y = target.y;
  } else if (side === 'right') {
    result.x = target.x + targetSize.w + gap; result.y = target.y; result.fromId = target.id; result.toId = item.id;
  } else if (side === 'top') {
    result.x = target.x; result.y = target.y - size.h - gap;
  } else if (side === 'bottom') {
    result.x = target.x; result.y = target.y + targetSize.h + gap; result.fromId = target.id; result.toId = item.id;
  }
  result.x = clamp(result.x, 0, WORLD.width - size.w);
  result.y = clamp(result.y, 0, WORLD.height - size.h);
  return result;
}

function v12PreviewPath(item, target, drop) {
  const size = noteDisplaySize(item);
  const targetSize = noteDisplaySize(target);
  let start;
  let end;
  if (drop.side === 'left') {
    start = { x: drop.x + size.w, y: drop.y + size.h / 2 };
    end = { x: target.x, y: target.y + targetSize.h / 2 };
  } else if (drop.side === 'right') {
    start = { x: target.x + targetSize.w, y: target.y + targetSize.h / 2 };
    end = { x: drop.x, y: drop.y + size.h / 2 };
  } else if (drop.side === 'top') {
    start = { x: drop.x + size.w / 2, y: drop.y + size.h };
    end = { x: target.x + targetSize.w / 2, y: target.y };
  } else {
    start = { x: target.x + targetSize.w / 2, y: target.y + targetSize.h };
    end = { x: drop.x + size.w / 2, y: drop.y };
  }
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  return horizontal
    ? `M ${start.x} ${start.y} H ${(start.x + end.x) / 2} V ${end.y} H ${end.x}`
    : `M ${start.x} ${start.y} V ${(start.y + end.y) / 2} H ${end.x} V ${end.y}`;
}

function v12ShowDirectionalPreview(item, event) {
  const point = screenToWorld(event.clientX, event.clientY);
  const target = v12DropTargetAt(point, item.id);
  v12ClearDirectionalPreview();
  if (!target) return;
  const side = v12DropSide(point, target);
  const targetSize = noteDisplaySize(target);
  const zones = document.createElement('div');
  zones.id = 'connection-drop-zones';
  zones.className = `connection-drop-zones ${side ? `has-side side-${side}` : 'needs-side'}`;
  zones.style.left = `${target.x - 48}px`;
  zones.style.top = `${target.y - 48}px`;
  zones.style.width = `${targetSize.w + 96}px`;
  zones.style.height = `${targetSize.h + 96}px`;
  zones.innerHTML = '<i data-side="top">↑</i><i data-side="right">→</i><i data-side="bottom">↓</i><i data-side="left">←</i><b>方向を選ぶ</b>';
  els['node-layer'].append(zones);
  $(`[data-note-id="${item.id}"]`, els['node-layer'])?.classList.add('is-connect-source');
  $(`[data-note-id="${target.id}"]`, els['node-layer'])?.classList.add('is-connect-target');
  if (!side) return;

  const drop = v12FinalDrop(item, target, side);
  v12DirectionalDrop = { ...drop, sourceId: item.id, targetId: target.id };
  const ghost = document.createElement('div');
  ghost.id = 'connection-drop-ghost';
  ghost.className = `connection-drop-ghost node-type-${item.type || 'process'}`;
  ghost.style.left = `${drop.x}px`;
  ghost.style.top = `${drop.y}px`;
  ghost.style.width = `${noteDisplaySize(item).w}px`;
  ghost.style.height = `${noteDisplaySize(item).h}px`;
  ghost.textContent = item.title;
  els['node-layer'].append(ghost);
  els['connection-preview'].hidden = false;
  els['connection-preview'].setAttribute('d', v12PreviewPath(item, target, drop));
}

handlePointerMove = function handlePointerMoveV12(event) {
  if (connect) return updateConnection(event);
  if (!drag) return;
  if (drag.type === 'pan') {
    const dx = event.clientX - drag.clientX;
    const dy = event.clientY - drag.clientY;
    drag.moved ||= Math.hypot(dx, dy) > drag.threshold;
    if (drag.moved) {
      state.viewport.x = drag.x + dx;
      state.viewport.y = drag.y + dy;
      applyLayout();
      renderMinimap();
    }
    return;
  }
  const point = screenToWorld(event.clientX, event.clientY);
  const dx = point.x - drag.startX;
  const dy = point.y - drag.startY;
  drag.moved ||= Math.hypot(dx, dy) > drag.threshold;
  if (!drag.moved) return;
  if (drag.type === 'note') {
    const item = getNote(drag.id);
    item.x = clamp(drag.originalX + dx, 0, WORLD.width - 90);
    item.y = clamp(drag.originalY + dy, 0, WORLD.height - 60);
    const group = findGroupAt(item.x + noteDisplaySize(item).w / 2, item.y + noteDisplaySize(item).h / 2);
    $$('.group-card.drag-over', els['group-layer']).forEach((node) => node.classList.remove('drag-over'));
    if (group) $(`[data-group-id="${group.id}"]`, els['group-layer'])?.classList.add('drag-over');
    const nodeEl = $(`[data-note-id="${item.id}"]`, els['node-layer']);
    if (nodeEl) { nodeEl.style.left = `${item.x}px`; nodeEl.style.top = `${item.y}px`; }
    renderEdges();
    renderMinimap();
    v12ShowDirectionalPreview(item, event);
  } else if (drag.type === 'group') {
    const group = getGroup(drag.id);
    group.x = clamp(drag.originalX + dx, 0, WORLD.width - group.w);
    group.y = clamp(drag.originalY + dy, 0, WORLD.height - group.h);
    drag.noteOrigins.forEach((origin) => {
      const item = getNote(origin.id);
      if (item) { item.x = origin.x + dx; item.y = origin.y + dy; }
    });
    renderGroups(); renderNotes(); renderEdges(); renderMinimap();
  }
};

function v12CommitDirectionalDrop(item, drop) {
  const target = getNote(drop.targetId);
  if (!target) return false;
  item.x = drop.x;
  item.y = drop.y;
  item.groupId = target.groupId || '';
  item.phaseId = target.phaseId || item.phaseId;
  const exists = state.edges.some((entry) =>
    (entry.from === item.id && entry.to === target.id) ||
    (entry.from === target.id && entry.to === item.id)
  );
  if (!exists) state.edges.push(edge(uid('edge'), drop.fromId, drop.toId));
  recordActivity(exists ? '接続済みの図形を整列' : '方向を指定して図形を接続', item.id);
  if (typeof actionToast === 'function') actionToast(exists ? 'すでに接続されています' : '図形をつなぎました', '元に戻す', undo);
  else toast(exists ? 'すでに接続されています' : '図形をつなぎました');
  document.dispatchEvent(new CustomEvent('flowmap:nodes-connected', { detail: { fromId: drop.fromId, toId: drop.toId } }));
  return true;
}

function v12FinalizePlainDrop(noteId) {
  const item = getNote(noteId);
  if (!item) return;
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
    state.edges.push(edge(uid('edge'), edgeItem.from, noteId, edgeItem.label || ''), edge(uid('edge'), noteId, edgeItem.to, ''));
    recordActivity('矢印の途中へ図形を挿入', noteId);
    toast('矢印の途中へ図形を挿入しました');
    return;
  }
  recordActivity('図形を移動', noteId);
}

handlePointerUp = function handlePointerUpV12(event) {
  if (connect) return finishConnection(event);
  if (!drag) return;
  if (drag.type === 'pan') {
    const finished = drag;
    drag = null;
    els.stage.classList.remove('is-panning');
    if (finished.moved) {
      suppressClickAfterPan();
      saveState(); renderAll();
      return;
    }
    if (finished.createOnClick) {
      suppressClickAfterPan();
      v12StartDraft(finished.createX, finished.createY, 'process');
      return;
    }
    return;
  }
  const finished = drag;
  drag = null;
  const drop = v12DirectionalDrop;
  v12ClearDirectionalPreview();
  $$('.group-card.drag-over', els['group-layer']).forEach((node) => node.classList.remove('drag-over'));
  if (!finished.moved) return renderAll();
  undoStack.push(finished.before);
  redoStack.length = 0;
  if (finished.type === 'note') {
    const item = getNote(finished.id);
    if (!item || !drop || drop.sourceId !== item.id || !v12CommitDirectionalDrop(item, drop)) v12FinalizePlainDrop(finished.id);
  } else if (finished.type === 'group') {
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

startInlineEdit = function startInlineEditV12(noteId, mode = 'default') {
  if (mode === 'skip') return;
  const item = getNote(noteId);
  const card = $(`[data-note-id="${noteId}"]`, els['node-layer']);
  if (!item || !card) return;
  const title = $('.node-title', card);
  if (!title || $('.inline-title-editor', card)) return;
  title.hidden = true;
  const editor = document.createElement('textarea');
  editor.className = 'inline-title-editor';
  editor.value = item.title === '新しい付箋' || item.title === '新しい処理' ? '' : item.title;
  editor.rows = 2;
  title.after(editor);
  editor.focus(); editor.select();
  const original = item.title;
  let finished = false;
  const commit = (nextAction = 'none') => {
    if (finished) return;
    finished = true;
    const value = editor.value.trim() || original || '無題の処理';
    editor.remove(); title.hidden = false;
    if (value !== item.title) mutate('図形名を変更', () => { item.title = value; }, item.id);
    else renderAll();
    if (nextAction === 'below') addSibling(item.id);
    if (nextAction === 'child') addChild(item.id);
  };
  editor.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      finished = true; editor.remove(); title.hidden = false; renderAll();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault(); commit('child');
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); commit('none');
    } else if (event.key === 'Tab') {
      event.preventDefault(); commit('below');
    }
  });
  editor.addEventListener('blur', () => { if (!finished && document.body.contains(editor)) commit('none'); }, { once: true });
};

handleKeyDown = function handleKeyDownV12(event) {
  const typing = event.target.matches('input,textarea,select,[contenteditable="true"]');
  if (event.code === 'Space' && !typing) { spaceHeld = true; event.preventDefault(); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); els['search-input'].focus(); els['search-input'].select(); return; }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && !typing) { event.preventDefault(); duplicateSelected(); return; }
  if (typing) return;
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelection(); return; }
  if (event.key === 'Escape') { v12CancelDraft(); clearSelection(); return; }
  if (event.key.toLowerCase() === 'f') { event.preventDefault(); selection.type === 'note' ? fitView(selection.id) : fitView(); return; }
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && selection.type === 'note') { event.preventDefault(); addChild(selection.id); return; }
  if (event.key === 'Enter' && selection.type === 'note') { event.preventDefault(); startInlineEdit(selection.id); return; }
  if (event.key === 'Tab') {
    event.preventDefault();
    if (selection.type === 'note') addSibling(selection.id);
    else {
      const rect = els.stage.getBoundingClientRect();
      const point = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
      v12StartDraft(point.x, point.y, 'process');
    }
  }
};

const clearSelectionBeforeV12 = clearSelection;
clearSelection = function clearSelectionV12() {
  selection = { type: null, id: null };
  if (!v12PracticeSession) state.settings.inspectorOpen = false;
  closeQuickPopover();
  renderAll();
};

const renderNotesBeforeV12 = renderNotes;
renderNotes = function renderNotesV12() {
  renderNotesBeforeV12();
  $$('.node-quick-actions', els['node-layer']).forEach((row) => {
    $$('[data-quick]', row).forEach((button) => {
      if (!['type', 'status'].includes(button.dataset.quick)) button.remove();
    });
    const card = row.closest('[data-note-id]');
    if (!card || row.querySelector('[data-node-command]')) return;
    row.insertAdjacentHTML('beforeend', `<button type="button" data-node-command="duplicate" data-note-id="${card.dataset.noteId}">複製</button><button class="quick-danger" type="button" data-node-command="delete" data-note-id="${card.dataset.noteId}">削除</button>`);
  });
};

function v12LayoutSubset(items, bounds) {
  if (!items.length) return;
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const columns = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(sorted.length))));
  const cellW = 292;
  const cellH = 170;
  sorted.forEach((item, index) => {
    item.x = clamp(bounds.x + (index % columns) * cellW, 0, WORLD.width - 224);
    item.y = clamp(bounds.y + Math.floor(index / columns) * cellH, 0, WORLD.height - 116);
  });
}

function v12OpenLayoutMenu(anchor) {
  const pop = els['quick-popover'];
  const rect = anchor.getBoundingClientRect();
  const selectedGroup = selection.type === 'group' ? getGroup(selection.id) : selection.type === 'note' ? getGroup(getNote(selection.id)?.groupId) : null;
  const selectedPhase = selection.type === 'phase' ? getPhase(selection.id) : selection.type === 'note' ? getPhase(getNote(selection.id)?.phaseId) : null;
  pop.innerHTML = `<strong>整える範囲</strong><div class="layout-menu">
    <button type="button" data-layout-scope="group" ${selectedGroup ? '' : 'disabled'}>現在の囲み</button>
    <button type="button" data-layout-scope="phase" ${selectedPhase ? '' : 'disabled'}>現在のフェーズ</button>
    <button type="button" data-layout-scope="all">ボード全体</button>
  </div>`;
  pop.hidden = false;
  pop.style.left = `${clamp(rect.left, 8, window.innerWidth - 242)}px`;
  pop.style.top = `${clamp(rect.bottom + 6, 8, window.innerHeight - 170)}px`;
  $$('[data-layout-scope]', pop).forEach((button) => button.addEventListener('click', () => {
    const scope = button.dataset.layoutScope;
    if (scope === 'all') autoLayout();
    else if (scope === 'group' && selectedGroup) mutate('囲み内を整える', () => v12LayoutSubset(state.notes.filter((item) => item.groupId === selectedGroup.id), { x: selectedGroup.x + 28, y: selectedGroup.y + 60 }));
    else if (scope === 'phase' && selectedPhase) mutate('フェーズ内を整える', () => v12LayoutSubset(state.notes.filter((item) => item.phaseId === selectedPhase.id), { x: selectedPhase.x + 28, y: selectedPhase.y + 58 }));
    closeQuickPopover();
  }));
}

FLOWMAP_TUTORIAL_STEPS.splice(0, FLOWMAP_TUTORIAL_STEPS.length,
  { selector:'#add-note', title:'1. まず、このボタンを押す', body:'「＋処理」を押してください。練習ボードなので、普段のデータは変わりません。', actionEvent:'click', actionSelector:'#add-note' },
  { selector:'#stage', title:'2. 空白へ処理を置く', body:'空いている場所をクリックし、処理名を入力してEnterを押してください。何も入力しなければ作成されません。', actionEvent:'flowmap:blank-created' },
  { selector:'#stage', prepare:'close-editor', title:'3. 方向を見ながらつなぐ', body:'図形をもう一方へ近づけ、上下左右の矢印が出たら接続したい方向へポインターを動かして離してください。', actionEvent:'flowmap:nodes-connected' },
  { selector:'#inspector', prepare:'open-inspector', title:'4. 詳細は選んだ時だけ開く', body:'図形を選ぶと右側に詳細が開きます。選択を外すと閉じ、キャンバスを広く使えます。' },
  { selector:'#current-board-button', title:'5. ボード管理は名前から', body:'ボード名を押すと、一覧、新規作成、名前変更、複製、削除をまとめて操作できます。編集内容は自動保存です。' }
);

startTutorial = function startTutorialV12() {
  if (v12PracticeSession) return;
  document.querySelector('.inline-title-editor')?.blur();
  v12CancelDraft();
  v12PracticeSession = {
    state: clone(state),
    selection: clone(selection),
    undoStack: clone(undoStack),
    redoStack: clone(redoStack),
    activeTab
  };
  const now = new Date().toISOString();
  state = normalizeFlowchartState({
    version: 7, phases: [], groups: [], notes: [], edges: [],
    viewport: { x: 120, y: 100, scale: 1 },
    activity: [{ id: uid('activity'), at: now, label: '操作練習を開始', noteId: null }],
    settings: { grid: true, navigatorOpen: false, inspectorOpen: false }
  });
  selection = { type: null, id: null };
  undoStack.length = 0;
  redoStack.length = 0;
  activeTab = 'detail';
  tutorialRunning = true;
  document.getElementById('tutorial-layer').hidden = false;
  renderAll();
  v12UpdateHeader();
  showTutorialStep(0);
};

finishTutorial = async function finishTutorialV12() {
  clearTimeout(tutorialAdvanceTimer);
  v12CancelDraft();
  v12ClearDirectionalPreview();
  tutorialRunning = false;
  document.getElementById('tutorial-layer').hidden = true;
  tutorialTarget?.classList.remove('tutorial-target');
  tutorialTarget = null;
  if (!v12PracticeSession) return;
  state = v12PracticeSession.state;
  selection = v12PracticeSession.selection;
  undoStack = v12PracticeSession.undoStack;
  redoStack = v12PracticeSession.redoStack;
  activeTab = v12PracticeSession.activeTab;
  v12PracticeSession = null;
  renderAll();
  updateBoardManagementState();
};

maybeStartTutorial = async function maybeStartTutorialV12() {};

async function v12PreparePanelDefaults() {
  try {
    const prepared = await getFlowmapMeta(FLOWMAP_V12_UI_META);
    if (prepared) return;
    state.settings.navigatorOpen = false;
    state.settings.inspectorOpen = false;
    await setFlowmapMeta(FLOWMAP_V12_UI_META, true);
  } catch (error) {
    console.warn('[Flowmap] UI preference migration failed', error);
  }
}

function v12BindExtraEvents() {
  document.getElementById('current-board-button')?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (v12BoardMenuOpen) v12CloseBoardMenu(); else v12OpenBoardMenu();
  });
  document.getElementById('board-menu-popover')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-board-menu-action]');
    if (button) void v12HandleBoardMenuAction(button.dataset.boardMenuAction);
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('#current-board-button,#board-menu-popover')) v12CloseBoardMenu();
  });
  els['node-layer'].addEventListener('click', (event) => {
    const command = event.target.closest('[data-node-command]');
    if (!command) return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    selection = { type: 'note', id: command.dataset.noteId };
    if (command.dataset.nodeCommand === 'duplicate') duplicateSelected();
    else if (command.dataset.nodeCommand === 'delete') deleteSelection();
  }, true);
  els['auto-layout'].addEventListener('click', (event) => {
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    v12OpenLayoutMenu(els['auto-layout']);
  }, true);
  window.addEventListener('resize', () => { if (v12BoardMenuOpen) v12CloseBoardMenu(); });
}

function updatePanGuidance() {
  els['canvas-hint'].innerHTML = '<strong>空白をクリック</strong>して入力　・　ドラッグで移動　・　図形を近づけて方向を選び接続';
  const shortcuts = [...els['help-dialog'].querySelectorAll('.shortcut-grid > div')];
  const add = shortcuts.find((item) => item.textContent.includes('ダブルクリック') || item.textContent.includes('空白をクリック'));
  if (add) add.innerHTML = '<kbd>空白をクリック</kbd><span>仮の処理を置く。入力してEnterで確定</span>';
  const pan = shortcuts.find((item) => item.textContent.includes('Space + ドラッグ') || item.textContent.includes('空白をドラッグ'));
  if (pan) pan.innerHTML = '<kbd>空白をドラッグ</kbd><span>8px以上動かすとボード移動。タッチは12px</span>';
  const connectHelp = shortcuts.find((item) => item.textContent.includes('図形を重ねる') || item.textContent.includes('上下左右の点') || item.textContent.includes('右端の点'));
  if (connectHelp) connectHelp.innerHTML = '<kbd>図形を近づける</kbd><span>上下左右の方向を選んで接続。中央では確定しない</span>';
  const enter = shortcuts.find((item) => item.querySelector('kbd')?.textContent.trim() === 'Enter');
  if (enter) enter.innerHTML = '<kbd>Enter</kbd><span>タイトルを確定。Shift＋Enterは改行</span>';
  document.querySelector('.version-badge').textContent = 'v0.12.0';
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
  await v12PreparePanelDefaults();
  updatePanGuidance();
  installFlowchartUi();
  installWorkspaceManagement();
  v12InstallHeader();
  v12InstallCanvasTools();
  bindEvents();
  v12BindExtraEvents();
  renderAll();
  saveState();
  updateBoardManagementState();
  requestAnimationFrame(() => fitView());
  v12UiInstalled = true;
  window.Flowmap = {
    getState: () => clone(state),
    reset: () => { state = normalizeFlowchartState(initialState()); saveState(); renderAll(); },
    storage: { flush: () => flushStateSave(), list: () => listSavedBoards(), active: () => getActiveBoardInfo() },
    tutorial: { start: () => startTutorial(), finish: () => finishTutorial() }
  };
}
