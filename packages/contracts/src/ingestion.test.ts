import { describe, expect, it } from 'vitest';

import {
  createSourceUploadSessionCommandSchema,
  normalizedBlockSchema,
  sourceOutboxJobSchema,
  sourceUploadSessionResultSchema,
} from './ingestion';

const ids = {
  workspaceId: '01967b7c-1c80-7000-8000-000000000001',
  projectId: '01967b7c-1c80-7000-8000-000000000002',
  actorId: '01967b7c-1c80-7000-8000-000000000003',
  sourceArtifactId: '01967b7c-1c80-7000-8000-000000000004',
  sourceGenerationId: '01967b7c-1c80-7000-8000-000000000005',
  uploadSessionId: '01967b7c-1c80-7000-8000-000000000006',
  objectManifestId: '01967b7c-1c80-7000-8000-000000000007',
  idempotencyKey: '01967b7c-1c80-7000-8000-000000000008',
};

describe('M3 ingestion contracts', () => {
  it('accepts a constrained upload session and rejects oversized input', () => {
    const command = {
      schemaVersion: '1',
      ...ids,
      expectedRevision: 0,
      correlationId: '57b94b04-4786-453f-8e03-40de8718ad3e',
      command: {
        displayName: 'synthetic-requirements.pdf',
        declaredMediaType: 'application/pdf',
        declaredByteSize: 4096,
        checksumSha256: 'a'.repeat(64),
        checksumSha256Base64: 'YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=',
        audience: 'TEAM_ONLY',
      },
    };
    expect(createSourceUploadSessionCommandSchema.safeParse(command).success).toBe(true);
    expect(
      createSourceUploadSessionCommandSchema.safeParse({
        ...command,
        command: { ...command.command, declaredByteSize: 52_428_801 },
      }).success,
    ).toBe(false);
  });

  it('requires exact locators and never embeds URLs in a normalized block', () => {
    const block = {
      id: '01967b7c-1c80-7000-8000-000000000009',
      normalizedDocumentId: '01967b7c-1c80-7000-8000-000000000010',
      ordinal: 0,
      blockKey: 'b'.repeat(64),
      kind: 'PARAGRAPH',
      text: 'Synthetic requirement.',
      locator: {
        format: 'PDF',
        page: 1,
        polygon: [0, 0, 100, 0, 100, 20, 0, 20],
        textItemRange: [0, 1],
      },
      extraction: 'EMBEDDED_TEXT',
    };
    expect(normalizedBlockSchema.safeParse(block).success).toBe(true);
    expect(
      normalizedBlockSchema.safeParse({
        ...block,
        locator: { ...block.locator, page: 0 },
      }).success,
    ).toBe(false);
  });

  it('keeps signed upload capabilities in a dedicated bounded response', () => {
    expect(
      sourceUploadSessionResultSchema.safeParse({
        schemaVersion: '1',
        sourceArtifactId: ids.sourceArtifactId,
        sourceGenerationId: ids.sourceGenerationId,
        uploadSessionId: ids.uploadSessionId,
        revision: 1,
        state: 'OPEN',
        upload: {
          url: 'https://storage.invalid/generated-key',
          method: 'PUT',
          requiredHeaders: {
            'content-type': 'application/pdf',
            'x-amz-checksum-sha256': 'digest',
          },
          expiresAt: '2026-07-26T12:05:00.000Z',
        },
        correlationId: '57b94b04-4786-453f-8e03-40de8718ad3e',
      }).success,
    ).toBe(true);
  });

  it('carries only IDs and hashes into the retry-safe scan job', () => {
    expect(
      sourceOutboxJobSchema.parse({
        schemaVersion: '1',
        eventId: ids.idempotencyKey,
        eventType: 'source.scan-requested.v1',
        workspaceId: ids.workspaceId,
        projectId: ids.projectId,
        sourceArtifactId: ids.sourceArtifactId,
        sourceGenerationId: ids.sourceGenerationId,
        inputHash: 'a'.repeat(64),
        aggregateRevision: 2,
        correlationId: '57b94b04-4786-453f-8e03-40de8718ad3e',
        occurredAt: '2026-07-26T12:05:00.000Z',
      }),
    ).not.toHaveProperty('text');
  });
});
