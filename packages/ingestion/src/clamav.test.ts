import { createServer, type Server } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { assertPrivateScannerConfig, ClamAvScanner } from './clamav';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error === undefined ? resolve() : reject(error)));
        }),
    ),
  );
});

async function fakeClamd(result: 'OK' | 'FOUND' | 'INVALID'): Promise<number> {
  const server = createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let commandRead = false;
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!commandRead) {
        const marker = buffer.indexOf(0);
        if (marker < 0) return;
        expect(buffer.subarray(0, marker).toString('ascii')).toBe('zINSTREAM');
        buffer = buffer.subarray(marker + 1);
        commandRead = true;
      }
      while (buffer.byteLength >= 4) {
        const length = buffer.readUInt32BE(0);
        if (length === 0) {
          socket.end(
            `stream: ${
              result === 'OK'
                ? 'OK'
                : result === 'FOUND'
                  ? 'Eicar-Test-Signature FOUND'
                  : 'unexpected response'
            }\0`,
          );
          return;
        }
        if (buffer.byteLength < length + 4) return;
        buffer = buffer.subarray(length + 4);
      }
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Missing fake clamd port.');
  return address.port;
}

function stream(value: string): AsyncIterable<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  return {
    [Symbol.asyncIterator]() {
      let consumed = false;
      return {
        next() {
          if (consumed) return Promise.resolve({ done: true, value: undefined });
          consumed = true;
          return Promise.resolve({ done: false, value: bytes });
        },
      };
    },
  };
}

describe('private ClamAV INSTREAM client', () => {
  it('frames a bounded stream and recognizes a clean response', async () => {
    const scanner = new ClamAvScanner({
      host: '127.0.0.1',
      port: await fakeClamd('OK'),
      timeoutMs: 2_000,
      maximumBytes: 1_024,
    });
    await expect(scanner.scan(stream('synthetic clean fixture'))).resolves.toBe('CLEAN');
  });

  it('reports malware without exposing content and rejects public endpoints', async () => {
    const scanner = new ClamAvScanner({
      host: '127.0.0.1',
      port: await fakeClamd('FOUND'),
      timeoutMs: 2_000,
      maximumBytes: 1_024,
    });
    await expect(scanner.scan(stream('synthetic antivirus marker'))).resolves.toBe('INFECTED');
    expect(() =>
      assertPrivateScannerConfig({
        host: '8.8.8.8',
        port: 3310,
        timeoutMs: 1_000,
        maximumBytes: 1_024,
      }),
    ).toThrow(/private/);
    expect(() =>
      assertPrivateScannerConfig({
        host: 'scanner.example.com',
        port: 3310,
        timeoutMs: 1_000,
        maximumBytes: 1_024,
      }),
    ).toThrow(/private/);
    expect(() =>
      assertPrivateScannerConfig({
        host: 'clamav.railway.internal',
        port: 3310,
        timeoutMs: 1_000,
        maximumBytes: 1_024,
      }),
    ).not.toThrow();
  });

  it('rejects invalid configuration while allowing only explicit private ranges', () => {
    for (const config of [
      { host: '', port: 3310, timeoutMs: 1_000, maximumBytes: 1 },
      { host: 'localhost', port: 0, timeoutMs: 1_000, maximumBytes: 1 },
      { host: 'localhost', port: 65_536, timeoutMs: 1_000, maximumBytes: 1 },
      { host: 'localhost', port: 1.5, timeoutMs: 1_000, maximumBytes: 1 },
      { host: 'localhost', port: 3310, timeoutMs: 99, maximumBytes: 1 },
      { host: 'localhost', port: 3310, timeoutMs: 1_000.5, maximumBytes: 1 },
      { host: 'localhost', port: 3310, timeoutMs: 1_000, maximumBytes: 0 },
      { host: 'localhost', port: 3310, timeoutMs: 1_000, maximumBytes: 1.5 },
    ]) {
      expect(() => assertPrivateScannerConfig(config)).toThrow('configuration is invalid');
    }
    for (const host of [
      'localhost',
      '127.0.0.1',
      '::1',
      '10.0.0.1',
      '192.168.0.1',
      '172.16.0.1',
      '172.31.0.1',
    ]) {
      expect(() =>
        assertPrivateScannerConfig({ host, port: 3310, timeoutMs: 1_000, maximumBytes: 1 }),
      ).not.toThrow();
    }
    for (const host of ['172.15.0.1', '172.32.0.1', '172.bad.0.1']) {
      expect(() =>
        assertPrivateScannerConfig({ host, port: 3310, timeoutMs: 1_000, maximumBytes: 1 }),
      ).toThrow('private network endpoint');
    }
  });

  it('enforces the full streamed-byte bound and rejects unknown scanner responses', async () => {
    const bounded = new ClamAvScanner({
      host: '127.0.0.1',
      port: await fakeClamd('OK'),
      timeoutMs: 2_000,
      maximumBytes: 3,
    });
    await expect(bounded.scan(stream('too long'))).rejects.toThrow('CLAMAV_SIZE_LIMIT');

    const invalid = new ClamAvScanner({
      host: '127.0.0.1',
      port: await fakeClamd('INVALID'),
      timeoutMs: 2_000,
      maximumBytes: 1_024,
    });
    await expect(invalid.scan(stream('synthetic'))).rejects.toThrow('CLAMAV_INVALID_RESPONSE');
  });
});
