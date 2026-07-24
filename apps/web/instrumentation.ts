export async function register() {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.TELEMETRY_EXPORT_ENABLED === 'true' &&
    process.env.SENTRY_DSN
  ) {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      sendDefaultPii: false,
      tracesSampleRate: 0.1,
      beforeSend(event) {
        delete event.request?.cookies;
        delete event.request?.headers;
        delete event.request?.data;
        return event;
      },
    });
  }
}
