/**
 * Async helpers for tests that exercise the async tracker.
 */

/** setTimeout wrapped as a promise — resolves after `ms` milliseconds. */
export function asyncDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
