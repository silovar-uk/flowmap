/* Flowmap v0.10 — IndexedDB boards, autosave and legacy migration */
const FLOWMAP_DB_NAME = 'flowmap';
const FLOWMAP_DB_VERSION = 2;
const FLOWMAP_BOARD_STORE = 'boards';
const FLOWMAP_META_STORE = 'meta';
const FLOWMAP_LEGACY_CURRENT_ID = 'current';
const FLOWMAP_ACTIVE_BOARD_KEY = 'activeBoardId';
const FLOWMAP_TUTORIAL_KEY = 'tutorialSeen';

let flowmapDbPromise = null;
let indexedDbSaveChain = Promise.resolve();
let pendingStateSnapshot = null;
let activeBoardId = null;
let activeBoardName = '無題のボード';

function updateSaveIndicator(message, title = 'IndexedDBへ自動保存') {
  const indicator = els['save-indicator'];
  if (!indicator) return;
  indicator.textContent = message;
  indicator.title = title;
}

function createBoardId() {
  return uid('board');
}

function normalizeBoardName(value, fallback = '無題のボード') {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  return name.slice(0, 80) || fallback;
}

function openFlowmapDatabase() {
  if (flowmapDbPromise) return flowmapDbPromise;
  flowmapDbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('このブラウザはIndexedDBに対応していません'));
      return;
    }
    const request = indexedDB.open(FLOWMAP_DB_NAME, FLOWMAP_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      let boardStore;
      if (!db.objectStoreNames.contains(FLOWMAP_BOARD_STORE)) {
        boardStore = db.createObjectStore(FLOWMAP_BOARD_STORE, { keyPath: 'id' });
      } else {
        boardStore = request.transaction.objectStore(FLOWMAP_BOARD_STORE);
      }
      if (!boardStore.indexNames.contains('updatedAt')) boardStore.createIndex('updatedAt', 'updatedAt');
      if (!db.objectStoreNames.contains(FLOWMAP_META_STORE)) {
        db.createObjectStore(FLOWMAP_META_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error('IndexedDBを開けませんでした'));
    request.onblocked = () => updateSaveIndicator('保存待機中', '別のタブでFlowmapが開かれています');
  });
  return flowmapDbPromise;
}

function indexedDbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDBの処理に失敗しました'));
  });
}

async function getStoreRecord(storeName, key) {
  const db = await openFlowmapDatabase();
  const transaction = db.transaction(storeName, 'readonly');
  return indexedDbRequest(transaction.objectStore(storeName).get(key));
}

async function getAllStoreRecords(storeName) {
  const db = await openFlowmapDatabase();
  const transaction = db.transaction(storeName, 'readonly');
  return indexedDbRequest(transaction.objectStore(storeName).getAll());
}

async function putStoreRecord(storeName, value) {
  const db = await openFlowmapDatabase();
  const transaction = db.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).put(value);
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDBへの保存に失敗しました'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDBへの保存が中断されました'));
  });
  return value;
}

async function deleteStoreRecord(storeName, key) {
  const db = await openFlowmapDatabase();
  const transaction = db.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).delete(key);
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDBから削除できませんでした'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDBの削除が中断されました'));
  });
}

async function getFlowmapMeta(key) {
  const record = await getStoreRecord(FLOWMAP_META_STORE, key);
  return record?.value;
}

async function setFlowmapMeta(key, value) {
  await putStoreRecord(FLOWMAP_META_STORE, { key, value, updatedAt: new Date().toISOString() });
}

function blankBoardState() {
  const next = initialState();
  next.phases = [];
  next.groups = [];
  next.notes = [];
  next.edges = [];
  next.viewport = { x: 40, y: 40, scale: 1 };
  next.activity = [{ id: uid('activity'), at: new Date().toISOString(), label: '新しいボードを作成', noteId: null }];
  next.settings = {
    grid: state?.settings?.grid !== false,
    navigatorOpen: state?.settings?.navigatorOpen !== false,
    inspectorOpen: state?.settings?.inspectorOpen !== false
  };
  return typeof normalizeFlowchartState === 'function' ? normalizeFlowchartState(next) : next;
}

function boardRecordName(record) {
  return normalizeBoardName(record?.name, record?.id === FLOWMAP_LEGACY_CURRENT_ID ? '移行したボード' : '無題のボード');
}

