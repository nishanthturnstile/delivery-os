import {
  Activity,
  Boxes,
  Database,
  GitBranch,
  Layers3,
  LockKeyhole,
  ServerCog,
  ShieldCheck,
  StatusBadge,
  Workflow,
} from '@delivery-os/ui';

import { PlatformCheck } from './platform-check';

const runtimeVersions = [
  ['Node.js', '24 LTS'],
  ['Next.js', '16.2'],
  ['React', '19.2'],
  ['TypeScript', '6.0'],
] as const;

const flow = [
  {
    label: 'Request',
    detail: 'Versioned Zod contract',
    icon: Layers3,
  },
  {
    label: 'Command',
    detail: 'Authorization + revision',
    icon: ShieldCheck,
  },
  {
    label: 'Transaction',
    detail: 'State + audit + outbox',
    icon: Database,
  },
  {
    label: 'Worker',
    detail: 'Durable, replay-safe job',
    icon: Workflow,
  },
] as const;

const gates = [
  ['Optimistic concurrency', 'Stale writes return a safe conflict'],
  ['Idempotent commands', 'Retries produce one domain outcome'],
  ['Transactional outbox', 'Committed work survives restarts'],
  ['Append-only audit', 'Every probe carries attribution'],
  ['Correlation chain', 'HTTP to job uses one trace identity'],
  ['Secret-safe telemetry', 'Confidential bodies never enter logs'],
] as const;

export default function FoundationPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden="true"
        className="foundation-grid pointer-events-none absolute inset-0 -z-10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 right-[-14rem] -z-10 size-[34rem] rounded-full bg-[color-mix(in_oklch,var(--action-primary)_14%,transparent)] blur-3xl"
      />

      <header className="border-b bg-[color-mix(in_oklch,var(--surface-canvas)_86%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between px-5 py-4 sm:px-8 lg:px-12">
          <a
            className="flex items-center gap-3"
            href="#top"
            aria-label="Delivery OS foundation home"
          >
            <span className="grid size-9 place-items-center rounded-[var(--radius-control)] bg-[var(--content-primary)] text-[var(--content-inverse)]">
              <GitBranch aria-hidden="true" size={18} strokeWidth={2.2} />
            </span>
            <span>
              <span className="block text-sm font-extrabold tracking-[-0.02em]">Delivery OS</span>
              <span className="block font-mono text-[0.625rem] tracking-[0.12em] text-[var(--content-muted)] uppercase">
                Platform / W0
              </span>
            </span>
          </a>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-xs text-[var(--content-muted)] sm:block">
              build {process.env.NEXT_PUBLIC_APP_VERSION ?? 'development'}
            </span>
            <StatusBadge status="review">In validation</StatusBadge>
          </div>
        </div>
      </header>

      <section
        id="top"
        className="mx-auto max-w-[90rem] px-5 pt-16 pb-10 sm:px-8 sm:pt-24 lg:px-12 lg:pt-28"
      >
        <div className="grid items-end gap-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(24rem,0.75fr)]">
          <div>
            <div className="mb-7 flex items-center gap-3 font-mono text-xs font-semibold tracking-[0.1em] text-[var(--content-secondary)] uppercase">
              <span className="h-px w-10 trace-line" />
              Foundation control plane
            </div>
            <h1 className="max-w-4xl text-[clamp(3rem,7vw,6.7rem)] leading-[0.91] font-extrabold tracking-[-0.07em]">
              Trust starts
              <span className="block text-[var(--content-muted)]">below the workflow.</span>
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-8 text-[var(--content-secondary)] sm:text-xl">
              W0 establishes the durable command, audit, job, provider, and interface contracts
              every Delivery OS module inherits.
            </p>
          </div>

          <PlatformCheck />
        </div>
      </section>

      <section
        aria-labelledby="flow-heading"
        className="mx-auto max-w-[90rem] px-5 py-10 sm:px-8 lg:px-12"
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="font-mono text-[0.6875rem] font-semibold tracking-[0.12em] text-[var(--content-muted)] uppercase">
              Request-to-job contract
            </p>
            <h2 id="flow-heading" className="mt-2 text-2xl font-bold tracking-[-0.035em]">
              One correlation trail. Four guarded boundaries.
            </h2>
          </div>
          <Activity aria-hidden="true" className="hidden text-[var(--trace-accent)] sm:block" />
        </div>

        <ol className="grid overflow-hidden rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] md:grid-cols-4">
          {flow.map((item, index) => {
            const Icon = item.icon;
            return (
              <li
                key={item.label}
                className="relative border-b p-5 last:border-b-0 md:border-r md:border-b-0 md:last:border-r-0"
              >
                <div className="mb-9 flex items-center justify-between">
                  <span className="grid size-9 place-items-center rounded-[var(--radius-control)] bg-[var(--surface-inset)] text-[var(--action-primary)]">
                    <Icon aria-hidden="true" size={18} />
                  </span>
                  <span className="font-mono text-xs text-[var(--content-muted)]">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="font-bold">{item.label}</h3>
                <p className="mt-1 text-sm text-[var(--content-secondary)]">{item.detail}</p>
                {index < flow.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="trace-line absolute right-0 bottom-0 left-0 h-0.5 md:top-[3.25rem] md:right-[-0.75rem] md:bottom-auto md:left-auto md:z-10 md:h-0.5 md:w-6"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="mx-auto grid max-w-[90rem] gap-6 px-5 py-10 sm:px-8 lg:grid-cols-[1fr_0.72fr] lg:px-12">
        <div className="rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <LockKeyhole aria-hidden="true" className="text-[var(--action-primary)]" size={20} />
            <h2 className="text-xl font-bold tracking-[-0.025em]">Foundation acceptance gates</h2>
          </div>
          <div className="mt-7 grid gap-px overflow-hidden rounded-[var(--radius-control)] border bg-[var(--border-default)] sm:grid-cols-2">
            {gates.map(([title, detail]) => (
              <div key={title} className="bg-[var(--surface-raised)] p-5">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-[var(--trace-accent)]"
                  />
                  <h3 className="text-sm font-bold">{title}</h3>
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--content-secondary)]">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="flex flex-col justify-between rounded-[var(--radius-panel)] bg-[var(--content-primary)] p-6 text-[var(--content-inverse)] sm:p-8">
          <div>
            <div className="flex items-center justify-between">
              <p className="font-mono text-[0.6875rem] font-semibold tracking-[0.12em] uppercase opacity-60">
                Runtime baseline
              </p>
              <ServerCog aria-hidden="true" size={20} className="opacity-70" />
            </div>
            <dl className="mt-6 divide-y divide-white/10">
              {runtimeVersions.map(([name, version]) => (
                <div key={name} className="flex items-baseline justify-between py-3.5">
                  <dt className="text-sm opacity-70">{name}</dt>
                  <dd className="font-mono text-sm font-semibold">{version}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="mt-10 border-t border-white/10 pt-5">
            <div className="flex items-center gap-3">
              <Boxes aria-hidden="true" size={18} className="text-[var(--trace-accent)]" />
              <p className="text-sm leading-6 opacity-75">
                Exact versions are committed in one workspace lockfile and checked by policy.
              </p>
            </div>
          </div>
        </aside>
      </section>

      <footer className="mx-auto flex max-w-[90rem] flex-col gap-3 px-5 pt-12 pb-8 text-xs text-[var(--content-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
        <p>Delivery OS · Trace &amp; Flow foundation</p>
        <p className="font-mono">NFR-03 · NFR-06 · NFR-12 · NFR-13</p>
      </footer>
    </main>
  );
}
