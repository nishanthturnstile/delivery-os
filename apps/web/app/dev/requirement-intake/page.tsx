import { REQUIREMENT_TEMPLATE_FIELDS } from '@delivery-os/domain';

import { RequirementWorkspace } from '../../workspaces/[workspaceId]/projects/[projectId]/requirements/requirement-workspace';

const workspaceId = '019d0000-0000-7000-8000-000000000301';
const projectId = '019d0000-0000-7000-8000-000000000302';
const artifactId = '019d0000-0000-7000-8000-000000000303';
const draftId = '019d0000-0000-7000-8000-000000000304';
const now = '2026-07-26T00:00:00.000Z';
const body = {
  templateSnapshotId: '019d0000-0000-7000-8000-000000000305',
  templateHash: 'a'.repeat(64),
  fields: REQUIREMENT_TEMPLATE_FIELDS.map((field) => ({
    key: field.key,
    value:
      field.key === 'project_name'
        ? 'Synthetic pilot'
        : field.key === 'project_type'
          ? 'INTERNAL'
          : null,
    state:
      field.key === 'project_name' || field.key === 'project_type'
        ? ('RESOLVED' as const)
        : ('UNRESOLVED' as const),
    audience: field.key === 'known_risks' ? ('TEAM_ONLY' as const) : ('CLIENT_VISIBLE' as const),
    citationIds: [],
    humanNote: null,
    riskOwnerId: null,
    riskReviewDate: null,
  })),
};

export default function SyntheticRequirementIntakePage() {
  return (
    <RequirementWorkspace
      actorId="019d2871-50f5-7b20-8000-000000000001"
      artifact={{
        id: artifactId,
        workspaceId,
        projectId,
        kind: 'REQUIREMENT',
        schemaVersion: '1',
        policyVersion: '1',
        title: 'Synthetic requirement intake',
        state: 'DRAFT',
        audience: 'CLIENT_VISIBLE',
        revision: 1,
        currentDraftRevisionId: draftId,
        openApprovalRequestId: null,
        currentBaselineId: null,
        createdAt: now,
        updatedAt: now,
      }}
      definitions={[...REQUIREMENT_TEMPLATE_FIELDS]}
      draft={{
        id: draftId,
        artifactId,
        number: 1,
        parentRevisionId: null,
        schemaVersion: '1',
        canonicalization: 'JCS_RFC8785',
        hashAlgorithm: 'SHA256',
        contentHash: 'b'.repeat(64),
        body,
        createdBy: '019d0000-0000-7000-8000-000000000306',
        createdAt: now,
      }}
      projectId={projectId}
      workspaceId={workspaceId}
    />
  );
}
