/**
 * Immutable profiling result returned by `stop()` and `profile()`.
 *
 * Contains aggregated per-package timing data and a convenience method
 * to write a self-contained HTML report to disk.
 */

import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { PackageEntry, ReportData } from './types.js';
import { renderHtml } from './reporter/html.js';

function generateFilename(timestamp: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `where-you-at-${date}-${time}.html`;
}

export class PkgProfile {
  /** When the profile was captured */
  readonly timestamp: string;
  /** Total sampled wall time in microseconds */
  readonly totalTimeUs: number;
  /** Package breakdown sorted by time descending (all packages, no threshold applied) */
  readonly packages: PackageEntry[];
  /** Always 0 — threshold filtering is now applied client-side in the HTML report */
  readonly otherCount: number;
  /** Project name (from package.json) */
  readonly projectName: string;
  /** Total async wait time in microseconds (undefined when async tracking not enabled) */
  readonly totalAsyncTimeUs?: number;
  /** Elapsed wall time in microseconds from start() to stop() */
  readonly wallTimeUs?: number;

  /** @internal */
  constructor(data: ReportData) {
    this.timestamp = data.timestamp;
    this.totalTimeUs = data.totalTimeUs;
    this.packages = data.packages;
    this.otherCount = data.otherCount;
    this.projectName = data.projectName;
    this.totalAsyncTimeUs = data.totalAsyncTimeUs;
    this.wallTimeUs = data.wallTimeUs;
  }

  /**
   * Write a self-contained HTML report to disk.
   *
   * @param path - Output file path. Defaults to `./where-you-at-{timestamp}.html` in cwd.
   * @returns Absolute path to the written file.
   */
  writeHtml(path?: string): string {
    const data: ReportData = {
      timestamp: this.timestamp,
      totalTimeUs: this.totalTimeUs,
      packages: this.packages,
      otherCount: this.otherCount,
      projectName: this.projectName,
      totalAsyncTimeUs: this.totalAsyncTimeUs,
      wallTimeUs: this.wallTimeUs,
    };
    const html = renderHtml(data);

    let filepath: string;
    if (path) {
      filepath = resolve(path);
    } else {
      const filename = generateFilename(this.timestamp);
      filepath = join(process.cwd(), filename);
    }

    writeFileSync(filepath, html, 'utf-8');
    return filepath;
  }
}
