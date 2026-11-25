import { LocalDate } from '@cashpilot/domain';
import { createUseCases } from '../../src';
import { RepositoryForecastReadModel } from '../../src/forecast/repository-read-model';
import { type Deps } from '../../src/shared/deps';
import { type Clock, type IdGenerator, type InvoicePdfRenderer } from '../../src/ports';
import { FakePdfRenderer, FixedClock, InMemoryFileStorage, InMemoryUnitOfWork, SequentialIds } from './in-memory';

export * from './in-memory';

export interface InMemoryApp {
  uow: InMemoryUnitOfWork;
  clock: Clock;
  ids: IdGenerator;
  storage: InMemoryFileStorage;
  pdf: InvoicePdfRenderer;
  deps: Deps;
  useCases: ReturnType<typeof createUseCases>;
}

/** Wires every use case on in-memory adapters (tests and DEMO_IN_MEMORY=1). */
export function createInMemoryApp(options: { clock?: Clock; ids?: IdGenerator; pdf?: InvoicePdfRenderer } = {}): InMemoryApp {
  const clock = options.clock ?? new FixedClock(LocalDate.parse('2026-12-01'));
  const ids = options.ids ?? new SequentialIds();
  const uow = new InMemoryUnitOfWork(ids, clock);
  const storage = new InMemoryFileStorage();
  const pdf = options.pdf ?? new FakePdfRenderer();
  const deps: Deps = { uow, clock, ids, storage, pdf, forecast: new RepositoryForecastReadModel(uow) };
  return { uow, clock, ids, storage, pdf, deps, useCases: createUseCases(deps) };
}
