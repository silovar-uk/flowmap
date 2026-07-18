/* Flowmap v0.8 — conventional flowchart notation */
const FLOWCHART_TYPES = {
  process: { label: '処理', icon: '▭' },
  decision: { label: '判断', icon: '◇' },
  terminal: { label: '開始／終了', icon: '◉' },
  input: { label: '入出力', icon: '▱' },
  document: { label: '書類', icon: '▤' }
};

function normalizeFlowchartState(next) {
  if (!next || !Array.isArray(next.notes)) return next;
  next.notes.forEach((item) => {
    if (!FLOWCHART_TYPES[item.type]) item.type = 'process';
  });
  (next.edges || []).forEach((item) => {
    if (typeof item.label !== 'string') item.label = '';
  });
  return next;
}

const baseNoteFactory = note;
note = function flowchartNote(id, title, x, y, phaseId, groupId, extra = {}) {
  const item = baseNoteFactory(id, title, x, y, phaseId, groupId, extra);
  item.type = FLOWCHART_TYPES[extra.type] ? extra.type : 'process';
  return item;
};

const baseEdgeFactory = edge;
edge = function flowchartEdge(id, from, to, label = null) {
  let resolved = label;
  if (resolved == null) {
    const source = typeof state !== 'undefined' && state?.notes ? getNote(from) : null;
    if (source?.type === 'decision') {
      const used = (state.edges || []).filter((item) => item.from === from).map((item) => item.label);
      resolved = !used.includes('はい') ? 'はい' : !used.includes('いいえ') ? 'いいえ' : '';
    } else resolved = '';
  }
  const item = baseEdgeFactory(id, from, to);
  item.label = resolved || '';
  return item;
};

const baseInitialState = initialState;
initialState = function flowchartInitialState() {
  const next = baseInitialState();
  const byId = Object.fromEntries(next.notes.map((item) => [item.id, item]));
  if (byId.n1) { byId.n1.type = 'terminal'; byId.n1.title = '準備を開始する'; }
  if (byId.n3) byId.n3.type = 'input';
  if (byId.n4) { byId.n4.type = 'decision'; byId.n4.title = '社内申請は承認された？'; }
  if (byId.n5) byId.n5.type = 'document';
  if (byId.n10) { byId.n10.type = 'terminal'; byId.n10.title = '次回へ引き継いで終了'; }
  const approved = next.edges.find((item) => item.from === 'n4' && item.to === 'n5');
  if (approved) approved.label = 'はい';
  if (!next.edges.some((item) => item.from === 'n4' && item.to === 'n3')) next.edges.push({ id:'e_retry', from:'n4', to:'n3', label:'いいえ' });
  return normalizeFlowchartState(next);
};

function nodeTypeLabel(type) {
  return FLOWCHART_TYPES[type]?.label || FLOWCHART_TYPES.process.label;
}

function nodeTypeIcon(type) {
  return FLOWCHART_TYPES[type]?.icon || FLOWCHART_TYPES.process.icon;
}

function portPointByName(item, port) {
  const size = noteDisplaySize(item);
  const cx = item.x + size.w / 2;
  const cy = item.y + size.h / 2;
  if (port === 'left') return { x: item.x, y: cy };
  if (port === 'top') return { x: cx, y: item.y };
  if (port === 'bottom') return { x: cx, y: item.y + size.h };
  return { x: item.x + size.w, y: cy };
}

