/* Flowmap v0.10 — named boards, board list, destructive reset and guided tour */
let workspaceManagementInstalled = false;
let boardNameDialogContext = { mode: 'save', boardId: null };
let pendingConfirmAction = null;
let tutorialStepIndex = 0;
let tutorialRunning = false;
let tutorialTarget = null;

const FLOWMAP_TUTORIAL_STEPS = [
  {
    selector: '#add-note',
    title: '1. まず処理を置く',
    body: '「＋処理」で基本の長方形を追加します。「図形」から判断、開始／終了、入出力、書類も選べます。'
  },
  {
    selector: '#canvas-hint',
    title: '2. ボードを動かす',
    body: '図形がない空白をそのままドラッグすると、ボード全体を移動できます。ホイール操作で拡大・縮小します。'
  },
  {
    selector: '.sticky-note .connector-handle.port-right',
    fallback: '#stage',
    prepare: 'select-note',
    title: '3. 点から流れをつなぐ',
    body: '図形の上下左右に出る点をドラッグして接続します。空白へ離すと、接続済みの新しい処理ができます。'
  },
  {
    selector: '#inspector',
    prepare: 'open-inspector',
    title: '4. 補足情報を編集する',
    body: '図形を選ぶと右側で、種類、期限、担当、タグ、チェックリスト、メモ、履歴を編集できます。'
  },
  {
    selector: '#save-board-button',
    title: '5. 名前を付けて保存する',
    body: '編集内容は自動保存されます。「保存」ではボードに分かりやすい名前を付け、一覧で管理できる状態にします。'
  },
  {
    selector: '#board-list-button',
    title: '6. 保存したボードを一覧で管理する',
    body: '「一覧」から、ボードを開く、名前を変える、複製する、削除する、新しいボードを作る操作ができます。'
  }
];

function workspaceHtml() {
  return `
    <dialog id="board-name-dialog" class="app-dialog board-name-dialog">
      <form id="board-name-form" method="dialog">
        <header>
          <div><span>BOARD</span><h2 id="board-name-heading">ボードを保存</h2></div>
          <button value="cancel" aria-label="閉じる">×</button>
        </header>
        <div class="board-name-body">
          <p id="board-name-description">編集内容は自動保存されています。名前を付けると一覧から見つけやすくなります。</p>
          <label><span>ボード名</span><input id="board-name-input" type="text" maxlength="80" autocomplete="off" required></label>
        </div>
        <footer class="dialog-actions">
          <button class="button quiet" value="cancel" type="button" data-close-board-name>取消</button>
          <button id="board-name-submit" class="button primary" type="submit">保存</button>
        </footer>
      </form>
    </dialog>

    <dialog id="board-list-dialog" class="app-dialog board-list-dialog">
      <form method="dialog">
        <header>
          <div><span>BOARDS</span><h2>保存したボード</h2></div>
          <button value="cancel" aria-label="閉じる">×</button>
        </header>
        <div class="board-list-toolbar">
          <p>編集内容は各ボードへ自動保存されます。</p>
          <button id="new-board-button" class="button primary" type="button">＋ 新しいボード</button>
        </div>
        <div id="saved-board-list" class="saved-board-list" aria-live="polite"></div>
      </form>
    </dialog>

    <dialog id="confirm-action-dialog" class="app-dialog confirm-action-dialog">
      <form method="dialog">
        <header>
          <div><span>CONFIRM</span><h2 id="confirm-action-heading">確認</h2></div>
          <button value="cancel" aria-label="閉じる">×</button>
        </header>
        <div class="confirm-action-body">
          <p id="confirm-action-copy"></p>
          <p class="confirm-warning">この操作は元に戻せません。</p>
        </div>
        <footer class="dialog-actions">
          <button class="button quiet" value="cancel" type="button" data-cancel-confirm>取消</button>
          <button id="confirm-action-submit" class="danger-button" type="button">削除する</button>
        </footer>
      </form>
    </dialog>

    <div id="tutorial-layer" class="tutorial-layer" hidden>
      <div id="tutorial-spotlight" class="tutorial-spotlight"></div>
      <section id="tutorial-card" class="tutorial-card" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
        <div class="tutorial-progress"><span id="tutorial-count"></span><button id="tutorial-skip" type="button">終了</button></div>
        <h2 id="tutorial-title"></h2>
        <p id="tutorial-copy"></p>
        <div class="tutorial-actions">
          <button id="tutorial-back" class="button quiet" type="button">戻る</button>
          <button id="tutorial-next" class="button primary" type="button">次へ</button>
        </div>
      </section>
    </div>`;
}

