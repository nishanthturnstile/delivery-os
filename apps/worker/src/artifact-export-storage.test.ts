import { createHash } from 'node:crypto';

import type * as S3Module from '@aws-sdk/client-s3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const original = await importOriginal<typeof S3Module>();
  return {
    ...original,
    S3Client: class {
      send = send;
    },
  };
});

import { createArtifactExportStorage, S3ArtifactExportStorage } from './artifact-export-storage';

describe('artifact export object storage', () => {
  beforeEach(() => {
    send.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps the worker healthy when deferred production storage is unavailable', async () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('S3_BUCKET', '');
    await expect(
      createArtifactExportStorage().putImmutable({
        key: 'exports/test/result.json',
        body: new Uint8Array(),
        contentType: 'application/json',
        contentHash: '0'.repeat(64),
      }),
    ).rejects.toThrow(/STORAGE_UNAVAILABLE/);
    expect(send).not.toHaveBeenCalled();
  });

  it('writes hash-verified bytes under an immutable key', async () => {
    send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } }).mockResolvedValueOnce({});
    const body = new TextEncoder().encode('{"safe":true}');
    const contentHash = createHash('sha256').update(body).digest('hex');
    await new S3ArtifactExportStorage().putImmutable({
      key: 'exports/test/result.json',
      body,
      contentType: 'application/json',
      contentHash,
    });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('replays an existing object only when its hash matches', async () => {
    const body = new TextEncoder().encode('{"safe":true}');
    const contentHash = createHash('sha256').update(body).digest('hex');
    send.mockResolvedValueOnce({ Metadata: { 'content-hash': contentHash } });
    await new S3ArtifactExportStorage().putImmutable({
      key: 'exports/test/result.json',
      body,
      contentType: 'application/json',
      contentHash,
    });
    expect(send).toHaveBeenCalledOnce();
  });

  it('rejects corrupted bytes and immutable-key collisions', async () => {
    const storage = new S3ArtifactExportStorage();
    await expect(
      storage.putImmutable({
        key: 'exports/test/result.json',
        body: new TextEncoder().encode('different'),
        contentType: 'application/json',
        contentHash: '0'.repeat(64),
      }),
    ).rejects.toThrow(/HASH_MISMATCH/);
    const body = new TextEncoder().encode('{"safe":true}');
    const contentHash = createHash('sha256').update(body).digest('hex');
    send.mockResolvedValueOnce({ Metadata: { 'content-hash': 'f'.repeat(64) } });
    await expect(
      storage.putImmutable({
        key: 'exports/test/result.json',
        body,
        contentType: 'application/json',
        contentHash,
      }),
    ).rejects.toThrow(/IMMUTABLE_KEY_COLLISION/);
  });
});