function naturalPort(item, toward) {
  const size = noteDisplaySize(item);
  const center = { x: item.x + size.w / 2, y: item.y + size.h / 2 };
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

edgePath = function flowchartEdgePath(item) {
  const from = getNote(item.from);
  const to = getNote(item.to);
  if (!from || !to) return { d: '', points: [], start: {x:0,y:0}, end: {x:0,y:0}, labelPoint: {x:0,y:0} };
  const fromSize = noteDisplaySize(from);
  const toSize = noteDisplaySize(to);
  const fromCenter = { x: from.x + fromSize.w / 2, y: from.y + fromSize.h / 2 };
  const toCenter = { x: to.x + toSize.w / 2, y: to.y + toSize.h / 2 };
  const start = portPointByName(from, naturalPort(from, toCenter));
  const end = portPointByName(to, naturalPort(to, fromCenter));
  const horizontalFirst = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  const elbow = horizontalFirst ? { x: end.x, y: start.y } : { x: start.x, y: end.y };
  const d = horizontalFirst
    ? `M ${start.x} ${start.y} H ${end.x} V ${end.y}`
    : `M ${start.x} ${start.y} V ${end.y} H ${end.x}`;
  const firstLength = Math.hypot(elbow.x - start.x, elbow.y - start.y);
  const secondLength = Math.hypot(end.x - elbow.x, end.y - elbow.y);
  const labelPoint = firstLength >= secondLength
    ? { x: (start.x + elbow.x) / 2, y: (start.y + elbow.y) / 2 - 7 }
    : { x: (elbow.x + end.x) / 2 + 7, y: (elbow.y + end.y) / 2 };
  return { d, points: [start, elbow, end], start, end, labelPoint };
};

renderEdges = function renderFlowchartEdges() {
  const visibleEdges = state.edges.filter((item) => getNote(item.from) && getNote(item.to));
  els.edges.innerHTML = visibleEdges.map((item) => {
    const path = edgePath(item);
    const selected = isSelected('edge', item.id) ? 'is-selected' : '';
    const handles = selected
      ? `<circle class="edge-endpoint" data-edge-id="${item.id}" data-edge-end="from" cx="${path.start.x}" cy="${path.start.y}" r="7"></circle><circle class="edge-endpoint" data-edge-id="${item.id}" data-edge-end="to" cx="${path.end.x}" cy="${path.end.y}" r="7"></circle>`
      : '';
    const label = item.label
      ? `<text class="edge-label ${selected}" x="${path.labelPoint.x}" y="${path.labelPoint.y}" text-anchor="middle">${esc(item.label)}</text>`
      : '';
    return `<g data-edge-group="${item.id}"><path class="edge-hit" data-edge-id="${item.id}" d="${path.d}"></path><path class="edge ${selected}" d="${path.d}"></path>${label}${handles}</g>`;
  }).join('');
};

renderNotes = function renderFlowchartNotes() {
  const query = els['search-input'].value.trim().toLowerCase();
  const navQuery = els['navigator-search'].value.trim().toLowerCase();
  const search = query || navQuery;
  els['node-layer'].innerHTML = state.notes.map((item) => {
    const group = getGroup(item.groupId);
    const hidden = group?.collapsed;
    const tags = item.tags.slice(0, 3).map((tag) => `<span class="tag-chip">${esc(tag)}</span>`).join('');
    const checklistDone = item.checklist.filter((check) => check.done).length;
    const progress = item.checklist.length ? Math.round(checklistDone / item.checklist.length * 100) : 0;
    const isOverdue = item.due && item.status !== 'done' && item.due < new Date().toISOString().slice(0,10);
    const searchable = `${item.title} ${item.assignee} ${item.tags.join(' ')} ${item.note} ${nodeTypeLabel(item.type)}`.toLowerCase();
    const match = search && searchable.includes(search);
    const handles = ['top','right','bottom','left'].map((port) => `<button class="connector-handle port-${port}" type="button" data-connect-from="${item.id}" data-connect-port="${port}" aria-label="${esc(item.title)}の${port}側から接続"></button>`).join('');
    return `<article class="sticky-note node-type-${item.type} ${isSelected('note', item.id) ? 'is-selected' : ''} ${isOverdue ? 'is-overdue' : ''} ${match ? 'is-search-match' : ''}" data-note-id="${item.id}" data-node-type="${item.type}" data-status="${item.status}" style="left:${item.x}px;top:${item.y}px;${hidden ? 'display:none;' : ''}">
      <span class="node-type-label">${nodeTypeIcon(item.type)} ${nodeTypeLabel(item.type)}</span>
      <span class="node-updated">${relativeTime(item.updatedAt)}</span>
      <div class="node-title">${esc(item.title)}</div>
      <div class="node-meta">
        <span class="status-chip" data-status="${item.status}">${STATUS[item.status]}</span>
        ${item.due ? `<button class="meta-chip" type="button" data-quick="due" data-note-id="${item.id}">📅 ${esc(item.due.slice(5).replace('-', '/'))}</button>` : ''}
        ${item.assignee ? `<button class="meta-chip" type="button" data-quick="assignee" data-note-id="${item.id}">👤 ${esc(item.assignee)}</button>` : ''}
        ${tags}
      </div>
      ${item.checklist.length ? `<div class="node-progress"><i style="width:${progress}%"></i></div>` : ''}
      <div class="node-quick-actions">
        <button type="button" data-quick="type" data-note-id="${item.id}">図形</button>
        <button type="button" data-quick="status" data-note-id="${item.id}">状態</button>
        <button type="button" data-quick="due" data-note-id="${item.id}">${item.due ? '期限変更' : '＋期限'}</button>
        <button type="button" data-quick="assignee" data-note-id="${item.id}">${item.assignee ? '担当変更' : '＋担当'}</button>
        <button type="button" data-quick="tag" data-note-id="${item.id}">＋タグ</button>
        <button type="button" data-quick="memo" data-note-id="${item.id}">メモ</button>
      </div>
      ${handles}
    </article>`;
  }).join('');
};

renderNavigator = function renderFlowchartNavigator() {
  const selectedClass = (type, id) => isSelected(type, id) ? 'is-selected' : '';
  let html = '';
  state.phases.forEach((phase) => {
    const phaseGroups = state.groups.filter((group) => group.phaseId === phase.id);
    const phaseNotes = state.notes.filter((item) => item.phaseId === phase.id);
    html += `<button class="tree-phase ${selectedClass('phase', phase.id)}" type="button" data-select-type="phase" data-select-id="${phase.id}"><span>┃</span><span>${esc(phase.title)}</span><span class="tree-count">${phaseNotes.length}</span></button>`;
    phaseGroups.forEach((group) => {
      const groupNotes = state.notes.filter((item) => item.groupId === group.id);
      html += `<button class="tree-group ${selectedClass('group', group.id)}" type="button" data-select-type="group" data-select-id="${group.id}"><span>▣</span><span>${esc(group.title)}</span><span class="tree-count">${groupNotes.length}</span></button>`;
      groupNotes.forEach((item) => { html += flowchartTreeNode(item, selectedClass); });
    });
    state.notes.filter((item) => item.phaseId === phase.id && !item.groupId).forEach((item) => { html += flowchartTreeNode(item, selectedClass); });
  });
  els['structure-tree'].innerHTML = html;
};

function flowchartTreeNode(item, selectedClass) {
  return `<button class="tree-node ${selectedClass('note', item.id)}" type="button" data-select-type="note" data-select-id="${item.id}"><span>${nodeTypeIcon(item.type)}</span><span>${esc(item.title)}</span></button>`;
}

addNoteAt = function addFlowchartNodeAt(x, y, options = {}) {
  const point = { x: clamp(x, 0, WORLD.width - 240), y: clamp(y, 0, WORLD.height - 140) };
  const containingGroup = findGroupAt(point.x + 112, point.y + 58);
  const containingPhase = containingGroup ? getPhase(containingGroup.phaseId) : findPhaseAt(point.x, point.y);
  const item = note(uid('note'), options.title || '新しい付箋', point.x, point.y, containingPhase?.id || state.phases[0]?.id || '', containingGroup?.id || '', { now: new Date().toISOString(), type: options.type || 'process' });
  state.notes.push(item);
  if (options.connectFrom) state.edges.push(edge(uid('edge'), options.connectFrom, item.id));
  recordActivity(options.label || `${nodeTypeLabel(item.type)}を追加`, item.id);
  selection = { type: 'note', id: item.id };
  saveState(); renderAll();
  requestAnimationFrame(() => startInlineEdit(item.id, options.editMode || 'default'));
  return item;
};

beginConnection = function beginFlowchartConnection(event, fromId) {
  const from = getNote(fromId); if (!from) return;
  const port = event.target.dataset.connectPort || 'right';
  connect = { fromId, port, start: portPointByName(from, port), shift: event.shiftKey };
  els['connection-preview'].hidden = false;
  updateConnection(event);
  event.preventDefault(); event.stopPropagation();
};

beginReconnect = function beginFlowchartReconnect(event, edgeId, end) {
  const item = getEdge(edgeId); if (!item) return;
  const path = edgePath(item);
  connect = { reconnectEdgeId: edgeId, end, start: end === 'from' ? path.end : path.start, shift:false };
  els['connection-preview'].hidden = false;
  updateConnection(event);
  event.preventDefault(); event.stopPropagation();
};

updateConnection = function updateFlowchartConnection(event) {
  const point = screenToWorld(event.clientX, event.clientY);
  const start = connect.start;
  const horizontalFirst = Math.abs(point.x - start.x) >= Math.abs(point.y - start.y);
  const d = horizontalFirst
    ? `M ${start.x} ${start.y} H ${point.x} V ${point.y}`
    : `M ${start.x} ${start.y} V ${point.y} H ${point.x}`;
  els['connection-preview'].setAttribute('d', d);
};

finishConnection = function finishFlowchartConnection(event) {
  const current = connect; connect = null; els['connection-preview'].hidden = true;
  const targetEl = document.elementFromPoint(event.clientX,event.clientY)?.closest('.sticky-note');
  const targetId = targetEl?.dataset.noteId;
  if (current.reconnectEdgeId) {
    const item = getEdge(current.reconnectEdgeId);
    if (item && targetId) {
      const otherId = current.end === 'from' ? item.to : item.from;
      if (targetId !== otherId) {
        mutate(current.end === 'from' ? '矢印の接続元を変更' : '矢印の接続先を変更', () => { item[current.end] = targetId; });
        return;
      }
    }
    renderAll(); return;
  }
  if (targetId && targetId !== current.fromId) {
    if (state.edges.some((item) => item.from === current.fromId && item.to === targetId)) return renderAll();
    mutate('付箋を接続', () => state.edges.push(edge(uid('edge'), current.fromId, targetId)), current.fromId); return;
  }
  const point = screenToWorld(event.clientX,event.clientY);
  undoStack.push(snapshot()); redoStack.length = 0;
  if (current.shift) {
    const created = [];
    [-150,0,150].forEach((offset,index) => {
      const item = note(uid('note'), `分岐 ${index+1}`, point.x, point.y+offset, '', '', { now:new Date().toISOString(), type:'process' });
      const group = findGroupAt(item.x+112,item.y+58);
      const phase = group ? getPhase(group.phaseId) : findPhaseAt(item.x,item.y);
      item.groupId = group?.id || ''; item.phaseId = phase?.id || state.phases[0]?.id || '';
      state.notes.push(item); state.edges.push(edge(uid('edge'), current.fromId, item.id)); created.push(item);
      recordActivity('分岐付箋を追加', item.id);
    });
    selection = { type:'note', id:created[1].id }; saveState(); renderAll(); requestAnimationFrame(() => startInlineEdit(created[1].id));
  } else addNoteAt(point.x, point.y, { connectFrom:current.fromId, label:'接続先の付箋を追加' });
};

const baseQuickEditor = openQuickEditor;
openQuickEditor = function openFlowchartQuickEditor(noteId, kind, anchor) {
  if (kind !== 'type') return baseQuickEditor(noteId, kind, anchor);
  const item = getNote(noteId); if (!item) return;
  const rect = anchor.getBoundingClientRect();
  select('note', noteId, { openInspector:false });
  const options = Object.entries(FLOWCHART_TYPES).map(([value, meta]) => `<option value="${value}">${meta.icon} ${meta.label}</option>`).join('');
  const pop = els['quick-popover'];
  pop.innerHTML = `<strong>フローチャート図形</strong><select data-quick-input>${options}</select><p class="quick-help">処理は長方形、判断はひし形、開始・終了は端子形で表します。</p><div class="quick-actions"><button type="button" data-quick-cancel>取消</button><button class="primary" type="button" data-quick-save>変更</button></div>`;
  pop.hidden = false; pop.style.left = `${clamp(rect.left,8,window.innerWidth-242)}px`; pop.style.top = `${clamp(rect.bottom+6,8,window.innerHeight-176)}px`;
  const input = $('[data-quick-input]', pop); input.value = item.type || 'process'; requestAnimationFrame(() => input.focus());
  $('[data-quick-cancel]',pop).onclick = closeQuickPopover;
  $('[data-quick-save]',pop).onclick = () => { mutate('図形を変更', () => { item.type = input.value; }, item.id); closeQuickPopover(); };
};

function ensureNodeTypeField() {
  let select = document.getElementById('field-node-type');
  if (select) return select;
  const stack = $('#node-inspector .form-stack');
  if (!stack) return null;
  const label = document.createElement('label');
  label.innerHTML = `<span>フローチャート図形</span><select id="field-node-type">${Object.entries(FLOWCHART_TYPES).map(([value,meta]) => `<option value="${value}">${meta.icon} ${meta.label}</option>`).join('')}</select>`;
  stack.prepend(label);
  select = label.querySelector('select');
  select.addEventListener('change', () => {
    const item = selection.type === 'note' ? getNote(selection.id) : null;
    if (item) mutate('図形を変更', () => { item.type = select.value; }, item.id);
  });
  return select;
}

const baseRenderNodeInspector = renderNodeInspector;
renderNodeInspector = function renderFlowchartNodeInspector(item) {
  baseRenderNodeInspector(item);
  if (!item) return;
  const select = ensureNodeTypeField();
  if (select) select.value = item.type || 'process';
  els['inspector-heading'].textContent = `${nodeTypeLabel(item.type)}の補足`;
};

function ensureEdgeLabelField() {
  let input = document.getElementById('edge-label-field');
  if (input) return input;
  const inspector = els['edge-inspector'];
  const relation = $('.relation-card', inspector);
  if (!inspector || !relation) return null;
  const label = document.createElement('label');
  label.className = 'edge-label-field';
  label.innerHTML = '<span>分岐ラベル</span><input id="edge-label-field" type="text" maxlength="40" placeholder="例：はい／いいえ">';
  relation.after(label);
  input = label.querySelector('input');
  input.addEventListener('change', () => {
    const item = selection.type === 'edge' ? getEdge(selection.id) : null;
    if (item) mutate('矢印ラベルを変更', () => { item.label = input.value.trim(); });
  });
  return input;
}

const baseRenderEdgeInspector = renderEdgeInspector;
renderEdgeInspector = function renderFlowchartEdgeInspector(item) {
  baseRenderEdgeInspector(item);
  if (!item) return;
  const input = ensureEdgeLabelField();
  if (input) input.value = item.label || '';
  const from = getNote(item.from);
  if (from?.type === 'decision') els['inspector-heading'].textContent = '判断の分岐';
};

function openShapePalette(anchor) {
  const rect = anchor.getBoundingClientRect();
  const pop = els['quick-popover'];
  pop.innerHTML = `<strong>図形を追加</strong><div class="shape-palette">${Object.entries(FLOWCHART_TYPES).map(([type,meta]) => `<button type="button" data-add-shape="${type}"><b>${meta.icon}</b><span>${meta.label}</span></button>`).join('')}</div>`;
  pop.hidden = false; pop.style.left = `${clamp(rect.left,8,window.innerWidth-250)}px`; pop.style.top = `${clamp(rect.bottom+6,8,window.innerHeight-250)}px`;
  $$('[data-add-shape]', pop).forEach((button) => button.addEventListener('click', () => {
    const stageRect = els.stage.getBoundingClientRect();
    const point = screenToWorld(stageRect.left + stageRect.width/2, stageRect.top + stageRect.height/2);
    addNoteMutation(point.x-112, point.y-58, { type:button.dataset.addShape, title:`新しい${nodeTypeLabel(button.dataset.addShape)}` });
    closeQuickPopover();
  }));
}

function installFlowchartUi() {
  if (!document.getElementById('add-flowchart-shape')) {
    const button = document.createElement('button');
    button.id = 'add-flowchart-shape'; button.className = 'button'; button.type = 'button';
    button.innerHTML = '<span>◇</span>図形';
    button.addEventListener('click', (event) => { event.stopPropagation(); openShapePalette(button); });
    els['add-note'].after(button);
  }
}
