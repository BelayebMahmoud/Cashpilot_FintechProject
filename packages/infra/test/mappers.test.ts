import { describe, expect, it } from 'vitest';
import { LocalDate, Money } from '@cashpilot/domain';
import { fromBigInt, fromDbDate, toBigInt, toDbDate, toMoney } from '../src/prisma/mappers';
import { LocalFileStorage } from '../src/storage/local-file-storage';
import { SystemClock } from '../src/system/system';
import os from 'node:os';
import path from 'node:path';

describe('bigint ⇄ millimes mapper', () => {
  it('round-trips safe integers', () => {
    expect(toBigInt(Money.ofMillimes(1_234_567))).toBe(1_234_567n);
    expect(fromBigInt(-5_000_000n)).toBe(-5_000_000);
    expect(toMoney(42n).millimes).toBe(42);
  });

  it('the bigint mapper rejects unsafe integers', () => {
    expect(() => fromBigInt(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(RangeError);
    expect(() => fromBigInt(-(BigInt(Number.MAX_SAFE_INTEGER) + 2n))).toThrow(RangeError);
    expect(() => toBigInt(2 ** 60)).toThrow(RangeError);
    expect(fromBigInt(BigInt(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('maps @db.Date to LocalDate at UTC midnight', () => {
    const d = LocalDate.parse('2026-12-16');
    expect(toDbDate(d).toISOString()).toBe('2026-12-16T00:00:00.000Z');
    expect(fromDbDate(new Date('2026-12-16T00:00:00Z')).toString()).toBe('2026-12-16');
  });
});

describe('system adapters', () => {
  it('SystemClock returns a LocalDate in the configured timezone', () => {
    expect(new SystemClock('Africa/Tunis').today()).toBeInstanceOf(LocalDate);
  });

  it('LocalFileStorage stores privately and refuses unknown keys (no path traversal)', async () => {
    const storage = new LocalFileStorage(path.join(os.tmpdir(), `cashpilot-test-${Date.now()}`));
    const key = await storage.put(new Uint8Array([1, 2, 3]), 'image/png');
    expect(key).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(await storage.get(key)).toEqual({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' });
    expect(await storage.get('../../etc/passwd')).toBeNull();
    await expect(storage.put(new Uint8Array([1]), 'text/html')).rejects.toThrow();
  });
});
