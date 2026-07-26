import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { ApplicationError } from '@delivery-os/application';

import { artifactStore, auth } from '@/lib/auth';

import { ArtifactWorkspace } from './artifact-workspace';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ workspaceId: string; projectId: string; artifactId: string }>;
}

async function loadArtifactPage(input: {
  actorId: string;
  workspaceId: string;
  projectId: string;
  artifactId: string;
}) {
  const { actorId, workspaceId, projectId, artifactId } = input;
  const artifact = await artifactStore.getArtifact(actorId, workspaceId, projectId, artifactId);
  const [baselines, approvals] = await Promise.all([
    artifactStore.listBaselines(actorId, workspaceId, projectId, artifactId),
    artifactStore.listApprovalHistory(actorId, workspaceId, projectId, artifactId),
  ]);
  let draft = null;
  let draftHistory = null;
  try {
    [draft, draftHistory] = await Promise.all([
      artifactStore.getDraft(actorId, workspaceId, projectId, artifactId),
      artifactStore.listDraftHistory(actorId, workspaceId, projectId, artifactId),
    ]);
  } catch (error) {
    if (!(error instanceof ApplicationError && error.code === 'NOT_FOUND')) throw error;
  }
  const targetId = artifact.currentBaselineId ?? artifact.currentDraftRevisionId;
  const [initialComments, initialAttachments] = await Promise.all([
    artifactStore.listComments(actorId, workspaceId, projectId, artifactId, targetId),
    artifactStore.listAttachments(actorId, workspaceId, projectId, artifactId, targetId),
  ]);
  return {
    artifact,
    baselines,
    approvals,
    draft,
    draftHistory,
    initialComments,
    initialAttachments,
  };
}

export default async function ArtifactPage({ params }: PageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session === null) redirect('/');
  const { workspaceId, projectId, artifactId } = await params;
  let data;
  try {
    data = await loadArtifactPage({
      actorId: session.user.id,
      workspaceId,
      projectId,
      artifactId,
    });
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  return (
    <ArtifactWorkspace
      approvals={data.approvals}
      artifact={data.artifact}
      baselines={data.baselines}
      draft={data.draft}
      draftHistory={data.draftHistory}
      initialAttachments={data.initialAttachments}
      initialComments={data.initialComments}
      projectId={projectId}
      workspaceId={workspaceId}
    />
  );
}
