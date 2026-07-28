import type {
  DocumentJobClaim,
  DocumentJobRepository,
  IngestionCommandStore,
  OcrPageResultStore,
  SourceProcessingStore,
} from '@delivery-os/application';
import type { NormalizedBlockDraft } from '@delivery-os/domain';
import {
  assertPdfNotEncrypted,
  detectSourceFormat,
  inspectBinaryMediaType,
  normalizeParsedDocument,
  ocrResponseToBlocks,
  parseDocx,
  parseMarkdown,
  parsePdf,
  parseText,
  renderPdfPagesForOcr,
  type MalwareScanner,
  type OcrProvider,
  type OcrRecognitionResponse,
} from '@delivery-os/ingestion';
import { v7 as uuidv7 } from 'uuid';

import type { DocumentJobHandler } from './process-document-job';

const MAXIMUM_SOURCE_BYTES = 52_428_800;
const PARSER_VERSION = 'requirement-parser@1';
const RENDERER_VERSION = 'pdfjs-canvas@1:dpi-300';

export type DocumentHandlerDependencies = Readonly<{
  store: SourceProcessingStore & Pick<IngestionCommandStore, 'commitNormalizedDocument'>;
  jobs: DocumentJobRepository;
  scanner: MalwareScanner;
  ocr: OcrProvider;
  ocrResults: OcrPageResultStore;
  ocrModelDigest: string;
  ocrConfigVersion: string;
  ocrMinimumConfidence: number;
  backupEnabled: boolean;
}>;

export function createDocumentJobHandlers(
  dependencies: DocumentHandlerDependencies,
): readonly DocumentJobHandler[] {
  return [
    {
      jobType: 'SCAN',
      run: (claim) => scan(dependencies, claim),
    },
    {
      jobType: 'PARSE',
      run: (claim) => parse(dependencies, claim),
    },
    {
      jobType: 'OCR',
      run: (claim) => recognize(dependencies, claim),
    },
    ...(dependencies.backupEnabled
      ? ([
          {
            jobType: 'BACKUP',
            run: (claim) => backup(dependencies, claim),
          },
          {
            jobType: 'PURGE',
            run: (claim) => purge(dependencies, claim),
          },
        ] satisfies readonly DocumentJobHandler[])
      : []),
  ];
}

async function scan(
  dependencies: DocumentHandlerDependencies,
  claim: DocumentJobClaim,
): Promise<void> {
  const source = await dependencies.store.loadProcessingSource(claim, 'QUARANTINE');
  const body = await dependencies.store.readProcessingObject(source, MAXIMUM_SOURCE_BYTES);
  const detectedFormat = detectSourceFormat(body.subarray(0, 65_536), source.format);
  const detectedMediaType = await inspectBinaryMediaType(
    detectedFormat === 'DOCX' ? body : body.subarray(0, 4_100),
  );
  if (
    (detectedFormat === 'PDF' && detectedMediaType !== 'application/pdf') ||
    (detectedFormat === 'DOCX' &&
      detectedMediaType !==
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
      detectedMediaType !== 'application/zip')
  ) {
    throw new Error('SOURCE_SIGNATURE_MISMATCH');
  }
  if (detectedFormat === 'PDF') assertPdfNotEncrypted(body);
  const malware = await dependencies.scanner.scan(singleChunk(body));
  if (malware !== 'CLEAN') throw new Error('MALWARE_DETECTED');
  const primaryObjectKey = [
    'sources',
    source.workspaceId,
    source.projectId,
    source.sourceArtifactId,
    source.sourceGenerationId,
  ].join('/');
  await dependencies.store.promoteScannedSource(claim, {
    primaryManifestId: uuidv7(),
    primaryObjectKey,
    detectedMediaType: detectedMediaType ?? source.declaredMediaType,
  });
  await dependencies.jobs.enqueue({
    id: uuidv7(),
    workspaceId: claim.workspaceId,
    projectId: claim.projectId,
    sourceArtifactId: claim.sourceArtifactId,
    sourceGenerationId: claim.sourceGenerationId,
    intakeSetId: claim.intakeSetId,
    jobType: 'BACKUP',
    inputHash: claim.inputHash,
    configVersion: 'r2-backup@1',
    correlationId: claim.correlationId,
    maximumAttempts: 5,
  });
  await dependencies.jobs.enqueue({
    id: uuidv7(),
    workspaceId: claim.workspaceId,
    projectId: claim.projectId,
    sourceArtifactId: claim.sourceArtifactId,
    sourceGenerationId: claim.sourceGenerationId,
    intakeSetId: claim.intakeSetId,
    jobType: 'PARSE',
    inputHash: claim.inputHash,
    configVersion: PARSER_VERSION,
    correlationId: claim.correlationId,
  });
}

