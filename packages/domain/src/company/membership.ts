import { type Role } from '../access/policy';
import { DomainError } from '../shared/errors';
import { type CompanyId, type UserId } from '../shared/id';

export interface MembershipProps {
  userId: UserId;
  companyId: CompanyId;
  role: Role;
}

/** A user's role inside one company. */
export class Membership {
  private constructor(private props: MembershipProps) {}

  static create(props: MembershipProps): Membership {
    return new Membership({ ...props });
  }

  static restore(props: MembershipProps): Membership {
    return new Membership({ ...props });
  }

  get userId(): UserId {
    return this.props.userId;
  }
  get companyId(): CompanyId {
    return this.props.companyId;
  }
  get role(): Role {
    return this.props.role;
  }

  /**
   * Changes the role. `otherOwners` is the number of OWNER memberships besides this one:
   * the last owner can never be demoted, so a company always keeps a dirigeant.
   */
  changeRole(role: Role, otherOwners: number): void {
    if (this.props.role === 'OWNER' && role !== 'OWNER' && otherOwners === 0) {
      throw new DomainError('LAST_OWNER', 'The last owner cannot be demoted');
    }
    this.props = { ...this.props, role };
  }

  /** Throws when removing this membership would leave the company without an owner. */
  assertRemovable(otherOwners: number): void {
    if (this.props.role === 'OWNER' && otherOwners === 0) {
      throw new DomainError('LAST_OWNER', 'The last owner cannot be removed');
    }
  }

  snapshot(): Readonly<MembershipProps> {
    return { ...this.props };
  }
}
