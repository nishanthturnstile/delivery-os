'use client';

import type {
  ApprovalDecisionRecord,
  Artifact,
  ArtifactAttachment,
  ArtifactBaseline,
  ArtifactComment,
  ArtifactDraftRevision,
} from '@delivery-os/contracts';
import { Button, StatusBadge, StatusMessage, Textarea } from '@delivery-os/ui';
import { useMemo, useState, type SyntheticEvent } from 'react';
import { v7 as uuidv7 } from 'uuid';

interface ApiError {
  error?: {
    code?: string;
    message?: string;
    currentRevision?: number;
  };
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  headers.set('idempotency-key', uuidv7());
  const response = await fetch(url, { ...init, headers });
  const body = (await response.json()) as T & ApiError;
  if (!response.ok) {
    const error = new Error(
      body.error?.message ?? 'The action could not be completed.',
    ) as Error & {
      code?: string;
      currentRevision?: number;
    };
    if (body.error?.code !== undefined) error.code = body.error.code;
    if (body.error?.currentRevision !== undefined) {
      error.currentRevision = body.error.currentRevision;
    }
    throw error;
  }
  return body;
}

function stateTone(state: Artifact['state']) {
  if (state === 'APPROVED') return 'success' as const;
  if (state === 'IN_REVIEW') return 'review' as const;
  if (state === 'CHANGES_REQUESTED') return 'warning' as const;
  return 'neutral' as const;
}

