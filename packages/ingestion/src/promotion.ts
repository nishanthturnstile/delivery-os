import { createHash } from 'node:crypto';

import type { ObjectStorage } from './storage';

export async function promoteQuarantineObject(
  storage: ObjectStorage,
  input: Readonly<{
    quarantineKey: string;
    primaryKey: string;
    contentType: string;
    sha256Hex: string;
    sha256Base64: string;
    byteSize: number;
  }>,
): Promise<void> {
  const existing = await storage.head(input.primaryKey);
  if (existing === undefined) {
    await storage.copyImmutable(input.quarantineKey, input.primaryKey, {
      contentType: input.contentType,
      checksumSha256: input.sha256Base64,
    });
  }
  await verifyStoredObject(storage, input.primaryKey, input.sha256Hex, input.byteSize);
  await storage.delete(input.quarantineKey);
  if ((await storage.head(input.quarantineKey)) !== undefined) {
    throw new Error('QUARANTINE_DELETE_UNVERIFIED');
  }
}

export async function verifyStoredObject(
  storage: Pick<ObjectStorage, 'head' | 'get'>,
  key: string,
  expectedSha256Hex: string,
  expectedByteSize: number,
): Promise<void> {
  const metadata = await storage.head(key);
  const stream = await storage.get(key);
  if (metadata === undefined || stream === undefined) throw new Error('OBJECT_NOT_FOUND');
  const hash = createHash('sha256');
  let byteSize = 0;
  for await (const chunk of stream) {
    byteSize += chunk.byteLength;
    if (byteSize > expectedByteSize) throw new Error('OBJECT_SIZE_MISMATCH');
    hash.update(chunk);
  }
  if (
    metadata.contentLength !== expectedByteSize ||
    byteSize !== expectedByteSize ||
    hash.digest('hex') !== expectedSha256Hex
  ) {
    throw new Error('OBJECT_HASH_MISMATCH');
  }
}
