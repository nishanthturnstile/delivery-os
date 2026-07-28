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

  it('fails closed when production storage configuration is incomplete', () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('S3_BUCKET', 'delivery-os-staging-primary');
    vi.stubEnv('S3_REGION', '');
    expect(() => new S3ArtifactExportStorage()).toThrow('MISSING_S3_REGION');

    vi.stubEnv('S3_REGION', 'auto');
    vi.stubEnv('S3_ACCESS_KEY_ID', '');
    expect(() => new S3ArtifactExportStorage()).toThrow('MISSING_S3_ACCESS_KEY_ID');

    vi.stubEnv('S3_ACCESS_KEY_ID', 'synthetic-key');
    vi.stubEnv('S3_SECRET_ACCESS_KEY', '');
    expect(() => new S3ArtifactExportStorage()).toThrow('MISSING_S3_SECRET_ACCESS_KEY');
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

  it('propagates non-not-found storage failures without attempting an overwrite', async () => {
    send.mockRejectedValueOnce(new Error('synthetic storage outage'));
    const body = new TextEncoder().encode('{"safe":true}');
    const contentHash = createHash('sha256').update(body).digest('hex');
    await expect(
      new S3ArtifactExportStorage().putImmutable({
        key: 'exports/test/result.json',
        body,
        contentType: 'application/json',
        contentHash,
      }),
    ).rejects.toThrow('synthetic storage outage');
    expect(send).toHaveBeenCalledOnce();
  });

  it('accepts an explicit private endpoint and path-style configuration', async () => {
    vi.stubEnv('S3_ENDPOINT', 'https://storage.synthetic.invalid');
    vi.stubEnv('S3_FORCE_PATH_STYLE', 'true');
    send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } }).mockResolvedValueOnce({});
    const body = new TextEncoder().encode('{"safe":true}');
    const contentHash = createHash('sha256').update(body).digest('hex');
    await expect(
      new S3ArtifactExportStorage().putImmutable({
        key: 'exports/test/result.json',
        body,
        contentType: 'application/json',
        contentHash,
      }),
    ).resolves.toBeUndefined();
  });
});
