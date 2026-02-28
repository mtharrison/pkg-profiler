import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SampleStore } from '../src/sample-store.js';
import { aggregate } from '../src/reporter/aggregate.js';
import type { ReportData } from '../src/types.js';

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
 * Total = 990_000 us. 5% threshold = 49_500 us.
 *
 * Above threshold at package level: my-app (600k), express (350k)
 * Below threshold at package level: lodash (30k), tiny-lib (10k)
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

  it('sorts packages by timeUs descending', () => {
    const store = buildCanonicalStore();
    const result = aggregate(store, 'my-app');

    // Only above-threshold packages appear
    expect(result.packages.length).toBe(2);
    expect(result.packages[0].name).toBe('my-app');
    expect(result.packages[0].timeUs).toBe(600_000);
    expect(result.packages[1].name).toBe('express');
    expect(result.packages[1].timeUs).toBe(350_000);
  });

  it('applies 5% threshold at package level and counts "other"', () => {
    const store = buildCanonicalStore();
    const result = aggregate(store, 'my-app');

    // lodash (30k = 3.03%) and tiny-lib (10k = 1.01%) are below 5%
    expect(result.otherCount).toBe(2);
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

  it('applies 5% threshold at file level relative to total and counts "other"', () => {
    // express/lib/app.js = 50_000. 50_000/990_000 = 5.05%, just above threshold.
    // All files in this canonical set are >= 50k so none drop out.
    const store = buildCanonicalStore();
    const result = aggregate(store, 'my-app');

    const express = result.packages[1];
    expect(express.otherCount).toBe(0);
    expect(express.files.length).toBe(2);
  });

  it('applies 5% threshold at file level - drops files below threshold', () => {
    const store = new SampleStore();
    // big-pkg: "main.ts" -> fn:1 (800_000us)
    store.record('big-pkg', 'main.ts', 'fn:1', 800_000);
    // big-pkg: "tiny.ts" -> fn:2 (10_000us) -- 10k / 810k = 1.2%, below 5%
    store.record('big-pkg', 'tiny.ts', 'fn:2', 10_000);

    const result = aggregate(store, 'big-pkg');
    const pkg = result.packages[0];

    expect(pkg.files.length).toBe(1);
    expect(pkg.files[0].name).toBe('main.ts');
    expect(pkg.otherCount).toBe(1);
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

  it('applies 5% threshold at function level relative to total and counts "other"', () => {
    const store = new SampleStore();
    // pkg: "file.ts" -> big:1 (900_000), small:2 (10_000)
    // total = 910_000, threshold = 45_500
    // big:1 is above, small:2 is below
    store.record('pkg', 'file.ts', 'big:1', 900_000);
    store.record('pkg', 'file.ts', 'small:2', 10_000);

    const result = aggregate(store, 'pkg');
    const file = result.packages[0].files[0];

    expect(file.functions.length).toBe(1);
    expect(file.functions[0].name).toBe('big:1');
    expect(file.otherCount).toBe(1);
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

  it('handles single package above threshold with otherCount 0', () => {
    const store = new SampleStore();
    store.record('solo', 'index.ts', 'run:1', 100_000);

    const result = aggregate(store, 'solo');

    expect(result.packages.length).toBe(1);
    expect(result.packages[0].name).toBe('solo');
    expect(result.otherCount).toBe(0);
    expect(result.totalTimeUs).toBe(100_000);
  });

  it('handles all packages below threshold -> packages empty, otherCount = N', () => {
    const store = new SampleStore();
    // Many tiny packages each with 100us. Each is 100/500 = 20% individually,
    // but let's make them tiny enough: 5 packages of 100us each = 500 total, threshold=25
    // Need: each < 5%. So 100 packages of 1us each? Total=100, threshold=5. Each=1%.
    for (let i = 0; i < 100; i++) {
      store.record(`pkg-${i}`, 'index.ts', 'fn:1', 1);
    }
    // total = 100, threshold = 5. Each package = 1us = 1% < 5%
    const result = aggregate(store, 'none-match');

    expect(result.packages).toEqual([]);
    expect(result.otherCount).toBe(100);
    expect(result.totalTimeUs).toBe(100);
  });

  it('includes a human-readable timestamp string', () => {
    const store = new SampleStore();
    store.record('pkg', 'file.ts', 'fn:1', 100);

    const result = aggregate(store, 'pkg');

    expect(result.timestamp).toBeTypeOf('string');
    expect(result.timestamp.length).toBeGreaterThan(0);
  });
});
