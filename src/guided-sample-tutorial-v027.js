/* Flowmap v0.27.0 — guided sample-case tutorial */
'use strict';

const FLOWMAP_GUIDED_VERSION = '0.27.0';
const FLOWMAP_GUIDED_TITLES = {
  first: '開催概要を決める',
  second: '告知文を作る',
  third: '公開前に確認する',
  phase: '公開後',
  group: '公開後の確認',
  checklist: '掲載先を確認'
};
const FLOWMAP_GUIDED_IDS = {
  phase: 'tutorial_phase_prepare',
  group: 'tutorial_group_prepare'
};

let guidedTutorialPoll = null;
let guidedTutorialSatisfied = false;
let guidedPdfViewed = false;
let guidedTutorialBound = false;

function guidedFindNote(title) {
  return state.notes.find((item) => String(item.title || '').trim() === title) || null;
}

function guidedFindPhase() {
  return state.phases.find((item) => item.id !== FLOWMAP_GUIDED_IDS.phase && String(item.title || '').trim() === FLOWMAP_GUIDED_TITLES.phase)
    || state.phases.find((item) => item.id !== FLOWMAP_GUIDED_IDS.phase)
    || null;
}

function guidedFindGroup() {
  return state.groups.find((item) => item.id !== FLOWMAP_GUIDED_IDS.group && String(item.title || '').trim() === FLOWMAP_GUIDED_TITLES.group)
    || state.groups.find((item) => item.id !== FLOWMAP_GUIDED_IDS.group)
    || null;
}

function guidedHasEdge(fromTitle, toTitle) {
  const from = guidedFindNote(fromTitle);
  const to = guidedFindNote(toTitle);
  return Boolean(from && to && state.edges.some((item) => item.from === from.id && item.to === to.id));
}

function guidedStarterState() {
  const now = new Date().toISOString();
  return normalizeFlowchartState({
    version: 7,
    phases: [{ id: FLOWMAP_GUIDED_IDS.phase, title: '準備', x: 40, y: 40, w: 700, h: 1250 }],
    groups: [{ id: FLOWMAP_GUIDED_IDS.group, phaseId: FLOWMAP_GUIDED_IDS.phase, title: '告知準備', x: 90, y: 120, w: 600, h: 1060, color: 'blue', collapsed: false }],
    notes: [],
    edges: [],
    viewport: { x: 20, y: 20, scale: .78 },
    activity: [{ id: uid('activity'), at: now, label: '実践チュートリアルを開始', noteId: null }],
    settings: { grid: true, navigatorOpen: false, inspectorOpen: false, viewMode: 'build' }
  });
}

function guidedInstallCardUi() {
  const card = document.getElementById('tutorial-card');
  if (!card || card.dataset.guidedInstalled === 'true') return;
  card.dataset.guidedInstalled = 'true';
  const progress = card.querySelector('.tutorial-progress');
  progress?.insertAdjacentHTML('afterend', `<div class="guided-scenario"><span>SAMPLE CASE</span><strong>イベント告知を公開する</strong><small>約5分・練習内容は保存されません</small></div>`);
  const copy = document.getElementById('tutorial-copy');
  copy?.insertAdjacentHTML('afterend', `<section id="guided-task" class="guided-task"><div><span>今回やること</span><strong id="guided-task-title"></strong></div><p id="guided-task-hint"></p><div class="guided-task-footer"><span id="guided-task-state">操作待ち</span><button id="guided-preview-button" type="button" hidden>完成形をPDFで確認</button></div></section><div class="guided-progress-track" aria-hidden="true"><i id="guided-progress-bar"></i></div>`);
  const skip = document.getElementById('tutorial-skip');
  if (skip) skip.textContent = '練習を終了';
}

function guidedVisibleElement(selector) {
  return [...document.querySelectorAll(selector)].find((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }) || null;
}

function guidedNoteTarget(title, side = null) {
  const item = guidedFindNote(title);
  if (!item) return null;
  const card = document.querySelector(`[data-note-id="${item.id}"]`);
  if (!side) return card;
  return card?.querySelector(`.grow-${side}`) || card;
}

function guidedSelectNote(title, tab = 'detail', fit = false) {
  const item = guidedFindNote(title);
  if (!item) return;
  selection = { type: 'note', id: item.id };
  if (typeof selectedNoteIds !== 'undefined') selectedNoteIds = new Set([item.id]);
  state.settings.inspectorOpen = tab !== 'closed';
  if (tab !== 'closed') activeTab = tab;
  renderAll();
  if (fit) requestAnimationFrame(() => fitView(item.id));
}

