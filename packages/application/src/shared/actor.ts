import { type AccessSubject, type Role } from '@cashpilot/domain';

/**
 * Who performs a use case: the signed-in user *inside one company*.
 * Built by ResolveActor (session + membership); every use case receives it first.
 */
export interface Actor extends AccessSubject {
  readonly userId: string;
  readonly companyId: string;
  readonly companySlug: string;
  readonly role: Role;
}
