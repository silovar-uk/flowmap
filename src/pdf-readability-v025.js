/* Flowmap v0.25.0 — readability layer for PDF preview */
'use strict';

const FLOWMAP_PDF_V025_DENSITY = {
  overview: { label: '俯瞰', description: 'タイトルと流れだけ', type: false, status: false, due: false, assignee: false, tags: false, note: false, progress: false, base: 76 },
  standard: { label: '標準', description: '状態・期限・担当', type: false, status: true, due: true, assignee: true, tags: false, note: false, progress: false, base: 104 },
  detailed: { label: '詳細', description: 'タグ・補足・進捗まで', type: true, status: true, due: true, assignee: true, tags: true, note: true, progress: true, base: 142 }
};

flowmapPdfState.density ||= flowmapPdfState.details === false ? 'overview' : 'standard';
flowmapPdfState.summary = flowmapPdfState.summary !== false;
flowmapPdfState.grid = flowmapPdfState.grid === true;

function flowmapPdfV025Density() {
  return FLOWMAP_PDF_V025_DENSITY[flowmapPdfState.density] || FLOWMAP_PDF_V025_DENSITY.standard;
}

const flowmapPdfLoadSettingsBeforeV025 = flowmapPdfLoadSettings;
flowmapPdfLoadSettings = function flowmapPdfLoadSettingsV025() {
  flowmapPdfLoadSettingsBeforeV025();
  try {
    const saved = JSON.parse(localStorage.getItem(FLOWMAP_PDF_SETTINGS_KEY) || '{}');
    flowmapPdfState.density = FLOWMAP_PDF_V025_DENSITY[saved.density]
      ? saved.density
      : (saved.details === false ? 'overview' : 'standard');
    flowmapPdfState.summary = saved.summary !== false;
    flowmapPdfState.grid = saved.grid === true;
  } catch (error) {
    console.warn('[Flowmap] v0.25 PDF settings could not be restored', error);
  }
  flowmapPdfState.details = flowmapPdfState.density !== 'overview';
};

flowmapPdfSaveSettings = function flowmapPdfSaveSettingsV025() {
  try {
    localStorage.setItem(FLOWMAP_PDF_SETTINGS_KEY, JSON.stringify({
      paper: flowmapPdfState.paper,
      orientation: flowmapPdfState.orientation,
      density: flowmapPdfState.density,
      details: flowmapPdfState.density !== 'overview',
      containers: flowmapPdfState.containers,
      grid: flowmapPdfState.grid,
      expandCollapsed: flowmapPdfState.expandCollapsed,
      summary: flowmapPdfState.summary
    }));
  } catch (error) {
    console.warn('[Flowmap] v0.25 PDF settings could not be saved', error);
  }
};

flowmapPdfNoteSize = function flowmapPdfNoteSizeV025(item) {
  const density = flowmapPdfV025Density();
  const preset = FLOWMAP_PDF_NOTE_WIDTHS[item?.widthPreset];
  const width = clamp(Number(item?.customWidth) || preset || Number(item?.w) || 224, 140, 760);
  const title = String(item?.title || '');
  const note = density.note ? String(item?.note || '') : '';
  const charsPerLine = Math.max(8, Math.floor((width - 38) / 14));
  const titleLines = Math.max(1, Math.ceil(title.length / charsPerLine));
  const noteLines = note ? Math.min(2, Math.max(1, Math.ceil(note.length / Math.max(12, charsPerLine + 4)))) : 0;
  const progressRows = density.progress && item?.checklist?.length ? 1 : 0;
  const calculated = density.base + Math.max(0, titleLines - 2) * 18 + noteLines * 17 + progressRows * 13;
  const custom = Number(item?.customHeight) || Number(item?.h) || 0;
  return { w: width, h: clamp(Math.max(custom, calculated), flowmapPdfState.density === 'overview' ? 76 : 92, 390) };
};

flowmapPdfNoteColor = function flowmapPdfNoteColorV025(item) {
  const appearance = String(item?.appearanceColor || 'auto');
  const surfaces = {
    yellow: '#fffdf4', blue: '#f8fbff', green: '#f8fcf7', pink: '#fff9fb',
    purple: '#fbf9ff', gray: '#fafbfa', white: '#ffffff'
  };
  return surfaces[appearance] || '#fffdf7';
};

