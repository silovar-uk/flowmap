/* Flowmap v0.17.0 — outline-first editor UI */
function outlineInstallShell() {
  const navigator = els.navigator;
  if (!navigator || navigator.dataset.outlineInstalled === 'true') return;
  navigator.dataset.outlineInstalled = 'true';
  const kicker = navigator.querySelector('.panel-kicker');
  const heading = navigator.querySelector('.panel-header h2');
  if (kicker) kicker.textContent = 'OUTLINE';
  if (heading) heading.textContent = '工程';
  if (els['navigator-search']) els['navigator-search'].placeholder = '工程を検索';
  if (els['open-navigator']) els['open-navigator'].textContent = '工程';
  if (els['nav-add-phase']) els['nav-add-phase'].hidden = true;
  const footer = navigator.querySelector('.navigator-footer');
  if (footer && !document.getElementById('outline-add-note')) {
    footer.insertAdjacentHTML('beforeend', '<div class="outline-footer-actions"><button id="outline-add-note" class="outline-button" type="button">＋ 工程</button><button id="outline-add-relation" class="outline-button" type="button">関係を追加</button><button id="outline-arrange-canvas" class="outline-button quiet" type="button">図へ整列</button></div>');
  }
}

function outlineIncomingEdge(notes, index) {
  if (index <= 0) return null;
  const from = notes[index - 1];
  const to = notes[index];
  return state.edges.find((item) => item.from === from.id && item.to === to.id) || null;
}

function outlineRelationButton(notes, index) {
  if (index === 0) return '<button class="outline-relation is-start" type="button" disabled title="最初の工程">開始</button>';
  const edgeItem = outlineIncomingEdge(notes, index);
  if (!edgeItem) return '<button class="outline-relation is-missing" type="button" data-outline-relation title="前の工程との関係を設定">未接続</button>';
  const meta = OUTLINE_EDGE_META[edgeItem.kind] || OUTLINE_EDGE_META.sequence;
  return `<button class="outline-relation kind-${edgeItem.kind}" type="button" data-outline-relation data-edge-id="${edgeItem.id}" title="${meta.label}。クリックで種類を変更">${meta.icon}<span>${meta.label}</span></button>`;
}

function outlineRenderNavigator() {
  outlineInstallShell();
  const container = els['structure-tree'];
  if (!container) return;
  const scrollTop = container.scrollTop;
  const query = (els['navigator-search']?.value || '').trim().toLowerCase();
  const allNotes = outlineSortedNotes();
  const notes = query ? allNotes.filter((item) => `${item.title} ${item.summary || ''} ${(item.tags || []).join(' ')}`.toLowerCase().includes(query)) : allNotes;
  container.classList.add('outline-tree');
  container.innerHTML = notes.length ? notes.map((item) => {
    const fullIndex = allNotes.findIndex((noteItem) => noteItem.id === item.id);
    const phase = getPhase(item.phaseId);
    const group = getGroup(item.groupId);
    const selected = selection.type === 'note' && selection.id === item.id;
    const multi = typeof selectedNoteIds !== 'undefined' && selectedNoteIds.has(item.id);
    return `<div class="outline-row ${selected ? 'is-selected' : ''} ${multi ? 'is-multi-selected' : ''}" draggable="true" data-outline-id="${item.id}" data-depth="${item.depth}" style="--outline-depth:${item.depth}">
      <button class="outline-drag" type="button" title="ドラッグして並べ替え" aria-label="${esc(item.title)}を並べ替え">⠿</button>
      <span class="outline-depth-guide" aria-hidden="true"></span>
      <div class="outline-main">
        <textarea class="outline-title" rows="1" data-outline-title="${item.id}" aria-label="工程名">${esc(item.title)}</textarea>
        <span class="outline-context">${esc(group?.title || phase?.title || '未分類')}</span>
      </div>
      ${outlineRelationButton(allNotes, fullIndex)}
    </div>`;
  }).join('') : `<div class="outline-empty"><strong>${query ? '一致する工程がありません' : '工程はまだありません'}</strong><span>下の「＋ 工程」から文章で追加できます。</span></div>`;
  container.scrollTop = scrollTop;
  requestAnimationFrame(() => {
    $$('.outline-title', container).forEach(outlineResizeTextarea);
    if (outlineFocusAfterRender) {
      const input = container.querySelector(`[data-outline-title="${outlineFocusAfterRender}"]`);
      outlineFocusAfterRender = null;
      input?.focus();
      input?.select();
      input?.closest('.outline-row')?.scrollIntoView({ block: 'nearest' });
    }
  });
}

