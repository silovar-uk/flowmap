/* Flowmap v0.28.2 — stabilize reading-view layout transitions */
'use strict';

let readingViewTransitionSerialV0282 = 0;

function readingViewBoardAnchorV0282() {
  const board = els?.board || document.getElementById('board');
  const viewport = state?.viewport;
  if (!board || !viewport) return null;

  const rect = board.getBoundingClientRect();
  const scale = Number(viewport.scale);
  if (!Number.isFinite(scale) || scale <= 0 || rect.width <= 0 || rect.height <= 0) return null;

  return {
    worldX: (rect.width / 2 - Number(viewport.x || 0)) / scale,
    worldY: (rect.height / 2 - Number(viewport.y || 0)) / scale,
    scale
  };
}

function restoreReadingViewAnchorV0282(anchor) {
  if (!anchor || !state?.viewport) return;
  const board = els?.board || document.getElementById('board');
  if (!board) return;

  const rect = board.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  state.viewport = {
    ...state.viewport,
    x: rect.width / 2 - anchor.worldX * anchor.scale,
    y: rect.height / 2 - anchor.worldY * anchor.scale,
    scale: anchor.scale
  };
}

function settleReadingViewLayoutV0282(anchor, serial) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (serial !== readingViewTransitionSerialV0282) return;
      restoreReadingViewAnchorV0282(anchor);
      if (typeof applyLayout === 'function') applyLayout();
      if (typeof syncCleanViewUiV0281 === 'function') syncCleanViewUiV0281();
    });
  });
}

const setCleanViewBeforeV0282 = setCleanViewV28;
setCleanViewV28 = function setCleanViewV0282(enabled) {
  const next = Boolean(enabled);
  const current = typeof isCleanViewV28 === 'function' && isCleanViewV28();

  if (next === current) {
    if (typeof syncCleanViewUiV0281 === 'function') syncCleanViewUiV0281();
    return true;
  }

  const anchor = readingViewBoardAnchorV0282();
  const result = setCleanViewBeforeV0282(next);
  if (result === false) return false;

  const serial = ++readingViewTransitionSerialV0282;
  settleReadingViewLayoutV0282(anchor, serial);
  return true;
};
