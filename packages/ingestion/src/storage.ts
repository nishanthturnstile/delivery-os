import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
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
  presignGet(key: string, expiresInSeconds: number): Promise<string>;
  presignPut(
    key: string,
    input: Readonly<{ contentType: string; checksumSha256: string; expiresInSeconds: number }>,
  ): Promise<string>;
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
      { expiresIn: input.expiresInSeconds },
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}

export class FakeObjectStorage implements ObjectStorage {
  private readonly objects = new Map<string, StoredObjectMetadata>();

  seed(metadata: StoredObjectMetadata): void {
    this.objects.set(metadata.key, metadata);
  }

  async head(key: string): Promise<StoredObjectMetadata | undefined> {
    return Promise.resolve(this.objects.get(key));
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

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
}
