/**
 * Opt-in async I/O wait time tracker using node:async_hooks.
 *
 * Tracks the time between async resource init (when the I/O op is started)
 * and the first before callback (when the callback fires), attributing
 * that wait time to the package/file/function that initiated the operation.
 */

import { createHook } from 'node:async_hooks';
import type { AsyncHook } from 'node:async_hooks';
import type { PackageResolver } from './package-resolver.js';
import type { SampleStore } from './sample-store.js';

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
  private readonly store: SampleStore;
  private readonly thresholdUs: number;
  private hook: AsyncHook | null = null;
  private pending = new Map<number, PendingOp>();

  /**
   * @param resolver - PackageResolver for mapping file paths to packages
   * @param store - SampleStore to record async wait times into
   * @param thresholdUs - Minimum wait duration in microseconds to record (default 1000 = 1ms)
   */
  constructor(resolver: PackageResolver, store: SampleStore, thresholdUs: number = 1000) {
    this.resolver = resolver;
    this.store = store;
    this.thresholdUs = thresholdUs;
  }

  enable(): void {
    if (this.hook) return;

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

        // Find the first user-code frame (skip async_hooks internals)
        const lines = stack.split('\n');
        let parsed: { filePath: string; functionId: string } | null = null;
        for (let i = 1; i < lines.length; i++) {
          const result = parseStackLine(lines[i]!);
          if (result) {
            // Skip frames inside this module
            if (result.filePath.includes('async-tracker')) continue;
            parsed = result;
            break;
          }
        }

        if (!parsed) return;

        // Resolve to package
        const { packageName, relativePath } = this.resolver.resolve(parsed.filePath);

        this.pending.set(asyncId, {
          startHrtime: process.hrtime(),
          pkg: packageName,
          file: relativePath,
          fn: parsed.functionId,
        });
      },

      before: (asyncId: number) => {
        const op = this.pending.get(asyncId);
        if (!op) return;

        const elapsed = process.hrtime(op.startHrtime);
        const durationUs = elapsed[0] * 1_000_000 + Math.round(elapsed[1] / 1000);

        if (durationUs >= this.thresholdUs) {
          this.store.record(op.pkg, op.file, op.fn, durationUs);
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
    const now = process.hrtime();
    for (const [, op] of this.pending) {
      // Compute elapsed from op start to now
      let secs = now[0] - op.startHrtime[0];
      let nanos = now[1] - op.startHrtime[1];
      if (nanos < 0) {
        secs -= 1;
        nanos += 1_000_000_000;
      }
      const durationUs = secs * 1_000_000 + Math.round(nanos / 1000);

      if (durationUs >= this.thresholdUs) {
        this.store.record(op.pkg, op.file, op.fn, durationUs);
      }
    }

    this.pending.clear();
    this.hook = null;
  }
}