renderNavigator = outlineRenderNavigator;

function outlineResizeTextarea(input) {
  if (!input) return;
  input.style.height = '0px';
  input.style.height = `${Math.max(28, input.scrollHeight)}px`;
}

function outlineMarkSelection(noteId) {
  $$('.outline-row', els['structure-tree']).forEach((row) => row.classList.toggle('is-selected', row.dataset.outlineId === noteId));
}

function outlineSelectWithoutRerender(noteId) {
  if (!getNote(noteId)) return;
  selection = { type: 'note', id: noteId };
  if (typeof selectedNoteIds !== 'undefined') selectedNoteIds = new Set([noteId]);
  if (typeof stopFlowPlayback === 'function') stopFlowPlayback({ keepFocus: false, render: false });
  renderNotes();
  renderInspector();
  updateToolbar();
  outlineMarkSelection(noteId);
}

function outlineScheduleSave() {
  clearTimeout(outlineSaveTimer);
  outlineSaveTimer = setTimeout(() => {
    saveState();
    outlineSaveTimer = null;
  }, 180);
}

function outlineFindFreePosition(base, depth) {
  const size = typeof informationNoteSize === 'function' ? informationNoteSize({ type: 'process' }) : { w: 184, h: 88 };
  let x = clamp(base.x + Math.max(0, depth - (base.depth || 0)) * 210, 0, WORLD.width - size.w);
  let y = clamp(base.y + size.h + 30, 0, WORLD.height - size.h);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const collision = state.notes.some((item) => {
      const itemSize = noteDisplaySize(item);
      return x < item.x + itemSize.w + 14 && x + size.w + 14 > item.x && y < item.y + itemSize.h + 14 && y + size.h + 14 > item.y;
    });
    if (!collision) return { x, y };
    y = clamp(y + size.h + 24, 0, WORLD.height - size.h);
    if (y >= WORLD.height - size.h) {
      y = 80;
      x = clamp(x + size.w + 40, 0, WORLD.width - size.w);
    }
  }
  return { x, y };
}

function outlineCreateAfter(noteId = null) {
  const ordered = outlineSortedNotes();
  const baseIndex = noteId ? ordered.findIndex((item) => item.id === noteId) : ordered.length - 1;
  const base = baseIndex >= 0 ? ordered[baseIndex] : null;
  undoStack.push(snapshot());
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
  const position = base ? outlineFindFreePosition(base, base.depth || 0) : { x: 120, y: 150 };
  const item = note(uid('note'), '新しい処理', position.x, position.y, base?.phaseId || state.phases[0]?.id || '', base?.groupId || '', {
    now: new Date().toISOString(),
    type: 'process',
    depth: base?.depth || 0
  });
  state.notes.push(item);
  const ids = ordered.map((noteItem) => noteItem.id);
  ids.splice(baseIndex + 1, 0, item.id);
  outlineRenumber(state, ids);
  outlineUnsuppressPair(base?.id || '', item.id);
  outlineSyncAutoEdges();
  selection = { type: 'note', id: item.id };
  if (typeof selectedNoteIds !== 'undefined') selectedNoteIds = new Set([item.id]);
  recordActivity('アウトラインから工程を追加', item.id);
  saveState();
  outlineFocusAfterRender = item.id;
  renderAll();
  return item;
}

function outlineDeleteNote(noteId) {
  const ordered = outlineSortedNotes();
  const index = ordered.findIndex((item) => item.id === noteId);
  const fallback = ordered[index - 1] || ordered[index + 1] || null;
  outlineFocusAfterRender = fallback?.id || null;
  mutate('アウトラインから工程を削除', () => {
    state.notes = state.notes.filter((item) => item.id !== noteId);
    state.edges = state.edges.filter((item) => item.from !== noteId && item.to !== noteId);
    outlineRenumber();
    outlineSyncAutoEdges();
    selection = fallback ? { type: 'note', id: fallback.id } : { type: null, id: null };
    if (typeof selectedNoteIds !== 'undefined') selectedNoteIds = fallback ? new Set([fallback.id]) : new Set();
  });
}

