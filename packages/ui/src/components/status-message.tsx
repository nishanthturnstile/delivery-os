import type { ComponentProps } from 'react';

import { cn } from '#lib/utils';

export function StatusMessage({
  className,
  children,
  tone = 'neutral',
  ...props
}: ComponentProps<'div'> & { tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const tones = {
    neutral: 'border-[var(--border-default)] bg-[var(--surface-inset)]',
    success: 'border-[var(--state-success-border)] bg-[var(--state-success-soft)]',
    warning: 'border-[var(--state-warning-border)] bg-[var(--state-warning-soft)]',
    danger: 'border-[var(--state-danger-border)] bg-[var(--state-danger-soft)]',
  };
  return (
    <div
      aria-live={tone === 'danger' ? 'assertive' : 'polite'}
      className={cn(
        'rounded-[var(--radius-control)] border px-3 py-2 text-sm',
        tones[tone],
        className,
      )}
      role={tone === 'danger' ? 'alert' : 'status'}
      {...props}
    >
      {children}
    </div>
  );
}
