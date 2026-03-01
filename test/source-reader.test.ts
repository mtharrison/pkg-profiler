import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { readSourceSnippets, snippetKey } from '../src/reporter/source-reader.js';
import type { PackageEntry } from '../src/types.js';

const PROJECT_ROOT = join(import.meta.dirname, '..');

function makePackages(overrides?: Partial<PackageEntry>[]): PackageEntry[] {
  const defaults: PackageEntry[] = [
    {
      name: 'my-app',
      timeUs: 100_000,
      pct: 100,
      isFirstParty: true,
      sampleCount: 10,
      files: [
        {
          name: 'test/fixtures/source-sample.ts',
          timeUs: 100_000,
          pct: 100,
          sampleCount: 10,
          functions: [
            { name: 'secondFunction:8', timeUs: 60_000, pct: 60, sampleCount: 6 },
            { name: 'thirdFunction:14', timeUs: 40_000, pct: 40, sampleCount: 4 },
          ],
          otherCount: 0,
        },
      ],
      otherCount: 0,
    },
  ];
  if (overrides) {
    return overrides.map((o, i) => ({ ...defaults[i % defaults.length], ...o }));
  }
  return defaults;
}

describe('snippetKey()', () => {
  it('builds a pipe-delimited key', () => {
    expect(snippetKey('pkg', 'file.ts', 'fn:10')).toBe('pkg|file.ts|fn:10');
  });
});

describe('readSourceSnippets()', () => {
  it('reads fixture file and returns snippet with hot line', () => {
    const packages = makePackages();
    const map = readSourceSnippets(packages, PROJECT_ROOT);

    const key = snippetKey('my-app', 'test/fixtures/source-sample.ts', 'secondFunction:8');
    expect(map.has(key)).toBe(true);

    const html = map.get(key)!;
    expect(html).toContain('<pre class="source-snippet">');
    expect(html).toContain('src-hot');
    expect(html).toContain('src-lineno');
    // Line 8 is the hot line: `const x = 42;`
    expect(html).toContain('42');
  });

  it('respects contextLines parameter', () => {
    const packages = makePackages();
    const map = readSourceSnippets(packages, PROJECT_ROOT, 2);

    const key = snippetKey('my-app', 'test/fixtures/source-sample.ts', 'secondFunction:8');
    const html = map.get(key)!;
    // With contextLines=2, we should see lines 6-10 (5 lines total)
    const lineMatches = html.match(/<div class="src-line/g);
    expect(lineMatches).not.toBeNull();
    expect(lineMatches!.length).toBe(5);
  });

  it('handles missing files gracefully', () => {
    const packages: PackageEntry[] = [
      {
        name: 'my-app',
        timeUs: 100_000,
        pct: 100,
        isFirstParty: true,
        sampleCount: 5,
        files: [
          {
            name: 'nonexistent/file.ts',
            timeUs: 100_000,
            pct: 100,
            sampleCount: 5,
            functions: [
              { name: 'foo:5', timeUs: 100_000, pct: 100, sampleCount: 5 },
            ],
            otherCount: 0,
          },
        ],
        otherCount: 0,
      },
    ];
    const map = readSourceSnippets(packages, PROJECT_ROOT);
    expect(map.size).toBe(0);
  });

  it('skips node (built-in) files', () => {
    const packages: PackageEntry[] = [
      {
        name: 'node',
        timeUs: 50_000,
        pct: 50,
        isFirstParty: false,
        sampleCount: 3,
        files: [
          {
            name: 'node (built-in)',
            timeUs: 50_000,
            pct: 50,
            sampleCount: 3,
            functions: [
              { name: 'startup:1', timeUs: 50_000, pct: 50, sampleCount: 3 },
            ],
            otherCount: 0,
          },
        ],
        otherCount: 0,
      },
    ];
    const map = readSourceSnippets(packages, PROJECT_ROOT);
    expect(map.size).toBe(0);
  });

  it('skips functions without line numbers', () => {
    const packages: PackageEntry[] = [
      {
        name: 'my-app',
        timeUs: 100_000,
        pct: 100,
        isFirstParty: true,
        sampleCount: 5,
        files: [
          {
            name: 'test/fixtures/source-sample.ts',
            timeUs: 100_000,
            pct: 100,
            sampleCount: 5,
            functions: [
              { name: 'anonymous', timeUs: 100_000, pct: 100, sampleCount: 5 },
            ],
            otherCount: 0,
          },
        ],
        otherCount: 0,
      },
    ];
    const map = readSourceSnippets(packages, PROJECT_ROOT);
    expect(map.size).toBe(0);
  });

  it('produces syntax-highlighted output', () => {
    const packages = makePackages();
    const map = readSourceSnippets(packages, PROJECT_ROOT);
    const key = snippetKey('my-app', 'test/fixtures/source-sample.ts', 'secondFunction:8');
    const html = map.get(key)!;
    // Should contain syntax highlighting spans
    expect(html).toContain('tok-kw');
    expect(html).toContain('tok-num');
  });
});