async function backup(
  dependencies: DocumentHandlerDependencies,
  claim: DocumentJobClaim,
): Promise<void> {
  if (claim.sourceArtifactId === null || claim.sourceGenerationId === null) {
    throw new Error('DOCUMENT_JOB_SOURCE_MISSING');
  }
  await dependencies.store.backupSource(claim, {
    backupManifestId: uuidv7(),
    backupObjectKey: [
      'backups',
      claim.workspaceId,
      claim.projectId,
      claim.sourceArtifactId,
      claim.sourceGenerationId,
    ].join('/'),
  });
}

async function purge(
  dependencies: DocumentHandlerDependencies,
  claim: DocumentJobClaim,
): Promise<void> {
  if (claim.sourceArtifactId === null) throw new Error('DOCUMENT_JOB_SOURCE_MISSING');
  await dependencies.store.purgeSource({
    workspaceId: claim.workspaceId,
    projectId: claim.projectId,
    sourceArtifactId: claim.sourceArtifactId,
    purgeReceiptId: uuidv7(),
    correlationId: claim.correlationId,
  });
}

async function parse(
  dependencies: DocumentHandlerDependencies,
  claim: DocumentJobClaim,
): Promise<void> {
  const source = await dependencies.store.loadProcessingSource(claim, 'PRIMARY');
  const body = await dependencies.store.readProcessingObject(source, MAXIMUM_SOURCE_BYTES);
  const parsed =
    source.format === 'PDF'
      ? await parsePdf(body)
      : source.format === 'DOCX'
        ? await parseDocx(body)
        : source.format === 'MARKDOWN'
          ? parseMarkdown(body)
          : parseText(body);
  if (parsed.ocrPageNumbers.length > 0) {
    await dependencies.jobs.enqueue({
      id: uuidv7(),
      workspaceId: claim.workspaceId,
      projectId: claim.projectId,
      sourceArtifactId: claim.sourceArtifactId,
      sourceGenerationId: claim.sourceGenerationId,
      intakeSetId: claim.intakeSetId,
      jobType: 'OCR',
      inputHash: claim.inputHash,
      configVersion: dependencies.ocrConfigVersion,
      correlationId: claim.correlationId,
    });
    return;
  }
  await commitNormalized(dependencies.store, claim, source.actualSha256, parsed.blocks);
}

async function recognize(
  dependencies: DocumentHandlerDependencies,
  claim: DocumentJobClaim,
): Promise<void> {
  const source = await dependencies.store.loadProcessingSource(claim, 'PRIMARY');
  if (source.format !== 'PDF') throw new Error('OCR_UNSUPPORTED_SOURCE_FORMAT');
  const body = await dependencies.store.readProcessingObject(source, MAXIMUM_SOURCE_BYTES);
  const parsed = await parsePdf(body);
  if (parsed.ocrPageNumbers.length === 0) {
    await commitNormalized(dependencies.store, claim, source.actualSha256, parsed.blocks);
    return;
  }
  const responses: OcrRecognitionResponse[] = [];
  for (let offset = 0; offset < parsed.ocrPageNumbers.length; offset += 10) {
    const pageNumbers = parsed.ocrPageNumbers.slice(offset, offset + 10);
    const batch = await renderPdfPagesForOcr(body, pageNumbers, {
      dpi: 300,
      maximumPixelsPerPage: 20_000_000,
      maximumOutputBytesPerPage: 20_000_000,
    });
    responses.push(
      await dependencies.ocr.recognize({
        schemaVersion: '1',
        sourceGenerationId: source.sourceGenerationId,
        sourceSha256: source.actualSha256,
        rendererVersion: RENDERER_VERSION,
        ocrConfigVersion: dependencies.ocrConfigVersion,
        pages: batch.map((page) => ({
          page: page.page,
          inputHash: page.inputHash,
          imageBase64: Buffer.from(page.image).toString('base64'),
        })),
      }),
    );
  }
  const combined = combineResponses(
    responses,
    dependencies.ocrModelDigest,
    dependencies.ocrConfigVersion,
  );
  const normalizedOcr = ocrResponseToBlocks(combined, dependencies.ocrMinimumConfidence);
  for (const page of combined.pages) {
    const pageResponse = { ...combined, pages: [page] };
    const pageBlocks = ocrResponseToBlocks(pageResponse, dependencies.ocrMinimumConfidence);
    await dependencies.ocrResults.commit({
      id: uuidv7(),
      workspaceId: claim.workspaceId,
      projectId: claim.projectId,
      sourceGenerationId: source.sourceGenerationId,
      pageNumber: page.page,
      inputHash: page.inputHash,
      rendererVersion: RENDERER_VERSION,
      modelVersion: combined.modelVersion,
      modelDigest: combined.modelDigest,
      configVersion: combined.configVersion,
      outputHash: pageBlocks.outputHash,
      minimumConfidence: dependencies.ocrMinimumConfidence.toString(),
      needsAttention: pageBlocks.lowConfidencePages.length > 0,
      result: pageResponse,
    });
  }
  if (normalizedOcr.lowConfidencePages.length > 0) throw new Error('OCR_NEEDS_ATTENTION');
  const blocks = [...parsed.blocks, ...normalizedOcr.blocks]
    .sort(comparePdfBlocks)
    .map((block, ordinal) => ({ ...block, ordinal }));
  await commitNormalized(dependencies.store, claim, source.actualSha256, blocks);
}

