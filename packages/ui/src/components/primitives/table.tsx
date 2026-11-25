import * as React from 'react';
import { cn } from '../../lib/utils';

export function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

export function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return <caption className={cn('sr-only', className)} {...props} />;
}

export function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead className={cn('sticky top-0 z-10 bg-card [&_tr]:border-b', className)} {...props} />;
}

export function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return <tfoot className={cn('border-t bg-muted/50 font-medium', className)} {...props} />;
}

export function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return <tr className={cn('h-11 border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', className)} {...props} />;
}

export function TableHead({ className, numeric, ...props }: React.ComponentProps<'th'> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn('h-10 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground', numeric && 'text-right', className)}
      {...props}
    />
  );
}

export function TableCell({ className, numeric, ...props }: React.ComponentProps<'td'> & { numeric?: boolean }) {
  return <td className={cn('px-3 py-2 align-middle', numeric && 'text-right tabular-nums whitespace-nowrap', className)} {...props} />;
}
