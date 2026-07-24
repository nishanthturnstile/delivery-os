import { SpanStatusCode, trace } from '@opentelemetry/api';

export async function withSpan<T>(
  name: string,
  attributes: Readonly<Record<string, string | number | boolean>>,
  operation: () => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer('delivery-os');
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttributes(attributes);
    try {
      const result = await operation();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      if (error instanceof Error) {
        span.recordException(error);
      }
      throw error;
    } finally {
      span.end();
    }
  });
}
