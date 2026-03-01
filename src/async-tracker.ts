/**
 * Opt-in async I/O wait time tracker using node:async_hooks.
 *
 * Tracks the time between async resource init (when the I/O op is started)
 * and the first before callback (when the callback fires), attributing
 * that wait time to the package/file/function that initiated the operation.
 *
 * Intervals are buffered and merged at disable() time so that overlapping
 * concurrent I/O is not double-counted.
 */

import { createHook } from 'node:async_hooks';
import type { AsyncHook } from 'node:async_hooks';
import type { PackageResolver } from './package-resolver.js';
import type { SampleStore } from './sample-store.js';
import type { StackFrame } from './types.js';

/** Async resource types worth tracking — I/O and timers, not promises. */
const TRACKED_TYPES = new Set([
  'TCPCONNECTWRAP',
  'TCPWRAP',
  'PIPEWRAP',
  'PIPECONNECTWRAP',
  'TLSWRAP',
  'FSREQCALLBACK',
  'FSREQPROMISE',
  'GETADDRINFOREQWRAP',
  'GETNAMEINFOREQWRAP',
  'HTTPCLIENTREQUEST',
  'HTTPINCOMINGMESSAGE',
  'SHUTDOWNWRAP',
  'WRITEWRAP',
  'ZLIB',
  'Timeout',
]);

interface PendingOp {
  startHrtime: [number, number];
  pkg: string;
  file: string;
  fn: string;
  callStack: StackFrame[];
}

export interface Interval {
  startUs: number;
  endUs: number;
}