async function commitNormalized(
  store: SourceProcessingStore & Pick<IngestionCommandStore, 'commitNormalizedDocument'>,
  claim: DocumentJobClaim,
  sourceSha256: string,
  blocks: readonly NormalizedBlockDraft[],
): Promise<void> {
  if (claim.sourceArtifactId === null || claim.sourceGenerationId === null) {
    throw new Error('DOCUMENT_JOB_SOURCE_MISSING');
  }
  const normalized = normalizeParsedDocument({
    sourceGenerationId: claim.sourceGenerationId,
    sourceSha256,
    parserVersion: PARSER_VERSION,
    rendererVersion: RENDERER_VERSION,
    ocrConfigVersion: claim.jobType === 'OCR' ? claim.configVersion : 'none',
    blocks,
  });
  await store.commitNormalizedDocument({
    normalizedDocumentId: uuidv7(),
    workspaceId: claim.workspaceId,
    projectId: claim.projectId,
    sourceArtifactId: claim.sourceArtifactId,
    sourceGenerationId: claim.sourceGenerationId,
    sourceSha256,
    parserVersion: PARSER_VERSION,
    rendererVersion: RENDERER_VERSION,
    ocrConfigVersion: claim.jobType === 'OCR' ? claim.configVersion : 'none',
    documentHash: normalized.documentHash,
    correlationId: claim.correlationId,
    blocks: normalized.blocks.map((block) => ({
      ...block,
      id: uuidv7(),
      sourceLocatorId: uuidv7(),
    })),
  });
}

function combineResponses(
  responses: readonly OcrRecognitionResponse[],
  modelDigest: string,
  configVersion: string,
): OcrRecognitionResponse {
  const first = responses[0];
  if (first === undefined) throw new Error('OCR_RESPONSE_EMPTY');
  for (const response of responses) {
    if (
      response.modelVersion !== first.modelVersion ||
      response.modelDigest !== modelDigest ||
      response.configVersion !== configVersion
    ) {
      throw new Error('OCR_CONFIG_MISMATCH');
    }
  }
  return {
    schemaVersion: '1',
    modelVersion: first.modelVersion,
    modelDigest: first.modelDigest,
    configVersion,
    pages: responses
      .flatMap((response) => response.pages)
      .sort((left, right) => left.page - right.page),
  };
}

function comparePdfBlocks(left: NormalizedBlockDraft, right: NormalizedBlockDraft): number {
  if (left.locator.format !== 'PDF' || right.locator.format !== 'PDF') return 0;
  return (
    left.locator.page - right.locator.page ||
    (left.locator.polygon[1] ?? 0) - (right.locator.polygon[1] ?? 0) ||
    (left.locator.polygon[0] ?? 0) - (right.locator.polygon[0] ?? 0)
  );
}

function singleChunk(body: Uint8Array): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]() {
      let consumed = false;
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
