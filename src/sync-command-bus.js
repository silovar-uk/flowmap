/* Flowmap v0.20.0 — explicit bidirectional sync, readable change sets and cross-view undo */
const FLOWMAP_SYNC_VERSION = '0.20.0';
const FLOWMAP_SYNC_HISTORY_LIMIT = 40;
let syncUiState = { bound: false, lastChange: null, noticeTimer: null, historyOpen: false };

function syncSafeKey(value, fallback = 'item') {
  const key = String(value || '').trim().toLowerCase()
    .normalize('NFKC')
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return key || fallback;
}

function syncEnsureNotationKeys(nextState = state) {
  if (!nextState) return;
  const used = new Set();
  const assign = (items, prefix) => {
    (items || []).forEach((item, index) => {
      const base = syncSafeKey(item.notationKey || item.id || `${prefix}-${index + 1}`, `${prefix}-${index + 1}`);
      let key = base;
      let suffix = 2;
      while (used.has(key)) key = `${base}-${suffix++}`;
      used.add(key);
      item.notationKey = key;
    });
  };
  assign(nextState.phases, 'phase');
  assign(nextState.groups, 'group');
  assign(nextState.notes, 'note');
  nextState.settings ||= {};
  if (!Array.isArray(nextState.settings.syncHistory)) nextState.settings.syncHistory = [];
}

const normalizeBeforeSyncCommandBus = normalizeFlowchartState;
normalizeFlowchartState = function normalizeSyncCommandBusState(next) {
  const normalized = normalizeBeforeSyncCommandBus(next);
  if (!normalized) return normalized;
  syncEnsureNotationKeys(normalized);
  normalized.settings.syncHistory = normalized.settings.syncHistory
    .filter((item) => item && typeof item === 'object' && typeof item.label === 'string')
    .slice(0, FLOWMAP_SYNC_HISTORY_LIMIT);
  return normalized;
};

function syncOriginLabel(origin) {
  return ({ diagram: '図', outline: 'アウトライン', flowmark: '記法', inspector: '補足', system: '自動処理' })[origin] || '操作';
}

function syncChangeSet(label, origin, changes = [], affectedIds = []) {
  return {
    id: uid('sync'),
    at: new Date().toISOString(),
    label,
    origin,
    changes: changes.filter(Boolean),
    affectedIds: [...new Set(affectedIds.filter(Boolean))]
  };
}

function syncAppendChangeSet(changeSet, { announce = true } = {}) {
  if (!changeSet || !state) return null;
  state.settings ||= {};
  state.settings.syncHistory = [changeSet, ...(state.settings.syncHistory || []).filter((item) => item.id !== changeSet.id)]
    .slice(0, FLOWMAP_SYNC_HISTORY_LIMIT);
  syncUiState.lastChange = changeSet;
  if (announce) syncAnnounceChange(changeSet);
  return changeSet;
}

function syncHumanContainer(phaseId, groupId) {
  const group = groupId ? getGroup(groupId) : null;
  const phase = phaseId ? getPhase(phaseId) : null;
  return group?.title || phase?.title || '未分類';
}

function syncNoteState(item) {
  return item ? {
    id: item.id,
    title: item.title,
    phaseId: item.phaseId || '',
    groupId: item.groupId || '',
    order: Number(item.order) || 0,
    depth: Number(item.depth) || 0,
    parentId: item.parentId || ''
  } : null;
}

function syncDiffNoteStructure(before, after) {
  if (!before || !after) return [];
  return ['phaseId', 'groupId', 'order', 'depth', 'parentId']
    .filter((field) => before[field] !== after[field])
    .map((field) => ({ entity: 'note', id: after.id, field, before: before[field], after: after[field] }));
}

function syncSubtreeBlock(ordered, noteId) {
  const start = ordered.findIndex((item) => item.id === noteId);
  if (start < 0) return [];
  const root = ordered[start];
  const context = `${root.phaseId || ''}|${root.groupId || ''}`;
  const block = [root];
  for (let index = start + 1; index < ordered.length; index += 1) {
    const item = ordered[index];
    if (`${item.phaseId || ''}|${item.groupId || ''}` !== context || Number(item.depth || 0) <= Number(root.depth || 0)) break;
    block.push(item);
  }
  return block;
}

function syncTargetSubtreeEnd(ordered, targetId) {
  const index = ordered.findIndex((item) => item.id === targetId);
  if (index < 0) return index;
  const target = ordered[index];
  const context = `${target.phaseId || ''}|${target.groupId || ''}`;
  let end = index + 1;
  while (end < ordered.length) {
    const item = ordered[end];
    if (`${item.phaseId || ''}|${item.groupId || ''}` !== context || Number(item.depth || 0) <= Number(target.depth || 0)) break;
    end += 1;
  }
  return end;
}

