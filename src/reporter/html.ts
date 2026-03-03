/**
 * HTML renderer for the profiling report.
 *
 * Generates a self-contained HTML file (inline CSS/JS, no external dependencies)
 * with a summary table, expandable Package > File > Function tree, and an
 * interactive threshold slider that filters data client-side.
 */

import type { ReportData, PackageEntry, FileEntry, StackFrame } from '../types.js';
import { formatTime, formatPct, escapeHtml } from './format.js';

function formatDepChain(depChain: string[] | undefined): string {
  if (!depChain || depChain.length === 0) return '';
  return `<span class="dep-chain">via ${depChain.map(n => escapeHtml(n)).join(' &gt; ')}</span>`;
}

/** Returns a CSS color based on percentage (0-100) for heat-mapping. */
function heatColor(pct: number): string {
  if (pct >= 35) return 'var(--heat-hot)';
  if (pct >= 15) return 'var(--heat-warm)';
  return 'var(--heat-cool)';
}

/** Returns a data-heat attribute string based on percentage. */
function heatDataAttr(pct: number): string {
  if (pct >= 35) return ' data-heat="hot"';
  if (pct >= 15) return ' data-heat="warm"';
  return '';
}

function generateCss(): string {
  return `
    :root {
      --bg: #0c1021;
      --surface: #161f36;
      --surface-hover: #1e2a4a;
      --text: #e8ecf4;
      --text-secondary: #a3b1c8;
      --muted: #7e8da3;
      --border: #263555;

      --first-party-accent: #34d399;
      --first-party-bg: rgba(52, 211, 153, 0.07);
      --dep-bg: var(--surface);

      --bar-track: #263555;
      --bar-fill: #6bafff;
      --bar-fill-fp: #34d399;
      --bar-fill-async: #b49afa;

      --heat-cool: #6bafff;
      --heat-warm: #fbbf24;
      --heat-hot: #fb7185;

      --other-text: #5e7088;
      --table-header-bg: #111929;
      --shadow: 0 4px 16px rgba(0,0,0,0.5);
      --radius: 10px;

      --font-mono: 'SF Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', Consolas, monospace;
      --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--font-sans);
      background: var(--bg);
      background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.025) 1px, transparent 0);
      background-size: 20px 20px;
      color: var(--text);
      line-height: 1.5;
      padding: 2.5rem;
      max-width: 1000px;
      margin: 0 auto;
      min-height: 100vh;
    }

    /* === Header === */
    h1 {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 0.25rem;
    }

    .meta {
      color: var(--muted);
      font-size: 0.78rem;
      margin-bottom: 1.5rem;
      font-family: var(--font-mono);
    }

    /* === Metric cards === */
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 0.75rem;
      margin-bottom: 2.5rem;
    }

    .metric-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1rem 1.25rem;
      animation: fadeSlideUp 0.4s ease both;
    }

    .metric-card:nth-child(1) { animation-delay: 0s; }
    .metric-card:nth-child(2) { animation-delay: 0.05s; }
    .metric-card:nth-child(3) { animation-delay: 0.1s; }
    .metric-card:nth-child(4) { animation-delay: 0.15s; }

    .metric-value {
      font-family: var(--font-mono);
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      line-height: 1.2;
    }

    .metric-label {
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin-top: 0.35rem;
    }

    .metric-card.wall .metric-value { color: var(--text); }
    .metric-card.cpu .metric-value { color: var(--bar-fill); }
    .metric-card.utilization .metric-value { color: var(--heat-warm); }
    .metric-card.async .metric-value { color: var(--bar-fill-async); }

    /* === Section headings === */
    h2 {
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--muted);
      margin-bottom: 1rem;
      margin-top: 2.5rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--border);
    }

    /* === Controls === */
    .controls-bar {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }

    .threshold-control {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.85rem;
    }

    .threshold-control label {
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 0.7rem;
    }

    .threshold-control input[type="range"] {
      width: 160px;
      height: 6px;
      appearance: none;
      -webkit-appearance: none;
      background: var(--bar-track);
      border-radius: 3px;
      outline: none;
    }

    .threshold-control input[type="range"]::-webkit-slider-thumb {
      appearance: none;
      -webkit-appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--bar-fill);
      cursor: pointer;
      box-shadow: 0 0 8px rgba(107, 175, 255, 0.4);
      transition: box-shadow 0.2s;
    }

    .threshold-control input[type="range"]::-webkit-slider-thumb:hover {
      box-shadow: 0 0 12px rgba(107, 175, 255, 0.6);
    }

    .threshold-control input[type="range"]::-moz-range-thumb {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--bar-fill);
      cursor: pointer;
      border: none;
    }

    .threshold-control span {
      font-family: var(--font-mono);
      font-size: 0.8rem;
      min-width: 3.5em;
      color: var(--text-secondary);
    }

    /* Sort control */
    .sort-control {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      margin-left: auto;
      font-size: 0.85rem;
    }

    .sort-control label {
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 0.7rem;
    }

    .sort-toggle {
      display: inline-flex;
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
    }

    .sort-toggle button {
      font-family: var(--font-sans);
      font-size: 0.72rem;
      padding: 0.3rem 0.75rem;
      border: none;
      background: var(--surface);
      color: var(--muted);
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
    }

    .sort-toggle button:hover {
      background: var(--surface-hover);
      color: var(--text-secondary);
    }

    .sort-toggle button + button {
      border-left: 1px solid var(--border);
    }

    .sort-toggle button.active {
      background: var(--bar-fill);
      color: #fff;
    }

    .sort-toggle button.active-async {
      background: var(--bar-fill-async);
      color: #fff;
    }

    /* Tree controls */
    .tree-controls {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .search-wrapper {
      position: relative;
      flex: 1;
      max-width: 260px;
    }

    .search-wrapper::before {
      content: '\\2315';
      position: absolute;
      left: 0.65rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--muted);
      font-size: 0.85rem;
      pointer-events: none;
    }

    .search-input {
      width: 100%;
      padding: 0.4rem 0.75rem 0.4rem 2rem;
      font-family: var(--font-mono);
      font-size: 0.78rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      outline: none;
      transition: border-color 0.2s;
    }

    .search-input:focus {
      border-color: var(--bar-fill);
    }

    .search-input::placeholder {
      color: var(--muted);
    }

    .tree-btn {
      font-family: var(--font-sans);
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0.4rem 0.65rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--muted);
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }

    .tree-btn:hover {
      background: var(--surface-hover);
      color: var(--text-secondary);
    }

    /* === Summary table === */
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      margin-bottom: 1rem;
      animation: fadeSlideUp 0.4s ease 0.2s both;
    }

    th {
      text-align: left;
      background: var(--table-header-bg);
      padding: 0.65rem 0.85rem;
      font-size: 0.62rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 1;
    }

    td {
      padding: 0.6rem 0.85rem;
      border-bottom: 1px solid var(--border);
      font-size: 0.85rem;
    }

    tr:last-child td { border-bottom: none; }

    tr:hover td { background: var(--surface-hover); }

    tr.first-party td:first-child {
      border-left: 3px solid var(--first-party-accent);
      padding-left: calc(0.85rem - 3px);
    }

    td.pkg-name {
      font-family: var(--font-mono);
      font-size: 0.85rem;
      font-weight: 500;
    }

    .dep-chain {
      display: block;
      font-size: 0.68rem;
      color: var(--muted);
      font-family: var(--font-sans);
    }

    td.numeric {
      text-align: right;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      color: var(--text-secondary);
    }

    td.async-col { color: var(--bar-fill-async); }

    .bar-cell {
      width: 30%;
      padding-right: 1rem;
    }

    .bar-container {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .bar-track {
      flex: 1;
      height: 6px;
      background: var(--bar-track);
      border-radius: 3px;
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      border-radius: 3px;
      background: var(--bar-fill);
      min-width: 1px;
      transition: width 0.3s ease;
    }

    tr.first-party .bar-fill {
      background: var(--bar-fill-fp);
    }

    .bar-pct {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      min-width: 3.5em;
      text-align: right;
      color: var(--text-secondary);
    }

    tr.other-row td {
      color: var(--other-text);
      font-style: italic;
    }

    /* Heat indicators on dependency rows */
    tr.dependency[data-heat="warm"] td:first-child {
      border-left: 3px solid var(--heat-warm);
      padding-left: calc(0.85rem - 3px);
    }
    tr.dependency[data-heat="hot"] td:first-child {
      border-left: 3px solid var(--heat-hot);
      padding-left: calc(0.85rem - 3px);
    }

    /* === Tree === */
    .tree {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      animation: fadeSlideUp 0.4s ease 0.3s both;
    }

    details {
      border-bottom: 1px solid var(--border);
    }

    details:last-child { border-bottom: none; }

    details details { border-bottom: 1px solid var(--border); }
    details details:last-child { border-bottom: none; }

    summary {
      cursor: pointer;
      list-style: none;
      padding: 0.65rem 0.85rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.9rem;
      user-select: none;
      transition: background 0.15s;
    }

    summary:hover { background: var(--surface-hover); }

    summary::-webkit-details-marker { display: none; }

    summary::before {
      content: '\\25B6';
      font-size: 0.55rem;
      color: var(--muted);
      transition: transform 0.2s ease;
      flex-shrink: 0;
    }

    details[open] > summary::before {
      transform: rotate(90deg);
    }

    .tree-name {
      font-family: var(--font-mono);
      font-size: 0.85rem;
      flex: 1;
    }

    .tree-label {
      font-family: var(--font-sans);
      font-size: 0.6rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      flex-shrink: 0;
    }

    .tree-label.pkg { background: #1e293b; color: #a3b4c8; }
    .tree-label.file { background: rgba(107, 175, 255, 0.14); color: #6bafff; }
    .tree-label.fn { background: rgba(163, 177, 200, 0.1); color: #8494a7; }

    .tree-stats {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--muted);
      flex-shrink: 0;
    }

    .tree-async {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--bar-fill-async);
      flex-shrink: 0;
    }

    /* Level indentation with guide lines */
    .level-0 > summary { padding-left: 0.85rem; }
    .level-1 > summary { padding-left: 2.25rem; }
    .level-1 {
      position: relative;
    }
    .level-1::before {
      content: '';
      position: absolute;
      left: 1.4rem;
      top: 0;
      bottom: 0;
      width: 1px;
      background: var(--border);
    }
    .level-2 {
      padding: 0.5rem 0.85rem 0.5rem 3.65rem;
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      position: relative;
      transition: background 0.15s;
    }
    .level-2:hover { background: var(--surface-hover); }
    .level-2::before {
      content: '';
      position: absolute;
      left: 2.7rem;
      top: 0;
      bottom: 0;
      width: 1px;
      background: var(--border);
    }

    /* First-party highlight */
    .fp-pkg > summary {
      background: var(--first-party-bg);
      border-left: 3px solid var(--first-party-accent);
    }

    .fp-pkg > summary:hover {
      background: rgba(16, 185, 129, 0.08);
    }

    /* Heat borders on dependency tree items */
    .level-0[data-heat="warm"] > summary {
      border-left: 3px solid var(--heat-warm);
    }
    .level-0[data-heat="hot"] > summary {
      border-left: 3px solid var(--heat-hot);
    }

    .other-item {
      padding: 0.5rem 0.85rem;
      color: var(--other-text);
      font-style: italic;
      font-size: 0.8rem;
    }

    .other-item.indent-1 { padding-left: 2.25rem; }
    .other-item.indent-2 { padding-left: 3.65rem; }

    /* Function-level source toggle */
    .level-2.has-source { padding: 0; font-size: 0.85rem; display: block; }
    .level-2.has-source > summary {
      padding: 0.5rem 0.85rem 0.5rem 3.65rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      list-style: none;
      transition: background 0.15s;
    }
    .level-2.has-source > summary:hover { background: var(--surface-hover); }
    .level-2.has-source > summary::-webkit-details-marker { display: none; }
    .level-2.has-source > summary::before {
      content: '\\25B6';
      font-size: 0.45rem;
      color: var(--muted);
      transition: transform 0.2s ease;
      flex-shrink: 0;
    }
    .level-2.has-source[open] > summary::before {
      transform: rotate(90deg);
    }

    /* Source snippet */
    .source-snippet {
      margin: 0;
      padding: 0.5rem 0;
      background: #1e1e2e;
      color: #cdd6f4;
      overflow-x: auto;
      font-family: var(--font-mono);
      font-size: 0.78rem;
      line-height: 1.7;
      border-top: 1px solid #2e3350;
    }
    .source-snippet code { display: block; }
    .src-line {
      display: flex;
      padding: 0 1rem 0 3.65rem;
      white-space: pre;
    }
    .src-hot {
      background: rgba(251, 113, 133, 0.1);
      border-left: 3px solid var(--heat-hot);
      padding-left: calc(3.65rem - 3px);
    }
    .src-lineno {
      display: inline-block;
      width: 3.5em;
      text-align: right;
      color: #6e7289;
      padding-right: 1em;
      flex-shrink: 0;
      user-select: none;
    }
    .tok-kw { color: #d4b5ff; }
    .tok-str { color: #a6e3a1; }
    .tok-cmt { color: #7f839c; font-style: italic; }
    .tok-num { color: #fab387; }

    /* Async call stack */
    .async-stack-toggle { cursor: pointer; color: var(--bar-fill-async); font-size: 0.75rem; margin-left: 0.5rem; }
    .async-stack-toggle:hover { text-decoration: underline; }
    .async-stack {
      margin: 0.25rem 0 0.25rem 3.65rem;
      padding: 0.5rem 0.85rem;
      background: rgba(167, 139, 250, 0.06);
      border-left: 3px solid var(--bar-fill-async);
      border-radius: 0 6px 6px 0;
      font-size: 0.78rem;
      line-height: 1.7;
    }
    .async-stack-frame { font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-secondary); }
    .async-stack-frame.current { font-weight: 600; color: var(--bar-fill-async); }
    .async-stack-arrow { color: var(--muted); margin: 0 0.25rem; font-size: 0.65rem; }

    /* Animations */
    @keyframes fadeSlideUp {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Responsive */
    @media (max-width: 600px) {
      body { padding: 1rem; }
      .bar-cell { width: 25%; }
      .sort-control { margin-left: 0; margin-top: 0.5rem; }
      .metrics { grid-template-columns: repeat(2, 1fr); }
      .tree-controls { flex-wrap: wrap; }
      .search-wrapper { max-width: none; flex-basis: 100%; }
    }
  `;
}

