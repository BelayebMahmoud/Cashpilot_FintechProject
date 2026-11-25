import { Skeleton } from '@cashpilot/ui';

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6" aria-busy="true" aria-label="Chargement du tableau de bord">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[132px]" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-[380px] lg:col-span-2" />
        <Skeleton className="h-[380px]" />
      </div>
    </div>
  );
}
