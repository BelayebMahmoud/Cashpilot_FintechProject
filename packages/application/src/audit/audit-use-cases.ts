import { assertCan, LocalDate } from '@cashpilot/domain';
import { type AuditEntryView } from '../ports';
import { type Actor } from '../shared/actor';
import { type Deps } from '../shared/deps';
import { attempt, ok, PAGE_SIZE, type Page, type Result } from '../shared/result';

export interface ListAuditInput {
  actorId?: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  page?: number;
}

/** Paramètres › Journal: every mutation with before/after, readable by owner and finance. */
export class ListAuditEntries {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: ListAuditInput = {}): Promise<Result<Page<AuditEntryView>>> {
    return attempt(async () => {
      assertCan(actor, 'audit.read');
      const page = Math.max(1, input.page ?? 1);
      const res = await this.deps.uow.read((r) =>
        r.audit.list(
          actor.companyId,
          {
            ...(input.actorId ? { actorId: input.actorId } : {}),
            ...(input.action ? { action: input.action } : {}),
            ...(input.entityType ? { entityType: input.entityType } : {}),
            ...(input.from ? { from: LocalDate.parse(input.from) } : {}),
            ...(input.to ? { to: LocalDate.parse(input.to) } : {}),
          },
          { offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE },
        ),
      );
      return ok({ items: res.items, total: res.total, page, pageSize: PAGE_SIZE });
    });
  }
}
