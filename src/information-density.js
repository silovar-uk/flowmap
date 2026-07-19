/* Flowmap v0.13 — clearer direction, compact cards and richer note details */
const INFO_COMPACT = {
  process: { w: 184, h: 88 },
  decision: { w: 190, h: 104 },
  terminal: { w: 184, h: 72 },
  input: { w: 184, h: 88 },
  document: { w: 184, h: 92 }
};

function informationNoteSize(item) {
  return INFO_COMPACT[item?.type] || INFO_COMPACT.process;
}

const normalizeInformationBefore = normalizeFlowchartState;
normalizeFlowchartState = function normalizeInformationState(next) {
  const normalized = normalizeInformationBefore(next);
  if (!normalized?.notes) return normalized;
  normalized.notes.forEach((item) => {
    item.summary = typeof item.summary === 'string' ? item.summary : '';
    item.memoItems = Array.isArray(item.memoItems) ? item.memoItems.map((memo) => ({
      id: memo.id || uid('memo'),
      title: typeof memo.title === 'string' ? memo.title : '',
      body: typeof memo.body === 'string' ? memo.body : '',
      updatedAt: memo.updatedAt || item.updatedAt || new Date().toISOString()
    })) : [];
    const compact = informationNoteSize(item);
    item.w = compact.w;
    item.h = compact.h;
  });
  return normalized;
};

const informationNoteFactoryBefore = note;
note = function informationNoteFactory(id, title, x, y, phaseId, groupId, extra = {}) {
  const item = informationNoteFactoryBefore(id, title, x, y, phaseId, groupId, extra);
  const compact = informationNoteSize(item);
  item.w = compact.w;
  item.h = compact.h;
  item.summary = typeof extra.summary === 'string' ? extra.summary : '';
  item.memoItems = Array.isArray(extra.memoItems) ? clone(extra.memoItems) : [];
  return item;
};

noteDisplaySize = function compactNoteDisplaySize(item) {
  if (state.viewport.scale < .46 && !isSelected('note', item.id)) return { w: 72, h: 44 };
  return informationNoteSize(item);
};

function edgeDirectionGeometry(path) {
  const points = path.points || [];
  let best = null;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (!best || length > best.length) best = { a, b, length };
  }
  if (!best || best.length < 18) return null;
  return {
    x: (best.a.x + best.b.x) / 2,
    y: (best.a.y + best.b.y) / 2,
    angle: Math.atan2(best.b.y - best.a.y, best.b.x - best.a.x) * 180 / Math.PI
  };
}

function edgeRoleBadge(point, label, className) {
  return `<g class="edge-role-badge ${className}" transform="translate(${point.x} ${point.y})"><circle r="9"></circle><text text-anchor="middle" dominant-baseline="central">${label}</text></g>`;
}

renderEdges = function renderInformationEdges() {
  const visibleEdges = state.edges.filter((item) => getNote(item.from) && getNote(item.to));
  els.edges.innerHTML = visibleEdges.map((item) => {
    const path = edgePath(item);
    const selected = isSelected('edge', item.id);
    const direction = edgeDirectionGeometry(path);
    const handles = selected
      ? `<circle class="edge-endpoint" data-edge-id="${item.id}" data-edge-end="from" cx="${path.start.x}" cy="${path.start.y}" r="7"></circle><circle class="edge-endpoint" data-edge-id="${item.id}" data-edge-end="to" cx="${path.end.x}" cy="${path.end.y}" r="7"></circle>`
      : '';
    const label = item.label
      ? `<text class="edge-label ${selected ? 'is-selected' : ''}" x="${path.labelPoint.x}" y="${path.labelPoint.y}" text-anchor="middle">${esc(item.label)}</text>`
      : '';
    const middleArrow = direction
      ? `<g class="edge-direction-marker ${selected ? 'is-selected' : ''}" transform="translate(${direction.x} ${direction.y})"><circle r="8"></circle><path d="M -4 -4 L 5 0 L -4 4 Z" transform="rotate(${direction.angle})"></path></g>`
      : '';
    const roles = selected
      ? `${edgeRoleBadge(path.start, '元', 'is-from')}${edgeRoleBadge(path.end, '先', 'is-to')}`
      : '';
    return `<g data-edge-group="${item.id}"><path class="edge-hit" data-edge-id="${item.id}" d="${path.d}"></path><path class="edge ${selected ? 'is-selected' : ''}" d="${path.d}"></path>${middleArrow}${label}${roles}${handles}</g>`;
  }).join('');
};

