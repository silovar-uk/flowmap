/* Flowmap v0.19.0 — safer hierarchy inference and in-app guidance */
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
  const badge = document.querySelector('.version-badge');
  if (badge) badge.textContent = 'v0.19.0';
};
