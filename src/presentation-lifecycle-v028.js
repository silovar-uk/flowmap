/* Flowmap v0.28 — single owner for transient presentation lifecycle */
let presentationLifecycleInstalledV28 = false;
const presentationLifecycleV28 = {
  sequence: [],
  index: 0,
  playing: false,
  timer: null,
  showingAll: false,
  before: null
};

function presentationSequenceV28() {
  const ordered = typeof outlineSortedNotes === 'function' ? outlineSortedNotes() : [...state.notes];
  if (!ordered.length) return [];
  const selectedId = selection.type === 'note' && getNote(selection.id) ? selection.id : null;
  const incoming = new Set(state.edges.map((item) => item.to));
  const startId = selectedId || ordered.find((item) => !incoming.has(item.id))?.id || ordered[0].id;
  const visited = new Set();
  const result = [];
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift();
    if (!id || visited.has(id) || !getNote(id)) continue;
    visited.add(id);
    result.push(id);
    state.edges.filter((item) => item.from === id).forEach((item) => queue.push(item.to));
  }
  ordered.forEach((item) => { if (!visited.has(item.id)) result.push(item.id); });
  return result;
}

function presentationCurrentV28() {
  return getNote(presentationLifecycleV28.sequence[presentationLifecycleV28.index]);
}

