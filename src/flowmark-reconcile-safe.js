/* Flowmap v0.20.0 — Flowmark reconciliation uses persistent keys, never title guesses */
reconcileFlowmarkAst = function reconcileFlowmarkAstSafe(ast) {
  syncEnsureNotationKeys();
  const before = snapshot();
  const existingPhasesByKey = new Map(state.phases.flatMap((item) => [[item.notationKey, item], [item.id, item]]));
  const existingGroupsByKey = new Map(state.groups.flatMap((item) => [[item.notationKey, item], [item.id, item]]));
  const existingNotesByKey = new Map(state.notes.flatMap((item) => [[item.notationKey, item], [item.id, item]]));
  const phaseMap = new Map();
  const groupMap = new Map();
  const noteMap = new Map();

  const nextPhases = ast.phases.map((entry, index) => {
    let item = existingPhasesByKey.get(entry.key);
    if (!item) item = { id: uid('phase'), x: 40 + index * 760, y: 40, w: 700, h: 1250 };
    item.title = entry.title;
    item.notationKey = entry.key;
    item.outlineOrder = (index + 1) * 100;
    phaseMap.set(entry.key, item);
    return item;
  });

  const nextGroups = ast.groups.map((entry, index) => {
    const phase = phaseMap.get(entry.phaseKey);
    let item = existingGroupsByKey.get(entry.key);
    if (!item) item = { id: uid('group'), x: (phase?.x || 40) + 40, y: (phase?.y || 40) + 100 + index * 330, w: 600, h: 290, color: 'gray', collapsed: false };
    item.title = entry.title;
    item.phaseId = phase?.id || '';
    item.notationKey = entry.key;
    item.outlineOrder = (index + 1) * 100;
    groupMap.set(entry.key, item);
    return item;
  });

  const nextNotes = ast.nodes.map((entry, index) => {
    const phase = phaseMap.get(entry.phaseKey);
    const group = groupMap.get(entry.groupKey);
    let item = existingNotesByKey.get(entry.key);
    if (!item) {
      const position = flowmarkFindFreePosition(index, phase, group);
      item = note(uid('note'), entry.title, position.x, position.y, phase?.id || '', group?.id || '', { type: entry.type, now: new Date().toISOString() });
    }
    item.title = entry.title;
    item.type = entry.type;
    item.phaseId = phase?.id || '';
    item.groupId = group?.id || '';
    item.depth = clamp(entry.depth, 0, OUTLINE_MAX_DEPTH);
    item.order = (index + 1) * OUTLINE_ORDER_STEP;
    item.notationKey = entry.key;
    item.updatedAt = new Date().toISOString();
    const metadata = { ...entry.metadata };
    if (metadata.status && STATUS[metadata.status]) item.status = metadata.status;
    if ('due' in metadata) item.due = metadata.due;
    if ('assignee' in metadata) item.assignee = metadata.assignee;
    if ('tags' in metadata) item.tags = metadata.tags.split(',').map((value) => value.trim()).filter(Boolean);
    if ('summary' in metadata) item.summary = metadata.summary;
    if ('location' in metadata) item.location = metadata.location;
    if ('link' in metadata) item.link = metadata.link;
    if ('note' in metadata) item.note = metadata.note;
    item.flowmarkMeta = Object.fromEntries(Object.entries(metadata).filter(([key]) => !FLOWMARK_META_FIELDS.has(key)));
    noteMap.set(entry.key, item);
    return item;
  });

  const previousEdges = new Map(state.edges.map((item) => [`${item.from}|${item.to}|${item.kind || 'sequence'}|${item.label || ''}`, item]));
  state.phases = nextPhases;
  state.groups = nextGroups;
  state.notes = nextNotes;
  outlineRefreshParents(state);
  state.edges = ast.relations.map((relation) => {
    const from = noteMap.get(relation.fromKey);
    const to = noteMap.get(relation.toKey);
    if (!from || !to || from.id === to.id) return null;
    const edgeKey = `${from.id}|${to.id}|${relation.kind}|${relation.label}`;
    const item = previousEdges.get(edgeKey) || edge(uid('edge'), from.id, to.id, relation.label, { source: 'manual', kind: relation.kind, routing: 'auto' });
    item.from = from.id;
    item.to = to.id;
    item.label = relation.label;
    item.kind = relation.kind;
    item.source = 'manual';
    item.routing ||= 'auto';
    return item;
  }).filter(Boolean);
  state.settings.outlineSuppressedAutoPairs = [];
  outlineRenumber(state, nextNotes.map((item) => item.id));
  outlineSyncAutoEdges(state);
  selection = nextNotes[0] ? { type: 'note', id: nextNotes[0].id } : { type: null, id: null };
  if (typeof selectedNoteIds !== 'undefined') selectedNoteIds = nextNotes[0] ? new Set([nextNotes[0].id]) : new Set();

  const beforeIds = new Set(before.notes.map((item) => item.id));
  const afterIds = new Set(state.notes.map((item) => item.id));
  const created = [...afterIds].filter((id) => !beforeIds.has(id));
  const deleted = [...beforeIds].filter((id) => !afterIds.has(id));
  const affectedIds = [...new Set([...created, ...deleted, ...state.notes.map((item) => item.id)])];
  const changes = [
    ...created.map((id) => ({ entity: 'note', id, field: 'existence', before: false, after: true })),
    ...deleted.map((id) => ({ entity: 'note', id, field: 'existence', before: true, after: false }))
  ];
  state.notes.forEach((item) => {
    const previous = before.notes.find((candidate) => candidate.id === item.id);
    if (!previous) return;
    ['title', 'type', 'phaseId', 'groupId', 'depth', 'order'].forEach((field) => {
      if (previous[field] !== item[field]) changes.push({ entity: 'note', id: item.id, field, before: previous[field], after: item[field] });
    });
  });
  const changeSet = syncChangeSet('記法を図へ適用', 'flowmark', changes, affectedIds);
  syncAppendChangeSet(changeSet, { announce: true });
};
