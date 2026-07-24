import type { ErrorCode } from '@delivery-os/contracts';

export class ApplicationError extends Error {
  readonly code: ErrorCode;
  readonly correlationId: string;
  readonly currentRevision: number | undefined;

  constructor(input: {
    code: ErrorCode;
    message: string;
    correlationId: string;
    currentRevision?: number;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = 'ApplicationError';
    this.code = input.code;
    this.correlationId = input.correlationId;
    this.currentRevision = input.currentRevision;
  }
}
