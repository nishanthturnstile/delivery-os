import type {
  CancelSourceUploadSessionCommand,
  CompleteSourceUploadSessionCommand,
  CreateSourceUploadSessionCommand,
  MutateSourceRetentionCommand,
  SourceArtifact,
  SourceDownloadResult,
  SourceMutationResult,
  SourceLocator,
  SourceUploadSessionResult,
} from '@delivery-os/contracts';

export type SourceObjectMetadata = Readonly<{
  key: string;
  contentLength: number;
  contentType: string | undefined;
  checksumSha256: string | undefined;
}>;

export interface SourceUploadStorageGateway {
  head(key: string): Promise<SourceObjectMetadata | undefined>;
  get(key: string): Promise<AsyncIterable<Uint8Array> | undefined>;
  presignPut(
    key: string,
    input: Readonly<{
      contentType: string;
      checksumSha256: string;
      expiresInSeconds: number;
    }>,
  ): Promise<string>;
  presignGet(key: string, expiresInSeconds: number): Promise<string>;
  list(prefix: string): Promise<SourceObjectMetadata[]>;
  copyImmutable(
    sourceKey: string,
    destinationKey: string,
    input: Readonly<{ contentType: string; checksumSha256: string }>,
  ): Promise<void>;
  putImmutable(
    key: string,
    input: Readonly<{ body: Uint8Array; contentType: string; checksumSha256: string }>,
  ): Promise<void>;
  deleteMany(keys: readonly string[]): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface IngestionCommandStore {
  createUploadSession(
    command: CreateSourceUploadSessionCommand,
  ): Promise<SourceUploadSessionResult>;
  completeUploadSession(
    command: CompleteSourceUploadSessionCommand,
  ): Promise<SourceUploadSessionResult>;
  cancelUploadSession(
    command: CancelSourceUploadSessionCommand,
  ): Promise<SourceUploadSessionResult>;
  mutateRetention(command: MutateSourceRetentionCommand): Promise<SourceMutationResult>;
  purgeSource(input: {
    workspaceId: string;
    projectId: string;
    sourceArtifactId: string;
    purgeReceiptId: string;
    correlationId: string;
  }): Promise<{ purged: boolean; manifestCount: number }>;
  backupSource(
    claim: DocumentJobClaim,
    input: { backupManifestId: string; backupObjectKey: string },
  ): Promise<{ replayed: boolean }>;
  commitNormalizedDocument(input: NormalizedDocumentCommitInput): Promise<{
    normalizedDocumentId: string;
    replayed: boolean;
    blockCount: number;
  }>;
}

export type NormalizedDocumentCommitInput = Readonly<{
  normalizedDocumentId: string;
  workspaceId: string;
  projectId: string;
  sourceArtifactId: string;
  sourceGenerationId: string;
  sourceSha256: string;
  parserVersion: string;
  rendererVersion: string;
  ocrConfigVersion: string;
  documentHash: string;
  correlationId: string;
  blocks: readonly Readonly<{
    id: string;
    sourceLocatorId: string;
    ordinal: number;
    blockKey: string;
    kind: 'HEADING' | 'PARAGRAPH' | 'LIST_ITEM' | 'TABLE_CELL';
    text: string;
    locator: SourceLocator;
    extraction: 'EMBEDDED_TEXT' | 'OCR';
    confidence?: string;
  }>[];
}>;

export interface IngestionQueryStore {
  listSources(actorId: string, workspaceId: string, projectId: string): Promise<SourceArtifact[]>;
  getSource(
    actorId: string,
    workspaceId: string,
    projectId: string,
    sourceArtifactId: string,
  ): Promise<SourceArtifact>;
  issueDownload(
    actorId: string,
    workspaceId: string,
    projectId: string,
    sourceArtifactId: string,
    correlationId: string,
  ): Promise<SourceDownloadResult>;
}

export type DocumentJobClaim = Readonly<{
  id: string;
  attemptId: string;
  attemptNumber: number;
  workspaceId: string;
  projectId: string;
  sourceArtifactId: string | null;
  sourceGenerationId: string | null;
  intakeSetId: string | null;
  jobType: 'SCAN' | 'PARSE' | 'OCR' | 'EXTRACT' | 'BACKUP' | 'PURGE';
  inputHash: string;
  configVersion: string;
  correlationId: string;
}>;

export interface DocumentJobRepository {
  enqueue(input: {
    id: string;
    workspaceId: string;
    projectId: string;
    sourceArtifactId: string | null;
    sourceGenerationId: string | null;
    intakeSetId: string | null;
    jobType: DocumentJobClaim['jobType'];
    inputHash: string;
    configVersion: string;
    correlationId: string;
    maximumAttempts?: number;
    availableAt?: Date;
  }): Promise<{ id: string; replayed: boolean }>;
  claim(
    workerId: string,
    jobTypes: readonly DocumentJobClaim['jobType'][],
  ): Promise<DocumentJobClaim | null>;
  complete(claim: DocumentJobClaim): Promise<void>;
  fail(
    claim: DocumentJobClaim,
    input: { safeErrorCode: string; retryable: boolean; retryDelaySeconds: number },
  ): Promise<'RETRY_WAIT' | 'NEEDS_ATTENTION' | 'DEAD_LETTER'>;
}

export interface OcrPageResultStore {
  commit(input: {
    id: string;
    workspaceId: string;
    projectId: string;
    sourceGenerationId: string;
    pageNumber: number;
    inputHash: string;
    rendererVersion: string;
    modelVersion: string;
    modelDigest: string;
    configVersion: string;
    outputHash: string;
    minimumConfidence: string;
    needsAttention: boolean;
    result: unknown;
  }): Promise<{ id: string; replayed: boolean }>;
}

export type ProcessingSource = Readonly<{
  workspaceId: string;
  projectId: string;
  sourceArtifactId: string;
  sourceGenerationId: string;
  format: 'PDF' | 'DOCX' | 'MARKDOWN' | 'TEXT';
  declaredMediaType: string;
  actualSha256: string;
  actualByteSize: number;
  objectManifestId: string;
  objectKey: string;
  audience: 'TEAM_ONLY' | 'CLIENT_VISIBLE';
}>;

export interface SourceProcessingStore {
  loadProcessingSource(
    claim: DocumentJobClaim,
    purpose: 'QUARANTINE' | 'PRIMARY',
  ): Promise<ProcessingSource>;
  readProcessingObject(source: ProcessingSource, maximumBytes: number): Promise<Uint8Array>;
  promoteScannedSource(
    claim: DocumentJobClaim,
    input: { primaryManifestId: string; primaryObjectKey: string; detectedMediaType: string },
  ): Promise<{ replayed: boolean }>;
  backupSource(
    claim: DocumentJobClaim,
    input: { backupManifestId: string; backupObjectKey: string },
  ): Promise<{ replayed: boolean }>;
  purgeSource(input: {
    workspaceId: string;
    projectId: string;
    sourceArtifactId: string;
    purgeReceiptId: string;
    correlationId: string;
  }): Promise<{ purged: boolean; manifestCount: number }>;
}
