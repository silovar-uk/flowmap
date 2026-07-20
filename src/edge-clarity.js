/* Flowmap v0.17.0 — clearer edge routing and terminals */
function outlineEnsureMarkers() {
  const defs = els['edge-layer']?.querySelector('defs');
  if (!defs || defs.querySelector('#outline-arrow-sequence')) return;
  defs.insertAdjacentHTML('beforeend', `
    <marker id="outline-arrow-sequence" markerWidth="13" markerHeight="11" refX="11" refY="5.5" orient="auto" markerUnits="strokeWidth"><path d="M1 1 L11 5.5 L1 10 Z"></path></marker>
    <marker id="outline-arrow-strong" markerWidth="14" markerHeight="12" refX="12" refY="6" orient="auto" markerUnits="strokeWidth"><path d="M1 1 L12 6 L1 11 Z"></path></marker>
    <marker id="outline-arrow-selected" markerWidth="15" markerHeight="13" refX="13" refY="6.5" orient="auto" markerUnits="strokeWidth"><path d="M1 1 L13 6.5 L1 12 Z"></path></marker>
    <marker id="outline-arrow-reference" markerWidth="13" markerHeight="11" refX="11" refY="5.5" orient="auto" markerUnits="strokeWidth"><path d="M1 1 L11 5.5 L1 10" fill="none"></path></marker>`);
}

function outlineEndpointRect(item) {
  if (typeof endpointRectForGroupWorkflow === 'function') return endpointRectForGroupWorkflow(item);
  const size = noteDisplaySize(item);
  return { x: item.x, y: item.y, w: size.w, h: size.h, collapsed: false, groupId: null };
}

function outlinePortGeometry(rect, toward) {
  const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { name: 'right', point: { x: rect.x + rect.w, y: center.y }, vector: { x: 1, y: 0 } }
      : { name: 'left', point: { x: rect.x, y: center.y }, vector: { x: -1, y: 0 } };
  }
  return dy >= 0
    ? { name: 'bottom', point: { x: center.x, y: rect.y + rect.h }, vector: { x: 0, y: 1 } }
    : { name: 'top', point: { x: center.x, y: rect.y }, vector: { x: 0, y: -1 } };
}

function outlineDeduplicatePoints(points) {
  return points.filter((point, index) => {
    if (!index) return true;
    const before = points[index - 1];
    return Math.abs(point.x - before.x) > .01 || Math.abs(point.y - before.y) > .01;
  });
}