function outlineChangeDepth(noteId, delta) {
  const ordered = outlineSortedNotes();
  const index = ordered.findIndex((item) => item.id === noteId);
  const item = ordered[index];
  if (!item) return;
  const previous = ordered[index - 1];
  let nextDepth = clamp((item.depth || 0) + delta, 0, OUTLINE_MAX_DEPTH);
  if (delta > 0) nextDepth = Math.min(nextDepth, (previous?.depth || 0) + 1);
  if (nextDepth === item.depth) return;
  outlineFocusAfterRender = item.id;
  mutate(nextDepth > item.depth ? '工程をインデント' : '工程のインデントを戻す', () => {
    item.depth = nextDepth;
    outlineRefreshParents();
  }, item.id);
}

function outlineMoveFocus(noteId, delta) {
  const ordered = outlineSortedNotes();
  const index = ordered.findIndex((item) => item.id === noteId);
  const target = ordered[index + delta];
  if (!target) return;
  outlineFocusAfterRender = target.id;
  renderNavigator();
}

function outlineCommitOrder(orderedIds, focusId = null) {
  outlineFocusAfterRender = focusId;
  mutate('アウトラインを並べ替え', () => {
    outlineRenumber(state, orderedIds);
    outlineSyncAutoEdges();
  });
}

function outlineCycleIncomingRelation(noteId) {
  const notes = outlineSortedNotes();
  const index = notes.findIndex((item) => item.id === noteId);
  if (index <= 0) return;
  const from = notes[index - 1];
  const to = notes[index];
  let item = state.edges.find((edgeItem) => edgeItem.from === from.id && edgeItem.to === to.id);
  mutate('工程間の関係を変更', () => {
    if (!item) {
      item = edge(uid('edge'), from.id, to.id, '', { source: 'manual', kind: 'sequence' });
      state.edges.push(item);
    } else {
      const currentIndex = OUTLINE_EDGE_KINDS.indexOf(item.kind);
      item.kind = OUTLINE_EDGE_KINDS[(currentIndex + 1) % OUTLINE_EDGE_KINDS.length];
      item.source = 'manual';
    }
    outlineUnsuppressPair(from.id, to.id);
    outlineSyncAutoEdges();
    selection = { type: 'edge', id: item.id };
  });
}

