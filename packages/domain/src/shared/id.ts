/**
 * Ids are opaque strings (UUIDs) produced by the IdGenerator port.
 * The aliases document intent in signatures without adding ceremony.
 */
export type CompanyId = string;
export type UserId = string;
export type PartyId = string;
export type InvoiceId = string;
export type PaymentId = string;
export type ExpenseId = string;
export type MovementId = string;
export type PlannedFlowId = string;
export type ScenarioId = string;
export type ProjectId = string;

/** Trims a free-text value; returns null when it is empty. */
export function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
