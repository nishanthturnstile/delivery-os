import { createHash, randomUUID } from 'node:crypto';

import { S3CompatibleStorage } from '@delivery-os/ingestion/storage';

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') throw new Error(`MISSING_${name}`);
  return value;
}

const storage = new S3CompatibleStorage({
  endpoint: required('S3_ENDPOINT'),
  region: required('S3_REGION'),
  bucket: required('S3_BUCKET'),
  accessKeyId: required('S3_ACCESS_KEY_ID'),
  secretAccessKey: required('S3_SECRET_ACCESS_KEY'),
  forcePathStyle: false,
});
const runId = randomUUID();
const prefix = `synthetic-contract/${runId}`;
const immutableKey = `${prefix}/immutable`;
const copiedKey = `${prefix}/copy`;
const browserKey = `${prefix}/browser-put`;
const body = new TextEncoder().encode('Delivery OS synthetic R2 contract fixture.');
const digestHex = createHash('sha256').update(body).digest('hex');
const digestBase64 = createHash('sha256').update(body).digest('base64');

try {
  await storage.putImmutable(immutableKey, {
    body,
    contentType: 'text/plain',
    checksumSha256: digestBase64,
  });
  const immutable = await storage.head(immutableKey);
  if (immutable?.contentLength !== body.byteLength) throw new Error('R2_HEAD_CONTRACT_FAILED');

  const read = await storage.get(immutableKey);
  if (read === undefined) throw new Error('R2_GET_CONTRACT_FAILED');
  const readHash = createHash('sha256');
  for await (const chunk of read) readHash.update(chunk);
  if (readHash.digest('hex') !== digestHex) throw new Error('R2_HASH_CONTRACT_FAILED');

  await storage.copyImmutable(immutableKey, copiedKey, {
    contentType: 'text/plain',
    checksumSha256: digestHex,
  });
  if ((await storage.head(copiedKey))?.contentLength !== body.byteLength) {
    throw new Error('R2_COPY_CONTRACT_FAILED');
  }

  const signedPut = await storage.presignPut(browserKey, {
    contentType: 'text/plain',
    checksumSha256: digestBase64,
    expiresInSeconds: 60,
  });
  const response = await fetch(signedPut, {
    method: 'PUT',
    body,
    headers: {
      'content-type': 'text/plain',
      'x-amz-checksum-sha256': digestBase64,
    },
  });
  if (!response.ok) {
    const errorBody = await response.text();
    const safeCode = /<Code>([A-Za-z0-9]+)<\/Code>/u.exec(errorBody)?.[1] ?? 'UNKNOWN';
    const signedParameters = [...new URL(signedPut).searchParams.keys()].sort().join(',');
    throw new Error(
      `R2_PRESIGNED_PUT_FAILED_${response.status}_${safeCode}; signedParameters=${signedParameters}`,
    );
  }

  const listed = await storage.list(prefix);
  if (listed.length !== 3) throw new Error('R2_LIST_CONTRACT_FAILED');

  await storage.deleteMany([immutableKey, copiedKey, browserKey]);
  if (
    (await storage.head(immutableKey)) !== undefined ||
    (await storage.head(copiedKey)) !== undefined ||
    (await storage.head(browserKey)) !== undefined
  ) {
    throw new Error('R2_DELETE_CONTRACT_FAILED');
  }
  process.stdout.write(
    'R2 primary supported-subset contract passed: immutable put, full SHA-256 read, head, copy, ' +
      'presigned PUT, list, batch delete, and absence verification.\n',
  );
} finally {
  await storage.deleteMany([immutableKey, copiedKey, browserKey]);
}
