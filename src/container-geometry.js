/* Flowmap v0.22.0 — shared phase/group geometry and safe container operations */
const FLOWMAP_CONTAINER_VERSION = '0.22.0';
const CONTAINER_TYPES = {
  phase: {
    label: 'フェーズ',
    minWidth: 360,
    minHeight: 260,
    padding: { top: 76, right: 36, bottom: 36, left: 36 }
  },
  group: {
    label: '囲み',
    minWidth: 230,
    minHeight: 120,
    padding: { top: 62, right: 28, bottom: 28, left: 28 }
  }
};

function containerGet(type, id) {
  if (type === 'phase') return getPhase(id);
  if (type === 'group') return getGroup(id);
  return null;
}

function containerLabel(type) {
  return CONTAINER_TYPES[type]?.label || '枠';
}

function containerDisplayHeight(type, item) {
  if (type === 'group' && item?.collapsed) {
    if (typeof groupWorkflowDisplayBounds === 'function') return groupWorkflowDisplayBounds(item).h;
    return 52;
  }
  return Number(item?.h) || CONTAINER_TYPES[type]?.minHeight || 120;
}

function containerChildren(type, id) {
  if (type === 'phase') {
    return {
      groups: state.groups.filter((item) => item.phaseId === id),
      notes: state.notes.filter((item) => item.phaseId === id)
    };
  }
  if (type === 'group') {
    return { groups: [], notes: state.notes.filter((item) => item.groupId === id) };
  }
  return { groups: [], notes: [] };
}

function containerChildObjects(type, id) {
  const children = containerChildren(type, id);
  const groupObjects = children.groups.map((item) => {
    const bounds = typeof groupWorkflowDisplayBounds === 'function'
      ? groupWorkflowDisplayBounds(item)
      : { x: item.x, y: item.y, w: item.w, h: item.collapsed ? 52 : item.h };
    return { ...bounds, kind: 'group', id: item.id };
  });
  const noteObjects = children.notes.map((item) => {
    const size = noteDisplaySize(item);
    return { x: item.x, y: item.y, w: size.w, h: size.h, kind: 'note', id: item.id };
  });
  return [...groupObjects, ...noteObjects];
}

function containerContentBounds(type, id) {
  const config = CONTAINER_TYPES[type];
  if (!config) return null;
  const objects = containerChildObjects(type, id);
  if (!objects.length) return null;
  return {
    minX: Math.max(0, Math.min(...objects.map((item) => item.x)) - config.padding.left),
    minY: Math.max(0, Math.min(...objects.map((item) => item.y)) - config.padding.top),
    maxX: Math.min(WORLD.width, Math.max(...objects.map((item) => item.x + item.w)) + config.padding.right),
    maxY: Math.min(WORLD.height, Math.max(...objects.map((item) => item.y + item.h)) + config.padding.bottom)
  };
}

