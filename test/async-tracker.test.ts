import { describe, it, expect, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseStackLine, AsyncTracker, mergeIntervals } from '../src/async-tracker.js';
import type { Interval } from '../src/async-tracker.js';
import { PackageResolver } from '../src/package-resolver.js';
import { SampleStore } from '../src/sample-store.js';
import { asyncDelay } from './fixtures/async-work.js';

describe('parseStackLine()', () => {
  it('parses a named function with absolute path', () => {
    const result = parseStackLine('    at doWork (/Users/me/project/src/index.ts:42:10)');
    expect(result).toEqual({
      filePath: '/Users/me/project/src/index.ts',
      functionId: 'doWork:42',
    });
  });

  it('parses an anonymous function (no name, just path)', () => {
    const result = parseStackLine('    at /Users/me/project/src/index.ts:10:5');
    expect(result).toEqual({
      filePath: '/Users/me/project/src/index.ts',
      functionId: '<anonymous>:10',
    });
  });

  it('strips Object. prefix from function name', () => {
    const result = parseStackLine('    at Object.myFunc (/Users/me/project/lib/util.js:5:3)');
    expect(result).toEqual({
      filePath: '/Users/me/project/lib/util.js',
      functionId: 'myFunc:5',
    });
  });

  it('returns null for node internal frames', () => {
    const result = parseStackLine('    at Module._compile (node:internal/modules/cjs/loader:1241:14)');
    expect(result).toBeNull();
  });

  it('returns null for malformed lines', () => {
    expect(parseStackLine('Error: something')).toBeNull();
    expect(parseStackLine('')).toBeNull();
    expect(parseStackLine('    at <anonymous>')).toBeNull();
  });

  it('parses node_modules paths', () => {
    const result = parseStackLine(
      '    at Server.emit (/Users/me/project/node_modules/express/lib/router.js:201:12)',
    );
    expect(result).toEqual({
      filePath: '/Users/me/project/node_modules/express/lib/router.js',
      functionId: 'emit:201',
    });
  });
});

describe('mergeIntervals()', () => {
  it('returns empty array for empty input', () => {
    expect(mergeIntervals([])).toEqual([]);
  });

  it('returns single interval unchanged', () => {
    const intervals: Interval[] = [{ startUs: 100, endUs: 200 }];
    expect(mergeIntervals(intervals)).toEqual([{ startUs: 100, endUs: 200 }]);
  });

  it('keeps non-overlapping intervals separate', () => {
    const intervals: Interval[] = [
      { startUs: 100, endUs: 200 },
      { startUs: 300, endUs: 400 },
    ];
    const merged = mergeIntervals(intervals);
    expect(merged).toEqual([
      { startUs: 100, endUs: 200 },
      { startUs: 300, endUs: 400 },
    ]);
  });

  it('merges overlapping intervals', () => {
    const intervals: Interval[] = [
      { startUs: 100, endUs: 300 },
      { startUs: 200, endUs: 400 },
    ];
    const merged = mergeIntervals(intervals);
    expect(merged).toEqual([{ startUs: 100, endUs: 400 }]);
  });

  it('merges adjacent intervals (end == start)', () => {
    const intervals: Interval[] = [
      { startUs: 100, endUs: 200 },
      { startUs: 200, endUs: 300 },
    ];
    const merged = mergeIntervals(intervals);
    expect(merged).toEqual([{ startUs: 100, endUs: 300 }]);
  });

  it('merges nested intervals', () => {
    const intervals: Interval[] = [
      { startUs: 100, endUs: 500 },
      { startUs: 200, endUs: 300 },
    ];
    const merged = mergeIntervals(intervals);
    expect(merged).toEqual([{ startUs: 100, endUs: 500 }]);
  });

  it('handles unsorted input', () => {
    const intervals: Interval[] = [
      { startUs: 300, endUs: 400 },
      { startUs: 100, endUs: 250 },
      { startUs: 200, endUs: 350 },
    ];
    const merged = mergeIntervals(intervals);
    expect(merged).toEqual([{ startUs: 100, endUs: 400 }]);
  });

  it('merges multiple groups correctly', () => {
    const intervals: Interval[] = [
      { startUs: 100, endUs: 200 },
      { startUs: 150, endUs: 250 },
      { startUs: 400, endUs: 500 },
      { startUs: 450, endUs: 550 },
    ];
    const merged = mergeIntervals(intervals);
    expect(merged).toEqual([
      { startUs: 100, endUs: 250 },
      { startUs: 400, endUs: 550 },
    ]);
  });

  it('does not mutate the input array', () => {
    const intervals: Interval[] = [
      { startUs: 200, endUs: 300 },
      { startUs: 100, endUs: 250 },
    ];
    const copy = intervals.map(i => ({ ...i }));
    mergeIntervals(intervals);
    expect(intervals).toEqual(copy);
  });
});