function flowmapPdfV025Progress(item) {
  const checklist = Array.isArray(item?.checklist) ? item.checklist : [];
  if (!checklist.length) return null;
  const done = checklist.filter((entry) => entry.done).length;
  return { done, total: checklist.length, rate: Math.round(done / checklist.length * 100) };
}

flowmapPdfMetaHtml = function flowmapPdfMetaHtmlV025(item) {
  const density = flowmapPdfV025Density();
  const parts = [];
  if (density.status) parts.push(`<span class="pdf-note-status" data-status="${esc(item.status)}">${esc(STATUS[item.status] || item.status)}</span>`);
  if (density.due && item.due) parts.push(`<span>期限 ${esc(item.due.slice(5).replace('-', '/'))}</span>`);
  if (density.assignee && item.assignee) parts.push(`<span>担当 ${esc(item.assignee)}</span>`);
  if (density.tags) (item.tags || []).slice(0, 2).forEach((tag) => parts.push(`<span>#${esc(tag)}</span>`));
  return parts.length ? `<div class="pdf-note-meta">${parts.join('')}</div>` : '';
};

function flowmapPdfV025DetailsHtml(item) {
  const density = flowmapPdfV025Density();
  const pieces = [];
  if (density.note && item.note) {
    const compact = String(item.note).replace(/\s+/g, ' ').trim().slice(0, 110);
    if (compact) pieces.push(`<p class="pdf-note-description">${esc(compact)}${String(item.note).length > compact.length ? '…' : ''}</p>`);
  }
  if (density.progress) {
    const progress = flowmapPdfV025Progress(item);
    if (progress) pieces.push(`<div class="pdf-note-progress"><span>チェック ${progress.done}/${progress.total}</span><i><b style="width:${progress.rate}%"></b></i></div>`);
  }
  return pieces.join('');
}

flowmapPdfNoteHtml = function flowmapPdfNoteHtmlV025(item, bounds) {
  const group = getGroup(item.groupId);
  if (group?.collapsed && !flowmapPdfState.expandCollapsed) return '';
  const density = flowmapPdfV025Density();
  const size = flowmapPdfNoteSize(item);
  const type = item.type || 'process';
  const typeHtml = density.type
    ? `<span class="pdf-note-type">${esc(typeof nodeTypeIcon === 'function' ? nodeTypeIcon(type) : '□')} ${esc(typeof nodeTypeLabel === 'function' ? nodeTypeLabel(type) : '処理')}</span>`
    : '';
  return `<article class="pdf-map-note pdf-note-${esc(type)}" data-status="${esc(item.status)}" data-density="${esc(flowmapPdfState.density)}" style="left:${item.x - bounds.minX}px;top:${item.y - bounds.minY}px;width:${size.w}px;height:${size.h}px;--pdf-note-color:${flowmapPdfNoteColor(item)}">
    <div class="pdf-note-surface"></div>
    <div class="pdf-note-content">${typeHtml}<strong>${esc(item.title || '無題')}</strong>${flowmapPdfMetaHtml(item)}${flowmapPdfV025DetailsHtml(item)}</div>
  </article>`;
};

flowmapPdfLegendHtml = function flowmapPdfLegendHtmlV025() {
  if (flowmapPdfState.density === 'overview') return '';
  return `<div class="pdf-map-legend"><span data-status="todo">未着手</span><span data-status="doing">対応中</span><span data-status="waiting">確認待ち</span><span data-status="done">完了</span></div>`;
};

function flowmapPdfV025SummaryHtml() {
  if (!flowmapPdfState.summary) return '';
  const done = state.notes.filter((item) => item.status === 'done').length;
  const doing = state.notes.filter((item) => item.status === 'doing').length;
  const waiting = state.notes.filter((item) => item.status === 'waiting').length;
  const parts = [`<strong>${state.notes.length}</strong><span>工程</span>`];
  if (done) parts.push(`<strong>${done}</strong><span>完了</span>`);
  if (doing) parts.push(`<strong>${doing}</strong><span>対応中</span>`);
  if (waiting) parts.push(`<strong>${waiting}</strong><span>確認待ち</span>`);
  return `<div class="pdf-page-summary">${parts.join('')}</div>`;
}

