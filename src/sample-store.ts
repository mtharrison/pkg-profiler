/**
 * Accumulates per-package sample counts from the V8 CPU profiler.
 *
 * Data structure: nested Maps -- package -> file -> function -> count.
 * This naturally matches the package-first tree output that the reporter
 * needs in Phase 3. O(1) lookups at each level, no serialization overhead.
 */
export class SampleStore {
  private data = new Map<string, Map<string, Map<string, number>>>();
  private internalCount = 0;

  /**
   * Record a sample for a user-code frame.
   * Increments the count for the given (package, file, function) triple.
   */
  record(packageName: string, relativePath: string, functionId: string): void {
    let fileMap = this.data.get(packageName);
    if (fileMap === undefined) {
      fileMap = new Map<string, Map<string, number>>();
      this.data.set(packageName, fileMap);
    }

    let funcMap = fileMap.get(relativePath);
    if (funcMap === undefined) {
      funcMap = new Map<string, number>();
      fileMap.set(relativePath, funcMap);
    }

    funcMap.set(functionId, (funcMap.get(functionId) ?? 0) + 1);
  }

  /** Record an internal/filtered frame (node:, eval, wasm, idle, etc). */
  recordInternal(): void {
    this.internalCount += 1;
  }

  /** Reset all accumulated data to a clean state. */
  clear(): void {
    this.data = new Map<string, Map<string, Map<string, number>>>();
    this.internalCount = 0;
  }

  /** Read-only access to the accumulated sample data. */
  get packages(): ReadonlyMap<string, Map<string, Map<string, number>>> {
    return this.data;
  }

  /** Count of internal/filtered frames recorded. */
  get internal(): number {
    return this.internalCount;
  }
}