describe('AsyncTracker', () => {
  let tracker: AsyncTracker;
  let store: SampleStore;

  afterEach(() => {
    tracker?.disable();
  });

  it('tracks setTimeout wait time', async () => {
    store = new SampleStore();
    const resolver = new PackageResolver(process.cwd());
    tracker = new AsyncTracker(resolver, store, 1000); // 1ms threshold

    tracker.enable();
    await asyncDelay(50);
    tracker.disable();

    // Should have recorded at least one async op
    let totalAsyncUs = 0;
    let totalOps = 0;
    for (const fileMap of store.packages.values()) {
      for (const funcMap of fileMap.values()) {
        for (const us of funcMap.values()) {
          totalAsyncUs += us;
          totalOps++;
        }
      }
    }

    expect(totalOps).toBeGreaterThanOrEqual(1);
    // ~50ms = 50_000us, allow some variance
    expect(totalAsyncUs).toBeGreaterThan(30_000);
    expect(totalAsyncUs).toBeLessThan(200_000);
  });

  it('tracks fs.promises.readFile wait time', async () => {
    store = new SampleStore();
    const resolver = new PackageResolver(process.cwd());
    tracker = new AsyncTracker(resolver, store, 0); // no threshold for this test

    tracker.enable();
    await readFile(__filename, 'utf-8');
    tracker.disable();

    let totalOps = 0;
    for (const fileMap of store.packages.values()) {
      for (const funcMap of fileMap.values()) {
        for (const _ of funcMap.values()) {
          totalOps++;
        }
      }
    }

    expect(totalOps).toBeGreaterThanOrEqual(1);
  });

  it('filters out ops shorter than threshold', async () => {
    store = new SampleStore();
    const resolver = new PackageResolver(process.cwd());
    // Very high threshold — 10 seconds
    tracker = new AsyncTracker(resolver, store, 10_000_000);

    tracker.enable();
    await asyncDelay(5);
    tracker.disable();

    let totalOps = 0;
    for (const fileMap of store.packages.values()) {
      for (const funcMap of fileMap.values()) {
        for (const _ of funcMap.values()) {
          totalOps++;
        }
      }
    }

    expect(totalOps).toBe(0);
  });

  it('enable is idempotent', () => {
    store = new SampleStore();
    const resolver = new PackageResolver(process.cwd());
    tracker = new AsyncTracker(resolver, store);

    tracker.enable();
    tracker.enable(); // should not throw
    tracker.disable();
  });

  it('disable is idempotent', () => {
    store = new SampleStore();
    const resolver = new PackageResolver(process.cwd());
    tracker = new AsyncTracker(resolver, store);

    tracker.disable(); // not enabled — should not throw
    tracker.enable();
    tracker.disable();
    tracker.disable(); // already disabled — should not throw
  });

  it('merges overlapping parallel timers into a single duration', async () => {
    store = new SampleStore();
    const resolver = new PackageResolver(process.cwd());
    tracker = new AsyncTracker(resolver, store, 0); // no threshold

    tracker.enable();

    // Fire 5 parallel 50ms timers — should merge to ~50ms, not 250ms
    await Promise.all([
      asyncDelay(50),
      asyncDelay(50),
      asyncDelay(50),
      asyncDelay(50),
      asyncDelay(50),
    ]);

    tracker.disable();

    const mergedTotal = tracker.mergedTotalUs;

    // Merged total should be roughly 50ms (50_000us), not 250ms (250_000us)
    // Use generous bounds for CI timing variance
    expect(mergedTotal).toBeGreaterThan(20_000);   // at least 20ms
    expect(mergedTotal).toBeLessThan(150_000);      // well under 5*50ms=250ms

    // The store still has data recorded
    let storeTotal = 0;
    for (const fileMap of store.packages.values()) {
      for (const funcMap of fileMap.values()) {
        for (const us of funcMap.values()) {
          storeTotal += us;
        }
      }
    }
    expect(storeTotal).toBeGreaterThan(0);
  });

  it('mergedTotalUs is 0 before disable', () => {
    store = new SampleStore();
    const resolver = new PackageResolver(process.cwd());
    tracker = new AsyncTracker(resolver, store);
    expect(tracker.mergedTotalUs).toBe(0);
  });
});
