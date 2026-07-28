'use client';

import { useEffect, useMemo, useState } from 'react';

import type {
  Artifact,
  ArtifactDraftRevision,
  RequirementBody,
  RequirementFieldDefinition,
} from '@delivery-os/contracts';
import { Button, Input, Textarea } from '@delivery-os/ui';

interface Props {
  artifact: Artifact | null;
  draft: ArtifactDraftRevision | null;
  definitions: RequirementFieldDefinition[];
  actorId: string;
  workspaceId: string;
  projectId: string;
}

interface SourceSummary {
  id: string;
  currentGenerationId: string;
  displayName: string;
  audience: 'TEAM_ONLY' | 'CLIENT_VISIBLE';
  processingState: string;
  retentionState: string;
}

interface RequirementClaim {
  id: string;
  field_key: string;
  value_json: unknown;
  audience: 'TEAM_ONLY' | 'CLIENT_VISIBLE';
  disposition: 'ACCEPTED' | 'EDITED' | 'REJECTED' | null;
}

interface RequirementConflict {
  id: string;
  field_key: string;
  claim_ids: string[];
  severity: string;
  state: string;
  revision: number;
}

interface RequirementGap {
  id: string;
  field_key: string;
  reason: string;
  blocking: boolean;
  state: string;
  revision: number;
}

function key(): string {
  return crypto.randomUUID();
}