function ensurePresentationControllerV28() {
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
      <span id="presentation-counter-v28">0 / 0</span>
      <strong id="presentation-title-v28">工程がありません</strong>
      <p id="presentation-summary-v28">工程を追加すると、順番に説明できます。</p>
    </div>
    <div class="presentation-actions">
      <button type="button" data-presentation-v28="prev">← 戻る</button>
      <button type="button" class="primary" data-presentation-v28="play">▶ 再生</button>
      <button type="button" data-presentation-v28="next">次へ →</button>
      <button type="button" data-presentation-v28="all">全体を見る</button>
      <button type="button" data-presentation-v28="exit">終了</button>
    </div>`;
  return controller;
}

function stopPresentationV28() {
  clearTimeout(presentationLifecycleV28.timer);
  presentationLifecycleV28.timer = null;
  presentationLifecycleV28.playing = false;
}

function applyPresentationVisualsV28() {
  if (currentFlowMode() !== 'present') return;
  const current = presentationCurrentV28();
  const previousId = presentationLifecycleV28.sequence[presentationLifecycleV28.index - 1];
  const nextId = presentationLifecycleV28.sequence[presentationLifecycleV28.index + 1];
  $$('.sticky-note', els['node-layer']).forEach((card) => {
    const id = card.dataset.noteId;
    card.classList.toggle('is-presentation-current', !presentationLifecycleV28.showingAll && id === current?.id);
    card.classList.toggle('is-presentation-near', !presentationLifecycleV28.showingAll && (id === previousId || id === nextId));
    card.classList.toggle('is-presentation-muted', !presentationLifecycleV28.showingAll && id !== current?.id && id !== previousId && id !== nextId);
  });
  state.edges.forEach((edgeItem) => {
    const group = els.edges.querySelector(`[data-edge-group="${edgeItem.id}"]`);
    if (!group) return;
    const near = edgeItem.from === current?.id || edgeItem.to === current?.id;
    group.classList.toggle('is-presentation-near', !presentationLifecycleV28.showingAll && near);
    group.classList.toggle('is-presentation-muted', !presentationLifecycleV28.showingAll && !near);
  });
}

function renderPresentationControllerV28() {
  const controller = ensurePresentationControllerV28();
  const active = currentFlowMode() === 'present';
  controller.hidden = !active;
  if (!active) return;
  const item = presentationCurrentV28();
  const count = document.getElementById('presentation-counter-v28');
  const title = document.getElementById('presentation-title-v28');
  const summary = document.getElementById('presentation-summary-v28');
  const prev = controller.querySelector('[data-presentation-v28="prev"]');
  const next = controller.querySelector('[data-presentation-v28="next"]');
  const play = controller.querySelector('[data-presentation-v28="play"]');
  const all = controller.querySelector('[data-presentation-v28="all"]');

  count.textContent = presentationLifecycleV28.sequence.length ? `${presentationLifecycleV28.index + 1} / ${presentationLifecycleV28.sequence.length}` : '0 / 0';
  title.textContent = presentationLifecycleV28.showingAll ? '図全体を表示中' : (item?.title || '工程がありません');
  summary.textContent = presentationLifecycleV28.showingAll
    ? '「次へ」で現在位置から説明を再開できます。'
    : (item?.summary || item?.note || [item?.assignee, item?.due].filter(Boolean).join('・') || '次の工程とのつながりを確認します。');
  prev.disabled = !item || presentationLifecycleV28.index <= 0;
  next.disabled = !item || (!presentationLifecycleV28.showingAll && presentationLifecycleV28.index >= presentationLifecycleV28.sequence.length - 1);
  play.disabled = !item || presentationLifecycleV28.sequence.length < 2 || presentationLifecycleV28.showingAll;
  play.textContent = presentationLifecycleV28.playing ? '■ 停止' : '▶ 再生';
  all.classList.toggle('is-active', presentationLifecycleV28.showingAll);
  applyPresentationVisualsV28();
  const badge = document.querySelector('.version-badge');
  if (badge) badge.textContent = 'v0.28.0';
}

function selectPresentationStepV28(index, { fit = true } = {}) {
  if (!presentationLifecycleV28.sequence.length) return;
  presentationLifecycleV28.index = clamp(index, 0, presentationLifecycleV28.sequence.length - 1);
  presentationLifecycleV28.showingAll = false;
  const item = presentationCurrentV28();
  if (item) {
    selection = { type: 'note', id: item.id };
    if (typeof selectedNoteIds !== 'undefined') selectedNoteIds = new Set([item.id]);
  }
  renderAll();
  renderPresentationControllerV28();
  if (fit && item) {
    requestAnimationFrame(() => {
      fitView(item.id);
      applyPresentationVisualsV28();
    });
  }
}

function schedulePresentationNextV28() {
  clearTimeout(presentationLifecycleV28.timer);
  if (!presentationLifecycleV28.playing) return;
  presentationLifecycleV28.timer = setTimeout(() => {
    if (presentationLifecycleV28.index >= presentationLifecycleV28.sequence.length - 1) {
      stopPresentationV28();
      renderPresentationControllerV28();
      toast('最後の工程まで確認しました');
      return;
    }
    selectPresentationStepV28(presentationLifecycleV28.index + 1);
    schedulePresentationNextV28();
  }, 2200);
}

function togglePresentationPlaybackV28() {
  if (!presentationLifecycleV28.sequence.length || presentationLifecycleV28.showingAll) return;
  presentationLifecycleV28.playing = !presentationLifecycleV28.playing;
  renderPresentationControllerV28();
  if (presentationLifecycleV28.playing) schedulePresentationNextV28();
  else stopPresentationV28();
}

function showPresentationOverviewV28() {
  if (!presentationLifecycleV28.sequence.length) return;
  stopPresentationV28();
  presentationLifecycleV28.showingAll = true;
  renderAll();
  renderPresentationControllerV28();
  requestAnimationFrame(() => {
    fitView();
    applyPresentationVisualsV28();
  });
}

function enterPresentationV28(previousMode = 'build') {
  stopPresentationV28();
  presentationLifecycleV28.before = {
    mode: previousMode,
    viewport: clone(state.viewport),
    selection: clone(selection),
    selectedNoteIds: typeof selectedNoteIds !== 'undefined' ? [...selectedNoteIds] : null
  };
  presentationLifecycleV28.sequence = presentationSequenceV28();
  const selectedIndex = selection.type === 'note' ? presentationLifecycleV28.sequence.indexOf(selection.id) : -1;
  presentationLifecycleV28.index = selectedIndex >= 0 ? selectedIndex : 0;
  presentationLifecycleV28.showingAll = false;
  renderPresentationControllerV28();
  const item = presentationCurrentV28();
  requestAnimationFrame(() => {
    if (item) fitView(item.id);
    else fitView();
    renderPresentationControllerV28();
  });
}

function leavePresentationV28() {
  stopPresentationV28();
  const before = presentationLifecycleV28.before;
  if (before) {
    state.viewport = clone(before.viewport);
    selection = clone(before.selection);
    if (typeof selectedNoteIds !== 'undefined' && Array.isArray(before.selectedNoteIds)) selectedNoteIds = new Set(before.selectedNoteIds);
  }
  presentationLifecycleV28.sequence = [];
  presentationLifecycleV28.index = 0;
  presentationLifecycleV28.showingAll = false;
  presentationLifecycleV28.before = null;
  document.getElementById('presentation-controller')?.setAttribute('hidden', '');
}

function exitPresentationV28() {
  const target = presentationLifecycleV28.before?.mode;
  setFlowMode(target && target !== 'present' ? target : 'build');
}

function installPresentationLifecycleV28() {
  if (presentationLifecycleInstalledV28) return;
  presentationLifecycleInstalledV28 = true;
  const controller = ensurePresentationControllerV28();
  controller.addEventListener('click', (event) => {
    const action = event.target.closest('[data-presentation-v28]')?.dataset.presentationV28;
    if (action === 'prev') return selectPresentationStepV28(presentationLifecycleV28.index - 1);
    if (action === 'next') return selectPresentationStepV28(presentationLifecycleV28.showingAll ? presentationLifecycleV28.index : presentationLifecycleV28.index + 1);
    if (action === 'play') return togglePresentationPlaybackV28();
    if (action === 'all') return showPresentationOverviewV28();
    if (action === 'exit') return exitPresentationV28();
  });
  document.addEventListener('keydown', (event) => {
    if (currentFlowMode() !== 'present' || event.target.matches('input,textarea,select,[contenteditable="true"]')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); selectPresentationStepV28(presentationLifecycleV28.index - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); selectPresentationStepV28(presentationLifecycleV28.showingAll ? presentationLifecycleV28.index : presentationLifecycleV28.index + 1); }
    if (event.key === ' ') { event.preventDefault(); togglePresentationPlaybackV28(); }
    if (event.key === 'Escape') { event.preventDefault(); exitPresentationV28(); }
  }, true);
  registerFlowmapMode('present', { enter: enterPresentationV28, leave: leavePresentationV28 });
}
