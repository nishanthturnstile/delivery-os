import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { promoteQuarantineObject, verifyStoredObject } from './promotion';
import { FakeObjectStorage } from './storage';

function stream(...chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        next: () => {
          const chunk = chunks[index];
          if (chunk === undefined) {
            return Promise.resolve({ done: true as const, value: undefined });
          }
          index += 1;
          return Promise.resolve({ done: false as const, value: chunk });
        },
      };
    },
  };
}

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

  it('fails closed when either metadata or streamed object bytes are missing', async () => {
    await expect(
      verifyStoredObject(
        {
          head: () => Promise.resolve(undefined),
          get: () => Promise.resolve(stream(new Uint8Array())),
        },
        'missing',
        createHash('sha256').update('').digest('hex'),
        0,
      ),
    ).rejects.toThrow('OBJECT_NOT_FOUND');
    await expect(
      verifyStoredObject(
        {
          head: () =>
            Promise.resolve({
              key: 'missing',
              contentLength: 0,
              contentType: 'text/plain',
              checksumSha256: '',
            }),
          get: () => Promise.resolve(undefined),
        },
        'missing',
        createHash('sha256').update('').digest('hex'),
        0,
      ),
    ).rejects.toThrow('OBJECT_NOT_FOUND');
  });

  it('rejects streamed bytes that exceed the expected bound before hashing completes', async () => {
    await expect(
      verifyStoredObject(
        {
          head: () =>
            Promise.resolve({
              key: 'oversized',
              contentLength: 2,
              contentType: 'text/plain',
              checksumSha256: '',
            }),
          get: () => Promise.resolve(stream(new TextEncoder().encode('ab'))),
        },
        'oversized',
        createHash('sha256').update('a').digest('hex'),
        1,
      ),
    ).rejects.toThrow('OBJECT_SIZE_MISMATCH');
  });

  it('re-verifies an existing immutable primary object without copying it again', async () => {
    const storage = new FakeObjectStorage();
    const body = new TextEncoder().encode('Synthetic clean source.');
    const digest = createHash('sha256').update(body);
    const sha256Hex = digest.copy().digest('hex');
    const sha256Base64 = digest.digest('base64');
    storage.seed({
      key: 'quarantine/source',
      contentLength: body.byteLength,
      contentType: 'text/plain',
      checksumSha256: sha256Base64,
      body,
    });
    storage.seed({
      key: 'sources/source',
      contentLength: body.byteLength,
      contentType: 'text/plain',
      checksumSha256: sha256Base64,
      body,
    });
    await expect(
      promoteQuarantineObject(storage, {
        quarantineKey: 'quarantine/source',
        primaryKey: 'sources/source',
        contentType: 'text/plain',
        sha256Hex,
        sha256Base64,
        byteSize: body.byteLength,
      }),
    ).resolves.toBeUndefined();
  });

  it('requires positive evidence that quarantine deletion succeeded', async () => {
    const body = new TextEncoder().encode('Synthetic clean source.');
    const digest = createHash('sha256').update(body);
    const sha256Hex = digest.copy().digest('hex');
    const sha256Base64 = digest.digest('base64');
    const storage = new FakeObjectStorage();
    storage.seed({
      key: 'quarantine/source',
      contentLength: body.byteLength,
      contentType: 'text/plain',
      checksumSha256: sha256Base64,
      body,
    });
    storage.delete = () => Promise.resolve();
    await expect(
      promoteQuarantineObject(storage, {
        quarantineKey: 'quarantine/source',
        primaryKey: 'sources/source',
        contentType: 'text/plain',
        sha256Hex,
        sha256Base64,
        byteSize: body.byteLength,
      }),
    ).rejects.toThrow('QUARANTINE_DELETE_UNVERIFIED');
  });
});
