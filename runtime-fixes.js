/* Flowmap v0.5 compatibility and print runtime */
(() => {
  const escapeHtml = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const compactText = (element) => {
    if (!element) return "";
    const preferred = element.querySelector(
      ".node-title, .task-title, [data-role='title'], strong, h3, h4"
    );
    const source = preferred?.textContent || element.textContent || "";
    return source.replace(/\s+/g, " ").trim();
  };

  const ensurePrintStyles = () => {
    if (document.getElementById("flowmap-print-runtime-style")) return;
    const style = document.createElement("style");
    style.id = "flowmap-print-runtime-style";
    style.textContent = `
      @media screen {
        #print-sheet { display: none; }
      }
      @media print {
        @page { size: A4 portrait; margin: 14mm; }
        html, body {
          width: auto !important;
          height: auto !important;
          overflow: visible !important;
          background: #fff !important;
          color: #252a27 !important;
        }
        #app, #toast-region, .app-dialog { display: none !important; }
        #print-sheet {
          display: block !important;
          position: static !important;
          width: auto !important;
          min-height: 0 !important;
          padding: 0 !important;
          background: #fff !important;
          color: #252a27 !important;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .flowmap-print-cover {
          padding: 0 0 12mm;
          border-top: 7px solid #e5c654;
          border-bottom: 2px solid #3b453f;
          margin-bottom: 8mm;
        }
        .flowmap-print-kicker {
          margin: 5mm 0 3mm;
          color: #6e7771;
          font-size: 9pt;
          font-weight: 800;
          letter-spacing: .14em;
        }
        .flowmap-print-cover h1 {
          margin: 0 0 3mm;
          font-size: 24pt;
          line-height: 1.2;
        }
        .flowmap-print-meta {
          margin: 0;
          color: #6e7771;
          font-size: 9pt;
        }
        .flowmap-print-section { margin: 0 0 8mm; }
        .flowmap-print-section h2 {
          margin: 0 0 3mm;
          padding-bottom: 2mm;
          border-bottom: 1px solid #cfd6d0;
          font-size: 13pt;
        }
        .flowmap-print-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .flowmap-print-list li {
          display: grid;
          grid-template-columns: 8mm 1fr;
          gap: 2mm;
          padding: 2.5mm 0;
          border-bottom: 1px solid #e1e5df;
          break-inside: avoid;
          font-size: 10pt;
        }
        .flowmap-print-number {
          color: #6e7771;
          font-variant-numeric: tabular-nums;
        }
        .flowmap-print-empty {
          padding: 5mm;
          border: 1px dashed #b9c3bc;
          color: #6e7771;
          font-size: 10pt;
        }
      }
    `;
    document.head.appendChild(style);
  };

  window.renderPrint = function renderPrint() {
    ensurePrintStyles();
    const sheet = document.getElementById("print-sheet");
    if (!sheet) return;

    const nodeLayer = document.getElementById("node-layer");
    const rawNodes = nodeLayer ? Array.from(nodeLayer.children) : [];
    const tasks = rawNodes
      .filter((node) => !node.hidden && getComputedStyle(node).display !== "none")
      .map(compactText)
      .filter(Boolean);

    const structureRoot = document.getElementById("structure-tree");
    const structureItems = structureRoot
      ? Array.from(structureRoot.querySelectorAll("button, [data-phase-id], [data-group-id]"))
          .map(compactText)
          .filter(Boolean)
      : [];

    const unique = (items) => [...new Set(items)];
    const taskItems = unique(tasks);
    const structure = unique(structureItems).slice(0, 40);
    const now = new Intl.DateTimeFormat("ja-JP", {
      dateStyle: "long",
      timeStyle: "short"
    }).format(new Date());

    const listHtml = taskItems.length
      ? taskItems.map((title, index) => `
          <li>
            <span class="flowmap-print-number">${String(index + 1).padStart(2, "0")}</span>
            <span>${escapeHtml(title)}</span>
          </li>`).join("")
      : '<div class="flowmap-print-empty">表示中の付箋はありません。</div>';

    const structureHtml = structure.length
      ? `<ul class="flowmap-print-list">${structure.map((title, index) => `
          <li>
            <span class="flowmap-print-number">${String(index + 1).padStart(2, "0")}</span>
            <span>${escapeHtml(title)}</span>
          </li>`).join("")}</ul>`
      : '<div class="flowmap-print-empty">フェーズ・囲み情報はありません。</div>';

    sheet.innerHTML = `
      <article>
        <header class="flowmap-print-cover">
          <p class="flowmap-print-kicker">FLOWMAP</p>
          <h1>業務ホワイトボード</h1>
          <p class="flowmap-print-meta">出力日時：${escapeHtml(now)}　／　付箋数：${taskItems.length}</p>
        </header>
        <section class="flowmap-print-section">
          <h2>全体構造</h2>
          ${structureHtml}
        </section>
        <section class="flowmap-print-section">
          <h2>付箋一覧</h2>
          <ul class="flowmap-print-list">${listHtml}</ul>
        </section>
      </article>
    `;
  };

  ensurePrintStyles();
  window.addEventListener("beforeprint", () => window.renderPrint());
})();