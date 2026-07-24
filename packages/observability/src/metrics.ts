import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export function createMetricsRegistry(service: string): {
  registry: Registry;
  requestDuration: Histogram<'route' | 'method' | 'status'>;
  outboxDispatch: Counter<'result'>;
} {
  const registry = new Registry();
  registry.setDefaultLabels({ service });
  collectDefaultMetrics({ register: registry, prefix: 'delivery_os_' });

  const requestDuration = new Histogram({
    name: 'delivery_os_http_request_duration_seconds',
    help: 'HTTP request duration in seconds.',
    labelNames: ['route', 'method', 'status'],
    registers: [registry],
  });
  const outboxDispatch = new Counter({
    name: 'delivery_os_outbox_dispatch_total',
    help: 'Outbox dispatch attempts by safe result.',
    labelNames: ['result'],
    registers: [registry],
  });
  return { registry, requestDuration, outboxDispatch };
}
