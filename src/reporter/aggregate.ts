/**
 * Transform raw SampleStore data into a sorted, thresholded ReportData structure.
 *
 * Pure function: reads nested Maps from SampleStore, applies a 5% threshold
 * at every level (package, file, function) relative to the total profiled time,
 * aggregates below-threshold entries into an "other" count, and sorts by
 * timeUs descending at each level.
 */

import type { SampleStore } from '../sample-store.js';
import type {
  ReportData,
  PackageEntry,
  FileEntry,
  FunctionEntry,
} from '../types.js';

const THRESHOLD_PCT = 0.05;

/**
 * Aggregate SampleStore data into a ReportData structure.
 *
 * @param store - SampleStore with accumulated microseconds and sample counts
 * @param projectName - Name of the first-party project (for isFirstParty flag)
 * @returns ReportData with packages sorted desc by time, thresholded at 5%
 */
export function aggregate(store: SampleStore, projectName: string): ReportData {
  // 1. Calculate total user-attributed time
  let totalTimeUs = 0;
  for (const fileMap of store.packages.values()) {
    for (const funcMap of fileMap.values()) {
      for (const us of funcMap.values()) {
        totalTimeUs += us;
      }
    }
  }

  if (totalTimeUs === 0) {
    return {
      timestamp: new Date().toLocaleString(),
      totalTimeUs: 0,
      packages: [],
      otherCount: 0,
    };
  }

  const threshold = totalTimeUs * THRESHOLD_PCT;
  const packages: PackageEntry[] = [];
  let topLevelOtherCount = 0;

  // 2. Process each package
  for (const [packageName, fileMap] of store.packages) {
    // Sum total time for this package
    let packageTimeUs = 0;
    for (const funcMap of fileMap.values()) {
      for (const us of funcMap.values()) {
        packageTimeUs += us;
      }
    }

    // Apply threshold at package level
    if (packageTimeUs < threshold) {
      topLevelOtherCount++;
      continue;
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

    // 3. Process files within the package
    const files: FileEntry[] = [];
    let fileOtherCount = 0;

    for (const [fileName, funcMap] of fileMap) {
      // Sum time for this file
      let fileTimeUs = 0;
      for (const us of funcMap.values()) {
        fileTimeUs += us;
      }

      // Apply threshold at file level (relative to total)
      if (fileTimeUs < threshold) {
        fileOtherCount++;
        continue;
      }

      // Sum sample count for this file
      let fileSampleCount = 0;
      const countFuncMap = countFileMap?.get(fileName);
      if (countFuncMap) {
        for (const count of countFuncMap.values()) {
          fileSampleCount += count;
        }
      }

      // 4. Process functions within the file
      const functions: FunctionEntry[] = [];
      let funcOtherCount = 0;

      for (const [funcName, funcTimeUs] of funcMap) {
        // Apply threshold at function level (relative to total)
        if (funcTimeUs < threshold) {
          funcOtherCount++;
          continue;
        }

        const funcSampleCount = countFuncMap?.get(funcName) ?? 0;

        functions.push({
          name: funcName,
          timeUs: funcTimeUs,
          pct: (funcTimeUs / totalTimeUs) * 100,
          sampleCount: funcSampleCount,
        });
      }

      // Sort functions by timeUs descending
      functions.sort((a, b) => b.timeUs - a.timeUs);

      files.push({
        name: fileName,
        timeUs: fileTimeUs,
        pct: (fileTimeUs / totalTimeUs) * 100,
        sampleCount: fileSampleCount,
        functions,
        otherCount: funcOtherCount,
      });
    }

    // Sort files by timeUs descending
    files.sort((a, b) => b.timeUs - a.timeUs);

    packages.push({
      name: packageName,
      timeUs: packageTimeUs,
      pct: (packageTimeUs / totalTimeUs) * 100,
      isFirstParty: packageName === projectName,
      sampleCount: packageSampleCount,
      files,
      otherCount: fileOtherCount,
    });
  }

  // Sort packages by timeUs descending
  packages.sort((a, b) => b.timeUs - a.timeUs);

  return {
    timestamp: new Date().toLocaleString(),
    totalTimeUs,
    packages,
    otherCount: topLevelOtherCount,
  };
}