function createManagementButton(id, icon, label, title) {
  const button = document.createElement('button');
  button.id = id;
  button.className = 'button quiet management-button';
  button.type = 'button';
  button.title = title;
  button.innerHTML = `<span aria-hidden="true">${icon}</span><span class="management-label">${label}</span>`;
  return button;
}

function installWorkspaceManagement() {
  if (workspaceManagementInstalled) return;
  workspaceManagementInstalled = true;

  const toolbar = document.querySelector('.toolbar-view');
  const dataButton = document.getElementById('data-button');
  const saveButton = createManagementButton('save-board-button', '⌑', '保存', '現在のボードに名前を付けて保存');
  const listButton = createManagementButton('board-list-button', '▤', '一覧', '保存したボードを一覧表示');
  const tutorialButton = createManagementButton('tutorial-button', '?', '使い方', '操作レクチャーを開始');
  toolbar.insertBefore(saveButton, dataButton);
  toolbar.insertBefore(listButton, dataButton);
  toolbar.insertBefore(tutorialButton, dataButton);

  document.body.insertAdjacentHTML('beforeend', workspaceHtml());

  const dataGrid = document.querySelector('#data-dialog .dialog-grid');
  const clearButton = document.createElement('button');
  clearButton.id = 'clear-all-button';
  clearButton.className = 'dialog-danger-card';
  clearButton.type = 'button';
  clearButton.innerHTML = '<strong>全体を削除</strong><span>図形・矢印・囲み・フェーズをすべて消す</span>';
  dataGrid.append(clearButton);

  bindWorkspaceManagementEvents();
  updateBoardManagementState();
}

function updateBoardManagementState() {
  const info = typeof getActiveBoardInfo === 'function' ? getActiveBoardInfo() : { name: '無題のボード' };
  const saveButton = document.getElementById('save-board-button');
  const listButton = document.getElementById('board-list-button');
  if (saveButton) saveButton.title = `「${info.name}」を保存`;
  if (listButton) listButton.title = `保存したボードを一覧表示（現在：${info.name}）`;
  document.title = `${info.name} — Flowmap`;
}

function openBoardNameDialog(mode = 'save', boardId = null, currentName = '') {
  boardNameDialogContext = { mode, boardId };
  const dialog = document.getElementById('board-name-dialog');
  const heading = document.getElementById('board-name-heading');
  const description = document.getElementById('board-name-description');
  const submit = document.getElementById('board-name-submit');
  const input = document.getElementById('board-name-input');
  if (mode === 'new') {
    heading.textContent = '新しいボード';
    description.textContent = '空のボードを新しく作成します。現在のボードは保存されたまま残ります。';
    submit.textContent = '作成';
    input.value = currentName || '新しいボード';
  } else if (mode === 'rename') {
    heading.textContent = '名前を変更';
    description.textContent = '保存済みの内容はそのままに、一覧で表示する名前だけを変更します。';
    submit.textContent = '変更';
    input.value = currentName;
  } else {
    const info = getActiveBoardInfo();
    heading.textContent = 'ボードを保存';
    description.textContent = '編集内容は自動保存されています。名前を付けると一覧から見つけやすくなります。';
    submit.textContent = '保存';
    input.value = info.name;
  }
  dialog.showModal();
  requestAnimationFrame(() => { input.focus(); input.select(); });
}

async function submitBoardName(event) {
  event.preventDefault();
  const input = document.getElementById('board-name-input');
  const name = input.value.trim();
  if (!name) return input.focus();
  const dialog = document.getElementById('board-name-dialog');
  try {
    if (boardNameDialogContext.mode === 'new') {
      await createSavedBoard(name);
      toast('新しいボードを作成しました');
      document.getElementById('board-list-dialog').close();
    } else if (boardNameDialogContext.mode === 'rename') {
      await renameSavedBoard(boardNameDialogContext.boardId, name);
      toast('ボード名を変更しました');
    } else {
      await saveActiveBoardName(name);
      toast('ボードを保存しました');
    }
    dialog.close();
    updateBoardManagementState();
    if (document.getElementById('board-list-dialog').open) await renderSavedBoardList();
  } catch (error) {
    console.error(error);
    toast(error.message || '保存できませんでした');
  }
}

function formatBoardUpdatedAt(value) {
  if (!value) return '更新日時なし';
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(new Date(value));
}

