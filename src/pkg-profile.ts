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
  /** Package breakdown sorted by time descending */
  readonly packages: PackageEntry[];
  /** Number of packages below the reporting threshold */
  readonly otherCount: number;
  /** Project name (from package.json) */
  readonly projectName: string;

  /** @internal */
  constructor(data: ReportData) {
    this.timestamp = data.timestamp;
    this.totalTimeUs = data.totalTimeUs;
    this.packages = data.packages;
    this.otherCount = data.otherCount;
    this.projectName = data.projectName;
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
