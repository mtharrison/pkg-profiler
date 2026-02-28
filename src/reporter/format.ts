/**
 * Format utilities for the HTML reporter.
 * Pure functions with defined input/output contracts.
 */

/**
 * Convert microseconds to adaptive human-readable time string.
 *
 * - >= 1s: shows seconds with 2 decimal places (e.g. "1.24s")
 * - < 1s:  shows rounded milliseconds (e.g. "432ms")
 * - Sub-millisecond values round up to 1ms (never shows "0ms" for nonzero input)
 * - Zero returns "0ms"
 */
export function formatTime(us: number): string {
  if (us === 0) return '0ms';

  const ms = us / 1000;

  if (ms >= 1000) {
    const seconds = ms / 1000;
    return `${seconds.toFixed(2)}s`;
  }

  const rounded = Math.round(ms);
  return `${rounded < 1 ? 1 : rounded}ms`;
}

/**
 * Convert microseconds to percentage of total with one decimal place.
 * Returns "0.0%" when totalUs is zero (avoids division by zero).
 */
export function formatPct(us: number, totalUs: number): string {
  if (totalUs === 0) return '0.0%';
  return `${((us / totalUs) * 100).toFixed(1)}%`;
}

/**
 * Escape HTML-special characters to prevent broken markup.
 * Handles: & < > " '
 * Ampersand is replaced first to avoid double-escaping.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
