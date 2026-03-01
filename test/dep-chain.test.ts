import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveDependencyChains } from '../src/dep-chain.js';

describe('resolveDependencyChains()', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function setupProject(rootDeps: Record<string, string>, modules: Record<string, { dependencies?: Record<string, string> }>) {
    tmpDir = mkdtempSync(join(tmpdir(), 'dep-chain-test-'));
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-app', dependencies: rootDeps }));
    mkdirSync(join(tmpDir, 'node_modules'), { recursive: true });

    for (const [name, pkg] of Object.entries(modules)) {
      const pkgDir = join(tmpDir, 'node_modules', name);
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name, ...pkg }));
    }
  }

  it('returns empty map for direct dependencies', () => {
    setupProject(
      { express: '^4.0.0' },
      { express: {} },
    );

    const result = resolveDependencyChains(tmpDir, new Set(['express']));
    expect(result.size).toBe(0);
  });

  it('finds 1-hop transitive dependency', () => {
    setupProject(
      { express: '^4.0.0' },
      {
        express: { dependencies: { qs: '^6.0.0' } },
        qs: {},
      },
    );

    const result = resolveDependencyChains(tmpDir, new Set(['qs']));
    expect(result.get('qs')).toEqual(['express']);
  });

  it('finds 2-hop transitive dependency', () => {
    setupProject(
      { express: '^4.0.0' },
      {
        express: { dependencies: { 'body-parser': '^1.0.0' } },
        'body-parser': { dependencies: { qs: '^6.0.0' } },
        qs: {},
      },
    );

    const result = resolveDependencyChains(tmpDir, new Set(['qs']));
    expect(result.get('qs')).toEqual(['express', 'body-parser']);
  });

  it('finds shortest path when multiple chains exist', () => {
    setupProject(
      { express: '^4.0.0', koa: '^2.0.0' },
      {
        express: { dependencies: { 'body-parser': '^1.0.0' } },
        'body-parser': { dependencies: { qs: '^6.0.0' } },
        koa: { dependencies: { qs: '^6.0.0' } },
        qs: {},
      },
    );

    const result = resolveDependencyChains(tmpDir, new Set(['qs']));
    // koa -> qs is shorter (1 hop) than express -> body-parser -> qs (2 hops)
    expect(result.get('qs')).toEqual(['koa']);
  });

  it('handles scoped packages', () => {
    setupProject(
      { '@scope/parent': '^1.0.0' },
      {
        '@scope/parent': { dependencies: { '@scope/child': '^1.0.0' } },
      },
    );

    // Create the scoped package directory
    const scopeDir = join(tmpDir, 'node_modules', '@scope', 'child');
    mkdirSync(scopeDir, { recursive: true });
    writeFileSync(join(scopeDir, 'package.json'), JSON.stringify({ name: '@scope/child' }));

    const result = resolveDependencyChains(tmpDir, new Set(['@scope/child']));
    expect(result.get('@scope/child')).toEqual(['@scope/parent']);
  });

  it('gracefully handles missing package.json', () => {
    setupProject(
      { express: '^4.0.0' },
      {
        express: { dependencies: { 'missing-pkg': '^1.0.0' } },
      },
    );
    // 'missing-pkg' has no directory in node_modules

    const result = resolveDependencyChains(tmpDir, new Set(['missing-pkg']));
    // It's listed as a dep of express but has no package.json on disk — still found via BFS
    expect(result.get('missing-pkg')).toEqual(['express']);
  });

  it('respects maxDepth limit', () => {
    setupProject(
      { a: '^1.0.0' },
      {
        a: { dependencies: { b: '^1.0.0' } },
        b: { dependencies: { c: '^1.0.0' } },
        c: { dependencies: { d: '^1.0.0' } },
        d: {},
      },
    );

    const result = resolveDependencyChains(tmpDir, new Set(['d']), 2);
    // a -> b -> c -> d is 4 hops, maxDepth 2 means chain length can't exceed 2
    expect(result.has('d')).toBe(false);
  });

  it('returns empty map when project has no package.json', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dep-chain-test-'));
    // No package.json at root

    const result = resolveDependencyChains(tmpDir, new Set(['express']));
    expect(result.size).toBe(0);
  });

  it('handles multiple targets in a single BFS pass', () => {
    setupProject(
      { express: '^4.0.0' },
      {
        express: { dependencies: { qs: '^6.0.0', 'content-type': '^1.0.0' } },
        qs: {},
        'content-type': {},
      },
    );

    const result = resolveDependencyChains(tmpDir, new Set(['qs', 'content-type']));
    expect(result.get('qs')).toEqual(['express']);
    expect(result.get('content-type')).toEqual(['express']);
  });

  it('includes optionalDependencies from project root', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dep-chain-test-'));
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-app',
      dependencies: {},
      optionalDependencies: { fsevents: '^2.0.0' },
    }));
    mkdirSync(join(tmpDir, 'node_modules', 'fsevents'), { recursive: true });
    writeFileSync(join(tmpDir, 'node_modules', 'fsevents', 'package.json'), JSON.stringify({ name: 'fsevents' }));

    const result = resolveDependencyChains(tmpDir, new Set(['fsevents']));
    // fsevents is a direct optional dep, should have no chain
    expect(result.size).toBe(0);
  });
});
