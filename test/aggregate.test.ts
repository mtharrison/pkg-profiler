import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SampleStore } from '../src/sample-store.js';
import { aggregate } from '../src/reporter/aggregate.js';
import type { ReportData, StackFrame } from '../src/types.js';

/**
 * Helper: populate a SampleStore with the canonical test data set.
 *
 * Packages and their time distributions:
 *   "my-app"  -> "src/index.ts"    -> { "main:1": 500_000, "helper:10": 100_000 }  = 600_000
 *   "express" -> "lib/router.js"   -> { "handle:201": 300_000 }                     = 300_000
 *   "express" -> "lib/app.js"      -> { "init:50": 50_000 }                         = 50_000
 *   "lodash"  -> "index.js"        -> { "map:10": 30_000 }                          = 30_000
 *   "tiny-lib"-> "lib/util.js"     -> { "compute:5": 10_000 }                       = 10_000
 *
 * Total = 990_000 us.
 */
function buildCanonicalStore(): SampleStore {
  const store = new SampleStore();

  // my-app: "src/index.ts" -> main:1 (500_000us over 5 samples)
  for (let i = 0; i < 5; i++) {
    store.record('my-app', 'src/index.ts', 'main:1', 100_000);
  }
  // my-app: "src/index.ts" -> helper:10 (100_000us over 2 samples)
  for (let i = 0; i < 2; i++) {
    store.record('my-app', 'src/index.ts', 'helper:10', 50_000);
  }

  // express: "lib/router.js" -> handle:201 (300_000us over 3 samples)
  for (let i = 0; i < 3; i++) {
    store.record('express', 'lib/router.js', 'handle:201', 100_000);
  }
  // express: "lib/app.js" -> init:50 (50_000us over 1 sample)
  store.record('express', 'lib/app.js', 'init:50', 50_000);

  // lodash: "index.js" -> map:10 (30_000us over 1 sample)
  store.record('lodash', 'index.js', 'map:10', 30_000);

  // tiny-lib: "lib/util.js" -> compute:5 (10_000us over 1 sample)
  store.record('tiny-lib', 'lib/util.js', 'compute:5', 10_000);

  return store;
}

