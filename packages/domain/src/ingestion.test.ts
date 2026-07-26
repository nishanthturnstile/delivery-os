import { describe, expect, it } from 'vitest';

import {
  MAX_PROJECT_SOURCE_BYTES,
  assertProjectQuota,
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
  });

  it('keeps source, retention, and job transitions explicit', () => {
    expect(canTransitionSourceProcessing('QUEUED', 'SCANNING')).toBe(true);
    expect(canTransitionSourceProcessing('QUEUED', 'SUCCEEDED')).toBe(false);
    expect(canTransitionSourceRetention('ACTIVE', 'RECOVERABLE')).toBe(true);
    expect(canTransitionSourceRetention('ACTIVE', 'PURGED')).toBe(false);
    expect(canTransitionDocumentJob('RUNNING', 'RETRY_WAIT')).toBe(true);
    expect(canTransitionDocumentJob('SUCCEEDED', 'RUNNING')).toBe(false);
  });
});
