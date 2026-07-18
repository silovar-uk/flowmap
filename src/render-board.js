function renderAll() {
  applyLayout();
  renderPhases();
  renderGroups();
  renderEdges();
  renderNotes();
  renderNavigator();
  renderInspector();
  renderMinimap();
  renderPrint();
  updateToolbar();
}

function applyLayout() {
  const { x, y, scale } = state.viewport;
  els.world.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  els['zoom-reset'].textContent = `${Math.round(scale * 100)}%`;
  els.stage.classList.toggle('grid-off', !state.settings.grid);
  els['toggle-grid'].classList.toggle('is-active', state.settings.grid);
  els.workspace.classList.toggle('nav-collapsed', !state.settings.navigatorOpen);
  els.workspace.classList.toggle('inspector-collapsed', !state.settings.inspectorOpen);
  els['open-navigator'].hidden = state.settings.navigatorOpen;
  els['open-inspector'].hidden = state.settings.inspectorOpen;
  els.board.classList.remove('zoom-far', 'zoom-mid', 'zoom-near', 'zoom-detail');
  if (scale < .46) els.board.classList.add('zoom-far');
  else if (scale < .72) els.board.classList.add('zoom-mid');
  else if (scale < 1.12) els.board.classList.add('zoom-near');
  else els.board.classList.add('zoom-detail');
}

function renderPhases() {
  els['phase-layer'].innerHTML = state.phases.map((phase) => `
    <section class="phase-card ${isSelected('phase', phase.id) ? 'is-selected' : ''}" data-phase-id="${phase.id}" style="left:${phase.x}px;top:${phase.y}px;width:${phase.w}px;height:${phase.h}px">
      <div class="phase-title">${esc(phase.title)}</div>
    </section>`).join('');
}

function renderGroups() {
  els['group-layer'].innerHTML = state.groups.map((group) => `
    <section class="group-card ${group.collapsed ? 'is-collapsed' : ''} ${isSelected('group', group.id) ? 'is-selected' : ''}" data-group-id="${group.id}" data-color="${group.color}" style="left:${group.x}px;top:${group.y}px;width:${group.w}px;height:${group.collapsed ? 38 : group.h}px">
      <div class="group-header" data-drag-group="${group.id}"><strong>${esc(group.title)}</strong><button type="button" data-collapse-group="${group.id}" title="${group.collapsed ? '展開' : '折りたたみ'}">${group.collapsed ? '＋' : '−'}</button></div>
    </section>`).join('');
}

function renderEdges() {
  const visibleEdges = state.edges.filter((item) => getNote(item.from) && getNote(item.to));
  els.edges.innerHTML = visibleEdges.map((item) => {
    const path = edgePath(item);
    const selected = isSelected('edge', item.id) ? 'is-selected' : '';
    const from = getNote(item.from);
    const to = getNote(item.to);
    const fromSize = noteDisplaySize(from);
    const toSize = noteDisplaySize(to);
    const handles = selected ? `<circle class="edge-endpoint" data-edge-id="${item.id}" data-edge-end="from" cx="${from.x + fromSize.w}" cy="${from.y + fromSize.h / 2}" r="7"></circle><circle class="edge-endpoint" data-edge-id="${item.id}" data-edge-end="to" cx="${to.x}" cy="${to.y + toSize.h / 2}" r="7"></circle>` : '';
    return `<g data-edge-group="${item.id}"><path class="edge-hit" data-edge-id="${item.id}" d="${path.d}"></path><path class="edge ${selected}" d="${path.d}"></path>${handles}</g>`;
  }).join('');
}

function edgePath(item) {
  const from = getNote(item.from);
  const to = getNote(item.to);
  if (!from || !to) return { d: '', points: [] };
  const fromSize = noteDisplaySize(from);
  const toSize = noteDisplaySize(to);
  const sx = from.x + fromSize.w;
  const sy = from.y + fromSize.h / 2;
  const tx = to.x;
  const ty = to.y + toSize.h / 2;
  const gap = Math.max(48, Math.abs(tx - sx) * .48);
  const c1x = sx + gap;
  const c2x = tx - gap;
  return { d: `M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${ty}, ${tx} ${ty}`, points: [{x:sx,y:sy},{x:c1x,y:sy},{x:c2x,y:ty},{x:tx,y:ty}] };
}

function noteDisplaySize(noteItem) {
  if (state.viewport.scale < .46 && !isSelected('note', noteItem.id)) return { w: 84, h: 54 };
  return { w: noteItem.w || 224, h: noteItem.h || 116 };
}

function renderNotes() {
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
    const searchable = `${item.title} ${item.assignee} ${item.tags.join(' ')} ${item.note}`.toLowerCase();
    const match = search && searchable.includes(search);
    return `<article class="sticky-note ${isSelected('note', item.id) ? 'is-selected' : ''} ${isOverdue ? 'is-overdue' : ''} ${match ? 'is-search-match' : ''}" data-note-id="${item.id}" data-status="${item.status}" style="left:${item.x}px;top:${item.y}px;${hidden ? 'display:none;' : ''}">
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
        <button type="button" data-quick="status" data-note-id="${item.id}">状態</button>
        <button type="button" data-quick="due" data-note-id="${item.id}">${item.due ? '期限変更' : '＋期限'}</button>
        <button type="button" data-quick="assignee" data-note-id="${item.id}">${item.assignee ? '担当変更' : '＋担当'}</button>
        <button type="button" data-quick="tag" data-note-id="${item.id}">＋タグ</button>
        <button type="button" data-quick="memo" data-note-id="${item.id}">メモ</button>
      </div>
      <button class="connector-handle" type="button" data-connect-from="${item.id}" aria-label="${esc(item.title)}から接続"></button>
    </article>`;
  }).join('');
}

function renderNavigator() {
  const selectedClass = (type, id) => isSelected(type, id) ? 'is-selected' : '';
  let html = '';
  state.phases.forEach((phase) => {
    const phaseGroups = state.groups.filter((group) => group.phaseId === phase.id);
    const phaseNotes = state.notes.filter((item) => item.phaseId === phase.id);
    html += `<button class="tree-phase ${selectedClass('phase', phase.id)}" type="button" data-select-type="phase" data-select-id="${phase.id}"><span>┃</span><span>${esc(phase.title)}</span><span class="tree-count">${phaseNotes.length}</span></button>`;
    phaseGroups.forEach((group) => {
      const groupNotes = state.notes.filter((item) => item.groupId === group.id);
      html += `<button class="tree-group ${selectedClass('group', group.id)}" type="button" data-select-type="group" data-select-id="${group.id}"><span>▣</span><span>${esc(group.title)}</span><span class="tree-count">${groupNotes.length}</span></button>`;
      groupNotes.forEach((item) => {
        html += `<button class="tree-node ${selectedClass('note', item.id)}" type="button" data-select-type="note" data-select-id="${item.id}"><span>□</span><span>${esc(item.title)}</span></button>`;
      });
    });
    state.notes.filter((item) => item.phaseId === phase.id && !item.groupId).forEach((item) => {
      html += `<button class="tree-node ${selectedClass('note', item.id)}" type="button" data-select-type="note" data-select-id="${item.id}"><span>□</span><span>${esc(item.title)}</span></button>`;
    });
  });
  els['structure-tree'].innerHTML = html;
}