describe('aggregate()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T10:30:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty ReportData for an empty store', () => {
    const store = new SampleStore();
    const result = aggregate(store, 'my-app');

    expect(result.packages).toEqual([]);
    expect(result.otherCount).toBe(0);
    expect(result.totalTimeUs).toBe(0);
    expect(result.timestamp).toBeTypeOf('string');
    expect(result.timestamp.length).toBeGreaterThan(0);
  });

  it('calculates totalTimeUs as sum of all user-attributed microseconds', () => {
    const store = buildCanonicalStore();
    const result = aggregate(store, 'my-app');

    expect(result.totalTimeUs).toBe(990_000);
  });

  it('sorts packages by timeUs descending and includes all packages', () => {
    const store = buildCanonicalStore();
    const result = aggregate(store, 'my-app');

    expect(result.packages.length).toBe(4);
    expect(result.packages[0].name).toBe('my-app');
    expect(result.packages[0].timeUs).toBe(600_000);
    expect(result.packages[1].name).toBe('express');
    expect(result.packages[1].timeUs).toBe(350_000);
    expect(result.packages[2].name).toBe('lodash');
    expect(result.packages[2].timeUs).toBe(30_000);
    expect(result.packages[3].name).toBe('tiny-lib');
    expect(result.packages[3].timeUs).toBe(10_000);
  });

  it('no longer applies threshold at package level — otherCount is always 0', () => {
    const store = buildCanonicalStore();
    const result = aggregate(store, 'my-app');

    expect(result.otherCount).toBe(0);
    expect(result.packages.length).toBe(4);
  });

  it('computes pct relative to totalTimeUs at package level', () => {
    const store = buildCanonicalStore();
    const result = aggregate(store, 'my-app');

    // my-app: 600_000 / 990_000 * 100 = ~60.6
    expect(result.packages[0].pct).toBeCloseTo(60.6, 0);
    // express: 350_000 / 990_000 * 100 = ~35.4
    expect(result.packages[1].pct).toBeCloseTo(35.4, 0);
  });

  it('flags isFirstParty correctly', () => {
    const store = buildCanonicalStore();
    const result = aggregate(store, 'my-app');

    expect(result.packages[0].isFirstParty).toBe(true);
    expect(result.packages[1].isFirstParty).toBe(false);
  });

  it('sorts files within a package by timeUs descending', () => {
    const store = buildCanonicalStore();
    const result = aggregate(store, 'my-app');

    const express = result.packages[1];
    expect(express.files.length).toBe(2);
    expect(express.files[0].name).toBe('lib/router.js');
    expect(express.files[0].timeUs).toBe(300_000);
    expect(express.files[1].name).toBe('lib/app.js');
    expect(express.files[1].timeUs).toBe(50_000);
  });

  it('no longer applies threshold at file level — all files present, otherCount 0', () => {
    const store = buildCanonicalStore();
    const result = aggregate(store, 'my-app');

    const express = result.packages[1];
    expect(express.otherCount).toBe(0);
    expect(express.files.length).toBe(2);
  });

  it('includes all files regardless of size relative to total', () => {
    const store = new SampleStore();
    // big-pkg: "main.ts" -> fn:1 (800_000us)
    store.record('big-pkg', 'main.ts', 'fn:1', 800_000);
    // big-pkg: "tiny.ts" -> fn:2 (10_000us) -- previously below 5% threshold
    store.record('big-pkg', 'tiny.ts', 'fn:2', 10_000);

    const result = aggregate(store, 'big-pkg');
    const pkg = result.packages[0];

    expect(pkg.files.length).toBe(2);
    expect(pkg.files[0].name).toBe('main.ts');
    expect(pkg.files[1].name).toBe('tiny.ts');
    expect(pkg.otherCount).toBe(0);
  });

  it('sorts functions within a file by timeUs descending', () => {
    const store = buildCanonicalStore();
    const result = aggregate(store, 'my-app');

    const myApp = result.packages[0];
    const indexTs = myApp.files[0];
    expect(indexTs.functions.length).toBe(2);
    expect(indexTs.functions[0].name).toBe('main:1');
    expect(indexTs.functions[0].timeUs).toBe(500_000);
    expect(indexTs.functions[1].name).toBe('helper:10');
    expect(indexTs.functions[1].timeUs).toBe(100_000);
  });

  it('no longer applies threshold at function level — all functions present, otherCount 0', () => {
    const store = new SampleStore();
    // pkg: "file.ts" -> big:1 (900_000), small:2 (10_000)
    store.record('pkg', 'file.ts', 'big:1', 900_000);
    store.record('pkg', 'file.ts', 'small:2', 10_000);

    const result = aggregate(store, 'pkg');
    const file = result.packages[0].files[0];

    expect(file.functions.length).toBe(2);
    expect(file.functions[0].name).toBe('big:1');
    expect(file.functions[1].name).toBe('small:2');
    expect(file.otherCount).toBe(0);
  });

  it('populates sampleCount at package level', () => {
    const store = buildCanonicalStore();
    const result = aggregate(store, 'my-app');

    // my-app: 5 samples (main:1) + 2 samples (helper:10) = 7
    expect(result.packages[0].sampleCount).toBe(7);
    // express: 3 samples (handle:201) + 1 sample (init:50) = 4
    expect(result.packages[1].sampleCount).toBe(4);
  });

  it('populates sampleCount at file level', () => {
    const store = buildCanonicalStore();
    const result = aggregate(store, 'my-app');

    const express = result.packages[1];
    // lib/router.js: 3 samples
    expect(express.files[0].sampleCount).toBe(3);
    // lib/app.js: 1 sample
    expect(express.files[1].sampleCount).toBe(1);
  });

  it('populates sampleCount at function level', () => {
    const store = buildCanonicalStore();
    const result = aggregate(store, 'my-app');

    const myApp = result.packages[0];
    const indexTs = myApp.files[0];
    // main:1: 5 samples
    expect(indexTs.functions[0].sampleCount).toBe(5);
    // helper:10: 2 samples
    expect(indexTs.functions[1].sampleCount).toBe(2);
  });

  it('handles single package with otherCount 0', () => {
    const store = new SampleStore();
    store.record('solo', 'index.ts', 'run:1', 100_000);

    const result = aggregate(store, 'solo');

    expect(result.packages.length).toBe(1);
    expect(result.packages[0].name).toBe('solo');
    expect(result.otherCount).toBe(0);
    expect(result.totalTimeUs).toBe(100_000);
  });

  it('includes all packages even when each is tiny — no threshold filtering', () => {
    const store = new SampleStore();
    for (let i = 0; i < 100; i++) {
      store.record(`pkg-${i}`, 'index.ts', 'fn:1', 1);
    }
    const result = aggregate(store, 'none-match');

    expect(result.packages.length).toBe(100);
    expect(result.otherCount).toBe(0);
    expect(result.totalTimeUs).toBe(100);
  });

  it('includes a human-readable timestamp string', () => {
    const store = new SampleStore();
    store.record('pkg', 'file.ts', 'fn:1', 100);

    const result = aggregate(store, 'pkg');

    expect(result.timestamp).toBeTypeOf('string');
    expect(result.timestamp.length).toBeGreaterThan(0);
  });

  it('attaches asyncCallStack to FunctionEntry when asyncCallStacks map is provided', () => {
    const store = new SampleStore();
    store.record('my-app', 'src/index.ts', 'loadData:42', 100_000);

    const asyncStore = new SampleStore();
    asyncStore.record('my-app', 'src/index.ts', 'loadData:42', 50_000, 2);

    const callStacks = new Map<string, StackFrame[]>();
    callStacks.set('my-app\0src/index.ts\0loadData:42', [
      { pkg: 'my-app', file: 'src/main.ts', functionId: 'main:1' },
      { pkg: 'my-app', file: 'src/profile.ts', functionId: 'fetchProfile:15' },
      { pkg: 'my-app', file: 'src/index.ts', functionId: 'loadData:42' },
    ]);

    const result = aggregate(store, 'my-app', asyncStore, 50_000, undefined, undefined, callStacks);

    const fn = result.packages[0].files[0].functions[0];
    expect(fn.name).toBe('loadData:42');
    expect(fn.asyncCallStack).toBeDefined();
    expect(fn.asyncCallStack!.length).toBe(3);
    expect(fn.asyncCallStack![0].functionId).toBe('main:1');
    expect(fn.asyncCallStack![2].functionId).toBe('loadData:42');
  });

  it('does not attach asyncCallStack when key is not in the map', () => {
    const store = new SampleStore();
    store.record('my-app', 'src/index.ts', 'doWork:10', 100_000);

    const callStacks = new Map<string, StackFrame[]>();
    // Key for a different function
    callStacks.set('my-app\0src/other.ts\0other:5', [
      { pkg: 'my-app', file: 'src/other.ts', functionId: 'other:5' },
    ]);

    const result = aggregate(store, 'my-app', undefined, undefined, undefined, undefined, callStacks);

    const fn = result.packages[0].files[0].functions[0];
    expect(fn.asyncCallStack).toBeUndefined();
  });

  it('does not attach asyncCallStack when asyncCallStacks param is undefined', () => {
    const store = new SampleStore();
    store.record('my-app', 'src/index.ts', 'doWork:10', 100_000);

    const result = aggregate(store, 'my-app');

    const fn = result.packages[0].files[0].functions[0];
    expect(fn.asyncCallStack).toBeUndefined();
  });
});
