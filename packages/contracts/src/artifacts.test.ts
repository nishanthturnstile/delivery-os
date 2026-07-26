import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import {
  createArtifactCommandSchema,
  decideArtifactApprovalCommandSchema,
  mutateArtifactCommentCommandSchema,
  removeArtifactAttachmentCommandSchema,
  submitArtifactForReviewCommandSchema,
} from './artifacts';

function envelope() {
  return {
    schemaVersion: '1',
    workspaceId: uuidv7(),
    projectId: uuidv7(),
    artifactId: uuidv7(),
    actorId: uuidv7(),
    expectedRevision: 0,
    idempotencyKey: uuidv7(),
    correlationId: uuidv7(),
  };
}

describe('artifact contracts', () => {
  it('accepts a bounded, versioned create command', () => {
    expect(
      createArtifactCommandSchema.parse({
        ...envelope(),
        draftRevisionId: uuidv7(),
        audienceRecordId: uuidv7(),
        command: {
          kind: 'KERNEL_TEST_ARTIFACT',
          schemaVersion: '1',
          policyVersion: '1',
          title: 'Test requirement',
          audience: 'TEAM_ONLY',
          body: { title: 'Test requirement' },
        },
      }).command.kind,
    ).toBe('KERNEL_TEST_ARTIFACT');
  });

  it('requires a comment for negative decisions at the contract boundary', () => {
    expect(() =>
      decideArtifactApprovalCommandSchema.parse({
        ...envelope(),
        requestId: uuidv7(),
        decisionId: uuidv7(),
        command: { slotKey: 'pm', decision: 'REJECT', comment: null },
      }),
    ).toThrow(/human comment/);
  });

  it('rejects oversized bodies', () => {
    expect(() =>
      createArtifactCommandSchema.parse({
        ...envelope(),
        draftRevisionId: uuidv7(),
        audienceRecordId: uuidv7(),
        command: {
          kind: 'KERNEL_TEST_ARTIFACT',
          schemaVersion: '1',
          policyVersion: '1',
          title: 'Too large',
          audience: 'TEAM_ONLY',
          body: { value: 'x'.repeat(262_145) },
        },
      }),
    ).toThrow();
  });

  it('requires explicit child revisions and human removal reasons', () => {
    expect(() =>
      mutateArtifactCommentCommandSchema.parse({
        ...envelope(),
        commentId: uuidv7(),
        expectedCommentRevision: 1,
        command: { action: 'REMOVE', reason: '' },
      }),
    ).toThrow();
    expect(() =>
      removeArtifactAttachmentCommandSchema.parse({
        ...envelope(),
        attachmentId: uuidv7(),
        expectedAttachmentRevision: 1,
        command: { reason: '' },
      }),
    ).toThrow();
  });

  it('rejects client-supplied approval policy slots', () => {
    expect(() =>
      submitArtifactForReviewCommandSchema.parse({
        ...envelope(),
        snapshotId: uuidv7(),
        approvalRequestId: uuidv7(),
        command: {
          approvalSlots: [{ key: 'attacker', role: 'CLIENT_STAKEHOLDER', required: true }],
        },
      }),
    ).toThrow();
  });
});
