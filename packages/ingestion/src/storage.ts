import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type StoredObjectMetadata = Readonly<{
  key: string;
  contentLength: number;
  contentType: string | undefined;
  checksumSha256: string | undefined;
}>;

export interface ObjectStorage {
  head(key: string): Promise<StoredObjectMetadata | undefined>;
  get(key: string): Promise<AsyncIterable<Uint8Array> | undefined>;
  presignGet(key: string, expiresInSeconds: number): Promise<string>;
  presignPut(
    key: string,
    input: Readonly<{ contentType: string; checksumSha256: string; expiresInSeconds: number }>,
  ): Promise<string>;
  putImmutable(
    key: string,
    input: Readonly<{
      body: Uint8Array;
      contentType: string;
      checksumSha256: string;
    }>,
  ): Promise<void>;
  copyImmutable(
    sourceKey: string,
    destinationKey: string,
    input: Readonly<{ contentType: string; checksumSha256: string }>,
  ): Promise<void>;
  list(prefix: string): Promise<StoredObjectMetadata[]>;
  deleteMany(keys: readonly string[]): Promise<void>;
  createMultipartUpload(
    key: string,
    input: Readonly<{ contentType: string; checksumSha256: string }>,
  ): Promise<string>;
  presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresInSeconds: number,
  ): Promise<string>;
  completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: readonly Readonly<{ partNumber: number; etag: string }>[],
  ): Promise<void>;
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export type S3StorageConfig = Readonly<{
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}>;

export class S3CompatibleStorage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      ...(config.endpoint === undefined ? {} : { endpoint: config.endpoint }),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async head(key: string): Promise<StoredObjectMetadata | undefined> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return {
        key,
        contentLength: response.ContentLength ?? 0,
        contentType: response.ContentType,
        checksumSha256: response.ChecksumSHA256,
      };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        '$metadata' in error &&
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
      ) {
        return undefined;
      }
      throw error;
    }
  }

  async get(key: string): Promise<AsyncIterable<Uint8Array> | undefined> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      const body = response.Body;
      if (body === undefined || !(Symbol.asyncIterator in body)) {
        throw new Error('Object storage returned a non-streaming body.');
      }
      return body as AsyncIterable<Uint8Array>;
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  async presignGet(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  async presignPut(
    key: string,
    input: Readonly<{ contentType: string; checksumSha256: string; expiresInSeconds: number }>,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: input.contentType,
        ChecksumSHA256: input.checksumSha256,
      }),
      {
        expiresIn: input.expiresInSeconds,
        unhoistableHeaders: new Set(['x-amz-checksum-sha256']),
        signableHeaders: new Set(['content-type', 'x-amz-checksum-sha256']),
      },
    );
  }

  async putImmutable(
    key: string,
    input: Readonly<{ body: Uint8Array; contentType: string; checksumSha256: string }>,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: input.body,
        ContentType: input.contentType,
        ChecksumSHA256: input.checksumSha256,
        IfNoneMatch: '*',
      }),
    );
  }

  async copyImmutable(
    sourceKey: string,
    destinationKey: string,
    input: Readonly<{ contentType: string; checksumSha256: string }>,
  ): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.config.bucket,
        Key: destinationKey,
        CopySource: `${this.config.bucket}/${encodeObjectKey(sourceKey)}`,
        ContentType: input.contentType,
        ChecksumAlgorithm: 'SHA256',
        CopySourceIfMatch: undefined,
        MetadataDirective: 'REPLACE',
        Metadata: { sha256: input.checksumSha256 },
        IfNoneMatch: '*',
      }),
    );
  }

  async list(prefix: string): Promise<StoredObjectMetadata[]> {
    const objects: StoredObjectMetadata[] = [];
    let continuationToken: string | undefined;
    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: prefix,
          ...(continuationToken === undefined ? {} : { ContinuationToken: continuationToken }),
        }),
      );
      for (const item of response.Contents ?? []) {
        if (item.Key === undefined) continue;
        const metadata = await this.head(item.Key);
        if (metadata !== undefined) objects.push(metadata);
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken !== undefined);
    return objects;
  }

  async deleteMany(keys: readonly string[]): Promise<void> {
    for (let offset = 0; offset < keys.length; offset += 1_000) {
      const batch = keys.slice(offset, offset + 1_000);
      if (batch.length === 0) continue;
      const response = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.config.bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      if ((response.Errors?.length ?? 0) > 0) {
        throw new Error('Object storage batch deletion did not complete.');
      }
    }
  }

  async createMultipartUpload(
    key: string,
    input: Readonly<{ contentType: string; checksumSha256: string }>,
  ): Promise<string> {
    const response = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: input.contentType,
        ChecksumAlgorithm: 'SHA256',
        Metadata: { sha256: input.checksumSha256 },
      }),
    );
    if (response.UploadId === undefined) throw new Error('Object storage omitted multipart ID.');
    return response.UploadId;
  }

  async presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresInSeconds: number,
  ): Promise<string> {
    if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
      throw new Error('Multipart part number is invalid.');
    }
    return getSignedUrl(
      this.client,
      new UploadPartCommand({
        Bucket: this.config.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: readonly Readonly<{ partNumber: number; etag: string }>[],
  ): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.config.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: [...parts]
            .sort((left, right) => left.partNumber - right.partNumber)
            .map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
        },
      }),
    );
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.config.bucket,
        Key: key,
        UploadId: uploadId,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}

