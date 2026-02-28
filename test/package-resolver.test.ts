import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { PackageResolver } from '../src/package-resolver.js';

describe('PackageResolver', () => {
  describe('node_modules packages', () => {
    it('resolves a standard npm package path', () => {
      const resolver = new PackageResolver('/project');
      const result = resolver.resolve(`/project/node_modules/express/lib/router.js`);
      expect(result).toEqual({ packageName: 'express', relativePath: 'lib/router.js' });
    });

    it('resolves a package root file', () => {
      const resolver = new PackageResolver('/project');
      const result = resolver.resolve(`/project/node_modules/lodash/index.js`);
      expect(result).toEqual({ packageName: 'lodash', relativePath: 'index.js' });
    });

    it('resolves deeply nested node_modules using the last segment', () => {
      const resolver = new PackageResolver('/project');
      const result = resolver.resolve(
        `/project/node_modules/a/node_modules/b/index.js`,
      );
      expect(result).toEqual({ packageName: 'b', relativePath: 'index.js' });
    });
  });

  describe('scoped packages', () => {
    it('resolves a scoped package path', () => {
      const resolver = new PackageResolver('/project');
      const result = resolver.resolve(
        `/project/node_modules/@babel/core/lib/index.js`,
      );
      expect(result).toEqual({ packageName: '@babel/core', relativePath: 'lib/index.js' });
    });

    it('resolves a scoped package root file', () => {
      const resolver = new PackageResolver('/project');
      const result = resolver.resolve(
        `/project/node_modules/@types/node/index.d.ts`,
      );
      expect(result).toEqual({ packageName: '@types/node', relativePath: 'index.d.ts' });
    });
  });

  describe('pnpm virtual store', () => {
    it('resolves an unscoped pnpm virtual store path', () => {
      const resolver = new PackageResolver('/project');
      const result = resolver.resolve(
        `/project/node_modules/.pnpm/express@4.21.2/node_modules/express/lib/router.js`,
      );
      expect(result).toEqual({ packageName: 'express', relativePath: 'lib/router.js' });
    });

    it('resolves a scoped pnpm virtual store path', () => {
      const resolver = new PackageResolver('/project');
      const result = resolver.resolve(
        `/project/node_modules/.pnpm/@babel+core@7.24.0/node_modules/@babel/core/lib/index.js`,
      );
      expect(result).toEqual({ packageName: '@babel/core', relativePath: 'lib/index.js' });
    });
  });

  describe('first-party files', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'pkg-resolver-test-'));
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('resolves to the package name from package.json', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({ name: 'my-app' }),
      );
      mkdirSync(join(tempDir, 'src'), { recursive: true });
      const filePath = join(tempDir, 'src', 'index.ts');
      writeFileSync(filePath, '');

      const resolver = new PackageResolver(tempDir);
      const result = resolver.resolve(filePath);

      expect(result.packageName).toBe('my-app');
      expect(result.relativePath).toBe('src/index.ts');
    });

    it('resolves a file in a subdirectory to the root package name', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({ name: 'my-app' }),
      );
      mkdirSync(join(tempDir, 'src', 'lib', 'utils'), { recursive: true });
      const filePath = join(tempDir, 'src', 'lib', 'utils', 'helper.ts');
      writeFileSync(filePath, '');

      const resolver = new PackageResolver(tempDir);
      const result = resolver.resolve(filePath);

      expect(result.packageName).toBe('my-app');
      expect(result.relativePath).toBe('src/lib/utils/helper.ts');
    });

    it('falls back to "app" when no package.json is found', () => {
      // tempDir has no package.json
      mkdirSync(join(tempDir, 'src'), { recursive: true });
      const filePath = join(tempDir, 'src', 'index.ts');
      writeFileSync(filePath, '');

      const resolver = new PackageResolver(tempDir);
      const result = resolver.resolve(filePath);

      expect(result.packageName).toBe('app');
    });

    it('uses forward slashes in relativePath regardless of platform', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({ name: 'test-pkg' }),
      );
      mkdirSync(join(tempDir, 'src', 'deep'), { recursive: true });
      const filePath = join(tempDir, 'src', 'deep', 'file.ts');
      writeFileSync(filePath, '');

      const resolver = new PackageResolver(tempDir);
      const result = resolver.resolve(filePath);

      expect(result.relativePath).not.toContain('\\');
      expect(result.relativePath).toBe('src/deep/file.ts');
    });

    it('caches package.json lookups across multiple resolves', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({ name: 'cached-app' }),
      );
      mkdirSync(join(tempDir, 'src'), { recursive: true });
      writeFileSync(join(tempDir, 'src', 'a.ts'), '');
      writeFileSync(join(tempDir, 'src', 'b.ts'), '');

      const resolver = new PackageResolver(tempDir);
      const resultA = resolver.resolve(join(tempDir, 'src', 'a.ts'));
      const resultB = resolver.resolve(join(tempDir, 'src', 'b.ts'));

      expect(resultA.packageName).toBe('cached-app');
      expect(resultB.packageName).toBe('cached-app');
    });
  });
});