function syncMoveSubtree(noteId, targetId, placement) {
  const ordered = outlineSortedNotes();
  const source = getNote(noteId);
  const target = getNote(targetId);
  if (!source || !target || source.id === target.id) return null;
  const block = syncSubtreeBlock(ordered, source.id);
  const blockIds = new Set(block.map((item) => item.id));
  if (!block.length || blockIds.has(target.id)) return null;

  const beforeStates = new Map(block.map((item) => [item.id, syncNoteState(item)]));
  const remaining = ordered.filter((item) => !blockIds.has(item.id));
  const targetIndex = remaining.findIndex((item) => item.id === target.id);
  if (targetIndex < 0) return null;

  let insertAt = targetIndex;
  if (placement === 'after') insertAt = syncTargetSubtreeEnd(remaining, target.id);
  if (placement === 'child') insertAt = targetIndex + 1;

  const targetDepth = Number(target.depth || 0);
  const sourceDepth = Number(source.depth || 0);
  const rootDepth = placement === 'child' ? Math.min(OUTLINE_MAX_DEPTH, targetDepth + 1) : targetDepth;
  const depthDelta = rootDepth - sourceDepth;

  block.forEach((item) => {
    item.phaseId = target.phaseId || '';
    item.groupId = target.groupId || '';
    item.depth = clamp(Number(item.depth || 0) + depthDelta, 0, OUTLINE_MAX_DEPTH);
  });

  remaining.splice(insertAt, 0, ...block);
  outlineRenumber(state, remaining.map((item) => item.id));
  outlineSyncAutoEdges(state);
  selection = { type: 'note', id: source.id };
  if (typeof selectedNoteIds !== 'undefined') selectedNoteIds = new Set([source.id]);

  const changes = block.flatMap((item) => syncDiffNoteStructure(beforeStates.get(item.id), syncNoteState(item)));
  return { source, target, block, changes };
}

function executeFlowCommand(command) {
  if (!command || command.type !== 'note.structure') return false;
  const { noteId, targetId, placement = 'after' } = command.payload || {};
  const source = getNote(noteId);
  const target = getNote(targetId);
  if (!source || !target) return false;
  const placementLabel = placement === 'child' ? `「${target.title}」の子にする` : placement === 'before' ? `「${target.title}」の前へ移動` : `「${target.title}」の後へ移動`;
  let changeSet = null;
  mutate(command.label || `「${source.title}」を${placementLabel}`, () => {
    syncEnsureNotationKeys();
    const result = syncMoveSubtree(noteId, targetId, placement);
    if (!result) return;
    changeSet = syncChangeSet(
      command.label || `「${source.title}」を${placementLabel}`,
      command.origin || 'diagram',
      result.changes,
      result.block.map((item) => item.id)
    );
    syncAppendChangeSet(changeSet, { announce: false });
  }, noteId);
  if (changeSet) syncAnnounceChange(changeSet);
  return Boolean(changeSet);
}

function syncRecordExternalChange({ label, origin = 'diagram', changes = [], affectedIds = [] }) {
  if (!changes.length) return null;
  const changeSet = syncChangeSet(label, origin, changes, affectedIds);
  syncAppendChangeSet(changeSet, { announce: true });
  saveState();
  syncRenderUi();
  return changeSet;
}

function syncInstallUi() {
  const topbar = document.querySelector('.topbar');
  if (topbar && !document.getElementById('sync-status-pill')) {
    const pill = document.createElement('button');
    pill.id = 'sync-status-pill';
    pill.type = 'button';
    pill.className = 'sync-status-pill';
    pill.innerHTML = '<i></i><span>同期済み</span>';
    pill.title = '同期履歴を表示';
    const save = document.getElementById('save-indicator');
    topbar.insertBefore(pill, save || null);
  }
  if (!document.getElementById('sync-change-notice')) {
    const notice = document.createElement('section');
    notice.id = 'sync-change-notice';
    notice.className = 'sync-change-notice';
    notice.hidden = true;
    notice.innerHTML = '<div><span id="sync-change-origin">図から更新</span><strong id="sync-change-label"></strong></div><div class="sync-notice-actions"><button type="button" data-sync-history>変更を見る</button><button type="button" data-sync-undo>元に戻す</button></div>';
    document.body.append(notice);
  }
  if (!document.getElementById('sync-history-panel')) {
    const panel = document.createElement('aside');
    panel.id = 'sync-history-panel';
    panel.className = 'sync-history-panel';
    panel.hidden = true;
    panel.innerHTML = '<header><div><span>SYNC</span><strong>同期履歴</strong></div><button type="button" data-sync-close aria-label="閉じる">×</button></header><div id="sync-history-list"></div>';
    document.body.append(panel);
  }
}

