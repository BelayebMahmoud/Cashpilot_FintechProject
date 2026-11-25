import Link from 'next/link';
import { cn } from '@cashpilot/ui';
import { routes } from '@/lib/routes';

export function ForecastTabs({ company, active }: { company: string; active: 'forecast' | 'planned' }) {
  const items = [
    { key: 'forecast', label: 'Projection', href: routes.forecast(company) },
    { key: 'planned', label: 'Flux prévus', href: routes.plannedFlows(company) },
  ] as const;
  return (
    <nav aria-label="Sections de la prévision">
      <ul className="inline-flex gap-1 rounded-lg border bg-muted p-1">
        {items.map((i) => (
          <li key={i.key}>
            <Link
              href={i.href}
              aria-current={active === i.key ? 'page' : undefined}
              className={cn(
                'inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                active === i.key && 'bg-card text-foreground ring-1 ring-border ring-inset',
              )}
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
