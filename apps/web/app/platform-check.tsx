'use client';

import { Button, Check, CircleAlert, RefreshCw, StatusBadge } from '@delivery-os/ui';
import { useState } from 'react';

type CheckState =
  | { status: 'idle' }
  | { status: 'running' }
  | {
      status: 'complete';
      healthy: boolean;
      ready: boolean;
      correlationId: string;
      revision?: number;
      replayed?: boolean;
    }
  | { status: 'error'; message: string };

export function PlatformCheck() {
  const [state, setState] = useState<CheckState>({ status: 'idle' });

  async function runCheck() {
    setState({ status: 'running' });
    try {
      const healthResponse = await fetch('/api/health', { cache: 'no-store' });
      const health = (await healthResponse.json()) as {
        status: string;
        correlationId: string;
      };
      const readyResponse = await fetch('/api/ready', {
        cache: 'no-store',
        headers: { 'x-correlation-id': health.correlationId },
      });
      const ready = (await readyResponse.json()) as { status: string };
      let revision: number | undefined;
      let replayed: boolean | undefined;

      if (readyResponse.ok) {
        const probeResponse = await fetch('/api/platform/probe', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-correlation-id': health.correlationId,
          },
          body: JSON.stringify({}),
        });
        if (probeResponse.ok) {
          const probe = (await probeResponse.json()) as { revision: number; replayed: boolean };
          revision = probe.revision;
          replayed = probe.replayed;
        }
      }

      setState({
        status: 'complete',
        healthy: healthResponse.ok && health.status === 'ok',
        ready: readyResponse.ok && ready.status === 'ok',
        correlationId: health.correlationId,
        ...(revision === undefined ? {} : { revision }),
        ...(replayed === undefined ? {} : { replayed }),
      });
    } catch {
      setState({
        status: 'error',
        message: 'The local platform could not be reached. Check the runtime and try again.',
      });
    }
  }

  const isRunning = state.status === 'running';
  return (
    <aside
      aria-labelledby="platform-check-title"
      className="rounded-[var(--radius-panel)] border bg-[color-mix(in_oklch,var(--surface-panel)_92%,transparent)] p-5 shadow-[0_20px_60px_oklch(0.28_0.08_276/10%)] backdrop-blur sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[0.6875rem] font-semibold tracking-[0.12em] text-[var(--content-muted)] uppercase">
            Live platform probe
          </p>
          <h2 id="platform-check-title" className="mt-2 text-xl font-bold tracking-[-0.03em]">
            Verify the foundation
          </h2>
        </div>
        <StatusBadge
          status={
            state.status === 'complete' && state.ready
              ? 'success'
              : state.status === 'error'
                ? 'danger'
                : 'neutral'
          }
        >
          {state.status === 'complete' && state.ready
            ? 'Ready'
            : state.status === 'running'
              ? 'Checking'
              : state.status === 'error'
                ? 'Unavailable'
                : 'Standby'}
        </StatusBadge>
      </div>

      <div className="mt-6 min-h-24 rounded-[var(--radius-control)] bg-[var(--surface-inset)] p-4">
        <div aria-live="polite" aria-atomic="true">
          {state.status === 'idle' ? (
            <p className="text-sm leading-6 text-[var(--content-secondary)]">
              Test liveness, dependency readiness, correlation propagation, and a transactional
              command in one pass.
            </p>
          ) : null}
          {state.status === 'running' ? (
            <p className="flex items-center gap-2 text-sm text-[var(--content-secondary)]">
              <RefreshCw aria-hidden="true" size={16} className="animate-spin" />
              Following the request through each boundary…
            </p>
          ) : null}
          {state.status === 'complete' ? (
            <div>
              <p className="flex items-center gap-2 text-sm font-bold">
                {state.ready ? (
                  <Check aria-hidden="true" size={16} className="text-[var(--state-success)]" />
                ) : (
                  <CircleAlert
                    aria-hidden="true"
                    size={16}
                    className="text-[var(--state-warning-strong)]"
                  />
                )}
                {state.ready
                  ? 'Dependencies and transaction path passed.'
                  : 'Process is healthy; one or more dependencies are unavailable.'}
              </p>
              <dl className="mt-3 space-y-1 font-mono text-[0.6875rem] text-[var(--content-muted)]">
                <div className="flex justify-between gap-3">
                  <dt>correlation</dt>
                  <dd className="max-w-44 truncate">{state.correlationId}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>command revision</dt>
                  <dd>{state.revision ?? 'not run'}</dd>
                </div>
              </dl>
            </div>
          ) : null}
          {state.status === 'error' ? (
            <p className="flex gap-2 text-sm leading-6 text-[var(--state-danger-strong)]">
              <CircleAlert aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
              {state.message}
            </p>
          ) : null}
        </div>
      </div>

      <Button
        className="mt-4 w-full"
        disabled={isRunning}
        onClick={() => {
          void runCheck();
        }}
      >
        {isRunning ? 'Running platform check' : 'Run platform check'}
      </Button>
    </aside>
  );
}
