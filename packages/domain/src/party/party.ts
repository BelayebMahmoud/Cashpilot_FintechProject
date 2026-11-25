import { DomainError } from '../shared/errors';
import { cleanText, type CompanyId, type PartyId } from '../shared/id';

export const PARTY_KINDS = ['CLIENT', 'SUPPLIER'] as const;
export type PartyKind = (typeof PARTY_KINDS)[number];

export interface PartyDetails {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null;
  notes?: string | null;
}

export interface PartyProps {
  companyId: CompanyId;
  kind: PartyKind;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  notes: string | null;
  archived: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9][0-9 .-]{5,19}$/;

function checkDetails(details: PartyDetails): Omit<PartyProps, 'companyId' | 'kind' | 'archived'> {
  const name = details.name.trim();
  if (name.length < 2) throw new DomainError('PARTY_INVALID', 'Name too short', { field: 'name' });
  const email = cleanText(details.email);
  if (email && !EMAIL.test(email)) {
    throw new DomainError('PARTY_INVALID', 'Invalid email', { field: 'email' });
  }
  const phone = cleanText(details.phone);
  if (phone && !PHONE.test(phone)) {
    throw new DomainError('PARTY_INVALID', 'Invalid phone', { field: 'phone' });
  }
  return {
    name,
    email: email?.toLowerCase() ?? null,
    phone,
    address: cleanText(details.address),
    taxId: cleanText(details.taxId)?.toUpperCase() ?? null,
    notes: cleanText(details.notes),
  };
}

/**
 * A client or a supplier. Referenced parties are archived, never deleted,
 * so invoice and expense history keeps its counterpart.
 */
export class Party {
  private constructor(
    readonly id: PartyId,
    private props: PartyProps,
  ) {}

  static create(id: PartyId, companyId: CompanyId, kind: PartyKind, details: PartyDetails): Party {
    return new Party(id, { companyId, kind, archived: false, ...checkDetails(details) });
  }

  static restore(id: PartyId, props: PartyProps): Party {
    return new Party(id, { ...props });
  }

  update(details: PartyDetails): void {
    if (this.props.archived) throw new DomainError('PARTY_ARCHIVED');
    this.props = { ...this.props, ...checkDetails(details) };
  }

  archive(): void {
    this.props = { ...this.props, archived: true };
  }

  unarchive(): void {
    this.props = { ...this.props, archived: false };
  }

  get companyId(): CompanyId {
    return this.props.companyId;
  }
  get kind(): PartyKind {
    return this.props.kind;
  }
  get name(): string {
    return this.props.name;
  }
  get archived(): boolean {
    return this.props.archived;
  }

  snapshot(): Readonly<PartyProps & { id: string }> {
    return { id: this.id, ...this.props };
  }
}