function guidedSelectPhase() {
  const phase = guidedFindPhase();
  if (!phase) return;
  selection = { type: 'phase', id: phase.id };
  state.settings.inspectorOpen = true;
  renderAll();
}

function guidedSelectGroup() {
  const group = guidedFindGroup();
  if (!group) return;
  selection = { type: 'group', id: group.id };
  state.settings.inspectorOpen = true;
  renderAll();
}

function guidedCenterPhase(phase) {
  if (!phase || !els.stage) return;
  const rect = els.stage.getBoundingClientRect();
  const scale = clamp(Math.min((rect.width - 150) / phase.w, (rect.height - 150) / phase.h), .42, 1.05);
  state.viewport.scale = scale;
  state.viewport.x = rect.width / 2 - (phase.x + phase.w / 2) * scale;
  state.viewport.y = rect.height / 2 - (phase.y + phase.h / 2) * scale;
  state.settings.inspectorOpen = false;
  renderAll();
}

function guidedPhaseAddTarget() {
  const top = guidedVisibleElement('#add-phase');
  if (top) return top;
  state.settings.navigatorOpen = true;
  renderAll();
  return guidedVisibleElement('#nav-add-phase') || document.getElementById('board');
}

const GUIDED_TUTORIAL_STEPS = [
  {
    title: 'まず、完成形をイメージする',
    body: '「イベント告知を公開する」という小さな仕事を、実際にフローへします。普段のボードは退避され、終了すると元に戻ります。',
    task: '3つの工程をつなぎ、担当・期限・チェック・フェーズまで設定する',
    hint: '間違えても大丈夫です。この練習中の変更は保存されません。',
    target: () => document.getElementById('board'),
    prepare: () => { state.settings.inspectorOpen = false; renderAll(); requestAnimationFrame(() => fitView()); }
  },
  {
    title: '1. 最初の工程を作る',
    body: '「＋処理」を押し、表示された入力欄へ工程名を入れます。',
    task: `「${FLOWMAP_GUIDED_TITLES.first}」を作る`,
    hint: '文字を入力したら Enter で確定します。',
    target: () => document.querySelector('.inline-title-editor') || document.getElementById('add-note'),
    check: () => Boolean(guidedFindNote(FLOWMAP_GUIDED_TITLES.first))
  },
  {
    title: '2. 次の工程をつないで作る',
    body: '選択中の工程に出る下向きの「＋」を押すと、矢印でつながった次工程を作れます。',
    task: `「${FLOWMAP_GUIDED_TITLES.second}」を下へ追加する`,
    hint: '最初の工程を選び、カード下側の「＋ ↓」を使います。',
    prepare: () => guidedSelectNote(FLOWMAP_GUIDED_TITLES.first, 'closed', true),
    target: () => document.querySelector('.inline-title-editor') || guidedNoteTarget(FLOWMAP_GUIDED_TITLES.first, 'bottom'),
    check: () => Boolean(guidedFindNote(FLOWMAP_GUIDED_TITLES.second) && guidedHasEdge(FLOWMAP_GUIDED_TITLES.first, FLOWMAP_GUIDED_TITLES.second))
  },
  {
    title: '3. 確認工程までつなぐ',
    body: '同じ操作でもう一つ工程を増やし、公開前の確認まで流れを完成させます。',
    task: `「${FLOWMAP_GUIDED_TITLES.third}」を下へ追加する`,
    hint: '「告知文を作る」を選び、下側の「＋ ↓」を使います。',
    prepare: () => guidedSelectNote(FLOWMAP_GUIDED_TITLES.second, 'closed', true),
    target: () => document.querySelector('.inline-title-editor') || guidedNoteTarget(FLOWMAP_GUIDED_TITLES.second, 'bottom'),
    check: () => Boolean(guidedFindNote(FLOWMAP_GUIDED_TITLES.third) && guidedHasEdge(FLOWMAP_GUIDED_TITLES.second, FLOWMAP_GUIDED_TITLES.third))
  },
  {
    title: '4. 進行中の工程を示す',
    body: '付箋を選ぶと右側に詳細が開きます。状態を変えると、進捗確認にも使えるようになります。',
    task: '「告知文を作る」の状態を「対応中」にする',
    hint: '右側上部の状態欄を変更します。',
    prepare: () => guidedSelectNote(FLOWMAP_GUIDED_TITLES.second, 'detail', true),
    target: () => document.getElementById('field-status'),
    check: () => guidedFindNote(FLOWMAP_GUIDED_TITLES.second)?.status === 'doing'
  },
  {
    title: '5. 誰が、いつまでにやるかを入れる',
    body: '工程に担当と期限を入れると、フローがそのまま実務の確認表になります。',
    task: '担当を「広報」にし、期限を1日選ぶ',
    hint: '期限は練習なので、今日以降の好きな日で構いません。',
    prepare: () => guidedSelectNote(FLOWMAP_GUIDED_TITLES.second, 'detail', false),
    target: () => document.getElementById('node-inspector'),
    check: () => {
      const item = guidedFindNote(FLOWMAP_GUIDED_TITLES.second);
      return Boolean(item && item.assignee.trim() === '広報' && item.due);
    }
  },
  {
    title: '6. 抜け漏れ防止のチェックを作る',
    body: 'チェックタブでは、工程の中で確認すべき項目を持てます。',
    task: `チェック項目「${FLOWMAP_GUIDED_TITLES.checklist}」を追加する`,
    hint: '「＋ チェックを追加」を押し、「新しいチェック」を書き換えます。',
    prepare: () => guidedSelectNote(FLOWMAP_GUIDED_TITLES.second, 'checklist', false),
    target: () => document.querySelector('#checklist-editor input[type="text"]') || document.getElementById('add-check-item'),
    check: () => guidedFindNote(FLOWMAP_GUIDED_TITLES.second)?.checklist.some((item) => item.text.trim() === FLOWMAP_GUIDED_TITLES.checklist) === true
  },
  {
    title: '7. 次の段階をフェーズで分ける',
    body: '仕事の大きな段階はフェーズで分けます。ここでは、公開後の作業を置く場所を作ります。',
    task: '「＋フェーズ」で2つ目のフェーズを追加する',
    hint: '追加直後は「新しいフェーズ」という名前で作られます。',
    prepare: () => { state.settings.inspectorOpen = false; renderAll(); requestAnimationFrame(() => fitView()); },
    target: guidedPhaseAddTarget,
    check: () => state.phases.length >= 2
  },
  {
    title: '8. フェーズ名を具体的にする',
    body: '名前を具体的にすると、初めて見る人でも仕事の区切りを理解できます。',
    task: `新しいフェーズを「${FLOWMAP_GUIDED_TITLES.phase}」へ変更する`,
    hint: '右側の「フェーズ名」を書き換え、欄の外を押して確定します。',
    prepare: guidedSelectPhase,
    target: () => document.getElementById('phase-title-field'),
    check: () => state.phases.some((item) => item.id !== FLOWMAP_GUIDED_IDS.phase && item.title.trim() === FLOWMAP_GUIDED_TITLES.phase)
  },
  {
    title: '9. フェーズの中に囲みを作る',
    body: '囲みは、同じ担当や目的を持つ工程をひとまとまりにするために使います。',
    task: '「公開後」フェーズへ新しい囲みを追加する',
    hint: '画面は「公開後」フェーズの中央へ移動しています。上の「囲み」を押します。',
    prepare: () => guidedCenterPhase(guidedFindPhase()),
    target: () => document.getElementById('add-group'),
    check: () => {
      const phase = guidedFindPhase();
      return Boolean(phase && state.groups.some((item) => item.id !== FLOWMAP_GUIDED_IDS.group && item.phaseId === phase.id));
    }
  },
  {
    title: '10. 囲みの役割を示す',
    body: '囲み名は「何をまとめた場所か」が分かる言葉にします。',
    task: `新しい囲みを「${FLOWMAP_GUIDED_TITLES.group}」へ変更する`,
    hint: '右側の「囲みの名前」を書き換え、欄の外を押して確定します。',
    prepare: guidedSelectGroup,
    target: () => document.getElementById('group-title-field'),
    check: () => state.groups.some((item) => item.id !== FLOWMAP_GUIDED_IDS.group && item.title.trim() === FLOWMAP_GUIDED_TITLES.group)
  },
  {
    title: '11. 工程の所属を変更する',
    body: '工程は右側の選択欄から、別のフェーズや囲みへ移せます。最後の確認工程を公開後へ移します。',
    task: '「公開前に確認する」を「公開後」→「公開後の確認」へ所属させる',
    hint: '先にフェーズを選ぶと、その中の囲みを選べるようになります。',
    prepare: () => guidedSelectNote(FLOWMAP_GUIDED_TITLES.third, 'detail', true),
    target: () => {
      const item = guidedFindNote(FLOWMAP_GUIDED_TITLES.third);
      const phase = guidedFindPhase();
      return item?.phaseId === phase?.id ? document.getElementById('field-group') : document.getElementById('field-phase');
    },
    check: () => {
      const item = guidedFindNote(FLOWMAP_GUIDED_TITLES.third);
      const phase = guidedFindPhase();
      const group = guidedFindGroup();
      return Boolean(item && phase && group && item.phaseId === phase.id && item.groupId === group.id);
    }
  },
  {
    title: '12. PDFプレビューで完成形を確認する',
    body: '最後に、作ったマップが共有資料としてどう見えるかをプレビューします。',
    task: '下のボタンからPDFプレビューを開き、一度閉じる',
    hint: '実際の印刷や保存は行いません。見え方を確認したら×で閉じます。',
    target: () => document.getElementById('guided-preview-button') || document.getElementById('tutorial-card'),
    prepare: () => { guidedPdfViewed = false; },
    previewButton: true,
    check: () => guidedPdfViewed
  },
  {
    title: '完成です',
    body: '工程を作る、つなぐ、進捗を入れる、整理する、出力を確認するところまで一周できました。',
    task: '3工程・2接続・2フェーズ・2囲みのサンプルフローが完成',
    hint: '「練習を終了」を押すと、開始前のボードへ戻ります。',
    target: () => document.getElementById('board'),
    prepare: () => { state.settings.inspectorOpen = false; renderAll(); requestAnimationFrame(() => fitView()); },
    final: true
  }
];

