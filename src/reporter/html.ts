/**
 * HTML renderer for the profiling report.
 *
 * Generates a self-contained HTML file (inline CSS/JS, no external dependencies)
 * with a summary table, expandable Package > File > Function tree, and an
 * interactive threshold slider that filters data client-side.
 */

import type { ReportData, PackageEntry, FileEntry } from '../types.js';
import { formatTime, formatPct, escapeHtml } from './format.js';

function generateCss(): string {
  return `
    :root {
      --bg: #fafbfc;
      --text: #1a1a2e;
      --muted: #8b8fa3;
      --border: #e2e4ea;
      --first-party-accent: #3b6cf5;
      --first-party-bg: #eef2ff;
      --dep-bg: #ffffff;
      --bar-track: #e8eaed;
      --bar-fill: #5b8def;
      --bar-fill-fp: #3b6cf5;
      --bar-fill-async: #f5943b;
      --other-text: #a0a4b8;
      --table-header-bg: #f4f5f7;
      --shadow: 0 1px 3px rgba(0,0,0,0.06);
      --radius: 6px;
      --font-mono: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
      --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--font-sans);
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 2rem;
      max-width: 960px;
      margin: 0 auto;
    }

    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }

    .meta {
      color: var(--muted);
      font-size: 0.85rem;
      margin-bottom: 2rem;
    }

    h2 {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      margin-top: 2rem;
    }

    /* Threshold slider */
    .threshold-control {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
      font-size: 0.85rem;
    }

    .threshold-control label {
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 0.8rem;
    }

    .threshold-control input[type="range"] {
      flex: 1;
      max-width: 240px;
      height: 8px;
      appearance: none;
      -webkit-appearance: none;
      background: var(--bar-track);
      border-radius: 4px;
      outline: none;
    }

    .threshold-control input[type="range"]::-webkit-slider-thumb {
      appearance: none;
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--bar-fill);
      cursor: pointer;
    }

    .threshold-control input[type="range"]::-moz-range-thumb {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--bar-fill);
      cursor: pointer;
      border: none;
    }

    .threshold-control span {
      font-family: var(--font-mono);
      font-size: 0.85rem;
      min-width: 3.5em;
    }

    /* Summary table */
    table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
      margin-bottom: 1rem;
    }

    th {
      text-align: left;
      background: var(--table-header-bg);
      padding: 0.6rem 0.75rem;
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
    }

    td {
      padding: 0.55rem 0.75rem;
      border-bottom: 1px solid var(--border);
      font-size: 0.9rem;
    }

    tr:last-child td { border-bottom: none; }

    tr.first-party td:first-child {
      border-left: 3px solid var(--first-party-accent);
      padding-left: calc(0.75rem - 3px);
    }

    td.pkg-name { font-family: var(--font-mono); font-size: 0.85rem; }
    td.numeric { text-align: right; font-family: var(--font-mono); font-size: 0.85rem; }
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
      height: 8px;
      background: var(--bar-track);
      border-radius: 4px;
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      border-radius: 4px;
      background: var(--bar-fill);
      min-width: 1px;
    }

    tr.first-party .bar-fill {
      background: var(--bar-fill-fp);
    }

    .bar-pct {
      font-family: var(--font-mono);
      font-size: 0.8rem;
      min-width: 3.5em;
      text-align: right;
    }

    tr.other-row td {
      color: var(--other-text);
      font-style: italic;
    }

    /* Tree */
    .tree {
      background: #fff;
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
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
      padding: 0.6rem 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.9rem;
      user-select: none;
    }

    summary::-webkit-details-marker { display: none; }

    summary::before {
      content: '\\25B6';
      font-size: 0.6rem;
      color: var(--muted);
      transition: transform 0.15s ease;
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
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
      flex-shrink: 0;
    }

    .tree-label.pkg { background: #e8eaed; color: #555; }
    .tree-label.file { background: #e8f0fe; color: #3b6cf5; }
    .tree-label.fn { background: #f0f0f0; color: #777; }

    .tree-stats {
      font-family: var(--font-mono);
      font-size: 0.8rem;
      color: var(--muted);
      flex-shrink: 0;
    }

    .tree-async {
      font-family: var(--font-mono);
      font-size: 0.8rem;
      color: var(--bar-fill-async);
      flex-shrink: 0;
    }

    /* Level indentation */
    .level-0 > summary { padding-left: 0.75rem; }
    .level-1 > summary { padding-left: 2rem; }
    .level-2 { padding: 0.45rem 0.75rem 0.45rem 3.25rem; font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem; }

    /* First-party package highlight */
    .fp-pkg > summary {
      background: var(--first-party-bg);
      border-left: 3px solid var(--first-party-accent);
    }

    .other-item {
      padding: 0.45rem 0.75rem;
      color: var(--other-text);
      font-style: italic;
      font-size: 0.85rem;
    }

    .other-item.indent-1 { padding-left: 2rem; }
    .other-item.indent-2 { padding-left: 3.25rem; }

    @media (max-width: 600px) {
      body { padding: 1rem; }
      .bar-cell { width: 25%; }
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

  function applyThreshold(data, pct) {
    var threshold = data.totalTimeUs * (pct / 100);
    var filtered = [];
    var otherCount = 0;

    for (var i = 0; i < data.packages.length; i++) {
      var pkg = data.packages[i];
      if (pkg.timeUs < threshold) {
        otherCount++;
        continue;
      }

      var files = [];
      var fileOtherCount = 0;

      for (var j = 0; j < pkg.files.length; j++) {
        var file = pkg.files[j];
        if (file.timeUs < threshold) {
          fileOtherCount++;
          continue;
        }

        var functions = [];
        var funcOtherCount = 0;

        for (var k = 0; k < file.functions.length; k++) {
          var fn = file.functions[k];
          if (fn.timeUs < threshold) {
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
        asyncTimeUs: pkg.asyncTimeUs,
        asyncPct: pkg.asyncPct,
        asyncOpCount: pkg.asyncOpCount,
        files: files,
        otherCount: fileOtherCount
      });
    }

    return { packages: filtered, otherCount: otherCount };
  }

  function renderTable(packages, otherCount, totalTimeUs) {
    var rows = '';
    for (var i = 0; i < packages.length; i++) {
      var pkg = packages[i];
      var cls = pkg.isFirstParty ? 'first-party' : 'dependency';
      var pctVal = totalTimeUs > 0 ? (pkg.timeUs / totalTimeUs) * 100 : 0;
      rows += '<tr class="' + cls + '">' +
        '<td class="pkg-name">' + escapeHtml(pkg.name) + '</td>' +
        '<td class="numeric">' + escapeHtml(formatTime(pkg.timeUs)) + '</td>' +
        '<td class="bar-cell"><div class="bar-container">' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + pctVal.toFixed(1) + '%"></div></div>' +
          '<span class="bar-pct">' + escapeHtml(formatPct(pkg.timeUs, totalTimeUs)) + '</span>' +
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

    var headers = '<th>Package</th><th>Wall Time</th><th>% of Total</th><th>Samples</th>';
    if (HAS_ASYNC) {
      headers += '<th>Async Wait</th><th>Async Ops</th>';
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

  function renderTree(packages, otherCount, totalTimeUs) {
    var html = '<div class="tree">';

    for (var i = 0; i < packages.length; i++) {
      var pkg = packages[i];
      var fpCls = pkg.isFirstParty ? ' fp-pkg' : '';
      html += '<details class="level-0' + fpCls + '"><summary>';
      html += '<span class="tree-label pkg">pkg</span>';
      html += '<span class="tree-name">' + escapeHtml(pkg.name) + '</span>';
      html += '<span class="tree-stats">' + escapeHtml(formatTime(pkg.timeUs)) + ' &middot; ' + escapeHtml(formatPct(pkg.timeUs, totalTimeUs)) + ' &middot; ' + pkg.sampleCount + ' samples</span>';
      html += asyncStats(pkg);
      html += '</summary>';

      for (var j = 0; j < pkg.files.length; j++) {
        var file = pkg.files[j];
        html += '<details class="level-1"><summary>';
        html += '<span class="tree-label file">file</span>';
        html += '<span class="tree-name">' + escapeHtml(file.name) + '</span>';
        html += '<span class="tree-stats">' + escapeHtml(formatTime(file.timeUs)) + ' &middot; ' + escapeHtml(formatPct(file.timeUs, totalTimeUs)) + ' &middot; ' + file.sampleCount + ' samples</span>';
        html += asyncStats(file);
        html += '</summary>';

        for (var k = 0; k < file.functions.length; k++) {
          var fn = file.functions[k];
          html += '<div class="level-2">';
          html += '<span class="tree-label fn">fn</span> ';
          html += '<span class="tree-name">' + escapeHtml(fn.name) + '</span>';
          html += ' <span class="tree-stats">' + escapeHtml(formatTime(fn.timeUs)) + ' &middot; ' + escapeHtml(formatPct(fn.timeUs, totalTimeUs)) + ' &middot; ' + fn.sampleCount + ' samples</span>';
          html += asyncStats(fn);
          html += '</div>';
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

  function update(pct) {
    var result = applyThreshold(DATA, pct);
    var summaryEl = document.getElementById('summary-container');
    var treeEl = document.getElementById('tree-container');
    if (summaryEl) summaryEl.innerHTML = renderTable(result.packages, result.otherCount, DATA.totalTimeUs);
    if (treeEl) treeEl.innerHTML = renderTree(result.packages, result.otherCount, DATA.totalTimeUs);
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
    rows += `
      <tr class="${cls}">
        <td class="pkg-name">${escapeHtml(pkg.name)}</td>
        <td class="numeric">${escapeHtml(formatTime(pkg.timeUs))}</td>
        <td class="bar-cell">
          <div class="bar-container">
            <div class="bar-track"><div class="bar-fill" style="width:${pctVal.toFixed(1)}%"></div></div>
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
          <th>Wall Time</th>
          <th>% of Total</th>
          <th>Samples</th>${hasAsync ? `
          <th>Async Wait</th>
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

function renderTree(
  packages: PackageEntry[],
  otherCount: number,
  totalTimeUs: number,
  hasAsync: boolean,
): string {
  let html = '<div class="tree">';

  for (const pkg of packages) {
    const fpCls = pkg.isFirstParty ? ' fp-pkg' : '';
    html += `<details class="level-0${fpCls}">`;
    html += `<summary>`;
    html += `<span class="tree-label pkg">pkg</span>`;
    html += `<span class="tree-name">${escapeHtml(pkg.name)}</span>`;
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
        html += `<div class="level-2">`;
        html += `<span class="tree-label fn">fn</span> `;
        html += `<span class="tree-name">${escapeHtml(fn.name)}</span>`;
        html += ` <span class="tree-stats">${escapeHtml(formatTime(fn.timeUs))} &middot; ${escapeHtml(formatPct(fn.timeUs, totalTimeUs))} &middot; ${fn.sampleCount} samples</span>`;
        if (hasAsync) html += formatAsyncStats(fn);
        html += `</div>`;
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

  let metaLine = `Generated ${escapeHtml(data.timestamp)} &middot; Total wall time: ${totalFormatted}`;
  if (hasAsync) {
    metaLine += ` &middot; Total async wait: ${escapeHtml(formatTime(data.totalAsyncTimeUs!))}`;
  }

  // Sanitize JSON for safe embedding in <script> — replace < to prevent </script> injection
  const safeJson = JSON.stringify(data).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${titleName} · where-you-at report</title>
  <style>${generateCss()}
  </style>
</head>
<body>
  <h1>${titleName}</h1>
  <div class="meta">${metaLine}</div>

  <h2>Summary</h2>
  <div class="threshold-control">
    <label>Threshold</label>
    <input type="range" id="threshold-slider" min="0" max="20" step="0.5" value="5">
    <span id="threshold-value">5.0%</span>
  </div>
  <div id="summary-container">${summaryTable}</div>

  <h2>Details</h2>
  <div id="tree-container">${tree}</div>

  <script>var __REPORT_DATA__ = ${safeJson};</script>
  <script>${generateJs()}</script>
</body>
</html>`;
}
