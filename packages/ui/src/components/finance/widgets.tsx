import * as React from 'react';
import { AlertTriangle, ArrowRight, CircleAlert, Inbox, SearchX, Wallet } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatDate, formatMoney } from '../../lib/format';
import { Card } from '../primitives/layout';
import { Amount } from './amount';

type LinkLike = React.ElementType<{ href: string; className?: string; children?: React.ReactNode }>;

/* ── KpiCard ──────────────────────────────────────────────────────────── */

export interface KpiCardProps {
  label: string;
  value: number;
  tone?: 'balance' | 'neutral';
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  href?: string;
  linkAs?: LinkLike;
  className?: string;
}

export function KpiCard({ label, value, tone = 'neutral', hint, icon, href, linkAs: Link = 'a', className }: KpiCardProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{label}</span>
        {icon && <span aria-hidden className="[&_svg]:size-4">{icon}</span>}
      </div>
      <Amount value={value} tone={tone} size="xl" />
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </>
  );
  return (
    <Card className={cn('gap-2', href && 'transition-colors hover:bg-accent/40', className)}>
      {href ? (
        <Link href={href} className="flex flex-col gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  );
}

/* ── RunwayGauge (signature element) ──────────────────────────────────── */

export interface RunwayGaugeProps {
  /** Days before the first negative day; null = no shortfall within the horizon. */
  days: number | null;
  firstNegativeDate: string | null;
  horizon?: number;
  className?: string;
}

export function RunwayGauge({ days, firstNegativeDate, horizon = 90, className }: RunwayGaugeProps) {
  const value = days ?? horizon;
  const tone = days === null ? 'inflow' : days < 15 ? 'danger' : days < 30 ? 'warning' : 'inflow';
  const label = days === null ? `> ${horizon} jours` : `${days} jour${days > 1 ? 's' : ''}`;
  const segments = 18;
  const filled = Math.round((Math.min(value, horizon) / horizon) * segments);
  const color = { danger: 'bg-danger', warning: 'bg-warning', inflow: 'bg-inflow' }[tone];
  return (
    <Card className={cn('gap-3', className)}>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Autonomie de trésorerie</span>
        <Wallet className="size-4" aria-hidden />
      </div>
      <div className="text-[2rem] leading-none font-semibold tracking-tight tabular-nums">{label}</div>
      <div
        role="meter"
        aria-label="Autonomie de trésorerie"
        aria-valuemin={0}
        aria-valuemax={horizon}
        aria-valuenow={Math.min(value, horizon)}
        aria-valuetext={days === null ? `Plus de ${horizon} jours` : `${days} jours, premier solde négatif le ${formatDate(firstNegativeDate!)}`}
        className="flex gap-0.5"
      >
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} className={cn('h-2 flex-1 rounded-sm', i < filled ? color : 'bg-muted')} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {firstNegativeDate ? (
          <>
            Premier solde négatif prévu le <strong className="text-danger">{formatDate(firstNegativeDate)}</strong>
          </>
        ) : (
          `Aucun solde négatif prévu sur ${horizon} jours`
        )}
      </p>
    </Card>
  );
}

/* ── PageHeader ───────────────────────────────────────────────────────── */

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, breadcrumb, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-3 md:flex-row md:items-end md:justify-between', className)}>
      <div className="min-w-0 space-y-1">
        {breadcrumb && <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">{breadcrumb}</nav>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ── EmptyState ───────────────────────────────────────────────────────── */

export interface EmptyStateProps {
  variant?: 'first-use' | 'no-results';
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({ variant = 'first-use', title, description, action, icon, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center', className)}>
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5" aria-hidden>
        {icon ?? (variant === 'no-results' ? <SearchX /> : <Inbox />)}
      </div>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* ── AlertItem ────────────────────────────────────────────────────────── */

export interface AlertItemProps {
  severity: 'danger' | 'warning';
  title: string;
  description: React.ReactNode;
  href?: string;
  actionLabel?: string;
  linkAs?: LinkLike;
  trailing?: React.ReactNode;
}

export function AlertItem({ severity, title, description, href, actionLabel = 'Voir', linkAs: Link = 'a', trailing }: AlertItemProps) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full [&_svg]:size-4',
          severity === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning-foreground',
        )}
      >
        {severity === 'danger' ? <CircleAlert /> : <AlertTriangle />}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium">
          <span className="sr-only">{severity === 'danger' ? 'Critique : ' : 'Attention : '}</span>
          {title}
        </p>
        <div className="text-sm text-muted-foreground">{description}</div>
        {href && (
          <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            {actionLabel} <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </div>
      {trailing}
    </li>
  );
}

/* ── Pagination (server-side, URL based) ──────────────────────────────── */

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
  linkAs?: LinkLike;
}

export function Pagination({ page, pageSize, total, hrefFor, linkAs: Link = 'a' }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn = 'inline-flex h-9 min-w-9 items-center justify-center rounded-md border bg-card px-3 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring outline-none';
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span className="tabular-nums">
        {from}–{to} sur {total}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={btn}>
            Précédent
          </Link>
        ) : (
          <span className={cn(btn, 'pointer-events-none opacity-50')} aria-disabled>
            Précédent
          </span>
        )}
        {page < pages ? (
          <Link href={hrefFor(page + 1)} className={btn}>
            Suivant
          </Link>
        ) : (
          <span className={cn(btn, 'pointer-events-none opacity-50')} aria-disabled>
            Suivant
          </span>
        )}
      </div>
    </nav>
  );
}

/* ── Stat line used in detail headers ─────────────────────────────────── */

export function StatList({ items, className }: { items: { label: string; value: number; tone?: 'balance' | 'neutral' }[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-2 gap-4 md:grid-cols-4', className)}>
      {items.map((i) => (
        <div key={i.label} className="space-y-1">
          <dt className="text-xs text-muted-foreground">{i.label}</dt>
          <dd>
            <Amount value={i.value} tone={i.tone ?? 'neutral'} size="lg" />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export { formatMoney };