export function ArtifactWorkspace({
  workspaceId,
  projectId,
  artifact: initialArtifact,
  draft,
  draftHistory,
  baselines,
  approvals,
  initialAttachments = [],
  initialComments = [],
  decisionSlots = [],
}: {
  workspaceId: string;
  projectId: string;
  artifact: Artifact;
  draft: ArtifactDraftRevision | null;
  draftHistory: ArtifactDraftRevision[] | null;
  baselines: ArtifactBaseline[];
  approvals: ApprovalDecisionRecord[];
  initialAttachments?: ArtifactAttachment[];
  initialComments?: ArtifactComment[];
  decisionSlots?: { key: string; label: string; scope: 'INTERNAL' | 'EXTERNAL_BINDING' }[];
}) {
  const [artifact, setArtifact] = useState(initialArtifact);
  const [body, setBody] = useState(draft === null ? '' : JSON.stringify(draft.body, null, 2));
  const [savedBody, setSavedBody] = useState(body);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [conflictRevision, setConflictRevision] = useState<number>();
  const [comments, setComments] = useState<ArtifactComment[]>(initialComments);
  const [attachments] = useState<ArtifactAttachment[]>(initialAttachments);
  const [commentBody, setCommentBody] = useState('');
  const [decisionComment, setDecisionComment] = useState('');
  const [decisionConfirmed, setDecisionConfirmed] = useState(false);
  const [diffEntries, setDiffEntries] = useState<
    { path: string; kind: 'ADDED' | 'REMOVED' | 'CHANGED' }[]
  >([]);
  const base = `/api/workspaces/${workspaceId}/projects/${projectId}/artifacts/${artifact.id}`;
  const targetId = artifact.currentBaselineId ?? artifact.currentDraftRevisionId;
  const changed = body !== savedBody;

  const historySummary = useMemo(
    () =>
      (draftHistory ?? []).map((item) => ({
        id: item.id,
        label: `Draft ${item.number}`,
        hash: item.contentHash.slice(0, 12),
      })),
    [draftHistory],
  );

  async function saveDraft() {
    setError(undefined);
    setNotice('Saving draft…');
    try {
      const parsed = JSON.parse(body) as unknown;
      const result = await requestJson<{ revision: number; state: Artifact['state'] }>(
        `${base}/drafts`,
        {
          method: 'POST',
          body: JSON.stringify({
            expectedRevision: artifact.revision,
            command: { schemaVersion: artifact.schemaVersion, body: parsed },
          }),
        },
      );
      setArtifact((current) => ({ ...current, revision: result.revision, state: result.state }));
      setSavedBody(body);
      setConflictRevision(undefined);
      setNotice('Draft saved.');
    } catch (caught) {
      const value = caught as Error & { code?: string; currentRevision?: number };
      if (value.code === 'REVISION_CONFLICT') {
        setConflictRevision(value.currentRevision);
        setNotice(undefined);
      } else {
        setError(value.message);
        setNotice(undefined);
      }
    }
  }

  async function submitReview() {
    setError(undefined);
    try {
      const result = await requestJson<{
        revision: number;
        state: Artifact['state'];
        approvalRequestId: string;
      }>(`${base}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ expectedRevision: artifact.revision, command: {} }),
      });
      setArtifact((current) => ({
        ...current,
        revision: result.revision,
        state: result.state,
        openApprovalRequestId: result.approvalRequestId,
      }));
      setNotice('Frozen review snapshot submitted.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Review submission failed.');
    }
  }

  async function decide(slotKey: string, decision: 'APPROVE' | 'REJECT' | 'CHANGES_REQUESTED') {
    if (artifact.openApprovalRequestId === null) return;
    setError(undefined);
    try {
      const result = await requestJson<{
        revision: number;
        state: Artifact['state'];
      }>(`${base}/reviews/${artifact.openApprovalRequestId}/decisions`, {
        method: 'POST',
        body: JSON.stringify({
          expectedRevision: artifact.revision,
          command: {
            slotKey,
            decision,
            comment: decision === 'APPROVE' ? decisionComment.trim() || null : decisionComment,
          },
        }),
      });
      setArtifact((current) => ({
        ...current,
        revision: result.revision,
        state: result.state,
        openApprovalRequestId: result.state === 'IN_REVIEW' ? current.openApprovalRequestId : null,
      }));
      setDecisionComment('');
      setDecisionConfirmed(false);
      setNotice(`Decision recorded: ${decision.replace('_', ' ').toLowerCase()}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Decision could not be recorded.');
    }
  }

  async function compareLatestBaselines() {
    if (baselines.length < 2) return;
    const [after, before] = baselines;
    if (after === undefined || before === undefined) return;
    try {
      const response = await fetch(
        `${base}/diff?before=${encodeURIComponent(before.sourceSnapshotId)}&after=${encodeURIComponent(after.sourceSnapshotId)}`,
      );
      const result = (await response.json()) as {
        diff?: { entries?: { path: string; kind: 'ADDED' | 'REMOVED' | 'CHANGED' }[] };
      };
      setDiffEntries(result.diff?.entries ?? []);
    } catch {
      setError('The baseline diff could not be loaded.');
    }
  }

  async function changeAudience(audience: Artifact['audience']) {
    setError(undefined);
    try {
      const result = await requestJson<{ revision: number }>(`${base}/audience`, {
        method: 'POST',
        body: JSON.stringify({
          expectedRevision: artifact.revision,
          command: {
            audience,
            reason:
              audience === 'TEAM_ONLY'
                ? 'Client disclosure intentionally narrowed by the Project Manager.'
                : null,
          },
        }),
      });
      setArtifact((current) => ({ ...current, audience, revision: result.revision }));
      setNotice(
        `Audience changed to ${audience === 'TEAM_ONLY' ? 'Team only' : 'Client visible'}.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Audience change failed.');
    }
  }

  async function loadComments() {
    try {
      const result = await fetch(`${base}/comments?targetId=${encodeURIComponent(targetId)}`);
      const json = (await result.json()) as { comments?: ArtifactComment[] };
      setComments(json.comments ?? []);
    } catch {
      setError('Comments could not be loaded.');
    }
  }

  async function addComment(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const comment = await requestJson<ArtifactComment>(`${base}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          expectedRevision: artifact.revision,
          targetType: artifact.currentBaselineId === null ? 'DRAFT_REVISION' : 'BASELINE',
          targetId,
          command: {
            body: commentBody,
            audience: artifact.audience,
            mentionUserIds: [],
          },
        }),
      });
      setComments((current) => [...current, comment]);
      setCommentBody('');
      setArtifact((current) => ({ ...current, revision: current.revision + 1 }));
      setNotice('Comment added.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Comment could not be added.');
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-[var(--content-muted)]">
        <a href="/">Workspace</a> / <span>Artifacts</span> /{' '}
        <span aria-current="page">{artifact.title}</span>
      </nav>
      <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs tracking-wider text-[var(--content-muted)] uppercase">
            {artifact.kind} · schema {artifact.schemaVersion}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{artifact.title}</h1>
          <p className="mt-2 text-sm text-[var(--content-secondary)]">
            Revision {artifact.revision} · {artifact.audience.replace('_', ' ').toLowerCase()}
          </p>
        </div>
        <StatusBadge status={stateTone(artifact.state)}>
          {artifact.state.replace('_', ' ')}
        </StatusBadge>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <section
          aria-labelledby="editor-heading"
          className="rounded-[var(--radius-panel)] border p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="editor-heading" className="text-xl font-bold">
              {draft === null ? 'Approved artifact' : 'Draft editor'}
            </h2>
            {draft === null ? null : <span className="text-xs">Draft {draft.number}</span>}
          </div>
          {draft === null ? (
            <p className="mt-4 text-sm text-[var(--content-secondary)]">
              Draft content is not available in this audience. Approved baseline history remains
              visible below.
            </p>
          ) : (
            <>
              <label className="mt-4 block text-sm font-semibold" htmlFor="artifact-body">
                Structured artifact body
              </label>
              <p id="artifact-body-help" className="mt-1 text-xs text-[var(--content-muted)]">
                JSON is validated by the registered artifact adapter. An open review is read-only.
              </p>
              <Textarea
                aria-describedby="artifact-body-help"
                className="mt-2 min-h-80 font-mono"
                disabled={artifact.state === 'IN_REVIEW' || artifact.state === 'APPROVED'}
                id="artifact-body"
                spellCheck={false}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  disabled={
                    !changed || artifact.state === 'IN_REVIEW' || artifact.state === 'APPROVED'
                  }
                  onClick={() => void saveDraft()}
                >
                  Save revision
                </Button>
                <Button
                  disabled={changed || !['DRAFT', 'CHANGES_REQUESTED'].includes(artifact.state)}
                  variant="secondary"
                  onClick={() => void submitReview()}
                >
                  Submit frozen review
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void navigator.clipboard.writeText(body)}
                >
                  Copy my changes
                </Button>
              </div>
            </>
          )}
          {conflictRevision === undefined ? null : (
            <div className="mt-4" tabIndex={-1}>
              <StatusMessage tone="warning">
                <strong>Revision conflict.</strong> The artifact is now revision {conflictRevision}.
                Your local input is preserved. Review the current version before explicitly rebasing
                and retrying.
              </StatusMessage>
            </div>
          )}
          {notice === undefined ? null : <StatusMessage className="mt-4">{notice}</StatusMessage>}
          {error === undefined ? null : (
            <StatusMessage className="mt-4" tone="danger">
              {error}
            </StatusMessage>
          )}
        </section>

        <aside className="space-y-6">
          <section
            aria-labelledby="audience-heading"
            className="rounded-[var(--radius-panel)] border p-5"
          >
            <h2 id="audience-heading" className="font-bold">
              Audience
            </h2>
            <p className="mt-2 text-sm text-[var(--content-secondary)]">
              Child records inherit the most restrictive parent audience. Disclosure changes are
              audited separately from immutable content.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                disabled={artifact.audience === 'TEAM_ONLY'}
                size="compact"
                variant="secondary"
                onClick={() => void changeAudience('TEAM_ONLY')}
              >
                Team only
              </Button>
              <Button
                disabled={artifact.audience === 'CLIENT_VISIBLE'}
                size="compact"
                variant="secondary"
                onClick={() => void changeAudience('CLIENT_VISIBLE')}
              >
                Client visible
              </Button>
            </div>
          </section>

          <section
            aria-labelledby="history-heading"
            className="rounded-[var(--radius-panel)] border p-5"
          >
            <h2 id="history-heading" className="font-bold">
              History
            </h2>
            <ol className="mt-3 space-y-2 text-sm">
              {historySummary.map((item) => (
                <li className="flex justify-between gap-3" key={item.id}>
                  <span>{item.label}</span>
                  <code>{item.hash}</code>
                </li>
              ))}
              {baselines.map((baseline) => (
                <li className="flex justify-between gap-3" key={baseline.id}>
                  <span>Baseline {baseline.displayNumber}</span>
                  <StatusBadge status={baseline.state === 'CURRENT' ? 'success' : 'neutral'}>
                    {baseline.state}
                  </StatusBadge>
                </li>
              ))}
            </ol>
          </section>

          <section
            aria-labelledby="approvals-heading"
            className="rounded-[var(--radius-panel)] border p-5"
          >
            <h2 id="approvals-heading" className="font-bold">
              Approval history
            </h2>
            {approvals.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--content-muted)]">No decisions recorded.</p>
            ) : (
              <ul className="mt-3 space-y-3 text-sm">
                {approvals.map((approval) => (
                  <li key={approval.id}>
                    <strong>{approval.decision}</strong> · {approval.actorRole}
                    {approval.comment === null ? null : <p className="mt-1">{approval.comment}</p>}
                  </li>
                ))}
              </ul>
            )}
            {artifact.openApprovalRequestId === null || decisionSlots.length === 0 ? null : (
              <fieldset className="mt-5 border-t pt-4">
                <legend className="font-semibold">Record a review decision</legend>
                <label className="mt-3 block text-sm" htmlFor="decision-comment">
                  Decision comment
                </label>
                <Textarea
                  className="mt-2"
                  id="decision-comment"
                  maxLength={8000}
                  value={decisionComment}
                  onChange={(event) => setDecisionComment(event.target.value)}
                />
                <label className="mt-3 flex items-start gap-2 text-sm">
                  <input
                    checked={decisionConfirmed}
                    className="mt-1"
                    type="checkbox"
                    onChange={(event) => setDecisionConfirmed(event.target.checked)}
                  />
                  I reviewed the frozen snapshot and understand the decision is recorded immutably.
                </label>
                {decisionSlots.map((slot) => (
                  <div className="mt-3" key={slot.key}>
                    <p className="text-xs text-[var(--content-muted)]">
                      {slot.label} ·{' '}
                      {slot.scope === 'EXTERNAL_BINDING' ? 'binding external' : 'internal'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        disabled={!decisionConfirmed}
                        size="compact"
                        onClick={() => void decide(slot.key, 'APPROVE')}
                      >
                        Approve
                      </Button>
                      <Button
                        disabled={!decisionConfirmed || decisionComment.trim().length < 2}
                        size="compact"
                        variant="secondary"
                        onClick={() => void decide(slot.key, 'CHANGES_REQUESTED')}
                      >
                        Request changes
                      </Button>
                      <Button
                        disabled={!decisionConfirmed || decisionComment.trim().length < 2}
                        size="compact"
                        variant="secondary"
                        onClick={() => void decide(slot.key, 'REJECT')}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </fieldset>
            )}
          </section>
        </aside>
      </div>

      <section
        aria-labelledby="diff-heading"
        className="mt-6 rounded-[var(--radius-panel)] border p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="diff-heading" className="text-xl font-bold">
            Baseline diff
          </h2>
          <Button
            disabled={baselines.length < 2}
            size="compact"
            variant="quiet"
            onClick={() => void compareLatestBaselines()}
          >
            Compare latest
          </Button>
        </div>
        {diffEntries.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--content-muted)]">
            Two authorized baselines are required for a comparison.
          </p>
        ) : (
          <ol className="mt-3 space-y-2">
            {diffEntries.map((entry) => (
              <li key={`${entry.path}-${entry.kind}`}>
                <strong>{entry.kind}</strong> <code>{entry.path}</code>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section
        aria-labelledby="comments-heading"
        className="mt-6 rounded-[var(--radius-panel)] border p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="comments-heading" className="text-xl font-bold">
            Comments
          </h2>
          <Button size="compact" variant="quiet" onClick={() => void loadComments()}>
            Refresh comments
          </Button>
        </div>
        <ul className="mt-4 space-y-3">
          {comments.map((comment) => (
            <li
              className="rounded-[var(--radius-control)] bg-[var(--surface-inset)] p-3"
              key={comment.id}
            >
              <p>{comment.body}</p>
              <p className="mt-2 text-xs text-[var(--content-muted)]">
                {comment.audience.replace('_', ' ').toLowerCase()}
              </p>
            </li>
          ))}
        </ul>
        <form className="mt-4" onSubmit={(event) => void addComment(event)}>
          <label className="text-sm font-semibold" htmlFor="artifact-comment">
            Add comment
          </label>
          <Textarea
            className="mt-2"
            id="artifact-comment"
            maxLength={8000}
            required
            value={commentBody}
            onChange={(event) => setCommentBody(event.target.value)}
          />
          <Button className="mt-3" type="submit">
            Post comment
          </Button>
        </form>
      </section>

      <section
        aria-labelledby="attachments-heading"
        className="mt-6 rounded-[var(--radius-panel)] border p-5"
      >
        <h2 id="attachments-heading" className="text-xl font-bold">
          Attachments
        </h2>
        {attachments.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--content-muted)]">
            No authorized attachment references are available.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {attachments.map((attachment) => (
              <li className="flex flex-wrap items-center justify-between gap-3" key={attachment.id}>
                <span>
                  {attachment.displayName}{' '}
                  <span className="text-xs text-[var(--content-muted)]">
                    ({attachment.mediaType})
                  </span>
                </span>
                <StatusBadge status={attachment.state === 'AVAILABLE' ? 'success' : 'neutral'}>
                  {attachment.state}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
