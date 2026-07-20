/* Flowmap v0.19.0 — safer hierarchy inference, durable drafts and in-app guidance */
outlineSequencePairs = function outlineSequencePairsFlowmarkPolish(nextState = state) {
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

  const topLevelContexts = new Map();
  notes.filter((item) => !item.parentId && Number(item.depth || 0) === 0).forEach((item) => {
    const key = `${item.phaseId || ''}|${item.groupId || ''}`;
    if (!topLevelContexts.has(key)) topLevelContexts.set(key, []);
    topLevelContexts.get(key).push(item);
  });
  topLevelContexts.forEach((siblings) => siblings.slice(1).forEach((item, index) => add(siblings[index].id, item.id)));
  notes.forEach((parent) => notes.filter((item) => item.parentId === parent.id).forEach((child) => add(parent.id, child.id)));
  return pairs;
};

serializeFlowmark = function serializeFlowmarkPolish(nextState = state) {
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
      status: item.status && item.status !== 'todo' ? item.status : '',
      due: item.due,
      assignee: item.assignee,
      tags: Array.isArray(item.tags) ? item.tags.join(', ') : item.tags,
      summary: item.summary,
      location: item.location,
      link: item.link,
      note: item.note
    };
    Object.entries({ ...metadata, ...(item.flowmarkMeta || {}) }).forEach(([key, value]) => {
      if (value === undefined || value === null || String(value).trim() === '') return;
      lines.push(`${indent}  :: ${key} = ${flowmarkEscapeValue(value)}`);
    });
    nextState.edges
      .filter((edgeItem) => edgeItem.from === item.id && (edgeItem.source !== 'auto' || edgeItem.kind !== 'sequence' || edgeItem.label))
      .forEach((edgeItem) => {
        const targetKey = noteKeyMap.get(edgeItem.to);
        if (!targetKey) return;
        const operator = edgeItem.kind === 'merge' ? '=>' : edgeItem.kind === 'reference' ? '~>' : '->';
        const label = edgeItem.label ? ` [${edgeItem.label}]` : '';
        lines.push(`${indent}  ${operator}${label} @${targetKey}`);
      });
  };

  flowmarkOrderedPhases().forEach((phase) => {
    lines.push(`# ${phase.title || '無題のフェーズ'} @${flowmarkEntityKey(phase, 'phase')}`, '');
    orderedNotes.filter((item) => item.phaseId === phase.id && !item.groupId).forEach(writeNode);
    if (orderedNotes.some((item) => item.phaseId === phase.id && !item.groupId)) lines.push('');
    flowmarkOrderedGroups(phase.id).forEach((group) => {
      lines.push(`## ${group.title || '無題の囲み'} @${flowmarkEntityKey(group, 'group')}`, '');
      orderedNotes.filter((item) => item.phaseId === phase.id && item.groupId === group.id).forEach(writeNode);
      lines.push('');
    });
    lines.push('');
  });

  const unassigned = orderedNotes.filter((item) => !nextState.phases.some((phase) => phase.id === item.phaseId));
  if (unassigned.length) {
    lines.push('# 未分類 @phase-unassigned', '');
    unassigned.forEach(writeNode);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
};

flowmarkLoadDraft = async function flowmarkLoadDraftPolish({ force = false } = {}) {
  const boardId = getActiveBoardInfo?.().id || activeBoardId || 'current';
  if (!force && flowmarkDraftState.boardId === boardId && flowmarkDraftState.parseResult) return flowmarkDraftState;
  const saved = await getFlowmapMeta(flowmarkDraftMetaKey()).catch(() => null);
  const hasSavedText = saved && typeof saved.text === 'string';
  const text = hasSavedText ? saved.text : serializeFlowmark();
  flowmarkDraftState = {
    boardId,
    text,
    baseHash: saved?.baseHash || flowmarkHash(flowmarkStructuralProjection()),
    dirty: Boolean(saved?.dirty),
    parseResult: parseFlowmark(text),
    saveTimer: null
  };
  renderFlowmarkNotation();
  return flowmarkDraftState;
};

function restorePresentationSessionIfNeeded() {
  if (currentFlowMode() !== 'present' || presentationV2.sequence.length || !state.notes.length) return;
  presentationV2.sequence = presentationBuildSequence();
  const selectedIndex = selection.type === 'note' ? presentationV2.sequence.indexOf(selection.id) : -1;
  presentationV2.index = selectedIndex >= 0 ? selectedIndex : 0;
  presentationV2.showingAll = false;
  const item = presentationCurrentNote();
  presentationRenderUi();
  requestAnimationFrame(() => item ? fitView(item.id) : fitView());
}

function installWritingHelp() {
  const grid = els['help-dialog']?.querySelector('.shortcut-grid');
  if (!grid || grid.querySelector('[data-shortcut="writing-mode"]')) return;
  grid.insertAdjacentHTML('beforeend', `
    <div data-shortcut="writing-mode"><kbd>書く</kbd><span>全面アウトラインで工程・フェーズ・囲みを編集</span></div>
    <div data-shortcut="flowmark"><kbd>Flowmark → 図へ適用</kbd><span>記法の変更を一括反映。Ctrl／Cmd＋Zでまとめて戻す</span></div>
    <div data-shortcut="presentation-v2"><kbd>見せる ←／→・Space</kbd><span>工程を戻る・進む。Spaceで自動再生</span></div>`);
}

const updateFlowExperienceUiBeforeFlowmarkPolish = updateFlowExperienceUi;
updateFlowExperienceUi = function updateFlowExperienceUiFlowmarkPolish() {
  updateFlowExperienceUiBeforeFlowmarkPolish();
  installWritingHelp();
  restorePresentationSessionIfNeeded();
  const badge = document.querySelector('.version-badge');
  if (badge) badge.textContent = 'v0.19.0';
};
