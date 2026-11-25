import { DomainError, invariant } from '../shared/errors';
import { type CompanyId } from '../shared/id';
import { type LocalDate } from '../shared/local-date';
import { Money } from '../shared/money';

export const SECTORS = ['DIGITAL_AGENCY', 'TRAINING_CENTER', 'RETAIL', 'SERVICES'] as const;
export type Sector = (typeof SECTORS)[number];

export const SECTOR_LABELS: Record<Sector, string> = {
  DIGITAL_AGENCY: 'Agence digitale',
  TRAINING_CENTER: 'Centre de formation',
  RETAIL: 'Commerce',
  SERVICES: 'Entreprise de services',
};

export interface CompanyProps {
  name: string;
  slug: string;
  sector: Sector;
  openingBalance: Money;
  openingDate: LocalDate;
  /** Optional fixed "timbre fiscal" added to every invoice total (0 = none). */
  stampDuty: Money;
}

export interface CreateCompanyInput {
  name: string;
  slug: string;
  sector: Sector;
  openingBalance: Money;
  openingDate: LocalDate;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Builds a URL slug from a company name: "Atlas Digital SARL" → "atlas-digital-sarl". */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export class Company {
  private constructor(
    readonly id: CompanyId,
    private props: CompanyProps,
  ) {}

  static create(id: CompanyId, input: CreateCompanyInput, today: LocalDate): Company {
    const name = input.name.trim();
    invariant(name.length >= 2, 'VALIDATION', { field: 'name' });
    invariant(SLUG.test(input.slug), 'VALIDATION', { field: 'slug' });
    if (input.openingDate.isAfter(today)) {
      throw new DomainError('INVALID_DATE', 'Opening date cannot be in the future');
    }
    return new Company(id, { ...input, name, stampDuty: Money.zero() });
  }

  static restore(id: CompanyId, props: CompanyProps): Company {
    return new Company(id, { ...props });
  }

  updateSettings(input: { name: string; sector: Sector; stampDuty: Money }): void {
    const name = input.name.trim();
    invariant(name.length >= 2, 'VALIDATION', { field: 'name' });
    invariant(!input.stampDuty.isNegative(), 'INVALID_AMOUNT');
    this.props = { ...this.props, name, sector: input.sector, stampDuty: input.stampDuty };
  }

  get name(): string {
    return this.props.name;
  }
  get slug(): string {
    return this.props.slug;
  }
  get sector(): Sector {
    return this.props.sector;
  }
  get openingBalance(): Money {
    return this.props.openingBalance;
  }
  get openingDate(): LocalDate {
    return this.props.openingDate;
  }
  get stampDuty(): Money {
    return this.props.stampDuty;
  }

  snapshot(): Readonly<CompanyProps & { id: string }> {
    return { id: this.id, ...this.props };
  }
}
