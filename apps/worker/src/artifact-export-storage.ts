import { createHash } from 'node:crypto';

import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import type { ArtifactExportStorage } from '@delivery-os/application';

function requiredEnvironment(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value.trim() === '') throw new Error(`MISSING_${name}`);
  return value;
}

function localDefault(name: string, value: string): string | undefined {
  return ['local', 'test'].includes(process.env.APP_ENV ?? 'local') ? value : undefined;
}

export class S3ArtifactExportStorage implements ArtifactExportStorage {
  private readonly bucket = requiredEnvironment(
    'S3_BUCKET',
    localDefault('S3_BUCKET', 'delivery-os'),
  );
  private readonly client = new S3Client({
    region: requiredEnvironment('S3_REGION', localDefault('S3_REGION', 'us-east-1')),
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'false') === 'true',
    ...(process.env.S3_ENDPOINT === undefined ? {} : { endpoint: process.env.S3_ENDPOINT }),
    credentials: {
      accessKeyId: requiredEnvironment(
        'S3_ACCESS_KEY_ID',
        localDefault('S3_ACCESS_KEY_ID', 'delivery_os_local'),
      ),
      secretAccessKey: requiredEnvironment(
        'S3_SECRET_ACCESS_KEY',
        localDefault('S3_SECRET_ACCESS_KEY', 'delivery_os_local_secret'),
      ),
    },
  });

  async putImmutable(input: {
    key: string;
    body: Uint8Array;
    contentType: 'application/json';
    contentHash: string;
  }): Promise<void> {
    const actualHash = createHash('sha256').update(input.body).digest('hex');
    if (actualHash !== input.contentHash) throw new Error('EXPORT_HASH_MISMATCH');
    let existing: HeadObjectCommandOutput | undefined;
    try {
      existing = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: input.key }),
      );
    } catch (error) {
      const status =
        typeof error === 'object' &&
        error !== null &&
        '$metadata' in error &&
        typeof error.$metadata === 'object' &&
        error.$metadata !== null &&
        'httpStatusCode' in error.$metadata
          ? error.$metadata.httpStatusCode
          : undefined;
      if (status !== 404) throw error;
    }
    if (existing !== undefined) {
      if (existing.Metadata?.['content-hash'] !== input.contentHash) {
        throw new Error('EXPORT_IMMUTABLE_KEY_COLLISION');
      }
      return;
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        Metadata: { 'content-hash': input.contentHash },
      }),
    );
  }
}
