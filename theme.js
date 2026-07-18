/* Flowmap v0.6 theme loader */
(() => {
  const applyTheme = () => {
    let refine = document.querySelector('link[data-flowmap-refine]');
    if (!refine) {
      refine = document.createElement('link');
      refine.rel = 'stylesheet';
      refine.href = './whiteboard-refine.css?v=0.6.0';
      refine.dataset.flowmapRefine = 'true';
      document.head.appendChild(refine);
    }

    const badge = document.querySelector('.version-badge');
    if (badge) badge.textContent = 'v0.6';

    const brandIcon = document.querySelector('.brand img');
    if (brandIcon) brandIcon.src = './favicon.svg?v=0.6.0';

    document.documentElement.dataset.flowmapTheme = 'whiteboard-v06';
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTheme, { once: true });
  } else {
    applyTheme();
  }
})();
