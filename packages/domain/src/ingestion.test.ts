import { describe, expect, it } from 'vitest';

import {
  MAX_PROJECT_SOURCE_BYTES,
  MAX_SOURCE_BYTES,
  assertProjectQuota,
  assertSourceByteSize,
  canTransitionDocumentJob,
  canTransitionSourceProcessing,
  canTransitionSourceRetention,
  classifyDeclaredSource,
  createNormalizedBlockKey,
  normalizeExtractedText,
  normalizeSourceDisplayName,
} from './ingestion';

describe('M3 ingestion domain', () => {
  it('accepts only one allowlisted extension matched to its media type', () => {
    expect(classifyDeclaredSource(' synthetic.pdf ', 'application/pdf')).toEqual({
      displayName: 'synthetic.pdf',
      format: 'PDF',
      mediaType: 'application/pdf',
    });
    expect(() => classifyDeclaredSource('source.pdf.exe', 'application/pdf')).toThrow();
    expect(() => classifyDeclaredSource('source.pdf', 'text/plain')).toThrow();
    expect(() => normalizeSourceDisplayName('folder/../')).toThrow();
    expect(() => normalizeSourceDisplayName('source\u0000.pdf')).toThrow();
    expect(
      classifyDeclaredSource(
        'SYNTHETIC.DOCX',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toMatchObject({
      format: 'DOCX',
    });
    expect(classifyDeclaredSource('synthetic.md', 'text/markdown')).toMatchObject({
      format: 'MARKDOWN',
    });
    expect(classifyDeclaredSource('synthetic.txt', 'text/plain')).toMatchObject({ format: 'TEXT' });
    for (const invalid of ['', '.', '..', 'source', '.pdf', 'source.', 'source.tar.pdf']) {
      expect(() => normalizeSourceDisplayName(invalid)).toThrow();
    }
    expect(() => normalizeSourceDisplayName(`source${'x'.repeat(235)}.pdf`)).toThrow();
    expect(() => classifyDeclaredSource('source.csv', 'text/csv')).toThrow();
  });

  it('enforces retained plus reserved project quota atomically at the domain boundary', () => {
    expect(() =>
      assertProjectQuota({
        retainedBytes: MAX_PROJECT_SOURCE_BYTES - 10,
        reservedBytes: 5,
        requestedBytes: 6,
      }),
    ).toThrow(/quota/);
    expect(() =>
      assertProjectQuota({ retainedBytes: 0, reservedBytes: 0, requestedBytes: 1 }),
    ).not.toThrow();
    for (const invalid of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        assertProjectQuota({ retainedBytes: invalid, reservedBytes: 0, requestedBytes: 1 }),
      ).toThrow(/non-negative safe integers/);
    }
    for (const invalid of [0, MAX_SOURCE_BYTES + 1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => assertSourceByteSize(invalid)).toThrow(/file limit/);
    }
    expect(() => assertSourceByteSize(MAX_SOURCE_BYTES)).not.toThrow();
  });

  it('normalizes text and creates deterministic configuration-bound block keys', () => {
    const block = {
      ordinal: 0,
      kind: 'PARAGRAPH' as const,
      text: 'Cafe\u0301\r\nsafe\u0000 text',
      locator: { format: 'TEXT' as const, startLine: 1, endLine: 2 },
      extraction: 'EMBEDDED_TEXT' as const,
    };
    expect(normalizeExtractedText(block.text)).toBe('Café\nsafe text');
    const first = createNormalizedBlockKey({
      sourceGenerationId: 'generation-1',
      parserVersion: 'text@1',
      rendererVersion: 'none',
      ocrConfigVersion: 'none',
      block,
    });
    expect(first).toBe(
      createNormalizedBlockKey({
        sourceGenerationId: 'generation-1',
        parserVersion: 'text@1',
        rendererVersion: 'none',
        ocrConfigVersion: 'none',
        block,
      }),
    );
    expect(first).not.toBe(
      createNormalizedBlockKey({
        sourceGenerationId: 'generation-1',
        parserVersion: 'text@2',
        rendererVersion: 'none',
        ocrConfigVersion: 'none',
        block,
      }),
    );
    expect(() =>
      createNormalizedBlockKey({
        sourceGenerationId: 'generation-1',
        parserVersion: 'text@1',
        rendererVersion: 'none',
        ocrConfigVersion: 'none',
        block: { ...block, text: '\u0000\r\n' },
      }),
    ).toThrow(/cannot be empty/);
    for (const locator of [
      { format: 'PDF' as const, page: 1, polygon: [0, 0, 1, 1] },
      {
        format: 'PDF' as const,
        page: 1,
        polygon: [0, 0, 1, 1],
        textItemRange: [0, 1] as [number, number],
      },
      { format: 'DOCX' as const, headingPath: ['Scope'] },
      {
        format: 'DOCX' as const,
        headingPath: ['Scope'],
        paragraph: 1,
        table: 2,
        row: 3,
        cell: 4,
      },
      { format: 'MARKDOWN' as const, headingPath: ['Scope'], startLine: 1, endLine: 2 },
    ]) {
      expect(
        createNormalizedBlockKey({
          sourceGenerationId: 'generation-1',
          parserVersion: 'parser@1',
          rendererVersion: 'renderer@1',
          ocrConfigVersion: 'ocr@1',
          block: { ...block, locator, confidence: '0.99' },
        }),
      ).toMatch(/^[a-f0-9]{64}$/u);
    }
  });

  it('keeps source, retention, and job transitions explicit', () => {
    expect(canTransitionSourceProcessing('QUEUED', 'SCANNING')).toBe(true);
    expect(canTransitionSourceProcessing('QUEUED', 'SUCCEEDED')).toBe(false);
    expect(canTransitionSourceRetention('ACTIVE', 'RECOVERABLE')).toBe(true);
    expect(canTransitionSourceRetention('ACTIVE', 'PURGED')).toBe(false);
    expect(canTransitionDocumentJob('RUNNING', 'RETRY_WAIT')).toBe(true);
    expect(canTransitionDocumentJob('SUCCEEDED', 'RUNNING')).toBe(false);
    expect(canTransitionSourceProcessing('SCANNING', 'PROCESSING')).toBe(true);
    expect(canTransitionSourceProcessing('PROCESSING', 'NEEDS_ATTENTION')).toBe(true);
    expect(canTransitionSourceProcessing('NEEDS_ATTENTION', 'PROCESSING')).toBe(true);
    expect(canTransitionSourceProcessing('FAILED', 'QUEUED')).toBe(false);
    expect(canTransitionSourceRetention('RECOVERABLE', 'ACTIVE')).toBe(true);
    expect(canTransitionSourceRetention('RECOVERABLE', 'PURGING')).toBe(true);
    expect(canTransitionSourceRetention('PURGING', 'PURGED')).toBe(true);
    expect(canTransitionSourceRetention('PURGED', 'ACTIVE')).toBe(false);
    expect(canTransitionDocumentJob('QUEUED', 'RUNNING')).toBe(true);
    expect(canTransitionDocumentJob('QUEUED', 'CANCELLED')).toBe(true);
    expect(canTransitionDocumentJob('RUNNING', 'SUCCEEDED')).toBe(true);
    expect(canTransitionDocumentJob('RUNNING', 'NEEDS_ATTENTION')).toBe(true);
    expect(canTransitionDocumentJob('RUNNING', 'DEAD_LETTER')).toBe(true);
    expect(canTransitionDocumentJob('RUNNING', 'CANCELLED')).toBe(false);
    expect(canTransitionDocumentJob('RETRY_WAIT', 'RUNNING')).toBe(true);
    expect(canTransitionDocumentJob('RETRY_WAIT', 'CANCELLED')).toBe(true);
    expect(canTransitionDocumentJob('NEEDS_ATTENTION', 'QUEUED')).toBe(true);
    expect(canTransitionDocumentJob('CANCELLED', 'QUEUED')).toBe(false);
  });
});
