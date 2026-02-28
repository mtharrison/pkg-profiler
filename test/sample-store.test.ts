import { describe, it, expect, beforeEach } from 'vitest';
import { SampleStore } from '../src/sample-store.js';

describe('SampleStore', () => {
  let store: SampleStore;

  beforeEach(() => {
    store = new SampleStore();
  });

  describe('record', () => {
    it('creates the correct nested Map structure for a single sample', () => {
      store.record('express', 'lib/router.js', 'handle:201');

      const pkgMap = store.packages.get('express');
      expect(pkgMap).toBeDefined();

      const fileMap = pkgMap!.get('lib/router.js');
      expect(fileMap).toBeDefined();

      expect(fileMap!.get('handle:201')).toBe(1);
    });

    it('increments the count for repeated (package, file, function)', () => {
      store.record('express', 'lib/router.js', 'handle:201');
      store.record('express', 'lib/router.js', 'handle:201');
      store.record('express', 'lib/router.js', 'handle:201');

      const count = store.packages.get('express')!.get('lib/router.js')!.get('handle:201');
      expect(count).toBe(3);
    });

    it('creates separate entries for different packages', () => {
      store.record('express', 'lib/router.js', 'handle:201');
      store.record('lodash', 'index.js', 'map:10');

      expect(store.packages.has('express')).toBe(true);
      expect(store.packages.has('lodash')).toBe(true);
      expect(store.packages.size).toBe(2);
    });

    it('creates separate file entries within the same package', () => {
      store.record('express', 'lib/router.js', 'handle:201');
      store.record('express', 'lib/application.js', 'init:50');

      const pkgMap = store.packages.get('express')!;
      expect(pkgMap.has('lib/router.js')).toBe(true);
      expect(pkgMap.has('lib/application.js')).toBe(true);
      expect(pkgMap.size).toBe(2);
    });

    it('creates separate function entries within the same file', () => {
      store.record('express', 'lib/router.js', 'handle:201');
      store.record('express', 'lib/router.js', 'route:150');

      const fileMap = store.packages.get('express')!.get('lib/router.js')!;
      expect(fileMap.get('handle:201')).toBe(1);
      expect(fileMap.get('route:150')).toBe(1);
      expect(fileMap.size).toBe(2);
    });
  });

  describe('recordInternal', () => {
    it('increments the internal counter', () => {
      expect(store.internal).toBe(0);

      store.recordInternal();
      expect(store.internal).toBe(1);

      store.recordInternal();
      store.recordInternal();
      expect(store.internal).toBe(3);
    });
  });

  describe('clear', () => {
    it('empties all data and resets internal count', () => {
      store.record('express', 'lib/router.js', 'handle:201');
      store.record('lodash', 'index.js', 'map:10');
      store.recordInternal();
      store.recordInternal();

      store.clear();

      expect(store.packages.size).toBe(0);
      expect(store.internal).toBe(0);
    });

    it('allows recording again after clear (fresh state)', () => {
      store.record('express', 'lib/router.js', 'handle:201');
      store.clear();

      store.record('lodash', 'index.js', 'map:10');

      expect(store.packages.size).toBe(1);
      expect(store.packages.has('lodash')).toBe(true);
      expect(store.packages.has('express')).toBe(false);
    });
  });

  describe('packages getter', () => {
    it('returns the underlying Map (ReadonlyMap type prevents mutation)', () => {
      store.record('my-app', 'src/index.ts', 'main:1');

      const packages = store.packages;
      expect(packages).toBeInstanceOf(Map);
      expect(packages.get('my-app')).toBeDefined();
    });
  });
});