function informationMemoCount(item) {
  return (item.note?.trim() ? 1 : 0) + (item.memoItems || []).filter((memo) => memo.title.trim() || memo.body.trim()).length;
}

renderNotes = function renderInformationNotes() {
  const query = els['search-input'].value.trim().toLowerCase();
  const navQuery = els['navigator-search'].value.trim().toLowerCase();
  const search = query || navQuery;
  const selectedEdge = selection.type === 'edge' ? getEdge(selection.id) : null;
  els['node-layer'].innerHTML = state.notes.map((item) => {
    const group = getGroup(item.groupId);
    const hidden = group?.collapsed;
    const size = noteDisplaySize(item);
    const visibleTags = item.tags.slice(0, 2);
    const tags = visibleTags.map((tag) => `<span class="tag-chip">${esc(tag)}</span>`).join('');
    const extraTags = item.tags.length > visibleTags.length ? `<span class="tag-more">＋${item.tags.length - visibleTags.length}</span>` : '';
    const checklistDone = item.checklist.filter((check) => check.done).length;
    const progress = item.checklist.length ? Math.round(checklistDone / item.checklist.length * 100) : 0;
    const memoCount = informationMemoCount(item);
    const isOverdue = item.due && item.status !== 'done' && item.due < new Date().toISOString().slice(0, 10);
    const memoSearch = (item.memoItems || []).map((memo) => `${memo.title} ${memo.body}`).join(' ');
    const searchable = `${item.title} ${item.summary} ${item.assignee} ${item.tags.join(' ')} ${item.note} ${memoSearch} ${nodeTypeLabel(item.type)}`.toLowerCase();
    const match = search && searchable.includes(search);
    const edgeRole = selectedEdge?.from === item.id ? 'is-edge-from' : selectedEdge?.to === item.id ? 'is-edge-to' : '';
    const roleBadge = selectedEdge?.from === item.id ? '<span class="node-edge-role is-from">元</span>' : selectedEdge?.to === item.id ? '<span class="node-edge-role is-to">先</span>' : '';
    const handles = ['top', 'right', 'bottom', 'left'].map((port) => `<button class="connector-handle port-${port}" type="button" data-connect-from="${item.id}" data-connect-port="${port}" aria-label="${esc(item.title)}の${port}側から接続"></button>`).join('');
    return `<article class="sticky-note node-type-${item.type} ${isSelected('note', item.id) ? 'is-selected' : ''} ${isOverdue ? 'is-overdue' : ''} ${match ? 'is-search-match' : ''} ${edgeRole}" data-note-id="${item.id}" data-node-type="${item.type}" data-status="${item.status}" style="left:${item.x}px;top:${item.y}px;width:${size.w}px;min-height:${size.h}px;${hidden ? 'display:none;' : ''}">
      <span class="node-type-label">${nodeTypeIcon(item.type)} ${nodeTypeLabel(item.type)}</span>${roleBadge}
      <div class="node-title">${esc(item.title)}</div>
      ${item.summary ? `<div class="node-summary">${esc(item.summary)}</div>` : ''}
      <div class="node-meta"><span class="status-chip" data-status="${item.status}">${STATUS[item.status]}</span>${item.due ? `<span class="meta-compact">${esc(item.due.slice(5).replace('-', '/'))}</span>` : ''}${tags}${extraTags}${memoCount ? `<span class="memo-count">メモ ${memoCount}</span>` : ''}</div>
      ${item.checklist.length ? `<div class="node-progress" title="チェック ${checklistDone}/${item.checklist.length}"><i style="width:${progress}%"></i></div>` : ''}
      <div class="node-quick-actions"><button type="button" data-quick="type" data-note-id="${item.id}">図形</button><button type="button" data-quick="status" data-note-id="${item.id}">状態</button><button type="button" data-node-command="duplicate" data-note-id="${item.id}">複製</button><button class="quick-danger" type="button" data-node-command="delete" data-note-id="${item.id}">削除</button></div>
      ${handles}
    </article>`;
  }).join('');
};

