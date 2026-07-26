import { notFound } from 'next/navigation';

import { ArtifactWorkspace } from '../../workspaces/[workspaceId]/projects/[projectId]/artifacts/[artifactId]/artifact-workspace';

export const dynamic = 'force-dynamic';

export default function ArtifactKernelFixturePage() {
  const fixtureEnabled =
    ['local', 'test'].includes(process.env.APP_ENV ?? 'local') ||
    process.env.ARTIFACT_KERNEL_FIXTURE_ENABLED === 'true';
  if (!fixtureEnabled) notFound();
  return (
    <ArtifactWorkspace
      approvals={[]}
      decisionSlots={[
        { key: 'pm', label: 'Project Manager', scope: 'INTERNAL' },
        { key: 'client', label: 'Client Stakeholder', scope: 'EXTERNAL_BINDING' },
      ]}
      artifact={{
        id: '019d0000-0000-7000-8000-000000000001',
        workspaceId: '019d0000-0000-7000-8000-000000000002',
        projectId: '019d0000-0000-7000-8000-000000000003',
        kind: 'KERNEL_TEST_ARTIFACT',
        schemaVersion: '1',
        policyVersion: '1',
        title: 'Synthetic requirement review',
        state: 'DRAFT',
        audience: 'CLIENT_VISIBLE',
        revision: 1,
        currentDraftRevisionId: '019d0000-0000-7000-8000-000000000004',
        openApprovalRequestId: null,
        currentBaselineId: null,
        createdAt: '2026-07-26T00:00:00.000Z',
        updatedAt: '2026-07-26T00:00:00.000Z',
      }}
      baselines={[]}
      draft={{
        id: '019d0000-0000-7000-8000-000000000004',
        artifactId: '019d0000-0000-7000-8000-000000000001',
        number: 1,
        parentRevisionId: null,
        schemaVersion: '1',
        canonicalization: 'JCS_RFC8785',
        hashAlgorithm: 'SHA256',
        contentHash: 'a'.repeat(64),
        body: {
          title: 'Synthetic requirement review',
          sections: [{ id: 'summary', text: 'No real project data.', audience: 'CLIENT_VISIBLE' }],
        },
        createdBy: '019d0000-0000-7000-8000-000000000005',
        createdAt: '2026-07-26T00:00:00.000Z',
      }}
      draftHistory={[
        {
          id: '019d0000-0000-7000-8000-000000000004',
          artifactId: '019d0000-0000-7000-8000-000000000001',
          number: 1,
          parentRevisionId: null,
          schemaVersion: '1',
          canonicalization: 'JCS_RFC8785',
          hashAlgorithm: 'SHA256',
          contentHash: 'a'.repeat(64),
          body: { title: 'Synthetic requirement review' },
          createdBy: '019d0000-0000-7000-8000-000000000005',
          createdAt: '2026-07-26T00:00:00.000Z',
        },
      ]}
      projectId="019d0000-0000-7000-8000-000000000003"
      workspaceId="019d0000-0000-7000-8000-000000000002"
    />
  );
}
