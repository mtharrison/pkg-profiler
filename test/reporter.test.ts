import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, unlinkSync, mkdtempSync, writeFileSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { renderHtml } from '../src/reporter/html.js';
import { PkgProfile } from '../src/pkg-profile.js';
import type { ReportData } from '../src/types.js';

const mockData: ReportData = {
  timestamp: '2026-01-15, 10:30:00 AM',
  totalTimeUs: 1_240_000,
  projectName: 'my-app',
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
          otherCount: 0,
        },
      ],
      otherCount: 0,
    },
  ],
  otherCount: 0,
};

describe('renderHtml()', () => {
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
    expect(html).toContain('<th>CPU Time</th>');
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

  it('includes inline CSS (self-contained)', () => {
    const html = renderHtml(mockData);
    expect(html).toContain('<style>');
    expect(html).toContain('--first-party-accent');
  });

  it('includes CPU time in meta', () => {
    const html = renderHtml(mockData);
    // 1_240_000us = 1240ms = 1.24s
    expect(html).toContain('CPU time: 1.24s');
  });

  it('includes wall time in meta when wallTimeUs is set', () => {
    const dataWithWall: ReportData = { ...mockData, wallTimeUs: 2_500_000 };
    const html = renderHtml(dataWithWall);
    expect(html).toContain('Wall time: 2.50s');
    expect(html).toContain('CPU time: 1.24s');
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

  it('contains __REPORT_DATA__ JSON blob', () => {
    const html = renderHtml(mockData);
    expect(html).toContain('__REPORT_DATA__');
  });

  it('renders "via" annotation for transitive dependencies', () => {
    const dataWithChain: ReportData = {
      ...mockData,
      packages: [
        mockData.packages[0],
        {
          ...mockData.packages[1],
          name: 'qs',
          depChain: ['express'],
        },
      ],
    };
    const html = renderHtml(dataWithChain);
    expect(html).toContain('class="dep-chain"');
    expect(html).toContain('via express');
  });

  it('renders multi-hop "via" chain with separator', () => {
    const dataWithChain: ReportData = {
      ...mockData,
      packages: [
        mockData.packages[0],
        {
          ...mockData.packages[1],
          name: 'qs',
          depChain: ['express', 'body-parser'],
        },
      ],
    };
    const html = renderHtml(dataWithChain);
    expect(html).toContain('via express &gt; body-parser');
  });

  it('does not render "via" annotation for direct dependencies', () => {
    const html = renderHtml(mockData);
    // The CSS class definition exists in <style>, but no actual "via X" content should appear
    expect(html).not.toContain('via express');
  });

  it('contains threshold-slider input', () => {
    const html = renderHtml(mockData);
    expect(html).toContain('id="threshold-slider"');
    expect(html).toContain('id="threshold-value"');
    expect(html).toContain('type="range"');
  });

  it('contains summary-container and tree-container wrapper divs', () => {
    const html = renderHtml(mockData);
    expect(html).toContain('id="summary-container"');
    expect(html).toContain('id="tree-container"');
  });

  it('embeds parseable JSON that matches input data structure', () => {
    const html = renderHtml(mockData);
    // Extract the JSON from the script tag
    const match = html.match(/var __REPORT_DATA__ = (.+?);<\/script>/s);
    expect(match).not.toBeNull();
    const json = match![1].replace(/\\u003c/g, '<');
    const parsed = JSON.parse(json) as ReportData;
    expect(parsed.totalTimeUs).toBe(mockData.totalTimeUs);
    expect(parsed.projectName).toBe(mockData.projectName);
    expect(parsed.packages.length).toBe(mockData.packages.length);
    expect(parsed.packages[0].name).toBe('my-app');
    expect(parsed.packages[1].name).toBe('express');
  });

  it('sanitizes < in JSON to prevent script injection', () => {
    const dataWithScript: ReportData = {
      ...mockData,
      packages: [
        {
          ...mockData.packages[0],
          name: '</script><script>alert(1)</script>',
        },
      ],
    };
    const html = renderHtml(dataWithScript);
    // The JSON blob should not contain literal </script>
    const scriptSection = html.slice(html.indexOf('__REPORT_DATA__'));
    expect(scriptSection).not.toContain('</script><script>');
    expect(scriptSection).toContain('\\u003c');
  });
});

describe('source code toggle', () => {
  it('renders <details> with has-source class when sourceHtml is set', () => {
    const dataWithSource: ReportData = {
      ...mockData,
      packages: [
        {
          ...mockData.packages[0],
          files: [
            {
              ...mockData.packages[0].files[0],
              functions: [
                {
                  ...mockData.packages[0].files[0].functions[0],
                  sourceHtml: '<pre class="source-snippet"><code>highlighted code</code></pre>',
                },
                mockData.packages[0].files[0].functions[1],
              ],
            },
          ],
        },
        mockData.packages[1],
      ],
    };
    const html = renderHtml(dataWithSource);
    expect(html).toContain('<details class="level-2 has-source">');
    expect(html).toContain('<pre class="source-snippet">');
  });

  it('renders <div class="level-2"> when sourceHtml is not set', () => {
    const html = renderHtml(mockData);
    expect(html).toContain('<div class="level-2">');
    // The server-rendered tree (between tree-container and the first <script>) should not contain has-source
    const treeStart = html.indexOf('id="tree-container"');
    const treeEnd = html.indexOf('<script>', treeStart);
    const treeSection = html.slice(treeStart, treeEnd);
    expect(treeSection).not.toContain('has-source');
  });

  it('includes source snippet CSS styles', () => {
    const html = renderHtml(mockData);
    expect(html).toContain('.source-snippet');
    expect(html).toContain('.src-line');
    expect(html).toContain('.src-hot');
    expect(html).toContain('.src-lineno');
    expect(html).toContain('.tok-kw');
    expect(html).toContain('.tok-str');
    expect(html).toContain('.tok-cmt');
    expect(html).toContain('.tok-num');
  });

  it('embeds sourceHtml in JSON data blob for client-side rendering', () => {
    const dataWithSource: ReportData = {
      ...mockData,
      packages: [
        {
          ...mockData.packages[0],
          files: [
            {
              ...mockData.packages[0].files[0],
              functions: [
                {
                  ...mockData.packages[0].files[0].functions[0],
                  sourceHtml: '<pre class="source-snippet"><code>test</code></pre>',
                },
              ],
            },
          ],
        },
      ],
    };
    const html = renderHtml(dataWithSource);
    const match = html.match(/var __REPORT_DATA__ = (.+?);<\/script>/s);
    expect(match).not.toBeNull();
    const json = match![1].replace(/\\u003c/g, '<');
    const parsed = JSON.parse(json) as ReportData;
    expect(parsed.packages[0].files[0].functions[0].sourceHtml).toContain('source-snippet');
  });
});

describe('sort control', () => {
  it('renders sort control when totalAsyncTimeUs is set', () => {
    const asyncData: ReportData = {
      ...mockData,
      totalAsyncTimeUs: 500_000,
      packages: mockData.packages.map(pkg => ({
        ...pkg,
        asyncTimeUs: 250_000,
        asyncPct: 50,
        asyncOpCount: 3,
        files: pkg.files.map(f => ({
          ...f,
          asyncTimeUs: 250_000,
          asyncPct: 50,
          asyncOpCount: 3,
          functions: f.functions.map(fn => ({
            ...fn,
            asyncTimeUs: 125_000,
            asyncPct: 25,
            asyncOpCount: 1,
          })),
        })),
      })),
    };
    const html = renderHtml(asyncData);
    expect(html).toContain('class="sort-control"');
    expect(html).toContain('class="sort-toggle"');
    expect(html).toContain('data-sort="cpu"');
    expect(html).toContain('data-sort="async"');
    expect(html).toContain('CPU Time');
    expect(html).toContain('Async I/O Wait');
  });

  it('does NOT render sort control when no async data', () => {
    const html = renderHtml(mockData);
    expect(html).not.toContain('class="sort-control"');
    expect(html).not.toContain('class="sort-toggle"');
    expect(html).not.toContain('data-sort="cpu"');
    expect(html).not.toContain('data-sort="async"');
  });
});

describe('PkgProfile.writeHtml()', () => {
  let tmpDir: string;
  const generatedFiles: string[] = [];

  afterEach(() => {
    for (const f of generatedFiles) {
      try { unlinkSync(f); } catch { /* ignore */ }
    }
    generatedFiles.length = 0;

    if (tmpDir) {
      try { rmdirSync(tmpDir, { recursive: true } as any); } catch { /* ignore */ }
    }

    vi.restoreAllMocks();
  });

  it('writes an HTML file to cwd and returns its absolute path', () => {
    const profile = new PkgProfile(mockData);

    const filepath = profile.writeHtml();
    generatedFiles.push(filepath);

    expect(typeof filepath).toBe('string');
    expect(filepath).toContain('where-you-at-');
    expect(filepath).toContain('.html');
    expect(existsSync(filepath)).toBe(true);
  });

  it('writes to a specified path', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'wya-test-'));
    const outPath = join(tmpDir, 'custom-report.html');

    const profile = new PkgProfile(mockData);
    const filepath = profile.writeHtml(outPath);
    generatedFiles.push(filepath);

    expect(existsSync(filepath)).toBe(true);
    expect(filepath).toContain('custom-report.html');
  });

  it('generates valid HTML content in the file', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'wya-test-'));
    const outPath = join(tmpDir, 'output.html');

    const profile = new PkgProfile(mockData);
    const filepath = profile.writeHtml(outPath);
    generatedFiles.push(filepath);

    const content = readFileSync(filepath, 'utf-8');
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('<table');
    expect(content).toContain('<details');
    expect(content).toContain('my-app');
  });

  it('marks first-party package based on projectName', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'wya-test-'));
    const outPath = join(tmpDir, 'output.html');

    const profile = new PkgProfile(mockData);
    const filepath = profile.writeHtml(outPath);
    generatedFiles.push(filepath);

    const content = readFileSync(filepath, 'utf-8');
    expect(content).toContain('class="first-party"');
    expect(content).toContain('class="dependency"');
  });
});