async function renderSavedBoardList() {
  const list = document.getElementById('saved-board-list');
  list.innerHTML = '<div class="board-list-loading">読み込み中…</div>';
  try {
    const records = await listSavedBoards();
    list.innerHTML = records.map((record) => {
      const noteCount = record.state.notes?.length || 0;
      const edgeCount = record.state.edges?.length || 0;
      return `<article class="saved-board-card ${record.active ? 'is-active' : ''}" data-board-id="${esc(record.id)}">
        <div class="saved-board-main">
          <div class="saved-board-title-row">
            <strong>${esc(record.name)}</strong>
            ${record.active ? '<span class="active-board-badge">編集中</span>' : ''}
          </div>
          <span>${noteCount}図形・${edgeCount}接続　／　${esc(formatBoardUpdatedAt(record.updatedAt))}更新</span>
        </div>
        <div class="saved-board-actions">
          <button type="button" data-board-action="open" ${record.active ? 'disabled' : ''}>${record.active ? '開いています' : '開く'}</button>
          <button type="button" data-board-action="rename">名前変更</button>
          <button type="button" data-board-action="duplicate">複製</button>
          <button class="danger-link" type="button" data-board-action="delete">削除</button>
        </div>
      </article>`;
    }).join('') || '<div class="board-list-empty">保存したボードはありません。</div>';
  } catch (error) {
    console.error(error);
    list.innerHTML = '<div class="board-list-empty">一覧を読み込めませんでした。</div>';
  }
}

async function openBoardListDialog() {
  const dialog = document.getElementById('board-list-dialog');
  dialog.showModal();
  await renderSavedBoardList();
}

async function handleBoardListAction(event) {
  const button = event.target.closest('[data-board-action]');
  if (!button) return;
  const card = button.closest('[data-board-id]');
  const boardId = card?.dataset.boardId;
  if (!boardId) return;
  const records = await listSavedBoards();
  const record = records.find((item) => item.id === boardId);
  if (!record) return toast('ボードが見つかりません');
  const action = button.dataset.boardAction;
  try {
    if (action === 'open') {
      await openSavedBoard(boardId);
      document.getElementById('board-list-dialog').close();
      updateBoardManagementState();
      requestAnimationFrame(() => fitView());
      toast(`「${record.name}」を開きました`);
    } else if (action === 'rename') {
      openBoardNameDialog('rename', boardId, record.name);
    } else if (action === 'duplicate') {
      await duplicateSavedBoard(boardId);
      await renderSavedBoardList();
      toast('ボードを複製しました');
    } else if (action === 'delete') {
      openConfirmAction({
        title: 'ボードを削除',
        copy: `「${record.name}」を保存一覧から削除します。`,
        buttonLabel: 'ボードを削除',
        action: async () => {
          await deleteSavedBoard(boardId);
          updateBoardManagementState();
          await renderSavedBoardList();
          toast('ボードを削除しました');
        }
      });
    }
  } catch (error) {
    console.error(error);
    toast(error.message || '操作に失敗しました');
  }
}

function openConfirmAction({ title, copy, buttonLabel, action }) {
  pendingConfirmAction = action;
  document.getElementById('confirm-action-heading').textContent = title;
  document.getElementById('confirm-action-copy').textContent = copy;
  document.getElementById('confirm-action-submit').textContent = buttonLabel;
  document.getElementById('confirm-action-dialog').showModal();
}

async function confirmPendingAction() {
  const dialog = document.getElementById('confirm-action-dialog');
  const action = pendingConfirmAction;
  pendingConfirmAction = null;
  dialog.close();
  if (!action) return;
  try {
    await action();
  } catch (error) {
    console.error(error);
    toast(error.message || '削除できませんでした');
  }
}

function prepareTutorialStep(step) {
  if (step.prepare === 'select-note' && state.notes.length) {
    selection = { type: 'note', id: state.notes[0].id };
    renderAll();
  }
  if (step.prepare === 'open-inspector') {
    state.settings.inspectorOpen = true;
    if (state.notes.length) selection = { type: 'note', id: state.notes[0].id };
    renderAll();
  }
}

function findTutorialTarget(step) {
  return document.querySelector(step.selector) || (step.fallback ? document.querySelector(step.fallback) : null) || document.getElementById('board');
}