FLOWMAP_TUTORIAL_STEPS.splice(0, FLOWMAP_TUTORIAL_STEPS.length, ...GUIDED_TUTORIAL_STEPS);

function guidedStepTarget(step) {
  const target = typeof step.target === 'function' ? step.target() : document.querySelector(step.selector || '');
  return target || document.getElementById('board');
}

function guidedRefreshTarget(step) {
  const nextTarget = guidedStepTarget(step);
  if (nextTarget === tutorialTarget) return;
  tutorialTarget?.classList.remove('tutorial-target');
  tutorialTarget = nextTarget;
  tutorialTarget?.classList.add('tutorial-target');
  requestAnimationFrame(positionTutorial);
}

function guidedRenderStepState(step) {
  const task = document.getElementById('guided-task');
  const stateLabel = document.getElementById('guided-task-state');
  const next = document.getElementById('tutorial-next');
  const preview = document.getElementById('guided-preview-button');
  const satisfied = typeof step.check === 'function' ? Boolean(step.check()) : true;
  guidedTutorialSatisfied = satisfied;
  task?.classList.toggle('is-complete', satisfied && typeof step.check === 'function');
  document.getElementById('tutorial-card')?.classList.toggle('is-step-complete', satisfied && typeof step.check === 'function');
  if (stateLabel) stateLabel.textContent = typeof step.check !== 'function' ? '準備OK' : satisfied ? 'できました' : '操作待ち';
  if (preview) preview.hidden = !step.previewButton;
  if (next) {
    next.disabled = !satisfied;
    next.textContent = step.final ? '練習を終了' : satisfied ? '次へ' : '操作すると進めます';
  }
}

