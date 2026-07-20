/* Flowmap v0.19.0 — full-screen outliner and apply-on-command Flowmark notation */
const FLOWMARK_TYPES = new Set(['process', 'decision', 'terminal', 'input', 'document']);
const FLOWMARK_TYPE_LABELS = {
  process: '処理', decision: '判断', terminal: '開始／終了', input: '入出力', document: '書類'
};
const FLOWMARK_META_FIELDS = new Set(['status', 'due', 'assignee', 'tags', 'summary', 'location', 'link', 'note']);
let flowmarkWorkspaceBound = false;
let flowmarkDraftState = { boardId: null, text: '', baseHash: '', dirty: false, parseResult: null, saveTimer: null };
const flowmarkCollapsedPhases = new Set();
const flowmarkCollapsedGroups = new Set();

function flowmarkSlug(value, fallback = 'item') {
  const normalized = String(value || '').trim().toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function flowmarkUniqueKey(base, used) {
  let key = flowmarkSlug(base);
  let index = 2;
  while (used.has(key)) key = `${flowmarkSlug(base)}-${index++}`;
  used.add(key);
  return key;
}

function flowmarkEntityKey(item, fallback) {
  return flowmarkSlug(item?.notationKey || item?.id || fallback, fallback);
}

function flowmarkUnescapeValue(value) {
  return String(value || '').replaceAll('\\n', '\n').replaceAll('\\=', '=');
}

function flowmarkEscapeValue(value) {
  return String(value || '').replaceAll('=', '\\=').replaceAll('\n', '\\n');
}

function parseFlowmark(source) {
  const ast = { phases: [], groups: [], nodes: [], relations: [] };
  const diagnostics = [];
  const usedKeys = new Map();
  let currentPhase = null;
  let currentGroup = null;
  let lastNode = null;

  const registerKey = (key, line, kind) => {
    if (!key) return;
    if (usedKeys.has(key)) {
      diagnostics.push({ severity: 'error', code: 'duplicate-key', line, column: 1, message: `@${key} は${usedKeys.get(key).line}行目でも使われています` });
    } else usedKeys.set(key, { line, kind });
  };

  String(source || '').split(/\r?\n/).forEach((rawLine, index) => {
    const line = index + 1;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('<!--') || trimmed.startsWith('//')) return;

    const phaseMatch = rawLine.match(/^#\s+(.+?)(?:\s+@([A-Za-z0-9_-]+))?\s*$/);
    if (phaseMatch && !rawLine.startsWith('##')) {
      const key = phaseMatch[2] || flowmarkSlug(phaseMatch[1], `phase-${line}`);
      currentPhase = { kind: 'phase', title: phaseMatch[1].trim(), key, line, order: ast.phases.length };
      currentGroup = null;
      lastNode = null;
      ast.phases.push(currentPhase);
      registerKey(key, line, 'phase');
      return;
    }

    const groupMatch = rawLine.match(/^##\s+(.+?)(?:\s+@([A-Za-z0-9_-]+))?\s*$/);
    if (groupMatch) {
      if (!currentPhase) {
        const key = flowmarkUniqueKey('phase-default', new Set(ast.phases.map((item) => item.key)));
        currentPhase = { kind: 'phase', title: '未分類', key, line, order: ast.phases.length };
        ast.phases.push(currentPhase);
        registerKey(key, line, 'phase');
        diagnostics.push({ severity: 'warning', code: 'implicit-phase', line, column: 1, message: '囲みの前にフェーズがないため「未分類」を補いました' });
      }
      const key = groupMatch[2] || flowmarkSlug(groupMatch[1], `group-${line}`);
      currentGroup = { kind: 'group', title: groupMatch[1].trim(), key, phaseKey: currentPhase.key, line, order: ast.groups.length };
      lastNode = null;
      ast.groups.push(currentGroup);
      registerKey(key, line, 'group');
      return;
    }

    const nodeMatch = rawLine.match(/^(\s*)-\s+(?:\[([A-Za-z]+)\]\s+)?(.+?)(?:\s+@([A-Za-z0-9_-]+))?\s*$/);
    if (nodeMatch) {
      if (!currentPhase) {
        const key = 'phase-default';
        currentPhase = { kind: 'phase', title: '未分類', key, line, order: ast.phases.length };
        ast.phases.push(currentPhase);
        registerKey(key, line, 'phase');
        diagnostics.push({ severity: 'warning', code: 'implicit-phase', line, column: 1, message: '工程の前にフェーズがないため「未分類」を補いました' });
      }
      const rawType = (nodeMatch[2] || 'process').toLowerCase();
      const type = FLOWMARK_TYPES.has(rawType) ? rawType : 'process';
      if (type !== rawType) diagnostics.push({ severity: 'warning', code: 'unknown-type', line, column: 1, message: `[${rawType}] は未対応のため [process] として扱います` });
      const title = nodeMatch[3].trim();
      const key = nodeMatch[4] || flowmarkSlug(title, `note-${line}`);
      const spaces = nodeMatch[1].replaceAll('\t', '  ').length;
      lastNode = {
        kind: 'node', title, key, type, depth: Math.min(OUTLINE_MAX_DEPTH, Math.floor(spaces / 2)),
        phaseKey: currentPhase.key, groupKey: currentGroup?.key || '', line, order: ast.nodes.length,
        metadata: {}, relations: []
      };
      ast.nodes.push(lastNode);
      registerKey(key, line, 'node');
      return;
    }

    const metadataMatch = rawLine.match(/^\s*::\s*([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(.*)$/);
    if (metadataMatch) {
      if (!lastNode) {
        diagnostics.push({ severity: 'error', code: 'orphan-metadata', line, column: 1, message: '補足情報の対象となる工程がありません' });
        return;
      }
      const key = metadataMatch[1];
      const value = flowmarkUnescapeValue(metadataMatch[2]);
      lastNode.metadata[key] = value;
      if (!FLOWMARK_META_FIELDS.has(key)) diagnostics.push({ severity: 'warning', code: 'unknown-metadata', line, column: 1, message: `:: ${key} は未定義項目として保持します` });
      return;
    }

    const relationMatch = rawLine.match(/^\s*(->|=>|~>)\s*(?:\[([^\]]+)\]\s*)?@([A-Za-z0-9_-]+)\s*$/);
    if (relationMatch) {
      if (!lastNode) {
        diagnostics.push({ severity: 'error', code: 'orphan-relation', line, column: 1, message: '関係の接続元となる工程がありません' });
        return;
      }
      const relation = {
        fromKey: lastNode.key,
        toKey: relationMatch[3],
        label: (relationMatch[2] || '').trim(),
        kind: relationMatch[1] === '=>' ? 'merge' : relationMatch[1] === '~>' ? 'reference' : (relationMatch[2] ? 'branch' : 'sequence'),
        line
      };
      lastNode.relations.push(relation);
      ast.relations.push(relation);
      return;
    }

    diagnostics.push({ severity: 'error', code: 'syntax', line, column: 1, message: 'Flowmarkとして解釈できない行です' });
  });

  const nodeKeys = new Set(ast.nodes.map((item) => item.key));
  ast.relations.forEach((relation) => {
    if (!nodeKeys.has(relation.toKey)) diagnostics.push({ severity: 'error', code: 'missing-target', line: relation.line, column: 1, message: `参照先 @${relation.toKey} が見つかりません` });
  });

  return { ast, diagnostics, source: String(source || '') };
}

function flowmarkOrderedPhases() {
  return [...state.phases].sort((a, b) => Number(a.outlineOrder ?? a.x) - Number(b.outlineOrder ?? b.x) || a.y - b.y);
}

function flowmarkOrderedGroups(phaseId) {
  return state.groups.filter((item) => item.phaseId === phaseId)
    .sort((a, b) => Number(a.outlineOrder ?? a.y) - Number(b.outlineOrder ?? b.y) || a.x - b.x);
}

function serializeFlowmark(nextState = state) {
  const lines = [];
  const noteKeyMap = new Map(nextState.notes.map((item) => [item.id, flowmarkEntityKey(item, 'note')]));
  const orderedNotes = outlineSortedNotes(nextState);
  const writtenNotes = new Set();

  const writeNode = (item) => {
    if (writtenNotes.has(item.id)) return;
    writtenNotes.add(item.id);
    const indent = '  '.repeat(clamp(Number(item.depth) || 0, 0, OUTLINE_MAX_DEPTH));
    lines.push(`${indent}- [${FLOWMARK_TYPES.has(item.type) ? item.type : 'process'}] ${item.title || '無題の処理'} @${noteKeyMap.get(item.id)}`);
    const metadata = {
      status: item.status && item.status !== 'todo' ? item.status : '', due: item.due, assignee: item.assignee,
      tags: Array.isArray(item.tags) ? item.tags.join(', ') : item.tags, summary: item.summary,
      location: item.location, link: item.link, note: item.note
    };
    Object.entries({ ...metadata, ...(item.flowmarkMeta || {}) }).forEach(([key, value]) => {
      if (value === undefined || value === null || String(value).trim() === '') return;
      lines.push(`${indent}  :: ${key} = ${flowmarkEscapeValue(value)}`);
    });
    nextState.edges.filter((edgeItem) => edgeItem.from === item.id && (edgeItem.source !== 'auto' || edgeItem.kind !== 'sequence' || edgeItem.label)).forEach((edgeItem) => {
      const targetKey = noteKeyMap.get(edgeItem.to);
      if (!targetKey) return;
      const operator = edgeItem.kind === 'merge' ? '=>' : edgeItem.kind === 'reference' ? '~>' : '->';
      const label = edgeItem.label ? ` [${edgeItem.label}]` : '';
      lines.push(`${indent}  ${operator}${label} @${targetKey}`);
    });
  };

  flowmarkOrderedPhases().forEach((phase) => {
    lines.push(`# ${phase.title || '無題のフェーズ'} @${flowmarkEntityKey(phase, 'phase')}`, '');
    const groups = flowmarkOrderedGroups(phase.id);
    groups.forEach((group) => {
      lines.push(`## ${group.title || '無題の囲み'} @${flowmarkEntityKey(group, 'group')}`, '');
      orderedNotes.filter((item) => item.phaseId === phase.id && item.groupId === group.id).forEach(writeNode);
      lines.push('');
    });
    orderedNotes.filter((item) => item.phaseId === phase.id && !item.groupId).forEach(writeNode);
    lines.push('');
  });

  const unassigned = orderedNotes.filter((item) => !nextState.phases.some((phase) => phase.id === item.phaseId));
  if (unassigned.length) {
    lines.push('# 未分類 @phase-unassigned', '');
    unassigned.forEach(writeNode);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function flowmarkStructuralProjection(nextState = state) {
  return {
    phases: flowmarkOrderedPhases().map((item) => [item.id, item.title, item.outlineOrder]),
    groups: [...nextState.groups].map((item) => [item.id, item.phaseId, item.title, item.outlineOrder]),
    notes: outlineSortedNotes(nextState).map((item) => [item.id, item.phaseId, item.groupId, item.title, item.type, item.depth, item.order]),
    edges: nextState.edges.map((item) => [item.from, item.to, item.kind, item.label, item.source]).sort()
  };
}

function flowmarkHash(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function flowmarkDraftMetaKey() {
  return `flowmarkDraft:${getActiveBoardInfo?.().id || activeBoardId || 'current'}`;
}

async function flowmarkLoadDraft({ force = false } = {}) {
  const boardId = getActiveBoardInfo?.().id || activeBoardId || 'current';
  if (!force && flowmarkDraftState.boardId === boardId && flowmarkDraftState.text) return flowmarkDraftState;
  const saved = await getFlowmapMeta(flowmarkDraftMetaKey()).catch(() => null);
  const text = saved?.text || serializeFlowmark();
  flowmarkDraftState = {
    boardId, text, baseHash: saved?.baseHash || flowmarkHash(flowmarkStructuralProjection()),
    dirty: Boolean(saved?.dirty), parseResult: parseFlowmark(text), saveTimer: null
  };
  renderFlowmarkNotation();
  return flowmarkDraftState;
}

function flowmarkPersistDraft() {
  clearTimeout(flowmarkDraftState.saveTimer);
  flowmarkDraftState.saveTimer = setTimeout(() => {
    void setFlowmapMeta(flowmarkDraftMetaKey(), {
      text: flowmarkDraftState.text,
      baseHash: flowmarkDraftState.baseHash,
      dirty: flowmarkDraftState.dirty,
      updatedAt: new Date().toISOString()
    });
  }, 180);
}

function flowmarkFindFreePosition(index, phase, group) {
  const baseX = group ? group.x + 28 : (phase?.x || 40) + 40;
  const baseY = group ? group.y + 68 : (phase?.y || 40) + 90;
  const column = Math.floor(index / 8);
  const row = index % 8;
  return { x: clamp(baseX + column * 270, 0, WORLD.width - 224), y: clamp(baseY + row * 132, 0, WORLD.height - 116) };
}

function reconcileFlowmarkAst(ast) {
  const existingPhasesByKey = new Map(state.phases.flatMap((item) => [[flowmarkEntityKey(item, 'phase'), item], [item.id, item]]));
  const existingGroupsByKey = new Map(state.groups.flatMap((item) => [[flowmarkEntityKey(item, 'group'), item], [item.id, item]]));
  const existingNotesByKey = new Map(state.notes.flatMap((item) => [[flowmarkEntityKey(item, 'note'), item], [item.id, item]]));
  const phaseMap = new Map();
  const groupMap = new Map();
  const noteMap = new Map();

  const nextPhases = ast.phases.map((entry, index) => {
    let item = existingPhasesByKey.get(entry.key) || state.phases.find((candidate) => candidate.title === entry.title);
    if (!item) item = { id: uid('phase'), x: 40 + index * 760, y: 40, w: 700, h: 1250 };
    item.title = entry.title;
    item.notationKey = entry.key;
    item.outlineOrder = (index + 1) * 100;
    phaseMap.set(entry.key, item);
    return item;
  });

  const nextGroups = ast.groups.map((entry, index) => {
    const phase = phaseMap.get(entry.phaseKey);
    let item = existingGroupsByKey.get(entry.key) || state.groups.find((candidate) => candidate.title === entry.title && candidate.phaseId === phase?.id);
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
    let item = existingNotesByKey.get(entry.key) || state.notes.find((candidate) => candidate.title === entry.title && candidate.type === entry.type && candidate.phaseId === phase?.id && candidate.groupId === (group?.id || ''));
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

  state.phases = nextPhases;
  state.groups = nextGroups;
  state.notes = nextNotes;
  outlineRefreshParents(state);

  const previousEdges = new Map(state.edges.map((item) => [`${item.from}|${item.to}|${item.kind || 'sequence'}|${item.label || ''}`, item]));
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
}

outlineRefreshParents = function outlineRefreshParentsByContext(nextState = state) {
  const stacks = new Map();
  outlineSortedNotes(nextState).forEach((item) => {
    const context = `${item.phaseId || ''}|${item.groupId || ''}`;
    if (!stacks.has(context)) stacks.set(context, []);
    const stack = stacks.get(context);
    item.depth = clamp(Number.parseInt(item.depth, 10) || 0, 0, OUTLINE_MAX_DEPTH);
    if (item.depth > stack.length) item.depth = stack.length;
    stack.length = item.depth;
    item.parentId = item.depth > 0 ? stack[item.depth - 1]?.id || '' : '';
    stack[item.depth] = item;
  });
};

outlineSequencePairs = function outlineSequencePairsByHierarchy(nextState = state) {
  outlineRefreshParents(nextState);
  const notes = outlineSortedNotes(nextState);
  const pairs = [];
  const seen = new Set();
  const add = (from, to) => {
    if (!from || !to || from === to) return;
    const key = outlinePairKey(from, to);
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ from, to });
  };
  const siblingGroups = new Map();
  notes.forEach((item) => {
    const key = `${item.phaseId || ''}|${item.groupId || ''}|${item.parentId || ''}|${item.depth || 0}`;
    if (!siblingGroups.has(key)) siblingGroups.set(key, []);
    siblingGroups.get(key).push(item);
  });
  siblingGroups.forEach((siblings) => siblings.slice(1).forEach((item, index) => add(siblings[index].id, item.id)));
  notes.forEach((parent) => notes.filter((item) => item.parentId === parent.id).forEach((child) => add(parent.id, child.id)));
  return pairs;
};

function installFlowmarkWorkspace() {
  if (document.getElementById('outline-workspace')) return;
  const shell = document.createElement('section');
  shell.id = 'outline-workspace';
  shell.className = 'outline-workspace';
  shell.hidden = true;
  shell.innerHTML = `
    <header class="write-header">
      <div><span>WRITE</span><h1>工程を文章から組み立てる</h1></div>
      <div class="write-tabs" role="tablist">
        <button type="button" data-write-tab="tree">アウトライン</button>
        <button type="button" data-write-tab="notation">記法</button>
      </div>
      <div id="write-sync-status" class="write-sync-status">図と同期済み</div>
    </header>
    <div id="write-tree-panel" class="write-panel">
      <div class="write-tree-toolbar"><button type="button" data-write-add-phase>＋ フェーズ</button><span>Enterで追加・Tabで階層化・Alt＋↑↓で並べ替え</span></div>
      <div id="write-tree" class="write-tree"></div>
    </div>
    <div id="flowmark-panel" class="write-panel flowmark-panel" hidden>
      <div class="flowmark-toolbar"><div><strong>Flowmark</strong><span>Markdownに近い工程記法。入力中は図を変更しません。</span></div><button type="button" data-flowmark-reset>現在の図から再生成</button></div>
      <textarea id="flowmark-editor" spellcheck="false" aria-label="Flowmark記法"></textarea>
      <div id="flowmark-diagnostics" class="flowmark-diagnostics"></div>
      <footer><span id="flowmark-summary">変更はまだ適用されていません</span><button type="button" class="primary" data-flowmark-apply>図へ適用</button></footer>
    </div>`;
  els.workspace.append(shell);
}

function flowmarkNoteRow(item) {
  const outgoing = state.edges.filter((edgeItem) => edgeItem.from === item.id).length;
  return `<div class="write-note-row ${selection.type === 'note' && selection.id === item.id ? 'is-selected' : ''}" data-write-note="${item.id}" style="--write-depth:${item.depth || 0}">
    <span class="write-depth-line" aria-hidden="true"></span>
    <select data-write-type="${item.id}" aria-label="図形種類">${Object.entries(FLOWMARK_TYPE_LABELS).map(([type, label]) => `<option value="${type}" ${item.type === type ? 'selected' : ''}>${label}</option>`).join('')}</select>
    <textarea rows="1" data-write-title="${item.id}" aria-label="工程名">${esc(item.title)}</textarea>
    <span class="write-relation-count" title="接続数">→ ${outgoing}</span>
  </div>`;
}

function renderFlowmarkTree() {
  const container = document.getElementById('write-tree');
  if (!container) return;
  const notes = outlineSortedNotes();
  const phaseHtml = flowmarkOrderedPhases().map((phase) => {
    const phaseCollapsed = flowmarkCollapsedPhases.has(phase.id);
    const groups = flowmarkOrderedGroups(phase.id);
    const groupHtml = groups.map((group) => {
      const groupCollapsed = flowmarkCollapsedGroups.has(group.id);
      const groupNotes = notes.filter((item) => item.phaseId === phase.id && item.groupId === group.id);
      return `<section class="write-group ${groupCollapsed ? 'is-collapsed' : ''}" data-write-group="${group.id}">
        <header><button type="button" data-write-collapse-group="${group.id}" aria-label="囲みを折りたたむ">${groupCollapsed ? '▸' : '▾'}</button><input data-write-group-title="${group.id}" value="${esc(group.title)}"><button type="button" data-write-add-note="${group.id}">＋ 工程</button></header>
        <div class="write-note-list">${groupCollapsed ? '' : groupNotes.map(flowmarkNoteRow).join('')}</div>
      </section>`;
    }).join('');
    const looseNotes = notes.filter((item) => item.phaseId === phase.id && !item.groupId);
    return `<section class="write-phase ${phaseCollapsed ? 'is-collapsed' : ''}" data-write-phase="${phase.id}">
      <header><button type="button" data-write-collapse-phase="${phase.id}" aria-label="フェーズを折りたたむ">${phaseCollapsed ? '▸' : '▾'}</button><input data-write-phase-title="${phase.id}" value="${esc(phase.title)}"><button type="button" data-write-add-group="${phase.id}">＋ 囲み</button><button type="button" data-write-add-loose-note="${phase.id}">＋ 工程</button></header>
      ${phaseCollapsed ? '' : `<div class="write-phase-body">${groupHtml}${looseNotes.length ? `<section class="write-group is-loose"><header><strong>フェーズ直下</strong></header><div class="write-note-list">${looseNotes.map(flowmarkNoteRow).join('')}</div></section>` : ''}</div>`}
    </section>`;
  }).join('');
  container.innerHTML = phaseHtml || '<div class="write-empty"><strong>工程はまだありません</strong><button type="button" data-write-add-phase>最初のフェーズを作る</button></div>';
  requestAnimationFrame(() => container.querySelectorAll('textarea').forEach(outlineResizeTextarea));
}

function renderFlowmarkDiagnostics() {
  const container = document.getElementById('flowmark-diagnostics');
  const summary = document.getElementById('flowmark-summary');
  if (!container || !summary) return;
  const result = flowmarkDraftState.parseResult || parseFlowmark(flowmarkDraftState.text);
  const errors = result.diagnostics.filter((item) => item.severity === 'error');
  const warnings = result.diagnostics.filter((item) => item.severity === 'warning');
  container.innerHTML = result.diagnostics.length ? result.diagnostics.map((item) => `<button type="button" data-flowmark-line="${item.line}" class="is-${item.severity}"><b>${item.severity === 'error' ? 'エラー' : '注意'}</b><span>${item.line}行目：${esc(item.message)}</span></button>`).join('') : '<span class="flowmark-ok">構文に問題はありません</span>';
  summary.textContent = errors.length ? `${errors.length}件のエラーを修正してください` : warnings.length ? `${warnings.length}件の注意があります。適用できます` : flowmarkDraftState.dirty ? '変更はまだ図へ適用されていません' : '図と同期済み';
  document.querySelector('[data-flowmark-apply]')?.toggleAttribute('disabled', errors.length > 0);
}

function renderFlowmarkNotation() {
  const editor = document.getElementById('flowmark-editor');
  if (!editor) return;
  if (editor.value !== flowmarkDraftState.text) editor.value = flowmarkDraftState.text;
  const currentHash = flowmarkHash(flowmarkStructuralProjection());
  const status = document.getElementById('write-sync-status');
  if (status) {
    const conflict = flowmarkDraftState.dirty && flowmarkDraftState.baseHash && currentHash !== flowmarkDraftState.baseHash;
    status.textContent = conflict ? '図側にも変更があります' : flowmarkDraftState.dirty ? '記法に未適用の変更あり' : '図と同期済み';
    status.classList.toggle('is-warning', conflict || flowmarkDraftState.dirty);
  }
  renderFlowmarkDiagnostics();
}

function renderFlowmarkWorkspace() {
  installFlowmarkWorkspace();
  const shell = document.getElementById('outline-workspace');
  if (!shell) return;
  const visible = currentFlowMode() === 'outline';
  shell.hidden = !visible;
  if (!visible) return;
  const tab = state.settings.writeTab === 'notation' ? 'notation' : 'tree';
  document.querySelectorAll('[data-write-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.writeTab === tab));
  document.getElementById('write-tree-panel').hidden = tab !== 'tree';
  document.getElementById('flowmark-panel').hidden = tab !== 'notation';
  if (tab === 'tree') {
    renderFlowmarkTree();
    const status = document.getElementById('write-sync-status');
    if (status) { status.textContent = '図へ即時同期'; status.classList.remove('is-warning'); }
  } else {
    void flowmarkLoadDraft();
    renderFlowmarkNotation();
  }
}

function flowmarkApplyDraft() {
  const result = parseFlowmark(flowmarkDraftState.text);
  flowmarkDraftState.parseResult = result;
  const errors = result.diagnostics.filter((item) => item.severity === 'error');
  if (errors.length) {
    renderFlowmarkDiagnostics();
    toast(`${errors.length}件の記法エラーがあります`);
    return;
  }
  mutate('記法を図へ適用', () => reconcileFlowmarkAst(result.ast));
  flowmarkDraftState.text = serializeFlowmark();
  flowmarkDraftState.baseHash = flowmarkHash(flowmarkStructuralProjection());
  flowmarkDraftState.dirty = false;
  flowmarkDraftState.parseResult = parseFlowmark(flowmarkDraftState.text);
  void setFlowmapMeta(flowmarkDraftMetaKey(), {
    text: flowmarkDraftState.text, baseHash: flowmarkDraftState.baseHash, dirty: false, updatedAt: new Date().toISOString()
  });
  renderFlowmarkNotation();
  toast('記法を図へ適用しました');
}

function flowmarkAddPhase() {
  mutate('フェーズを追加', () => {
    const index = state.phases.length;
    const phase = { id: uid('phase'), title: '新しいフェーズ', x: 40 + index * 750, y: 40, w: 700, h: 1250, outlineOrder: (index + 1) * 100 };
    state.phases.push(phase);
    selection = { type: 'phase', id: phase.id };
  });
}

function flowmarkAddGroup(phaseId) {
  const phase = getPhase(phaseId);
  if (!phase) return;
  mutate('囲みを追加', () => {
    const siblings = state.groups.filter((item) => item.phaseId === phaseId);
    const group = { id: uid('group'), phaseId, title: '新しい囲み', x: phase.x + 40, y: phase.y + 100 + siblings.length * 330, w: 600, h: 290, color: 'gray', collapsed: false, outlineOrder: (siblings.length + 1) * 100 };
    state.groups.push(group);
    selection = { type: 'group', id: group.id };
  });
}

function flowmarkAddNoteToContext(phaseId, groupId = '') {
  const ordered = outlineSortedNotes();
  const contextNotes = ordered.filter((item) => item.phaseId === phaseId && item.groupId === groupId);
  const after = contextNotes.at(-1)?.id || ordered.at(-1)?.id || null;
  const created = outlineCreateAfter(after);
  if (!created) return;
  created.phaseId = phaseId;
  created.groupId = groupId;
  saveState();
  renderAll();
}

function bindFlowmarkWorkspace() {
  if (flowmarkWorkspaceBound) return;
  flowmarkWorkspaceBound = true;
  installFlowmarkWorkspace();
  const shell = document.getElementById('outline-workspace');
  shell.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-write-tab]');
    if (tab) {
      state.settings.writeTab = tab.dataset.writeTab === 'notation' ? 'notation' : 'tree';
      saveState();
      renderFlowmarkWorkspace();
      return;
    }
    if (event.target.closest('[data-write-add-phase]')) return flowmarkAddPhase();
    const addGroup = event.target.closest('[data-write-add-group]');
    if (addGroup) return flowmarkAddGroup(addGroup.dataset.writeAddGroup);
    const addNote = event.target.closest('[data-write-add-note]');
    if (addNote) return flowmarkAddNoteToContext(getGroup(addNote.dataset.writeAddNote)?.phaseId || '', addNote.dataset.writeAddNote);
    const addLoose = event.target.closest('[data-write-add-loose-note]');
    if (addLoose) return flowmarkAddNoteToContext(addLoose.dataset.writeAddLooseNote, '');
    const collapsePhase = event.target.closest('[data-write-collapse-phase]');
    if (collapsePhase) {
      const id = collapsePhase.dataset.writeCollapsePhase;
      if (flowmarkCollapsedPhases.has(id)) flowmarkCollapsedPhases.delete(id); else flowmarkCollapsedPhases.add(id);
      return renderFlowmarkTree();
    }
    const collapseGroup = event.target.closest('[data-write-collapse-group]');
    if (collapseGroup) {
      const id = collapseGroup.dataset.writeCollapseGroup;
      if (flowmarkCollapsedGroups.has(id)) flowmarkCollapsedGroups.delete(id); else flowmarkCollapsedGroups.add(id);
      return renderFlowmarkTree();
    }
    if (event.target.closest('[data-flowmark-reset]')) {
      flowmarkDraftState.text = serializeFlowmark();
      flowmarkDraftState.baseHash = flowmarkHash(flowmarkStructuralProjection());
      flowmarkDraftState.dirty = false;
      flowmarkDraftState.parseResult = parseFlowmark(flowmarkDraftState.text);
      flowmarkPersistDraft();
      return renderFlowmarkNotation();
    }
    if (event.target.closest('[data-flowmark-apply]')) return flowmarkApplyDraft();
    const diagnostic = event.target.closest('[data-flowmark-line]');
    if (diagnostic) {
      const editor = document.getElementById('flowmark-editor');
      const line = Number(diagnostic.dataset.flowmarkLine) || 1;
      const lines = editor.value.split('\n');
      const offset = lines.slice(0, line - 1).reduce((sum, value) => sum + value.length + 1, 0);
      editor.focus();
      editor.setSelectionRange(offset, offset + (lines[line - 1]?.length || 0));
    }
  });

  shell.addEventListener('input', (event) => {
    if (event.target.id === 'flowmark-editor') {
      flowmarkDraftState.text = event.target.value;
      flowmarkDraftState.dirty = true;
      flowmarkDraftState.parseResult = parseFlowmark(flowmarkDraftState.text);
      flowmarkPersistDraft();
      renderFlowmarkDiagnostics();
      const status = document.getElementById('write-sync-status');
      if (status) { status.textContent = '記法に未適用の変更あり'; status.classList.add('is-warning'); }
      return;
    }
    const noteTitle = event.target.closest('[data-write-title]');
    if (noteTitle) {
      const item = getNote(noteTitle.dataset.writeTitle);
      if (!item) return;
      item.title = noteTitle.value;
      item.updatedAt = new Date().toISOString();
      outlineResizeTextarea(noteTitle);
      outlineScheduleSave();
      renderNotes();
    }
  });

  shell.addEventListener('change', (event) => {
    const phaseTitle = event.target.closest('[data-write-phase-title]');
    if (phaseTitle) return mutate('フェーズ名を変更', () => { getPhase(phaseTitle.dataset.writePhaseTitle).title = phaseTitle.value.trim() || '無題のフェーズ'; });
    const groupTitle = event.target.closest('[data-write-group-title]');
    if (groupTitle) return mutate('囲み名を変更', () => { getGroup(groupTitle.dataset.writeGroupTitle).title = groupTitle.value.trim() || '無題の囲み'; });
    const type = event.target.closest('[data-write-type]');
    if (type) return mutate('図形種類を変更', () => { const item = getNote(type.dataset.writeType); if (item) item.type = FLOWMARK_TYPES.has(type.value) ? type.value : 'process'; }, type.dataset.writeType);
    const noteTitle = event.target.closest('[data-write-title]');
    if (noteTitle) {
      const item = getNote(noteTitle.dataset.writeTitle);
      if (!item) return;
      item.title = noteTitle.value.trim() || '無題の処理';
      recordActivity('アウトラインで工程名を変更', item.id);
      saveState();
      renderAll();
    }
  });

  shell.addEventListener('focusin', (event) => {
    const title = event.target.closest('[data-write-title]');
    if (!title) return;
    outlineSelectWithoutRerender(title.dataset.writeTitle);
  });

  shell.addEventListener('keydown', (event) => {
    const input = event.target.closest('[data-write-title]');
    if (!input) return;
    const noteId = input.dataset.writeTitle;
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); outlineCreateAfter(noteId); return; }
    if (event.key === 'Tab') { event.preventDefault(); outlineChangeDepth(noteId, event.shiftKey ? -1 : 1); return; }
    if (event.key === 'Backspace' && !input.value.trim()) { event.preventDefault(); outlineDeleteNote(noteId); return; }
    if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const ids = outlineSortedNotes().map((item) => item.id);
      const index = ids.indexOf(noteId);
      const next = clamp(index + (event.key === 'ArrowUp' ? -1 : 1), 0, ids.length - 1);
      if (next === index) return;
      ids.splice(index, 1);
      ids.splice(next, 0, noteId);
      outlineCommitOrder(ids, noteId);
    }
  });
}

registerFlowmapMode('outline', {
  enter() {
    installFlowmarkWorkspace();
    renderFlowmarkWorkspace();
    if (state.settings.writeTab === 'notation') void flowmarkLoadDraft({ force: true });
  }
});

const updateFlowExperienceUiBeforeFlowmarkWorkspace = updateFlowExperienceUi;
updateFlowExperienceUi = function updateFlowExperienceUiFlowmarkWorkspace() {
  updateFlowExperienceUiBeforeFlowmarkWorkspace();
  renderFlowmarkWorkspace();
};

const bindEventsBeforeFlowmarkWorkspace = bindEvents;
bindEvents = function bindEventsFlowmarkWorkspace() {
  bindEventsBeforeFlowmarkWorkspace();
  bindFlowmarkWorkspace();
};