export class FakeObjectStorage implements ObjectStorage {
  private readonly objects = new Map<string, StoredObjectMetadata & { body: Uint8Array }>();
  private readonly multipart = new Map<string, { key: string }>();
  private nextMultipartId = 1;

  seed(metadata: StoredObjectMetadata & { body?: Uint8Array }): void {
    this.objects.set(metadata.key, {
      ...metadata,
      body: metadata.body ?? new Uint8Array(metadata.contentLength),
    });
  }

  async head(key: string): Promise<StoredObjectMetadata | undefined> {
    const stored = this.objects.get(key);
    return Promise.resolve(stored === undefined ? undefined : withoutBody(stored));
  }

  async get(key: string): Promise<AsyncIterable<Uint8Array> | undefined> {
    const stored = this.objects.get(key);
    if (stored === undefined) return Promise.resolve(undefined);
    const body = stored.body;
    return Promise.resolve(singleChunkAsyncIterable(body));
  }

  async presignGet(key: string, expiresInSeconds: number): Promise<string> {
    return Promise.resolve(`fake://get/${encodeURIComponent(key)}?expires=${expiresInSeconds}`);
  }

  async presignPut(
    key: string,
    input: Readonly<{
      contentType: string;
      checksumSha256: string;
      expiresInSeconds: number;
    }>,
  ): Promise<string> {
    void input.contentType;
    void input.checksumSha256;
    return Promise.resolve(
      `fake://put/${encodeURIComponent(key)}?expires=${input.expiresInSeconds}`,
    );
  }

  putImmutable(
    key: string,
    input: Readonly<{ body: Uint8Array; contentType: string; checksumSha256: string }>,
  ): Promise<void> {
    if (this.objects.has(key)) throw new Error('Immutable object key already exists.');
    this.seed({
      key,
      contentLength: input.body.byteLength,
      contentType: input.contentType,
      checksumSha256: input.checksumSha256,
      body: input.body,
    });
    return Promise.resolve();
  }

  copyImmutable(
    sourceKey: string,
    destinationKey: string,
    input: Readonly<{ contentType: string; checksumSha256: string }>,
  ): Promise<void> {
    if (this.objects.has(destinationKey)) throw new Error('Immutable object key already exists.');
    const source = this.objects.get(sourceKey);
    if (source === undefined) throw new Error('Source object was not found.');
    this.seed({
      key: destinationKey,
      contentLength: source.contentLength,
      contentType: input.contentType,
      checksumSha256: input.checksumSha256,
      body: source.body.slice(),
    });
    return Promise.resolve();
  }

  async list(prefix: string): Promise<StoredObjectMetadata[]> {
    return Promise.resolve(
      [...this.objects.values()]
        .filter((item) => item.key.startsWith(prefix))
        .sort((left, right) => left.key.localeCompare(right.key)),
    ).then((items) => items.map(withoutBody));
  }

  async deleteMany(keys: readonly string[]): Promise<void> {
    for (const key of keys) this.objects.delete(key);
    return Promise.resolve();
  }

  async createMultipartUpload(
    key: string,
    input: Readonly<{ contentType: string; checksumSha256: string }>,
  ): Promise<string> {
    void input;
    const uploadId = `fake-multipart-${this.nextMultipartId}`;
    this.nextMultipartId += 1;
    this.multipart.set(uploadId, { key });
    return Promise.resolve(uploadId);
  }

  async presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresInSeconds: number,
  ): Promise<string> {
    if (this.multipart.get(uploadId)?.key !== key)
      throw new Error('Multipart upload was not found.');
    return Promise.resolve(
      `fake://part/${encodeURIComponent(key)}?upload=${encodeURIComponent(uploadId)}&part=${partNumber}&expires=${expiresInSeconds}`,
    );
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: readonly Readonly<{ partNumber: number; etag: string }>[],
  ): Promise<void> {
    void parts;
    if (this.multipart.get(uploadId)?.key !== key)
      throw new Error('Multipart upload was not found.');
    this.multipart.delete(uploadId);
    return Promise.resolve();
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    if (this.multipart.get(uploadId)?.key === key) this.multipart.delete(uploadId);
    return Promise.resolve();
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    '$metadata' in error &&
    (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
  );
}

function encodeObjectKey(key: string): string {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function withoutBody(stored: StoredObjectMetadata & { body: Uint8Array }): StoredObjectMetadata {
  return {
    key: stored.key,
    contentLength: stored.contentLength,
    contentType: stored.contentType,
    checksumSha256: stored.checksumSha256,
  };
}

function singleChunkAsyncIterable(body: Uint8Array): AsyncIterable<Uint8Array> {
  let consumed = false;
  return {
    [Symbol.asyncIterator]() {
      return {
        next() {
          if (consumed) return Promise.resolve({ done: true, value: undefined });
          consumed = true;
          return Promise.resolve({ done: false, value: body });
        },
      };
    },
  };
}
