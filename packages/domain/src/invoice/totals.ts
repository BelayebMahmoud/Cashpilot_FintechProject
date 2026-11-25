import { DomainError } from '../shared/errors';
import { Money } from '../shared/money';

/** VAT rates in basis points: 1900 = 19 %. */
export const VAT_RATES_BP = [1900, 1300, 700, 0] as const;
export type VatRateBp = (typeof VAT_RATES_BP)[number];

/** Plain line shape (millimes, hundredths) so the editor can call `computeTotals` on form state. */
export interface LineInput {
  description: string;
  /** Quantity × 100 (1,5 → 150). */
  qtyHundredths: number;
  unitMillimes: number;
  vatRateBp: number;
}

export interface LineTotals {
  htMillimes: number;
  vatMillimes: number;
  ttcMillimes: number;
}

export interface VatBucket {
  rateBp: number;
  baseMillimes: number;
  vatMillimes: number;
}

export interface InvoiceTotals {
  lines: LineTotals[];
  htMillimes: number;
  vatMillimes: number;
  vatByRate: VatBucket[];
  stampDutyMillimes: number;
  totalMillimes: number;
}

export function assertValidLine(line: LineInput): void {
  if (!line.description.trim()) {
    throw new DomainError('VALIDATION', 'Line description required', { field: 'description' });
  }
  if (!Number.isSafeInteger(line.qtyHundredths) || line.qtyHundredths <= 0) {
    throw new DomainError('VALIDATION', 'Quantity must be positive', { field: 'quantity' });
  }
  if (!Number.isSafeInteger(line.unitMillimes) || line.unitMillimes < 0) {
    throw new DomainError('INVALID_AMOUNT', 'Unit price must be ≥ 0', { field: 'unitPrice' });
  }
  if (!(VAT_RATES_BP as readonly number[]).includes(line.vatRateBp)) {
    throw new DomainError('VALIDATION', 'Unsupported VAT rate', { field: 'vatRate' });
  }
}

/** HT, VAT and TTC of one line. VAT is rounded per line, never on the sum. */
export function computeLine(line: Pick<LineInput, 'qtyHundredths' | 'unitMillimes' | 'vatRateBp'>): LineTotals {
  const ht = Money.ofMillimes(line.unitMillimes).mulRatio(line.qtyHundredths, 100);
  const vat = ht.mulRatio(line.vatRateBp, 10_000);
  return { htMillimes: ht.millimes, vatMillimes: vat.millimes, ttcMillimes: ht.add(vat).millimes };
}

/**
 * Pure invoice totals: Σ lineHT + Σ lineVAT (+ stamp duty).
 * Exported for the invoice editor so the live totals use exactly the server rules.
 */
export function computeTotals(lines: readonly LineInput[], stampDutyMillimes = 0): InvoiceTotals {
  const lineTotals = lines.map(computeLine);
  const buckets = new Map<number, VatBucket>();
  lines.forEach((line, i) => {
    const t = lineTotals[i]!;
    const bucket = buckets.get(line.vatRateBp) ?? { rateBp: line.vatRateBp, baseMillimes: 0, vatMillimes: 0 };
    buckets.set(line.vatRateBp, {
      rateBp: bucket.rateBp,
      baseMillimes: bucket.baseMillimes + t.htMillimes,
      vatMillimes: bucket.vatMillimes + t.vatMillimes,
    });
  });
  const ht = lineTotals.reduce((s, t) => s + t.htMillimes, 0);
  const vat = lineTotals.reduce((s, t) => s + t.vatMillimes, 0);
  return {
    lines: lineTotals,
    htMillimes: ht,
    vatMillimes: vat,
    vatByRate: [...buckets.values()].sort((a, b) => b.rateBp - a.rateBp),
    stampDutyMillimes,
    totalMillimes: Money.ofMillimes(ht + vat + stampDutyMillimes).millimes,
  };
}
