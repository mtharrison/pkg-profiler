/**
 * Generate a fresh screenshot of the HTML profiler report for the README.
 *
 * Usage: npx tsx scripts/generate-screenshot.ts
 *
 * Produces: assets/report-screenshot.png (retina 2x)
 */

import { writeFileSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { renderHtml } from '../src/reporter/html.js';
import type { ReportData, PackageEntry, FileEntry, FunctionEntry } from '../src/types.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');

// ---------------------------------------------------------------------------
// Synthetic report data — crafted to showcase all report features
// ---------------------------------------------------------------------------

function fn(name: string, timeUs: number, pct: number, samples: number): FunctionEntry {
  return { name, timeUs, pct, sampleCount: samples };
}

function file(name: string, timeUs: number, pct: number, samples: number, functions: FunctionEntry[]): FileEntry {
  return { name, timeUs, pct, sampleCount: samples, functions, otherCount: 0 };
}

function pkg(
  name: string,
  timeUs: number,
  pct: number,
  samples: number,
  files: FileEntry[],
  opts: { isFirstParty?: boolean; depChain?: string[] } = {},
): PackageEntry {
  return {
    name,
    timeUs,
    pct,
    isFirstParty: opts.isFirstParty ?? false,
    sampleCount: samples,
    files,
    otherCount: 0,
    depChain: opts.depChain,
  };
}

// Total CPU: ~10.3 seconds
const totalTimeUs = 10_320_000;

const packages: PackageEntry[] = [
  // 1. typescript — dominant at ~38%
  pkg('typescript', 3_920_000, 38.0, 3920, [
    file('checker.ts', 2_540_000, 24.6, 2540, [
      fn('checkExpression', 1_480_000, 14.3, 1480),
      fn('checkTypeRelatedTo', 720_000, 7.0, 720),
      fn('resolveSymbol', 340_000, 3.3, 340),
    ]),
    file('parser.ts', 1_380_000, 13.4, 1380, [
      fn('parseSourceFile', 860_000, 8.3, 860),
      fn('parseStatement', 520_000, 5.0, 520),
    ]),
  ], { isFirstParty: false }),

  // 2. my-app — first party at ~22%
  pkg('my-app', 2_270_000, 22.0, 2270, [
    file('src/server.ts', 1_350_000, 13.1, 1350, [
      fn('handleRequest', 820_000, 7.9, 820),
      fn('validateInput', 530_000, 5.1, 530),
    ]),
    file('src/db/queries.ts', 920_000, 8.9, 920, [
      fn('findUserById', 580_000, 5.6, 580),
      fn('updateSession', 340_000, 3.3, 340),
    ]),
  ], { isFirstParty: true }),

  // 3. webpack — ~15%
  pkg('webpack', 1_550_000, 15.0, 1550, [
    file('lib/Compilation.js', 980_000, 9.5, 980, [
      fn('seal', 620_000, 6.0, 620),
      fn('addModule', 360_000, 3.5, 360),
    ]),
    file('lib/NormalModuleFactory.js', 570_000, 5.5, 570, [
      fn('create', 570_000, 5.5, 570),
    ]),
  ]),

  // 4. react-dom — ~11%
  pkg('react-dom', 1_130_000, 11.0, 1130, [
    file('cjs/react-dom.development.js', 740_000, 7.2, 740, [
      fn('reconcileChildren', 480_000, 4.7, 480),
      fn('commitWork', 260_000, 2.5, 260),
    ]),
    file('cjs/react-dom-server.node.development.js', 390_000, 3.8, 390, [
      fn('renderToString', 390_000, 3.8, 390),
    ]),
  ]),

  // 5. raw-body — ~8%, transitive dep with chain
  pkg('raw-body', 830_000, 8.0, 830, [
    file('index.js', 830_000, 8.0, 830, [
      fn('readStream', 530_000, 5.1, 530),
      fn('getDecoder', 300_000, 2.9, 300),
    ]),
  ], { depChain: ['express', 'body-parser', 'raw-body'] }),

  // 6. lodash — ~6%
  pkg('lodash', 620_000, 6.0, 620, [
    file('lodash.js', 620_000, 6.0, 620, [
      fn('cloneDeep', 380_000, 3.7, 380),
      fn('mergeWith', 240_000, 2.3, 240),
    ]),
  ]),
];

const data: ReportData = {
  timestamp: 'Mar 1, 2026, 10:42:15 AM',
  totalTimeUs,
  wallTimeUs: 12_480_000, // slightly higher than CPU
  packages,
  otherCount: 2, // implies 2 more packages below threshold
  projectName: 'my-app',
};

// ---------------------------------------------------------------------------
// Render HTML and take screenshot
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const html = renderHtml(data);

  // Write HTML to temp file
  const tmpPath = join(PROJECT_ROOT, '.tmp-report.html');
  writeFileSync(tmpPath, html, 'utf-8');

  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1040, height: 800 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    await page.goto(`file://${tmpPath}`, { waitUntil: 'domcontentloaded' });

    // Wait for the JS to render the initial table/tree
    await page.waitForTimeout(500);

    // Expand the first package (typescript) and its first file
    await page.evaluate(() => {
      const allDetails = document.querySelectorAll('details');
      // Open first package
      if (allDetails[0]) allDetails[0].setAttribute('open', '');
      // Open first file inside the first package
      if (allDetails[1]) allDetails[1].setAttribute('open', '');
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
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

main().catch((err) => {
  console.error('Failed to generate screenshot:', err);
  process.exit(1);
});
