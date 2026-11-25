import * as React from 'react';
import { cn } from '../../lib/utils';
import { formatMoney } from '../../lib/format';

export interface AmountProps {
  /** Integer millimes. */
  value: number;
  /** Show "+" on positive values (flows). */
  signed?: boolean;
  /**
   * - `auto`: + amounts in inflow colour when `signed`; negatives in foreground
   * - `balance`: red only when the balance is negative (risk)
   * - `neutral`: never coloured
   */
  tone?: 'auto' | 'balance' | 'neutral';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  strike?: boolean;
}

const sizes = { sm: 'text-sm', md: 'text-base', lg: 'text-xl font-semibold', xl: 'text-[2rem] leading-none font-semibold tracking-tight' };

/**
 * Formats millimes as fr-TN money ("1 234,500 DT") with tabular figures and a muted "DT".
 * Red is reserved for negative *balances*; outflows stay neutral.
 */
export function Amount({ value, signed = false, tone = 'auto', size = 'sm', className, strike }: AmountProps) {
  const text = formatMoney(value, { signed, currency: false });
  const color =
    tone === 'balance'
      ? value < 0
        ? 'text-danger'
        : undefined
      : tone === 'auto' && signed && value > 0
        ? 'text-inflow'
        : undefined;
  return (
    <span className={cn('tabular-nums whitespace-nowrap', sizes[size], color, strike && 'line-through text-muted-foreground', className)}>
      <span aria-hidden>{text}</span>
      <span aria-hidden className="ml-[0.25em] text-[0.75em] font-normal text-muted-foreground">
        DT
      </span>
      {/* screen readers get the full amount once, in words for the currency */}
      <span className="sr-only">{formatMoney(value, { signed }).replace('DT', 'dinars')}</span>
    </span>
  );
}