flowmapPdfPageHtml = function flowmapPdfPageHtmlV025() {
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
  return `<section class="pdf-page" data-density="${esc(flowmapPdfState.density)}" style="width:${spec.width}px;height:${spec.height}px;--pdf-page-w:${spec.width}px;--pdf-page-h:${spec.height}px">
    <header class="pdf-page-header"><div class="pdf-page-heading"><span>FLOWMAP</span><h1>${esc(title)}</h1><p>${esc(printedAt)} 更新</p></div>${flowmapPdfV025SummaryHtml()}</header>
    <div class="pdf-map-frame ${gridClass}" style="left:${spec.margin}px;top:${spec.margin + spec.headerHeight}px;width:${mapWidth}px;height:${mapHeight}px">
      <div class="pdf-map-world" style="width:${bounds.width}px;height:${bounds.height}px;transform:translate(${offsetX}px,${offsetY}px) scale(${scale})">${flowmapPdfContainerHtml(bounds)}${flowmapPdfEdgeHtml(bounds)}${notes}</div>
      ${flowmapPdfLegendHtml()}
    </div>
    <footer class="pdf-page-footer"><span>flowmap</span><span>${esc(spec.label)}・${flowmapPdfState.orientation === 'landscape' ? '横' : '縦'}・1 / 1</span></footer>
  </section>`;
};

function flowmapPdfV025DensityButtonsHtml() {
  return Object.entries(FLOWMAP_PDF_V025_DENSITY).map(([value, config]) => `<label class="pdf-segment-option"><input type="radio" name="pdf-density" value="${value}"><span>${config.label}</span></label>`).join('');
}

flowmapPdfDialogHtml = function flowmapPdfDialogHtmlV025() {
  return `<dialog id="pdf-preview-dialog" class="app-dialog pdf-preview-dialog"><form method="dialog">
    <header><div><span>PDF PREVIEW</span><h2>マップをPDFにする</h2></div><button value="cancel" aria-label="閉じる">×</button></header>
    <div class="pdf-preview-toolbar">
      <label class="pdf-toolbar-title"><span>タイトル</span><input id="pdf-preview-title" type="text" maxlength="100"></label>
      <div class="pdf-toolbar-selects"><label><span>用紙</span><select id="pdf-preview-paper"><option value="a4">A4</option><option value="a3">A3</option></select></label><label><span>向き</span><select id="pdf-preview-orientation"><option value="landscape">横</option><option value="portrait">縦</option></select></label></div>
      <fieldset class="pdf-density-control"><legend>情報量</legend><div class="pdf-segmented">${flowmapPdfV025DensityButtonsHtml()}</div></fieldset>
      <button type="button" class="button primary pdf-toolbar-print" data-pdf-print>PDFとして保存</button>
    </div>
    <div class="pdf-preview-layout">
      <section id="pdf-preview-canvas" class="pdf-preview-canvas" aria-label="PDFプレビュー"><div id="pdf-preview-page-host"></div></section>
      <aside class="pdf-preview-controls">
        <div class="pdf-details-heading"><div><span>DETAILS</span><strong>詳細設定</strong></div><span id="pdf-preview-density-label"></span></div>
        <fieldset><legend>マップ表示</legend><label><input id="pdf-preview-containers" type="checkbox"><span>フェーズ・囲みを表示</span></label><label><input id="pdf-preview-grid" type="checkbox"><span>薄い方眼を表示</span></label><label><input id="pdf-preview-expand" type="checkbox"><span>折りたたみ中の付箋も表示</span></label><label><input id="pdf-preview-summary" type="checkbox"><span>ヘッダーに進捗を表示</span></label></fieldset>
        <div class="pdf-preview-info"><span>マップ倍率</span><strong id="pdf-preview-scale">100%</strong></div>
        <p id="pdf-preview-warning" class="pdf-preview-warning" hidden></p><p class="pdf-preview-help">保存画面では「送信先：PDFに保存」を選択してください。</p>
        <button type="button" class="button quiet pdf-details-close" data-pdf-close>プレビューを閉じる</button>
      </aside>
    </div>
  </form></dialog>`;
};

