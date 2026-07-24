import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '#lib/utils';

const statusBadgeVariants = cva(
  'inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-bold tracking-[0.04em] uppercase',
  {
    variants: {
      status: {
        neutral:
          'border-[var(--border-default)] bg-[var(--surface-inset)] text-[var(--content-secondary)]',
        info: 'border-[var(--state-info-border)] bg-[var(--state-info-soft)] text-[var(--state-info-strong)]',
        success:
          'border-[var(--state-success-border)] bg-[var(--state-success-soft)] text-[var(--state-success-strong)]',
        warning:
          'border-[var(--state-warning-border)] bg-[var(--state-warning-soft)] text-[var(--state-warning-strong)]',
        danger:
          'border-[var(--state-danger-border)] bg-[var(--state-danger-soft)] text-[var(--state-danger-strong)]',
        review:
          'border-[var(--state-review-border)] bg-[var(--state-review-soft)] text-[var(--state-review-strong)]',
      },
    },
    defaultVariants: {
      status: 'neutral',
    },
  },
);

export function StatusBadge({
  className,
  status,
  children,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof statusBadgeVariants>) {
  return (
    <span
      className={cn(statusBadgeVariants({ status }), className)}
      data-slot="status-badge"
      {...props}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