function positionTutorial() {
  if (!tutorialRunning || !tutorialTarget) return;
  const spotlight = document.getElementById('tutorial-spotlight');
  const card = document.getElementById('tutorial-card');
  const rect = tutorialTarget.getBoundingClientRect();
  const padding = 7;
  Object.assign(spotlight.style, {
    left: `${Math.max(5, rect.left - padding)}px`,
    top: `${Math.max(5, rect.top - padding)}px`,
    width: `${Math.max(36, Math.min(window.innerWidth - 10, rect.width + padding * 2))}px`,
    height: `${Math.max(36, Math.min(window.innerHeight - 10, rect.height + padding * 2))}px`
  });
  const cardRect = card.getBoundingClientRect();
  let left = clamp(rect.left, 12, window.innerWidth - cardRect.width - 12);
  let top = rect.bottom + 16;
  if (top + cardRect.height > window.innerHeight - 12) top = rect.top - cardRect.height - 16;
  if (top < 12) {
    top = window.innerHeight - cardRect.height - 18;
    left = clamp((window.innerWidth - cardRect.width) / 2, 12, window.innerWidth - cardRect.width - 12);
  }
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

function showTutorialStep(index) {
  tutorialStepIndex = clamp(index, 0, FLOWMAP_TUTORIAL_STEPS.length - 1);
  const step = FLOWMAP_TUTORIAL_STEPS[tutorialStepIndex];
  if (tutorialTarget) tutorialTarget.classList.remove('tutorial-target');
  prepareTutorialStep(step);
  tutorialTarget = findTutorialTarget(step);
  tutorialTarget?.classList.add('tutorial-target');
  document.getElementById('tutorial-count').textContent = `${tutorialStepIndex + 1} / ${FLOWMAP_TUTORIAL_STEPS.length}`;
  document.getElementById('tutorial-title').textContent = step.title;
  document.getElementById('tutorial-copy').textContent = step.body;
  document.getElementById('tutorial-back').disabled = tutorialStepIndex === 0;
  document.getElementById('tutorial-next').textContent = tutorialStepIndex === FLOWMAP_TUTORIAL_STEPS.length - 1 ? '完了' : '次へ';
  requestAnimationFrame(positionTutorial);
}

function startTutorial() {
  const layer = document.getElementById('tutorial-layer');
  tutorialRunning = true;
  layer.hidden = false;
  showTutorialStep(0);
}

async function finishTutorial() {
  tutorialRunning = false;
  document.getElementById('tutorial-layer').hidden = true;
  tutorialTarget?.classList.remove('tutorial-target');
  tutorialTarget = null;
  try { await markTutorialSeen(); } catch (error) { console.warn(error); }
}

async function maybeStartTutorial() {
  try {
    if (!(await hasSeenTutorial())) setTimeout(startTutorial, 650);
  } catch (error) {
    console.warn('[Flowmap] Tutorial state unavailable', error);
  }
}

function bindWorkspaceManagementEvents() {
  document.getElementById('save-board-button').addEventListener('click', () => openBoardNameDialog('save'));
  document.getElementById('board-list-button').addEventListener('click', () => { void openBoardListDialog(); });
  document.getElementById('tutorial-button').addEventListener('click', startTutorial);
  document.getElementById('board-name-form').addEventListener('submit', (event) => { void submitBoardName(event); });
  document.querySelector('[data-close-board-name]').addEventListener('click', () => document.getElementById('board-name-dialog').close());
  document.getElementById('new-board-button').addEventListener('click', () => openBoardNameDialog('new'));
  document.getElementById('saved-board-list').addEventListener('click', (event) => { void handleBoardListAction(event); });
  document.querySelector('[data-cancel-confirm]').addEventListener('click', () => {
    pendingConfirmAction = null;
    document.getElementById('confirm-action-dialog').close();
  });
  document.getElementById('confirm-action-submit').addEventListener('click', () => { void confirmPendingAction(); });
  document.getElementById('clear-all-button').addEventListener('click', () => {
    document.getElementById('data-dialog').close();
    openConfirmAction({
      title: '全体を削除',
      copy: '現在のボードから、図形、矢印、囲み、フェーズをすべて削除します。ボード名と保存枠は残ります。',
      buttonLabel: '全体を削除',
      action: async () => {
        await clearActiveBoard();
        updateBoardManagementState();
        toast('ボードを空にしました');
      }
    });
  });
  document.getElementById('tutorial-back').addEventListener('click', () => showTutorialStep(tutorialStepIndex - 1));
  document.getElementById('tutorial-next').addEventListener('click', () => {
    if (tutorialStepIndex >= FLOWMAP_TUTORIAL_STEPS.length - 1) void finishTutorial();
    else showTutorialStep(tutorialStepIndex + 1);
  });
  document.getElementById('tutorial-skip').addEventListener('click', () => { void finishTutorial(); });
  window.addEventListener('resize', positionTutorial);
  document.addEventListener('keydown', (event) => {
    if (tutorialRunning && event.key === 'Escape') {
      event.preventDefault();
      void finishTutorial();
    }
  });
}
