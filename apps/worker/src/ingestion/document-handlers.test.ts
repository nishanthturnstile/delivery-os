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
  load: ReturnType<typeof vi.fn<SourceProcessingStore['loadProcessingSource']>>;
  read: ReturnType<typeof vi.fn<SourceProcessingStore['readProcessingObject']>>;
  scan: ReturnType<typeof vi.fn<MalwareScanner['scan']>>;
  recognize: ReturnType<typeof vi.fn<OcrProvider['recognize']>>;
  commitOcr: ReturnType<typeof vi.fn<OcrPageResultStore['commit']>>;
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
  const load = vi.fn<SourceProcessingStore['loadProcessingSource']>().mockResolvedValue(source);
  const read = vi.fn<SourceProcessingStore['readProcessingObject']>().mockResolvedValue(body);
  const store: SourceProcessingStore & Pick<IngestionCommandStore, 'commitNormalizedDocument'> = {
    loadProcessingSource: load,
    readProcessingObject: read,
    promoteScannedSource: promote,
    commitNormalizedDocument: commit,
  };
  const jobs: DocumentJobRepository = {
    enqueue,
    claim: vi.fn().mockResolvedValue(null),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue('NEEDS_ATTENTION'),
  };
  const scan = vi.fn<MalwareScanner['scan']>().mockResolvedValue('CLEAN');
  const scanner: MalwareScanner = { scan };
  const recognize = vi
    .fn<OcrProvider['recognize']>()
    .mockRejectedValue(new Error('OCR_NOT_EXPECTED'));
  const ocr: OcrProvider = { recognize };
  const commitOcr = vi.fn<OcrPageResultStore['commit']>().mockResolvedValue({
    id: 'ocr-result',
    replayed: false,
  });
  const ocrResults: OcrPageResultStore = {
    commit: commitOcr,
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
    load,
    read,
    scan,
    recognize,
    commitOcr,
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

  it('fails infected content before promotion', async () => {
    const context = dependencies();
    context.scan.mockResolvedValue('INFECTED');
    const handler = createDocumentJobHandlers(context.value).find(
      (candidate) => candidate.jobType === 'SCAN',
    );
    if (handler === undefined) throw new Error('SCAN_HANDLER_MISSING');
    await expect(handler.run(claim)).rejects.toThrow('MALWARE_DETECTED');
    expect(context.promote).not.toHaveBeenCalled();
    expect(context.enqueue).not.toHaveBeenCalled();
  });

  it('parses Markdown and rejects a missing retry-stable source identity', async () => {
    const context = dependencies();
    const markdownBody = new TextEncoder().encode('# Synthetic\n\nRequirement evidence.');
    context.load.mockResolvedValue({
      ...source,
      format: 'MARKDOWN',
      actualSha256: createHash('sha256').update(markdownBody).digest('hex'),
      actualByteSize: markdownBody.byteLength,
    });
    context.read.mockResolvedValue(markdownBody);
    const handler = createDocumentJobHandlers(context.value).find(
      (candidate) => candidate.jobType === 'PARSE',
    );
    if (handler === undefined) throw new Error('PARSE_HANDLER_MISSING');
    await handler.run({ ...claim, jobType: 'PARSE' });
    expect(
      context.commit.mock.calls[0]?.[0].blocks.some((block) => block.text === 'Synthetic'),
    ).toBe(true);
    await expect(
      handler.run({
        ...claim,
        jobType: 'PARSE',
        sourceArtifactId: null,
        sourceGenerationId: null,
      }),
    ).rejects.toThrow('DOCUMENT_JOB_SOURCE_MISSING');
  });

  it('rejects OCR for non-PDF sources and bypasses OCR for searchable PDFs', async () => {
    const context = dependencies();
    const handler = createDocumentJobHandlers(context.value).find(
      (candidate) => candidate.jobType === 'OCR',
    );
    if (handler === undefined) throw new Error('OCR_HANDLER_MISSING');
    await expect(handler.run({ ...claim, jobType: 'OCR' })).rejects.toThrow(
      'OCR_UNSUPPORTED_SOURCE_FORMAT',
    );

    const pdf = buildPdf('Synthetic searchable requirement');
    context.load.mockResolvedValue({
      ...source,
      format: 'PDF',
      actualSha256: createHash('sha256').update(pdf).digest('hex'),
      actualByteSize: pdf.byteLength,
    });
    context.read.mockResolvedValue(pdf);
    await handler.run({ ...claim, jobType: 'OCR', configVersion: 'a'.repeat(64) });
    expect(context.commit).toHaveBeenCalled();
    expect(context.recognize).not.toHaveBeenCalled();
  });

  it('renders image-only PDF pages, validates OCR provenance, and commits page evidence', async () => {
    const context = dependencies();
    const pdf = buildPdf('');
    context.load.mockResolvedValue({
      ...source,
      format: 'PDF',
      actualSha256: createHash('sha256').update(pdf).digest('hex'),
      actualByteSize: pdf.byteLength,
    });
    context.read.mockResolvedValue(pdf);
    context.recognize.mockImplementation((request) =>
      Promise.resolve({
        schemaVersion: '1',
        modelVersion: 'PP-StructureV3@paddleocr-3.7.0',
        modelDigest: context.value.ocrModelDigest,
        configVersion: context.value.ocrConfigVersion,
        pages: request.pages.map((page) => ({
          page: page.page,
          inputHash: page.inputHash,
          blocks: [
            {
              page: page.page,
              polygon: [0, 0, 100, 0, 100, 20, 0, 20],
              text: 'Synthetic OCR evidence.',
              confidence: 0.99,
              readingOrder: 0,
              kind: 'PARAGRAPH',
              inputHash: page.inputHash,
            },
          ],
        })),
      }),
    );
    const handler = createDocumentJobHandlers(context.value).find(
      (candidate) => candidate.jobType === 'OCR',
    );
    if (handler === undefined) throw new Error('OCR_HANDLER_MISSING');
    await handler.run({ ...claim, jobType: 'OCR', configVersion: context.value.ocrConfigVersion });
    expect(context.recognize).toHaveBeenCalledOnce();
    expect(context.commitOcr).toHaveBeenCalledWith(
      expect.objectContaining({ needsAttention: false, pageNumber: 1 }),
    );
    expect(context.commit.mock.calls[0]?.[0]).toMatchObject({
      ocrConfigVersion: context.value.ocrConfigVersion,
    });
    expect(
      context.commit.mock.calls[0]?.[0].blocks.some(
        (block) => block.text === 'Synthetic OCR evidence.',
      ),
    ).toBe(true);
  });

  it('stops on low-confidence OCR and on mismatched model configuration', async () => {
    const context = dependencies();
    const pdf = buildPdf('');
    context.load.mockResolvedValue({
      ...source,
      format: 'PDF',
      actualSha256: createHash('sha256').update(pdf).digest('hex'),
      actualByteSize: pdf.byteLength,
    });
    context.read.mockResolvedValue(pdf);
    context.recognize.mockImplementation((request) =>
      Promise.resolve({
        schemaVersion: '1',
        modelVersion: 'PP-StructureV3@paddleocr-3.7.0',
        modelDigest: context.value.ocrModelDigest,
        configVersion: context.value.ocrConfigVersion,
        pages: request.pages.map((page) => ({
          page: page.page,
          inputHash: page.inputHash,
          blocks: [
            {
              page: page.page,
              polygon: [0, 0, 100, 0, 100, 20, 0, 20],
              text: 'Synthetic low-confidence evidence.',
              confidence: 0.2,
              readingOrder: 0,
              kind: 'PARAGRAPH',
              inputHash: page.inputHash,
            },
          ],
        })),
      }),
    );
    const handler = createDocumentJobHandlers(context.value).find(
      (candidate) => candidate.jobType === 'OCR',
    );
    if (handler === undefined) throw new Error('OCR_HANDLER_MISSING');
    await expect(
      handler.run({ ...claim, jobType: 'OCR', configVersion: context.value.ocrConfigVersion }),
    ).rejects.toThrow('OCR_NEEDS_ATTENTION');

    context.recognize.mockImplementation((request) =>
      Promise.resolve({
        schemaVersion: '1',
        modelVersion: 'PP-StructureV3@paddleocr-3.7.0',
        modelDigest: 'f'.repeat(64),
        configVersion: context.value.ocrConfigVersion,
        pages: request.pages.map((page) => ({
          page: page.page,
          inputHash: page.inputHash,
          blocks: [],
        })),
      }),
    );
    await expect(
      handler.run({ ...claim, jobType: 'OCR', configVersion: context.value.ocrConfigVersion }),
    ).rejects.toThrow('OCR_CONFIG_MISMATCH');
  });
});

function buildPdf(value: string): Uint8Array {
  const encoder = new TextEncoder();
  const stream =
    value.length === 0 ? '' : `BT /F1 18 Tf 72 720 Td (${value.replaceAll(/[()\\]/gu, '')}) Tj ET`;
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(encoder.encode(pdf).byteLength);
    pdf += `${object}\n`;
  }
  const xref = encoder.encode(pdf).byteLength;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return encoder.encode(pdf);
}
