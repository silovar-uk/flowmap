/* Flowmap v0.17.2 — prefer straight connectors when the route is naturally clear */
const SMART_EDGE_OBSTACLE_PADDING = 14;
const SMART_EDGE_NEAR_DISTANCE = 440;
const SMART_EDGE_SAME_CONTEXT_DISTANCE = 560;

function smartEdgeRectCenter(rect) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

function smartEdgeBoundaryPoint(item, rect, toward) {
  const center = smartEdgeRectCenter(rect);
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (Math.abs(dx) < .001 && Math.abs(dy) < .001) return center;

  const halfW = Math.max(1, rect.w / 2);
  const halfH = Math.max(1, rect.h / 2);
  let scale;

  if (!rect.collapsed && item?.type === 'decision') {
    const denominator = Math.abs(dx) / halfW + Math.abs(dy) / halfH;
    scale = denominator > 0 ? 1 / denominator : 0;
  } else {
    const scaleX = Math.abs(dx) > .001 ? halfW / Math.abs(dx) : Infinity;
    const scaleY = Math.abs(dy) > .001 ? halfH / Math.abs(dy) : Infinity;
    scale = Math.min(scaleX, scaleY);
  }

  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

function smartEdgeSegmentHitsRect(start, end, rect, padding = SMART_EDGE_OBSTACLE_PADDING) {
  const left = rect.x - padding;
  const right = rect.x + rect.w + padding;
  const top = rect.y - padding;
  const bottom = rect.y + rect.h + padding;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let minimum = 0;
  let maximum = 1;
  const checks = [
    [-dx, start.x - left],
    [dx, right - start.x],
    [-dy, start.y - top],
    [dy, bottom - start.y]
  ];

  for (const [direction, distance] of checks) {
    if (Math.abs(direction) < .001) {
      if (distance < 0) return false;
      continue;
    }
    const ratio = distance / direction;
    if (direction < 0) minimum = Math.max(minimum, ratio);
    else maximum = Math.min(maximum, ratio);
    if (minimum > maximum) return false;
  }
  return maximum >= 0 && minimum <= 1;
}

function smartEdgeObstacleRects(fromId, toId) {
  const seen = new Set();
  const obstacles = [];
  state.notes.forEach((item) => {
    if (item.id === fromId || item.id === toId) return;
    const rect = outlineEndpointRect(item);
    const key = rect.collapsed && rect.groupId ? `group:${rect.groupId}` : `note:${item.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    obstacles.push(rect);
  });
  return obstacles;
}

function smartEdgeDirectRouteIsClear(start, end, fromId, toId) {
  return !smartEdgeObstacleRects(fromId, toId)
    .some((rect) => smartEdgeSegmentHitsRect(start, end, rect));
}

function smartEdgeShouldBeStraight(item, from, to, fromRect, toRect, start, end) {
  if (item.routing === 'orthogonal') return false;
  const clear = smartEdgeDirectRouteIsClear(start, end, from.id, to.id);
  if (!clear) return false;
  if (item.routing === 'straight') return true;

  const fromCenter = smartEdgeRectCenter(fromRect);
  const toCenter = smartEdgeRectCenter(toRect);
  const dx = Math.abs(toCenter.x - fromCenter.x);
  const dy = Math.abs(toCenter.y - fromCenter.y);
  const distance = Math.hypot(dx, dy);
  const alignedHorizontally = dy <= Math.max(24, Math.min(fromRect.h, toRect.h) * .24);
  const alignedVertically = dx <= Math.max(24, Math.min(fromRect.w, toRect.w) * .18);
  const sameContext = (from.groupId || '') === (to.groupId || '') && (from.phaseId || '') === (to.phaseId || '');
  const distanceLimit = sameContext ? SMART_EDGE_SAME_CONTEXT_DISTANCE : SMART_EDGE_NEAR_DISTANCE;

  return alignedHorizontally || alignedVertically || distance <= distanceLimit || item.kind === 'reference';
}

const edgePathBeforeSmartRouting = edgePath;
edgePath = function edgePathSmartRouting(item) {
  const from = getNote(item.from);
  const to = getNote(item.to);
  if (!from || !to) return edgePathBeforeSmartRouting(item);

  const fromRect = outlineEndpointRect(from);
  const toRect = outlineEndpointRect(to);
  if (fromRect.collapsed && toRect.collapsed && fromRect.groupId === toRect.groupId) {
    return edgePathBeforeSmartRouting(item);
  }

  const fromCenter = smartEdgeRectCenter(fromRect);
  const toCenter = smartEdgeRectCenter(toRect);
  const start = smartEdgeBoundaryPoint(from, fromRect, toCenter);
  const end = smartEdgeBoundaryPoint(to, toRect, fromCenter);

  if (!smartEdgeShouldBeStraight(item, from, to, fromRect, toRect, start, end)) {
    return edgePathBeforeSmartRouting(item);
  }

  const points = [start, end];
  return {
    d: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
    points,
    start,
    end,
    startPort: 'direct',
    endPort: 'direct',
    routing: 'straight',
    labelPoint: outlineLongestSegmentPoint(points)
  };
};

const updateFlowExperienceUiBeforeSmartRouting = updateFlowExperienceUi;
updateFlowExperienceUi = function updateFlowExperienceUiSmartRouting() {
  updateFlowExperienceUiBeforeSmartRouting();
  const badge = document.querySelector('.version-badge');
  if (badge) badge.textContent = 'v0.17.2';
};
