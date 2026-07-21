/* Flowmap v0.25 bootstrap — runs after every override is loaded */
let tutorialAdvanceTimer = null;

prepareTutorialStep = function prepareTutorialStepV12(step) {
  if (step.prepare === 'close-editor') document.querySelector('.inline-title-editor')?.blur();
  if (step.prepare === 'open-inspector') {
    state.settings.inspectorOpen = true;
    if (state.notes.length) selection = { type: 'note', id: state.notes[0].id };
    renderAll();
  }
};

showTutorialStep = function showTutorialStepV12(index) {
  tutorialStepIndex = clamp(index, 0, FLOWMAP_TUTORIAL_STEPS.length - 1);
  const step = FLOWMAP_TUTORIAL_STEPS[tutorialStepIndex];
  tutorialTarget?.classList.remove('tutorial-target');
  prepareTutorialStep(step);
  tutorialTarget = findTutorialTarget(step);
  tutorialTarget?.classList.add('tutorial-target');
  document.getElementById('tutorial-count').textContent = `${tutorialStepIndex + 1} / ${FLOWMAP_TUTORIAL_STEPS.length}`;
  document.getElementById('tutorial-title').textContent = step.title;
  document.getElementById('tutorial-copy').textContent = step.body;
  document.getElementById('tutorial-back').disabled = tutorialStepIndex === 0;
  const next = document.getElementById('tutorial-next');
  next.disabled = Boolean(step.actionEvent);
  next.textContent = step.actionEvent ? '操作すると進みます' : (tutorialStepIndex === FLOWMAP_TUTORIAL_STEPS.length - 1 ? '完了' : '次へ');
  requestAnimationFrame(positionTutorial);
};

function handleTutorialActionV12(event) {
  if (!tutorialRunning) return;
  const step = FLOWMAP_TUTORIAL_STEPS[tutorialStepIndex];
  if (!step?.actionEvent || event.type !== step.actionEvent) return;
  if (step.actionSelector) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest(step.actionSelector)) return;
  }
  clearTimeout(tutorialAdvanceTimer);
  tutorialAdvanceTimer = setTimeout(() => {
    if (tutorialRunning) showTutorialStep(tutorialStepIndex + 1);
  }, 240);
}

const bindWorkspaceManagementEventsBeforeBootstrap = bindWorkspaceManagementEvents;
bindWorkspaceManagementEvents = function bindWorkspaceManagementEventsV12() {
  bindWorkspaceManagementEventsBeforeBootstrap();
  document.addEventListener('click', handleTutorialActionV12);
  document.addEventListener('flowmap:blank-created', handleTutorialActionV12);
  document.addEventListener('flowmap:nodes-connected', handleTutorialActionV12);
};

/* The board menu consumes Escape before selection/editor shortcuts run. */
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !v12BoardMenuOpen) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  v12CloseBoardMenu();
  document.getElementById('current-board-button')?.focus();
}, true);

function loadFlowmapStyle(href, key) {
  return new Promise((resolve) => {
    if (document.querySelector(`link[data-flowmap-asset="${key}"]`)) return resolve();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.flowmapAsset = key;
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', resolve, { once: true });
    document.head.append(link);
  });
}

function loadFlowmapScript(src, key) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-flowmap-asset="${key}"]`)) return resolve();
    const element = document.createElement('script');
    element.src = src;
    element.dataset.flowmapAsset = key;
    element.addEventListener('load', resolve, { once: true });
    element.addEventListener('error', () => reject(new Error(`${key} could not be loaded`)), { once: true });
    document.head.append(element);
  });
}

async function loadFlowmapEnhancementAssets() {
  await Promise.all([
    loadFlowmapStyle('./styles/p0-experience-fixes.css?v=0.23.0', 'p0-style'),
    loadFlowmapStyle('./styles/pdf-preview.css?v=0.24.0', 'pdf-preview-style'),
    loadFlowmapStyle('./styles/pdf-readability-v025.css?v=0.25.0', 'pdf-readability-v025-style')
  ]);
  await loadFlowmapScript('./src/p0-experience-fixes.js?v=0.23.0', 'p0-script');
  await loadFlowmapScript('./src/pdf-preview.js?v=0.24.0', 'pdf-preview-script');
  await loadFlowmapScript('./src/pdf-readability-v025.js?v=0.25.0', 'pdf-readability-v025-script');
}

async function bootFlowmap() {
  try {
    await loadFlowmapEnhancementAssets();
  } catch (error) {
    console.error('[Flowmap] Failed to load enhancement assets', error);
  }
  await init();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void bootFlowmap(); }, { once: true });
else void bootFlowmap();