function generateJs(): string {
  return `
(function() {
  var DATA = window.__REPORT_DATA__;
  if (!DATA) return;
  var HAS_ASYNC = !!(DATA.totalAsyncTimeUs && DATA.totalAsyncTimeUs > 0);

  function formatTime(us) {
    if (us === 0) return '0ms';
    var ms = us / 1000;
    if (ms >= 1000) return (ms / 1000).toFixed(2) + 's';
    var rounded = Math.round(ms);
    return (rounded < 1 ? 1 : rounded) + 'ms';
  }

  function formatPct(us, totalUs) {
    if (totalUs === 0) return '0.0%';
    return ((us / totalUs) * 100).toFixed(1) + '%';
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function depChainHtml(depChain) {
    if (!depChain || depChain.length === 0) return '';
    return '<span class="dep-chain">via ' + depChain.map(function(n) { return escapeHtml(n); }).join(' &gt; ') + '</span>';
  }

  function heatColor(pct) {
    if (pct >= 35) return 'var(--heat-hot)';
    if (pct >= 15) return 'var(--heat-warm)';
    return 'var(--heat-cool)';
  }

  function heatAttr(pct) {
    if (pct >= 35) return ' data-heat="hot"';
    if (pct >= 15) return ' data-heat="warm"';
    return '';
  }

  var sortBy = 'cpu';

  function metricTime(entry) {
    return sortBy === 'async' ? (entry.asyncTimeUs || 0) : entry.timeUs;
  }

  function sortDesc(arr) {
    return arr.slice().sort(function(a, b) { return metricTime(b) - metricTime(a); });
  }

  function applyThreshold(data, pct) {
    var totalBase = sortBy === 'async' ? (data.totalAsyncTimeUs || 0) : data.totalTimeUs;
    var threshold = totalBase * (pct / 100);
    var filtered = [];
    var otherCount = 0;

    var pkgs = sortDesc(data.packages);

    for (var i = 0; i < pkgs.length; i++) {
      var pkg = pkgs[i];
      if (metricTime(pkg) < threshold) {
        otherCount++;
        continue;
      }

      var files = [];
      var fileOtherCount = 0;

      var sortedFiles = sortDesc(pkg.files);

      for (var j = 0; j < sortedFiles.length; j++) {
        var file = sortedFiles[j];
        if (metricTime(file) < threshold) {
          fileOtherCount++;
          continue;
        }

        var functions = [];
        var funcOtherCount = 0;

        var sortedFns = sortDesc(file.functions);

        for (var k = 0; k < sortedFns.length; k++) {
          var fn = sortedFns[k];
          if (metricTime(fn) < threshold) {
            funcOtherCount++;
            continue;
          }
          functions.push(fn);
        }

        files.push({
          name: file.name,
          timeUs: file.timeUs,
          pct: file.pct,
          sampleCount: file.sampleCount,
          asyncTimeUs: file.asyncTimeUs,
          asyncPct: file.asyncPct,
          asyncOpCount: file.asyncOpCount,
          functions: functions,
          otherCount: funcOtherCount
        });
      }

      filtered.push({
        name: pkg.name,
        timeUs: pkg.timeUs,
        pct: pkg.pct,
        isFirstParty: pkg.isFirstParty,
        sampleCount: pkg.sampleCount,
        depChain: pkg.depChain,
        asyncTimeUs: pkg.asyncTimeUs,
        asyncPct: pkg.asyncPct,
        asyncOpCount: pkg.asyncOpCount,
        files: files,
        otherCount: fileOtherCount
      });
    }

    return { packages: filtered, otherCount: otherCount };
  }

  function filterByQuery(result, query) {
    var pkgs = [];
    var otherCount = 0;

    for (var i = 0; i < result.packages.length; i++) {
      var pkg = result.packages[i];
      var pkgMatch = pkg.name.toLowerCase().indexOf(query) !== -1;

      var files = [];
      var fileOther = 0;

      for (var j = 0; j < pkg.files.length; j++) {
        var file = pkg.files[j];
        var fileMatch = file.name.toLowerCase().indexOf(query) !== -1;

        var fns = [];
        var fnOther = 0;

        for (var k = 0; k < file.functions.length; k++) {
          var fn = file.functions[k];
          if (pkgMatch || fileMatch || fn.name.toLowerCase().indexOf(query) !== -1) {
            fns.push(fn);
          } else {
            fnOther++;
          }
        }

        if (pkgMatch || fileMatch || fns.length > 0) {
          files.push({
            name: file.name,
            timeUs: file.timeUs,
            pct: file.pct,
            sampleCount: file.sampleCount,
            asyncTimeUs: file.asyncTimeUs,
            asyncPct: file.asyncPct,
            asyncOpCount: file.asyncOpCount,
            functions: fns,
            otherCount: fnOther
          });
        } else {
          fileOther++;
        }
      }

      if (pkgMatch || files.length > 0) {
        pkgs.push({
          name: pkg.name,
          timeUs: pkg.timeUs,
          pct: pkg.pct,
          isFirstParty: pkg.isFirstParty,
          sampleCount: pkg.sampleCount,
          depChain: pkg.depChain,
          asyncTimeUs: pkg.asyncTimeUs,
          asyncPct: pkg.asyncPct,
          asyncOpCount: pkg.asyncOpCount,
          files: files,
          otherCount: fileOther
        });
      } else {
        otherCount++;
      }
    }

    return { packages: pkgs, otherCount: otherCount };
  }

  function renderTable(packages, otherCount, totalTimeUs, totalAsyncTimeUs) {
    var rows = '';
    var isAsync = sortBy === 'async';
    var barTotal = isAsync ? (totalAsyncTimeUs || 0) : totalTimeUs;
    for (var i = 0; i < packages.length; i++) {
      var pkg = packages[i];
      var cls = pkg.isFirstParty ? 'first-party' : 'dependency';
      var barVal = isAsync ? (pkg.asyncTimeUs || 0) : pkg.timeUs;
      var pctVal = barTotal > 0 ? (barVal / barTotal) * 100 : 0;
      var barStyle = 'width:' + pctVal.toFixed(1) + '%';
      var heat = '';
      if (!pkg.isFirstParty) {
        barStyle += ';background:' + heatColor(pctVal);
        heat = heatAttr(pctVal);
      }
      rows += '<tr class="' + cls + '"' + heat + '>' +
        '<td class="pkg-name">' + escapeHtml(pkg.name) + depChainHtml(pkg.depChain) + '</td>' +
        '<td class="numeric">' + escapeHtml(formatTime(pkg.timeUs)) + '</td>' +
        '<td class="bar-cell"><div class="bar-container">' +
          '<div class="bar-track"><div class="bar-fill" style="' + barStyle + '"></div></div>' +
          '<span class="bar-pct">' + escapeHtml(formatPct(barVal, barTotal)) + '</span>' +
        '</div></td>' +
        '<td class="numeric">' + pkg.sampleCount + '</td>';
      if (HAS_ASYNC) {
        rows += '<td class="numeric async-col">' + escapeHtml(formatTime(pkg.asyncTimeUs || 0)) + '</td>' +
          '<td class="numeric async-col">' + (pkg.asyncOpCount || 0) + '</td>';
      }
      rows += '</tr>';
    }

    if (otherCount > 0) {
      rows += '<tr class="other-row">' +
        '<td class="pkg-name">Other (' + otherCount + ' items)</td>' +
        '<td class="numeric"></td>' +
        '<td class="bar-cell"></td>' +
        '<td class="numeric"></td>';
      if (HAS_ASYNC) {
        rows += '<td class="numeric"></td><td class="numeric"></td>';
      }
      rows += '</tr>';
    }

    var headers = '<th>Package</th><th>CPU Time</th><th>% of Total</th><th>Samples</th>';
    if (HAS_ASYNC) {
      headers += '<th>Async I/O Wait</th><th>Async Ops</th>';
    }

    return '<table><thead><tr>' + headers + '</tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function asyncStats(entry) {
    if (!HAS_ASYNC) return '';
    var at = entry.asyncTimeUs || 0;
    var ac = entry.asyncOpCount || 0;
    if (at === 0 && ac === 0) return '';
    return ' <span class="tree-async">| ' + escapeHtml(formatTime(at)) + ' async &middot; ' + ac + ' ops</span>';
  }

  function renderCallStackJs(stack, currentFnName) {
    var html = '<div class="async-stack">';
    for (var i = 0; i < stack.length; i++) {
      var frame = stack[i];
      var label = escapeHtml(frame.pkg) + ' &rsaquo; ' + escapeHtml(frame.file) + ' &rsaquo; ' + escapeHtml(frame.functionId);
      var isCurrent = frame.functionId === currentFnName;
      html += '<div class="async-stack-frame' + (isCurrent ? ' current' : '') + '">' + label + '</div>';
      if (i < stack.length - 1) {
        html += '<div class="async-stack-arrow">&darr;</div>';
      }
    }
    html += '</div>';
    return html;
  }

  function renderTree(packages, otherCount, totalTimeUs, totalAsyncTimeUs) {
    var html = '<div class="tree">';
    var isAsync = sortBy === 'async';
    var pctTotal = isAsync ? (totalAsyncTimeUs || 0) : totalTimeUs;

    for (var i = 0; i < packages.length; i++) {
      var pkg = packages[i];
      var fpCls = pkg.isFirstParty ? ' fp-pkg' : '';
      var pkgTime = isAsync ? (pkg.asyncTimeUs || 0) : pkg.timeUs;
      var pkgPct = pctTotal > 0 ? (pkgTime / pctTotal) * 100 : 0;
      var heat = pkg.isFirstParty ? '' : heatAttr(pkgPct);
      html += '<details class="level-0' + fpCls + '"' + heat + '><summary>';
      html += '<span class="tree-label pkg">pkg</span>';
      html += '<span class="tree-name">' + escapeHtml(pkg.name) + '</span>';
      html += depChainHtml(pkg.depChain);
      html += '<span class="tree-stats">' + escapeHtml(formatTime(pkgTime)) + ' &middot; ' + escapeHtml(formatPct(pkgTime, pctTotal)) + ' &middot; ' + pkg.sampleCount + ' samples</span>';
      html += asyncStats(pkg);
      html += '</summary>';

      for (var j = 0; j < pkg.files.length; j++) {
        var file = pkg.files[j];
        var fileTime = isAsync ? (file.asyncTimeUs || 0) : file.timeUs;
        html += '<details class="level-1"><summary>';
        html += '<span class="tree-label file">file</span>';
        html += '<span class="tree-name">' + escapeHtml(file.name) + '</span>';
        html += '<span class="tree-stats">' + escapeHtml(formatTime(fileTime)) + ' &middot; ' + escapeHtml(formatPct(fileTime, pctTotal)) + ' &middot; ' + file.sampleCount + ' samples</span>';
        html += asyncStats(file);
        html += '</summary>';

        for (var k = 0; k < file.functions.length; k++) {
          var fn = file.functions[k];
          var fnTime = isAsync ? (fn.asyncTimeUs || 0) : fn.timeUs;
          var hasExpandable = fn.sourceHtml || fn.asyncCallStack;
          var csHtml = fn.asyncCallStack ? renderCallStackJs(fn.asyncCallStack, fn.name) : '';
          if (hasExpandable) {
            html += '<details class="level-2 has-source"><summary>';
            html += '<span class="tree-label fn">fn</span> ';
            html += '<span class="tree-name">' + escapeHtml(fn.name) + '</span>';
            html += ' <span class="tree-stats">' + escapeHtml(formatTime(fnTime)) + ' &middot; ' + escapeHtml(formatPct(fnTime, pctTotal)) + ' &middot; ' + fn.sampleCount + ' samples</span>';
            html += asyncStats(fn);
            html += '</summary>' + csHtml + (fn.sourceHtml || '') + '</details>';
          } else {
            html += '<div class="level-2">';
            html += '<span class="tree-label fn">fn</span> ';
            html += '<span class="tree-name">' + escapeHtml(fn.name) + '</span>';
            html += ' <span class="tree-stats">' + escapeHtml(formatTime(fnTime)) + ' &middot; ' + escapeHtml(formatPct(fnTime, pctTotal)) + ' &middot; ' + fn.sampleCount + ' samples</span>';
            html += asyncStats(fn);
            html += '</div>';
          }
        }

        if (file.otherCount > 0) {
          html += '<div class="other-item indent-2">Other (' + file.otherCount + ' items)</div>';
        }

        html += '</details>';
      }

      if (pkg.otherCount > 0) {
        html += '<div class="other-item indent-1">Other (' + pkg.otherCount + ' items)</div>';
      }

      html += '</details>';
    }

    if (otherCount > 0) {
      html += '<div class="other-item">Other (' + otherCount + ' packages)</div>';
    }

    html += '</div>';
    return html;
  }

  var currentThreshold = 5;
  var currentQuery = '';

  function update(pct) {
    currentThreshold = pct;
    var result = applyThreshold(DATA, pct);

    if (currentQuery) {
      result = filterByQuery(result, currentQuery);
    }

    var summaryEl = document.getElementById('summary-container');
    var treeEl = document.getElementById('tree-container');
    if (summaryEl) summaryEl.innerHTML = renderTable(result.packages, result.otherCount, DATA.totalTimeUs, DATA.totalAsyncTimeUs);
    if (treeEl) {
      treeEl.innerHTML = renderTree(result.packages, result.otherCount, DATA.totalTimeUs, DATA.totalAsyncTimeUs);
      if (currentQuery) {
        var details = treeEl.querySelectorAll('details');
        for (var d = 0; d < details.length; d++) details[d].open = true;
      }
    }
  }

  function updateSortButtons() {
    var btns = document.querySelectorAll('.sort-toggle button');
    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      btn.className = '';
      if (btn.getAttribute('data-sort') === sortBy) {
        btn.className = sortBy === 'async' ? 'active-async' : 'active';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    update(5);

    var slider = document.getElementById('threshold-slider');
    var label = document.getElementById('threshold-value');
    if (slider) {
      slider.addEventListener('input', function() {
        var val = parseFloat(slider.value);
        if (label) label.textContent = val.toFixed(1) + '%';
        update(val);
      });
    }

    var sortBtns = document.querySelectorAll('.sort-toggle button');
    for (var i = 0; i < sortBtns.length; i++) {
      sortBtns[i].addEventListener('click', function() {
        sortBy = this.getAttribute('data-sort') || 'cpu';
        updateSortButtons();
        update(currentThreshold);
      });
    }

    /* Search */
    var searchTimeout;
    var searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(function() {
          currentQuery = searchInput.value.toLowerCase().trim();
          update(currentThreshold);
        }, 150);
      });
    }

    /* Expand / Collapse all */
    var expandBtn = document.getElementById('expand-all');
    if (expandBtn) {
      expandBtn.addEventListener('click', function() {
        var els = document.querySelectorAll('#tree-container details');
        for (var d = 0; d < els.length; d++) els[d].open = true;
      });
    }

    var collapseBtn = document.getElementById('collapse-all');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', function() {
        var els = document.querySelectorAll('#tree-container details');
        for (var d = 0; d < els.length; d++) els[d].open = false;
      });
    }
  });
})();
`;
}

