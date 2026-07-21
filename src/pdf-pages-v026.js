/* Flowmap v0.26.0 — readable multi-page PDF output */
'use strict';

const FLOWMAP_PDF_V026_LAYOUTS = {
  auto: { label: '自動', description: 'マップの大きさに合わせる' },
  overview: { label: '全体', description: '全体を1ページ' },
  phase: { label: 'フェーズ別', description: 'フェーズごとに分ける' }
};

flowmapPdfState.layout ||= 'auto';
flowmapPdfState.numbering = flowmapPdfState.numbering !== false;
flowmapPdfState.previewMode ||= 'all';
flowmapPdfState.currentPage ||= 0;
flowmapPdfState.resolvedLayout ||= 'overview';
flowmapPdfState.fullScale ||= 1;

let flowmapPdfV026Pages = [];
let flowmapPdfV026Bound = false;

function flowmapPdfV026VisibleNote(item) {
  const group = getGroup(item?.groupId);
  return !(group?.collapsed && !flowmapPdfState.expandCollapsed);
}

function flowmapPdfV026PhaseId(item) {
  return item?.phaseId || getGroup(item?.groupId)?.phaseId || '';
}

function flowmapPdfV026SortedPhases() {
  return [...state.phases].sort((a, b) => (Number(a.x) - Number(b.x)) || (Number(a.y) - Number(b.y)) || String(a.title || '').localeCompare(String(b.title || ''), 'ja'));
}

function flowmapPdfV026SortedGroups() {
  const phaseOrder = new Map(flowmapPdfV026SortedPhases().map((item, index) => [item.id, index]));
  return [...state.groups].sort((a, b) => {
    const phaseDiff = (phaseOrder.get(a.phaseId) ?? 9999) - (phaseOrder.get(b.phaseId) ?? 9999);
    return phaseDiff || (Number(a.y) - Number(b.y)) || (Number(a.x) - Number(b.x)) || String(a.title || '').localeCompare(String(b.title || ''), 'ja');
  });
}

function flowmapPdfV026SortedNotes() {
  const phaseOrder = new Map(flowmapPdfV026SortedPhases().map((item, index) => [item.id, index]));
  const groupOrder = new Map(flowmapPdfV026SortedGroups().map((item, index) => [item.id, index]));
  return state.notes.filter(flowmapPdfV026VisibleNote).sort((a, b) => {
    const phaseDiff = (phaseOrder.get(flowmapPdfV026PhaseId(a)) ?? 9999) - (phaseOrder.get(flowmapPdfV026PhaseId(b)) ?? 9999);
    const groupDiff = (groupOrder.get(a.groupId) ?? 9999) - (groupOrder.get(b.groupId) ?? 9999);
    return phaseDiff || groupDiff || (Number(a.y) - Number(b.y)) || (Number(a.x) - Number(b.x)) || String(a.title || '').localeCompare(String(b.title || ''), 'ja');
  });
}

function flowmapPdfV026NumberMap() {
  const notes = flowmapPdfV026SortedNotes();
  const width = Math.max(2, String(notes.length).length);
  return new Map(notes.map((item, index) => [item.id, String(index + 1).padStart(width, '0')]));
}

