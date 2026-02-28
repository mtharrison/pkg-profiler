/**
 * HTML renderer for the profiling report.
 *
 * Generates a self-contained HTML file (inline CSS, no external dependencies)
 * with a summary table and expandable Package > File > Function tree.
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

    .tree-stats {
      font-family: var(--font-mono);
      font-size: 0.8rem;
      color: var(--muted);
      flex-shrink: 0;
    }

    /* Level indentation */
    .level-0 > summary { padding-left: 0.75rem; }
    .level-1 > summary { padding-left: 2rem; }
    .level-2 { padding: 0.45rem 0.75rem 0.45rem 3.25rem; font-size: 0.85rem; }

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

function renderSummaryTable(
  packages: PackageEntry[],
  otherCount: number,
  totalTimeUs: number,
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
        <td class="numeric">${pkg.sampleCount}</td>
      </tr>`;
  }

  if (otherCount > 0) {
    rows += `
      <tr class="other-row">
        <td class="pkg-name">Other (${otherCount} items)</td>
        <td class="numeric"></td>
        <td class="bar-cell"></td>
        <td class="numeric"></td>
      </tr>`;
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Package</th>
          <th>Wall Time</th>
          <th>% of Total</th>
          <th>Samples</th>
        </tr>
      </thead>
      <tbody>${rows}
      </tbody>
    </table>`;
}

function renderTree(
  packages: PackageEntry[],
  otherCount: number,
  totalTimeUs: number,
): string {
  let html = '<div class="tree">';

  for (const pkg of packages) {
    const fpCls = pkg.isFirstParty ? ' fp-pkg' : '';
    html += `<details class="level-0${fpCls}">`;
    html += `<summary>`;
    html += `<span class="tree-name">${escapeHtml(pkg.name)}</span>`;
    html += `<span class="tree-stats">${escapeHtml(formatTime(pkg.timeUs))} &middot; ${escapeHtml(formatPct(pkg.timeUs, totalTimeUs))} &middot; ${pkg.sampleCount} samples</span>`;
    html += `</summary>`;

    for (const file of pkg.files) {
      html += `<details class="level-1">`;
      html += `<summary>`;
      html += `<span class="tree-name">${escapeHtml(file.name)}</span>`;
      html += `<span class="tree-stats">${escapeHtml(formatTime(file.timeUs))} &middot; ${escapeHtml(formatPct(file.timeUs, totalTimeUs))} &middot; ${file.sampleCount} samples</span>`;
      html += `</summary>`;

      for (const fn of file.functions) {
        html += `<div class="level-2">`;
        html += `<span class="tree-name">${escapeHtml(fn.name)}</span>`;
        html += ` <span class="tree-stats">${escapeHtml(formatTime(fn.timeUs))} &middot; ${escapeHtml(formatPct(fn.timeUs, totalTimeUs))} &middot; ${fn.sampleCount} samples</span>`;
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
 */
export function renderHtml(data: ReportData): string {
  const summaryTable = renderSummaryTable(data.packages, data.otherCount, data.totalTimeUs);
  const tree = renderTree(data.packages, data.otherCount, data.totalTimeUs);
  const totalFormatted = escapeHtml(formatTime(data.totalTimeUs));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>where-you-at report</title>
  <style>${generateCss()}
  </style>
</head>
<body>
  <h1>where-you-at</h1>
  <div class="meta">Generated ${escapeHtml(data.timestamp)} &middot; Total wall time: ${totalFormatted}</div>

  <h2>Summary</h2>
  ${summaryTable}

  <h2>Details</h2>
  ${tree}
</body>
</html>`;
}