function outlineOpenRelationEditor(noteId, anchor) {
  const source = getNote(noteId);
  if (!source || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  const targets = outlineSortedNotes().filter((item) => item.id !== noteId);
  if (!targets.length) return toast('接続先となる工程がありません');
  const pop = els['quick-popover'];
  pop.classList.add('outline-relation-popover');
  pop.innerHTML = `<strong>関係を追加</strong>
    <label class="outline-pop-field"><span>向き</span><select data-outline-direction><option value="out">この工程から</option><option value="in">この工程へ</option></select></label>
    <label class="outline-pop-field"><span>相手</span><select data-outline-target>${targets.map((item) => `<option value="${item.id}">${esc(item.title)}</option>`).join('')}</select></label>
    <label class="outline-pop-field"><span>種類</span><select data-outline-kind>${OUTLINE_EDGE_KINDS.map((kind) => `<option value="${kind}">${OUTLINE_EDGE_META[kind].label}</option>`).join('')}</select></label>
    <label class="outline-pop-field"><span>ラベル</span><input data-outline-label type="text" maxlength="40" placeholder="任意"></label>
    <div class="quick-actions"><button type="button" data-quick-cancel>取消</button><button class="primary" type="button" data-outline-save-relation>追加</button></div>`;
  pop.hidden = false;
  pop.style.left = `${clamp(rect.left, 8, window.innerWidth - 264)}px`;
  pop.style.top = `${clamp(rect.bottom + 6, 8, window.innerHeight - 290)}px`;
  pop.style.width = '252px';
  $('[data-quick-cancel]', pop).onclick = closeQuickPopover;
  $('[data-outline-save-relation]', pop).onclick = () => {
    const direction = $('[data-outline-direction]', pop).value;
    const targetId = $('[data-outline-target]', pop).value;
    const kind = $('[data-outline-kind]', pop).value;
    const label = $('[data-outline-label]', pop).value.trim();
    const from = direction === 'out' ? noteId : targetId;
    const to = direction === 'out' ? targetId : noteId;
    let created = state.edges.find((item) => item.from === from && item.to === to);
    mutate('工程の関係を追加', () => {
      if (created) {
        created.kind = kind;
        created.label = label;
        created.source = 'manual';
      } else {
        created = edge(uid('edge'), from, to, label, { source: 'manual', kind });
        state.edges.push(created);
      }
      outlineUnsuppressPair(from, to);
      outlineSyncAutoEdges();
      selection = { type: 'edge', id: created.id };
    });
    closeQuickPopover();
  };
  requestAnimationFrame(() => $('[data-outline-target]', pop)?.focus());
}

function outlineArrangeCanvas() {
  if (!state.notes.length) return;
  mutate('アウトライン順に図を整列', () => {
    const contexts = new Map();
    outlineSortedNotes().forEach((item) => {
      const key = item.groupId ? `group:${item.groupId}` : `phase:${item.phaseId || ''}`;
      if (!contexts.has(key)) contexts.set(key, []);
      contexts.get(key).push(item);
    });
    contexts.forEach((notes, key) => {
      const isGroup = key.startsWith('group:');
      const id = key.slice(key.indexOf(':') + 1);
      const group = isGroup ? getGroup(id) : null;
      const phase = !isGroup ? getPhase(id) : null;
      const baseX = group ? group.x + 24 : (phase?.x || 40) + 34;
      const baseY = group ? group.y + 62 : Math.max((phase?.y || 40) + 74, ...state.groups.filter((item) => item.phaseId === id).map((item) => item.y + item.h + 34), 114);
      notes.forEach((item, index) => {
        const size = noteDisplaySize(item);
        item.x = clamp(baseX + (item.depth || 0) * 214, 0, WORLD.width - size.w);
        item.y = clamp(baseY + index * 118, 0, WORLD.height - size.h);
      });
      if (group) {
        const bottom = Math.max(...notes.map((item) => item.y + noteDisplaySize(item).h)) + 26;
        const right = Math.max(...notes.map((item) => item.x + noteDisplaySize(item).w)) + 26;
        group.h = Math.max(group.h, bottom - group.y);
        group.w = Math.max(group.w, right - group.x);
      }
    });
  });
}

function outlineHandleKeyDown(event) {
  const input = event.target.closest?.('[data-outline-title]');
  if (!input) return;
  const noteId = input.dataset.outlineTitle;
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    outlineOpenRelationEditor(noteId, input.closest('.outline-row'));
    return;
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    outlineCreateAfter(noteId);
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    outlineChangeDepth(noteId, event.shiftKey ? -1 : 1);
    return;
  }
  if (event.key === 'Backspace' && !input.value.trim()) {
    event.preventDefault();
    outlineDeleteNote(noteId);
    return;
  }
  if (event.key === 'ArrowUp' && input.selectionStart === 0 && input.selectionEnd === 0) {
    event.preventDefault();
    outlineMoveFocus(noteId, -1);
    return;
  }
  if (event.key === 'ArrowDown' && input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
    event.preventDefault();
    outlineMoveFocus(noteId, 1);
  }
}

