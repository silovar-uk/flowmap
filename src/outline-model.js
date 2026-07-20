/* Flowmap v0.17.0 — outline-first input and clearer edge terminals */
const OUTLINE_VERSION = '0.17.0';
const OUTLINE_ORDER_STEP = 100;
const OUTLINE_MAX_DEPTH = 6;
const OUTLINE_EDGE_KINDS = ['sequence', 'branch', 'merge', 'reference'];
const OUTLINE_EDGE_META = {
  sequence: { label: '通常', icon: '→' },
  branch: { label: '分岐', icon: '↗' },
  merge: { label: '合流', icon: '⇢' },
  reference: { label: '参照', icon: '⋯' }
};

let outlineEventsBound = false;
let outlineDragNoteId = null;
let outlineFocusAfterRender = null;
let outlineSaveTimer = null;

const closeQuickPopoverBeforeOutlineWorkflow = closeQuickPopover;
closeQuickPopover = function closeQuickPopoverOutlineWorkflow() {
  const pop = els['quick-popover'];
  pop?.classList.remove('outline-relation-popover');
  pop?.style.removeProperty('width');
  return closeQuickPopoverBeforeOutlineWorkflow();
};

function outlinePairKey(from, to) {
  return `${from}→${to}`;
}

function outlineFallbackSort(a, b, nextState) {
  const phases = new Map((nextState.phases || []).map((item, index) => [item.id, index]));
  const groups = new Map((nextState.groups || []).map((item, index) => [item.id, index]));
  return (phases.get(a.phaseId) ?? 999) - (phases.get(b.phaseId) ?? 999) ||
    (groups.get(a.groupId) ?? 999) - (groups.get(b.groupId) ?? 999) ||
    Number(a.y || 0) - Number(b.y || 0) ||
    Number(a.x || 0) - Number(b.x || 0) ||
    String(a.id).localeCompare(String(b.id));
}

function outlineSortedNotes(nextState = state) {
  const notes = [...(nextState?.notes || [])];
  return notes.sort((a, b) => {
    const ao = Number.isFinite(Number(a.order)) ? Number(a.order) : Infinity;
    const bo = Number.isFinite(Number(b.order)) ? Number(b.order) : Infinity;
    return ao - bo || outlineFallbackSort(a, b, nextState);
  });
}

function outlineRefreshParents(nextState = state) {
  const stack = [];
  outlineSortedNotes(nextState).forEach((item) => {
    item.depth = clamp(Number.parseInt(item.depth, 10) || 0, 0, OUTLINE_MAX_DEPTH);
    if (item.depth > stack.length) item.depth = stack.length;
    stack.length = item.depth;
    item.parentId = item.depth > 0 ? stack[item.depth - 1]?.id || '' : '';
    stack[item.depth] = item;
  });
}

function outlineRenumber(nextState = state, orderedIds = null) {
  const noteMap = new Map((nextState.notes || []).map((item) => [item.id, item]));
  const ordered = orderedIds
    ? orderedIds.map((id) => noteMap.get(id)).filter(Boolean)
    : outlineSortedNotes(nextState);
  const included = new Set(ordered.map((item) => item.id));
  outlineSortedNotes(nextState).forEach((item) => { if (!included.has(item.id)) ordered.push(item); });
  ordered.forEach((item, index) => { item.order = (index + 1) * OUTLINE_ORDER_STEP; });
  outlineRefreshParents(nextState);
  return ordered;
}

function outlineSuppressedPairs(nextState = state) {
  if (!nextState.settings) nextState.settings = {};
  if (!Array.isArray(nextState.settings.outlineSuppressedAutoPairs)) nextState.settings.outlineSuppressedAutoPairs = [];
  return nextState.settings.outlineSuppressedAutoPairs;
}

function outlineSuppressPair(from, to, nextState = state) {
  const pairs = outlineSuppressedPairs(nextState);
  const key = outlinePairKey(from, to);
  if (!pairs.includes(key)) pairs.push(key);
}

function outlineUnsuppressPair(from, to, nextState = state) {
  const key = outlinePairKey(from, to);
  nextState.settings.outlineSuppressedAutoPairs = outlineSuppressedPairs(nextState).filter((item) => item !== key);
}

function outlineSequencePairs(nextState = state) {
  const notes = outlineSortedNotes(nextState);
  return notes.slice(1).map((item, index) => ({ from: notes[index].id, to: item.id }));
}