async function persistStateImmediately(nextState, options = {}) {
  const boardId = options.boardId || activeBoardId || createBoardId();
  const existing = await getStoreRecord(FLOWMAP_BOARD_STORE, boardId);
  const now = new Date().toISOString();
  const record = {
    id: boardId,
    name: normalizeBoardName(options.name, existing ? boardRecordName(existing) : activeBoardName),
    state: clone(nextState),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    schemaVersion: 2
  };
  await putStoreRecord(FLOWMAP_BOARD_STORE, record);
  if (!activeBoardId || options.activate) {
    activeBoardId = boardId;
    activeBoardName = record.name;
    await setFlowmapMeta(FLOWMAP_ACTIVE_BOARD_KEY, boardId);
  } else if (boardId === activeBoardId) {
    activeBoardName = record.name;
  }
  return record;
}

async function flushStateSave() {
  clearTimeout(saveTimer);
  if (!pendingStateSnapshot) {
    await indexedDbSaveChain.catch(() => undefined);
    return;
  }
  const pending = pendingStateSnapshot;
  pendingStateSnapshot = null;
  const operation = indexedDbSaveChain
    .catch(() => undefined)
    .then(() => persistStateImmediately(pending.state, { boardId: pending.boardId, name: pending.name }));
  indexedDbSaveChain = operation;
  try {
    await operation;
    if (!pendingStateSnapshot) updateSaveIndicator('保存済み');
  } catch (error) {
    console.error('[Flowmap] IndexedDB save failed', error);
    updateSaveIndicator('保存失敗', error.message || 'IndexedDBへの保存に失敗しました');
  }
}

saveState = function saveStateToIndexedDb() {
  if (!state) return;
  if (!activeBoardId) activeBoardId = createBoardId();
  clearTimeout(saveTimer);
  pendingStateSnapshot = { boardId: activeBoardId, name: activeBoardName, state: clone(state) };
  updateSaveIndicator('保存中…');
  saveTimer = setTimeout(() => { void flushStateSave(); }, 140);
};

function normalizeLegacyState(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const sourceNotes = parsed.notes || parsed.nodes || parsed.tasks;
  if (!Array.isArray(sourceNotes) || !sourceNotes.length) return null;
  const now = new Date().toISOString();
  const phases = Array.isArray(parsed.phases) && parsed.phases.length
    ? parsed.phases.map((item, index) => ({
        id: item.id || uid('phase'), title: item.title || item.name || `フェーズ ${index + 1}`,
        x: Number(item.x ?? item.position?.x ?? 40 + index * 750), y: Number(item.y ?? item.position?.y ?? 40),
        w: Number(item.w ?? item.width ?? 700), h: Number(item.h ?? item.height ?? 900)
      }))
    : [{ id: 'phase_migrated', title: '移行したデータ', x: 40, y: 40, w: 2200, h: 1400 }];
  const phaseIds = new Set(phases.map((item) => item.id));
  const groups = (Array.isArray(parsed.groups) ? parsed.groups : []).map((item, index) => ({
    id: item.id || uid('group'), phaseId: phaseIds.has(item.phaseId) ? item.phaseId : phases[0].id,
    title: item.title || item.name || `囲み ${index + 1}`,
    x: Number(item.x ?? item.position?.x ?? 80 + index * 40), y: Number(item.y ?? item.position?.y ?? 110 + index * 40),
    w: Number(item.w ?? item.width ?? 560), h: Number(item.h ?? item.height ?? 300),
    color: item.color || 'gray', collapsed: Boolean(item.collapsed)
  }));
  const groupMap = new Map(groups.map((item) => [item.id, item]));
  const notes = sourceNotes.map((item, index) => {
    const groupId = groupMap.has(item.groupId || item.parentId) ? (item.groupId || item.parentId) : '';
    const phaseId = phaseIds.has(item.phaseId) ? item.phaseId : (groupMap.get(groupId)?.phaseId || phases[0].id);
    const rawTags = item.tags || item.labels || [];
    const rawChecklist = item.checklist || item.checks || [];
    const statusMap = { pending:'todo', open:'todo', in_progress:'doing', progress:'doing', blocked:'waiting', complete:'done', completed:'done' };
    return {
      id: item.id || uid('note'), title: item.title || item.name || item.text || `付箋 ${index + 1}`,
      x: Number(item.x ?? item.position?.x ?? 120 + (index % 4) * 260),
      y: Number(item.y ?? item.position?.y ?? 150 + Math.floor(index / 4) * 150),
      w: Number(item.w ?? item.width ?? 224), h: Number(item.h ?? item.height ?? 116), phaseId, groupId,
      type: item.type || 'process',
      status: STATUS[item.status] ? item.status : (statusMap[item.status] || 'todo'),
      due: String(item.due || item.deadline || '').slice(0, 10), assignee: item.assignee || item.owner || '',
      tags: Array.isArray(rawTags) ? rawTags.map(String) : String(rawTags).split(',').map((value) => value.trim()).filter(Boolean),
      location: item.location || '', link: item.link || item.url || '', note: item.note || item.memo || item.description || '',
      checklist: Array.isArray(rawChecklist) ? rawChecklist.map((check) => ({
        id: check.id || uid('check'), text: typeof check === 'string' ? check : (check.text || check.title || ''),
        done: typeof check === 'object' ? Boolean(check.done || check.completed) : false
      })) : [],
      createdAt: item.createdAt || now, updatedAt: item.updatedAt || now
    };
  });
  const noteIds = new Set(notes.map((item) => item.id));
  const sourceEdges = parsed.edges || parsed.connections || [];
  const edges = (Array.isArray(sourceEdges) ? sourceEdges : []).map((item) => ({
    id: item.id || uid('edge'), from: item.from || item.source || item.fromId, to: item.to || item.target || item.toId,
    label: typeof item.label === 'string' ? item.label : ''
  })).filter((item) => noteIds.has(item.from) && noteIds.has(item.to) && item.from !== item.to);
  return {
    version: 7, phases, groups, notes, edges,
    viewport: { x: Number(parsed.viewport?.x ?? 20), y: Number(parsed.viewport?.y ?? 20), scale: clamp(Number(parsed.viewport?.scale ?? .78), .28, 1.8) },
    activity: Array.isArray(parsed.activity) ? parsed.activity : [{ id: uid('activity'), at: now, label: '旧版データを移行', noteId: null }],
    settings: { grid: parsed.settings?.grid !== false, navigatorOpen: parsed.settings?.navigatorOpen !== false, inspectorOpen: parsed.settings?.inspectorOpen !== false }
  };
}

