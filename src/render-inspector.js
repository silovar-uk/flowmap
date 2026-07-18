function renderInspector() {
  [els['inspector-empty'], els['node-inspector'], els['edge-inspector'], els['group-inspector'], els['phase-inspector']].forEach((item) => item.hidden = true);
  if (!selection.type || !selection.id) {
    els['inspector-empty'].hidden = false;
    els['inspector-heading'].textContent = '付箋の補足';
    return;
  }
  if (selection.type === 'note') renderNodeInspector(getNote(selection.id));
  if (selection.type === 'edge') renderEdgeInspector(getEdge(selection.id));
  if (selection.type === 'group') renderGroupInspector(getGroup(selection.id));
  if (selection.type === 'phase') renderPhaseInspector(getPhase(selection.id));
}

function renderNodeInspector(item) {
  if (!item) return clearSelection();
  els['node-inspector'].hidden = false;
  els['inspector-heading'].textContent = '付箋の補足';
  els['field-title'].value = item.title;
  els['field-status'].value = item.status;
  els['field-due'].value = item.due || '';
  els['field-assignee'].value = item.assignee || '';
  els['field-tags'].value = item.tags.join(', ');
  els['field-location'].value = item.location || '';
  els['field-link'].value = item.link || '';
  els['field-note'].value = item.note || '';
  fillSelect(els['field-phase'], state.phases, item.phaseId, 'フェーズなし');
  const groups = state.groups.filter((group) => !item.phaseId || group.phaseId === item.phaseId);
  fillSelect(els['field-group'], groups, item.groupId, '囲みなし');
  els.tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tab === activeTab));
  els.tabPanels.forEach((panel) => panel.classList.toggle('is-active', panel.dataset.tabPanel === activeTab));
  renderChecklist(item);
  renderHistory(item.id);
}

function renderChecklist(item) {
  const done = item.checklist.filter((check) => check.done).length;
  const total = item.checklist.length;
  els['checklist-count'].textContent = `${done} / ${total} 完了`;
  els['checklist-bar'].style.width = `${total ? done / total * 100 : 0}%`;
  els['checklist-editor'].innerHTML = item.checklist.map((check) => `
    <div class="checklist-row" data-check-id="${check.id}">
      <input type="checkbox" ${check.done ? 'checked' : ''} aria-label="完了" />
      <input type="text" value="${esc(check.text)}" maxlength="180" />
      <button type="button" title="削除">×</button>
    </div>`).join('');
}

function renderHistory(noteId) {
  const history = state.activity.filter((item) => item.noteId === noteId).slice(0, 40);
  els['node-history'].innerHTML = history.length ? history.map((item) => `<div class="history-item"><strong>${esc(item.label)}</strong><time>${formatDateTime(item.at)}</time></div>`).join('') : '<p class="empty-copy">まだ履歴はありません。</p>';
}

function renderEdgeInspector(item) {
  if (!item) return clearSelection();
  els['edge-inspector'].hidden = false;
  els['inspector-heading'].textContent = '矢印の前後関係';
  const from = getNote(item.from);
  const to = getNote(item.to);
  els['edge-summary'].textContent = `${from?.title || '不明'} → ${to?.title || '不明'}`;
  fillSelect(els['edge-from'], state.notes, item.from, null);
  fillSelect(els['edge-to'], state.notes, item.to, null);
}

function renderGroupInspector(item) {
  if (!item) return clearSelection();
  els['group-inspector'].hidden = false;
  els['inspector-heading'].textContent = '囲みの補足';
  els['group-title-field'].value = item.title;
  els['group-color-field'].value = item.color;
  fillSelect(els['group-phase-field'], state.phases, item.phaseId, 'フェーズなし');
  els['toggle-group-collapse'].textContent = item.collapsed ? '展開する' : '折りたたむ';
}

function renderPhaseInspector(item) {
  if (!item) return clearSelection();
  els['phase-inspector'].hidden = false;
  els['inspector-heading'].textContent = 'フェーズの補足';
  els['phase-title-field'].value = item.title;
}

function fillSelect(select, items, selectedId, emptyLabel) {
  const empty = emptyLabel !== null ? `<option value="">${esc(emptyLabel)}</option>` : '';
  select.innerHTML = empty + items.map((item) => `<option value="${item.id}" ${item.id === selectedId ? 'selected' : ''}>${esc(item.title)}</option>`).join('');
}

function renderMinimap() {
  const scaleX = 176 / WORLD.width;
  const scaleY = 116 / WORLD.height;
  const shapes = state.groups.map((group) => `<rect x="${group.x * scaleX}" y="${group.y * scaleY}" width="${group.w * scaleX}" height="${group.h * scaleY}" rx="2" fill="rgba(112,126,117,.08)" stroke="rgba(112,126,117,.35)" />`).join('') +
    state.notes.map((item) => `<rect x="${item.x * scaleX}" y="${item.y * scaleY}" width="${Math.max(3, noteDisplaySize(item).w * scaleX)}" height="${Math.max(2, noteDisplaySize(item).h * scaleY)}" rx="1" fill="${item.status === 'done' ? '#9aba96' : item.status === 'doing' ? '#9eb5dc' : item.status === 'waiting' ? '#d8b68e' : '#d7c66f'}" />`).join('');
  els['minimap-svg'].innerHTML = shapes;
  const rect = els.stage.getBoundingClientRect();
  const { x, y, scale } = state.viewport;
  const worldLeft = -x / scale;
  const worldTop = -y / scale;
  const worldW = rect.width / scale;
  const worldH = rect.height / scale;
  Object.assign(els['minimap-viewport'].style, {
    left: `${clamp(worldLeft * scaleX, 0, 176)}px`, top: `${clamp(worldTop * scaleY, 0, 116)}px`,
    width: `${clamp(worldW * scaleX, 4, 176)}px`, height: `${clamp(worldH * scaleY, 4, 116)}px`
  });
}

function renderPrint() {
  const grouped = state.phases.map((phase) => {
    const notes = state.notes.filter((item) => item.phaseId === phase.id);
    return `<h2>${esc(phase.title)}</h2><ul class="print-list">${notes.map((item) => `<li><strong>${esc(item.title)}</strong>　${esc(STATUS[item.status])}${item.due ? `　期限 ${esc(item.due)}` : ''}${item.assignee ? `　担当 ${esc(item.assignee)}` : ''}</li>`).join('')}</ul>`;
  }).join('');
  els['print-sheet'].innerHTML = `<h1>業務フローマップ</h1><p class="print-meta">出力日時：${esc(new Intl.DateTimeFormat('ja-JP', { dateStyle:'long', timeStyle:'short' }).format(new Date()))}　／　付箋数：${state.notes.length}</p>${grouped}`;
}

function updateToolbar() {
  els.undo.disabled = !undoStack.length;
  els.redo.disabled = !redoStack.length;
}

function isSelected(type, id) { return selection.type === type && selection.id === id; }

function select(type, id, options = {}) {
  selection = { type, id };
  if (type && id && options.openInspector !== false) state.settings.inspectorOpen = true;
  closeQuickPopover();
  renderAll();
}

function clearSelection() {
  selection = { type: null, id: null };
  renderAll();
}
