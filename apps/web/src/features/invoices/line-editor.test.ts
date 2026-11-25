import { describe, expect, it } from 'vitest';
import { emptyLine, liveTotals, lineReducer, parseQuantity, toLineInputs, type EditorLine } from './line-editor';

const line = (key: string, patch: Partial<EditorLine> = {}): EditorLine => ({ ...emptyLine(key), ...patch });

describe('lineReducer (invoice line editor)', () => {
  it('adds, updates, duplicates and removes without mutating', () => {
    const s0 = [line('a')];
    const s1 = lineReducer(s0, { type: 'add', key: 'b' });
    expect(s1.map((l) => l.key)).toEqual(['a', 'b']);
    expect(s0).toHaveLength(1);
    const s2 = lineReducer(s1, { type: 'update', key: 'a', patch: { description: 'Design', unitPrice: '100' } });
    expect(s2[0]).toMatchObject({ description: 'Design', unitPrice: '100' });
    expect(s1[0]!.description).toBe('');
    const s3 = lineReducer(s2, { type: 'duplicate', key: 'a', newKey: 'c' });
    expect(s3.map((l) => l.key)).toEqual(['a', 'c', 'b']);
    expect(s3[1]).toMatchObject({ description: 'Design', key: 'c' });
    const s4 = lineReducer(s3, { type: 'remove', key: 'c' });
    expect(s4.map((l) => l.key)).toEqual(['a', 'b']);
  });

  it('keeps one empty line when the last one is removed', () => {
    const s = lineReducer([line('a', { description: 'x' })], { type: 'remove', key: 'a' });
    expect(s).toEqual([emptyLine('a')]);
  });
});

describe('parsing and live totals', () => {
  it('parses quantities in hundredths', () => {
    expect(parseQuantity('1,5')).toBe(150);
    expect(parseQuantity('2')).toBe(200);
    expect(parseQuantity('0')).toBeNull();
    expect(parseQuantity('1,234')).toBeNull();
    expect(parseQuantity('abc')).toBeNull();
  });

  it('ignores invalid lines and rounds VAT per line like the server', () => {
    const lines = [
      line('a', { unitPrice: '0,333', vatRateBp: 1900 }),
      line('b', { unitPrice: '0,333', vatRateBp: 1900 }),
      line('c', { unitPrice: 'abc' }),
    ];
    expect(toLineInputs(lines)).toHaveLength(2);
    const t = liveTotals(lines, 1000);
    expect(t.htMillimes).toBe(666);
    expect(t.vatMillimes).toBe(126); // 63 + 63, not round(666 × 19 %) = 127
    expect(t.totalMillimes).toBe(666 + 126 + 1000);
  });
});
