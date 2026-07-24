import type * as S3ClientModule from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { send, sign } = vi.hoisted(() => ({
  send: vi.fn(),
  sign: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const original = await importOriginal<typeof S3ClientModule>();
  return {
    ...original,
    S3Client: class {
      send = send;
    },
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: sign,
}));

import { FakeObjectStorage, S3CompatibleStorage } from './storage';

describe('object storage contract', () => {
  beforeEach(() => {
    send.mockReset();
    sign.mockReset();
  });

  it('uses immutable keys and reports deletion', async () => {
    const storage = new FakeObjectStorage();
    storage.seed({
      key: 'sources/workspace/project/source/generation',
      contentLength: 12,
      contentType: 'text/plain',
      checksumSha256: 'checksum',
    });

    expect(await storage.head('sources/workspace/project/source/generation')).toBeDefined();
    await storage.delete('sources/workspace/project/source/generation');
    expect(await storage.head('sources/workspace/project/source/generation')).toBeUndefined();
  });

  it('implements the supported S3 subset without provider-specific features', async () => {
    send.mockResolvedValueOnce({
      ContentLength: 12,
      ContentType: 'text/plain',
      ChecksumSHA256: 'checksum',
    });
    sign.mockResolvedValueOnce('https://signed.example/get');
    sign.mockResolvedValueOnce('https://signed.example/put');
    send.mockResolvedValueOnce({});
    const storage = new S3CompatibleStorage({
      endpoint: 'http://minio:9000',
      region: 'us-east-1',
      bucket: 'delivery-os',
      accessKeyId: 'local',
      secretAccessKey: 'local-secret',
      forcePathStyle: true,
    });

    await expect(storage.head('immutable-key')).resolves.toEqual({
      key: 'immutable-key',
      contentLength: 12,
      contentType: 'text/plain',
      checksumSha256: 'checksum',
    });
    await expect(storage.presignGet('immutable-key', 60)).resolves.toContain('/get');
    await expect(
      storage.presignPut('immutable-key', {
        contentType: 'text/plain',
        checksumSha256: 'checksum',
        expiresInSeconds: 60,
      }),
    ).resolves.toContain('/put');
    await storage.delete('immutable-key');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('maps only provider 404 responses to a missing object', async () => {
    const storage = new S3CompatibleStorage({
      region: 'auto',
      bucket: 'delivery-os',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      forcePathStyle: false,
    });
    send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
    await expect(storage.head('missing')).resolves.toBeUndefined();

    send.mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(storage.head('failed')).rejects.toThrow(/provider unavailable/);
  });

  it('provides deterministic fake presign responses', async () => {
    const storage = new FakeObjectStorage();
    await expect(storage.presignGet('a key', 10)).resolves.toContain('a%20key');
    await expect(
      storage.presignPut('a key', {
        contentType: 'text/plain',
        checksumSha256: 'checksum',
        expiresInSeconds: 10,
      }),
    ).resolves.toContain('expires=10');
  });
});
