import { describe, it, expect, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseStackLine, AsyncTracker } from '../src/async-tracker.js';
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
});
