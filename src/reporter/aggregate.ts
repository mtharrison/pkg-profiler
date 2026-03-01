/**
 * Transform raw SampleStore data into a sorted ReportData structure.
 *
 * Pure function: reads nested Maps from SampleStore, computes percentages,
 * and sorts by timeUs descending at each level. No threshold filtering —
 * all entries are included so the HTML report can apply thresholds client-side.
 */

import type { SampleStore } from '../sample-store.js';
import type {
  ReportData,
  PackageEntry,
  FileEntry,
  FunctionEntry,
} from '../types.js';

/**
 * Sum all microseconds in a SampleStore.
 */
function sumStore(store: SampleStore): number {
  let total = 0;
  for (const fileMap of store.packages.values()) {
    for (const funcMap of fileMap.values()) {
      for (const us of funcMap.values()) {
        total += us;
      }
    }
  }
  return total;
}

/**
 * Aggregate SampleStore data into a ReportData structure.
 *
 * @param store - SampleStore with accumulated microseconds and sample counts
 * @param projectName - Name of the first-party project (for isFirstParty flag)
 * @param asyncStore - Optional SampleStore with async wait time data
 * @returns ReportData with all packages sorted desc by time, no threshold applied
 */
export function aggregate(store: SampleStore, projectName: string, asyncStore?: SampleStore, globalAsyncTimeUs?: number, wallTimeUs?: number): ReportData {
  // 1. Calculate total user-attributed time
  const totalTimeUs = sumStore(store);
  // Per-entry percentages use the raw sum so they add up to 100%
  const totalAsyncTimeUs = asyncStore ? sumStore(asyncStore) : 0;
  // Header total uses the merged (de-duplicated) global value when available
  const headerAsyncTimeUs = globalAsyncTimeUs ?? totalAsyncTimeUs;

  if (totalTimeUs === 0 && totalAsyncTimeUs === 0) {
    return {
      timestamp: new Date().toLocaleString(),
      totalTimeUs: 0,
      packages: [],
      otherCount: 0,
      projectName,
    };
  }

  // Collect all package names from both stores
  const allPackageNames = new Set<string>();
  for (const name of store.packages.keys()) allPackageNames.add(name);
  if (asyncStore) {
    for (const name of asyncStore.packages.keys()) allPackageNames.add(name);
  }

  const packages: PackageEntry[] = [];

  // 2. Process each package
  for (const packageName of allPackageNames) {
    const fileMap = store.packages.get(packageName);

    // Sum total CPU time for this package
    let packageTimeUs = 0;
    if (fileMap) {
      for (const funcMap of fileMap.values()) {
        for (const us of funcMap.values()) {
          packageTimeUs += us;
        }
      }
    }

    // Sum total sample count for this package
    let packageSampleCount = 0;
    const countFileMap = store.sampleCountsByPackage.get(packageName);
    if (countFileMap) {
      for (const countFuncMap of countFileMap.values()) {
        for (const count of countFuncMap.values()) {
          packageSampleCount += count;
        }
      }
    }

    // Async totals for this package
    let packageAsyncTimeUs = 0;
    let packageAsyncOpCount = 0;
    const asyncFileMap = asyncStore?.packages.get(packageName);
    const asyncCountFileMap = asyncStore?.sampleCountsByPackage.get(packageName);
    if (asyncFileMap) {
      for (const funcMap of asyncFileMap.values()) {
        for (const us of funcMap.values()) {
          packageAsyncTimeUs += us;
        }
      }
    }
    if (asyncCountFileMap) {
      for (const countFuncMap of asyncCountFileMap.values()) {
        for (const count of countFuncMap.values()) {
          packageAsyncOpCount += count;
        }
      }
    }

    // 3. Collect all file names from both stores for this package
    const allFileNames = new Set<string>();
    if (fileMap) {
      for (const name of fileMap.keys()) allFileNames.add(name);
    }
    if (asyncFileMap) {
      for (const name of asyncFileMap.keys()) allFileNames.add(name);
    }

    const files: FileEntry[] = [];

    for (const fileName of allFileNames) {
      const funcMap = fileMap?.get(fileName);

      // Sum CPU time for this file
      let fileTimeUs = 0;
      if (funcMap) {
        for (const us of funcMap.values()) {
          fileTimeUs += us;
        }
      }

      // Sum sample count for this file
      let fileSampleCount = 0;
      const countFuncMap = countFileMap?.get(fileName);
      if (countFuncMap) {
        for (const count of countFuncMap.values()) {
          fileSampleCount += count;
        }
      }

      // Async totals for this file
      let fileAsyncTimeUs = 0;
      let fileAsyncOpCount = 0;
      const asyncFuncMap = asyncFileMap?.get(fileName);
      const asyncCountFuncMap = asyncCountFileMap?.get(fileName);
      if (asyncFuncMap) {
        for (const us of asyncFuncMap.values()) {
          fileAsyncTimeUs += us;
        }
      }
      if (asyncCountFuncMap) {
        for (const count of asyncCountFuncMap.values()) {
          fileAsyncOpCount += count;
        }
      }

      // 4. Collect all function names from both stores for this file
      const allFuncNames = new Set<string>();
      if (funcMap) {
        for (const name of funcMap.keys()) allFuncNames.add(name);
      }
      if (asyncFuncMap) {
        for (const name of asyncFuncMap.keys()) allFuncNames.add(name);
      }

      const functions: FunctionEntry[] = [];

      for (const funcName of allFuncNames) {
        const funcTimeUs = funcMap?.get(funcName) ?? 0;
        const funcSampleCount = countFuncMap?.get(funcName) ?? 0;
        const funcAsyncTimeUs = asyncFuncMap?.get(funcName) ?? 0;
        const funcAsyncOpCount = asyncCountFuncMap?.get(funcName) ?? 0;

        const entry: FunctionEntry = {
          name: funcName,
          timeUs: funcTimeUs,
          pct: totalTimeUs > 0 ? (funcTimeUs / totalTimeUs) * 100 : 0,
          sampleCount: funcSampleCount,
        };

        if (totalAsyncTimeUs > 0) {
          entry.asyncTimeUs = funcAsyncTimeUs;
          entry.asyncPct = (funcAsyncTimeUs / totalAsyncTimeUs) * 100;
          entry.asyncOpCount = funcAsyncOpCount;
        }

        functions.push(entry);
      }

      // Sort functions by timeUs descending
      functions.sort((a, b) => b.timeUs - a.timeUs);

      const fileEntry: FileEntry = {
        name: fileName,
        timeUs: fileTimeUs,
        pct: totalTimeUs > 0 ? (fileTimeUs / totalTimeUs) * 100 : 0,
        sampleCount: fileSampleCount,
        functions,
        otherCount: 0,
      };

      if (totalAsyncTimeUs > 0) {
        fileEntry.asyncTimeUs = fileAsyncTimeUs;
        fileEntry.asyncPct = (fileAsyncTimeUs / totalAsyncTimeUs) * 100;
        fileEntry.asyncOpCount = fileAsyncOpCount;
      }

      files.push(fileEntry);
    }

    // Sort files by timeUs descending
    files.sort((a, b) => b.timeUs - a.timeUs);

    const pkgEntry: PackageEntry = {
      name: packageName,
      timeUs: packageTimeUs,
      pct: totalTimeUs > 0 ? (packageTimeUs / totalTimeUs) * 100 : 0,
      isFirstParty: packageName === projectName,
      sampleCount: packageSampleCount,
      files,
      otherCount: 0,
    };

    if (totalAsyncTimeUs > 0) {
      pkgEntry.asyncTimeUs = packageAsyncTimeUs;
      pkgEntry.asyncPct = (packageAsyncTimeUs / totalAsyncTimeUs) * 100;
      pkgEntry.asyncOpCount = packageAsyncOpCount;
    }

    packages.push(pkgEntry);
  }

  // Sort packages by timeUs descending
  packages.sort((a, b) => b.timeUs - a.timeUs);

  const result: ReportData = {
    timestamp: new Date().toLocaleString(),
    totalTimeUs,
    packages,
    otherCount: 0,
    projectName,
  };

  if (headerAsyncTimeUs > 0) {
    result.totalAsyncTimeUs = headerAsyncTimeUs;
  }

  if (wallTimeUs !== undefined) {
    result.wallTimeUs = wallTimeUs;
  }

  return result;
}
