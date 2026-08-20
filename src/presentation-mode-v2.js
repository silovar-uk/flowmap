/* Flowmap v0.28 — presentation mode without render/bind monkey patches */
let presentationV2Bound = false;
let presentationV2 = {
  sequence: [],
  index: 0,
  playing: false,
  timer: null,
  showingAll: false,
  before: null
};

function presentationBuildSequence() {
  const ordered = outlineSortedNotes();
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

function installPresentationV2() {
  if (document.getElementById('presentation-controller') || !els.board) return;
  const controller = document.createElement('section');
  controller.id = 'presentation-controller';
  controller.className = 'presentation-controller';
  controller.hidden = true;
  controller.innerHTML = `
    <div class="presentation-copy">
      <span id="presentation-counter">0 / 0</span>
      <strong id="presentation-title">工程がありません</strong>
      <p id="presentation-summary">工程を追加すると、順番に説明できます。</p>
    </div>
    <div class="presentation-actions">
      <button type="button" data-presentation-prev>← 戻る</button>
      <button type="button" class="primary" data-presentation-play>▶ 再生</button>
      <button type="button" data-presentation-next>次へ →</button>
      <button type="button" data-presentation-all>全体を見る</button>
      <button type="button" data-presentation-exit>終了</button>
    </div>`;
  els.board.append(controller);
}

function presentationCurrentNote() {
  return getNote(presentationV2.sequence[presentationV2.index]);
}

function presentationStop() {
  clearTimeout(presentationV2.timer);
  presentationV2.timer = null;
  presentationV2.playing = false;
}

function presentationScheduleNext() {
  clearTimeout(presentationV2.timer);
  if (!presentationV2.playing) return;
  presentationV2.timer = setTimeout(() => {
    if (presentationV2.index >= presentationV2.sequence.length - 1) {
      presentationStop();
      presentationRenderUi();
      toast('最後の工程まで確認しました');
      return;
    }
    presentationSelect(presentationV2.index + 1);
    presentationScheduleNext();
  }, 2200);
}

function presentationApplyVisualState() {
  if (currentFlowMode() !== 'present') return;
  const current = presentationCurrentNote();
  const previousId = presentationV2.sequence[presentationV2.index - 1];
  const nextId = presentationV2.sequence[presentationV2.index + 1];
  $$('.sticky-note', els['node-layer']).forEach((card) => {
    const id = card.dataset.noteId;
    card.classList.toggle('is-presentation-current', id === current?.id && !presentationV2.showingAll);
    card.classList.toggle('is-presentation-near', !presentationV2.showingAll && (id === previousId || id === nextId));
    card.classList.toggle('is-presentation-muted', !presentationV2.showingAll && id !== current?.id && id !== previousId && id !== nextId);
  });
  state.edges.forEach((edgeItem) => {
    const group = els.edges.querySelector(`[data-edge-group="${edgeItem.id}"]`);
    if (!group) return;
    const near = edgeItem.from === current?.id || edgeItem.to === current?.id;
    group.classList.toggle('is-presentation-near', near && !presentationV2.showingAll);
    group.classList.toggle('is-presentation-muted', !near && !presentationV2.showingAll);
  });
}

function presentationRenderUi() {
  installPresentationV2();
  const controller = document.getElementById('presentation-controller');
  if (!controller) return;
  const active = currentFlowMode() === 'present';
  controller.hidden = !active;
  if (!active) return;
  const item = presentationCurrentNote();
  document.getElementById('presentation-counter').textContent = presentationV2.sequence.length ? `${presentationV2.index + 1} / ${presentationV2.sequence.length}` : '0 / 0';
  document.getElementById('presentation-title').textContent = item?.title || '工程がありません';
  const detail = item?.summary || item?.note || [item?.assignee, item?.due].filter(Boolean).join('・') || '次の工程とのつながりを確認します。';
  document.getElementById('presentation-summary').textContent = item ? detail : '工程を追加すると、順番に説明できます。';
  const previous = document.querySelector('[data-presentation-prev]');
  const next = document.querySelector('[data-presentation-next]');
  const play = document.querySelector('[data-presentation-play]');
  if (previous) previous.disabled = !item || presentationV2.index <= 0;
  if (next) next.disabled = !item || presentationV2.index >= presentationV2.sequence.length - 1;
  if (play) {
    play.disabled = !item || presentationV2.sequence.length < 2;
    play.textContent = presentationV2.playing ? '■ 停止' : '▶ 再生';
  }
  document.querySelector('[data-presentation-all]')?.classList.toggle('is-active', presentationV2.showingAll);
  presentationApplyVisualState();
}

function presentationSelect(index, { fit = true } = {}) {
  if (!presentationV2.sequence.length) return;
  presentationV2.index = clamp(index, 0, presentationV2.sequence.length - 1);
  presentationV2.showingAll = false;
  const item = presentationCurrentNote();
  if (item) {
    selection = { type: 'note', id: item.id };
    if (typeof selectedNoteIds !== 'undefined') selectedNoteIds = new Set([item.id]);
  }
  renderAll();
  presentationRenderUi();
  if (fit && item) {
    requestAnimationFrame(() => {
      fitView(item.id);
      presentationApplyVisualState();
    });
  }
}

function presentationEnter(previousMode = 'build') {
  installPresentationV2();
  presentationStop();
  presentationV2.before = {
    mode: previousMode,
    viewport: clone(state.viewport),
    selection: clone(selection),
    selectedNoteIds: typeof selectedNoteIds !== 'undefined' ? [...selectedNoteIds] : null
  };
  presentationV2.sequence = presentationBuildSequence();
  const selectedIndex = selection.type === 'note' ? presentationV2.sequence.indexOf(selection.id) : -1;
  presentationV2.index = selectedIndex >= 0 ? selectedIndex : 0;
  presentationV2.showingAll = false;
  const item = presentationCurrentNote();
  presentationRenderUi();
  requestAnimationFrame(() => {
    if (item) fitView(item.id);
    else fitView();
    presentationRenderUi();
  });
}

function presentationLeave() {
  presentationStop();
  const before = presentationV2.before;
  if (before) {
    state.viewport = clone(before.viewport);
    selection = clone(before.selection);
    if (typeof selectedNoteIds !== 'undefined' && Array.isArray(before.selectedNoteIds)) selectedNoteIds = new Set(before.selectedNoteIds);
  }
  presentationV2.sequence = [];
  presentationV2.index = 0;
  presentationV2.showingAll = false;
  presentationV2.before = null;
  document.getElementById('presentation-controller')?.setAttribute('hidden', '');
}

function presentationExit() {
  const target = presentationV2.before?.mode;
  setFlowMode(target && target !== 'present' ? target : 'build');
}

function presentationTogglePlay() {
  if (!presentationV2.sequence.length) return;
  presentationV2.playing = !presentationV2.playing;
  presentationRenderUi();
  if (presentationV2.playing) presentationScheduleNext();
  else presentationStop();
}

function presentationShowAll() {
  presentationStop();
  presentationV2.showingAll = true;
  renderAll();
  presentationRenderUi();
  requestAnimationFrame(() => {
    fitView();
    presentationApplyVisualState();
  });
}

function bindPresentationV2() {
  if (presentationV2Bound) return;
  presentationV2Bound = true;
  installPresentationV2();
  document.getElementById('presentation-controller')?.addEventListener('click', (event) => {
    if (event.target.closest('[data-presentation-prev]')) return presentationSelect(presentationV2.index - 1);
    if (event.target.closest('[data-presentation-next]')) return presentationSelect(presentationV2.index + 1);
    if (event.target.closest('[data-presentation-play]')) return presentationTogglePlay();
    if (event.target.closest('[data-presentation-all]')) return presentationShowAll();
    if (event.target.closest('[data-presentation-exit]')) return presentationExit();
  });
  document.addEventListener('keydown', (event) => {
    if (currentFlowMode() !== 'present' || event.target.matches('input,textarea,select,[contenteditable="true"]')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); presentationSelect(presentationV2.index - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); presentationSelect(presentationV2.index + 1); }
    if (event.key === ' ') { event.preventDefault(); presentationTogglePlay(); }
    if (event.key === 'Escape') { event.preventDefault(); presentationExit(); }
  }, true);
}

registerFlowmapMode('present', { enter: presentationEnter, leave: presentationLeave });