function ensureInformationInspector() {
  if (document.getElementById('field-summary')) return;
  const detailStack = document.querySelector('#node-inspector [data-tab-panel="detail"] .form-stack');
  const dueLabel = els['field-due']?.closest('label');
  if (detailStack && dueLabel) {
    const summaryLabel = document.createElement('label');
    summaryLabel.className = 'summary-field';
    summaryLabel.innerHTML = '<span>短い補足</span><textarea id="field-summary" rows="3" maxlength="240" placeholder="付箋を開かなくても把握したい要点"></textarea><small>選択時だけ付箋にも表示します</small>';
    detailStack.insertBefore(summaryLabel, dueLabel);
  }

  const legacyTags = els['field-tags'];
  const tagLabel = legacyTags?.closest('label');
  if (tagLabel) {
    tagLabel.classList.add('structured-tag-field');
    legacyTags.hidden = true;
    tagLabel.insertAdjacentHTML('beforeend', '<div id="tag-chip-editor" class="tag-chip-editor"></div><div class="tag-entry-row"><input id="field-tag-entry" type="text" maxlength="40" placeholder="タグを入力"><button id="add-tag-button" type="button">追加</button></div><small>Enterまたは読点で追加・最大30件</small>');
  }

  const memoPanel = document.querySelector('#node-inspector [data-tab-panel="memo"]');
  if (memoPanel) {
    const overviewLabel = memoPanel.querySelector('.memo-field');
    overviewLabel?.classList.add('memo-overview-field');
    const title = overviewLabel?.querySelector('span');
    if (title) title.textContent = '概要メモ';
    if (els['field-note']) {
      els['field-note'].maxLength = 12000;
      els['field-note'].placeholder = '全体の背景、注意事項、判断理由など。最大12,000文字';
    }
    memoPanel.insertAdjacentHTML('beforeend', '<div class="memo-section-heading"><div><strong>追加メモ</strong><span>論点ごとに分けて残せます</span></div><button id="add-memo-item" type="button">＋ メモ</button></div><div id="memo-items-editor" class="memo-items-editor"></div>');
  }
}

function renderInformationTags(item) {
  const editor = document.getElementById('tag-chip-editor');
  if (!editor) return;
  editor.innerHTML = item.tags.length
    ? item.tags.map((tag, index) => `<span>${esc(tag)}<button type="button" data-remove-tag="${index}" aria-label="${esc(tag)}を削除">×</button></span>`).join('')
    : '<em>タグはまだありません</em>';
  els['field-tags'].value = item.tags.join(', ');
}

function renderInformationMemos(item) {
  const editor = document.getElementById('memo-items-editor');
  if (!editor) return;
  editor.innerHTML = item.memoItems.length
    ? item.memoItems.map((memo, index) => `<article class="memo-item-card" data-memo-index="${index}"><input data-memo-field="title" type="text" maxlength="120" value="${esc(memo.title)}" placeholder="メモの見出し"><textarea data-memo-field="body" rows="5" maxlength="5000" placeholder="内容を入力">${esc(memo.body)}</textarea><footer><span>${memo.updatedAt ? esc(formatDateTime(memo.updatedAt)) : ''}</span><button type="button" data-delete-memo="${index}">削除</button></footer></article>`).join('')
    : '<div class="memo-items-empty">補足を論点ごとに分けたい時は「＋ メモ」から追加します。</div>';
}

const renderNodeInspectorInformationBefore = renderNodeInspector;
renderNodeInspector = function renderInformationInspector(item) {
  ensureInformationInspector();
  renderNodeInspectorInformationBefore(item);
  if (!item) return;
  const summary = document.getElementById('field-summary');
  if (summary) summary.value = item.summary || '';
  renderInformationTags(item);
  renderInformationMemos(item);
};

function addInformationTag() {
  const item = selection.type === 'note' ? getNote(selection.id) : null;
  const input = document.getElementById('field-tag-entry');
  if (!item || !input) return;
  const tag = input.value.replace(/[、,]+$/g, '').trim();
  if (!tag) return;
  if (item.tags.some((value) => value.toLowerCase() === tag.toLowerCase())) {
    input.value = '';
    return toast('同じタグがあります');
  }
  if (item.tags.length >= 30) return toast('タグは30件までです');
  mutate('タグを追加', () => item.tags.push(tag), item.id);
  input.value = '';
  requestAnimationFrame(() => input.focus());
}

