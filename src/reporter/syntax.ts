/**
 * Simple regex-based JS/TS syntax highlighter.
 *
 * Wraps tokens in <span> elements with class names:
 *   tok-kw  — keywords
 *   tok-str — strings (single, double, template)
 *   tok-cmt — comments (line and block)
 *   tok-num — numeric literals
 *
 * All output is HTML-escaped.
 */

import { escapeHtml } from './format.js';

const KEYWORDS = new Set([
  'abstract', 'as', 'async', 'await', 'break', 'case', 'catch', 'class',
  'const', 'continue', 'debugger', 'declare', 'default', 'delete', 'do',
  'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'from',
  'function', 'get', 'if', 'implements', 'import', 'in', 'instanceof',
  'interface', 'is', 'let', 'module', 'namespace', 'new', 'null', 'of',
  'override', 'private', 'protected', 'public', 'readonly', 'return',
  'satisfies', 'set', 'static', 'super', 'switch', 'this', 'throw',
  'true', 'try', 'type', 'typeof', 'undefined', 'var', 'void', 'while',
  'with', 'yield',
]);

/**
 * Syntax-highlight a single line of JS/TS code.
 * Returns an HTML string with token spans. All text is HTML-escaped.
 */
export function highlightSyntax(code: string): string {
  if (code.length === 0) return '';

  let out = '';
  let i = 0;

  while (i < code.length) {
    const ch = code[i];

    // Line comment
    if (ch === '/' && code[i + 1] === '/') {
      out += `<span class="tok-cmt">${escapeHtml(code.slice(i))}</span>`;
      return out;
    }

    // Block comment (may not close on same line)
    if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      if (end === -1) {
        out += `<span class="tok-cmt">${escapeHtml(code.slice(i))}</span>`;
        return out;
      }
      out += `<span class="tok-cmt">${escapeHtml(code.slice(i, end + 2))}</span>`;
      i = end + 2;
      continue;
    }

    // String literals: single, double, template
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === '\\') {
          j += 2;
          continue;
        }
        if (code[j] === quote) {
          j++;
          break;
        }
        j++;
      }
      out += `<span class="tok-str">${escapeHtml(code.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // Numeric literals
    if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < code.length && /[0-9]/.test(code[i + 1]))) {
      let j = i;
      // Hex/octal/binary prefix
      if (ch === '0' && j + 1 < code.length && /[xXoObB]/.test(code[j + 1])) {
        j += 2;
      }
      while (j < code.length && /[0-9a-fA-F_.]/.test(code[j])) j++;
      // Exponent
      if (j < code.length && /[eE]/.test(code[j])) {
        j++;
        if (j < code.length && /[+-]/.test(code[j])) j++;
        while (j < code.length && /[0-9_]/.test(code[j])) j++;
      }
      // BigInt suffix
      if (j < code.length && code[j] === 'n') j++;
      out += `<span class="tok-num">${escapeHtml(code.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_$]/.test(ch)) {
      let j = i + 1;
      while (j < code.length && /[a-zA-Z0-9_$]/.test(code[j])) j++;
      const word = code.slice(i, j);
      if (KEYWORDS.has(word)) {
        out += `<span class="tok-kw">${escapeHtml(word)}</span>`;
      } else {
        out += escapeHtml(word);
      }
      i = j;
      continue;
    }

    // Everything else (operators, whitespace, punctuation)
    out += escapeHtml(ch);
    i++;
  }

  return out;
}
