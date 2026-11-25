'use client';

import * as React from 'react';
import { CalendarDays } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/overlays';
import { Calendar } from '../primitives/navigation';

export interface DateFieldProps extends Omit<React.ComponentProps<'input'>, 'type' | 'value' | 'defaultValue' | 'onChange' | 'min' | 'max'> {
  defaultValue?: string;
  value?: string;
  onValueChange?: (iso: string) => void;
  /** "YYYY-MM-DD" bounds (e.g. max = today for payments). */
  min?: string;
  max?: string;
}

const toDate = (iso: string) => new Date(`${iso}T00:00:00`);
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Typed date input + calendar popover (fr, Monday first). Value is always "YYYY-MM-DD". */
export function DateField({ defaultValue = '', value, onValueChange, min, max, className, ...props }: DateFieldProps) {
  const [inner, setInner] = React.useState(defaultValue);
  const [open, setOpen] = React.useState(false);
  const current = value ?? inner;

  function update(next: string) {
    if (value === undefined) setInner(next);
    onValueChange?.(next);
  }

  return (
    <div className={cn('relative flex items-center', className)}>
      <input
        type="date"
        value={current}
        min={min}
        max={max}
        onChange={(e) => update(e.target.value)}
        className="flex h-10 w-full min-w-0 rounded-md border border-input bg-card pr-10 pl-3 text-base tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50 aria-invalid:border-danger md:text-sm [&::-webkit-calendar-picker-indicator]:hidden"
        {...props}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="absolute right-1 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label="Ouvrir le calendrier"
          >
            <CalendarDays className="size-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-2">
          <Calendar
            mode="single"
            selected={current ? toDate(current) : undefined}
            defaultMonth={current ? toDate(current) : undefined}
            disabled={[...(min ? [{ before: toDate(min) }] : []), ...(max ? [{ after: toDate(max) }] : [])]}
            onSelect={(d) => {
              if (d) update(toIso(d));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
