/* Flowmap v0.17.0 — final interaction polish */
outlineEnsureMarkers = function outlineEnsureMarkersPolished() {
  const defs = els['edge-layer']?.querySelector('defs');
  if (!defs || defs.querySelector('#outline-arrow-sequence')) return;
  defs.insertAdjacentHTML('beforeend', `
    <marker id="outline-arrow-sequence" markerWidth="13" markerHeight="11" refX="11" refY="5.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1 L11 5.5 L1 10 Z"></path></marker>
    <marker id="outline-arrow-strong" markerWidth="14" markerHeight="12" refX="12" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1 L12 6 L1 11 Z"></path></marker>
    <marker id="outline-arrow-selected" markerWidth="15" markerHeight="13" refX="13" refY="6.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1 L13 6.5 L1 12 Z"></path></marker>
    <marker id="outline-arrow-reference" markerWidth="13" markerHeight="11" refX="11" refY="5.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1 L11 5.5 L1 10" fill="none"></path></marker>`);
};

function outlinePolishDragHandles() {
  $$('.outline-row', els['structure-tree']).forEach((row) => row.removeAttribute('draggable'));
  $$('.outline-drag', els['structure-tree']).forEach((handle) => handle.setAttribute('draggable', 'true'));
}

const renderNavigatorBeforeOutlinePolish = renderNavigator;
renderNavigator = function renderNavigatorOutlinePolish() {
  const result = renderNavigatorBeforeOutlinePolish();
  outlinePolishDragHandles();
  return result;
};

const bindEventsBeforeOutlinePolish = bindEvents;
bindEvents = function bindEventsOutlinePolish() {
  bindEventsBeforeOutlinePolish();
  document.getElementById('outline-add-relation')?.addEventListener('click', (event) => event.stopPropagation());
};
