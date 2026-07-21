/* Flowmap v0.22.0 — final container gesture safeguards */
const containerBeginPhaseMoveBeforeFinalPolish = containerBeginPhaseMove;
containerBeginPhaseMove = function containerBeginPhaseMoveFinalPolish(event, header) {
  const result = containerBeginPhaseMoveBeforeFinalPolish(event, header);
  if (containerGesture?.kind === 'phase-move') {
    containerGesture.groupOrigins.forEach((origin) => {
      const item = getGroup(origin.id);
      origin.expandedBounds = item?.expandedBounds ? clone(item.expandedBounds) : null;
    });
  }
  return result;
};

const containerUpdateGestureBeforeFinalPolish = containerUpdateGesture;
containerUpdateGesture = function containerUpdateGestureFinalPolish(event) {
  const active = containerGesture?.kind === 'phase-move' ? containerGesture : null;
  const result = containerUpdateGestureBeforeFinalPolish(event);
  if (active?.moved) {
    active.groupOrigins.forEach((origin) => {
      if (!origin.expandedBounds) return;
      const item = getGroup(origin.id);
      if (!item) return;
      const dx = item.x - origin.x;
      const dy = item.y - origin.y;
      item.expandedBounds = {
        ...origin.expandedBounds,
        x: origin.expandedBounds.x + dx,
        y: origin.expandedBounds.y + dy
      };
    });
  }
  return result;
};
