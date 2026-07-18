/* Flowmap v0.7 legacy data migration */
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
    id: item.id || uid('edge'), from: item.from || item.source || item.fromId, to: item.to || item.target || item.toId
  })).filter((item) => noteIds.has(item.from) && noteIds.has(item.to) && item.from !== item.to);
  return {
    version: 7, phases, groups, notes, edges,
    viewport: { x: Number(parsed.viewport?.x ?? 20), y: Number(parsed.viewport?.y ?? 20), scale: clamp(Number(parsed.viewport?.scale ?? .78), .28, 1.8) },
    activity: Array.isArray(parsed.activity) ? parsed.activity : [{ id: uid('activity'), at: now, label: '旧版データを移行', noteId: null }],
    settings: { grid: parsed.settings?.grid !== false, navigatorOpen: parsed.settings?.navigatorOpen !== false, inspectorOpen: parsed.settings?.inspectorOpen !== false }
  };
}

loadState = function loadState() {
  for (const key of [STORAGE_KEY, 'flowmap:v6', 'flowmap:v5', 'flowmap:v4', 'flowmap']) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (key === STORAGE_KEY && parsed?.version === 7 && Array.isArray(parsed.notes)) return parsed;
      const migrated = normalizeLegacyState(parsed);
      if (migrated) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    } catch (error) {
      console.warn(`[Flowmap] Failed to restore ${key}`, error);
    }
  }
  return initialState();
};