async function normalizeStoredBoardRecord(record) {
  if (!record?.state || !Array.isArray(record.state.notes)) return null;
  const normalized = {
    ...record,
    name: boardRecordName(record),
    createdAt: record.createdAt || record.updatedAt || new Date().toISOString(),
    updatedAt: record.updatedAt || new Date().toISOString(),
    schemaVersion: 2
  };
  if (JSON.stringify(normalized) !== JSON.stringify(record)) await putStoreRecord(FLOWMAP_BOARD_STORE, normalized);
  return normalized;
}

async function resolveActiveBoardRecord() {
  const preferredId = await getFlowmapMeta(FLOWMAP_ACTIVE_BOARD_KEY);
  if (preferredId) {
    const preferred = await normalizeStoredBoardRecord(await getStoreRecord(FLOWMAP_BOARD_STORE, preferredId));
    if (preferred) return preferred;
  }
  const legacyCurrent = await normalizeStoredBoardRecord(await getStoreRecord(FLOWMAP_BOARD_STORE, FLOWMAP_LEGACY_CURRENT_ID));
  if (legacyCurrent) {
    await setFlowmapMeta(FLOWMAP_ACTIVE_BOARD_KEY, legacyCurrent.id);
    return legacyCurrent;
  }
  const records = (await getAllStoreRecords(FLOWMAP_BOARD_STORE))
    .filter((record) => record?.state && Array.isArray(record.state.notes))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  if (!records.length) return null;
  const record = await normalizeStoredBoardRecord(records[0]);
  await setFlowmapMeta(FLOWMAP_ACTIVE_BOARD_KEY, record.id);
  return record;
}

async function migrateLocalStorageBoard() {
  for (const key of [STORAGE_KEY, 'flowmap:v6', 'flowmap:v5', 'flowmap:v4', 'flowmap']) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const migrated = key === STORAGE_KEY && parsed?.version === 7 && Array.isArray(parsed.notes)
        ? parsed
        : normalizeLegacyState(parsed);
      if (!migrated) continue;
      const boardId = createBoardId();
      const record = await persistStateImmediately(migrated, { boardId, name: '移行したボード', activate: true });
      console.info(`[Flowmap] Migrated ${key} from localStorage to IndexedDB`);
      return record;
    } catch (error) {
      console.warn(`[Flowmap] Failed to migrate ${key}`, error);
    }
  }
  return null;
}

