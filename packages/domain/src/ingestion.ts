import { createHash } from 'node:crypto';

export type SourceFormat = 'PDF' | 'DOCX' | 'MARKDOWN' | 'TEXT';
export type SourceProcessingState =
  'QUEUED' | 'SCANNING' | 'PROCESSING' | 'SUCCEEDED' | 'NEEDS_ATTENTION' | 'FAILED';
export type SourceRetentionState = 'ACTIVE' | 'RECOVERABLE' | 'PURGING' | 'PURGED';
export type DocumentJobState =
  | 'QUEUED'
  | 'RUNNING'
  | 'RETRY_WAIT'
  | 'SUCCEEDED'
  | 'NEEDS_ATTENTION'
  | 'DEAD_LETTER'
  | 'CANCELLED';

export type SourceLocator =
  | { format: 'PDF'; page: number; polygon: number[]; textItemRange?: [number, number] }
  | {
      format: 'DOCX';
      headingPath: string[];
      paragraph?: number;
      table?: number;
      row?: number;
      cell?: number;
    }
  | { format: 'MARKDOWN'; headingPath: string[]; startLine: number; endLine: number }
  | { format: 'TEXT'; startLine: number; endLine: number };

export interface NormalizedBlockDraft {
  ordinal: number;
  kind: 'HEADING' | 'PARAGRAPH' | 'LIST_ITEM' | 'TABLE_CELL';
  text: string;
  locator: SourceLocator;
  extraction: 'EMBEDDED_TEXT' | 'OCR';
  confidence?: string;
}

const formatByExtension: Record<string, { format: SourceFormat; mediaType: string }> = {
  pdf: { format: 'PDF', mediaType: 'application/pdf' },
  docx: {
    format: 'DOCX',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  md: { format: 'MARKDOWN', mediaType: 'text/markdown' },
  txt: { format: 'TEXT', mediaType: 'text/plain' },
};

export const MAX_SOURCE_BYTES = 52_428_800;
export const MAX_PROJECT_SOURCE_BYTES = 524_288_000;

export function normalizeSourceDisplayName(value: string): string {
  const normalized = value.normalize('NFC').replaceAll('\\', '/').split('/').at(-1)?.trim() ?? '';
  const containsControlCharacter = Array.from(normalized).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
  if (
    normalized.length < 1 ||
    normalized.length > 240 ||
    containsControlCharacter ||
    normalized === '.' ||
    normalized === '..'
  ) {
    throw new Error('Source display name is invalid.');
  }
  const segments = normalized.split('.');
  if (segments.length !== 2 || segments.some((segment) => segment.length === 0)) {
    throw new Error('Source display name must have one supported extension.');
  }
  return normalized;
}

export function classifyDeclaredSource(
  displayName: string,
  declaredMediaType: string,
): { displayName: string; format: SourceFormat; mediaType: string } {
  const normalizedName = normalizeSourceDisplayName(displayName);
  const extension = normalizedName.slice(normalizedName.lastIndexOf('.') + 1).toLowerCase();
  const expected = formatByExtension[extension];
  if (expected?.mediaType !== declaredMediaType) {
    throw new Error('Source extension and declared media type are not an allowed pair.');
  }
  return { displayName: normalizedName, ...expected };
}

export function assertSourceByteSize(byteSize: number): void {
  if (!Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > MAX_SOURCE_BYTES) {
    throw new Error('Source byte size exceeds the pilot file limit.');
  }
}

export function assertProjectQuota(input: {
  retainedBytes: number;
  reservedBytes: number;
  requestedBytes: number;
}): void {
  const values = [input.retainedBytes, input.reservedBytes, input.requestedBytes];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error('Project source quota values must be non-negative safe integers.');
  }
  assertSourceByteSize(input.requestedBytes);
  if (input.retainedBytes + input.reservedBytes + input.requestedBytes > MAX_PROJECT_SOURCE_BYTES) {
    throw new Error('Project retained source quota would be exceeded.');
  }
}

export function normalizeExtractedText(value: string): string {
  const normalized = value.normalize('NFC').replace(/\r\n?/gu, '\n');
  return Array.from(normalized)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint === 9 || codePoint === 10 || codePoint >= 32;
    })
    .join('')
    .trim();
}

function canonicalLocator(locator: SourceLocator): string {
  if (locator.format === 'PDF') {
    return JSON.stringify({
      format: locator.format,
      page: locator.page,
      polygon: locator.polygon,
      ...(locator.textItemRange === undefined ? {} : { textItemRange: locator.textItemRange }),
    });
  }
  if (locator.format === 'DOCX') {
    return JSON.stringify({
      format: locator.format,
      headingPath: locator.headingPath,
      ...(locator.paragraph === undefined ? {} : { paragraph: locator.paragraph }),
      ...(locator.table === undefined ? {} : { table: locator.table }),
      ...(locator.row === undefined ? {} : { row: locator.row }),
      ...(locator.cell === undefined ? {} : { cell: locator.cell }),
    });
  }
  return JSON.stringify(locator);
}

export function createNormalizedBlockKey(input: {
  sourceGenerationId: string;
  parserVersion: string;
  rendererVersion: string;
  ocrConfigVersion: string;
  block: NormalizedBlockDraft;
}): string {
  const normalizedText = normalizeExtractedText(input.block.text);
  if (normalizedText.length === 0) throw new Error('Normalized blocks cannot be empty.');
  const material = [
    input.sourceGenerationId,
    input.parserVersion,
    input.rendererVersion,
    input.ocrConfigVersion,
    String(input.block.ordinal),
    input.block.kind,
    input.block.extraction,
    input.block.confidence ?? '',
    canonicalLocator(input.block.locator),
    normalizedText,
  ].join('\u001f');
  return createHash('sha256').update(material, 'utf8').digest('hex');
}

const processingTransitions: Record<SourceProcessingState, readonly SourceProcessingState[]> = {
  QUEUED: ['SCANNING', 'FAILED'],
  SCANNING: ['PROCESSING', 'FAILED'],
  PROCESSING: ['SUCCEEDED', 'NEEDS_ATTENTION', 'FAILED'],
  SUCCEEDED: [],
  NEEDS_ATTENTION: ['PROCESSING', 'FAILED'],
  FAILED: [],
};

export function canTransitionSourceProcessing(
  from: SourceProcessingState,
  to: SourceProcessingState,
): boolean {
  return processingTransitions[from].includes(to);
}

export function canTransitionSourceRetention(
  from: SourceRetentionState,
  to: SourceRetentionState,
): boolean {
  return (
    (from === 'ACTIVE' && to === 'RECOVERABLE') ||
    (from === 'RECOVERABLE' && (to === 'ACTIVE' || to === 'PURGING')) ||
    (from === 'PURGING' && to === 'PURGED')
  );
}

export function canTransitionDocumentJob(from: DocumentJobState, to: DocumentJobState): boolean {
  if (from === 'QUEUED') return to === 'RUNNING' || to === 'CANCELLED';
  if (from === 'RUNNING') {
    return ['SUCCEEDED', 'RETRY_WAIT', 'NEEDS_ATTENTION', 'DEAD_LETTER'].includes(to);
  }
  if (from === 'RETRY_WAIT') return to === 'RUNNING' || to === 'CANCELLED';
  if (from === 'NEEDS_ATTENTION') return to === 'QUEUED';
  return false;
}
