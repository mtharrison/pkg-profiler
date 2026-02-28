import { describe, it, expect } from 'vitest';
import { parseFrame } from '../src/frame-parser.js';
import type { RawCallFrame } from '../src/types.js';

/** Helper to build a minimal RawCallFrame with sensible defaults. */
function makeFrame(overrides: Partial<RawCallFrame> = {}): RawCallFrame {
  return {
    functionName: 'testFn',
    scriptId: '42',
    url: '/Users/matt/project/src/index.ts',
    lineNumber: 0,
    columnNumber: 0,
    ...overrides,
  };
}

describe('parseFrame', () => {
  describe('internal frames (empty URL)', () => {
    it('classifies (root) as internal', () => {
      const result = parseFrame(makeFrame({ url: '', functionName: '(root)' }));
      expect(result).toEqual({ kind: 'internal' });
    });

    it('classifies (idle) as internal', () => {
      const result = parseFrame(makeFrame({ url: '', functionName: '(idle)' }));
      expect(result).toEqual({ kind: 'internal' });
    });

    it('classifies (garbage collector) as internal', () => {
      const result = parseFrame(makeFrame({ url: '', functionName: '(garbage collector)' }));
      expect(result).toEqual({ kind: 'internal' });
    });

    it('classifies (program) as internal', () => {
      const result = parseFrame(makeFrame({ url: '', functionName: '(program)' }));
      expect(result).toEqual({ kind: 'internal' });
    });
  });

  describe('internal frames (node: prefix)', () => {
    it('classifies node:internal/modules/run_main as internal', () => {
      const result = parseFrame(makeFrame({ url: 'node:internal/modules/run_main' }));
      expect(result).toEqual({ kind: 'internal' });
    });

    it('classifies node:fs as internal', () => {
      const result = parseFrame(makeFrame({ url: 'node:fs' }));
      expect(result).toEqual({ kind: 'internal' });
    });
  });

  describe('wasm frames', () => {
    it('classifies wasm:// URLs as wasm', () => {
      const result = parseFrame(makeFrame({ url: 'wasm://wasm/func123' }));
      expect(result).toEqual({ kind: 'wasm' });
    });
  });

  describe('eval frames', () => {
    it('classifies URLs containing "eval" as eval', () => {
      const result = parseFrame(makeFrame({ url: 'evalmachine.<anonymous>' }));
      expect(result).toEqual({ kind: 'eval' });
    });
  });

  describe('user frames (ESM file:// URLs)', () => {
    it('converts file:// URL to filesystem path', () => {
      const result = parseFrame(makeFrame({
        url: 'file:///Users/matt/project/src/index.mjs',
        functionName: 'main',
        lineNumber: 10,
      }));
      expect(result).toEqual({
        kind: 'user',
        filePath: '/Users/matt/project/src/index.mjs',
        functionId: 'main:11',
      });
    });

    it('decodes percent-encoded spaces in file:// URLs', () => {
      const result = parseFrame(makeFrame({
        url: 'file:///Users/matt/my%20project/src/app.ts',
        functionName: 'handler',
        lineNumber: 5,
      }));
      expect(result).toEqual({
        kind: 'user',
        filePath: '/Users/matt/my project/src/app.ts',
        functionId: 'handler:6',
      });
    });
  });

  describe('user frames (CJS bare paths)', () => {
    it('passes bare absolute paths through as-is', () => {
      const result = parseFrame(makeFrame({
        url: '/Users/matt/project/node_modules/express/lib/router.js',
        functionName: 'handle',
        lineNumber: 200,
      }));
      expect(result).toEqual({
        kind: 'user',
        filePath: '/Users/matt/project/node_modules/express/lib/router.js',
        functionId: 'handle:201',
      });
    });
  });

  describe('function identifiers', () => {
    it('uses <anonymous> for empty functionName', () => {
      const result = parseFrame(makeFrame({
        url: '/Users/matt/project/src/util.ts',
        functionName: '',
        lineNumber: 7,
      }));
      expect(result).toHaveProperty('kind', 'user');
      if (result.kind === 'user') {
        expect(result.functionId).toBe('<anonymous>:8');
      }
    });

    it('builds functionId with named function', () => {
      const result = parseFrame(makeFrame({
        url: '/Users/matt/project/src/api.ts',
        functionName: 'processRequest',
        lineNumber: 41,
      }));
      expect(result).toHaveProperty('kind', 'user');
      if (result.kind === 'user') {
        expect(result.functionId).toBe('processRequest:42');
      }
    });

    it('converts lineNumber 0 to 1-based (line 1)', () => {
      const result = parseFrame(makeFrame({
        url: '/Users/matt/project/src/entry.ts',
        functionName: 'init',
        lineNumber: 0,
      }));
      expect(result).toHaveProperty('kind', 'user');
      if (result.kind === 'user') {
        expect(result.functionId).toBe('init:1');
      }
    });
  });
});