function containerClampGeometry(type, id, geometry, { protectContents = true } = {}) {
  const config = CONTAINER_TYPES[type];
  if (!config) return geometry;
  let left = Number(geometry.x) || 0;
  let top = Number(geometry.y) || 0;
  let right = left + Math.max(config.minWidth, Number(geometry.w) || config.minWidth);
  let bottom = top + Math.max(config.minHeight, Number(geometry.h) || config.minHeight);

  if (protectContents) {
    const contents = containerContentBounds(type, id);
    if (contents) {
      left = Math.min(left, contents.minX);
      top = Math.min(top, contents.minY);
      right = Math.max(right, contents.maxX);
      bottom = Math.max(bottom, contents.maxY);
    }
  }

  if (left < 0) { right -= left; left = 0; }
  if (top < 0) { bottom -= top; top = 0; }
  if (right > WORLD.width) {
    const overflow = right - WORLD.width;
    left = Math.max(0, left - overflow);
    right = WORLD.width;
  }
  if (bottom > WORLD.height) {
    const overflow = bottom - WORLD.height;
    top = Math.max(0, top - overflow);
    bottom = WORLD.height;
  }

  if (right - left < config.minWidth) right = Math.min(WORLD.width, left + config.minWidth);
  if (bottom - top < config.minHeight) bottom = Math.min(WORLD.height, top + config.minHeight);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function containerResizeFromCorner(type, id, original, corner, dx, dy) {
  let x = original.x;
  let y = original.y;
  let w = original.w;
  let h = original.h;
  if (corner.includes('e')) w += dx;
  if (corner.includes('s')) h += dy;
  if (corner.includes('w')) { x += dx; w -= dx; }
  if (corner.includes('n')) { y += dy; h -= dy; }
  return containerClampGeometry(type, id, { x, y, w, h }, { protectContents: true });
}

function containerApplyGeometry(type, id, geometry) {
  const item = containerGet(type, id);
  if (!item) return;
  item.x = Math.round(geometry.x);
  item.y = Math.round(geometry.y);
  item.w = Math.round(geometry.w);
  item.h = Math.round(geometry.h);
  if (type === 'group' && item.expandedBounds && !item.collapsed) {
    item.expandedBounds = { x: item.x, y: item.y, w: item.w, h: item.h };
  }
}

function containerMovementObjects(type, id) {
  const item = containerGet(type, id);
  if (!item) return [];
  const own = { x: item.x, y: item.y, w: item.w, h: containerDisplayHeight(type, item) };
  return [own, ...containerChildObjects(type, id)];
}

function containerConstrainMoveDelta(type, id, dx, dy) {
  const objects = containerMovementObjects(type, id);
  if (!objects.length) return { dx: 0, dy: 0 };
  const minX = Math.min(...objects.map((item) => item.x));
  const minY = Math.min(...objects.map((item) => item.y));
  const maxX = Math.max(...objects.map((item) => item.x + item.w));
  const maxY = Math.max(...objects.map((item) => item.y + item.h));
  return {
    dx: clamp(dx, -minX, WORLD.width - maxX),
    dy: clamp(dy, -minY, WORLD.height - maxY)
  };
}

function containerMoveAndChildren(type, id, requestedDx, requestedDy) {
  const delta = containerConstrainMoveDelta(type, id, requestedDx, requestedDy);
  const item = containerGet(type, id);
  if (!item) return delta;
  item.x += delta.dx;
  item.y += delta.dy;
  const children = containerChildren(type, id);
  children.groups.forEach((child) => { child.x += delta.dx; child.y += delta.dy; });
  children.notes.forEach((child) => { child.x += delta.dx; child.y += delta.dy; });
  if (type === 'group' && item.expandedBounds) {
    item.expandedBounds.x += delta.dx;
    item.expandedBounds.y += delta.dy;
  }
  return delta;
}

function containerFitToContents(type, id) {
  const item = containerGet(type, id);
  const bounds = containerContentBounds(type, id);
  if (!item) return false;
  if (!bounds) {
    toast(type === 'phase' ? 'このフェーズには工程がありません' : 'この囲みには工程がありません');
    return false;
  }
  mutate(`${containerLabel(type)}を内容に合わせる`, () => {
    if (type === 'group' && item.collapsed) item.collapsed = false;
    containerApplyGeometry(type, id, {
      x: bounds.minX,
      y: bounds.minY,
      w: bounds.maxX - bounds.minX,
      h: bounds.maxY - bounds.minY
    });
  });
  return true;
}

function containerFocusView(type, id) {
  const item = containerGet(type, id);
  if (!item || !els.stage) return;
  const rect = els.stage.getBoundingClientRect();
  const displayHeight = containerDisplayHeight(type, item);
  const padding = clamp(Math.min(rect.width, rect.height) * 0.1, 70, 120);
  const scale = clamp(Math.min(
    rect.width / Math.max(1, item.w + padding * 2),
    rect.height / Math.max(1, displayHeight + padding * 2)
  ), 0.28, 1.25);
  state.viewport.scale = scale;
  state.viewport.x = (rect.width - item.w * scale) / 2 - item.x * scale;
  state.viewport.y = (rect.height - displayHeight * scale) / 2 - item.y * scale;
  saveState();
  renderAll();
}

function containerReleaseGroup(groupId) {
  const group = getGroup(groupId);
  if (!group) return;
  mutate('囲みだけ解除', () => {
    state.groups = state.groups.filter((item) => item.id !== groupId);
    state.notes.forEach((item) => { if (item.groupId === groupId) item.groupId = ''; });
    selection = { type: null, id: null };
    if (typeof selectedNoteIds !== 'undefined') selectedNoteIds.clear();
  });
  toast('囲みだけ解除しました。中の付箋は残っています');
}

const normalizeBeforeContainerGeometry = normalizeFlowchartState;
normalizeFlowchartState = function normalizeContainerGeometry(next) {
  const normalized = normalizeBeforeContainerGeometry(next);
  if (!normalized) return normalized;
  normalized.settings ||= {};
  normalized.settings.containerGuidesSeen ||= { phase: false, group: false };
  ['phase', 'group'].forEach((type) => {
    const config = CONTAINER_TYPES[type];
    const items = type === 'phase' ? normalized.phases : normalized.groups;
    (items || []).forEach((item) => {
      item.w = Math.max(config.minWidth, Number(item.w) || config.minWidth);
      item.h = Math.max(config.minHeight, Number(item.h) || config.minHeight);
    });
  });
  return normalized;
};
