/**
 * Reporter orchestrator.
 *
 * Aggregates SampleStore data, renders HTML, writes file to cwd,
 * and returns the file path.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SampleStore } from './sample-store.js';
import { aggregate } from './reporter/aggregate.js';
import { renderHtml } from './reporter/html.js';

function generateFilename(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `where-you-at-${date}-${time}.html`;
}

function readProjectName(cwd: string): string {
  try {
    const raw = readFileSync(join(cwd, 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw) as { name?: string };
    return pkg.name ?? 'app';
  } catch {
    return 'app';
  }
}

export function generateReport(store: SampleStore, cwd?: string): string {
  const resolvedCwd = cwd ?? process.cwd();
  const projectName = readProjectName(resolvedCwd);
  const data = aggregate(store, projectName);
  const html = renderHtml(data);
  const filename = generateFilename();
  const filepath = join(resolvedCwd, filename);
  writeFileSync(filepath, html, 'utf-8');
  console.log(`Report written to ./${filename}`);
  return filepath;
}