function renderSummaryTable(
  packages: PackageEntry[],
  otherCount: number,
  totalTimeUs: number,
  hasAsync: boolean,
): string {
  let rows = '';

  for (const pkg of packages) {
    const cls = pkg.isFirstParty ? 'first-party' : 'dependency';
    const pctVal = totalTimeUs > 0 ? (pkg.timeUs / totalTimeUs) * 100 : 0;
    const barColor = pkg.isFirstParty ? '' : `background:${heatColor(pctVal)};`;
    const heatAttr = pkg.isFirstParty ? '' : heatDataAttr(pctVal);
    rows += `
      <tr class="${cls}"${heatAttr}>
        <td class="pkg-name">${escapeHtml(pkg.name)}${formatDepChain(pkg.depChain)}</td>
        <td class="numeric">${escapeHtml(formatTime(pkg.timeUs))}</td>
        <td class="bar-cell">
          <div class="bar-container">
            <div class="bar-track"><div class="bar-fill" style="width:${pctVal.toFixed(1)}%;${barColor}"></div></div>
            <span class="bar-pct">${escapeHtml(formatPct(pkg.timeUs, totalTimeUs))}</span>
          </div>
        </td>
        <td class="numeric">${pkg.sampleCount}</td>${hasAsync ? `
        <td class="numeric async-col">${escapeHtml(formatTime(pkg.asyncTimeUs ?? 0))}</td>
        <td class="numeric async-col">${pkg.asyncOpCount ?? 0}</td>` : ''}
      </tr>`;
  }

  if (otherCount > 0) {
    rows += `
      <tr class="other-row">
        <td class="pkg-name">Other (${otherCount} items)</td>
        <td class="numeric"></td>
        <td class="bar-cell"></td>
        <td class="numeric"></td>${hasAsync ? `
        <td class="numeric"></td>
        <td class="numeric"></td>` : ''}
      </tr>`;
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Package</th>
          <th>CPU Time</th>
          <th>% of Total</th>
          <th>Samples</th>${hasAsync ? `
          <th>Async I/O Wait</th>
          <th>Async Ops</th>` : ''}
        </tr>
      </thead>
      <tbody>${rows}
      </tbody>
    </table>`;
}

function formatAsyncStats(entry: { asyncTimeUs?: number; asyncOpCount?: number }): string {
  const at = entry.asyncTimeUs ?? 0;
  const ac = entry.asyncOpCount ?? 0;
  if (at === 0 && ac === 0) return '';
  return ` <span class="tree-async">| ${escapeHtml(formatTime(at))} async &middot; ${ac} ops</span>`;
}

function renderCallStack(stack: StackFrame[], currentFnName: string): string {
  let html = '<div class="async-stack">';
  for (let i = 0; i < stack.length; i++) {
    const frame = stack[i];
    const label = `${escapeHtml(frame.pkg)} &rsaquo; ${escapeHtml(frame.file)} &rsaquo; ${escapeHtml(frame.functionId)}`;
    const isCurrent = frame.functionId === currentFnName;
    html += `<div class="async-stack-frame${isCurrent ? ' current' : ''}">${label}</div>`;
    if (i < stack.length - 1) {
      html += '<div class="async-stack-arrow">&darr;</div>';
    }
  }
  html += '</div>';
  return html;
}

function renderTree(
  packages: PackageEntry[],
  otherCount: number,
  totalTimeUs: number,
  hasAsync: boolean,
): string {
  let html = '<div class="tree">';

  for (const pkg of packages) {
    const fpCls = pkg.isFirstParty ? ' fp-pkg' : '';
    const heatAttr = pkg.isFirstParty ? '' : heatDataAttr(totalTimeUs > 0 ? (pkg.timeUs / totalTimeUs) * 100 : 0);
    html += `<details class="level-0${fpCls}"${heatAttr}>`;
    html += `<summary>`;
    html += `<span class="tree-label pkg">pkg</span>`;
    html += `<span class="tree-name">${escapeHtml(pkg.name)}</span>`;
    html += formatDepChain(pkg.depChain);
    html += `<span class="tree-stats">${escapeHtml(formatTime(pkg.timeUs))} &middot; ${escapeHtml(formatPct(pkg.timeUs, totalTimeUs))} &middot; ${pkg.sampleCount} samples</span>`;
    if (hasAsync) html += formatAsyncStats(pkg);
    html += `</summary>`;

    for (const file of pkg.files) {
      html += `<details class="level-1">`;
      html += `<summary>`;
      html += `<span class="tree-label file">file</span>`;
      html += `<span class="tree-name">${escapeHtml(file.name)}</span>`;
      html += `<span class="tree-stats">${escapeHtml(formatTime(file.timeUs))} &middot; ${escapeHtml(formatPct(file.timeUs, totalTimeUs))} &middot; ${file.sampleCount} samples</span>`;
      if (hasAsync) html += formatAsyncStats(file);
      html += `</summary>`;

      for (const fn of file.functions) {
        const hasExpandable = fn.sourceHtml || fn.asyncCallStack;
        const callStackHtml = fn.asyncCallStack ? renderCallStack(fn.asyncCallStack, fn.name) : '';
        if (hasExpandable) {
          html += `<details class="level-2 has-source"><summary>`;
          html += `<span class="tree-label fn">fn</span> `;
          html += `<span class="tree-name">${escapeHtml(fn.name)}</span>`;
          html += ` <span class="tree-stats">${escapeHtml(formatTime(fn.timeUs))} &middot; ${escapeHtml(formatPct(fn.timeUs, totalTimeUs))} &middot; ${fn.sampleCount} samples</span>`;
          if (hasAsync) html += formatAsyncStats(fn);
          html += `</summary>${callStackHtml}${fn.sourceHtml ?? ''}</details>`;
        } else {
          html += `<div class="level-2">`;
          html += `<span class="tree-label fn">fn</span> `;
          html += `<span class="tree-name">${escapeHtml(fn.name)}</span>`;
          html += ` <span class="tree-stats">${escapeHtml(formatTime(fn.timeUs))} &middot; ${escapeHtml(formatPct(fn.timeUs, totalTimeUs))} &middot; ${fn.sampleCount} samples</span>`;
          if (hasAsync) html += formatAsyncStats(fn);
          html += `</div>`;
        }
      }

      if (file.otherCount > 0) {
        html += `<div class="other-item indent-2">Other (${file.otherCount} items)</div>`;
      }

      html += `</details>`;
    }

    if (pkg.otherCount > 0) {
      html += `<div class="other-item indent-1">Other (${pkg.otherCount} items)</div>`;
    }

    html += `</details>`;
  }

  if (otherCount > 0) {
    html += `<div class="other-item">Other (${otherCount} packages)</div>`;
  }

  html += '</div>';
  return html;
}

/**
 * Render a complete self-contained HTML report from aggregated profiling data.
 *
 * @param data - Aggregated report data (packages, timing, project name).
 * @returns A full HTML document string with inline CSS/JS and no external dependencies.
 */
export function renderHtml(data: ReportData): string {
  const hasAsync = !!(data.totalAsyncTimeUs && data.totalAsyncTimeUs > 0);
  const summaryTable = renderSummaryTable(data.packages, data.otherCount, data.totalTimeUs, hasAsync);
  const tree = renderTree(data.packages, data.otherCount, data.totalTimeUs, hasAsync);
  const totalFormatted = escapeHtml(formatTime(data.totalTimeUs));

  const titleName = escapeHtml(data.projectName);

  const wallFormatted = data.wallTimeUs ? escapeHtml(formatTime(data.wallTimeUs)) : null;
  let metaLine = `Generated ${escapeHtml(data.timestamp)}`;
  if (wallFormatted) {
    metaLine += ` &middot; Wall time: ${wallFormatted}`;
  }
  metaLine += ` &middot; CPU time: ${totalFormatted}`;
  if (hasAsync) {
    metaLine += ` &middot; Async I/O wait: ${escapeHtml(formatTime(data.totalAsyncTimeUs!))}`;
  }

  // Metric cards
  let metricsHtml = '';
  if (data.wallTimeUs) {
    metricsHtml += `<div class="metric-card wall"><div class="metric-value">${escapeHtml(formatTime(data.wallTimeUs))}</div><div class="metric-label">Wall Time</div></div>`;
  }
  metricsHtml += `<div class="metric-card cpu"><div class="metric-value">${totalFormatted}</div><div class="metric-label">CPU Time</div></div>`;
  if (data.wallTimeUs && data.wallTimeUs > 0) {
    const util = ((data.totalTimeUs / data.wallTimeUs) * 100).toFixed(0);
    metricsHtml += `<div class="metric-card utilization"><div class="metric-value">${util}%</div><div class="metric-label">CPU Utilization</div></div>`;
  }
  if (hasAsync) {
    metricsHtml += `<div class="metric-card async"><div class="metric-value">${escapeHtml(formatTime(data.totalAsyncTimeUs!))}</div><div class="metric-label">Async I/O Wait</div></div>`;
  }

  // Sanitize JSON for safe embedding in <script> — replace < to prevent </script> injection
  const safeJson = JSON.stringify(data).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${titleName} · pkg-profiler report</title>
  <style>${generateCss()}
  </style>
</head>
<body>
  <h1>${titleName}</h1>
  <div class="meta">${metaLine}</div>
  <div class="metrics">${metricsHtml}</div>

  <h2>Summary</h2>
  <div class="controls-bar">
    <div class="threshold-control">
      <label>Threshold</label>
      <input type="range" id="threshold-slider" min="0" max="20" step="0.5" value="5">
      <span id="threshold-value">5.0%</span>
    </div>${hasAsync ? `
    <span class="sort-control">
      <label>Sort by</label>
      <span class="sort-toggle">
        <button data-sort="cpu" class="active">CPU Time</button>
        <button data-sort="async">Async I/O Wait</button>
      </span>
    </span>` : ''}
  </div>
  <div id="summary-container">${summaryTable}</div>

  <h2>Details</h2>
  <div class="tree-controls">
    <div class="search-wrapper">
      <input type="text" class="search-input" id="search-input" placeholder="Filter packages...">
    </div>
    <button class="tree-btn" id="expand-all">Expand</button>
    <button class="tree-btn" id="collapse-all">Collapse</button>
  </div>
  <div id="tree-container">${tree}</div>

  <script>var __REPORT_DATA__ = ${safeJson};</script>
  <script>${generateJs()}</script>
</body>
</html>`;
}
