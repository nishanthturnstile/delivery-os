import { cloneElement, type ComponentProps, type ReactElement } from 'react';

import { cn } from '#lib/utils';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'min-h-10 w-full rounded-[var(--radius-control)] border bg-[var(--surface-raised)] px-3 text-sm text-[var(--content-primary)] shadow-sm outline-none',
        'placeholder:text-[var(--content-muted)] focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'min-h-10 w-full rounded-[var(--radius-control)] border bg-[var(--surface-raised)] px-3 text-sm text-[var(--content-primary)] shadow-sm outline-none',
        'focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)]',
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  description,
  error,
  children,
}: {
  label: string;
  description?: string | undefined;
  error?: string | undefined;
  children: ReactElement<{ id?: string; 'aria-describedby'?: string }>;
}) {
  const id = children.props.id;
  const descriptionId = id === undefined ? undefined : `${id}-description`;
  const errorId = id === undefined ? undefined : `${id}-error`;
  const describedBy = [
    description === undefined ? undefined : descriptionId,
    error === undefined ? undefined : errorId,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold" htmlFor={id}>
        {label}
      </label>
      {description === undefined ? null : (
        <p id={descriptionId} className="mb-2 text-xs leading-5 text-[var(--content-muted)]">
          {description}
        </p>
      )}
      {cloneElement(children, describedBy === '' ? {} : { 'aria-describedby': describedBy })}
      {error === undefined ? null : (
        <p id={errorId} className="mt-1.5 text-sm text-[var(--state-danger-strong)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
