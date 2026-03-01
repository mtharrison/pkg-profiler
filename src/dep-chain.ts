/**
 * Resolve dependency chains for transitive npm packages.
 *
 * BFS through node_modules package.json files starting from the project's
 * direct dependencies to find the shortest path to each profiled package.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface PkgJson {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

function readPkgJson(dir: string, cache: Map<string, PkgJson | null>): PkgJson | null {
  if (cache.has(dir)) return cache.get(dir)!;
  try {
    const raw = readFileSync(join(dir, 'package.json'), 'utf-8');
    const parsed = JSON.parse(raw) as PkgJson;
    cache.set(dir, parsed);
    return parsed;
  } catch {
    cache.set(dir, null);
    return null;
  }
}

function depsOf(pkg: PkgJson): string[] {
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ];
}

/**
 * Resolve the shortest dependency chain from the project's direct deps
 * to each of the given package names.
 *
 * @param projectRoot - Absolute path to the project root (contains package.json and node_modules/)
 * @param packageNames - Set of package names that appeared in profiling data
 * @param maxDepth - Maximum BFS depth to search (default 5)
 * @returns Map from package name to chain array (e.g. `["express", "qs"]` means project -> express -> qs)
 */
export function resolveDependencyChains(
  projectRoot: string,
  packageNames: Set<string>,
  maxDepth: number = 5,
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const cache = new Map<string, PkgJson | null>();

  const rootPkg = readPkgJson(projectRoot, cache);
  if (!rootPkg) return result;

  const directDeps = new Set(depsOf(rootPkg));

  // Mark direct deps — they have no chain
  for (const name of packageNames) {
    if (directDeps.has(name)) {
      // Direct dep: no chain needed (empty array signals "direct")
    }
  }

  // Only need to resolve transitive deps
  const targets = new Set<string>();
  for (const name of packageNames) {
    if (!directDeps.has(name)) {
      targets.add(name);
    }
  }

  if (targets.size === 0) return result;

  // BFS: queue entries are [packageName, chain-so-far]
  const visited = new Set<string>();
  const queue: Array<[string, string[]]> = [];

  for (const dep of directDeps) {
    queue.push([dep, [dep]]);
    visited.add(dep);
  }

  let qi = 0;
  while (qi < queue.length && targets.size > 0) {
    const [pkgName, chain] = queue[qi++]!;

    if (chain.length > maxDepth) continue;

    // If this package is one of our targets, record the chain (excluding the target itself)
    if (targets.has(pkgName)) {
      result.set(pkgName, chain.slice(0, -1));
      targets.delete(pkgName);
      if (targets.size === 0) break;
    }

    // Read this package's deps and enqueue
    const pkgDir = join(projectRoot, 'node_modules', pkgName);
    const pkg = readPkgJson(pkgDir, cache);
    if (!pkg) continue;

    for (const child of depsOf(pkg)) {
      if (!visited.has(child)) {
        visited.add(child);
        queue.push([child, [...chain, child]]);
      }
    }
  }

  return result;
}