export function RequirementWorkspace({
  artifact: initialArtifact,
  draft,
  definitions,
  actorId,
  workspaceId,
  projectId,
}: Props) {
  const [artifact, setArtifact] = useState(initialArtifact);
  const [revision, setRevision] = useState(initialArtifact?.revision ?? 0);
  const [body, setBody] = useState<RequirementBody | null>(draft?.body as RequirementBody | null);
  const [message, setMessage] = useState(
    artifact === null ? 'Create the manual Requirement to begin.' : 'Requirement loaded.',
  );
  const [uploading, setUploading] = useState(false);
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [selectedSourceGenerationIds, setSelectedSourceGenerationIds] = useState<string[]>([]);
  const [claims, setClaims] = useState<RequirementClaim[]>([]);
  const [conflicts, setConflicts] = useState<RequirementConflict[]>([]);
  const [gaps, setGaps] = useState<RequirementGap[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewChoices, setReviewChoices] = useState<Record<string, string>>({});
  const [riskReviewDates, setRiskReviewDates] = useState<Record<string, string>>({});
  const sections = useMemo(
    () =>
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((section) => ({
        section,
        fields: definitions.filter((field) => field.section === section),
      })),
    [definitions],
  );

  useEffect(() => {
    if (artifact !== null) {
      void loadSources();
      void loadIntelligence();
    }
    // The route and artifact identity are stable for this mounted workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact?.id]);

  async function loadIntelligence() {
    if (artifact === null) return;
    const response = await fetch(
      `/api/workspaces/${workspaceId}/projects/${projectId}/requirements/${artifact.id}/intelligence`,
      { cache: 'no-store' },
    );
    if (!response.ok) return;
    const result = (await response.json()) as {
      claims?: RequirementClaim[];
      conflicts?: RequirementConflict[];
      gaps?: RequirementGap[];
    };
    setClaims(result.claims ?? []);
    setConflicts(result.conflicts ?? []);
    setGaps(result.gaps ?? []);
  }

  async function loadSources() {
    const response = await fetch(
      `/api/workspaces/${workspaceId}/projects/${projectId}/requirements/sources`,
      { cache: 'no-store' },
    );
    if (!response.ok) {
      setMessage('Authorized source status could not be refreshed.');
      return;
    }
    const result = (await response.json()) as { sources?: SourceSummary[] };
    const visible = result.sources ?? [];
    setSources(visible);
    setSelectedSourceGenerationIds((selected) =>
      selected.filter((id) =>
        visible.some(
          (source) =>
            source.currentGenerationId === id &&
            source.processingState === 'SUCCEEDED' &&
            source.retentionState === 'ACTIVE',
        ),
      ),
    );
  }

  function toggleSource(sourceGenerationId: string) {
    setSelectedSourceGenerationIds((selected) =>
      selected.includes(sourceGenerationId)
        ? selected.filter((id) => id !== sourceGenerationId)
        : [...selected, sourceGenerationId],
    );
  }

  async function requestAiExtraction() {
    if (artifact === null || selectedSourceGenerationIds.length === 0) return;
    setMessage('Queuing advisory extraction with the selected authorized evidence…');
    const response = await fetch(
      `/api/workspaces/${workspaceId}/projects/${projectId}/requirements/extractions`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key() },
        body: JSON.stringify({
          artifactId: artifact.id,
          expectedRevision: revision,
          command: { sourceGenerationIds: selectedSourceGenerationIds },
        }),
      },
    );
    setMessage(
      response.ok
        ? 'Advisory extraction queued. A human must review every claim and gap suggestion.'
        : 'AI assistance is unavailable or the evidence changed. Manual completion remains available.',
    );
  }

  async function dispositionClaim(
    claimId: string,
    disposition: 'ACCEPTED' | 'EDITED' | 'REJECTED',
  ) {
    if (artifact === null) return;
    const note = reviewNotes[claimId]?.trim() ?? '';
    if (disposition !== 'ACCEPTED' && note.length < 2) {
      setMessage('Add a human review note before editing or rejecting a claim.');
      return;
    }
    const response = await fetch(
      `/api/workspaces/${workspaceId}/projects/${projectId}/requirements/${artifact.id}/claims/${claimId}/dispositions`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key() },
        body: JSON.stringify({
          expectedRevision: revision,
          command:
            disposition === 'EDITED'
              ? { disposition, value: note, note }
              : { disposition, note: disposition === 'ACCEPTED' ? null : note },
        }),
      },
    );
    const result = (await response.json()) as { revision?: number };
    if (!response.ok || result.revision === undefined) {
      setMessage('The claim disposition was not recorded. Refresh and review current state.');
      return;
    }
    setRevision(result.revision);
    setArtifact({ ...artifact, revision: result.revision });
    setMessage('Human claim disposition recorded.');
    await loadIntelligence();
  }

  async function resolveConflict(conflict: RequirementConflict) {
    if (artifact === null) return;
    const selectedClaimId = reviewChoices[conflict.id];
    const note = reviewNotes[conflict.id]?.trim() ?? '';
    if (selectedClaimId === undefined || note.length < 2) {
      setMessage('Select one cited claim and add a human conflict-resolution note.');
      return;
    }
    const response = await fetch(
      `/api/workspaces/${workspaceId}/projects/${projectId}/requirements/${artifact.id}/conflicts/${conflict.id}/resolutions`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key() },
        body: JSON.stringify({
          expectedRevision: revision,
          expectedConflictRevision: conflict.revision,
          command: { selectedClaimId, authoredValue: null, note },
        }),
      },
    );
    const result = (await response.json()) as { revision?: number };
    if (!response.ok || result.revision === undefined) {
      setMessage('The conflict was not resolved. Refresh and review current state.');
      return;
    }
    setRevision(result.revision);
    setArtifact({ ...artifact, revision: result.revision });
    setMessage('Conflict resolved by a human reviewer.');
    await loadIntelligence();
  }

  async function dispositionGap(
    gap: RequirementGap,
    disposition: 'NOT_APPLICABLE' | 'ACCEPTED_RISK',
  ) {
    if (artifact === null) return;
    const note = reviewNotes[gap.id]?.trim() ?? '';
    const reviewDate = riskReviewDates[gap.id] ?? '';
    if (note.length < 8 || (disposition === 'ACCEPTED_RISK' && reviewDate === '')) {
      setMessage('Add at least eight characters of justification and any required review date.');
      return;
    }
    const command =
      disposition === 'NOT_APPLICABLE'
        ? { disposition, justification: note }
        : {
            disposition,
            ownerId: actorId,
            rationale: note,
            consequence: note,
            reviewDate,
          };
    const response = await fetch(
      `/api/workspaces/${workspaceId}/projects/${projectId}/requirements/${artifact.id}/gaps/${gap.id}/dispositions`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key() },
        body: JSON.stringify({
          expectedRevision: revision,
          expectedGapRevision: gap.revision,
          command,
        }),
      },
    );
    const result = (await response.json()) as { revision?: number };
    if (!response.ok || result.revision === undefined) {
      setMessage('The gap disposition was not recorded. Refresh and review current state.');
      return;
    }
    setRevision(result.revision);
    setArtifact({ ...artifact, revision: result.revision });
    setMessage('Human gap disposition recorded.');
    await loadIntelligence();
  }

  async function initialize() {
    setMessage('Creating the frozen template and Requirement…');
    const response = await fetch(
      `/api/workspaces/${workspaceId}/projects/${projectId}/requirements/initialize`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key() },
        body: JSON.stringify({ title: 'Project Requirement', audience: 'TEAM_ONLY' }),
      },
    );
    if (!response.ok) {
      setMessage('The Requirement could not be created. Check your role and try again.');
      return;
    }
    location.reload();
  }

  function updateField(fieldKey: string, value: string) {
    if (body === null) return;
    setBody({
      ...body,
      fields: body.fields.map((field) =>
        field.key === fieldKey
          ? { ...field, value, state: value.trim() === '' ? 'UNRESOLVED' : 'RESOLVED' }
          : field,
      ),
    });
  }

  function updateFieldDisposition(
    fieldKey: string,
    state: 'UNRESOLVED' | 'RESOLVED' | 'NOT_APPLICABLE' | 'ACCEPTED_RISK',
  ) {
    if (body === null) return;
    setBody({
      ...body,
      fields: body.fields.map((field) =>
        field.key === fieldKey
          ? {
              ...field,
              state,
              ...(state === 'UNRESOLVED'
                ? {
                    value: null,
                    humanNote: null,
                    riskOwnerId: null,
                    riskReviewDate: null,
                  }
                : {}),
              ...(state === 'RESOLVED'
                ? { humanNote: null, riskOwnerId: null, riskReviewDate: null }
                : {}),
              ...(state === 'NOT_APPLICABLE'
                ? { value: null, riskOwnerId: null, riskReviewDate: null }
                : {}),
              ...(state === 'ACCEPTED_RISK' ? { value: null, riskOwnerId: actorId } : {}),
            }
          : field,
      ),
    });
  }

  function updateFieldMetadata(
    fieldKey: string,
    patch: { humanNote?: string; riskReviewDate?: string },
  ) {
    if (body === null) return;
    setBody({
      ...body,
      fields: body.fields.map((field) => (field.key === fieldKey ? { ...field, ...patch } : field)),
    });
  }

  async function save() {
    if (artifact === null || body === null) return;
    setMessage('Saving Requirement draft…');
    const response = await fetch(
      `/api/workspaces/${workspaceId}/projects/${projectId}/artifacts/${artifact.id}/drafts`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key() },
        body: JSON.stringify({
          expectedRevision: revision,
          command: { schemaVersion: '1', body },
        }),
      },
    );
    const result = (await response.json()) as { revision?: number };
    if (!response.ok || result.revision === undefined) {
      setMessage(
        response.status === 409
          ? 'This Requirement changed elsewhere. Reload before saving.'
          : 'The draft was not saved. Review the errors and try again.',
      );
      return;
    }
    setRevision(result.revision);
    setArtifact({ ...artifact, revision: result.revision });
    setMessage('Requirement draft saved.');
  }

  async function submit() {
    if (artifact === null) return;
    setMessage('Checking readiness and freezing review evidence…');
    const response = await fetch(
      `/api/workspaces/${workspaceId}/projects/${projectId}/artifacts/${artifact.id}/reviews`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key() },
        body: JSON.stringify({ expectedRevision: revision, command: {} }),
      },
    );
    const result = (await response.json()) as { revision?: number };
    if (!response.ok || result.revision === undefined) {
      setMessage(
        'Review was not started. Resolve every required field, conflict, and blocking gap.',
      );
      return;
    }
    setRevision(result.revision);
    setMessage('Requirement submitted with a frozen readiness snapshot.');
  }

  async function uploadSource(file: File | undefined) {
    if (file === undefined) return;
    if (file.size > 52_428_800) {
      setMessage('The source exceeds the 50 MB limit.');
      return;
    }
    setUploading(true);
    setMessage('Preparing a constrained quarantine upload…');
    try {
      const bytes = await file.arrayBuffer();
      const hashBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      const checksumSha256 = [...hashBytes]
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('');
      const checksumSha256Base64 = btoa(
        [...hashBytes].map((value) => String.fromCharCode(value)).join(''),
      );
      const created = await fetch(
        `/api/workspaces/${workspaceId}/projects/${projectId}/requirements/sources`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'idempotency-key': key() },
          body: JSON.stringify({
            command: {
              displayName: file.name,
              declaredMediaType: file.type || 'text/plain',
              declaredByteSize: file.size,
              checksumSha256,
              checksumSha256Base64,
              audience: 'TEAM_ONLY',
            },
          }),
        },
      );
      const session = (await created.json()) as {
        sourceArtifactId?: string;
        sourceGenerationId?: string;
        uploadSessionId?: string;
        revision?: number;
        upload?: { url: string; requiredHeaders: Record<string, string> };
      };
      if (
        !created.ok ||
        session.upload === null ||
        session.upload === undefined ||
        session.sourceArtifactId === undefined ||
        session.sourceGenerationId === undefined ||
        session.uploadSessionId === undefined ||
        session.revision === undefined
      ) {
        setMessage('The quarantine upload session could not be created.');
        return;
      }
      const uploaded = await fetch(session.upload.url, {
        method: 'PUT',
        headers: session.upload.requiredHeaders,
        body: bytes,
      });
      if (!uploaded.ok) {
        setMessage('The source did not reach quarantine. Retry with a new upload session.');
        return;
      }
      const completed = await fetch(
        `/api/workspaces/${workspaceId}/projects/${projectId}/requirements/sources/${session.sourceArtifactId}/complete`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'idempotency-key': key() },
          body: JSON.stringify({
            expectedRevision: session.revision,
            sourceGenerationId: session.sourceGenerationId,
            uploadSessionId: session.uploadSessionId,
            command: {},
          }),
        },
      );
      setMessage(
        completed.ok
          ? 'Source verified in quarantine and queued for private scanning.'
          : 'Source verification failed safely; it was not made available.',
      );
      await loadSources();
    } finally {
      setUploading(false);
    }
  }

  if (artifact === null || body === null) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-12">
        <h1 className="text-3xl font-semibold">Requirement intake</h1>
        <p>
          Start with the governed Sections A–H template. AI is optional; every field can be
          completed manually.
        </p>
        <div aria-live="polite" role="status">
          {message}
        </div>
        <Button className="w-fit" onClick={() => void initialize()}>
          Create manual Requirement
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-8">
      <header>
        <p className="text-sm text-slate-600">Template snapshot {body.templateHash.slice(0, 12)}</p>
        <h1 className="text-3xl font-semibold">{artifact.title}</h1>
        <p>Manual authoring remains available when OCR or AI is disabled.</p>
      </header>
      <div
        aria-live="polite"
        className="rounded-md border border-slate-300 bg-slate-50 p-3"
        role="status"
      >
        {message}
      </div>
      <section aria-labelledby="source-heading" className="rounded-lg border border-slate-200 p-4">
        <h2 className="text-xl font-semibold" id="source-heading">
          Source intake
        </h2>
        <p className="mb-3 text-sm text-slate-600">
          PDF, DOCX, Markdown, and text enter quarantine and remain unavailable until verification
          and private malware scanning succeed.
        </p>
        <label className="font-medium" htmlFor="requirement-source-upload">
          Choose a source file
        </label>
        <Input
          accept=".pdf,.docx,.md,.markdown,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
          aria-describedby="source-help"
          disabled={uploading}
          id="requirement-source-upload"
          onChange={(event) => void uploadSource(event.target.files?.[0])}
          type="file"
        />
        <p className="text-sm" id="source-help">
          Maximum 50 MB. Team-only by default. No source content is sent to AI automatically.
        </p>
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">Authorized sources</h3>
            <Button onClick={() => void loadSources()} type="button" variant="secondary">
              Refresh source status
            </Button>
          </div>
          {sources.length === 0 ? (
            <p className="text-sm text-slate-600">No authorized sources are available yet.</p>
          ) : (
            <fieldset className="space-y-2">
              <legend className="sr-only">Select sources for advisory extraction</legend>
              {sources.map((source) => {
                const selectable =
                  source.processingState === 'SUCCEEDED' && source.retentionState === 'ACTIVE';
                return (
                  <label
                    className="flex min-h-11 items-start gap-3 rounded-md border border-slate-200 p-3"
                    key={source.id}
                  >
                    <input
                      checked={selectedSourceGenerationIds.includes(source.currentGenerationId)}
                      disabled={!selectable}
                      onChange={() => toggleSource(source.currentGenerationId)}
                      type="checkbox"
                    />
                    <span>
                      <span className="block font-medium">{source.displayName}</span>
                      <span className="block text-sm text-slate-600">
                        {source.processingState} · {source.audience}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}
          <Button
            disabled={selectedSourceGenerationIds.length === 0}
            onClick={() => void requestAiExtraction()}
            type="button"
          >
            Suggest claims and gaps with AI
          </Button>
          <p className="text-sm text-slate-600">
            Advisory only. AI cannot accept a claim, resolve a conflict, mark N/A or Accepted Risk,
            change audience, submit, approve, or create a baseline.
          </p>
        </div>
      </section>
      <section
        aria-labelledby="intelligence-heading"
        className="space-y-4 rounded-lg border border-slate-200 p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold" id="intelligence-heading">
              Advisory evidence review
            </h2>
            <p className="text-sm text-slate-600">
              Claims remain proposals until a human records a disposition. Conflicts and gaps remain
              explicit.
            </p>
          </div>
          <Button onClick={() => void loadIntelligence()} type="button" variant="secondary">
            Refresh advisory results
          </Button>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <section aria-labelledby="claims-heading" className="space-y-3">
            <h3 className="font-semibold" id="claims-heading">
              Claims ({claims.length})
            </h3>
            {claims.map((claim) => (
              <article className="space-y-2 rounded-md border border-slate-200 p-3" key={claim.id}>
                <p className="font-medium">{claim.field_key}</p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-sm">
                  {JSON.stringify(claim.value_json, null, 2)}
                </pre>
                <p className="text-sm">
                  {claim.audience} · {claim.disposition ?? 'Awaiting human review'}
                </p>
                {claim.disposition === null ? (
                  <>
                    <label className="text-sm font-medium" htmlFor={`claim-note-${claim.id}`}>
                      Human edit or rejection note
                    </label>
                    <Textarea
                      id={`claim-note-${claim.id}`}
                      onChange={(event) =>
                        setReviewNotes((notes) => ({ ...notes, [claim.id]: event.target.value }))
                      }
                      value={reviewNotes[claim.id] ?? ''}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => void dispositionClaim(claim.id, 'ACCEPTED')}>
                        Accept
                      </Button>
                      <Button
                        onClick={() => void dispositionClaim(claim.id, 'EDITED')}
                        variant="secondary"
                      >
                        Edit using note
                      </Button>
                      <Button
                        onClick={() => void dispositionClaim(claim.id, 'REJECTED')}
                        variant="secondary"
                      >
                        Reject
                      </Button>
                    </div>
                  </>
                ) : null}
              </article>
            ))}
          </section>
          <section aria-labelledby="conflicts-heading" className="space-y-3">
            <h3 className="font-semibold" id="conflicts-heading">
              Conflicts ({conflicts.length})
            </h3>
            {conflicts.map((conflict) => (
              <article
                className="space-y-2 rounded-md border border-slate-200 p-3"
                key={conflict.id}
              >
                <p className="font-medium">
                  {conflict.field_key} · {conflict.severity}
                </p>
                <p className="text-sm">State: {conflict.state}</p>
                {conflict.state === 'OPEN' ? (
                  <>
                    <label className="text-sm font-medium" htmlFor={`conflict-${conflict.id}`}>
                      Select cited claim
                    </label>
                    <select
                      className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3"
                      id={`conflict-${conflict.id}`}
                      onChange={(event) =>
                        setReviewChoices((choices) => ({
                          ...choices,
                          [conflict.id]: event.target.value,
                        }))
                      }
                      value={reviewChoices[conflict.id] ?? ''}
                    >
                      <option value="">Choose a claim</option>
                      {conflict.claim_ids.map((claimId) => (
                        <option key={claimId} value={claimId}>
                          {claimId.slice(0, 12)}
                        </option>
                      ))}
                    </select>
                    <label className="text-sm font-medium" htmlFor={`conflict-note-${conflict.id}`}>
                      Human resolution note
                    </label>
                    <Textarea
                      id={`conflict-note-${conflict.id}`}
                      onChange={(event) =>
                        setReviewNotes((notes) => ({
                          ...notes,
                          [conflict.id]: event.target.value,
                        }))
                      }
                      value={reviewNotes[conflict.id] ?? ''}
                    />
                    <Button onClick={() => void resolveConflict(conflict)}>Resolve conflict</Button>
                  </>
                ) : null}
              </article>
            ))}
          </section>
          <section aria-labelledby="gaps-heading" className="space-y-3">
            <h3 className="font-semibold" id="gaps-heading">
              Gaps ({gaps.length})
            </h3>
            {gaps.map((gap) => (
              <article className="space-y-2 rounded-md border border-slate-200 p-3" key={gap.id}>
                <p className="font-medium">{gap.field_key}</p>
                <p className="text-sm">
                  {gap.reason} · {gap.blocking ? 'Blocking' : 'Advisory'} · {gap.state}
                </p>
                {gap.state === 'OPEN' ? (
                  <>
                    <label className="text-sm font-medium" htmlFor={`gap-note-${gap.id}`}>
                      Human justification and consequence
                    </label>
                    <Textarea
                      id={`gap-note-${gap.id}`}
                      onChange={(event) =>
                        setReviewNotes((notes) => ({ ...notes, [gap.id]: event.target.value }))
                      }
                      value={reviewNotes[gap.id] ?? ''}
                    />
                    <label className="text-sm font-medium" htmlFor={`gap-date-${gap.id}`}>
                      Accepted-risk review date
                    </label>
                    <Input
                      id={`gap-date-${gap.id}`}
                      onChange={(event) =>
                        setRiskReviewDates((dates) => ({
                          ...dates,
                          [gap.id]: event.target.value,
                        }))
                      }
                      type="date"
                      value={riskReviewDates[gap.id] ?? ''}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => void dispositionGap(gap, 'NOT_APPLICABLE')}
                        variant="secondary"
                      >
                        Mark N/A
                      </Button>
                      <Button onClick={() => void dispositionGap(gap, 'ACCEPTED_RISK')}>
                        Accept risk
                      </Button>
                    </div>
                  </>
                ) : null}
              </article>
            ))}
          </section>
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-8">
          {sections.map(({ section, fields }) => (
            <section aria-labelledby={`section-${section}`} className="space-y-4" key={section}>
              <h2 className="text-xl font-semibold" id={`section-${section}`}>
                Section {section}
              </h2>
              {fields.map((definition) => {
                const entry = body.fields.find((field) => field.key === definition.key);
                const value = typeof entry?.value === 'string' ? entry.value : '';
                const controlId = `requirement-${definition.key}`;
                return (
                  <div
                    className="space-y-2 rounded-lg border border-slate-200 p-4"
                    key={definition.key}
                  >
                    <label className="font-medium" htmlFor={controlId}>
                      {definition.label}
                      {definition.mandatory ? ' (required)' : ' (optional)'}
                    </label>
                    <p className="text-sm text-slate-600">{definition.description}</p>
                    <label className="text-sm font-medium" htmlFor={`${controlId}-disposition`}>
                      Human disposition
                    </label>
                    <select
                      className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3"
                      id={`${controlId}-disposition`}
                      onChange={(event) =>
                        updateFieldDisposition(
                          definition.key,
                          event.target.value as
                            'UNRESOLVED' | 'RESOLVED' | 'NOT_APPLICABLE' | 'ACCEPTED_RISK',
                        )
                      }
                      value={entry?.state ?? 'UNRESOLVED'}
                    >
                      <option value="UNRESOLVED">Unresolved</option>
                      <option value="RESOLVED">Resolved with authored value</option>
                      <option value="NOT_APPLICABLE">Not applicable</option>
                      {definition.acceptedRiskAllowed ? (
                        <option value="ACCEPTED_RISK">Accepted risk</option>
                      ) : null}
                    </select>
                    {entry?.state === 'RESOLVED' || entry?.state === 'UNRESOLVED' ? (
                      definition.valueType === 'short_text' ||
                      definition.valueType === 'date' ||
                      definition.valueType === 'enum' ? (
                        <Input
                          id={controlId}
                          onChange={(event) => updateField(definition.key, event.target.value)}
                          value={value}
                        />
                      ) : (
                        <Textarea
                          id={controlId}
                          onChange={(event) => updateField(definition.key, event.target.value)}
                          rows={4}
                          value={value}
                        />
                      )
                    ) : null}
                    {entry?.state === 'NOT_APPLICABLE' || entry?.state === 'ACCEPTED_RISK' ? (
                      <>
                        <label className="text-sm font-medium" htmlFor={`${controlId}-note`}>
                          {entry.state === 'NOT_APPLICABLE'
                            ? 'N/A justification'
                            : 'Risk rationale and consequence'}
                        </label>
                        <Textarea
                          id={`${controlId}-note`}
                          onChange={(event) =>
                            updateFieldMetadata(definition.key, {
                              humanNote: event.target.value,
                            })
                          }
                          rows={3}
                          value={entry.humanNote ?? ''}
                        />
                      </>
                    ) : null}
                    {entry?.state === 'ACCEPTED_RISK' ? (
                      <>
                        <label className="text-sm font-medium" htmlFor={`${controlId}-review-date`}>
                          Risk review date
                        </label>
                        <Input
                          id={`${controlId}-review-date`}
                          onChange={(event) =>
                            updateFieldMetadata(definition.key, {
                              riskReviewDate: event.target.value,
                            })
                          }
                          type="date"
                          value={entry.riskReviewDate ?? ''}
                        />
                        <p className="text-sm text-slate-600">
                          Risk owner: the signed-in human author. AI cannot set this disposition.
                        </p>
                      </>
                    ) : null}
                    <p className="text-sm">
                      State: {entry?.state ?? 'UNRESOLVED'} · Audience:{' '}
                      {entry?.audience ?? artifact.audience}
                    </p>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
        <aside className="h-fit space-y-4 rounded-lg border border-slate-200 p-4 lg:sticky lg:top-4">
          <h2 className="text-lg font-semibold">Readiness</h2>
          <p>
            Submission is checked on the server and atomically bound to the Artifact Kernel review
            snapshot.
          </p>
          <Button className="w-full" onClick={() => void save()}>
            Save draft
          </Button>
          <Button className="w-full" onClick={() => void submit()} variant="secondary">
            Submit for review
          </Button>
        </aside>
      </div>
    </main>
  );
}
