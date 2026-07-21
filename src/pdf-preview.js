/* Flowmap v0.24.0 — map-first PDF preview and printing */
'use strict';

const FLOWMAP_PDF_VERSION = '0.24.0';
const FLOWMAP_PDF_SETTINGS_KEY = 'flowmap:pdf-settings';
const FLOWMAP_PDF_PAPERS = {
  a4: { label: 'A4', portrait: { w: 794, h: 1123 }, landscape: { w: 1123, h: 794 } },
  a3: { label: 'A3', portrait: { w: 1123, h: 1587 }, landscape: { w: 1587, h: 1123 } }
};
const FLOWMAP_PDF_NOTE_WIDTHS = {
  compact: 160,
  standard: 224,
  wide: 300,
  long: 400,
  xlong: 520
};
const FLOWMAP_PDF_COLORS = {
  yellow: '#fff3b2',
  blue: '#e6eefc',
  green: '#e5f2e2',
  pink: '#f8e5eb',
  purple: '#eee7f8',
  gray: '#edf0ed',
  white: '#ffffff'
};

let flowmapPdfBound = false;
let flowmapPdfResizeBound = false;
let flowmapPdfTitleBeforePrint = '';
let flowmapPdfState = {
  paper: 'a4',
  orientation: 'landscape',
  details: true,
  containers: true,
  grid: true,
  expandCollapsed: true,
  title: '',
  scale: 1
};

function flowmapPdfLoadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(FLOWMAP_PDF_SETTINGS_KEY) || '{}');
    flowmapPdfState.paper = FLOWMAP_PDF_PAPERS[saved.paper] ? saved.paper : 'a4';
    flowmapPdfState.orientation = saved.orientation === 'portrait' ? 'portrait' : 'landscape';
    flowmapPdfState.details = saved.details !== false;
    flowmapPdfState.containers = saved.containers !== false;
    flowmapPdfState.grid = saved.grid !== false;
    flowmapPdfState.expandCollapsed = saved.expandCollapsed !== false;
  } catch (error) {
    console.warn('[Flowmap] PDF settings could not be restored', error);
  }
}

function flowmapPdfSaveSettings() {
  try {
    localStorage.setItem(FLOWMAP_PDF_SETTINGS_KEY, JSON.stringify({
      paper: flowmapPdfState.paper,
      orientation: flowmapPdfState.orientation,
      details: flowmapPdfState.details,
      containers: flowmapPdfState.containers,
      grid: flowmapPdfState.grid,
      expandCollapsed: flowmapPdfState.expandCollapsed
    }));
  } catch (error) {
    console.warn('[Flowmap] PDF settings could not be saved', error);
  }
}

function flowmapPdfPageSpec() {
  const paper = FLOWMAP_PDF_PAPERS[flowmapPdfState.paper] || FLOWMAP_PDF_PAPERS.a4;
  const size = paper[flowmapPdfState.orientation] || paper.landscape;
  return {
    label: paper.label,
    orientation: flowmapPdfState.orientation,
    width: size.w,
    height: size.h,
    margin: 34,
    headerHeight: 76,
    footerHeight: 26
  };
}

function flowmapPdfNoteSize(item) {
  const preset = FLOWMAP_PDF_NOTE_WIDTHS[item?.widthPreset];
  const width = clamp(Number(item?.customWidth) || preset || Number(item?.w) || 224, 140, 760);
  const title = String(item?.title || '');
  const charsPerLine = Math.max(8, Math.floor((width - 32) / 14));
  const lineCount = Math.max(1, Math.ceil(title.length / charsPerLine));
  const base = flowmapPdfState.details ? 102 : 78;
  const height = Math.max(Number(item?.customHeight) || Number(item?.h) || 0, base + Math.max(0, lineCount - 2) * 18);
  return { w: width, h: clamp(height, 78, 360) };
}