function flowmapPdfV026BoundsFor(notes, phases, groups) {
  const objects = [];
  if (flowmapPdfState.containers) {
    phases.forEach((item) => objects.push(flowmapPdfPhaseRect(item)));
    groups.forEach((item) => objects.push(flowmapPdfGroupRect(item)));
  }
  notes.forEach((item) => {
    const size = flowmapPdfNoteSize(item);
    objects.push({ x: Number(item.x) || 0, y: Number(item.y) || 0, w: size.w, h: size.h });
  });
  if (!objects.length) return { minX: 0, minY: 0, maxX: 1000, maxY: 700, width: 1000, height: 700 };
  const padding = 44;
  const minX = Math.min(...objects.map((item) => item.x)) - padding;
  const minY = Math.min(...objects.map((item) => item.y)) - padding;
  const maxX = Math.max(...objects.map((item) => item.x + item.w)) + padding;
  const maxY = Math.max(...objects.map((item) => item.y + item.h)) + padding;
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function flowmapPdfV026ScaleForBounds(bounds) {
  const spec = flowmapPdfPageSpec();
  const mapWidth = spec.width - spec.margin * 2;
  const mapHeight = spec.height - spec.margin * 2 - spec.headerHeight - spec.footerHeight;
  return Math.min(mapWidth / bounds.width, mapHeight / bounds.height, 1.18);
}

function flowmapPdfV026ExternalLinks(noteIds, numberMap) {
  const ids = new Set(noteIds);
  return state.edges.flatMap((edge) => {
    const fromInside = ids.has(edge.from);
    const toInside = ids.has(edge.to);
    if (fromInside === toInside) return [];
    const insideId = fromInside ? edge.from : edge.to;
    const outsideId = fromInside ? edge.to : edge.from;
    const outside = getNote(outsideId);
    if (!outside || !flowmapPdfV026VisibleNote(outside)) return [];
    const phase = state.phases.find((item) => item.id === flowmapPdfV026PhaseId(outside));
    return [{
      edgeId: edge.id,
      insideId,
      outsideId,
      direction: fromInside ? 'out' : 'in',
      number: numberMap.get(outsideId) || '',
      title: outside.title || '無題',
      phaseTitle: phase?.title || 'フェーズ外'
    }];
  });
}

function flowmapPdfV026OverviewModel(numberMap) {
  const notes = flowmapPdfV026SortedNotes();
  const phases = [...state.phases];
  const groups = [...state.groups];
  return {
    id: 'overview',
    kind: 'overview',
    title: '全体',
    notes,
    phases,
    groups,
    edges: state.edges.filter((edge) => notes.some((item) => item.id === edge.from) && notes.some((item) => item.id === edge.to)),
    external: [],
    numberMap,
    bounds: flowmapPdfV026BoundsFor(notes, phases, groups)
  };
}

function flowmapPdfV026PhaseModels(numberMap) {
  const pages = [];
  const phases = flowmapPdfV026SortedPhases();
  phases.forEach((phase) => {
    const groups = state.groups.filter((item) => item.phaseId === phase.id);
    const notes = flowmapPdfV026SortedNotes().filter((item) => flowmapPdfV026PhaseId(item) === phase.id);
    if (!notes.length && !groups.length) return;
    const ids = notes.map((item) => item.id);
    const idSet = new Set(ids);
    pages.push({
      id: `phase-${phase.id}`,
      kind: 'phase',
      phaseId: phase.id,
      title: phase.title || '名称未設定のフェーズ',
      notes,
      phases: [phase],
      groups,
      edges: state.edges.filter((edge) => idSet.has(edge.from) && idSet.has(edge.to)),
      external: flowmapPdfV026ExternalLinks(ids, numberMap),
      numberMap,
      bounds: flowmapPdfV026BoundsFor(notes, [phase], groups)
    });
  });

  const looseNotes = flowmapPdfV026SortedNotes().filter((item) => !flowmapPdfV026PhaseId(item));
  if (looseNotes.length) {
    const ids = looseNotes.map((item) => item.id);
    const idSet = new Set(ids);
    const looseGroups = state.groups.filter((item) => !item.phaseId && looseNotes.some((note) => note.groupId === item.id));
    pages.push({
      id: 'phase-unassigned',
      kind: 'phase',
      phaseId: '',
      title: 'フェーズ未設定',
      notes: looseNotes,
      phases: [],
      groups: looseGroups,
      edges: state.edges.filter((edge) => idSet.has(edge.from) && idSet.has(edge.to)),
      external: flowmapPdfV026ExternalLinks(ids, numberMap),
      numberMap,
      bounds: flowmapPdfV026BoundsFor(looseNotes, [], looseGroups)
    });
  }
  return pages;
}

function flowmapPdfV026BuildPages() {
  const numberMap = flowmapPdfV026NumberMap();
  const overview = flowmapPdfV026OverviewModel(numberMap);
  const phasePages = flowmapPdfV026PhaseModels(numberMap);
  const fullScale = flowmapPdfV026ScaleForBounds(overview.bounds);
  flowmapPdfState.fullScale = fullScale;

  let resolved = flowmapPdfState.layout;
  if (resolved === 'auto') resolved = phasePages.length > 1 && fullScale < .40 ? 'phase' : 'overview';
  if (resolved === 'phase' && !phasePages.length) resolved = 'overview';
  flowmapPdfState.resolvedLayout = resolved;

  const pages = resolved === 'phase' ? phasePages : [overview];
  pages.forEach((page, index) => {
    page.pageNumber = index + 1;
    page.pageCount = pages.length;
    page.scale = flowmapPdfV026ScaleForBounds(page.bounds);
  });
  return pages;
}

function flowmapPdfV026ContainerHtml(page, bounds) {
  if (!flowmapPdfState.containers) return '';
  const phases = page.phases.map((phase) => {
    const rect = flowmapPdfPhaseRect(phase);
    return `<section class="pdf-map-phase" style="left:${rect.x - bounds.minX}px;top:${rect.y - bounds.minY}px;width:${rect.w}px;height:${rect.h}px"><strong>${esc(phase.title)}</strong></section>`;
  }).join('');
  const groups = page.groups.map((group) => {
    const rect = flowmapPdfGroupRect(group);
    return `<section class="pdf-map-group" data-color="${esc(group.color || 'gray')}" style="left:${rect.x - bounds.minX}px;top:${rect.y - bounds.minY}px;width:${rect.w}px;height:${rect.h}px"><strong>${esc(group.title)}</strong></section>`;
  }).join('');
  return phases + groups;
}

function flowmapPdfV026EdgeHtml(page, bounds) {
  const markerId = `pdf-map-arrow-${String(page.id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const paths = page.edges.map((item) => {
    const path = edgePath(item);
    const label = item.label && path.labelPoint
      ? `<text class="pdf-edge-label" x="${path.labelPoint.x}" y="${path.labelPoint.y}" text-anchor="middle">${esc(item.label)}</text>`
      : '';
    return `<path class="pdf-map-edge" d="${path.d}" marker-end="url(#${markerId})"></path>${label}`;
  }).join('');
  return `<svg class="pdf-map-edges" viewBox="${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}" preserveAspectRatio="none" aria-hidden="true"><defs><marker id="${markerId}" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L9,4.5 L0,9 Z"></path></marker></defs>${paths}</svg>`;
}

function flowmapPdfV026NoteHtml(item, bounds, page) {
  let html = flowmapPdfNoteHtml(item, bounds);
  if (!html) return '';
  if (flowmapPdfState.numbering) {
    const number = page.numberMap.get(item.id);
    if (number) html = html.replace('<div class="pdf-note-content">', `<span class="pdf-step-number">${esc(number)}</span><div class="pdf-note-content">`);
  }
  const links = page.external.filter((entry) => entry.insideId === item.id);
  if (links.length) {
    const label = links.slice(0, 2).map((entry) => `${entry.direction === 'out' ? '→' : '←'} ${entry.number || '別'}`).join(' / ');
    html = html.replace('</article>', `<span class="pdf-note-external">${esc(label)}</span></article>`);
  }
  return html;
}

function flowmapPdfV026ExternalHtml(page) {
  if (!page.external.length) return '';
  const unique = [];
  const seen = new Set();
  page.external.forEach((entry) => {
    const key = `${entry.direction}:${entry.outsideId}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(entry);
  });
  const shown = unique.slice(0, 6);
  const links = shown.map((entry) => `<span><b>${entry.direction === 'out' ? '→' : '←'} ${esc(entry.number || '別')}</b>${esc(entry.title)}<small>${esc(entry.phaseTitle)}</small></span>`).join('');
  const rest = unique.length > shown.length ? `<em>ほか${unique.length - shown.length}件</em>` : '';
  return `<div class="pdf-external-links"><strong>ページ外との接続</strong><div>${links}${rest}</div></div>`;
}

function flowmapPdfV026SummaryHtml(page) {
  if (!flowmapPdfState.summary) return '';
  const done = page.notes.filter((item) => item.status === 'done').length;
  const doing = page.notes.filter((item) => item.status === 'doing').length;
  const waiting = page.notes.filter((item) => item.status === 'waiting').length;
  const parts = [`<strong>${page.notes.length}</strong><span>工程</span>`];
  if (done) parts.push(`<strong>${done}</strong><span>完了</span>`);
  if (doing) parts.push(`<strong>${doing}</strong><span>対応中</span>`);
  if (waiting) parts.push(`<strong>${waiting}</strong><span>確認待ち</span>`);
  return `<div class="pdf-page-summary">${parts.join('')}</div>`;
}

function flowmapPdfV026PageHtml(page) {
  const spec = flowmapPdfPageSpec();
  const bounds = page.bounds;
  const mapWidth = spec.width - spec.margin * 2;
  const mapHeight = spec.height - spec.margin * 2 - spec.headerHeight - spec.footerHeight;
  const scale = page.scale;
  const renderedW = bounds.width * scale;
  const renderedH = bounds.height * scale;
  const offsetX = Math.max(0, (mapWidth - renderedW) / 2);
  const offsetY = Math.max(0, (mapHeight - renderedH) / 2);
  const boardInfo = typeof getActiveBoardInfo === 'function' ? getActiveBoardInfo() : { name: 'Flowmap' };
  const title = String(flowmapPdfState.title || boardInfo.name || '業務フローマップ').trim() || '業務フローマップ';
  const printedAt = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
  const subtitle = page.kind === 'phase' ? `${page.pageNumber}. ${page.title}` : '全体マップ';
  const notes = page.notes.map((item) => flowmapPdfV026NoteHtml(item, bounds, page)).join('');
  const gridClass = flowmapPdfState.grid ? 'has-pdf-grid' : '';
  return `<section class="pdf-page" data-density="${esc(flowmapPdfState.density)}" data-page-kind="${esc(page.kind)}" style="width:${spec.width}px;height:${spec.height}px;--pdf-page-w:${spec.width}px;--pdf-page-h:${spec.height}px">
    <header class="pdf-page-header"><div class="pdf-page-heading"><span>FLOWMAP</span><h1>${esc(title)}</h1><p>${esc(subtitle)} ・ ${esc(printedAt)} 更新</p></div>${flowmapPdfV026SummaryHtml(page)}</header>
    <div class="pdf-map-frame ${gridClass}" style="left:${spec.margin}px;top:${spec.margin + spec.headerHeight}px;width:${mapWidth}px;height:${mapHeight}px">
      <div class="pdf-map-world" style="width:${bounds.width}px;height:${bounds.height}px;transform:translate(${offsetX}px,${offsetY}px) scale(${scale})">${flowmapPdfV026ContainerHtml(page, bounds)}${flowmapPdfV026EdgeHtml(page, bounds)}${notes}</div>
      ${flowmapPdfLegendHtml()}${flowmapPdfV026ExternalHtml(page)}
    </div>
    <footer class="pdf-page-footer"><span>flowmap</span><span>${esc(spec.label)}・${flowmapPdfState.orientation === 'landscape' ? '横' : '縦'}・${page.pageNumber} / ${page.pageCount}</span></footer>
  </section>`;
}

function flowmapPdfV026LayoutButtonsHtml() {
  return Object.entries(FLOWMAP_PDF_V026_LAYOUTS).map(([value, config]) => `<label class="pdf-segment-option"><input type="radio" name="pdf-layout" value="${value}"><span>${config.label}</span></label>`).join('');
}

flowmapPdfDialogHtml = function flowmapPdfDialogHtmlV026() {
  return `<dialog id="pdf-preview-dialog" class="app-dialog pdf-preview-dialog"><form method="dialog">
    <header><div><span>PDF PREVIEW</span><h2>マップをPDFにする</h2></div><button value="cancel" aria-label="閉じる">×</button></header>
    <div class="pdf-preview-toolbar">
      <label class="pdf-toolbar-title"><span>タイトル</span><input id="pdf-preview-title" type="text" maxlength="100"></label>
      <div class="pdf-toolbar-selects"><label><span>用紙</span><select id="pdf-preview-paper"><option value="a4">A4</option><option value="a3">A3</option></select></label><label><span>向き</span><select id="pdf-preview-orientation"><option value="landscape">横</option><option value="portrait">縦</option></select></label></div>
      <fieldset class="pdf-density-control"><legend>情報量</legend><div class="pdf-segmented">${flowmapPdfV025DensityButtonsHtml()}</div></fieldset>
      <fieldset class="pdf-layout-control"><legend>ページ構成</legend><div class="pdf-segmented">${flowmapPdfV026LayoutButtonsHtml()}</div></fieldset>
      <button type="button" class="button primary pdf-toolbar-print" data-pdf-print>PDFとして保存</button>
    </div>
    <div class="pdf-preview-layout">
      <section id="pdf-preview-canvas" class="pdf-preview-canvas" aria-label="PDFプレビュー"><nav id="pdf-page-navigator" class="pdf-page-navigator" hidden><button type="button" data-pdf-page-prev aria-label="前のページ">←</button><strong id="pdf-page-position">1 / 1</strong><button type="button" data-pdf-page-next aria-label="次のページ">→</button><button type="button" data-pdf-page-all>全ページ</button></nav><div id="pdf-preview-page-host"></div></section>
      <aside class="pdf-preview-controls">
        <div class="pdf-details-heading"><div><span>DETAILS</span><strong>詳細設定</strong></div><span id="pdf-preview-density-label"></span></div>
        <fieldset><legend>マップ表示</legend><label><input id="pdf-preview-containers" type="checkbox"><span>フェーズ・囲みを表示</span></label><label><input id="pdf-preview-grid" type="checkbox"><span>薄い方眼を表示</span></label><label><input id="pdf-preview-expand" type="checkbox"><span>折りたたみ中の付箋も表示</span></label><label><input id="pdf-preview-summary" type="checkbox"><span>ヘッダーに進捗を表示</span></label><label><input id="pdf-preview-numbering" type="checkbox"><span>工程番号を表示</span></label></fieldset>
        <div class="pdf-preview-info"><span>最小マップ倍率</span><strong id="pdf-preview-scale">100%</strong></div>
        <p id="pdf-preview-warning" class="pdf-preview-warning" hidden></p><p class="pdf-preview-help">保存画面では「送信先：PDFに保存」を選択してください。</p>
        <button type="button" class="button quiet pdf-details-close" data-pdf-close>プレビューを閉じる</button>
      </aside>
    </div>
  </form></dialog>`;
};

const flowmapPdfLoadSettingsBeforeV026 = flowmapPdfLoadSettings;
flowmapPdfLoadSettings = function flowmapPdfLoadSettingsV026() {
  flowmapPdfLoadSettingsBeforeV026();
  try {
    const saved = JSON.parse(localStorage.getItem(FLOWMAP_PDF_SETTINGS_KEY) || '{}');
    flowmapPdfState.layout = FLOWMAP_PDF_V026_LAYOUTS[saved.layout] ? saved.layout : 'auto';
    flowmapPdfState.numbering = saved.numbering !== false;
  } catch (error) {
    console.warn('[Flowmap] v0.26 PDF settings could not be restored', error);
  }
};

const flowmapPdfSaveSettingsBeforeV026 = flowmapPdfSaveSettings;
flowmapPdfSaveSettings = function flowmapPdfSaveSettingsV026() {
  flowmapPdfSaveSettingsBeforeV026();
  try {
    const saved = JSON.parse(localStorage.getItem(FLOWMAP_PDF_SETTINGS_KEY) || '{}');
    saved.layout = flowmapPdfState.layout;
    saved.numbering = flowmapPdfState.numbering;
    localStorage.setItem(FLOWMAP_PDF_SETTINGS_KEY, JSON.stringify(saved));
  } catch (error) {
    console.warn('[Flowmap] v0.26 PDF settings could not be saved', error);
  }
};

const flowmapPdfSyncControlsBeforeV026 = flowmapPdfSyncControls;
flowmapPdfSyncControls = function flowmapPdfSyncControlsV026() {
  flowmapPdfSyncControlsBeforeV026();
  const layout = document.querySelector(`input[name="pdf-layout"][value="${flowmapPdfState.layout}"]`);
  if (layout) layout.checked = true;
  const numbering = document.getElementById('pdf-preview-numbering');
  if (numbering) numbering.checked = flowmapPdfState.numbering;
};

flowmapPdfReadControls = function flowmapPdfReadControlsV026() {
  flowmapPdfState.title = document.getElementById('pdf-preview-title')?.value || '';
  flowmapPdfState.paper = document.getElementById('pdf-preview-paper')?.value || 'a4';
  flowmapPdfState.orientation = document.getElementById('pdf-preview-orientation')?.value || 'landscape';
  flowmapPdfState.density = document.querySelector('input[name="pdf-density"]:checked')?.value || 'standard';
  flowmapPdfState.details = flowmapPdfState.density !== 'overview';
  flowmapPdfState.layout = document.querySelector('input[name="pdf-layout"]:checked')?.value || 'auto';
  flowmapPdfState.containers = document.getElementById('pdf-preview-containers')?.checked !== false;
  flowmapPdfState.grid = document.getElementById('pdf-preview-grid')?.checked === true;
  flowmapPdfState.expandCollapsed = document.getElementById('pdf-preview-expand')?.checked !== false;
  flowmapPdfState.summary = document.getElementById('pdf-preview-summary')?.checked !== false;
  flowmapPdfState.numbering = document.getElementById('pdf-preview-numbering')?.checked !== false;
  flowmapPdfSaveSettings();
  flowmapPdfRenderArtifacts();
};

function flowmapPdfV026UpdateNavigator() {
  const navigator = document.getElementById('pdf-page-navigator');
  const position = document.getElementById('pdf-page-position');
  if (!navigator || !position) return;
  const count = flowmapPdfV026Pages.length;
  navigator.hidden = count <= 1;
  const page = Math.min(count, flowmapPdfState.currentPage + 1);
  position.textContent = flowmapPdfState.previewMode === 'all' ? `全${count}ページ` : `${page} / ${count}`;
  navigator.querySelector('[data-pdf-page-prev]')?.toggleAttribute('disabled', flowmapPdfState.previewMode === 'all' || flowmapPdfState.currentPage <= 0);
  navigator.querySelector('[data-pdf-page-next]')?.toggleAttribute('disabled', flowmapPdfState.previewMode === 'all' || flowmapPdfState.currentPage >= count - 1);
  const all = navigator.querySelector('[data-pdf-page-all]');
  if (all) all.textContent = flowmapPdfState.previewMode === 'all' ? '1枚で見る' : '全ページ';
}

flowmapPdfRenderArtifacts = function flowmapPdfRenderArtifactsV026() {
  flowmapPdfV026Pages = flowmapPdfV026BuildPages();
  flowmapPdfState.currentPage = clamp(flowmapPdfState.currentPage, 0, Math.max(0, flowmapPdfV026Pages.length - 1));
  const pagesHtml = flowmapPdfV026Pages.map((page) => flowmapPdfV026PageHtml(page));
  const previewHost = document.getElementById('pdf-preview-page-host');
  const printSheet = document.getElementById('print-sheet');
  if (previewHost) {
    const visible = flowmapPdfState.previewMode === 'all'
      ? pagesHtml.map((html, index) => `<div class="pdf-preview-page-wrapper" data-page-index="${index + 1}">${html}</div>`).join('')
      : `<div class="pdf-preview-page-wrapper" data-page-index="${flowmapPdfState.currentPage}">${pagesHtml[flowmapPdfState.currentPage] || ''}</div>`;
    previewHost.innerHTML = `<div class="pdf-preview-pages" data-preview-mode="${esc(flowmapPdfState.previewMode)}">${visible}</div>`;
  }
  if (printSheet) printSheet.innerHTML = pagesHtml.join('');
  flowmapPdfState.scale = Math.min(...flowmapPdfV026Pages.map((page) => page.scale), 1);
  flowmapPdfApplyPageStyle();
  flowmapPdfV026UpdateNavigator();
  flowmapPdfUpdateSummary();
  requestAnimationFrame(flowmapPdfFitPreview);
};

flowmapPdfFitPreview = function flowmapPdfFitPreviewV026() {
  const canvas = document.getElementById('pdf-preview-canvas');
  const wrappers = [...document.querySelectorAll('#pdf-preview-page-host .pdf-preview-page-wrapper')];
  if (!canvas || !wrappers.length) return;
  const spec = flowmapPdfPageSpec();
  const allPages = flowmapPdfState.previewMode === 'all';
  const availableW = Math.max(180, canvas.clientWidth - 64);
  const availableH = Math.max(180, canvas.clientHeight - 76);
  const scale = allPages ? Math.min(availableW / spec.width, .86) : Math.min(availableW / spec.width, availableH / spec.height, 1);
  wrappers.forEach((wrapper) => {
    const page = wrapper.querySelector('.pdf-page');
    wrapper.style.width = `${spec.width * scale}px`;
    wrapper.style.height = `${spec.height * scale}px`;
    if (page) page.style.transform = `scale(${scale})`;
  });
};

flowmapPdfUpdateSummary = function flowmapPdfUpdateSummaryV026() {
  const scale = flowmapPdfV026Pages.length ? Math.min(...flowmapPdfV026Pages.map((page) => page.scale)) : flowmapPdfState.scale;
  const scaleLabel = document.getElementById('pdf-preview-scale');
  const warning = document.getElementById('pdf-preview-warning');
  const densityLabel = document.getElementById('pdf-preview-density-label');
  if (scaleLabel) scaleLabel.textContent = `${Math.round(scale * 100)}%`;
  if (densityLabel) densityLabel.textContent = `${flowmapPdfV025Density().description}・${flowmapPdfV026Pages.length}ページ`;
  if (!warning) return;

  const canSplit = flowmapPdfV026PhaseModels(flowmapPdfV026NumberMap()).length > 1;
  const overviewNeedsSuggestion = flowmapPdfState.resolvedLayout === 'overview' && flowmapPdfState.fullScale < .65 && canSplit;
  const pageTooSmall = scale < .42;
  if (overviewNeedsSuggestion) {
    warning.hidden = false;
    warning.innerHTML = `<strong>1ページでは文字が小さめです。</strong><span>フェーズ別にすると、付箋を読みやすい大きさで出力できます。</span><div><button type="button" data-pdf-action="phase">フェーズ別に切り替える</button><button type="button" data-pdf-action="a3">A3横にする</button></div>`;
  } else if (pageTooSmall) {
    warning.hidden = false;
    warning.innerHTML = `<strong>このページはかなり縮小されます。</strong><span>A3横にすると読みやすくなります。</span><div><button type="button" data-pdf-action="a3">A3横にする</button></div>`;
  } else {
    warning.hidden = true;
    warning.textContent = '';
  }
};

function flowmapPdfV026HandleClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (target.closest('[data-pdf-page-prev]')) {
    flowmapPdfState.previewMode = 'single';
    flowmapPdfState.currentPage = Math.max(0, flowmapPdfState.currentPage - 1);
    flowmapPdfRenderArtifacts();
  }
  if (target.closest('[data-pdf-page-next]')) {
    flowmapPdfState.previewMode = 'single';
    flowmapPdfState.currentPage = Math.min(flowmapPdfV026Pages.length - 1, flowmapPdfState.currentPage + 1);
    flowmapPdfRenderArtifacts();
  }
  if (target.closest('[data-pdf-page-all]')) {
    flowmapPdfState.previewMode = flowmapPdfState.previewMode === 'all' ? 'single' : 'all';
    flowmapPdfRenderArtifacts();
  }
  const action = target.closest('[data-pdf-action]')?.dataset.pdfAction;
  if (action === 'phase') {
    flowmapPdfState.layout = 'phase';
    flowmapPdfState.previewMode = 'all';
    flowmapPdfSyncControls();
    flowmapPdfSaveSettings();
    flowmapPdfRenderArtifacts();
  }
  if (action === 'a3') {
    flowmapPdfState.paper = 'a3';
    flowmapPdfState.orientation = 'landscape';
    flowmapPdfSyncControls();
    flowmapPdfSaveSettings();
    flowmapPdfRenderArtifacts();
  }
}

const flowmapPdfBindBeforeV026 = flowmapPdfBind;
flowmapPdfBind = function flowmapPdfBindV026() {
  flowmapPdfBindBeforeV026();
  const dialog = document.getElementById('pdf-preview-dialog');
  if (!dialog || flowmapPdfV026Bound) return;
  flowmapPdfV026Bound = true;
  dialog.addEventListener('click', flowmapPdfV026HandleClick);
};

const flowmapPdfInstallTriggerBeforeV026 = flowmapPdfInstallTrigger;
flowmapPdfInstallTrigger = function flowmapPdfInstallTriggerV026() {
  flowmapPdfInstallTriggerBeforeV026();
  const card = document.getElementById('export-pdf-card');
  if (card) {
    const strong = card.querySelector('strong');
    const span = card.querySelector('span');
    if (strong) strong.textContent = '読めるPDFを作る';
    if (span) span.textContent = '全体またはフェーズ別でプレビュー';
  }
};

if (typeof p0SetVersionBadge === 'function') {
  p0SetVersionBadge = function p0SetVersionBadgeV026() {
    const badge = document.querySelector('.version-badge');
    if (badge) badge.textContent = 'v0.26.0';
  };
}
