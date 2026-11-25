import { formatDate, formatMoney } from '@cashpilot/ui/format';

/** Lightweight server-rendered SVG of the real balance over the last N days (no client JS). */
export function BalanceSparkline({ points, height = 64 }: { points: { date: string; balanceMillimes: number }[]; height?: number }) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.balanceMillimes);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const w = 600;
  const x = (i: number) => (i / (points.length - 1)) * w;
  const y = (v: number) => height - ((v - min) / span) * height;
  // step path: the balance changes on a date
  let d = `M0,${y(values[0]!)}`;
  for (let i = 1; i < values.length; i++) d += ` H${x(i)} V${y(values[i]!)}`;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const low = points.reduce((m, p) => (p.balanceMillimes < m.balanceMillimes ? p : m), first);
  const label = `Solde réel du ${formatDate(first.date)} au ${formatDate(last.date)} : de ${formatMoney(first.balanceMillimes)} à ${formatMoney(last.balanceMillimes)}, minimum ${formatMoney(low.balanceMillimes)} le ${formatDate(low.date)}.`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" role="img" aria-label={label} className="h-16 w-full overflow-visible">
      {min < 0 && <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      <path d={d} fill="none" stroke="var(--chart-baseline)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
