import type { ComponentProps } from 'react';

import { cn } from '#lib/utils';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-32 w-full resize-y rounded-[var(--radius-control)] border bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--content-primary)] shadow-sm outline-none',
        'placeholder:text-[var(--content-muted)] focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
