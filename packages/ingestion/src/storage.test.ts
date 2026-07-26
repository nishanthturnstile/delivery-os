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

  it('covers the complete immutable fake storage and multipart contract', async () => {
    const storage = new FakeObjectStorage();
    const body = new Uint8Array([1, 2, 3]);
    await storage.putImmutable('source/a', {
      body,
      contentType: 'application/octet-stream',
      checksumSha256: 'checksum-a',
    });
    expect(() =>
      storage.putImmutable('source/a', {
        body,
        contentType: 'application/octet-stream',
        checksumSha256: 'checksum-a',
      }),
    ).toThrow('Immutable object key already exists');
    await storage.copyImmutable('source/a', 'source/b', {
      contentType: 'application/octet-stream',
      checksumSha256: 'checksum-b',
    });
    expect(() =>
      storage.copyImmutable('source/a', 'source/b', {
        contentType: 'application/octet-stream',
        checksumSha256: 'checksum-b',
      }),
    ).toThrow('Immutable object key already exists');
    expect(() =>
      storage.copyImmutable('missing', 'source/c', {
        contentType: 'application/octet-stream',
        checksumSha256: 'checksum-c',
      }),
    ).toThrow('Source object was not found');
    expect(await storage.list('source/')).toHaveLength(2);
    expect(await storage.get('missing')).toBeUndefined();
    const stream = await storage.get('source/a');
    if (stream === undefined) throw new Error('EXPECTED_FAKE_STREAM');
    const iterator = stream[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({ done: false, value: body });
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });

    const uploadId = await storage.createMultipartUpload('multipart/key', {
      contentType: 'text/plain',
      checksumSha256: 'checksum',
    });
    await expect(storage.presignUploadPart('wrong', uploadId, 1, 60)).rejects.toThrow(
      'Multipart upload was not found',
    );
    await expect(storage.presignUploadPart('multipart/key', uploadId, 1, 60)).resolves.toContain(
      'part=1',
    );
    await expect(storage.completeMultipartUpload('wrong', uploadId, [])).rejects.toThrow(
      'Multipart upload was not found',
    );
    await storage.completeMultipartUpload('multipart/key', uploadId, [
      { partNumber: 1, etag: 'etag' },
    ]);
    const abandoned = await storage.createMultipartUpload('multipart/abandoned', {
      contentType: 'text/plain',
      checksumSha256: 'checksum',
    });
    await storage.abortMultipartUpload('wrong', abandoned);
    await storage.abortMultipartUpload('multipart/abandoned', abandoned);
    await storage.deleteMany(['source/a', 'source/b']);
    expect(await storage.list('source/')).toEqual([]);
  });

  it('handles S3 streams, immutable writes, pagination, deletion, and multipart operations', async () => {
    const storage = new S3CompatibleStorage({
      region: 'auto',
      bucket: 'delivery-os',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      forcePathStyle: false,
    });
    const stream = {
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield new Uint8Array([1]);
      },
    };
    send.mockResolvedValueOnce({ Body: stream });
    await expect(storage.get('present')).resolves.toBe(stream);
    send.mockResolvedValueOnce({});
    await expect(storage.get('non-streaming')).rejects.toThrow('non-streaming body');
    send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
    await expect(storage.get('missing')).resolves.toBeUndefined();
    send.mockRejectedValueOnce(new Error('provider failed'));
    await expect(storage.get('failed')).rejects.toThrow('provider failed');

    send.mockResolvedValueOnce({});
    await storage.putImmutable('immutable', {
      body: new Uint8Array([1]),
      contentType: 'text/plain',
      checksumSha256: 'checksum',
    });
    send.mockResolvedValueOnce({});
    await storage.copyImmutable('folder/source key', 'folder/destination', {
      contentType: 'text/plain',
      checksumSha256: 'checksum',
    });

    send
      .mockResolvedValueOnce({
        Contents: [{ Key: undefined }, { Key: 'page/one' }],
        IsTruncated: true,
        NextContinuationToken: 'next',
      })
      .mockResolvedValueOnce({
        ContentLength: 1,
        ContentType: 'text/plain',
        ChecksumSHA256: 'checksum',
      })
      .mockResolvedValueOnce({ Contents: [{ Key: 'page/two' }], IsTruncated: false })
      .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
    await expect(storage.list('page/')).resolves.toEqual([
      {
        key: 'page/one',
        contentLength: 1,
        contentType: 'text/plain',
        checksumSha256: 'checksum',
      },
    ]);

    send.mockResolvedValueOnce({ Errors: [] });
    await storage.deleteMany(['one', 'two']);
    send.mockResolvedValueOnce({ Errors: [{ Key: 'one', Code: 'Denied' }] });
    await expect(storage.deleteMany(['one'])).rejects.toThrow('batch deletion');
    await storage.deleteMany([]);

    send.mockResolvedValueOnce({ UploadId: 'upload' });
    await expect(
      storage.createMultipartUpload('multipart', {
        contentType: 'text/plain',
        checksumSha256: 'checksum',
      }),
    ).resolves.toBe('upload');
    send.mockResolvedValueOnce({});
    await expect(
      storage.createMultipartUpload('multipart', {
        contentType: 'text/plain',
        checksumSha256: 'checksum',
      }),
    ).rejects.toThrow('omitted multipart ID');
    for (const invalid of [0, 10_001, 1.5]) {
      await expect(storage.presignUploadPart('key', 'upload', invalid, 60)).rejects.toThrow(
        'part number is invalid',
      );
    }
    sign.mockResolvedValueOnce('https://signed.example/part');
    await expect(storage.presignUploadPart('key', 'upload', 1, 60)).resolves.toContain('/part');
    send.mockResolvedValueOnce({});
    await storage.completeMultipartUpload('key', 'upload', [
      { partNumber: 2, etag: 'two' },
      { partNumber: 1, etag: 'one' },
    ]);
    send.mockResolvedValueOnce({});
    await storage.abortMultipartUpload('key', 'upload');
  });
});
