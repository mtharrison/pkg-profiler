import { readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

/**
 * Resolves an absolute file path to a package name and relative path.
 *
 * For node_modules paths: extracts the package name from the last /node_modules/
 * segment (critical for pnpm virtual store compatibility). Handles scoped packages.
 *
 * For first-party files: walks up directory tree looking for package.json,
 * falls back to 'app' if none found.
 */
export class PackageResolver {
  private readonly projectRoot: string;
  private readonly packageJsonCache = new Map<string, string | null>();

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  resolve(absoluteFilePath: string): { packageName: string; relativePath: string } {
    const nodeModulesSeg = `${sep}node_modules${sep}`;
    const lastIdx = absoluteFilePath.lastIndexOf(nodeModulesSeg);

    if (lastIdx !== -1) {
      // node_modules path -- extract package name from LAST /node_modules/ segment
      const afterModules = absoluteFilePath.substring(lastIdx + nodeModulesSeg.length);
      const segments = afterModules.split(sep);

      let packageName: string;
      let fileStartIdx: number;

      if (segments[0]!.startsWith('@')) {
        // Scoped package: @scope/name
        packageName = `${segments[0]}/${segments[1]}`;
        fileStartIdx = 2;
      } else {
        packageName = segments[0]!;
        fileStartIdx = 1;
      }

      const relativePath = segments.slice(fileStartIdx).join('/');

      return { packageName, relativePath };
    }

    // First-party file -- walk up looking for package.json
    const packageName = this.findPackageName(absoluteFilePath);
    const relativePath = relative(this.projectRoot, absoluteFilePath)
      .split(sep)
      .join('/');

    return { packageName, relativePath };
  }

  /**
   * Walk up from the file's directory looking for package.json.
   * Cache results to avoid repeated filesystem reads.
   */
  private findPackageName(absoluteFilePath: string): string {
    let dir = dirname(absoluteFilePath);

    while (true) {
      const cached = this.packageJsonCache.get(dir);
      if (cached !== undefined) {
        if (cached !== null) {
          return cached;
        }
        // null means we checked this dir and no package.json -- continue up
      } else {
        try {
          const raw = readFileSync(join(dir, 'package.json'), 'utf-8');
          const pkg = JSON.parse(raw) as { name?: string };
          const name = pkg.name ?? null;
          this.packageJsonCache.set(dir, name);
          if (name !== null) {
            return name;
          }
        } catch {
          // No package.json here -- cache as null and continue
          this.packageJsonCache.set(dir, null);
        }
      }

      const parent = dirname(dir);
      if (parent === dir) {
        // Reached filesystem root without finding a named package.json
        return 'app';
      }
      dir = parent;
    }
  }
}
