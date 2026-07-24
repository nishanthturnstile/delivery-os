import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '#lib/utils';

const buttonVariants = cva(
  [
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 text-sm font-semibold',
    'transition-[color,background-color,border-color,box-shadow,transform] duration-[var(--motion-fast)]',
    'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)]',
    'disabled:pointer-events-none disabled:opacity-45',
    'data-[pressed]:translate-y-px',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--action-primary)] text-[var(--content-inverse)] shadow-[var(--shadow-action)] hover:bg-[var(--action-primary-hover)]',
        secondary:
          'border border-[var(--border-strong)] bg-[var(--surface-panel)] text-[var(--content-primary)] hover:bg-[var(--surface-inset)]',
        quiet:
          'text-[var(--content-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--content-primary)]',
        destructive:
          'bg-[var(--state-danger)] text-[var(--content-inverse)] hover:bg-[var(--state-danger-strong)]',
      },
      size: {
        default: 'h-10',
        compact: 'h-8 min-h-8 px-3 text-xs',
        icon: 'size-10 px-0',
      },
    },
    defaultVariants: {
      size: 'default',
      variant: 'primary',
    },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ButtonPrimitive> & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      className={cn(buttonVariants({ variant, size }), className)}
      data-slot="button"
      {...props}
    />
  );
}

export { buttonVariants };