loadState = async function loadStateFromIndexedDb() {
  try {
    let record = await resolveActiveBoardRecord();
    if (!record) record = await migrateLocalStorageBoard();
    if (!record) {
      const boardId = createBoardId();
      record = await persistStateImmediately(initialState(), { boardId, name: 'マイボード', activate: true });
    }
    activeBoardId = record.id;
    activeBoardName = boardRecordName(record);
    await setFlowmapMeta(FLOWMAP_ACTIVE_BOARD_KEY, activeBoardId);
    return record.state;
  } catch (error) {
    console.warn('[Flowmap] IndexedDB restore failed', error);
    throw error;
  }
};

async function listSavedBoards() {
  await flushStateSave();
  const records = await getAllStoreRecords(FLOWMAP_BOARD_STORE);
  return records
    .filter((record) => record?.state && Array.isArray(record.state.notes))
    .map((record) => ({ ...record, name: boardRecordName(record), active: record.id === activeBoardId }))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function getActiveBoardInfo() {
  return { id: activeBoardId, name: activeBoardName };
}

async function saveActiveBoardName(name) {
  activeBoardName = normalizeBoardName(name, activeBoardName);
  const record = await persistStateImmediately(state, { boardId: activeBoardId, name: activeBoardName });
  updateSaveIndicator('保存済み', `${record.name}をIndexedDBへ保存しました`);
  return record;
}

async function switchToBoardRecord(record) {
  activeBoardId = record.id;
  activeBoardName = boardRecordName(record);
  await setFlowmapMeta(FLOWMAP_ACTIVE_BOARD_KEY, activeBoardId);
  state = typeof normalizeFlowchartState === 'function' ? normalizeFlowchartState(clone(record.state)) : clone(record.state);
  selection = { type: null, id: null };
  undoStack.length = 0;
  redoStack.length = 0;
  renderAll();
  updateSaveIndicator('保存済み', `${activeBoardName}を開いています`);
  return record;
}

async function openSavedBoard(boardId) {
  await flushStateSave();
  const record = await normalizeStoredBoardRecord(await getStoreRecord(FLOWMAP_BOARD_STORE, boardId));
  if (!record) throw new Error('保存したボードが見つかりません');
  return switchToBoardRecord(record);
}

async function createSavedBoard(name = '新しいボード') {
  await flushStateSave();
  const boardId = createBoardId();
  const record = await persistStateImmediately(blankBoardState(), { boardId, name: normalizeBoardName(name, '新しいボード'), activate: true });
  return switchToBoardRecord(record);
}

async function renameSavedBoard(boardId, name) {
  await flushStateSave();
  const record = await normalizeStoredBoardRecord(await getStoreRecord(FLOWMAP_BOARD_STORE, boardId));
  if (!record) throw new Error('保存したボードが見つかりません');
  record.name = normalizeBoardName(name, record.name);
  record.updatedAt = new Date().toISOString();
  await putStoreRecord(FLOWMAP_BOARD_STORE, record);
  if (boardId === activeBoardId) activeBoardName = record.name;
  return record;
}

async function duplicateSavedBoard(boardId) {
  await flushStateSave();
  const source = await normalizeStoredBoardRecord(await getStoreRecord(FLOWMAP_BOARD_STORE, boardId));
  if (!source) throw new Error('複製するボードが見つかりません');
  const newId = createBoardId();
  return persistStateImmediately(source.state, { boardId: newId, name: `${source.name} のコピー` });
}

async function deleteSavedBoard(boardId) {
  await flushStateSave();
  await deleteStoreRecord(FLOWMAP_BOARD_STORE, boardId);
  if (boardId !== activeBoardId) return null;
  const remaining = (await getAllStoreRecords(FLOWMAP_BOARD_STORE))
    .filter((record) => record?.state && Array.isArray(record.state.notes))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  if (remaining.length) return switchToBoardRecord(await normalizeStoredBoardRecord(remaining[0]));
  return createSavedBoard('新しいボード');
}

async function clearActiveBoard() {
  state = blankBoardState();
  selection = { type: null, id: null };
  undoStack.length = 0;
  redoStack.length = 0;
  saveState();
  renderAll();
  await flushStateSave();
}

async function hasSeenTutorial() {
  return Boolean(await getFlowmapMeta(FLOWMAP_TUTORIAL_KEY));
}

async function markTutorialSeen() {
  await setFlowmapMeta(FLOWMAP_TUTORIAL_KEY, true);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void flushStateSave();
});
window.addEventListener('pagehide', () => { void flushStateSave(); });
