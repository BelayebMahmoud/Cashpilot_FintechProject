'use client';

import * as React from 'react';
import { Tabs as TabsPrimitive, ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { Command as CommandPrimitive } from 'cmdk';
import { DayPicker } from 'react-day-picker';
import { fr } from 'react-day-picker/locale';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Toaster as Sonner } from 'sonner';
import { cn } from '../../lib/utils';
import { buttonVariants } from './button';

/* ── Tabs ─────────────────────────────────────────────────────────────── */

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export const TabsContent = TabsPrimitive.Content;

/* ── Toggle group (segmented control) ─────────────────────────────────── */

export function ToggleGroup({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return <ToggleGroupPrimitive.Root className={cn('inline-flex w-fit shrink-0 items-center rounded-md border bg-card p-0.5', className)} {...props} />;
}

export function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      className={cn(
        'inline-flex h-8 min-w-10 shrink-0 items-center justify-center rounded-[5px] px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=on]:bg-primary data-[state=on]:text-primary-foreground',
        className,
      )}
      {...props}
    />
  );
}

/* ── Command (⌘K palette, combobox) ───────────────────────────────────── */

export function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return <CommandPrimitive className={cn('flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground', className)} {...props} />;
}

export function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex h-11 items-center gap-2 border-b px-3">
      <Search className="size-4 shrink-0 opacity-50" aria-hidden />
      <CommandPrimitive.Input
        className={cn('flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50', className)}
        {...props}
      />
    </div>
  );
}

export function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return <CommandPrimitive.List className={cn('max-h-[320px] overflow-x-hidden overflow-y-auto p-1', className)} {...props} />;
}

export function CommandEmpty(props: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className="py-6 text-center text-sm text-muted-foreground" {...props} />;
}

export function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn('overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground', className)}
      {...props}
    />
  );
}

export function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

/* ── Calendar (fr, weeks start on Monday) ─────────────────────────────── */

export function Calendar({ className, ...props }: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      locale={fr}
      weekStartsOn={1}
      showOutsideDays
      className={cn('p-1', className)}
      classNames={{
        months: 'relative flex flex-col',
        month: 'space-y-3',
        month_caption: 'flex h-8 items-center justify-center text-sm font-medium capitalize',
        nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
        button_previous: cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' })),
        button_next: cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' })),
        weekdays: 'flex',
        weekday: 'w-9 text-[0.75rem] font-normal text-muted-foreground',
        week: 'mt-1 flex w-full',
        day: 'size-9 p-0 text-center text-sm',
        day_button: 'size-9 rounded-md hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring outline-none aria-selected:bg-primary aria-selected:text-primary-foreground',
        selected: 'rounded-md bg-primary text-primary-foreground',
        today: 'font-semibold text-primary',
        outside: 'text-muted-foreground opacity-50',
        disabled: 'text-muted-foreground opacity-40',
      }}
      components={{
        Chevron: ({ orientation }) => (orientation === 'left' ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />),
      }}
      {...props}
    />
  );
}

/* ── Toaster ──────────────────────────────────────────────────────────── */

export function Toaster(props: React.ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      className="toaster group"
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: 'group toast border bg-popover text-popover-foreground shadow-lg',
          description: 'text-muted-foreground',
        },
      }}
      style={{ '--normal-bg': 'var(--popover)', '--normal-text': 'var(--popover-foreground)', '--normal-border': 'var(--border)' } as React.CSSProperties}
      {...props}
    />
  );
}

export { toast } from 'sonner';
