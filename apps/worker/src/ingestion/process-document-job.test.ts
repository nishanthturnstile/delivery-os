import { describe, expect, it } from 'vitest';

import { classifyJobError } from './process-document-job';

describe('document job failure classification', () => {
  it.each([
    'MALWARE_DETECTED',
    'ENCRYPTED_DOCUMENT',
    'SOURCE_SIGNATURE_MISMATCH',
    'OCR_NEEDS_ATTENTION',
    'OCR_BLOCK_PROVENANCE_MISMATCH',
  ])('does not retry deterministic or human-attention failure %s', (code) => {
    expect(classifyJobError(new Error(code))).toEqual({
      safeErrorCode: code,
      retryable: false,
      retryDelaySeconds: 0,
    });
  });

  it('retries a safe transient failure without exposing arbitrary error text', () => {
    expect(classifyJobError(new Error('connection contained private details'))).toEqual({
      safeErrorCode: 'DOCUMENT_PROCESSING_FAILED',
      retryable: true,
      retryDelaySeconds: 30,
    });
  });
});
