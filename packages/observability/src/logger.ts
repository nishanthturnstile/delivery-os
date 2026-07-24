import { randomUUID } from 'node:crypto';

import pino, { type DestinationStream, type Logger } from 'pino';

const REDACT_PATHS = [
  'authorization',
  'headers.authorization',
  'headers.cookie',
  'cookie',
  'cookies',
  'password',
  'secret',
  'token',
  'apiKey',
  'accessKey',
  'signedUrl',
  'sourceBody',
  'ocrBody',
  'prompt',
  'aiResponse',
  'recoveryCode',
  '*.authorization',
  '*.cookie',
  '*.password',
  '*.secret',
  '*.token',
  '*.apiKey',
] as const;

export function createLogger(
  options: Readonly<{
    service: string;
    version: string;
    level?: string;
    destination?: DestinationStream;
  }>,
): Logger {
  return pino(
    {
      base: {
        service: options.service,
        version: options.version,
      },
      level: options.level ?? 'info',
      messageKey: 'message',
      redact: {
        paths: [...REDACT_PATHS],
        censor: '[REDACTED]',
      },
      serializers: {
        err: pino.stdSerializers.err,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    options.destination,
  );
}

export function correlationIdFromHeader(value: string | null): string {
  if (value !== null && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) {
    return value;
  }
  return randomUUID();
}
