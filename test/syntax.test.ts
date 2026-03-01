import { describe, it, expect } from 'vitest';
import { highlightSyntax } from '../src/reporter/syntax.js';

describe('highlightSyntax()', () => {
  it('returns empty string for empty input', () => {
    expect(highlightSyntax('')).toBe('');
  });

  it('wraps keywords in tok-kw spans', () => {
    const result = highlightSyntax('const x = 1');
    expect(result).toContain('<span class="tok-kw">const</span>');
  });

  it('wraps multiple keywords', () => {
    const result = highlightSyntax('if (true) return false');
    expect(result).toContain('<span class="tok-kw">if</span>');
    expect(result).toContain('<span class="tok-kw">true</span>');
    expect(result).toContain('<span class="tok-kw">return</span>');
    expect(result).toContain('<span class="tok-kw">false</span>');
  });

  it('wraps single-quoted strings in tok-str spans', () => {
    const result = highlightSyntax("const s = 'hello'");
    expect(result).toContain('<span class="tok-str">&#39;hello&#39;</span>');
  });

  it('wraps double-quoted strings in tok-str spans', () => {
    const result = highlightSyntax('const s = "world"');
    expect(result).toContain('<span class="tok-str">&quot;world&quot;</span>');
  });

  it('wraps template strings in tok-str spans', () => {
    const result = highlightSyntax('const s = `tmpl`');
    expect(result).toContain('<span class="tok-str">`tmpl`</span>');
  });

  it('handles strings with escaped quotes', () => {
    const result = highlightSyntax("const s = 'it\\'s'");
    expect(result).toContain('<span class="tok-str">');
  });

  it('wraps line comments in tok-cmt spans', () => {
    const result = highlightSyntax('x = 1 // comment');
    expect(result).toContain('<span class="tok-cmt">// comment</span>');
  });

  it('wraps block comments in tok-cmt spans', () => {
    const result = highlightSyntax('x = /* hi */ 1');
    expect(result).toContain('<span class="tok-cmt">/* hi */</span>');
  });

  it('handles unclosed block comments', () => {
    const result = highlightSyntax('x = /* unclosed');
    expect(result).toContain('<span class="tok-cmt">/* unclosed</span>');
  });

  it('wraps numeric literals in tok-num spans', () => {
    const result = highlightSyntax('const n = 42');
    expect(result).toContain('<span class="tok-num">42</span>');
  });

  it('wraps hex literals', () => {
    const result = highlightSyntax('const n = 0xFF');
    expect(result).toContain('<span class="tok-num">0xFF</span>');
  });

  it('wraps float literals', () => {
    const result = highlightSyntax('const n = 3.14');
    expect(result).toContain('<span class="tok-num">3.14</span>');
  });

  it('does not wrap regular identifiers', () => {
    const result = highlightSyntax('myVar');
    expect(result).toBe('myVar');
    expect(result).not.toContain('<span');
  });

  it('HTML-escapes output', () => {
    const result = highlightSyntax('x < y && a > b');
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
    expect(result).toContain('&amp;&amp;');
    expect(result).not.toContain('<y');
  });

  it('handles a realistic line of code', () => {
    const result = highlightSyntax('  for (let i = 0; i < arr.length; i++) {');
    expect(result).toContain('<span class="tok-kw">for</span>');
    expect(result).toContain('<span class="tok-kw">let</span>');
    expect(result).toContain('<span class="tok-num">0</span>');
  });
});
