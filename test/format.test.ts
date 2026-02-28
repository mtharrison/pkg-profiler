import { describe, it, expect } from 'vitest';
import { formatTime, formatPct, escapeHtml } from '../src/reporter/format.js';

describe('formatTime', () => {
  it('formats >= 1s as seconds with two decimal places', () => {
    expect(formatTime(1_240_000)).toBe('1.24s');
  });

  it('formats exactly 1s as "1.00s"', () => {
    expect(formatTime(1_000_000)).toBe('1.00s');
  });

  it('formats large values in seconds', () => {
    expect(formatTime(12_345_000)).toBe('12.35s');
  });

  it('formats < 1s as rounded milliseconds', () => {
    expect(formatTime(432_000)).toBe('432ms');
  });

  it('formats small millisecond values', () => {
    expect(formatTime(50_000)).toBe('50ms');
  });

  it('rounds sub-millisecond to 1ms (not 0ms)', () => {
    expect(formatTime(500)).toBe('1ms');
  });

  it('formats zero as "0ms"', () => {
    expect(formatTime(0)).toBe('0ms');
  });
});

describe('formatPct', () => {
  it('formats percentage with one decimal place', () => {
    expect(formatPct(623_000, 1_000_000)).toBe('62.3%');
  });

  it('formats zero numerator as "0.0%"', () => {
    expect(formatPct(0, 1_000_000)).toBe('0.0%');
  });

  it('handles zero denominator without throwing', () => {
    expect(formatPct(500, 0)).toBe('0.0%');
  });

  it('formats 100% correctly', () => {
    expect(formatPct(1_000_000, 1_000_000)).toBe('100.0%');
  });
});

describe('escapeHtml', () => {
  it('escapes angle brackets', () => {
    expect(escapeHtml('<anonymous>')).toBe('&lt;anonymous&gt;');
  });

  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('leaves safe text unchanged', () => {
    expect(escapeHtml('safe text')).toBe('safe text');
  });

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('escapes multiple special characters in one string', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;'
    );
  });
});
