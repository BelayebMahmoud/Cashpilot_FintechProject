import { computeTotals, type InvoiceTotals, type LineInput } from '@cashpilot/domain';
import { parseMoneyInput } from '@cashpilot/ui/format';

/**
 * Pure state of the invoice line editor (used with `useReducer`).
 * Quantities and prices are kept as the strings the user types; they are parsed
 * only to compute live totals and on the server.
 */
export interface EditorLine {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
  vatRateBp: number;
}

export type LineAction =
  | { type: 'add'; key: string }
  | { type: 'update'; key: string; patch: Partial<Omit<EditorLine, 'key'>> }
  | { type: 'remove'; key: string }
  | { type: 'duplicate'; key: string; newKey: string };

export const emptyLine = (key: string): EditorLine => ({ key, description: '', quantity: '1', unitPrice: '', vatRateBp: 1900 });

export function lineReducer(state: EditorLine[], action: LineAction): EditorLine[] {
  switch (action.type) {
    case 'add':
      return [...state, emptyLine(action.key)];
    case 'update':
      return state.map((l) => (l.key === action.key ? { ...l, ...action.patch } : l));
    case 'remove':
      // an invoice always keeps at least one (possibly empty) line in the editor
      return state.length <= 1 ? [emptyLine(state[0]?.key ?? action.key)] : state.filter((l) => l.key !== action.key);
    case 'duplicate': {
      const i = state.findIndex((l) => l.key === action.key);
      if (i < 0) return state;
      const copy = { ...state[i]!, key: action.newKey };
      return [...state.slice(0, i + 1), copy, ...state.slice(i + 1)];
    }
  }
}

/** "1,5" → 150 hundredths; null when invalid or ≤ 0. */
export function parseQuantity(input: string): number | null {
  const s = input.replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [i = '0', f = ''] = s.split('.');
  const v = Number(i) * 100 + Number(f.padEnd(2, '0'));
  return v > 0 && Number.isSafeInteger(v) ? v : null;
}

/** Valid lines only, in the domain's LineInput shape. */
export function toLineInputs(lines: EditorLine[]): LineInput[] {
  return lines.flatMap((l) => {
    const qty = parseQuantity(l.quantity);
    const unit = parseMoneyInput(l.unitPrice);
    if (qty === null || unit === null || unit < 0) return [];
    return [{ description: l.description || '—', qtyHundredths: qty, unitMillimes: unit, vatRateBp: l.vatRateBp }];
  });
}

/** Live totals with exactly the server's rules (per-line VAT rounding). */
export function liveTotals(lines: EditorLine[], stampDutyMillimes: number): InvoiceTotals {
  return computeTotals(toLineInputs(lines), stampDutyMillimes);
}