function outlineBindEvents() {
  if (outlineEventsBound) return;
  outlineEventsBound = true;
  outlineInstallShell();
  const tree = els['structure-tree'];
  tree.addEventListener('focusin', (event) => {
    const input = event.target.closest?.('[data-outline-title]');
    if (input) outlineSelectWithoutRerender(input.dataset.outlineTitle);
  });
  tree.addEventListener('input', (event) => {
    const input = event.target.closest?.('[data-outline-title]');
    if (!input) return;
    const item = getNote(input.dataset.outlineTitle);
    if (!item) return;
    item.title = input.value;
    item.updatedAt = new Date().toISOString();
    outlineResizeTextarea(input);
    const canvasTitle = els['node-layer'].querySelector(`[data-note-id="${item.id}"] .node-title`);
    if (canvasTitle) canvasTitle.textContent = item.title || '無題の処理';
    outlineScheduleSave();
  });
  tree.addEventListener('change', (event) => {
    const input = event.target.closest?.('[data-outline-title]');
    if (!input) return;
    const item = getNote(input.dataset.outlineTitle);
    if (!item) return;
    const value = input.value.trim() || '無題の処理';
    if (item.title !== value) item.title = value;
    input.value = value;
    recordActivity('アウトラインで工程名を変更', item.id);
    saveState();
    renderNotes();
    renderInspector();
  });
  tree.addEventListener('keydown', outlineHandleKeyDown);
  tree.addEventListener('click', (event) => {
    const relation = event.target.closest('[data-outline-relation]');
    if (relation) {
      event.preventDefault();
      event.stopPropagation();
      outlineCycleIncomingRelation(relation.closest('.outline-row').dataset.outlineId);
      return;
    }
    const row = event.target.closest('.outline-row');
    if (row && !event.target.closest('textarea,button')) {
      select('note', row.dataset.outlineId, { openInspector: false });
      fitView(row.dataset.outlineId);
    }
  });
  tree.addEventListener('dragstart', (event) => {
    const row = event.target.closest('.outline-row');
    if (!row || !event.target.closest('.outline-drag')) {
      event.preventDefault();
      return;
    }
    outlineDragNoteId = row.dataset.outlineId;
    row.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', outlineDragNoteId);
  });
  tree.addEventListener('dragover', (event) => {
    const row = event.target.closest('.outline-row');
    if (!row || !outlineDragNoteId || row.dataset.outlineId === outlineDragNoteId) return;
    event.preventDefault();
    $$('.outline-row.is-drop-before,.outline-row.is-drop-after', tree).forEach((item) => item.classList.remove('is-drop-before', 'is-drop-after'));
    const rect = row.getBoundingClientRect();
    row.classList.add(event.clientY < rect.top + rect.height / 2 ? 'is-drop-before' : 'is-drop-after');
  });
  tree.addEventListener('drop', (event) => {
    const row = event.target.closest('.outline-row');
    if (!row || !outlineDragNoteId) return;
    event.preventDefault();
    const ids = outlineSortedNotes().map((item) => item.id).filter((id) => id !== outlineDragNoteId);
    const targetIndex = ids.indexOf(row.dataset.outlineId);
    const rect = row.getBoundingClientRect();
    ids.splice(targetIndex + (event.clientY >= rect.top + rect.height / 2 ? 1 : 0), 0, outlineDragNoteId);
    const moved = outlineDragNoteId;
    outlineDragNoteId = null;
    outlineCommitOrder(ids, moved);
  });
  tree.addEventListener('dragend', () => {
    outlineDragNoteId = null;
    $$('.outline-row', tree).forEach((item) => item.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after'));
  });
  els['navigator-search']?.addEventListener('input', renderNavigator);
  document.getElementById('outline-add-note')?.addEventListener('click', () => outlineCreateAfter(selection.type === 'note' ? selection.id : null));
  document.getElementById('outline-add-relation')?.addEventListener('click', (event) => {
    const noteId = selection.type === 'note' ? selection.id : outlineSortedNotes()[0]?.id;
    if (!noteId) return toast('先に工程を追加してください');
    outlineOpenRelationEditor(noteId, event.currentTarget);
  });
  document.getElementById('outline-arrange-canvas')?.addEventListener('click', outlineArrangeCanvas);
}

const renderAllBeforeOutlineWorkflow = renderAll;
renderAll = function renderAllOutlineWorkflow() {
  if (state?.notes && state?.edges) {
    outlineRenumber();
    outlineSyncAutoEdges();
  }
  return renderAllBeforeOutlineWorkflow();
};

const updateFlowExperienceUiBeforeOutlineWorkflow = updateFlowExperienceUi;
updateFlowExperienceUi = function updateFlowExperienceUiOutlineWorkflow() {
  updateFlowExperienceUiBeforeOutlineWorkflow();
  const badge = document.querySelector('.version-badge');
  if (badge) badge.textContent = `v${OUTLINE_VERSION}`;
  outlineInstallShell();
};

const bindEventsBeforeOutlineWorkflow = bindEvents;
bindEvents = function bindEventsOutlineWorkflow() {
  bindEventsBeforeOutlineWorkflow();
  outlineBindEvents();
};
