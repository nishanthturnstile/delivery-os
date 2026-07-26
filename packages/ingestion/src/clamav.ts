import { isIP } from 'node:net';
import { connect, type Socket } from 'node:net';

export interface MalwareScanner {
  scan(stream: AsyncIterable<Uint8Array>): Promise<'CLEAN' | 'INFECTED'>;
}

export type ClamAvConfig = Readonly<{
  host: string;
  port: number;
  timeoutMs: number;
  maximumBytes: number;
}>;

export class ClamAvScanner implements MalwareScanner {
  constructor(
    private readonly config: ClamAvConfig,
    private readonly openSocket: (host: string, port: number) => Socket = (host, port) =>
      connect({ host, port }),
  ) {
    assertPrivateScannerConfig(config);
  }

  async scan(stream: AsyncIterable<Uint8Array>): Promise<'CLEAN' | 'INFECTED'> {
    const socket = this.openSocket(this.config.host, this.config.port);
    socket.setTimeout(this.config.timeoutMs);
    const response = collectResponse(socket, this.config.timeoutMs);
    await waitForConnect(socket);
    socket.write(Buffer.from('zINSTREAM\0', 'ascii'));
    let byteSize = 0;
    for await (const chunk of stream) {
      byteSize += chunk.byteLength;
      if (byteSize > this.config.maximumBytes) {
        socket.destroy();
        throw new Error('CLAMAV_SIZE_LIMIT');
      }
      const length = Buffer.allocUnsafe(4);
      length.writeUInt32BE(chunk.byteLength);
      if (!socket.write(length) || !socket.write(chunk)) await waitForDrain(socket);
    }
    socket.end(Buffer.alloc(4));
    const result = await response;
    if (result.endsWith('OK')) return 'CLEAN';
    if (result.includes('FOUND')) return 'INFECTED';
    throw new Error('CLAMAV_INVALID_RESPONSE');
  }
}

export function assertPrivateScannerConfig(config: ClamAvConfig): void {
  if (
    config.host.trim().length === 0 ||
    !Number.isSafeInteger(config.port) ||
    config.port < 1 ||
    config.port > 65_535 ||
    !Number.isSafeInteger(config.timeoutMs) ||
    config.timeoutMs < 100 ||
    !Number.isSafeInteger(config.maximumBytes) ||
    config.maximumBytes < 1
  ) {
    throw new Error('ClamAV configuration is invalid.');
  }
  const ipVersion = isIP(config.host);
  const privateHostname =
    config.host === 'localhost' || config.host.toLowerCase().endsWith('.railway.internal');
  if (
    (ipVersion === 0 && !privateHostname) ||
    (ipVersion !== 0 &&
      config.host !== '127.0.0.1' &&
      config.host !== '::1' &&
      !config.host.startsWith('10.') &&
      !config.host.startsWith('192.168.') &&
      !isPrivate172(config.host))
  ) {
    throw new Error('ClamAV must use a private network endpoint.');
  }
}

function isPrivate172(host: string): boolean {
  const match = /^172\.(\d{1,3})\./u.exec(host);
  if (match?.[1] === undefined) return false;
  const second = Number.parseInt(match[1], 10);
  return second >= 16 && second <= 31;
}

function waitForConnect(socket: Socket): Promise<void> {
  if (!socket.connecting) return Promise.resolve();
  return new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
}

function waitForDrain(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('drain', resolve);
    socket.once('error', reject);
  });
}

function collectResponse(socket: Socket, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('CLAMAV_TIMEOUT'));
    }, timeoutMs);
    socket.on('data', (chunk: Buffer) => chunks.push(chunk));
    socket.once('timeout', () => {
      clearTimeout(timer);
      socket.destroy();
      reject(new Error('CLAMAV_TIMEOUT'));
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.once('end', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString('utf8').replaceAll('\0', '').trim());
    });
  });
}
