/* Flowmap v0.9 — IndexedDB persistence and legacy migration */
const FLOWMAP_DB_NAME = 'flowmap';
const FLOWMAP_DB_VERSION = 1;
const FLOWMAP_BOARD_STORE = 'boards';
const FLOWMAP_CURRENT_BOARD_ID = 'current';

let flowmapDbPromise = null;
let indexedDbSaveChain = Promise.resolve();
let pendingStateSnapshot = null;

function updateSaveIndicator(message, title = 'IndexedDBに保存') {
  const indicator = els['save-indicator'];
  if (!indicator) return;
  indicator.textContent = message;
  indicator.title = title;
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
      if (!db.objectStoreNames.contains(FLOWMAP_BOARD_STORE)) {
        const store = db.createObjectStore(FLOWMAP_BOARD_STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
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

async function readStateFromIndexedDb() {
  const db = await openFlowmapDatabase();
  const transaction = db.transaction(FLOWMAP_BOARD_STORE, 'readonly');
  const store = transaction.objectStore(FLOWMAP_BOARD_STORE);
  const record = await indexedDbRequest(store.get(FLOWMAP_CURRENT_BOARD_ID));
  return record?.state || null;
}

async function persistStateImmediately(nextState) {
  const db = await openFlowmapDatabase();
  const transaction = db.transaction(FLOWMAP_BOARD_STORE, 'readwrite');
  const store = transaction.objectStore(FLOWMAP_BOARD_STORE);
  store.put({
    id: FLOWMAP_CURRENT_BOARD_ID,
    state: clone(nextState),
    updatedAt: new Date().toISOString(),
    schemaVersion: 1
  });
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDBへの保存に失敗しました'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDBへの保存が中断されました'));
  });
}

async function flushStateSave() {
  clearTimeout(saveTimer);
  if (!pendingStateSnapshot) {
    await indexedDbSaveChain.catch(() => undefined);
    return;
  }
  const nextSnapshot = pendingStateSnapshot;
  pendingStateSnapshot = null;
  const operation = indexedDbSaveChain
    .catch(() => undefined)
    .then(() => persistStateImmediately(nextSnapshot));
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
  clearTimeout(saveTimer);
  pendingStateSnapshot = clone(state);
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

loadState = async function loadStateFromIndexedDb() {
  try {
    const stored = await readStateFromIndexedDb();
    if (stored && Array.isArray(stored.notes)) return stored;
  } catch (error) {
    console.warn('[Flowmap] IndexedDB restore failed', error);
  }

  for (const key of [STORAGE_KEY, 'flowmap:v6', 'flowmap:v5', 'flowmap:v4', 'flowmap']) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const migrated = key === STORAGE_KEY && parsed?.version === 7 && Array.isArray(parsed.notes)
        ? parsed
        : normalizeLegacyState(parsed);
      if (!migrated) continue;
      await persistStateImmediately(migrated);
      console.info(`[Flowmap] Migrated ${key} from localStorage to IndexedDB`);
      return migrated;
    } catch (error) {
      console.warn(`[Flowmap] Failed to migrate ${key}`, error);
    }
  }
  return null;
};

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void flushStateSave();
});
window.addEventListener('pagehide', () => { void flushStateSave(); });
