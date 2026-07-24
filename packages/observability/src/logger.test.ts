import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { correlationIdFromHeader, createLogger } from './logger';

describe('structured logger', () => {
  it('redacts injected credentials and confidential bodies', async () => {
    let output = '';
    const destination = new Writable({
      write(chunk: Buffer, _encoding: BufferEncoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = createLogger({ service: 'test', version: 'test', destination });

    logger.info(
      {
        correlationId: crypto.randomUUID(),
        authorization: 'Bearer should-not-leak',
        password: 'should-not-leak',
        prompt: 'confidential prompt',
      },
      'redaction fixture',
    );

    await new Promise<void>((resolve) => {
      destination.end(resolve);
    });
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('should-not-leak');
    expect(output).not.toContain('confidential prompt');
  });

  it('preserves a valid correlation ID and replaces invalid input', () => {
    const correlationId = crypto.randomUUID();
    expect(correlationIdFromHeader(correlationId)).toBe(correlationId);
    expect(correlationIdFromHeader('unsafe-value')).not.toBe('unsafe-value');
    expect(correlationIdFromHeader(null)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