function syncRenderHistory() {
  const list = document.getElementById('sync-history-list');
  if (!list) return;
  const history = state?.settings?.syncHistory || [];
  list.innerHTML = history.length ? history.map((item) => `
    <article data-sync-change-id="${item.id}">
      <span>${esc(syncOriginLabel(item.origin))}から変更</span>
      <strong>${esc(item.label)}</strong>
      <small>${item.changes?.length || 0}項目・${relativeTime(item.at)}</small>
    </article>`).join('') : '<div class="sync-history-empty">同期を伴う変更はまだありません。</div>';
}

function syncRenderUi() {
  syncInstallUi();
  const pill = document.getElementById('sync-status-pill');
  const dirtyFlowmark = typeof flowmarkDraftState !== 'undefined' && flowmarkDraftState?.dirty;
  if (pill) {
    pill.classList.toggle('is-warning', Boolean(dirtyFlowmark));
    const text = pill.querySelector('span');
    if (text) text.textContent = dirtyFlowmark ? '記法に未適用あり' : syncUiState.lastChange ? `${syncOriginLabel(syncUiState.lastChange.origin)}から更新` : '同期済み';
  }
  const panel = document.getElementById('sync-history-panel');
  if (panel) panel.hidden = !syncUiState.historyOpen;
  syncRenderHistory();
  const affected = new Set(syncUiState.lastChange?.affectedIds || []);
  document.querySelectorAll('[data-note-id],[data-outline-id],[data-write-note]').forEach((element) => {
    const id = element.dataset.noteId || element.dataset.outlineId || element.dataset.writeNote;
    element.classList.toggle('is-sync-recent', affected.has(id));
  });
}

function syncAnnounceChange(changeSet) {
  syncUiState.lastChange = changeSet;
  clearTimeout(syncUiState.noticeTimer);
  requestAnimationFrame(() => {
    syncInstallUi();
    const notice = document.getElementById('sync-change-notice');
    if (!notice) return;
    document.getElementById('sync-change-origin').textContent = `${syncOriginLabel(changeSet.origin)}から更新`;
    document.getElementById('sync-change-label').textContent = changeSet.label;
    notice.hidden = false;
    notice.classList.add('is-visible');
    syncUiState.noticeTimer = setTimeout(() => {
      notice.classList.remove('is-visible');
      setTimeout(() => { notice.hidden = true; }, 180);
    }, 5200);
    syncRenderUi();
  });
}

function syncBindUi() {
  if (syncUiState.bound) return;
  syncUiState.bound = true;
  document.addEventListener('click', (event) => {
    if (event.target.closest('#sync-status-pill,[data-sync-history]')) {
      syncUiState.historyOpen = !syncUiState.historyOpen;
      syncRenderUi();
      return;
    }
    if (event.target.closest('[data-sync-close]')) {
      syncUiState.historyOpen = false;
      syncRenderUi();
      return;
    }
    if (event.target.closest('[data-sync-undo]')) {
      document.getElementById('sync-change-notice')?.setAttribute('hidden', '');
      undo();
    }
  });
}

function syncInstallHelp() {
  const grid = els['help-dialog']?.querySelector('.shortcut-grid');
  if (!grid || grid.querySelector('[data-shortcut="structure-handle"]')) return;
  grid.insertAdjacentHTML('beforeend', '<div data-shortcut="structure-handle"><kbd>選択 → ⠿をドラッグ</kbd><span>工程の前・後・子へ構造として移動。通常ドラッグは順序を変えません</span></div>');
}

const renderAllBeforeSyncCommandBus = renderAll;
renderAll = function renderAllSyncCommandBus() {
  syncEnsureNotationKeys();
  const result = renderAllBeforeSyncCommandBus();
  syncRenderUi();
  return result;
};

const updateFlowExperienceUiBeforeSyncCommandBus = updateFlowExperienceUi;
updateFlowExperienceUi = function updateFlowExperienceUiSyncCommandBus() {
  updateFlowExperienceUiBeforeSyncCommandBus();
  syncInstallHelp();
  syncRenderUi();
  const badge = document.querySelector('.version-badge');
  if (badge) badge.textContent = `v${FLOWMAP_SYNC_VERSION}`;
};

const bindEventsBeforeSyncCommandBus = bindEvents;
bindEvents = function bindEventsSyncCommandBus() {
  bindEventsBeforeSyncCommandBus();
  syncBindUi();
};