function guidedPollStep() {
  if (!tutorialRunning) return;
  const step = FLOWMAP_TUTORIAL_STEPS[tutorialStepIndex];
  if (!step) return;
  guidedRefreshTarget(step);
  guidedRenderStepState(step);
  positionTutorial();
}

showTutorialStep = function showTutorialStepGuided(index) {
  guidedInstallCardUi();
  tutorialStepIndex = clamp(index, 0, FLOWMAP_TUTORIAL_STEPS.length - 1);
  const step = FLOWMAP_TUTORIAL_STEPS[tutorialStepIndex];
  tutorialTarget?.classList.remove('tutorial-target');
  tutorialTarget = null;
  if (typeof step.prepare === 'function') step.prepare();
  tutorialTarget = guidedStepTarget(step);
  tutorialTarget?.classList.add('tutorial-target');
  document.getElementById('tutorial-count').textContent = `${tutorialStepIndex + 1} / ${FLOWMAP_TUTORIAL_STEPS.length}`;
  document.getElementById('tutorial-title').textContent = step.title;
  document.getElementById('tutorial-copy').textContent = step.body;
  document.getElementById('guided-task-title').textContent = step.task || '';
  document.getElementById('guided-task-hint').textContent = step.hint || '';
  document.getElementById('tutorial-back').disabled = tutorialStepIndex === 0;
  const progress = document.getElementById('guided-progress-bar');
  if (progress) progress.style.width = `${FLOWMAP_TUTORIAL_STEPS.length > 1 ? tutorialStepIndex / (FLOWMAP_TUTORIAL_STEPS.length - 1) * 100 : 100}%`;
  guidedRenderStepState(step);
  clearInterval(guidedTutorialPoll);
  guidedTutorialPoll = setInterval(guidedPollStep, 260);
  requestAnimationFrame(positionTutorial);
};

