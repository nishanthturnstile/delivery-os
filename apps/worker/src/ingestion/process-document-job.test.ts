import type { DocumentJobClaim } from '@delivery-os/application';
import { describe, expect, it, vi } from 'vitest';

import { classifyJobError, processOneDocumentJob } from './process-document-job';

const claim: DocumentJobClaim = {
  id: 'job',
  attemptId: 'attempt',
  attemptNumber: 1,
  workspaceId: 'workspace',
  projectId: 'project',
  sourceArtifactId: null,
  sourceGenerationId: null,
  intakeSetId: 'intake',
  jobType: 'EXTRACT',
  inputHash: 'a'.repeat(64),
  configVersion: 'config',
  correlationId: 'correlation',
};

function repository(selected: DocumentJobClaim | null) {
  return {
    enqueue: vi.fn().mockResolvedValue({ id: 'job', replayed: false }),
    claim: vi.fn().mockResolvedValue(selected),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue('FAILED'),
  };
}

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

  it('returns false without mutations when no database job is claimable', async () => {
    const jobs = repository(null);
    await expect(
      processOneDocumentJob({ repository: jobs, handlers: [], workerId: 'worker' }),
    ).resolves.toBe(false);
    expect(jobs.complete.mock.calls).toHaveLength(0);
    expect(jobs.fail.mock.calls).toHaveLength(0);
  });

  it('fails safely when a claimed job has no configured handler', async () => {
    const jobs = repository(claim);
    await expect(
      processOneDocumentJob({ repository: jobs, handlers: [], workerId: 'worker' }),
    ).resolves.toBe(true);
    expect(jobs.fail.mock.calls[0]).toEqual([
      claim,
      {
        safeErrorCode: 'JOB_HANDLER_UNAVAILABLE',
        retryable: false,
        retryDelaySeconds: 0,
      },
    ]);
  });

  it('completes successful handlers and safely classifies handler failures', async () => {
    const successful = repository(claim);
    await processOneDocumentJob({
      repository: successful,
      handlers: [{ jobType: 'EXTRACT', run: vi.fn().mockResolvedValue(undefined) }],
      workerId: 'worker',
    });
    expect(successful.complete.mock.calls[0]).toEqual([claim]);
    expect(successful.fail.mock.calls).toHaveLength(0);

    const failed = repository(claim);
    await processOneDocumentJob({
      repository: failed,
      handlers: [
        { jobType: 'EXTRACT', run: vi.fn().mockRejectedValue(new Error('PROVIDER_DOWN')) },
      ],
      workerId: 'worker',
    });
    expect(failed.complete.mock.calls).toHaveLength(0);
    expect(failed.fail.mock.calls[0]).toEqual([
      claim,
      {
        safeErrorCode: 'PROVIDER_DOWN',
        retryable: true,
        retryDelaySeconds: 30,
      },
    ]);
  });
});
