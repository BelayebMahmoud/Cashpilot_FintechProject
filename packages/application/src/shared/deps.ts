import {
  type Clock,
  type FileStorage,
  type ForecastReadModel,
  type IdGenerator,
  type InvoicePdfRenderer,
  type UnitOfWork,
} from '../ports';

/** Everything a use case may depend on. Built once by the composition root. */
export interface Deps {
  uow: UnitOfWork;
  clock: Clock;
  ids: IdGenerator;
  forecast: ForecastReadModel;
  storage: FileStorage;
  pdf: InvoicePdfRenderer;
}
