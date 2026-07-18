/* Flowmap v0.4 compatibility marker */
globalThis.__FLOWMAP_APP__ = "";
const versionBadge = document.querySelector('.version-badge');
if (versionBadge) versionBadge.textContent = 'v0.4';
const brandIcon = document.querySelector('.brand img');
if (brandIcon) brandIcon.src = './favicon.svg?v=0.4.0';
