import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, unlinkSync, mkdtempSync, writeFileSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { renderHtml } from '../src/reporter/html.js';
import { generateReport } from '../src/reporter.js';
import { SampleStore } from '../src/sample-store.js';
import type { ReportData } from '../src/types.js';

describe('renderHtml()', () => {
  const mockData: ReportData = {
    timestamp: '2026-01-15, 10:30:00 AM',
    totalTimeUs: 1_240_000,
    packages: [
      {
        name: 'my-app',
        timeUs: 800_000,
        pct: 64.5,
        isFirstParty: true,
        sampleCount: 12,
        files: [
          {
            name: 'src/index.ts',
            timeUs: 800_000,
            pct: 64.5,
            sampleCount: 12,
            functions: [
              { name: 'main:1', timeUs: 500_000, pct: 40.3, sampleCount: 8 },
              { name: 'helper:10', timeUs: 300_000, pct: 24.2, sampleCount: 4 },
            ],
            otherCount: 0,
          },
        ],
        otherCount: 0,
      },
      {
        name: 'express',
        timeUs: 440_000,
        pct: 35.5,
        isFirstParty: false,
        sampleCount: 6,
        files: [
          {
            name: 'lib/router.js',
            timeUs: 440_000,
            pct: 35.5,
            sampleCount: 6,
            functions: [
              { name: 'handle:201', timeUs: 440_000, pct: 35.5, sampleCount: 6 },
            ],
            otherCount: 1,
          },
        ],
        otherCount: 0,
      },
    ],
    otherCount: 2,
  };

  it('produces a complete HTML document', () => {
    const html = renderHtml(mockData);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('contains a summary table', () => {
    const html = renderHtml(mockData);
    expect(html).toContain('<table');
    expect(html).toContain('<th>Package</th>');
    expect(html).toContain('<th>Wall Time</th>');
  });

  it('contains an expandable tree with details/summary', () => {
    const html = renderHtml(mockData);
    expect(html).toContain('<details');
    expect(html).toContain('<summary');
  });

  it('includes package names (HTML-escaped)', () => {
    const html = renderHtml(mockData);
    expect(html).toContain('my-app');
    expect(html).toContain('express');
  });

  it('includes formatted times', () => {
    const html = renderHtml(mockData);
    // 800_000us = 800ms, 440_000us = 440ms
    expect(html).toContain('800ms');
    expect(html).toContain('440ms');
  });

  it('applies first-party class to first-party packages', () => {
    const html = renderHtml(mockData);
    expect(html).toContain('class="first-party"');
    expect(html).toContain('class="dependency"');
  });

  it('applies fp-pkg class in tree for first-party', () => {
    const html = renderHtml(mockData);
    expect(html).toContain('fp-pkg');
  });

  it('includes "Other" row when otherCount > 0', () => {
    const html = renderHtml(mockData);
    expect(html).toContain('Other (2 items)');
    expect(html).toContain('other-row');
  });

  it('includes inline CSS (self-contained)', () => {
    const html = renderHtml(mockData);
    expect(html).toContain('<style>');
    expect(html).toContain('--first-party-accent');
  });

  it('includes total wall time in meta', () => {
    const html = renderHtml(mockData);
    // 1_240_000us = 1240ms = 1.24s
    expect(html).toContain('1.24s');
  });

  it('renders tree "Other" rows for files and functions', () => {
    const html = renderHtml(mockData);
    // express/lib/router.js has otherCount: 1
    expect(html).toContain('Other (1 items)');
  });

  it('escapes HTML special characters in package names', () => {
    const dataWithSpecialChars: ReportData = {
      ...mockData,
      packages: [
        {
          ...mockData.packages[0],
          name: '<script>alert("xss")</script>',
        },
      ],
    };
    const html = renderHtml(dataWithSpecialChars);
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('generateReport()', () => {
  let tmpDir: string;
  const generatedFiles: string[] = [];

  afterEach(() => {
    // Clean up generated HTML files
    for (const f of generatedFiles) {
      try { unlinkSync(f); } catch { /* ignore */ }
    }
    generatedFiles.length = 0;

    // Clean up temp directory
    if (tmpDir) {
      try { rmdirSync(tmpDir, { recursive: true } as any); } catch { /* ignore */ }
    }

    vi.restoreAllMocks();
  });

  it('writes an HTML file to the specified cwd and returns its path', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'wya-test-'));
    // Write a package.json so the project name is detected
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-project' }));

    const store = new SampleStore();
    store.record('test-project', 'src/index.ts', 'main:1', 500_000);
    store.record('express', 'lib/router.js', 'handle:1', 300_000);

    const spy = vi.spyOn(console, 'log');

    const filepath = generateReport(store, tmpDir);
    generatedFiles.push(filepath);

    expect(typeof filepath).toBe('string');
    expect(filepath).toContain('where-you-at-');
    expect(filepath).toContain('.html');
    expect(existsSync(filepath)).toBe(true);

    // Verify console output
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Report written to'));
  });

  it('generates valid HTML content in the file', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'wya-test-'));
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'my-app' }));

    const store = new SampleStore();
    store.record('my-app', 'src/index.ts', 'main:1', 500_000);

    const filepath = generateReport(store, tmpDir);
    generatedFiles.push(filepath);

    const content = readFileSync(filepath, 'utf-8');
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('<table');
    expect(content).toContain('<details');
    expect(content).toContain('my-app');
  });

  it('falls back to "app" when package.json is missing', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'wya-test-'));
    // No package.json in tmpDir

    const store = new SampleStore();
    store.record('some-pkg', 'index.ts', 'fn:1', 100_000);

    const filepath = generateReport(store, tmpDir);
    generatedFiles.push(filepath);

    expect(existsSync(filepath)).toBe(true);
  });

  it('marks first-party package based on package.json name', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'wya-test-'));
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'my-app' }));

    const store = new SampleStore();
    store.record('my-app', 'src/index.ts', 'main:1', 500_000);
    store.record('express', 'lib/router.js', 'handle:1', 300_000);

    const filepath = generateReport(store, tmpDir);
    generatedFiles.push(filepath);

    const content = readFileSync(filepath, 'utf-8');
    expect(content).toContain('class="first-party"');
    expect(content).toContain('class="dependency"');
  });
});
