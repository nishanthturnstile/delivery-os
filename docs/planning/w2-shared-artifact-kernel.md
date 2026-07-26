# W2 Shared Artifact Kernel — Approved Implementation Plan

**Status:** Local implementation complete — staging exit gate blocked

**Authorization mode:** `IMPLEMENTATION_AUTHORIZED` on 2026-07-26

**Roadmap status:** `Blocked`

**Owner:** Nishanth with Codex
**Specification snapshot reviewed:** `14f5143`  
**Prerequisite:** W2 M2 Client & Project Registry is `Complete` with linked
[validation evidence](../validation/w2-m2-client-project-registry.md)  
**Requirements:** FR-M3-12–17; FR-M4-05–07; FR-M5-08; FR-CC-07–08, 14, 16;
NFR-02, NFR-04–07, NFR-10, NFR-12–14  
**Backlog:** [S3 Artifact Drafts, Review Snapshots, Baselines, Audience](delivery-backlog.md#s3--artifact-drafts-review-snapshots-baselines-audience)  
**Roadmap:** [Section 6.2 Shared Artifact Kernel](implementation-roadmap.md#62-shared-artifact-kernel)

> The founder assigned the owner, authorized implementation, and resolved Section 2.4 on
> 2026-07-26. The kernel remains non-authoritative until every Section 15.3 exit condition passes
> and the roadmap advances through the governed validation transitions.

## 1. Gate, Scope, and Module Boundary

### 1.1 Gate assessment

The implementation gate was rechecked when implementation started:

1. The roadmap summary records M2 as `Complete`, owned by Projects & Clients, with the stable M2
   validation record linked.
2. Roadmap Section 6 records M2 as `Complete`; Shared Artifact Kernel moved to `In Progress` in
   the same change that started Slice A.
3. The roadmap summary and Section 6.2 assign the Shared Artifact Kernel to Nishanth with Codex.
4. The working tree contained the pre-existing `apps/web/next-env.d.ts` modification. This plan
   neither depends on nor changes it.
5. Founder authorization and the five decisions below were recorded on 2026-07-26.

### 1.2 Objective

Provide the reusable Artifacts boundary that later Requirements, Technical Plans, UX Plans,
Feature Specifications, Cost Plans, and change workflows use for:

- append-only draft revision history;
- frozen, content-addressed review snapshots;
- internal decisions and first-binding external decisions;
- immutable, monotonically numbered approved baselines;
- explicit post-baseline deltas and structured diffs;
- audience-safe comments and attachment references;
- permission-safe reads, search projections, notifications, and asynchronous exports; and
- reusable, accessible editor, review, approval, history, diff, comment, attachment, and audience
  UI patterns.

### 1.3 Included

- A code-owned artifact-kind/schema-version registry and its extension contract.
- Relational Artifact, DraftRevision, ReviewSnapshot, ApprovalRequest, ApprovalDecision, Baseline,
  Delta, Comment, Attachment, and Audience records.
- Deterministic canonical snapshot serialization and SHA-256 content hashing.
- Draft creation, autosave, history, submit, changes requested, reject, resubmit, approve,
  baseline, supersede, and delta mechanics.
- Optimistic concurrency and command idempotency on every mutation.
- A race-safe, exactly-one first-binding external decision.
- Server-side project role, artifact state, and effective-audience authorization.
- Visibility-aware child projection for direct reads, comments, attachments, search, notification,
  export, and future MCP access.
- Generic API contracts, application ports, PostgreSQL adapter, outbox events, export job contract,
  and reusable UI patterns.
- Test-only artifact-kind fixtures that prove the generic kernel before a product module registers
  a real body schema.

### 1.4 Explicit non-goals and deferred work

- No Requirement template, claim, gap, citation, extraction, or approval-readiness schema; M3 owns
  those.
- No source-file upload, object manifest, quarantine, MIME validation, malware scanning, parsing,
  OCR, or normalized-document model; S4/M3 owns those.
- No new source-file or attachment binary storage path. The kernel stores and renders authorized
  attachment metadata/references behind an application port; M3 binds that port to scanned,
  available objects.
- No Technical Plan, UX Plan, Feature Specification, Cost Plan, currency/calculation, or
  change-impact body schema; their owning modules register those schemas later.
- No client portal navigation or workspace-wide file-content search; M8 and later search work own
  those surfaces.
- No collaborative cursor/presence, CRDT, operational transform, real-time co-editing, rich-text
  editor dependency, arbitrary workspace-defined schema execution, or legal hold.
- No rewrite of the M2 `project_outcome_modules` placeholder.
- No production data migration, backfill, physical deletion, or provider/account change in this
  module.

## 2. Confirmed Facts, Assumptions, Decisions, and Questions

### 2.1 Confirmed facts

- The roadmap is the only implementation-status, dependency, owner, and evidence authority.
- M2 provides active workspace membership, independent project roles, safe Client Stakeholder
  activation, audited Admin override, project lifecycle/readiness, and tenant-safe query patterns.
- The repository already has versioned Zod contracts, `ApplicationError`, UUIDv7 IDs, integer
  revisions, idempotency records, append-only audit events, a transactional outbox, processed-event
  deduplication, BullMQ delivery, correlation IDs, and safe HTTP error mapping.
- M2 mutations lock invariant rows, re-evaluate server-side authorization, write audit/outbox/
  idempotency state transactionally, and return `REVISION_CONFLICT` rather than overwrite.
- The current stable validated stack already contains all required primitives: PostgreSQL, Drizzle,
  Node `crypto`, Zod, Next.js/React, Base UI through `@delivery-os/ui`, BullMQ, Vitest, Playwright,
  and axe.
- Core architecture requires snapshot bodies to be schema-versioned, deterministic, immutable,
  backward-readable, and hashed with SHA-256.
- Domain rules require draft editing to stop while a review is open. Editing resumes after the
  request closes; the prior snapshot remains immutable.
- Baseline display numbers are `1.0`, `2.0`, and so on, monotonically allocated per artifact.
- Clients approve external Requirement review requests only. They may view/comment on explicitly
  shared Technical/UX plans and shared Cost Plans but do not approve them in this kernel.
- Exports are asynchronous, snapshot-based jobs and must re-evaluate access and audience both when
  requested and when the worker materializes the export.

### 2.2 Planning assumptions

- Pilot artifact bodies fit safely in PostgreSQL `jsonb`; rendered PDF/Markdown/JSON exports may be
  stored through the existing provider boundary and reference the snapshot hash.
- Draft history is append-only full-body revisions for correctness and simple recovery. The pilot
  scale does not justify patch-only storage or compaction.
- `REQUIREMENT`, `TECHNICAL_PLAN`, `UX_PLAN`, `FEATURE_SPEC`, and `COST_PLAN` are stable registry
  keys, stored as text rather than a PostgreSQL enum so later code-owned kinds do not require
  rewriting historical rows.
- A delta stores intent and the base baseline, while its proposed content is another full
  DraftRevision/ReviewSnapshot. A delta is not itself an authoritative patch.
- Approval policy requirements are frozen as role slots on submission. Actor eligibility is
  checked against current workspace/project membership at decision time. A recorded decision
  remains historical if that actor later changes role.
- An external decision is made by any currently active assigned Client Stakeholder. The first
  committed approve or reject is binding for that request.
- Approved baselines and review snapshots are not individually soft-deletable. They remain until
  the containing project/workspace enters the governed retention/purge workflow.

### 2.3 Recommended decisions

These are implementation decisions in this plan, not changes to normative product scope:

1. Use an RFC 8785-compatible, code-owned canonical JSON profile over the validated schema output.
   Reject duplicate keys before parsing is relevant, non-finite numbers, negative zero, lone
   surrogates, and values outside the registry schema. Represent money, high-precision numbers,
   dates, and IDs as normalized strings.
2. Hash exactly `UTF8(canonicalBody)` with Node `createHash("sha256")` and store a 32-byte `bytea`
   hash plus an API hex representation. Do not hash PostgreSQL's `jsonb` textual output.
3. Keep canonical bytes and parsed `jsonb` together on immutable snapshots: bytes are the hashing
   authority; `jsonb` supports validated reads and projection.
4. Use `READ COMMITTED` transactions with explicit row locks in one global lock order, plus unique
   constraints as the final invariant. Do not introduce a broader `SERIALIZABLE` retry regime for
   this narrow decision race.
5. Use full-state, adapter-produced semantic diffs for presentation. An RFC 6902-like operation DTO
   may describe changes, but JSON Patch is never accepted as an authoritative write or stored as
   the only successor content.
6. Add no runtime dependency. Implement the small canonicalization and structured-diff cores in
   the domain package, validate them against RFC vectors/property tests, and use Node's built-in
   SHA-256.
7. Keep attachment binary creation disabled in S3. Implement attachment reference lifecycle,
   audience, API/UI states, and a port that accepts only a future M3 `AVAILABLE` scanned object.
8. Require a comment for `REJECT`, `CHANGES_REQUESTED`, audience narrowing/removal, and request
   cancellation. Approval comments remain optional.
9. Keep approval requests open without automatic expiry in S3. Authorized PM cancellation or a
   closing decision ends the request; reminder/escalation policy is a later notification concern.
10. Preserve the M2 safe-not-found convention: missing, foreign-workspace, foreign-project, and
    unauthorized artifact identifiers all return the same 404 response.

### 2.4 Founder decisions resolved on 2026-07-26

- S3 attachment support is metadata/reference-only until M3 binds scanned object storage through
  the trusted port.
- S3 adds no rich-text editor dependency; module adapters provide structured fields and the kernel
  remains editor-agnostic.
- Review requests have no automatic expiry in the pilot.
- Rejection, changes requested, and cancellation require a human comment; approval comments are
  optional.
- A later audited audience-narrowing action may hide an approved baseline from clients without
  changing its immutable content or authoritative role. Broadening it again requires a new
  approved Delta.

### 2.5 Open implementation questions

- The first product adapter (M3 Requirement) must define its field-level audience projection and
  approval-readiness hook; S3 can prove the interface only with a non-production fixture.
- M3 must decide which scanned object metadata is safe for a client-visible attachment DTO.
- M8 must decide the final client portal placement and notification copy; S3 exposes authorized
  components and routes without creating the portal.
- S13 must set final artifact/export retention durations within the existing 30-day recoverable
  deletion rule and backup-aging policy.

None of these deferred module questions blocks creation or testing of the generic kernel. The five
founder decisions required for S3 itself are resolved above.

## 3. Current-State Findings

### 3.1 Foundations to retain

| Foundation | Current location | Kernel reuse |
| --- | --- | --- |
| Versioned commands/DTOs | `packages/contracts/src/projects.ts` | Add an Artifacts contract file using the same envelopes and safe parsing |
| Pure state/permission policies | `packages/domain/src/projects.ts` | Add artifact lifecycle, audience, serialization, approval, and diff policies |
| Application command/query ports | `packages/application/src/projects.ts` | Add Artifact commands/queries without framework/database imports |
| Transaction kernel | `packages/database/src/platform-store.ts` and `project-store.ts` | Reuse expected revision, request hash, idempotency replay, audit, and outbox pattern |
| Safe error envelope | `packages/contracts/src/errors.ts`, `apps/web/lib/api.ts` | Extend only with structured artifact-safe details |
| Tenant/project authorization | M1/M2 stores and Route Handlers | Re-evaluate current membership/role on every operation |
| Outbox/consumer dedupe | `outbox_events`, `processed_events`, worker | Add versioned artifact/export/notification events |
| Responsive authenticated UI | `workspace-app.tsx`, `registry-panels.tsx`, `@delivery-os/ui` | Extract small reusable artifact patterns without importing Base UI in the app |
| Test/migration approach | integration, migration, E2E suites | Add empty/W1/M2 upgrade, race, IDOR, browser, and accessibility evidence |
| Operational evidence | M2 validation record | Repeat backup, migration, deploy, public flow, logs, metrics, and outbox checks |

### 3.2 Gaps this module must close

- No Artifacts domain/application boundary or artifact-kind registry exists.
- No schema stores draft revisions, snapshots, review requests/decisions, baselines, deltas,
  artifact comments, attachment references, or audience inheritance.
- Existing `project_outcome_modules.audience` is a placeholder enum, not the generic audience
  policy.
- No canonical JSON serializer/hash contract or historical schema-reader registry exists.
- Existing errors include `APPROVAL_CLOSED` but do not expose a safe binding-decision result or
  artifact conflict summary.
- The worker acknowledges generic outbox jobs but does not prepare exports or pending-action
  notifications.
- The UI package has only basic controls/status components; review, history, diff, comment,
  attachment, audience, conflict, and decision confirmation patterns are absent.
- Project search exists, but artifact/comment search projection and export projection do not.
- There is no cross-audience query discipline proving that Team-only children cannot leak through
  aggregate reads, counts, snippets, exports, notifications, or future MCP resources.

## 4. Requirements-to-Design Traceability

| Requirement/gate | Kernel design | Required evidence |
| --- | --- | --- |
| FR-M3-12 | Append-only DraftRevision; immutable content-addressed ReviewSnapshot; numbered Baseline; Delta | Unit vectors, repository immutability, browser history |
| FR-M3-13 | Registry-owned semantic diff between authorized snapshot/baseline projections | Determinism/property tests, component and E2E diff |
| FR-M3-14 | `DRAFT → IN_REVIEW → APPROVED`, with closed return path | State-machine/property and command tests |
| FR-M3-15 | Policy slots for PM and external first-binding stakeholder decision | Real PostgreSQL race and external-role E2E |
| FR-M3-16 | Only Baseline IDs are exposed through authoritative-context query | Contract/authorization tests; draft/snapshot denial |
| FR-M3-17 / FR-M4-07 | Immutable decision metadata and append-only audit | Database trigger and audit assertions |
| FR-M4-05 | Same snapshot/baseline/delta lifecycle with PM/Lead policy | Test registry policy fixtures |
| FR-M4-06 | Client view/comment only on explicitly shared plan; no approval | Permission matrix and E2E denial |
| FR-M5-08 | Same lifecycle; PM approval; client shared read only | Policy fixture and client denial tests |
| FR-CC-07 | Comments target an authorized artifact revision/snapshot/baseline/delta | Contract, repository, component tests |
| FR-CC-08 | Mentions resolve only visible active members and emit safe events | Mention authorization/notification tests |
| FR-CC-14 | Explicit audience record and restrictive inheritance at read and export time | IDOR/audience matrix across every projection |
| FR-CC-16 / NFR-12 | Integer aggregate revision, expectedRevision, idempotency | Stale editor and replay/race tests |
| NFR-02 | Bounded indexed reads; async snapshot exports/diffs above threshold | Query plans, load fixture, queue timing |
| NFR-04–06 | Deny-by-default, tenant isolation, append-only audit | Adversarial, log-redaction, audit tests |
| NFR-07 | WCAG 2.2 AA complete review/approval/conflict process | axe, keyboard/focus, reflow, screen-reader evidence |
| NFR-10 | Versioned code-owned registry and backward readers | Registry compatibility tests |
| NFR-13 | Correlation, safe logs/metrics/events | Observability and redaction assertions |
| S3 exit gate | All generic behavior passes before real M3/M4/M5 schema registration | Validation record linked from both roadmap locations |

## 5. Architecture Decisions

### 5.1 Artifact-kind and schema-version registry

Create a code-owned `ArtifactKindRegistry`. Database rows store `kind_key`, `schema_version`, and
`policy_version` as bounded text. No caller may supply an unregistered combination.

Each registry entry must provide:

```ts
type ArtifactKindAdapter<TBody> = {
  kind: ArtifactKindKey;
  schemaVersion: string;
  bodySchema: ZodType<TBody>;
  normalize(body: TBody): CanonicalJsonValue;
  readHistorical(canonicalBody: string): TBody;
  projectAudience(body: TBody, audience: EffectiveAudience): CanonicalJsonValue;
  diff(before: TBody, after: TBody, audience: EffectiveAudience): ArtifactDiff;
  approvalPolicy: ApprovalPolicyDefinition;
  editorDescriptor: ArtifactEditorDescriptor;
};
```

Registry rules:

- unknown kinds/versions fail with `VALIDATION_FAILED` without persisting content;
- registration keys are unique and deterministic at startup;
- newer adapters never rewrite old canonical bodies;
- a historical reader remains until all retention obligations for that version expire;
- schema migration creates a new DraftRevision under the new version and records its source
  revision; it does not mutate history;
- arbitrary executable workspace schemas are not loaded in the pilot; controlled extension is
  code-reviewed registration only; and
- production initially reserves the five normative kinds but S3 acceptance uses an isolated
  `KERNEL_TEST_ARTIFACT` adapter that production entry points cannot create.

### 5.2 Canonical serialization and content hash

The serializer operates only after Zod validation and adapter normalization:

1. produce an I-JSON-compatible value;
2. preserve strings byte-for-byte after validation; do not apply hidden Unicode normalization;
3. sort object property names by RFC 8785 UTF-16 code-unit ordering;
4. preserve array order;
5. use RFC 8785/ECMAScript literal, string, and number serialization;
6. reject non-finite numbers, negative zero, lone surrogates, unsupported values, and out-of-range
   precision;
7. encode the canonical single-line JSON as UTF-8;
8. calculate SHA-256 over those exact bytes; and
9. store `canonical_body`, parsed `body_json`, `content_hash`, `hash_algorithm = SHA256`,
   `canonicalization = JCS_RFC8785`, `kind_key`, and `schema_version`.

The canonical body must never be written to application logs. Hash equality proves identical
canonical content, not authorship, approval, freshness, or audience.

### 5.3 Aggregate and record responsibilities

- **Artifact:** stable project-owned identity, kind, owner, lifecycle state, current audience,
  revision, current draft pointer, open request pointer, current baseline pointer, and monotonic
  counters.
- **DraftRevision:** append-only full body, revision number, parent revision, optional source
  baseline/delta, author, schema version, canonical bytes/hash, and creation time.
- **ReviewSnapshot:** append-only frozen copy/reference of exactly one DraftRevision, snapshot
  number, canonical bytes/hash, submitter, policy version, and time.
- **ApprovalRequest:** one snapshot, frozen required role slots, state/revision, open/close metadata,
  and optional binding external decision.
- **ApprovalDecision:** append-only actor/role/scope/decision/comment/snapshot/hash/time. It never
  points only to a mutable Artifact head.
- **Baseline:** append-only `major_number`, display number, source snapshot/hash, schema version,
  approver completion metadata, predecessor/successor links, and state `CURRENT` or `SUPERSEDED`.
- **Delta:** mutable lifecycle shell linking a base Baseline to proposed full-state draft/snapshot
  and eventual successor Baseline; rationale and revision are relational fields.
- **Comment:** authorized target, text, mention IDs, audience record, revision, `OPEN/RESOLVED/
  REMOVED`, authorship, and timestamps. Removal is a non-content tombstone; audit retains a safe
  summary, not deleted body text.
- **Attachment:** authorized target, safe filename/media metadata, external object reference,
  content hash when available, audience record, revision, and `PENDING/AVAILABLE/REMOVED/
  QUARANTINED/FAILED`. Only `AVAILABLE` may be read/exported.
- **Audience:** append-only disclosure record with declared/effective audience, source
  `EXPLICIT/INHERITED`, parent audience record, actor/reason, and time. Every shareable record has a
  non-null audience record.

### 5.4 Immutability, numbering, and diff

- DraftRevision, ReviewSnapshot, ApprovalDecision, Baseline content, and Audience history are
  insert-only. PostgreSQL triggers reject update/delete, matching the existing audit trigger.
- Artifact/ApprovalRequest/Delta/Comment/Attachment shells use optimistic revisions and soft
  lifecycle transitions.
- Lock the Artifact row before allocating `draft_number`, `snapshot_number`, `request_number`, or
  `baseline_major`. Increment and insert in one transaction. Unique `(artifact_id, number)`
  constraints are the final defense.
- Baseline display is derived as `${baseline_major}.0`; never use floating-point storage.
- Creating Baseline N marks N-1 `SUPERSEDED` in the same transaction but never changes N-1 content,
  hash, number, approvals, or audience history.
- A Delta begins from one existing Baseline. Its draft contains the proposed complete successor
  state. Diff is recomputed from the two immutable authorized projections; cached diff rows, if
  added for measured performance, are disposable and keyed by both hashes, adapter version, and
  audience.
- Diff DTOs use stable paths, `ADDED/REMOVED/CHANGED/MOVED`, safe labels, and before/after values.
  Arrays with stable domain IDs compare by ID; other arrays compare by position. UI never relies
  on color alone and provides a linear text summary.

### 5.5 Audience and authorization

The two pilot audiences are `TEAM_ONLY` and `CLIENT_VISIBLE`. `TEAM_ONLY` is more restrictive.

Effective audience is calculated server-side:

```text
effective(child) = most_restrictive(
  artifact current audience,
  target snapshot/baseline audience,
  child declared-or-inherited audience
)
```

Rules:

- Artifact creation requires an explicit root audience.
- A child without an override receives an immutable inherited audience record. A child override
  may narrow disclosure; broadening beyond any parent is rejected.
- Sharing an Artifact later does not automatically expose children created as Team-only. Unsharing
  immediately narrows every access-time projection without rewriting history.
- Active workspace membership, project membership/role, artifact state, current root audience,
  target audience, and child effective audience are checked together.
- Internal PM/Lead/Contributor/Viewer reads follow project policy; a Client Stakeholder receives
  only `CLIENT_VISIBLE` projections. Workspace Admin requires the existing audited, action-bound
  override for Team artifact access when not assigned to the project.
- The same projection builder is mandatory for aggregate GETs, comments, attachment metadata and
  download authorization, mention lookup, search document/index creation, snippets/counts,
  notifications, export preparation, and future MCP resources.
- Queries must filter unauthorized rows before pagination, counts, snippets, aggregation, or
  serialization. Post-fetch UI filtering is prohibited.
- Missing, foreign, and unauthorized identifiers are indistinguishable safe 404s.
- Audience changes require expected revision, reason when narrowing/removing external access,
  audit, outbox, and notification invalidation in one transaction.

## 6. Persistence Plan

### 6.1 Tables and principal fields

All tenant rows carry `workspace_id`; all kernel records carry `project_id` and `artifact_id` where
applicable. IDs are application-generated UUIDv7.

| Table | Principal fields and constraints |
| --- | --- |
| `artifacts` | ID, tenant/project, kind, owner, state, revision, root audience ID, current draft/request/baseline IDs, next counters, timestamps; positive counters/revision |
| `artifact_draft_revisions` | ID, tenant/project/artifact, number, parent ID, delta ID, schema/canonicalization/hash metadata, canonical text, body JSON, actor/time; unique artifact/number and artifact/hash optional non-unique |
| `artifact_review_snapshots` | ID, artifact, draft ID, number, policy version, immutable canonical/hash/body metadata, submitter/time; unique artifact/number and unique request source as appropriate |
| `artifact_approval_requests` | ID, artifact/snapshot, number, state, revision, required slots JSON validated by contract, binding decision ID, open/close metadata; one partial unique open request/artifact |
| `artifact_approval_decisions` | ID, request/snapshot/artifact, scope, decision, actor/role/comment/time, snapshot hash; partial unique first-binding external decision/request |
| `artifact_baselines` | ID, artifact, major number, source snapshot/hash, predecessor, state/time; unique artifact/major and source snapshot |
| `artifact_deltas` | ID, artifact, base baseline, proposed/current draft, review request, successor baseline, state, revision, rationale/time; at most one open delta per artifact for pilot |
| `artifact_comments` | ID, target type/ID, artifact, parent comment, body, audience ID, state, revision, author/resolution/removal metadata |
| `artifact_comment_mentions` | comment/user key, tenant/project/artifact, mention time; target must be eligible for effective audience |
| `artifact_attachments` | ID, target, artifact, display/media/size/hash metadata, opaque object reference, audience ID, state, revision, actor/time |
| `artifact_audiences` | ID, artifact, declared/effective audience, source, parent audience ID, actor, reason, time; parent must belong to same artifact |
| `artifact_export_requests` | ID, artifact/snapshot/baseline, format, audience, requester, state, idempotency/dedupe key, permission-check times, object reference/hash/expiry, safe failure, revision |

The approval slot JSON is configuration metadata, not domain content. Core identity, state,
numbering, ownership, and relationships remain relational.

### 6.2 Indexes and constraints

- Composite tenant/project primary lookup on every table.
- Unique `(artifact_id, draft_number)`, `(artifact_id, snapshot_number)`,
  `(artifact_id, request_number)`, and `(artifact_id, baseline_major)`.
- Partial unique `artifact_approval_decisions(request_id) WHERE scope =
  'EXTERNAL_BINDING'`.
- Partial unique `artifact_approval_requests(artifact_id) WHERE state = 'OPEN'`.
- Partial unique `artifact_deltas(artifact_id) WHERE state IN ('DRAFT','IN_REVIEW',
  'CHANGES_REQUESTED')` for the pilot one-open-delta rule.
- Index artifact lists by `(workspace_id, project_id, kind_key, updated_at DESC, id DESC)`.
- Index request inbox by `(workspace_id, state, opened_at, id)` and decision actor/time.
- Index comments by `(artifact_id, target_type, target_id, created_at, id)` with audience in the
  covering projection.
- Index attachments by target/state/audience; never index object references for client queries.
- Index export polling by requester/state/created time and worker claims by state/available time.
- Check hash length 32 bytes, canonicalization/hash algorithms, positive revisions/counters,
  required close metadata, state/pointer consistency, baseline predecessor order, and attachment
  metadata bounds.
- Composite foreign keys include tenant/project/artifact where practical to prevent cross-tenant
  relationship construction.
- Insert-only triggers protect immutable tables. A direct SQL tamper test must prove each trigger.

### 6.3 Migration, rollback, and retention

- Generate one additive checked-in Drizzle migration after an owner is assigned and implementation
  is authorized; never use runtime `push`.
- Test from empty, W0, W1, and the validated M2 migration state. The M2-to-S3 path is the required
  predecessor proof.
- No production backfill is expected because no artifact rows exist. The M2 outcome placeholder is
  left unchanged.
- Before staging, create and restore-verify a PostgreSQL backup and record only its approved
  location, byte size, SHA-256, and restoration result.
- After shared deployment, recovery is a forward fix. Down migration/drop is allowed only in a
  disposable local/test database.
- If the web deploy must be disabled after migration, keep additive tables dormant behind the
  feature flag; do not drop immutable history.
- Approved snapshots, decisions, and baselines follow project/workspace retention. Recoverable
  deletion hides them for 30 days; authorized restore reactivates the same IDs; eventual purge
  removes bodies/object references and writes a non-content receipt under S13 policy.
- Export objects have a shorter explicit expiry and are regenerated from an authorized immutable
  snapshot. Expiry never deletes the underlying baseline.

## 7. API and Contract Design

### 7.1 Commands

- `CreateArtifact`
- `SaveDraftRevision`
- `SubmitArtifactForReview`
- `RequestArtifactChanges`
- `DecideInternalApproval`
- `DecideExternalApproval`
- `CancelApprovalRequest`
- `CreateDelta`
- `ResolveDeltaToBaseline`
- `SetArtifactAudience`
- `CreateComment`, `UpdateComment`, `ResolveComment`, `RemoveComment`
- `RegisterAttachmentReference`, `MarkAttachmentAvailable`, `RemoveAttachment`
- `RequestArtifactExport`, `CancelArtifactExport`

Every command parses a schema-versioned contract, takes a server-derived actor/context,
`expectedRevision`, UUIDv7 idempotency key, and correlation ID, then writes domain change, audit,
outbox, and idempotency completion atomically.

### 7.2 Queries and DTOs

- `ListArtifacts`, `GetArtifactSummary`
- `GetDraft`, `ListDraftHistory`
- `GetReviewSnapshot`, `GetApprovalRequest`, `ListApprovalHistory`
- `GetCurrentBaseline`, `ListBaselines`, `GetBaseline`
- `CompareArtifactVersions`
- `ListComments`, `ListAttachments`
- `BuildArtifactSearchProjection`
- `GetArtifactExportStatus`
- `GetAuthoritativeArtifactContext` — returns approved Baseline only, never Draft/ReviewSnapshot

DTOs are explicit audience-specific selections. Client DTO schemas must not contain Team-only
optional fields; omission is constructed server-side, not by serializing then deleting keys.

### 7.3 Route groups

Use same-origin versioned Route Handlers under:

```text
/api/workspaces/[workspaceId]/projects/[projectId]/artifacts
/api/workspaces/[workspaceId]/projects/[projectId]/artifacts/[artifactId]
/api/workspaces/[workspaceId]/projects/[projectId]/artifacts/[artifactId]/drafts
/api/workspaces/[workspaceId]/projects/[projectId]/artifacts/[artifactId]/reviews
/api/workspaces/[workspaceId]/projects/[projectId]/artifacts/[artifactId]/reviews/[requestId]/decisions
/api/workspaces/[workspaceId]/projects/[projectId]/artifacts/[artifactId]/baselines
/api/workspaces/[workspaceId]/projects/[projectId]/artifacts/[artifactId]/deltas
/api/workspaces/[workspaceId]/projects/[projectId]/artifacts/[artifactId]/diff
/api/workspaces/[workspaceId]/projects/[projectId]/artifacts/[artifactId]/comments
/api/workspaces/[workspaceId]/projects/[projectId]/artifacts/[artifactId]/attachments
/api/workspaces/[workspaceId]/projects/[projectId]/artifacts/[artifactId]/audience
/api/workspaces/[workspaceId]/projects/[projectId]/artifacts/[artifactId]/exports
```

Route Handlers authenticate, derive IDs/actor/role/MFA/correlation on the server, parse bounded
input, and delegate. They never trust client audience, role, approval slot, content hash, canonical
body, or current revision.

### 7.4 Error taxonomy

Retain existing codes and semantics:

| Code | HTTP | Artifact meaning |
| --- | ---: | --- |
| `UNAUTHENTICATED` | 401 | No valid principal |
| `MFA_REQUIRED` | 403 | Audited Admin override/share action lacks recent step-up |
| `FORBIDDEN` | 403 | Non-enumerating collection/action denial where safe |
| `NOT_FOUND` | 404 | Missing, foreign tenant/project, or unauthorized entity |
| `REVISION_CONFLICT` | 409 | Stale mutable aggregate; return only current revision and safe summary |
| `INVALID_TRANSITION` | 409 | State edge is not allowed |
| `APPROVAL_CLOSED` | 409 | Request already has a closing/binding outcome |
| `READINESS_FAILED` | 422 | Adapter approval-readiness requirements are unmet |
| `VALIDATION_FAILED` | 400 | Schema, canonicalization, bounds, or audience input invalid |
| `IDEMPOTENCY_KEY_REUSED` | 409 | Same scoped key has different intent hash |
| `DEPENDENCY_UNAVAILABLE` | 503 | Queue/export/object adapter unavailable |

Extend safe error `details` with optional `artifactState`, `requestState`, and
`bindingDecision = APPROVED | REJECTED` only for an actor already authorized to view that request.
Never return body content, comments, client identities, hidden counts, or object references in an
error.

### 7.5 Revision conflict UX contract

`REVISION_CONFLICT` returns the current aggregate revision, last safe update time, and a reload URL.
It does not return a hidden current body. The editor preserves the user's unsaved local input,
announces the conflict, offers “Review current version” and “Copy my changes,” and requires an
explicit rebase/retry with the new expected revision. There is no automatic last-write-wins retry.

### 7.6 Audit and outbox events

Append safe summaries and versioned events such as:

- `artifact.created.v1`
- `artifact.draft-revision-saved.v1`
- `artifact.review-submitted.v1`
- `artifact.approval-decided.v1`
- `artifact.review-closed.v1`
- `artifact.baseline-created.v1`
- `artifact.delta-created.v1`
- `artifact.audience-changed.v1`
- `artifact.comment-created.v1`
- `artifact.mention-created.v1`
- `artifact.attachment-state-changed.v1`
- `artifact.export-requested.v1`

Payloads carry IDs, kind/state, audience class, hash where safe, actor, correlation, and revision.
They do not carry artifact/comment bodies, filenames not explicitly allowlisted, object references,
or Team-only text.

## 8. State Machines and Authorized Transitions

### 8.1 Artifact and review

```text
DRAFT --submit--> IN_REVIEW --all required approvals--> APPROVED
  ^                    |
  |                    +--changes requested/reject/cancel--> CHANGES_REQUESTED
  |                                                            |
  +------------------------resume editing/new revisions---------+

APPROVED --create delta--> DELTA_DRAFT --submit--> DELTA_IN_REVIEW
   ^                                              |
   +----------new baseline when approved----------+
```

- Create: PM; Lead only if the kind policy grants creation.
- Save Draft: PM/Lead/Contributor according to adapter policy, only without an open review.
- Submit: PM after adapter readiness passes.
- Changes Requested: required internal approver; external reject only where external approval is
  part of the frozen request.
- Approve: required active role; client approval only for policy slots that allow it.
- Cancel: PM with reason; closes request without a baseline.
- Resubmit: PM; always freezes a new snapshot and creates a new request even when the content hash
  matches an earlier snapshot.
- Approved content is never edited. A post-approval change begins a Delta from the current
  Baseline.

### 8.2 Approval request/decision

```text
OPEN --internal decision recorded--> OPEN
OPEN --external approve recorded--> OPEN or APPROVED
OPEN --all required slots satisfied--> APPROVED
OPEN --changes requested--> CHANGES_REQUESTED
OPEN --external reject--> REJECTED
OPEN --PM cancel--> CANCELLED
```

Decision records are append-only. Duplicate same-intent retries replay. A second decision by the
same slot is rejected unless the policy explicitly allows another independent required slot.

### 8.3 Baseline and delta

```text
Baseline CURRENT --successor approved--> SUPERSEDED
Delta DRAFT --> IN_REVIEW --> APPLIED
                      |          |
                      +--> CHANGES_REQUESTED / REJECTED / CANCELLED
```

A rejected/cancelled Delta does not change the current Baseline. `APPLIED` requires one new
Baseline linked to the Delta and base Baseline in the same transaction.

### 8.4 Comments

```text
OPEN --resolve--> RESOLVED --reopen--> OPEN
OPEN/RESOLVED --remove--> REMOVED
```

Author may edit/remove their comment while authorized; PM may moderate with reason; resolve/reopen
requires an authorized reviewer. Every mutation uses expected revision. A mention may target only
an active principal who can view the comment's effective audience.

### 8.5 Attachments

```text
PENDING --trusted object available--> AVAILABLE
PENDING --scan/provider failure--> QUARANTINED or FAILED
AVAILABLE/PENDING/FAILED --remove--> REMOVED
```

S3 exposes no public transition that manufactures `AVAILABLE`; only the trusted attachment port
may do so after M3. Client reads/downloads require `AVAILABLE` and effective Client-visible
audience at access time.

### 8.6 Audience

Audience history is append-only. An authorized share/unshare command adds a new current root
Audience record and increments Artifact revision. Child audience changes add a new child record
and increment the child revision. Broadening requires PM; Admin override requires recent TOTP and
reason. Clients cannot change audience.

## 9. Race-Safe First-Binding External Decision

### 9.1 Invariant

For one ApprovalRequest, at most one committed ApprovalDecision with
`scope = EXTERNAL_BINDING` exists. If present, its `APPROVE` or `REJECT` outcome is permanently
binding for that request. Exactly one outcome exists after at least one valid concurrent attempt
commits.

### 9.2 Transaction

Use this fixed lock order for every request-changing command:

1. claim/check the scoped idempotency record;
2. `SELECT` the tenant/project Artifact `FOR UPDATE`;
3. `SELECT` the ApprovalRequest and ReviewSnapshot in that artifact `FOR UPDATE`;
4. re-evaluate active workspace and Client Stakeholder assignment and snapshot audience;
5. verify request `OPEN`, external slot required, expected Artifact/request revision, and no
   binding decision;
6. insert the immutable decision; the partial unique index is the final guard;
7. set `binding_decision_id`, increment request/artifact revisions, and close immediately on
   reject;
8. on approve, create the Baseline in this transaction only if every frozen required slot is now
   satisfied;
9. append audit/outbox and complete idempotency result; and
10. commit.

The row lock serializes two decisions for the same request. The unique partial index protects
against a missed application lock or future code path. No external notification/provider call
occurs inside the transaction.

### 9.3 Outcomes and retries

- Same idempotency key + same intent: return the original committed decision/result with
  `replayed: true`.
- Same idempotency key + different intent: `IDEMPOTENCY_KEY_REUSED`.
- Different keys racing: the winner commits; the waiter re-reads the locked request and receives
  `APPROVAL_CLOSED` plus the safe binding outcome. It never writes a second decision.
- Connection loss after commit: retry with the same key returns the committed result.
- Deadlock/serialization failure: repository may make a small bounded retry only for PostgreSQL
  `40P01`/`40001`, with the same command/idempotency identity and jitter; exhaustion returns a safe
  retryable dependency error. Correct fixed lock order should make this exceptional.
- Unauthorized/removed stakeholder: safe 404, no idempotency completion that could reveal the
  request.

Required integration proof uses two independent PostgreSQL connections synchronized at the
decision barrier and tests both approve/reject orderings over repeated/property-generated runs.

## 10. UI Architecture

### 10.1 Page and component boundary

Add a bookmarkable Artifact workspace under:

```text
/workspaces/[workspaceId]/projects/[projectId]/artifacts/[artifactId]
```

Server Components load authorized summary/snapshot/baseline/history DTOs. Small Client Components
own editor fields, dialogs, comment composition, diff controls, pending states, and conflict
recovery.

Reusable app patterns:

- `ArtifactEditorShell` — registry descriptor, save status, revision, readiness, submit action.
- `ReviewSnapshotView` — unmistakable frozen/hash/version metadata and read-only body.
- `ApprovalPanel` — required slots, recorded decisions, authoritative confirm/reject actions.
- `BaselineHistory` — current/superseded list with monotonic numbers and immutable metadata.
- `ArtifactDiffView` — section/path navigation, linear summary, before/after values.
- `CommentThread` — effective audience, mention eligibility, resolve/reopen/remove.
- `AttachmentList` — truthful pending/available/quarantined/failed/removed states.
- `AudienceControl` — explicit current/effective audience, inheritance explanation, share warning.
- `RevisionConflictPanel` — preserved local input, current revision, reload/copy/rebase actions.

`packages/ui` gains only general-purpose source-owned primitives such as Dialog/AlertDialog,
Textarea, Tabs or Disclosure, live StatusMessage, visually hidden text, and confirmation layout.
Only that package imports Base UI. Artifact policy and data fetching remain outside `packages/ui`.

### 10.2 Interaction rules

- Never optimistically display approval, rejection, audience sharing, baseline creation, export
  completion, or attachment availability.
- Autosave is debounced but every write carries the editor's expected revision and a stable
  per-attempt idempotency key. Show Saved/Saving/Conflict/Offline/Error truthfully.
- An open review makes the editor read-only. After a closing decision, “Create next draft” starts
  from the latest allowed content and preserves the frozen snapshot.
- Approval/reject dialogs repeat artifact name, snapshot number/hash prefix, effect, and audience.
  Reject/changes-requested requires a comment before confirmation.
- The review screen clearly distinguishes working draft, snapshot under review, and current
  approved baseline.
- Client views never render placeholders/counts suggesting hidden Team-only children.

### 10.3 Accessibility and responsive behavior

- Use native semantic headings, lists, forms, buttons, tables, and `<ins>/<del>` where appropriate;
  use ARIA only when a native element cannot express the pattern.
- Provide programmatic labels/descriptions/errors, fieldset/legend approval groups, and status
  messages announced without moving focus.
- Dialog focus enters at a safe descriptive/control target, remains contained, and returns to the
  trigger. Destructive/binding decisions use error-prevention confirmation.
- Keyboard order follows document meaning. Diff navigation, history, comments, attachment actions,
  and audience controls are fully operable without pointer/drag interaction.
- Diff meaning uses text/icon/position in addition to color; removed content remains readable to
  assistive technology.
- On conflict, focus moves to the conflict heading only when necessary to understand the failed
  save; unsaved content remains reachable and copyable.
- At 320 CSS pixels and 200% zoom, split panes become a single ordered stream, tables become
  labeled cards or scroll within a named region only when semantically necessary, sticky controls
  do not obscure focus, and there is no viewport-level horizontal overflow.
- Meet WCAG 2.2 AA focus visibility/not-obscured, target size, status messages, error
  identification/suggestion, and error prevention across desktop Chromium and Pixel 7.

## 11. Worker and Background Boundaries

Background work is used only when required:

- **Exports:** always asynchronous. Request transaction freezes target snapshot/baseline and
  audience intent, emits an outbox event, and returns a polling ID. Worker re-authorizes requester
  and recomputes effective audience immediately before rendering. It writes an immutable,
  expiring object through the existing provider port and stores only safe result metadata.
- **Diffs:** synchronous for bounded pilot bodies. If measured limits are exceeded, enqueue a
  content-hash/audience-keyed cache job; the immutable snapshots remain the source of truth.
- **Notifications:** outbox events may create deduplicated in-app/email pending-action work.
  Notification content contains safe artifact identity and link, not body/comment/Team-only text.
- **Attachments:** no upload/scan worker is introduced. S3 consumes only trusted future attachment
  state events from M3.

Job contract includes job ID, event ID, tenant/project/artifact, immutable target ID/hash, requested
audience, requester, format/adapter version, correlation ID, attempt, and cancellation state.
Deduplication key includes operation + target hash + audience + format + requester. Consumers are
at-least-once, record processed event/job identity, classify retryable/terminal/user-actionable
failures, use bounded exponential backoff, expose dead-letter state, and never mark partial output
successful.

Permission or audience loss before rendering cancels the export safely. Permission loss after
rendering but before download causes download authorization to fail and the object to expire; a
signed URL is never persisted or logged.

## 12. Observability, Audit, Privacy, and Security

### 12.1 Allowlisted telemetry

Logs/metrics/traces may contain correlation ID, safe tenant/project/artifact IDs, kind, state,
revision, snapshot/baseline number, hash prefix only when operationally useful, result/error code,
duration, queue attempt/lag, audience class, and replay flag.

They must not contain artifact or comment bodies, diff values, Team-only fields, attachment
filenames unless explicitly classified safe, object references/URLs, export content, approval
comments, mention text, email, cookies, authorization headers, or credentials.

Metrics:

- save/submit/decision/baseline latency and result class;
- revision-conflict and idempotency-replay counts;
- external decision contention/closed-loser counts;
- audience denials by operation without foreign target labels;
- export queue age/retry/dead-letter/expiry;
- diff duration/body-size bucket;
- outbox lag and processed-event dedupe; and
- immutable-trigger violation/security alert.

### 12.2 Audit

Audit artifact create/save/submit/close/decision/baseline/delta/audience/comment moderation/
attachment state/export and privileged reads. Approval audit references immutable snapshot/hash and
decision ID. Audit before/after summaries contain state/revision/audience/IDs, never bodies.

### 12.3 Threat and privacy tests

- Cross-workspace/project/artifact IDOR for every query/mutation/child/export/download.
- Forged actor, project role, audience, snapshot/hash, approver slot, MFA time, expected revision,
  idempotency identity, target type, and object reference.
- Team-only leak through direct read, nested child, count, pagination, mention chooser, activity,
  search index/result/snippet, notification, diff, export request/job/download, cache, or error.
- First-binding approve/reject race, replay, request close, role removal, stale review, and direct
  database duplicate attempt.
- Snapshot/baseline/audit/decision update/delete tamper.
- Unsafe JSON, prototype-pollution keys, enormous/deep bodies, non-finite/precision/Unicode edge
  cases, Markdown/HTML/script/formula injection, and diff denial-of-service.
- CSRF on cookie mutations, XSS/output encoding, rate/size limits, cursor enumeration, and log/
  telemetry redaction.
- Export authorization changes between request, render, and download.
- No real client/project/user/document/production data in tests or screenshots.

No unresolved Critical/High security, privacy, tenant, audience, data-loss, or immutable-history
finding may enter the exit gate.

## 13. Affected Files and Modules

Exact generated migration names are determined by Drizzle at implementation time.

### 13.1 Create

- `packages/contracts/src/artifacts.ts`
- `packages/contracts/src/artifacts.test.ts`
- `packages/domain/src/artifacts.ts`
- `packages/domain/src/artifacts.test.ts`
- `packages/application/src/artifacts.ts`
- `packages/application/src/artifacts.test.ts`
- `packages/database/src/artifact-store.ts`
- `packages/database/drizzle/0003_<generated>.sql`
- `packages/database/drizzle/meta/0003_snapshot.json`
- `apps/web/lib/artifact-api.ts`
- Artifact Route Handlers under the route groups in Section 7.3
- Artifact page and focused components under
  `apps/web/app/workspaces/[workspaceId]/projects/[projectId]/artifacts/`
- Required general UI primitives/tests under `packages/ui/src/components/`
- `tests/integration/artifact-kernel.test.ts`
- `tests/e2e/artifact-kernel.spec.ts`
- `docs/validation/w2-shared-artifact-kernel.md` during validation, not implementation start

### 13.2 Modify

- `packages/contracts/src/index.ts`
- `packages/contracts/src/errors.ts`
- `packages/contracts/src/outbox.ts`
- `packages/domain/src/index.ts`
- `packages/application/src/index.ts`
- `packages/database/src/schema.ts`
- `packages/database/src/index.ts`
- `packages/test-support/src/index.ts`
- `packages/ui/src/index.ts`
- `apps/web/lib/auth.ts`
- `apps/web/lib/api.ts`
- `apps/web/app/workspace-app.tsx` and/or `registry-panels.tsx` only for authorized navigation
- `apps/worker/src/main.ts`
- `tests/migrations/migrations.test.ts`
- `tests/helpers/database.ts` for a validated M2 migration checkpoint
- `tests/e2e/project-registry.spec.ts` only for retained M2 regression integration if navigation
  changes
- `docs/core/technology-decisions.md` only if implementation departs from accepted architecture or
  adds a durable technology choice
- `docs/planning/implementation-roadmap.md` only under the status-transition checklist and only
  after implementation authorization

### 13.3 Verify without expected modification

- `AGENTS.md`
- `docs/README.md` and all authoritative parents linked in this plan
- `docs/planning/w2-m2-client-project-registry.md`
- `docs/validation/w2-m2-client-project-registry.md`
- `packages/database/src/platform-store.ts`
- `packages/database/src/project-store.ts`
- identity/project authorization and invitation paths
- `packages/ingestion/**` and `services/ocr/**` remain outside S3
- `compose.yaml`, Dockerfiles, Railway/provider configuration, and production secrets
- the pre-existing `apps/web/next-env.d.ts` change remains unrelated and preserved

## 14. Ordered Implementation Slices

Each slice is a small reviewable change with an independent verification point. Do not begin Slice
A until owner and authorization gates pass and the roadmap is synchronized to `In Progress`.

1. **Gate and traceability.** Freeze the approved plan commit, assign owner in the roadmap, set
   summary and Section 6.2 to `In Progress`, create exact test IDs/manifest mappings.
   - Verify: docs checks, roadmap synchronization, M2 still `Complete` with evidence.
2. **Canonicalization and registry.** Add canonical value types, RFC-compatible serializer/hash,
   adapter registry, historical readers, and test-only adapter.
   - Verify: official RFC vectors, randomized key order/property tests, invalid Unicode/number/
     precision tests, identical hash across processes.
3. **Pure lifecycle and audience policies.** Add state machines, approval slot evaluation,
   audience lattice/inheritance, diff DTO/policy, and authorization matrix.
   - Verify: exhaustive transition/property and role/audience tests.
4. **Contracts and errors.** Add commands, results, DTOs, job/events, safe error details, and export
   polling contracts.
   - Verify: Zod contract tests, schema-version compatibility, unknown-field/size rejection.
5. **Schema and migration.** Add tables, constraints, indexes, immutable triggers, and generated
   migration.
   - Verify: empty/W0/W1/M2 migrations, schema introspection, direct tamper/constraint tests,
     disposable rollback and forward-fix rehearsal.
6. **Artifact store core.** Implement create/save/submit/history with fixed lock order,
   idempotency, revisions, audit, and outbox.
   - Verify: real PostgreSQL transaction rollback, replay, stale editor, snapshot freeze, numbering.
7. **Approval/baseline/delta store.** Add internal/external decisions, request close/resubmit,
   baseline allocation/supersession, and Delta resolution.
   - Verify: two-connection approve/reject races, repeated property runs, immutable baseline,
     monotonic numbering.
8. **Audience-safe children and projections.** Add audience history, comments/mentions, attachment
   references, authoritative-context/search/export projection builders.
   - Verify: exhaustive internal/client matrix across reads/counts/search/diff/export/
     notifications and IDOR.
9. **HTTP data-access boundary.** Add server-only store wiring and Route Handlers with safe errors,
   CSRF/input bounds, and server-derived authorization.
   - Verify: HTTP contract/adversarial tests for every actor and foreign/missing ID.
10. **Reusable UI.** Add artifact page, editor/review/approval/history/diff/comments/attachments/
    audience/conflict patterns and minimal UI primitives.
    - Verify: component semantics, keyboard/focus/live regions, stale-editor recovery, desktop/
      mobile visual fixtures.
11. **Worker export/notification behavior.** Add versioned export job and deduplicated pending
    action processing; do not add ingestion/OCR.
    - Verify: retry/dead-letter/cancel/dedupe, permission loss at render/download, no body logging.
12. **Integrated local acceptance.** Run complete internal and external flows on real PostgreSQL/
    Redis with deterministic fake/test artifacts only.
    - Verify: full automated suite, coverage review, production build, local web/worker smoke.
13. **Staging validation and evidence.** Backup/restore, migrate, deploy reviewed revision, exercise
    public desktop/mobile role flow, inspect health/readiness/jobs/logs/metrics, and write the
    validation record.
    - Verify: every matrix row below has stable evidence before `In Validation` exit assessment.

## 15. Testing and Acceptance

### 15.1 Test strategy

- **Unit/property:** canonicalization/hash, registry compatibility, state machines, approval slots,
  audience lattice, numbering, diff, safe summaries, and transition completeness.
- **Contract:** all command/query/result/event/job/error DTOs and backwards-read schema fixtures.
- **Application:** role policies, readiness delegation, idempotency behavior, authorized context,
  and dependency failures.
- **Repository/integration:** real PostgreSQL locks/constraints/triggers, atomic audit/outbox/
  idempotency, two-connection races, bounded queries, and safe not-found.
- **Migration:** empty/W0/W1/M2 forward paths, metadata preservation, trigger/index existence,
  repeatability, and forward-fix rehearsal.
- **Authorization/IDOR:** every entity family and projection across two workspaces, two projects,
  mixed roles, Admin override, Client Stakeholder, deactivated members, and audience changes.
- **Concurrency:** stale writers, autosave races, submit/save race, simultaneous internal
  decisions, approve/reject first binding, baseline allocation, comment edits, audience changes,
  export replays, and worker dedupe.
- **Component:** every lifecycle/error/empty/loading/pending/conflict/partial state, semantic diff,
  confirm dialogs, focus restoration, status announcements, and audience explanation.
- **End-to-end:** internal artifact lifecycle plus external Requirement-policy fixture, client-safe
  read/comment/export, reject/resubmit, stale editor, baseline history/diff, and Team-only denial.
- **Accessibility:** axe, keyboard-only complete process, focus order/visibility/restoration,
  screen-reader status/name/role/value review, 200% zoom, 320 CSS-pixel reflow, Pixel 7, reduced
  motion, non-color diff.
- **Security/operations:** source/dependency/container scans, DAST/manual abuse, telemetry
  redaction, backup/restore, migration/deploy, worker/outbox health, queue failure, and bounded load.

### 15.2 Required scenario acceptance criteria

| Scenario | Acceptance criterion |
| --- | --- |
| Frozen review | Submission persists snapshot canonical bytes/hash. Save is rejected while review is open. Editing after close creates a new DraftRevision; old snapshot bytes/hash remain identical and SQL update/delete fails. |
| First-binding external decision | Simultaneous eligible approve/reject transactions yield one immutable binding row and one safe closed outcome in both orderings; retries do not duplicate decisions/audit/events/baselines. |
| Reject/changes requested then resubmit | Closing decision returns the artifact to editable flow. Resubmit creates larger snapshot/request numbers and new IDs even for equal content; earlier request/snapshot remain closed/immutable. |
| Immutable monotonic baselines | Approval creates `1.0`, next approved Delta creates `2.0`; concurrent allocation cannot duplicate/skip due to a failed transaction; prior body/hash/number never changes. |
| Audience-safe client operations | Client direct read, child list/count, comment, attachment metadata/download, search result/snippet, diff, notification, export request/render/download never contains or signals Team-only child content. |
| Stale editor | Two editors start at revision N; first save commits N+1; second receives 409 `REVISION_CONFLICT` with N+1 and cannot overwrite. UI preserves local input and requires explicit rebase/retry. |

### 15.3 S3 exit gate

The kernel may pass only when:

- every mapped FR and required scenario above has a stable test/evidence link;
- all supported kinds can register without kernel table/API changes, proven by at least two
  materially different test adapters;
- canonical serialization/hash is repeatable across runs and historical schemas remain readable;
- snapshot/decision/baseline/audit immutability and monotonic numbering pass in PostgreSQL;
- first-binding decision race evidence passes repeatedly with independent connections;
- cross-workspace, cross-project, state, role, audience, search, export, notification, attachment,
  and future-MCP projection tests deny safely;
- complete desktop/mobile internal and external review flows meet WCAG 2.2 AA;
- migration, backup/restore, deploy, health/readiness, worker/outbox, safe logs/metrics, and
  rollback/forward-fix evidence pass;
- retained W0/M1/M2 regressions pass;
- no unresolved Critical/High finding remains; and
- the validation record is linked from both roadmap locations before `Complete`.

M3, M4, or M5 must not register module-specific production schemas until this exit gate is
`Complete` in the roadmap.

## 16. Exact Validation Commands

Use repository-supported commands from the repository root. The focused commands give fast
feedback; the full gates remain mandatory.

```bash
git status --short
git diff --check
pnpm exec vitest run packages/contracts/src/artifacts.test.ts packages/domain/src/artifacts.test.ts packages/application/src/artifacts.test.ts
TEST_DATABASE_URL=postgresql://delivery_os:delivery_os_local@127.0.0.1:55432/delivery_os pnpm exec vitest run tests/integration/artifact-kernel.test.ts
TEST_DATABASE_URL=postgresql://delivery_os:delivery_os_local@127.0.0.1:55432/delivery_os pnpm test:migrations
pnpm exec playwright test tests/e2e/artifact-kernel.spec.ts
```

Full local gate:

```bash
pnpm install --frozen-lockfile
docker compose up -d postgres redis minio minio-init mailpit clamav
pnpm db:migrate
TEST_DATABASE_URL=postgresql://delivery_os:delivery_os_local@127.0.0.1:55432/delivery_os pnpm check
TEST_DATABASE_URL=postgresql://delivery_os:delivery_os_local@127.0.0.1:55432/delivery_os pnpm test:coverage
pnpm test:migrations
pnpm test:e2e
```

Explicit gate components for evidence:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm check:dependencies
pnpm check:docs
pnpm test
pnpm build
```

Staging after reviewed backup/migration/deploy:

```bash
PLAYWRIGHT_BASE_URL=https://your-web-domain.example pnpm exec playwright test tests/e2e/artifact-kernel.spec.ts
```

Run the repository CI secret scan and all web/worker/OCR container scans unchanged. Record commands,
source revision, service/image revisions, migration version, and sanitized results in the
validation record.

## 17. Risks, Recovery, Manual Steps, and Deferred Checks

| Risk | Mitigation/recovery |
| --- | --- |
| Canonicalization drift changes hashes | Version canonicalization, RFC vectors, cross-process golden fixtures, never rewrite old bodies |
| Approval race records two outcomes | Artifact/request row locks, partial unique index, fixed lock order, independent-connection stress |
| Audience leak through secondary path | One projection interface, pre-pagination filtering, exhaustive operation matrix, deny by default |
| Full draft revisions grow database | Pilot bounds/metrics; retain full revisions for safety; defer measured compaction that preserves hashes |
| Generic registry becomes module logic dump | Narrow adapter interface; module package owns schema/readiness/editor descriptor |
| Rich diff is inaccessible or expensive | Semantic linear fallback, bounded synchronous work, hash-keyed async cache only after measurement |
| Attachment records imply unsafe upload | Truthful unavailable/pending UI; only trusted future M3 port can mark available |
| Export access changes mid-job | Recheck at request, render, and download; short expiry; no persistent signed URL |
| Migration deploy fails | Verified backup/restore, additive dormant schema, feature flag, forward fix |
| Existing M1/M2 behavior regresses | Retained unit/integration/E2E suite and current public boundary smoke |

Manual account/environment steps, only after implementation authorization:

- Founder assigns a named owner and explicitly authorizes implementation.
- Owner approves the plan/specification commit and any founder decisions in Section 2.4.
- Repository publication/required CI requires GitHub access.
- Staging backup, migration, deployment, runtime logs/metrics, and public browser evidence require
  authorized Railway access.
- Controlled external approval/email evidence requires approved Resend test identities/inbox
  access; no credential or message body enters source/chat/evidence.
- Product/security owners review sanitized external visibility/export and first-binding evidence.

Deferred checks:

- M3 binary attachment upload/quarantine/scan/OCR/provider contracts.
- Real Requirement readiness/schema and friendly-client approval content.
- M4/M5 adapters and their module-specific approval/body/diff rules.
- M8 portal navigation and client notification copy.
- M10 MCP resources/tools using the same audience projection.
- S13 final retention/purge, controlled-pilot load, DAST, and full dogfood.

## 18. Official Guidance Reviewed

No dependency upgrade or external service is required. Recheck official guidance and exact package
pins at implementation start and validation.

- [PostgreSQL explicit row locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [PostgreSQL transaction isolation and retry behavior](https://www.postgresql.org/docs/current/transaction-iso.html)
- [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [RFC 8785 JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html)
- [RFC 8785 verified errata](https://www.rfc-editor.org/errata/rfc8785)
- [RFC 6902 JSON Patch](https://www.rfc-editor.org/rfc/rfc6902.html)
- [Node.js `crypto.createHash`](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptocreatehashalgorithm-options)
- [AWS transactional outbox guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WAI-ARIA Authoring Practices patterns](https://www.w3.org/WAI/ARIA/apg/patterns/)

## 19. Recommended Implementation-Status Transition Checklist

- [x] Founder resolves/accepts Section 2.4 decisions.
- [x] Founder explicitly authorizes production implementation.
- [x] A named module owner is assigned in the roadmap.
- [x] Implementation agent rechecks that M2 is `Complete` with stable evidence.
- [ ] Approved plan/specification commit is recorded.
- [x] In the same change that starts Slice A, roadmap summary and Section 6.2 both move to
      `In Progress`.
- [ ] All mapped acceptance, security, privacy, accessibility, migration, concurrency, worker,
      staging, and operational checks are run and recorded.
- [ ] `docs/validation/w2-shared-artifact-kernel.md` is created with the exact reviewed/deployed
      revisions and sanitized evidence.
- [ ] Both roadmap locations link that validation record and move together to `In Validation`.
- [ ] Product/engineering/security owners assess the S3 exit gate.
- [ ] If every exit condition passes, both roadmap locations move to `Complete`.
- [x] If any exit condition fails, both locations move to `Blocked` with owner, opened date,
      clearing condition, and linked issue/decision.
- [ ] M3/M4/M5 schema implementation remains blocked until the kernel is `Complete`.

## 20. Implementation-Ready Summary

### Decisions

- Extend the validated modular-monolith transaction/authorization/outbox patterns.
- Use a code-owned versioned kind registry, RFC 8785-compatible canonical JSON, and Node SHA-256.
- Persist append-only full revisions/snapshots/decisions/baselines; use full-state successor
  drafts for deltas.
- Serialize external decisions with Artifact/ApprovalRequest row locks and a partial unique index.
- Apply one server-side restrictive audience projection to reads, children, search, notifications,
  exports, downloads, and future MCP.
- Add no runtime dependency or external service.

### Constraints

- Roadmap status remains `Blocked` until isolated staging and a reviewed revision allow the
  operational exit-gate evidence to be collected.
- No M3 storage/ingestion/OCR/malware scope or module-specific body schemas.
- No real or production data; preserve unrelated worktree changes.
- Approved content and decision history are immutable; stale writes never overwrite.

### Files to edit

- Create the Artifacts contract/domain/application/store, migration, HTTP/UI, integration/E2E, and
  later validation files listed in Section 13.1.
- Modify only the exports, shared errors/outbox/schema/wiring/worker/UI/navigation/migration tests
  listed in Section 13.2.
- Keep ingestion, OCR, production configuration, and the unrelated `next-env.d.ts` change outside
  scope.

### Commands to run

- Run the focused Vitest/PostgreSQL/Playwright commands in Section 16 during each slice.
- Run `pnpm check`, coverage, migration, build, full E2E, CI security scans, and staging
  Playwright before exit assessment.
- Take and restore-verify the authorized staging backup before migration.

### Acceptance criteria

- Frozen review content cannot change.
- Concurrent external approve/reject yields exactly one binding decision.
- Rejection/changes requested plus resubmission creates a new snapshot/request.
- Baselines are immutable and monotonically numbered per artifact.
- No client operation exposes or signals Team-only child content.
- Stale editors receive a recoverable revision conflict.
- Every S3 traceability, migration, authorization, accessibility, concurrency, worker, staging, and
  operational gate passes with linked evidence.

### Known risks/blockers

- Staging validation is blocked until an isolated staging environment and reviewed source revision
  are available; the linked Railway project currently exposes production only.
- Binary attachment availability depends on deferred M3 secure storage.
- Real module adapters and the final client portal arrive in M3/M4/M5/M8.

### Exact resume command/prompt

After a reviewed source revision and isolated staging environment are available:

```bash
cd /srv/dev/workspaces/thaarei/delivery-os && codex "VALIDATE_SHARED_ARTIFACT_KERNEL: verify the reviewed S3 revision and isolated staging environment, backup and restore-verify staging PostgreSQL, deploy and migrate staging, run Section 16 public desktop/mobile and operational checks, create the validation record, synchronize both roadmap locations to In Validation, and stop at the Section 15.3 exit-gate decision."
```
