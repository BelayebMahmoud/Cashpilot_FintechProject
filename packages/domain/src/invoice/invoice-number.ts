import { DomainError } from '../shared/errors';

const FORMAT = /^FAC-(\d{4})-(\d{4,})$/;

/** Gapless per-company, per-year invoice number: FAC-2026-0001. */
export class InvoiceNumber {
  private constructor(readonly value: string) {}

  static of(year: number, sequence: number): InvoiceNumber {
    if (!Number.isInteger(year) || !Number.isInteger(sequence) || sequence < 1) {
      throw new DomainError('VALIDATION', 'Invalid invoice number parts');
    }
    return new InvoiceNumber(`FAC-${year}-${String(sequence).padStart(4, '0')}`);
  }

  static parse(value: string): InvoiceNumber {
    if (!FORMAT.test(value)) throw new DomainError('VALIDATION', `Invalid invoice number ${value}`);
    return new InvoiceNumber(value);
  }

  toString(): string {
    return this.value;
  }
}