startTutorial = function startTutorialGuided() {
  if (v12PracticeSession) return;
  guidedInstallCardUi();
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  document.querySelector('.inline-title-editor')?.blur();
  if (typeof v12CancelDraft === 'function') v12CancelDraft();
  if (typeof clearFlowFocus === 'function') clearFlowFocus({ render: false });
  v12PracticeSession = {
    state: clone(state),
    selection: clone(selection),
    undoStack: clone(undoStack),
    redoStack: clone(redoStack),
    activeTab
  };
  state = guidedStarterState();
  selection = { type: null, id: null };
  if (typeof selectedNoteIds !== 'undefined') selectedNoteIds = new Set();
  undoStack.length = 0;
  redoStack.length = 0;
  activeTab = 'detail';
  guidedPdfViewed = false;
  tutorialRunning = true;
  document.body.classList.add('is-guided-tutorial');
  document.getElementById('tutorial-layer').hidden = false;
  renderAll();
  v12UpdateHeader();
  showTutorialStep(0);
};

const finishTutorialBeforeGuided = finishTutorial;
finishTutorial = async function finishTutorialGuided() {
  clearInterval(guidedTutorialPoll);
  guidedTutorialPoll = null;
  guidedPdfViewed = false;
  document.body.classList.remove('is-guided-tutorial');
  document.querySelectorAll('#pdf-preview-dialog[open],#data-dialog[open]').forEach((dialog) => dialog.close());
  await finishTutorialBeforeGuided();
};

function guidedOpenPdfPreview() {
  if (typeof flowmapPdfOpenPreview !== 'function') {
    toast('PDFプレビューを開けませんでした');
    return;
  }
  const layer = document.getElementById('tutorial-layer');
  layer.hidden = true;
  flowmapPdfOpenPreview();
  const dialog = document.getElementById('pdf-preview-dialog');
  if (!dialog) {
    layer.hidden = false;
    return;
  }
  dialog.addEventListener('close', () => {
    guidedPdfViewed = true;
    if (tutorialRunning) {
      layer.hidden = false;
      guidedPollStep();
      requestAnimationFrame(positionTutorial);
    }
  }, { once: true });
}

function guidedBindEvents() {
  if (guidedTutorialBound) return;
  guidedTutorialBound = true;
  document.addEventListener('click', (event) => {
    if (!tutorialRunning) return;
    if (event.target.closest('#guided-preview-button')) {
      event.preventDefault();
      guidedOpenPdfPreview();
    }
  });
}

const v12InstallHeaderBeforeGuided = v12InstallHeader;
v12InstallHeader = function v12InstallHeaderGuided() {
  v12InstallHeaderBeforeGuided();
  const button = document.getElementById('tutorial-button');
  if (button) {
    button.title = 'サンプル案件を作りながら操作を練習する';
    const label = button.querySelector('.management-label');
    if (label) label.textContent = '練習';
  }
};

const v12UpdateHeaderBeforeGuided = v12UpdateHeader;
v12UpdateHeader = function v12UpdateHeaderGuided() {
  v12UpdateHeaderBeforeGuided();
  if (!v12PracticeSession) return;
  const label = document.getElementById('current-board-name');
  const button = document.getElementById('current-board-button');
  if (label) label.textContent = '実践練習：イベント告知';
  if (button) button.title = '練習中（普段のボードには保存されません）';
  document.title = '実践練習：イベント告知 — Flowmap';
};

if (typeof p0SetVersionBadge === 'function') {
  p0SetVersionBadge = function p0SetVersionBadgeV027() {
    const badge = document.querySelector('.version-badge');
    if (badge) badge.textContent = `v${FLOWMAP_GUIDED_VERSION}`;
  };
}

const bindWorkspaceManagementEventsBeforeGuided = bindWorkspaceManagementEvents;
bindWorkspaceManagementEvents = function bindWorkspaceManagementEventsGuided() {
  bindWorkspaceManagementEventsBeforeGuided();
  guidedBindEvents();
};
