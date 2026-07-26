import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { promoteQuarantineObject, verifyStoredObject } from './promotion';
import { FakeObjectStorage } from './storage';

describe('quarantine promotion', () => {
  it('copies to a new immutable key, rehashes fully, then verifies quarantine deletion', async () => {
    const storage = new FakeObjectStorage();
    const body = new TextEncoder().encode('Synthetic clean source.');
    const digest = createHash('sha256').update(body);
    const sha256Hex = digest.copy().digest('hex');
    const sha256Base64 = digest.digest('base64');
    storage.seed({
      key: 'quarantine/workspace/project/source/generation',
      contentLength: body.byteLength,
      contentType: 'text/plain',
      checksumSha256: sha256Base64,
      body,
    });
    await promoteQuarantineObject(storage, {
      quarantineKey: 'quarantine/workspace/project/source/generation',
      primaryKey: 'sources/workspace/project/source/generation',
      contentType: 'text/plain',
      sha256Hex,
      sha256Base64,
      byteSize: body.byteLength,
    });
    await expect(
      storage.head('quarantine/workspace/project/source/generation'),
    ).resolves.toBeUndefined();
    await expect(
      storage.head('sources/workspace/project/source/generation'),
    ).resolves.toMatchObject({
      contentLength: body.byteLength,
      checksumSha256: sha256Base64,
    });
  });

  it('fails if provider metadata and independently streamed bytes disagree', async () => {
    const storage = new FakeObjectStorage();
    const body = new TextEncoder().encode('Wrong synthetic bytes.');
    storage.seed({
      key: 'sources/test',
      contentLength: body.byteLength,
      contentType: 'text/plain',
      checksumSha256: 'ignored',
      body,
    });
    await expect(
      verifyStoredObject(storage, 'sources/test', 'a'.repeat(64), body.byteLength),
    ).rejects.toThrow(/HASH_MISMATCH/);
  });
});
