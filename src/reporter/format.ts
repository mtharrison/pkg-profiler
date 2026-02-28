/**
 * Format utilities for the HTML reporter.
 * Pure functions with defined input/output contracts.
 */

/** Convert microseconds to adaptive human-readable time string. */
export function formatTime(_us: number): string {
  throw new Error('Not implemented');
}

/** Convert microseconds to percentage of total with one decimal place. */
export function formatPct(_us: number, _totalUs: number): string {
  throw new Error('Not implemented');
}

/** Escape HTML-special characters to prevent broken markup. */
export function escapeHtml(_str: string): string {
  throw new Error('Not implemented');
}
