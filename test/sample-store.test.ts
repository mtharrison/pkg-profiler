import { describe, it, expect, beforeEach } from 'vitest';
import { SampleStore } from '../src/sample-store.js';

describe('SampleStore', () => {
  let store: SampleStore;

  beforeEach(() => {
    store = new SampleStore();
  });

  describe('record', () => {
    it('creates the correct nested Map structure for a single sample', () => {
      store.record('express', 'lib/router.js', 'handle:201', 1000);

      const pkgMap = store.packages.get('express');
      expect(pkgMap).toBeDefined();

      const fileMap = pkgMap!.get('lib/router.js');
      expect(fileMap).toBeDefined();

      expect(fileMap!.get('handle:201')).toBe(1000);
    });

    it('accumulates microseconds for repeated (package, file, function)', () => {
      store.record('express', 'lib/router.js', 'handle:201', 1000);
      store.record('express', 'lib/router.js', 'handle:201', 1000);
      store.record('express', 'lib/router.js', 'handle:201', 1000);

      const timeUs = store.packages.get('express')!.get('lib/router.js')!.get('handle:201');
      expect(timeUs).toBe(3000);
    });

    it('creates separate entries for different packages', () => {
      store.record('express', 'lib/router.js', 'handle:201', 1000);
      store.record('lodash', 'index.js', 'map:10', 500);

      expect(store.packages.has('express')).toBe(true);
      expect(store.packages.has('lodash')).toBe(true);
      expect(store.packages.size).toBe(2);
    });

    it('creates separate file entries within the same package', () => {
      store.record('express', 'lib/router.js', 'handle:201', 1000);
      store.record('express', 'lib/application.js', 'init:50', 2000);

      const pkgMap = store.packages.get('express')!;
      expect(pkgMap.has('lib/router.js')).toBe(true);
      expect(pkgMap.has('lib/application.js')).toBe(true);
      expect(pkgMap.size).toBe(2);
    });

    it('creates separate function entries within the same file', () => {
      store.record('express', 'lib/router.js', 'handle:201', 1000);
      store.record('express', 'lib/router.js', 'route:150', 2000);

      const fileMap = store.packages.get('express')!.get('lib/router.js')!;
      expect(fileMap.get('handle:201')).toBe(1000);
      expect(fileMap.get('route:150')).toBe(2000);
      expect(fileMap.size).toBe(2);
    });

    it('accumulates different deltaUs values correctly', () => {
      store.record('express', 'lib/router.js', 'handle:201', 500);
      store.record('express', 'lib/router.js', 'handle:201', 1500);
      store.record('express', 'lib/router.js', 'handle:201', 750);

      const timeUs = store.packages.get('express')!.get('lib/router.js')!.get('handle:201');
      expect(timeUs).toBe(2750);
    });
  });

  describe('sampleCounts', () => {
    it('tracks sample count separately from microseconds', () => {
      store.record('express', 'lib/router.js', 'handle:201', 500);
      store.record('express', 'lib/router.js', 'handle:201', 1500);
      store.record('express', 'lib/router.js', 'handle:201', 750);

      // Microseconds accumulated
      expect(store.packages.get('express')!.get('lib/router.js')!.get('handle:201')).toBe(2750);

      // Sample count is always 3 (one per record call)
      const sampleCount = store.sampleCountsByPackage
        .get('express')!
        .get('lib/router.js')!
        .get('handle:201');
      expect(sampleCount).toBe(3);
    });

    it('tracks sample counts per package independently', () => {
      store.record('express', 'lib/router.js', 'handle:201', 1000);
      store.record('lodash', 'index.js', 'map:10', 500);
      store.record('lodash', 'index.js', 'map:10', 800);

      expect(store.sampleCountsByPackage.get('express')!.get('lib/router.js')!.get('handle:201')).toBe(1);
      expect(store.sampleCountsByPackage.get('lodash')!.get('index.js')!.get('map:10')).toBe(2);
    });
  });

  describe('recordInternal', () => {
    it('accumulates microseconds for internal frames', () => {
      expect(store.internal).toBe(0);

      store.recordInternal(1000);
      expect(store.internal).toBe(1000);

      store.recordInternal(500);
      store.recordInternal(750);
      expect(store.internal).toBe(2250);
    });

    it('tracks internal sample count separately from microseconds', () => {
      store.recordInternal(1000);
      store.recordInternal(500);
      store.recordInternal(750);

      expect(store.internal).toBe(2250);
      expect(store.internalSampleCount).toBe(3);
    });
  });

  describe('clear', () => {
    it('empties all data, counts, and resets internal counters', () => {
      store.record('express', 'lib/router.js', 'handle:201', 1000);
      store.record('lodash', 'index.js', 'map:10', 500);
      store.recordInternal(200);
      store.recordInternal(300);

      store.clear();

      expect(store.packages.size).toBe(0);
      expect(store.internal).toBe(0);
      expect(store.sampleCountsByPackage.size).toBe(0);
      expect(store.internalSampleCount).toBe(0);
    });

    it('allows recording again after clear (fresh state)', () => {
      store.record('express', 'lib/router.js', 'handle:201', 1000);
      store.clear();

      store.record('lodash', 'index.js', 'map:10', 2000);

      expect(store.packages.size).toBe(1);
      expect(store.packages.has('lodash')).toBe(true);
      expect(store.packages.has('express')).toBe(false);
    });
  });

  describe('packages getter', () => {
    it('returns the underlying Map (ReadonlyMap type prevents mutation)', () => {
      store.record('my-app', 'src/index.ts', 'main:1', 1000);

      const packages = store.packages;
      expect(packages).toBeInstanceOf(Map);
      expect(packages.get('my-app')).toBeDefined();
    });
  });
});