/**
 * Merge overlapping or adjacent intervals. Returns a new sorted array
 * of non-overlapping intervals.
 */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length <= 1) return intervals.slice();

  const sorted = intervals.slice().sort((a, b) => a.startUs - b.startUs);
  const merged: Interval[] = [{ ...sorted[0]! }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;

    if (current.startUs <= last.endUs) {
      // Overlapping or adjacent — extend
      if (current.endUs > last.endUs) {
        last.endUs = current.endUs;
      }
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

/**
 * Sum the durations of a list of (presumably non-overlapping) intervals.
 */
function sumIntervals(intervals: Interval[]): number {
  let total = 0;
  for (const iv of intervals) {
    total += iv.endUs - iv.startUs;
  }
  return total;
}

/**
 * Convert an hrtime tuple to absolute microseconds.
 */
function hrtimeToUs(hr: [number, number]): number {
  return hr[0] * 1_000_000 + Math.round(hr[1] / 1000);
}

/**
 * Parse a single line from an Error().stack trace into file path and function id.
 * Returns null for lines that don't match V8's stack frame format or are node internals.
 *
 * Handles these V8 formats:
 *   "    at functionName (/absolute/path:line:col)"
 *   "    at /absolute/path:line:col"
 *   "    at Object.functionName (/absolute/path:line:col)"
 */
export function parseStackLine(line: string): { filePath: string; functionId: string } | null {
  // Match "    at [funcName] (filePath:line:col)" or "    at filePath:line:col"
  const match = line.match(/^\s+at\s+(?:(.+?)\s+\()?(.+?):(\d+):\d+\)?$/);
  if (!match) return null;

  const rawFn = match[1] ?? '';
  const filePath = match[2]!;
  const lineNum = match[3]!;

  // Skip node internals (node:xxx, <anonymous>, etc)
  if (filePath.startsWith('node:') || filePath.startsWith('<')) return null;

  // Use last segment of function name (strip "Object." etc)
  const fnParts = rawFn.split('.');
  const fnName = fnParts[fnParts.length - 1] || '<anonymous>';
  const functionId = `${fnName}:${lineNum}`;

  return { filePath, functionId };
}

export class AsyncTracker {
  private readonly resolver: PackageResolver;
  private readonly thresholdUs: number;
  private hook: AsyncHook | null = null;
  private pending = new Map<number, PendingOp>();

  /** Buffered intervals keyed by "pkg\0file\0fn" */
  private keyedIntervals = new Map<string, Interval[]>();
  /** Flat list of all intervals for global merging */
  private globalIntervals: Interval[] = [];
  /** Origin time in absolute microseconds, set when enable() is called */
  private originUs = 0;

  /** Merged global total set after flush() */
  private _mergedTotalUs = 0;
  /** Call stacks keyed by "pkg\0file\0fn", first-seen wins */
  private _callStacks = new Map<string, StackFrame[]>();

  /**
   * @param resolver - PackageResolver for mapping file paths to packages
   * @param store - SampleStore to record async wait times into (used at flush time)
   * @param thresholdUs - Minimum wait duration in microseconds to record (default 1000 = 1ms)
   */
  constructor(resolver: PackageResolver, private readonly store: SampleStore, thresholdUs: number = 1000) {
    this.resolver = resolver;
    this.thresholdUs = thresholdUs;
  }

  /** Merged global async total in microseconds, available after disable(). */
  get mergedTotalUs(): number {
    return this._mergedTotalUs;
  }

  /** Initiating call stacks keyed by "pkg\0file\0fn". Available after tracking. */
  get asyncCallStacks(): ReadonlyMap<string, ReadonlyArray<StackFrame>> {
    return this._callStacks;
  }

  enable(): void {
    if (this.hook) return;

    this.originUs = hrtimeToUs(process.hrtime());

    this.hook = createHook({
      init: (asyncId: number, type: string) => {
        if (!TRACKED_TYPES.has(type)) return;

        // Capture stack trace with limited depth
        const holder: { stack?: string } = {};
        const origLimit = Error.stackTraceLimit;
        Error.stackTraceLimit = 8;
        Error.captureStackTrace(holder);
        Error.stackTraceLimit = origLimit;

        const stack = holder.stack;
        if (!stack) return;

        // Parse all user-code frames (skip async_hooks internals)
        const lines = stack.split('\n');
        let firstParsed: { filePath: string; functionId: string } | null = null;
        const callStack: StackFrame[] = [];
        for (let i = 1; i < lines.length; i++) {
          const result = parseStackLine(lines[i]!);
          if (result) {
            // Skip frames inside this module
            if (result.filePath.includes('async-tracker')) continue;
            const { packageName, relativePath } = this.resolver.resolve(result.filePath);
            if (!firstParsed) {
              firstParsed = result;
            }
            callStack.push({ pkg: packageName, file: relativePath, functionId: result.functionId });
          }
        }

        if (!firstParsed) return;

        // Use first user-code frame as the attribution target
        const { packageName, relativePath } = this.resolver.resolve(firstParsed.filePath);

        // Reverse call stack for display: outermost caller first (top-down)
        callStack.reverse();

        this.pending.set(asyncId, {
          startHrtime: process.hrtime(),
          pkg: packageName,
          file: relativePath,
          fn: firstParsed.functionId,
          callStack,
        });
      },

      before: (asyncId: number) => {
        const op = this.pending.get(asyncId);
        if (!op) return;

        const endHr = process.hrtime();
        const startUs = hrtimeToUs(op.startHrtime);
        const endUs = hrtimeToUs(endHr);
        const durationUs = endUs - startUs;

        if (durationUs >= this.thresholdUs) {
          const interval: Interval = { startUs, endUs };
          const key = `${op.pkg}\0${op.file}\0${op.fn}`;

          let arr = this.keyedIntervals.get(key);
          if (!arr) {
            arr = [];
            this.keyedIntervals.set(key, arr);
          }
          arr.push(interval);

          this.globalIntervals.push(interval);

          // Store call stack (first-seen wins)
          if (op.callStack.length > 0 && !this._callStacks.has(key)) {
            this._callStacks.set(key, op.callStack);
          }
        }

        this.pending.delete(asyncId);
      },

      destroy: (asyncId: number) => {
        // Clean up ops that never got a before callback (aborted)
        this.pending.delete(asyncId);
      },
    });

    this.hook.enable();
  }

  disable(): void {
    if (!this.hook) return;

    this.hook.disable();

    // Resolve any pending ops using current time
    const nowHr = process.hrtime();
    const nowUs = hrtimeToUs(nowHr);
    for (const [, op] of this.pending) {
      const startUs = hrtimeToUs(op.startHrtime);
      const durationUs = nowUs - startUs;

      if (durationUs >= this.thresholdUs) {
        const interval: Interval = { startUs, endUs: nowUs };
        const key = `${op.pkg}\0${op.file}\0${op.fn}`;

        let arr = this.keyedIntervals.get(key);
        if (!arr) {
          arr = [];
          this.keyedIntervals.set(key, arr);
        }
        arr.push(interval);

        this.globalIntervals.push(interval);
      }
    }

    this.pending.clear();
    this.hook = null;

    this.flush();
  }

  /**
   * Merge buffered intervals and record to the store.
   * Sets mergedTotalUs to the global merged duration.
   */
  private flush(): void {
    // Per-key: merge overlapping intervals, sum durations, record to store
    for (const [key, intervals] of this.keyedIntervals) {
      const merged = mergeIntervals(intervals);
      const totalUs = sumIntervals(merged);
      if (totalUs > 0) {
        const parts = key.split('\0');
        this.store.record(parts[0]!, parts[1]!, parts[2]!, totalUs, intervals.length);
      }
    }

    // Global: merge all intervals to compute real elapsed async wait
    const globalMerged = mergeIntervals(this.globalIntervals);
    this._mergedTotalUs = sumIntervals(globalMerged);

    // Clean up buffers
    this.keyedIntervals.clear();
    this.globalIntervals = [];
  }
}
