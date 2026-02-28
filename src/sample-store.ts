/**
 * Accumulates per-package wall time (microseconds) from the V8 CPU profiler.
 *
 * Data structure: nested Maps -- package -> file -> function -> microseconds.
 * This naturally matches the package-first tree output that the reporter
 * needs in Phase 3. O(1) lookups at each level, no serialization overhead.
 *
 * A parallel sampleCounts structure tracks raw sample counts (incremented by 1
 * per record() call) for the summary table's "Sample count" column.
 */
export class SampleStore {
  private data = new Map<string, Map<string, Map<string, number>>>();
  private counts = new Map<string, Map<string, Map<string, number>>>();
  private internalCount = 0;
  private internalSamples = 0;

  /**
   * Record a sample for a user-code frame.
   * Accumulates deltaUs microseconds for the given (package, file, function) triple,
   * and increments the parallel sample count by 1.
   */
  record(packageName: string, relativePath: string, functionId: string, deltaUs: number): void {
    // Accumulate microseconds
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

    funcMap.set(functionId, (funcMap.get(functionId) ?? 0) + deltaUs);

    // Parallel sample count (always +1)
    let countFileMap = this.counts.get(packageName);
    if (countFileMap === undefined) {
      countFileMap = new Map<string, Map<string, number>>();
      this.counts.set(packageName, countFileMap);
    }

    let countFuncMap = countFileMap.get(relativePath);
    if (countFuncMap === undefined) {
      countFuncMap = new Map<string, number>();
      countFileMap.set(relativePath, countFuncMap);
    }

    countFuncMap.set(functionId, (countFuncMap.get(functionId) ?? 0) + 1);
  }

  /** Record an internal/filtered frame (empty URL, eval, wasm, idle, etc). */
  recordInternal(deltaUs: number): void {
    this.internalCount += deltaUs;
    this.internalSamples += 1;
  }

  /** Reset all accumulated data to a clean state. */
  clear(): void {
    this.data = new Map<string, Map<string, Map<string, number>>>();
    this.counts = new Map<string, Map<string, Map<string, number>>>();
    this.internalCount = 0;
    this.internalSamples = 0;
  }

  /** Read-only access to the accumulated sample data (microseconds). */
  get packages(): ReadonlyMap<string, Map<string, Map<string, number>>> {
    return this.data;
  }

  /** Count of internal/filtered microseconds recorded. */
  get internal(): number {
    return this.internalCount;
  }

  /** Read-only access to the parallel sample counts. */
  get sampleCountsByPackage(): ReadonlyMap<string, Map<string, Map<string, number>>> {
    return this.counts;
  }

  /** Count of internal/filtered samples (raw count, not microseconds). */
  get internalSampleCount(): number {
    return this.internalSamples;
  }
}
