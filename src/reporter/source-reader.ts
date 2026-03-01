/**
 * Read source files and build syntax-highlighted code snippets
 * for each function entry in the report.
 *
 * Snippets are keyed by `pkg|file|fn` and contain pre-rendered HTML
 * ready to embed in the report.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PackageEntry } from '../types.js';
import { highlightSyntax } from './syntax.js';
import { escapeHtml } from './format.js';

/** Map from snippet key to pre-rendered HTML string. */
export type SnippetMap = Map<string, string>;

/** Build a unique key for a function entry. */
export function snippetKey(pkg: string, file: string, fn: string): string {
  return `${pkg}|${file}|${fn}`;
}

/**
 * Parse the line number from a function name like `main:42`.
 * Returns the 1-based line number, or -1 if no line number is found.
 */
function parseLineNumber(fnName: string): number {
  const colonIdx = fnName.lastIndexOf(':');
  if (colonIdx === -1) return -1;
  const num = parseInt(fnName.slice(colonIdx + 1), 10);
  return Number.isNaN(num) ? -1 : num;
}

/**
 * Build the absolute file path for a source file.
 * Returns null if the path cannot be determined.
 */
function resolveFilePath(
  pkgName: string,
  fileName: string,
  isFirstParty: boolean,
  projectRoot: string,
): string | null {
  if (fileName === 'node (built-in)' || fileName.startsWith('node:')) return null;
  if (isFirstParty) return join(projectRoot, fileName);
  return join(projectRoot, 'node_modules', pkgName, fileName);
}

const DEFAULT_CONTEXT_LINES = 7;

/**
 * Read source files and produce syntax-highlighted HTML snippets
 * for every function entry that has a parseable line number.
 *
 * @param packages - Package entries from ReportData
 * @param projectRoot - Absolute path to the project root
 * @param contextLines - Number of lines above/below the hot line (default 7)
 * @returns Map from snippet key to HTML string
 */
export function readSourceSnippets(
  packages: PackageEntry[],
  projectRoot: string,
  contextLines: number = DEFAULT_CONTEXT_LINES,
): SnippetMap {
  const map: SnippetMap = new Map();
  const fileCache = new Map<string, string[] | null>();

  function getLines(absPath: string): string[] | null {
    if (fileCache.has(absPath)) return fileCache.get(absPath)!;
    try {
      const content = readFileSync(absPath, 'utf-8');
      const lines = content.split('\n');
      fileCache.set(absPath, lines);
      return lines;
    } catch {
      fileCache.set(absPath, null);
      return null;
    }
  }

  for (const pkg of packages) {
    for (const file of pkg.files) {
      for (const fn of file.functions) {
        const lineNum = parseLineNumber(fn.name);
        if (lineNum < 1) continue;

        const absPath = resolveFilePath(pkg.name, file.name, pkg.isFirstParty, projectRoot);
        if (!absPath) continue;

        const lines = getLines(absPath);
        if (!lines) continue;

        // lineNum is 1-based, convert to 0-based index
        const hotIdx = lineNum - 1;
        if (hotIdx >= lines.length) continue;

        const startIdx = Math.max(0, hotIdx - contextLines);
        const endIdx = Math.min(lines.length - 1, hotIdx + contextLines);

        let html = '<pre class="source-snippet"><code>';
        for (let i = startIdx; i <= endIdx; i++) {
          const isHot = i === hotIdx;
          const lineNo = i + 1;
          const cls = isHot ? 'src-line src-hot' : 'src-line';
          const lineNoStr = escapeHtml(String(lineNo));
          const highlighted = highlightSyntax(lines[i]);
          html += `<div class="${cls}"><span class="src-lineno">${lineNoStr}</span>${highlighted}</div>`;
        }
        html += '</code></pre>';

        map.set(snippetKey(pkg.name, file.name, fn.name), html);
      }
    }
  }

  return map;
}
