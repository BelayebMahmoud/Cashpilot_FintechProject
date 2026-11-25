'use client';

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { Button, cn, Input, NativeSelect } from '@cashpilot/ui';
import { useDebouncedValue, useUrlFilters } from '@/hooks';

export interface FilterSelect {
  name: string;
  label: string;
  options: { value: string; label: string }[];
}

/** Search + selects + date range, synced with the URL search params, with "Réinitialiser". */
export function FilterBar({
  searchPlaceholder = 'Rechercher…',
  selects = [],
  dateRange,
  keep = [],
  showSearch = true,
  className,
}: {
  showSearch?: boolean;
  searchPlaceholder?: string;
  selects?: FilterSelect[];
  dateRange?: { from: string; to: string; label?: string };
  /** Params preserved by "Réinitialiser" (e.g. the active tab). */
  keep?: string[];
  className?: string;
}) {
  const { params, set, reset, pending } = useUrlFilters();
  const [q, setQ] = React.useState(params.get('q') ?? '');
  const debounced = useDebouncedValue(q, 300);
  const lastPushed = React.useRef(params.get('q') ?? '');

  // push the debounced search to the URL (external system) — not a derived state copy
  React.useEffect(() => {
    if (debounced === lastPushed.current) return;
    lastPushed.current = debounced;
    set({ q: debounced || undefined });
  }, [debounced, set]);

  const active =
    !!params.get('q') || selects.some((s) => params.get(s.name)) || (!!dateRange && (!!params.get(dateRange.from) || !!params.get(dateRange.to)));

  return (
    <div role="search" className={cn('flex flex-col gap-2 md:flex-row md:flex-wrap md:items-end', className)} aria-busy={pending}>
      {showSearch && <div className="relative md:w-72">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input aria-label="Rechercher" placeholder={searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" type="search" />
      </div>}
      {selects.map((s) => (
        <NativeSelect
          key={s.name}
          aria-label={s.label}
          className="md:w-52"
          value={params.get(s.name) ?? ''}
          onChange={(e) => set({ [s.name]: e.target.value || undefined })}
        >
          <option value="">{s.label} : tous</option>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      ))}
      {dateRange && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label={`${dateRange.label ?? 'Date'} : du`}
            value={params.get(dateRange.from) ?? ''}
            onChange={(e) => set({ [dateRange.from]: e.target.value || undefined })}
            className="md:w-40"
          />
          <span className="text-sm text-muted-foreground">au</span>
          <Input
            type="date"
            aria-label={`${dateRange.label ?? 'Date'} : au`}
            value={params.get(dateRange.to) ?? ''}
            onChange={(e) => set({ [dateRange.to]: e.target.value || undefined })}
            className="md:w-40"
          />
        </div>
      )}
      {active && (
        <Button
          variant="ghost"
          onClick={() => {
            setQ('');
            lastPushed.current = '';
            reset(keep);
          }}
        >
          <X /> Réinitialiser
        </Button>
      )}
    </div>
  );
}