function outlineIsCurrentSequencePair(from, to, nextState = state) {
  return outlineSequencePairs(nextState).some((pair) => pair.from === from && pair.to === to);
}

function outlineSyncAutoEdges(nextState = state) {
  if (!nextState?.notes || !nextState?.edges) return;
  const noteIds = new Set(nextState.notes.map((item) => item.id));
  const suppressed = new Set(outlineSuppressedPairs(nextState));
  const manual = nextState.edges.filter((item) => item.source !== 'auto' && noteIds.has(item.from) && noteIds.has(item.to) && item.from !== item.to);
  const manualPairs = new Set(manual.map((item) => outlinePairKey(item.from, item.to)));
  const existingAuto = new Map(nextState.edges
    .filter((item) => item.source === 'auto')
    .map((item) => [outlinePairKey(item.from, item.to), item]));
  const auto = [];

  outlineSequencePairs(nextState).forEach((pair) => {
    const key = outlinePairKey(pair.from, pair.to);
    if (suppressed.has(key) || manualPairs.has(key)) return;
    const current = existingAuto.get(key) || {
      id: uid('edge'),
      from: pair.from,
      to: pair.to,
      label: '',
      source: 'auto',
      kind: 'sequence',
      routing: 'auto'
    };
    current.from = pair.from;
    current.to = pair.to;
    current.source = 'auto';
    current.kind = OUTLINE_EDGE_KINDS.includes(current.kind) ? current.kind : 'sequence';
    current.routing = current.routing || 'auto';
    auto.push(current);
  });

  nextState.edges = [...manual, ...auto];
}

const normalizeBeforeOutlineWorkflow = normalizeFlowchartState;
normalizeFlowchartState = function normalizeOutlineWorkflowState(next) {
  const normalized = normalizeBeforeOutlineWorkflow(next);
  if (!normalized?.notes || !normalized?.edges) return normalized;
  if (!normalized.settings) normalized.settings = {};
  normalized.settings.outlineSuppressedAutoPairs = Array.isArray(normalized.settings.outlineSuppressedAutoPairs)
    ? normalized.settings.outlineSuppressedAutoPairs.filter((item) => typeof item === 'string')
    : [];

  const fallback = [...normalized.notes].sort((a, b) => outlineFallbackSort(a, b, normalized));
  fallback.forEach((item, index) => {
    item.order = Number.isFinite(Number(item.order)) ? Number(item.order) : (index + 1) * OUTLINE_ORDER_STEP;
    item.depth = clamp(Number.parseInt(item.depth, 10) || 0, 0, OUTLINE_MAX_DEPTH);
    item.parentId = typeof item.parentId === 'string' ? item.parentId : '';
  });
  outlineRenumber(normalized);

  normalized.edges.forEach((item) => {
    item.source = item.source === 'auto' ? 'auto' : 'manual';
    item.kind = OUTLINE_EDGE_KINDS.includes(item.kind) ? item.kind : 'sequence';
    item.routing = item.routing || 'auto';
  });
  outlineSyncAutoEdges(normalized);
  return normalized;
};

const noteBeforeOutlineWorkflow = note;
note = function outlineWorkflowNote(id, title, x, y, phaseId, groupId, extra = {}) {
  const item = noteBeforeOutlineWorkflow(id, title, x, y, phaseId, groupId, extra);
  const maxOrder = typeof state !== 'undefined' && state?.notes?.length
    ? Math.max(0, ...state.notes.map((noteItem) => Number(noteItem.order) || 0))
    : 0;
  item.order = Number.isFinite(Number(extra.order)) ? Number(extra.order) : maxOrder + OUTLINE_ORDER_STEP;
  item.depth = clamp(Number.parseInt(extra.depth, 10) || 0, 0, OUTLINE_MAX_DEPTH);
  item.parentId = typeof extra.parentId === 'string' ? extra.parentId : '';
  return item;
};

const edgeBeforeOutlineWorkflow = edge;
edge = function outlineWorkflowEdge(id, from, to, label = null, options = {}) {
  const item = edgeBeforeOutlineWorkflow(id, from, to, label);
  item.source = options.source === 'auto' ? 'auto' : 'manual';
  item.kind = OUTLINE_EDGE_KINDS.includes(options.kind) ? options.kind : 'sequence';
  item.routing = options.routing || 'auto';
  return item;
};
