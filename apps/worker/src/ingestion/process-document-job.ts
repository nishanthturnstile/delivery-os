import type { DocumentJobClaim, DocumentJobRepository } from '@delivery-os/application';

export interface DocumentJobHandler {
  readonly jobType: DocumentJobClaim['jobType'];
  run(claim: DocumentJobClaim): Promise<void>;
}

export async function processOneDocumentJob(input: {
  repository: DocumentJobRepository;
  handlers: readonly DocumentJobHandler[];
  workerId: string;
}): Promise<boolean> {
  const claim = await input.repository.claim(
    input.workerId,
    input.handlers.map((handler) => handler.jobType),
  );
  if (claim === null) return false;
  const handler = input.handlers.find((candidate) => candidate.jobType === claim.jobType);
  if (handler === undefined) {
    await input.repository.fail(claim, {
      safeErrorCode: 'JOB_HANDLER_UNAVAILABLE',
      retryable: false,
      retryDelaySeconds: 0,
    });
    return true;
  }
  try {
    await handler.run(claim);
    await input.repository.complete(claim);
  } catch (error) {
    const safe = classifyJobError(error);
    await input.repository.fail(claim, safe);
  }
  return true;
}

export function classifyJobError(error: unknown): {
  safeErrorCode: string;
  retryable: boolean;
  retryDelaySeconds: number;
} {
  const code =
    error instanceof Error && /^[A-Z][A-Z0-9_]{2,80}$/u.test(error.message)
      ? error.message
      : 'DOCUMENT_PROCESSING_FAILED';
  const permanent = new Set([
    'MALWARE_DETECTED',
    'ENCRYPTED_DOCUMENT',
    'UNSUPPORTED_MEDIA_TYPE',
    'PARSER_RESOURCE_LIMIT',
    'SOURCE_BINARY_TEXT_REJECTED',
    'SOURCE_INVALID_UTF8',
    'SOURCE_SIGNATURE_MISMATCH',
    'OCR_BLOCK_PROVENANCE_MISMATCH',
    'OCR_CONFIG_MISMATCH',
    'OCR_INPUT_HASH_MISMATCH',
    'OCR_NEEDS_ATTENTION',
    'OCR_PAGE_SET_MISMATCH',
    'OCR_RESPONSE_EMPTY',
    'OCR_UNSUPPORTED_SOURCE_FORMAT',
  ]);
  return {
    safeErrorCode: code,
    retryable: !permanent.has(code),
    retryDelaySeconds: permanent.has(code) ? 0 : 30,
  };
}
