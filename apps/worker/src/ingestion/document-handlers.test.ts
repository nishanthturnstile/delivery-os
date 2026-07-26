import { createHash } from 'node:crypto';

import type {
  DocumentJobClaim,
  DocumentJobRepository,
  IngestionCommandStore,
  OcrPageResultStore,
  ProcessingSource,
  SourceProcessingStore,
} from '@delivery-os/application';
import type { MalwareScanner, OcrProvider } from '@delivery-os/ingestion';
import { describe, expect, it, vi } from 'vitest';

import { createDocumentJobHandlers, type DocumentHandlerDependencies } from './document-handlers';

const body = new TextEncoder().encode('Synthetic requirement.\n\nSecond paragraph.');
const digest = createHash('sha256').update(body).digest('hex');
const source: ProcessingSource = {
  workspaceId: 'workspace',
  projectId: 'project',
  sourceArtifactId: 'source',
  sourceGenerationId: 'generation',
  format: 'TEXT',
  declaredMediaType: 'text/plain',
  actualSha256: digest,
  actualByteSize: body.byteLength,
  objectManifestId: 'manifest',
  objectKey: 'quarantine/workspace/project/source/generation',
  audience: 'TEAM_ONLY',
};
const claim: DocumentJobClaim = {
  id: 'job',
  attemptId: 'attempt',
  attemptNumber: 1,
  workspaceId: source.workspaceId,
  projectId: source.projectId,
  sourceArtifactId: source.sourceArtifactId,
  sourceGenerationId: source.sourceGenerationId,
  intakeSetId: null,
  jobType: 'SCAN',
  inputHash: digest,
  configVersion: 'scan@1',
  correlationId: 'correlation',
};

function dependencies(): {
  value: DocumentHandlerDependencies;
  enqueue: ReturnType<typeof vi.fn<DocumentJobRepository['enqueue']>>;
  promote: ReturnType<typeof vi.fn<SourceProcessingStore['promoteScannedSource']>>;
  commit: ReturnType<typeof vi.fn<IngestionCommandStore['commitNormalizedDocument']>>;
} {
  const enqueue = vi.fn<DocumentJobRepository['enqueue']>().mockResolvedValue({
    id: 'next-job',
    replayed: false,
  });
  const promote = vi.fn<SourceProcessingStore['promoteScannedSource']>().mockResolvedValue({
    replayed: false,
  });
  const commit = vi.fn<IngestionCommandStore['commitNormalizedDocument']>().mockResolvedValue({
    normalizedDocumentId: 'document',
    replayed: false,
    blockCount: 2,
  });
  const store: SourceProcessingStore & Pick<IngestionCommandStore, 'commitNormalizedDocument'> = {
    loadProcessingSource: vi.fn().mockResolvedValue(source),
    readProcessingObject: vi.fn().mockResolvedValue(body),
    promoteScannedSource: promote,
    commitNormalizedDocument: commit,
  };
  const jobs: DocumentJobRepository = {
    enqueue,
    claim: vi.fn().mockResolvedValue(null),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue('NEEDS_ATTENTION'),
  };
  const scanner: MalwareScanner = { scan: vi.fn().mockResolvedValue('CLEAN') };
  const ocr: OcrProvider = {
    recognize: vi.fn().mockRejectedValue(new Error('OCR_NOT_EXPECTED')),
  };
  const ocrResults: OcrPageResultStore = {
    commit: vi.fn().mockResolvedValue({ id: 'ocr-result', replayed: false }),
  };
  return {
    value: {
      store,
      jobs,
      scanner,
      ocr,
      ocrResults,
      ocrModelDigest: 'b'.repeat(64),
      ocrConfigVersion: 'a'.repeat(64),
      ocrMinimumConfidence: 0.85,
    },
    enqueue,
    promote,
    commit,
  };
}

describe('M3 document handlers', () => {
  it('scans before immutable promotion and enqueues deterministic parsing', async () => {
    const context = dependencies();
    const handler = createDocumentJobHandlers(context.value).find(
      (candidate) => candidate.jobType === 'SCAN',
    );
    if (handler === undefined) throw new Error('SCAN_HANDLER_MISSING');
    await handler.run(claim);
    expect(context.promote).toHaveBeenCalledWith(
      claim,
      expect.objectContaining({
        primaryObjectKey: 'sources/workspace/project/source/generation',
        detectedMediaType: 'text/plain',
      }),
    );
    expect(context.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: source.workspaceId,
        sourceGenerationId: source.sourceGenerationId,
        jobType: 'PARSE',
        inputHash: digest,
      }),
    );
  });

  it('normalizes a manual text source without invoking OCR', async () => {
    const context = dependencies();
    const handler = createDocumentJobHandlers(context.value).find(
      (candidate) => candidate.jobType === 'PARSE',
    );
    if (handler === undefined) throw new Error('PARSE_HANDLER_MISSING');
    await handler.run({ ...claim, jobType: 'PARSE', configVersion: 'requirement-parser@1' });
    const committed = context.commit.mock.calls[0]?.[0];
    expect(committed?.sourceSha256).toBe(digest);
    expect(committed?.parserVersion).toBe('requirement-parser@1');
    expect(committed?.blocks.some((block) => block.text === 'Synthetic requirement.')).toBe(true);
    expect(context.enqueue).not.toHaveBeenCalled();
  });
});
