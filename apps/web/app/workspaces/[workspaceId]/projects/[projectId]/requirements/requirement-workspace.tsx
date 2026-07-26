'use client';

import { useMemo, useState } from 'react';

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
  const sections = useMemo(
    () =>
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((section) => ({
        section,
        fields: definitions.filter((field) => field.section === section),
      })),
    [definitions],
  );

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