function flowmapPdfGroupRect(group) {
  const notes = state.notes.filter((item) => item.groupId === group.id);
  if (group.collapsed && !flowmapPdfState.expandCollapsed) {
    return { x: group.x, y: group.y, w: group.w, h: 42 };
  }
  const contentBottom = notes.length
    ? Math.max(...notes.map((item) => item.y + flowmapPdfNoteSize(item).h)) + 34
    : group.y + 96;
  return {
    x: group.x,
    y: group.y,
    w: group.w,
    h: Math.max(96, contentBottom - group.y)
  };
}

function flowmapPdfPhaseRect(phase) {
  const groups = state.groups.filter((item) => item.phaseId === phase.id);
  const looseNotes = state.notes.filter((item) => item.phaseId === phase.id && !item.groupId);
  const bottoms = [phase.y + 150];
  groups.forEach((group) => bottoms.push(flowmapPdfGroupRect(group).y + flowmapPdfGroupRect(group).h));
  looseNotes.forEach((item) => bottoms.push(item.y + flowmapPdfNoteSize(item).h));
  return {
    x: phase.x,
    y: phase.y,
    w: phase.w,
    h: Math.max(170, Math.max(...bottoms) - phase.y + 34)
  };
}

function flowmapPdfBounds() {
  const objects = [];
  if (flowmapPdfState.containers) {
    state.phases.forEach((item) => objects.push(flowmapPdfPhaseRect(item)));
    state.groups.forEach((item) => objects.push(flowmapPdfGroupRect(item)));
  }
  state.notes.forEach((item) => {
    const group = getGroup(item.groupId);
    if (group?.collapsed && !flowmapPdfState.expandCollapsed) return;
    const size = flowmapPdfNoteSize(item);
    objects.push({ x: item.x, y: item.y, w: size.w, h: size.h });
  });
  if (!objects.length) return { minX: 0, minY: 0, maxX: 1000, maxY: 700, width: 1000, height: 700 };
  const padding = 48;
  const minX = Math.min(...objects.map((item) => item.x)) - padding;
  const minY = Math.min(...objects.map((item) => item.y)) - padding;
  const maxX = Math.max(...objects.map((item) => item.x + item.w)) + padding;
  const maxY = Math.max(...objects.map((item) => item.y + item.h)) + padding;
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function flowmapPdfNoteColor(item) {
  const appearance = String(item?.appearanceColor || 'auto');
  if (FLOWMAP_PDF_COLORS[appearance]) return FLOWMAP_PDF_COLORS[appearance];
  if (item?.status === 'done') return FLOWMAP_PDF_COLORS.green;
  if (item?.status === 'doing') return FLOWMAP_PDF_COLORS.blue;
  if (item?.status === 'waiting') return '#f7e7d4';
  return FLOWMAP_PDF_COLORS.yellow;
}

function flowmapPdfMetaHtml(item) {
  if (!flowmapPdfState.details) return '';
  const parts = [`<span class="pdf-note-status" data-status="${esc(item.status)}">${esc(STATUS[item.status] || item.status)}</span>`];
  if (item.due) parts.push(`<span>期限 ${esc(item.due.slice(5).replace('-', '/'))}</span>`);
  if (item.assignee) parts.push(`<span>担当 ${esc(item.assignee)}</span>`);
  (item.tags || []).slice(0, 2).forEach((tag) => parts.push(`<span>#${esc(tag)}</span>`));
  return `<div class="pdf-note-meta">${parts.join('')}</div>`;
}

function flowmapPdfNoteHtml(item, bounds) {
  const group = getGroup(item.groupId);
  if (group?.collapsed && !flowmapPdfState.expandCollapsed) return '';
  const size = flowmapPdfNoteSize(item);
  const type = item.type || 'process';
  return `<article class="pdf-map-note pdf-note-${esc(type)}" data-status="${esc(item.status)}" style="left:${item.x - bounds.minX}px;top:${item.y - bounds.minY}px;width:${size.w}px;height:${size.h}px;--pdf-note-color:${flowmapPdfNoteColor(item)}">
    <div class="pdf-note-surface"></div>
    <div class="pdf-note-content">
      <span class="pdf-note-type">${esc(typeof nodeTypeIcon === 'function' ? nodeTypeIcon(type) : '□')} ${esc(typeof nodeTypeLabel === 'function' ? nodeTypeLabel(type) : '処理')}</span>
      <strong>${esc(item.title || '無題')}</strong>
      ${flowmapPdfMetaHtml(item)}
    </div>
  </article>`;
}

function flowmapPdfEdgeHtml(bounds) {
  const edges = state.edges.filter((item) => getNote(item.from) && getNote(item.to));
  const paths = edges.map((item) => {
    const fromGroup = getGroup(getNote(item.from)?.groupId);
    const toGroup = getGroup(getNote(item.to)?.groupId);
    if (!flowmapPdfState.expandCollapsed && (fromGroup?.collapsed || toGroup?.collapsed)) return '';
    const path = edgePath(item);
    const label = item.label && path.labelPoint
      ? `<text class="pdf-edge-label" x="${path.labelPoint.x}" y="${path.labelPoint.y}" text-anchor="middle">${esc(item.label)}</text>`
      : '';
    return `<path class="pdf-map-edge" d="${path.d}" marker-end="url(#pdf-map-arrow)"></path>${label}`;
  }).join('');
  return `<svg class="pdf-map-edges" viewBox="${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}" preserveAspectRatio="none" aria-hidden="true">
    <defs><marker id="pdf-map-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L9,4.5 L0,9 Z"></path></marker></defs>
    ${paths}
  </svg>`;
}

function flowmapPdfContainerHtml(bounds) {
  if (!flowmapPdfState.containers) return '';
  const phases = state.phases.map((phase) => {
    const rect = flowmapPdfPhaseRect(phase);
    return `<section class="pdf-map-phase" style="left:${rect.x - bounds.minX}px;top:${rect.y - bounds.minY}px;width:${rect.w}px;height:${rect.h}px"><strong>${esc(phase.title)}</strong></section>`;
  }).join('');
  const groups = state.groups.map((group) => {
    const rect = flowmapPdfGroupRect(group);
    return `<section class="pdf-map-group" data-color="${esc(group.color || 'gray')}" style="left:${rect.x - bounds.minX}px;top:${rect.y - bounds.minY}px;width:${rect.w}px;height:${rect.h}px"><strong>${esc(group.title)}</strong></section>`;
  }).join('');
  return phases + groups;
}

function flowmapPdfLegendHtml() {
  if (!flowmapPdfState.details) return '';
  return `<div class="pdf-map-legend"><span data-status="todo">未着手</span><span data-status="doing">対応中</span><span data-status="waiting">確認待ち</span><span data-status="done">完了</span></div>`;
}

function flowmapPdfPageHtml() {
  const spec = flowmapPdfPageSpec();
  const bounds = flowmapPdfBounds();
  const mapWidth = spec.width - spec.margin * 2;
  const mapHeight = spec.height - spec.margin * 2 - spec.headerHeight - spec.footerHeight;
  const scale = Math.min(mapWidth / bounds.width, mapHeight / bounds.height, 1.18);
  const renderedW = bounds.width * scale;
  const renderedH = bounds.height * scale;
  const offsetX = Math.max(0, (mapWidth - renderedW) / 2);
  const offsetY = Math.max(0, (mapHeight - renderedH) / 2);
  const boardInfo = typeof getActiveBoardInfo === 'function' ? getActiveBoardInfo() : { name: 'Flowmap' };
  const title = String(flowmapPdfState.title || boardInfo.name || '業務フローマップ').trim() || '業務フローマップ';
  const printedAt = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
  flowmapPdfState.scale = scale;

  const notes = state.notes.map((item) => flowmapPdfNoteHtml(item, bounds)).join('');
  const gridClass = flowmapPdfState.grid ? 'has-pdf-grid' : '';
  return `<section class="pdf-page" style="width:${spec.width}px;height:${spec.height}px;--pdf-page-w:${spec.width}px;--pdf-page-h:${spec.height}px">
    <header class="pdf-page-header">
      <div><span>FLOWMAP</span><h1>${esc(title)}</h1></div>
      <div class="pdf-page-summary"><strong>${state.notes.length}</strong><span>工程</span><strong>${state.edges.length}</strong><span>接続</span><strong>${state.phases.length}</strong><span>フェーズ</span></div>
    </header>
    <div class="pdf-map-frame ${gridClass}" style="left:${spec.margin}px;top:${spec.margin + spec.headerHeight}px;width:${mapWidth}px;height:${mapHeight}px">
      <div class="pdf-map-world" style="width:${bounds.width}px;height:${bounds.height}px;transform:translate(${offsetX}px,${offsetY}px) scale(${scale})">
        ${flowmapPdfContainerHtml(bounds)}
        ${flowmapPdfEdgeHtml(bounds)}
        ${notes}
      </div>
      ${flowmapPdfLegendHtml()}
    </div>
    <footer class="pdf-page-footer"><span>${esc(spec.label)}・${flowmapPdfState.orientation === 'landscape' ? '横' : '縦'}・全体を1ページに収める</span><span>${esc(printedAt)} 出力</span></footer>
  </section>`;
}

function flowmapPdfApplyPageStyle() {
  let style = document.getElementById('flowmap-pdf-page-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'flowmap-pdf-page-style';
    document.head.append(style);
  }
  const paper = FLOWMAP_PDF_PAPERS[flowmapPdfState.paper] || FLOWMAP_PDF_PAPERS.a4;
  style.textContent = `@page { size: ${paper.label} ${flowmapPdfState.orientation}; margin: 0; }`;
}

function flowmapPdfRenderArtifacts() {
  const pageHtml = flowmapPdfPageHtml();
  const previewHost = document.getElementById('pdf-preview-page-host');
  const printSheet = document.getElementById('print-sheet');
  if (previewHost) previewHost.innerHTML = `<div class="pdf-preview-page-wrapper">${pageHtml}</div>`;
  if (printSheet) printSheet.innerHTML = pageHtml;
  flowmapPdfApplyPageStyle();
  flowmapPdfUpdateSummary();
  requestAnimationFrame(flowmapPdfFitPreview);
}

function flowmapPdfFitPreview() {
  const canvas = document.getElementById('pdf-preview-canvas');
  const wrapper = document.querySelector('#pdf-preview-page-host .pdf-preview-page-wrapper');
  const page = wrapper?.querySelector('.pdf-page');
  if (!canvas || !wrapper || !page) return;
  const spec = flowmapPdfPageSpec();
  const availableW = Math.max(160, canvas.clientWidth - 48);
  const availableH = Math.max(160, canvas.clientHeight - 48);
  const scale = Math.min(availableW / spec.width, availableH / spec.height, 1);
  wrapper.style.width = `${spec.width * scale}px`;
  wrapper.style.height = `${spec.height * scale}px`;
  page.style.transform = `scale(${scale})`;
}

function flowmapPdfUpdateSummary() {
  const scale = flowmapPdfState.scale;
  const scaleLabel = document.getElementById('pdf-preview-scale');
  const warning = document.getElementById('pdf-preview-warning');
  if (scaleLabel) scaleLabel.textContent = `${Math.round(scale * 100)}%`;
  if (!warning) return;
  if (scale < .28) {
    warning.hidden = false;
    warning.textContent = 'かなり縮小されます。A3横にすると付箋が読みやすくなります。';
  } else if (scale < .42) {
    warning.hidden = false;
    warning.textContent = '文字が小さめです。A3または横向きがおすすめです。';
  } else {
    warning.hidden = true;
    warning.textContent = '';
  }
}

function flowmapPdfDialogHtml() {
  return `<dialog id="pdf-preview-dialog" class="app-dialog pdf-preview-dialog">
    <form method="dialog">
      <header><div><span>PDF PREVIEW</span><h2>マップをPDFにする</h2></div><button value="cancel" aria-label="閉じる">×</button></header>
      <div class="pdf-preview-layout">
        <aside class="pdf-preview-controls">
          <label><span>タイトル</span><input id="pdf-preview-title" type="text" maxlength="100"></label>
          <div class="pdf-control-row">
            <label><span>用紙</span><select id="pdf-preview-paper"><option value="a4">A4</option><option value="a3">A3</option></select></label>
            <label><span>向き</span><select id="pdf-preview-orientation"><option value="landscape">横</option><option value="portrait">縦</option></select></label>
          </div>
          <fieldset><legend>表示内容</legend>
            <label><input id="pdf-preview-details" type="checkbox"><span>状態・期限・担当を表示</span></label>
            <label><input id="pdf-preview-containers" type="checkbox"><span>フェーズ・囲みを表示</span></label>
            <label><input id="pdf-preview-grid" type="checkbox"><span>薄い方眼を表示</span></label>
            <label><input id="pdf-preview-expand" type="checkbox"><span>折りたたみ中の付箋も表示</span></label>
          </fieldset>
          <div class="pdf-preview-info"><span>マップ倍率</span><strong id="pdf-preview-scale">100%</strong></div>
          <p id="pdf-preview-warning" class="pdf-preview-warning" hidden></p>
          <p class="pdf-preview-help">保存画面では「送信先：PDFに保存」を選択してください。</p>
          <div class="pdf-preview-actions"><button type="button" class="button quiet" data-pdf-close>閉じる</button><button type="button" class="button primary" data-pdf-print>PDFとして保存</button></div>
        </aside>
        <section id="pdf-preview-canvas" class="pdf-preview-canvas" aria-label="PDFプレビュー"><div id="pdf-preview-page-host"></div></section>
      </div>
    </form>
  </dialog>`;
}

function flowmapPdfInstallDialog() {
  if (!document.getElementById('pdf-preview-dialog')) document.body.insertAdjacentHTML('beforeend', flowmapPdfDialogHtml());
}

function flowmapPdfSyncControls() {
  const info = typeof getActiveBoardInfo === 'function' ? getActiveBoardInfo() : { name: '業務フローマップ' };
  if (!flowmapPdfState.title) flowmapPdfState.title = info.name || '業務フローマップ';
  document.getElementById('pdf-preview-title').value = flowmapPdfState.title;
  document.getElementById('pdf-preview-paper').value = flowmapPdfState.paper;
  document.getElementById('pdf-preview-orientation').value = flowmapPdfState.orientation;
  document.getElementById('pdf-preview-details').checked = flowmapPdfState.details;
  document.getElementById('pdf-preview-containers').checked = flowmapPdfState.containers;
  document.getElementById('pdf-preview-grid').checked = flowmapPdfState.grid;
  document.getElementById('pdf-preview-expand').checked = flowmapPdfState.expandCollapsed;
}

function flowmapPdfReadControls() {
  flowmapPdfState.title = document.getElementById('pdf-preview-title').value;
  flowmapPdfState.paper = document.getElementById('pdf-preview-paper').value;
  flowmapPdfState.orientation = document.getElementById('pdf-preview-orientation').value;
  flowmapPdfState.details = document.getElementById('pdf-preview-details').checked;
  flowmapPdfState.containers = document.getElementById('pdf-preview-containers').checked;
  flowmapPdfState.grid = document.getElementById('pdf-preview-grid').checked;
  flowmapPdfState.expandCollapsed = document.getElementById('pdf-preview-expand').checked;
  flowmapPdfSaveSettings();
  flowmapPdfRenderArtifacts();
}

function flowmapPdfOpenPreview() {
  flowmapPdfInstallDialog();
  const info = typeof getActiveBoardInfo === 'function' ? getActiveBoardInfo() : { name: '業務フローマップ' };
  flowmapPdfState.title = info.name || '業務フローマップ';
  flowmapPdfSyncControls();
  flowmapPdfRenderArtifacts();
  const dialog = document.getElementById('pdf-preview-dialog');
  if (!dialog.open) dialog.showModal();
  requestAnimationFrame(flowmapPdfFitPreview);
}

function flowmapPdfPrint() {
  flowmapPdfReadControls();
  flowmapPdfTitleBeforePrint = document.title;
  const title = String(flowmapPdfState.title || 'Flowmap').trim().replace(/[\\/:*?"<>|]/g, '-');
  document.title = title || 'Flowmap';
  document.body.classList.add('is-flowmap-pdf-printing');
  requestAnimationFrame(() => window.print());
}

function flowmapPdfInstallTrigger() {
  const original = document.getElementById('print-button');
  if (original && original.dataset.pdfPreviewBound !== 'true') {
    const button = original.cloneNode(true);
    button.dataset.pdfPreviewBound = 'true';
    original.replaceWith(button);
    els['print-button'] = button;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      flowmapPdfOpenPreview();
    });
  }
  const card = document.getElementById('export-pdf-card');
  if (card) {
    const strong = card.querySelector('strong');
    const span = card.querySelector('span');
    if (strong) strong.textContent = 'PDFをプレビュー';
    if (span) span.textContent = 'マップを確認してPDF保存';
  }
}

function flowmapPdfBind() {
  if (flowmapPdfBound) return;
  flowmapPdfBound = true;
  flowmapPdfLoadSettings();
  flowmapPdfInstallDialog();
  flowmapPdfInstallTrigger();
  const dialog = document.getElementById('pdf-preview-dialog');
  dialog.addEventListener('input', (event) => {
    if (event.target.matches('input,select')) flowmapPdfReadControls();
  });
  dialog.addEventListener('change', (event) => {
    if (event.target.matches('input,select')) flowmapPdfReadControls();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-pdf-close]')) dialog.close();
    if (event.target.closest('[data-pdf-print]')) flowmapPdfPrint();
  });
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('is-flowmap-pdf-printing');
    if (flowmapPdfTitleBeforePrint) document.title = flowmapPdfTitleBeforePrint;
  });
  if (!flowmapPdfResizeBound) {
    flowmapPdfResizeBound = true;
    window.addEventListener('resize', flowmapPdfFitPreview);
  }
}

renderPrint = function renderMapPrintPreview() {
  if (document.getElementById('pdf-preview-dialog')?.open || document.body.classList.contains('is-flowmap-pdf-printing')) {
    flowmapPdfRenderArtifacts();
  }
};

if (typeof p0SetVersionBadge === 'function') {
  p0SetVersionBadge = function p0SetVersionBadgeV024() {
    const badge = document.querySelector('.version-badge');
    if (badge) badge.textContent = `v${FLOWMAP_PDF_VERSION}`;
  };
}

const updateFlowExperienceUiBeforePdfPreview = updateFlowExperienceUi;
updateFlowExperienceUi = function updateFlowExperienceUiPdfPreview() {
  updateFlowExperienceUiBeforePdfPreview();
  flowmapPdfInstallTrigger();
  if (typeof p0SetVersionBadge === 'function') p0SetVersionBadge();
};

const bindEventsBeforePdfPreview = bindEvents;
bindEvents = function bindEventsPdfPreview() {
  bindEventsBeforePdfPreview();
  flowmapPdfBind();
  flowmapPdfInstallTrigger();
};