const bindInspectorFieldsInformationBefore = bindInspectorFields;
bindInspectorFields = function bindInformationInspectorFields() {
  ensureInformationInspector();
  bindInspectorFieldsInformationBefore();
  document.getElementById('field-summary')?.addEventListener('change', (event) => {
    const item = selection.type === 'note' ? getNote(selection.id) : null;
    if (item && item.summary !== event.target.value) mutate('短い補足を変更', () => { item.summary = event.target.value; }, item.id);
  });
  document.getElementById('field-tag-entry')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === '、') {
      event.preventDefault();
      addInformationTag();
    }
  });
  document.getElementById('add-tag-button')?.addEventListener('click', addInformationTag);
  document.getElementById('tag-chip-editor')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-tag]');
    const item = selection.type === 'note' ? getNote(selection.id) : null;
    if (!button || !item) return;
    const index = Number(button.dataset.removeTag);
    mutate('タグを削除', () => item.tags.splice(index, 1), item.id);
  });
  document.getElementById('add-memo-item')?.addEventListener('click', () => {
    const item = selection.type === 'note' ? getNote(selection.id) : null;
    if (!item) return;
    if (item.memoItems.length >= 30) return toast('追加メモは30件までです');
    mutate('追加メモを作成', () => item.memoItems.push({ id: uid('memo'), title: '', body: '', updatedAt: new Date().toISOString() }), item.id);
    requestAnimationFrame(() => document.querySelector('#memo-items-editor .memo-item-card:last-child input')?.focus());
  });
  document.getElementById('memo-items-editor')?.addEventListener('change', (event) => {
    const card = event.target.closest('[data-memo-index]');
    const item = selection.type === 'note' ? getNote(selection.id) : null;
    const field = event.target.dataset.memoField;
    if (!card || !item || !field) return;
    const memo = item.memoItems[Number(card.dataset.memoIndex)];
    if (!memo || memo[field] === event.target.value) return;
    mutate('追加メモを更新', () => { memo[field] = event.target.value; memo.updatedAt = new Date().toISOString(); }, item.id);
  });
  document.getElementById('memo-items-editor')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-delete-memo]');
    const item = selection.type === 'note' ? getNote(selection.id) : null;
    if (!button || !item) return;
    const index = Number(button.dataset.deleteMemo);
    mutate('追加メモを削除', () => item.memoItems.splice(index, 1), item.id);
  });
};

const duplicateInformationBefore = duplicateSelected;
duplicateSelected = function duplicateInformationNote() {
  const sourceId = selection.type === 'note' ? selection.id : null;
  duplicateInformationBefore();
  const copy = selection.type === 'note' ? getNote(selection.id) : null;
  if (!copy || copy.id === sourceId) return;
  copy.memoItems = (copy.memoItems || []).map((memo) => ({ ...memo, id: uid('memo') }));
  saveState();
  renderAll();
};

addSibling = function addCompactConnectedSibling(noteId, editMode = 'default') {
  const base = getNote(noteId);
  if (!base) return;
  return addNoteMutation(base.x, base.y + 118, { connectFrom: base.id, editMode, label: '次の処理を追加して接続' });
};

addChild = function addCompactChild(noteId, editMode = 'default') {
  const base = getNote(noteId);
  if (!base) return;
  return addNoteMutation(base.x + 250, base.y, { connectFrom: base.id, editMode, label: '子の処理を追加して接続' });
};

const updatePanGuidanceInformationBefore = updatePanGuidance;
updatePanGuidance = function updateInformationGuidance() {
  updatePanGuidanceInformationBefore();
  document.querySelector('.version-badge').textContent = 'v0.13.0';
  const tab = [...els['help-dialog'].querySelectorAll('.shortcut-grid > div')].find((item) => item.querySelector('kbd')?.textContent.trim() === 'Tab');
  if (tab) tab.innerHTML = '<kbd>Tab</kbd><span>下に小さな処理を追加し、矢印で接続</span>';
};
