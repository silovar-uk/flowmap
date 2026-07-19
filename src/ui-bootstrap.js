/* Flowmap v0.12 bootstrap — runs after every override is loaded */
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

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void init(); }, { once: true });
else void init();
