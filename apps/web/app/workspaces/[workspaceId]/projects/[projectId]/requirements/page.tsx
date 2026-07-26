import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { ApplicationError } from '@delivery-os/application';
import { REQUIREMENT_TEMPLATE_FIELDS } from '@delivery-os/domain';

import { artifactStore, auth } from '@/lib/auth';

import { RequirementWorkspace } from './requirement-workspace';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ workspaceId: string; projectId: string }>;
}

export default async function RequirementPage({ params }: PageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session === null) redirect('/');
  const { workspaceId, projectId } = await params;
  const artifact = (
    await artifactStore.listArtifacts(session.user.id, workspaceId, projectId)
  ).find((item) => item.kind === 'REQUIREMENT');
  let draft = null;
  if (artifact !== undefined) {
    try {
      draft = await artifactStore.getDraft(session.user.id, workspaceId, projectId, artifact.id);
    } catch (error) {
      if (!(error instanceof ApplicationError && error.code === 'NOT_FOUND')) throw error;
    }
  }
  return (
    <RequirementWorkspace
      actorId={session.user.id}
      artifact={artifact ?? null}
      definitions={[...REQUIREMENT_TEMPLATE_FIELDS]}
      draft={draft}
      projectId={projectId}
      workspaceId={workspaceId}
    />
  );
}