function outlineRoundedPath(points, radius = 10) {
  const clean = outlineDeduplicatePoints(points);
  if (!clean.length) return '';
  if (clean.length === 1) return `M ${clean[0].x} ${clean[0].y}`;
  let d = `M ${clean[0].x} ${clean[0].y}`;
  for (let index = 1; index < clean.length - 1; index += 1) {
    const previous = clean[index - 1];
    const current = clean[index];
    const next = clean[index + 1];
    const incoming = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outgoing = Math.hypot(next.x - current.x, next.y - current.y);
    const r = Math.min(radius, incoming / 2, outgoing / 2);
    if (r < .5) {
      d += ` L ${current.x} ${current.y}`;
      continue;
    }
    const before = {
      x: current.x + (previous.x - current.x) * (r / incoming),
      y: current.y + (previous.y - current.y) * (r / incoming)
    };
    const after = {
      x: current.x + (next.x - current.x) * (r / outgoing),
      y: current.y + (next.y - current.y) * (r / outgoing)
    };
    d += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`;
  }
  const end = clean.at(-1);
  d += ` L ${end.x} ${end.y}`;
  return d;
}

function outlineLongestSegmentPoint(points) {
  let best = null;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (!best || length > best.length) best = { a, b, length };
  }
  if (!best) return { x: 0, y: 0 };
  const horizontal = Math.abs(best.b.x - best.a.x) >= Math.abs(best.b.y - best.a.y);
  return {
    x: (best.a.x + best.b.x) / 2 + (horizontal ? 0 : 8),
    y: (best.a.y + best.b.y) / 2 + (horizontal ? -8 : 0)
  };
}

edgePath = function outlineWorkflowEdgePath(item) {
  const from = getNote(item.from);
  const to = getNote(item.to);
  if (!from || !to) return { d: '', points: [], start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, labelPoint: { x: 0, y: 0 } };
  const fromRect = outlineEndpointRect(from);
  const toRect = outlineEndpointRect(to);
  if (fromRect.collapsed && toRect.collapsed && fromRect.groupId === toRect.groupId) {
    return { d: '', points: [], start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, labelPoint: { x: 0, y: 0 } };
  }

  const fromCenter = { x: fromRect.x + fromRect.w / 2, y: fromRect.y + fromRect.h / 2 };
  const toCenter = { x: toRect.x + toRect.w / 2, y: toRect.y + toRect.h / 2 };
  const startPort = outlinePortGeometry(fromRect, toCenter);
  const endPort = outlinePortGeometry(toRect, fromCenter);
  const start = startPort.point;
  const end = endPort.point;
  const startStub = { x: start.x + startPort.vector.x * 24, y: start.y + startPort.vector.y * 24 };
  const endStub = { x: end.x + endPort.vector.x * 28, y: end.y + endPort.vector.y * 28 };
  let points;

  const horizontalRoute = startPort.vector.x !== 0 || endPort.vector.x !== 0;
  if (horizontalRoute) {
    const middleX = (startStub.x + endStub.x) / 2;
    points = [start, startStub, { x: middleX, y: startStub.y }, { x: middleX, y: endStub.y }, endStub, end];
  } else {
    const middleY = (startStub.y + endStub.y) / 2;
    points = [start, startStub, { x: startStub.x, y: middleY }, { x: endStub.x, y: middleY }, endStub, end];
  }
  points = outlineDeduplicatePoints(points);
  return {
    d: outlineRoundedPath(points, 10),
    points,
    start,
    end,
    startPort: startPort.name,
    endPort: endPort.name,
    labelPoint: outlineLongestSegmentPoint(points)
  };
};

function outlineEdgeMarker(item, selected) {
  if (selected) return 'url(#outline-arrow-selected)';
  if (item.kind === 'reference') return 'url(#outline-arrow-reference)';
  if (item.kind === 'branch' || item.kind === 'merge') return 'url(#outline-arrow-strong)';
  return 'url(#outline-arrow-sequence)';
}

renderEdges = function renderOutlineWorkflowEdges() {
  outlineEnsureMarkers();
  const visibleEdges = state.edges.filter((item) => getNote(item.from) && getNote(item.to));
  els.edges.innerHTML = visibleEdges.map((item) => {
    const from = getNote(item.from);
    const to = getNote(item.to);
    const fromGroup = from?.groupId ? getGroup(from.groupId) : null;
    const toGroup = to?.groupId ? getGroup(to.groupId) : null;
    const hiddenInside = Boolean(fromGroup?.collapsed && toGroup?.collapsed && fromGroup.id === toGroup.id);
    if (hiddenInside) return '';
    const path = edgePath(item);
    if (!path.d) return '';
    const selected = isSelected('edge', item.id);
    const collapsedClass = fromGroup?.collapsed || toGroup?.collapsed ? 'is-collapsed-group-edge' : '';
    const label = item.label
      ? `<text class="edge-label ${selected ? 'is-selected' : ''}" x="${path.labelPoint.x}" y="${path.labelPoint.y}" text-anchor="middle">${esc(item.label)}</text>`
      : '';
    const handles = selected
      ? `<circle class="edge-endpoint" data-edge-id="${item.id}" data-edge-end="from" cx="${path.start.x}" cy="${path.start.y}" r="7"></circle><circle class="edge-endpoint" data-edge-id="${item.id}" data-edge-end="to" cx="${path.end.x}" cy="${path.end.y}" r="7"></circle>`
      : '';
    const roles = selected && typeof edgeRoleBadge === 'function'
      ? `${edgeRoleBadge(path.start, '元', 'is-from')}${edgeRoleBadge(path.end, '先', 'is-to')}`
      : '';
    return `<g class="edge-group edge-kind-${item.kind} edge-source-${item.source} ${selected ? 'is-selected' : ''} ${collapsedClass}" data-edge-group="${item.id}">
      <title>${esc(from.title)} → ${esc(to.title)}</title>
      <path class="edge-hit" data-edge-id="${item.id}" d="${path.d}"></path>
      <path class="edge-underlay" d="${path.d}"></path>
      <circle class="edge-target-halo" cx="${path.end.x}" cy="${path.end.y}" r="4.4"></circle>
      <path class="edge ${selected ? 'is-selected' : ''}" data-edge-id="${item.id}" d="${path.d}" marker-end="${outlineEdgeMarker(item, selected)}"></path>
      ${label}${roles}${handles}
    </g>`;
  }).join('');
};

const deleteSelectionBeforeOutlineWorkflow = deleteSelection;
deleteSelection = function deleteSelectionOutlineWorkflow() {
  if (selection.type !== 'edge') return deleteSelectionBeforeOutlineWorkflow();
  const item = getEdge(selection.id);
  if (!item) return;
  const shouldSuppress = item.source === 'auto' || outlineIsCurrentSequencePair(item.from, item.to);
  mutate('矢印を削除', () => {
    if (shouldSuppress) outlineSuppressPair(item.from, item.to);
    state.edges = state.edges.filter((edgeItem) => edgeItem.id !== item.id);
    outlineSyncAutoEdges();
    selection = { type: null, id: null };
  });
};

function outlineEnsureEdgeInspector() {
  const inspector = els['edge-inspector'];
  if (!inspector || document.getElementById('edge-kind-field')) return;
  const relation = inspector.querySelector('.relation-card');
  if (!relation) return;
  const panel = document.createElement('div');
  panel.className = 'outline-edge-fields';
  panel.innerHTML = `<label><span>関係の種類</span><select id="edge-kind-field">${OUTLINE_EDGE_KINDS.map((kind) => `<option value="${kind}">${OUTLINE_EDGE_META[kind].label}</option>`).join('')}</select></label><div class="outline-edge-source"><span>生成元</span><strong id="edge-source-label">手動</strong></div><button id="edge-return-auto" class="outline-button" type="button">アウトライン順へ戻す</button>`;
  relation.after(panel);
  panel.querySelector('#edge-kind-field').addEventListener('change', (event) => {
    const item = selection.type === 'edge' ? getEdge(selection.id) : null;
    if (!item) return;
    mutate('矢印の種類を変更', () => {
      item.kind = event.target.value;
      item.source = 'manual';
      outlineUnsuppressPair(item.from, item.to);
      outlineSyncAutoEdges();
    });
  });
  panel.querySelector('#edge-return-auto').addEventListener('click', () => {
    const item = selection.type === 'edge' ? getEdge(selection.id) : null;
    if (!item) return;
    if (!outlineIsCurrentSequencePair(item.from, item.to)) return toast('現在のアウトライン順に含まれない接続です');
    mutate('矢印をアウトライン順へ戻す', () => {
      outlineUnsuppressPair(item.from, item.to);
      state.edges = state.edges.filter((edgeItem) => edgeItem.id !== item.id);
      outlineSyncAutoEdges();
      selection = { type: 'edge', id: state.edges.find((edgeItem) => edgeItem.from === item.from && edgeItem.to === item.to)?.id || null };
    });
  });
}

const renderEdgeInspectorBeforeOutlineWorkflow = renderEdgeInspector;
renderEdgeInspector = function renderEdgeInspectorOutlineWorkflow(item) {
  outlineEnsureEdgeInspector();
  renderEdgeInspectorBeforeOutlineWorkflow(item);
  if (!item) return;
  const kind = document.getElementById('edge-kind-field');
  const source = document.getElementById('edge-source-label');
  const autoButton = document.getElementById('edge-return-auto');
  if (kind) kind.value = OUTLINE_EDGE_KINDS.includes(item.kind) ? item.kind : 'sequence';
  if (source) source.textContent = item.source === 'auto' ? 'アウトライン' : '手動';
  if (autoButton) autoButton.hidden = item.source === 'auto' || !outlineIsCurrentSequencePair(item.from, item.to);
};