flowmapPdfSyncControls = function flowmapPdfSyncControlsV025() {
  const info = typeof getActiveBoardInfo === 'function' ? getActiveBoardInfo() : { name: '業務フローマップ' };
  if (!flowmapPdfState.title) flowmapPdfState.title = info.name || '業務フローマップ';
  document.getElementById('pdf-preview-title').value = flowmapPdfState.title;
  document.getElementById('pdf-preview-paper').value = flowmapPdfState.paper;
  document.getElementById('pdf-preview-orientation').value = flowmapPdfState.orientation;
  const density = document.querySelector(`input[name="pdf-density"][value="${flowmapPdfState.density}"]`);
  if (density) density.checked = true;
  document.getElementById('pdf-preview-containers').checked = flowmapPdfState.containers;
  document.getElementById('pdf-preview-grid').checked = flowmapPdfState.grid;
  document.getElementById('pdf-preview-expand').checked = flowmapPdfState.expandCollapsed;
  document.getElementById('pdf-preview-summary').checked = flowmapPdfState.summary;
};

flowmapPdfReadControls = function flowmapPdfReadControlsV025() {
  flowmapPdfState.title = document.getElementById('pdf-preview-title').value;
  flowmapPdfState.paper = document.getElementById('pdf-preview-paper').value;
  flowmapPdfState.orientation = document.getElementById('pdf-preview-orientation').value;
  flowmapPdfState.density = document.querySelector('input[name="pdf-density"]:checked')?.value || 'standard';
  flowmapPdfState.details = flowmapPdfState.density !== 'overview';
  flowmapPdfState.containers = document.getElementById('pdf-preview-containers').checked;
  flowmapPdfState.grid = document.getElementById('pdf-preview-grid').checked;
  flowmapPdfState.expandCollapsed = document.getElementById('pdf-preview-expand').checked;
  flowmapPdfState.summary = document.getElementById('pdf-preview-summary').checked;
  flowmapPdfSaveSettings();
  flowmapPdfRenderArtifacts();
};

flowmapPdfUpdateSummary = function flowmapPdfUpdateSummaryV025() {
  const scale = flowmapPdfState.scale;
  const scaleLabel = document.getElementById('pdf-preview-scale');
  const warning = document.getElementById('pdf-preview-warning');
  const densityLabel = document.getElementById('pdf-preview-density-label');
  if (scaleLabel) scaleLabel.textContent = `${Math.round(scale * 100)}%`;
  if (densityLabel) densityLabel.textContent = flowmapPdfV025Density().description;
  if (!warning) return;
  if (scale < .28) {
    warning.hidden = false;
    warning.textContent = 'かなり縮小されます。A3横、または「俯瞰」にすると読みやすくなります。';
  } else if (scale < .42) {
    warning.hidden = false;
    warning.textContent = '文字が小さめです。A3横か「俯瞰」がおすすめです。';
  } else {
    warning.hidden = true;
    warning.textContent = '';
  }
};

const flowmapPdfInstallTriggerBeforeV025 = flowmapPdfInstallTrigger;
flowmapPdfInstallTrigger = function flowmapPdfInstallTriggerV025() {
  flowmapPdfInstallTriggerBeforeV025();
  const card = document.getElementById('export-pdf-card');
  if (card) {
    const strong = card.querySelector('strong');
    const span = card.querySelector('span');
    if (strong) strong.textContent = 'PDFをプレビュー';
    if (span) span.textContent = '情報量と用紙を確認して保存';
  }
};

if (typeof p0SetVersionBadge === 'function') {
  p0SetVersionBadge = function p0SetVersionBadgeV025() {
    const badge = document.querySelector('.version-badge');
    if (badge) badge.textContent = 'v0.25.0';
  };
}
