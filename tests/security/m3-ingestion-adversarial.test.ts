import { validateExtraction } from '@delivery-os/ai';
import {
  REQUIREMENT_TEMPLATE_FIELDS,
  createRequirementArtifactAdapter,
  mergeRequirementTemplate,
} from '@delivery-os/domain';
import {
  PrivateOcrClient,
  assertPdfNotEncrypted,
  assertPrivateScannerConfig,
  detectSourceFormat,
} from '@delivery-os/ingestion';
import { describe, expect, it } from 'vitest';

describe('M3 adversarial boundaries', () => {
  it('rejects spoofed, binary, encrypted, and public-service inputs', () => {
    expect(() => detectSourceFormat(new TextEncoder().encode('%PDF-1.7'), 'DOCX')).toThrow(
      'SOURCE_SIGNATURE_MISMATCH',
    );
    expect(() => detectSourceFormat(Uint8Array.of(0, 1, 2), 'TEXT')).toThrow(
      'SOURCE_BINARY_TEXT_REJECTED',
    );
    expect(() =>
      assertPdfNotEncrypted(new TextEncoder().encode('%PDF-1.7 /Encrypt 9 0 R')),
    ).toThrow('ENCRYPTED_DOCUMENT');
    expect(() =>
      assertPrivateScannerConfig({
        host: '8.8.8.8',
        port: 3310,
        timeoutMs: 1_000,
        maximumBytes: 52_428_800,
      }),
    ).toThrow(/private/u);
    expect(() => new PrivateOcrClient('https://8.8.4.4', 'synthetic-token-0001', 1_000)).toThrow(
      /private/u,
    );
  });

  it('does not allow an extension to replace mandatory controls', () => {
    const mandatory = REQUIREMENT_TEMPLATE_FIELDS[0];
    if (mandatory === undefined) throw new Error('REQUIREMENT_TEMPLATE_EMPTY');
    expect(() =>
      mergeRequirementTemplate({
        optionalFields: [
          {
            ...mandatory,
            system: false,
            mandatory: false,
          },
        ],
        applicabilityOverrides: {},
      }),
    ).toThrow(/already exists/u);
  });

  it('removes Team-only fields from client projections and rejects executable AI output', () => {
    const adapter = createRequirementArtifactAdapter({ externalProject: true });
    const projected = adapter.projectAudience(
      {
        templateSnapshotId: 'snapshot',
        templateHash: 'a'.repeat(64),
        fields: [
          {
            key: 'problem_summary',
            value: 'Synthetic client-safe statement',
            state: 'RESOLVED',
            audience: 'CLIENT_VISIBLE',
            citationIds: [],
            humanNote: null,
            riskOwnerId: null,
            riskReviewDate: null,
          },
          {
            key: 'known_risks',
            value: 'Synthetic private statement',
            state: 'RESOLVED',
            audience: 'TEAM_ONLY',
            citationIds: [],
            humanNote: null,
            riskOwnerId: null,
            riskReviewDate: null,
          },
        ],
      },
      'CLIENT_VISIBLE',
    );
    expect(JSON.stringify(projected)).not.toContain('known_risks');
    expect(() =>
      validateExtraction(
        {
          schemaVersion: '1',
          intakeSetId: 'intake',
          templateHash: 'a'.repeat(64),
          workflowConfigHash: 'b'.repeat(64),
          blocks: [],
        },
        { schemaVersion: '1', claims: [], questions: [], approve: true },
      ),
    ).toThrow();
  });
});
