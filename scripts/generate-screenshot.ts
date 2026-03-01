/**
 * Generate a fresh screenshot of the HTML profiler report for the README.
 *
 * Runs a real profiling session with async tracking against actual npm packages,
 * then screenshots the resulting HTML report with all tree nodes expanded.
 *
 * Usage: npx tsx scripts/generate-screenshot.ts
 *
 * Produces: assets/report-screenshot.png (retina 2x)
 */

import { writeFileSync, unlinkSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { start, stop } from '../src/sampler.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');

// ---------------------------------------------------------------------------
// Real workload — exercises CPU and async I/O across real npm packages
// ---------------------------------------------------------------------------

async function runWorkload(): Promise<void> {
  // 1. TypeScript: compile source files (CPU-heavy)
  const ts = await import('typescript');
  const srcDir = join(PROJECT_ROOT, 'src');
  const srcFiles = readdirSync(srcDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(srcDir, f));

  const program = ts.createProgram(srcFiles, {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    noEmit: true,
  });
  program.getSemanticDiagnostics();

  // 2. Marked: parse markdown (CPU)
  const { marked } = await import('marked');
  const readme = readFileSync(join(PROJECT_ROOT, 'README.md'), 'utf-8');
  for (let i = 0; i < 800; i++) {
    marked.parse(readme);
  }

  // 3. Handlebars: compile and render templates (CPU)
  const Handlebars = await import('handlebars');
  for (let i = 0; i < 8000; i++) {
    const template = Handlebars.compile(
      '{{#each items}}<div class="{{className}}">{{title}}: {{description}}</div>{{/each}}',
    );
    template({
      items: Array.from({ length: 20 }, (_, j) => ({
        className: `item-${j}`,
        title: `Item ${j}`,
        description: `Description for item ${j} in iteration ${i}`,
      })),
    });
  }

  // 4. Semver: version parsing and comparisons (CPU)
  const semver = await import('semver');
  const versions = [
    '1.0.0', '2.3.4-beta.1', '0.0.1-alpha', '10.20.30',
    '1.2.3-pre+build', '3.0.0-rc.1', '5.6.7', '0.1.0',
  ];
  for (let i = 0; i < 100_000; i++) {
    for (const v of versions) {
      semver.parse(v);
      semver.satisfies(v, '>=1.0.0');
      semver.gt(v, '0.0.1');
    }
  }

  // 5. Async I/O: parallel file reads with interleaved CPU
  const { readFile } = await import('node:fs/promises');
  const allFiles = readdirSync(srcDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(srcDir, f));

  for (let i = 0; i < 200; i++) {
    await Promise.all(allFiles.map((f) => readFile(f, 'utf-8')));
  }

  // 6. Async I/O: timers to add measurable async wait time
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

// ---------------------------------------------------------------------------
// Run profile, render HTML, and take screenshot
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('Running profiled workload...');
  await start({ trackAsync: true });
  await runWorkload();
  const result = await stop();

  console.log(`CPU time: ${(result.totalTimeUs / 1e6).toFixed(2)}s`);
  console.log(`Wall time: ${((result.wallTimeUs ?? 0) / 1e6).toFixed(2)}s`);
  console.log(`Async I/O: ${((result.totalAsyncTimeUs ?? 0) / 1e6).toFixed(2)}s`);
  console.log(`Packages: ${result.packages.length}`);

  const htmlPath = result.writeHtml(join(PROJECT_ROOT, '.tmp-report.html'));

  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1040, height: 800 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    await page.goto(`file://${htmlPath}`, { waitUntil: 'domcontentloaded' });

    // Wait for the JS to render the initial table/tree
    await page.waitForTimeout(500);

    // Lower threshold to show more detail in the tree
    await page.evaluate(() => {
      const slider = document.getElementById('threshold-slider') as HTMLInputElement | null;
      if (slider) {
        slider.value = '2';
        slider.dispatchEvent(new Event('input'));
      }
      const label = document.getElementById('threshold-value');
      if (label) label.textContent = '2.0%';
    });

    await page.waitForTimeout(300);

    // Expand all tree nodes
    await page.evaluate(() => {
      const allDetails = document.querySelectorAll('details');
      for (const el of allDetails) el.setAttribute('open', '');
    });

    // Small delay for CSS transitions
    await page.waitForTimeout(200);

    const outPath = join(PROJECT_ROOT, 'assets', 'report-screenshot.png');
    await page.screenshot({
      path: outPath,
      fullPage: true,
    });

    await browser.close();

    // Verify output
    const { statSync } = await import('node:fs');
    const stats = statSync(outPath);
    const sizeKB = Math.round(stats.size / 1024);
    console.log(`Screenshot saved: ${outPath}`);
    console.log(`File size: ${sizeKB} KB`);
  } finally {
    // Clean up temp file
    try {
      unlinkSync(htmlPath);
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error('Failed to generate screenshot:', err);
  process.exit(1);
});
