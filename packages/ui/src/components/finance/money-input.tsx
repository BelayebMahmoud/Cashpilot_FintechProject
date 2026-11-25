'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';
import { formatMoneyInput, parseMoneyInput } from '../../lib/format';

export interface MoneyInputProps extends Omit<React.ComponentProps<'input'>, 'type' | 'value' | 'defaultValue' | 'onChange' | 'size'> {
  /** Initial value in millimes. */
  defaultMillimes?: number | null;
  /** Controlled raw text (optional). */
  value?: string;
  onValueChange?: (raw: string, millimes: number | null) => void;
  size?: 'default' | 'lg';
}

/**
 * Text input for amounts — never `type=number`. Accepts "1 234,5", reformats to
 * "1 234,500" on blur and submits the raw string (the server parses it into millimes).
 */
export function MoneyInput({ defaultMillimes, value, onValueChange, className, size = 'default', onBlur, ...props }: MoneyInputProps) {
  const [inner, setInner] = React.useState(() => (defaultMillimes != null ? formatMoneyInput(defaultMillimes) : ''));
  const raw = value ?? inner;

  function update(next: string) {
    if (value === undefined) setInner(next);
    onValueChange?.(next, parseMoneyInput(next));
  }

  return (
    <div className={cn('relative flex items-center', className)}>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={raw}
        onChange={(e) => update(e.target.value)}
        onBlur={(e) => {
          const parsed = parseMoneyInput(raw);
          if (parsed !== null) update(formatMoneyInput(parsed));
          onBlur?.(e);
        }}
        className={cn(
          'flex w-full min-w-0 rounded-md border border-input bg-card pr-12 pl-3 text-right tabular-nums shadow-none outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-danger/20',
          size === 'lg' ? 'h-14 text-2xl font-semibold' : 'h-10 text-base md:text-sm',
        )}
        {...props}
      />
      <span aria-hidden className="pointer-events-none absolute right-3 text-sm text-muted-foreground">
        DT
      </span>
    </div>
  );
}
