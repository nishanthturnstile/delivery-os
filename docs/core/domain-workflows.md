# Delivery OS — Domain Model & Workflows

**Status:** Normative implementation specification
**Parent:** [Product Plan](product-plan.md)
**Related:** [Architecture & Contracts](architecture-contracts.md), [Delivery Backlog](../planning/delivery-backlog.md)

This document defines the domain vocabulary, invariants, state transitions, permissions, and approval behavior. If a UI mockup or implementation conflicts with this document, this document controls unless the Product Plan is amended.

## 1. Global Invariants

1. Every tenant-owned record contains a non-null `workspace_id`; project-owned records also contain `project_id`.
2. A user may belong to multiple workspaces. Email domain never grants membership or ownership.
3. Every workspace has at least one active Admin. The last active Admin cannot be demoted or deactivated.
4. Effective access is the intersection of workspace membership, project membership, artifact audience, entity state, and action-specific policy.
5. An approved artifact baseline and a Done completion snapshot are never updated in place.
6. Client approval applies only to the initial external Requirement baseline and later material external changes.
7. Agent origin never changes materiality or approval policy.
8. No automated process rewrites In Progress, In Review, or Done work.
9. All transitions and privileged reads execute inside a transaction, produce an audit event, and enforce optimistic concurrency.
10. The first valid Client Stakeholder decision on a frozen approval request is binding. Later attempts receive `APPROVAL_CLOSED`.
11. Team-only content never appears in client views, client exports, client notifications, AI context authorized for a client, or client search results.
12. AI output is always a proposal. Only human action can approve, accept a source conflict resolution, mark N/A, accept a risk, apply a change set, or move work to Done.

## 2. Identity, Membership, and Authorization

### 2.1 Principals

| Principal | Identity | Notes |
|---|---|---|
| User | Better Auth user ID | Human account with verified email |
| Interactive agent | OAuth client ID + authorizing user ID | Never a standalone project member in the pilot |
| System worker | Internal service identity | Executes queued domain commands; cannot invent user authority |

### 2.2 Membership

- `WorkspaceMembership`: `workspace_id`, `user_id`, role `ADMIN | MEMBER`, state `INVITED | ACTIVE | DEACTIVATED`, timestamps.
- `ProjectMembership`: `project_id`, `user_id`, one or more roles `PM | LEAD | CONTRIBUTOR | VIEWER | CLIENT_STAKEHOLDER`, state, client organization reference when applicable.
- A PM is mandatory for every active project. A Lead is optional.
- A Workspace Admin may perform an emergency project override only through an explicit override command requiring step-up MFA, reason, and audit.

### 2.3 Permission rules

- Admin manages workspace profile, templates, members, security, export, deletion, and recovery.
- PM manages project membership, client visibility, requirements, delivery planning, sprint scope, materiality, and change application.
- Lead co-approves Technical/UX/Feature artifacts when assigned and may manage delivery work.
- Contributor edits assigned work and may contribute to drafts only when granted.
- Viewer is read-only for Team-visible project content.
- Client Stakeholder sees only Client-visible content, submits Client Input, and makes allowed client decisions.
- “Own work” means current primary owner or collaborator with explicit edit permission; ownership does not grant baseline approval.

## 3. Project and Artifact Model

### 3.1 Project lifecycle

| State | Entry gate | Exit behavior |
|---|---|---|
| `DRAFT` | Workspace and PM exist | May move to Intake or Cancelled |
| `INTAKE` | Project profile complete | Planning requires approved Requirement baseline |
| `PLANNING` | Requirement baseline approved | Execution requires Technical baseline or waiver, UX baseline or waiver, approved Module/Feature map, and at least one Ready item |
| `EXECUTION` | Planning gate passes | May return to Planning for material replanning |
| `ON_HOLD` | Reason, owner, review date | Resume returns to prior active state |
| `COMPLETED` | No active sprint, no In Progress/In Review items, completion summary recorded | May return to Execution through audited reopen |
| `CANCELLED` | Reason and disposition of active work | Read-only except export, comments, and restoration by PM/Admin |
| `ARCHIVED` | Completed or Cancelled | Read-only; Admin/PM may unarchive |

### 3.2 Artifact kinds

`REQUIREMENT`, `TECHNICAL_PLAN`, `UX_PLAN`, `FEATURE_SPEC`, `COST_PLAN`.

Each artifact has:

- Stable `artifact_id`, kind, workspace/project, owner, audience, status.
- Mutable Draft head with edit history and `revision`.
- Zero or more immutable `ReviewSnapshot` objects with content hash.
- Zero or more immutable numbered `Baseline` objects.
- Optional `Delta` objects pointing from one baseline to a proposed successor.
- Comments and attachments with their own audience.

### 3.3 Artifact lifecycle

`DRAFT → IN_REVIEW → APPROVED`, with `CHANGES_REQUESTED → DRAFT` and approved baselines later becoming `SUPERSEDED`.

Rules:

- Submitting freezes a Review Snapshot; Draft editing continues only after the review is closed.
- Approval signatures store snapshot ID/hash, actor, role, decision, comment, and time.
- Any content change after submission invalidates the old Draft head but never changes the frozen snapshot.
- A rejection or Changes Requested closes that review request. Resubmission creates a new snapshot and approval request.
- Baseline numbering is monotonic per artifact: `1.0`, `2.0`, etc. Deltas may use internal draft labels but are not baselines.

## 4. Intake, Claims, Gaps, and Requirements

### 4.1 Source model

- `SourceArtifact`: original object key, SHA-256, MIME, size, processing state, uploader, audience, retention state.
- `NormalizedBlock`: deterministic block ID and source locator:
  - PDF: page plus bounding region.
  - DOCX: heading path plus paragraph/table cell.
  - Markdown: heading path plus line range.
  - Text: line range.
- `SourceClaim`: normalized assertion, cited blocks, extraction provenance, support signals, accepted/rejected state.
- `SourceConflict`: competing claims, affected Requirement field, severity, resolution status, selected/authored canonical value, resolver, note.

### 4.2 Gap dispositions

| Disposition | Approval effect |
|---|---|
| `BLOCKING` | Requirement cannot be submitted or approved |
| `RESOLVED` | Canonical value and evidence recorded |
| `NOT_APPLICABLE` | Human justification required |
| `ACCEPTED_RISK` | Owner, rationale, consequence, review date required |

AI cannot assign `NOT_APPLICABLE` or `ACCEPTED_RISK`.

### 4.3 Requirement approval

- Internal project: PM approves the frozen snapshot.
- External project: PM approves/submits, then any active Client Stakeholder may make the first binding client decision.
- A client rejection creates no baseline; the PM revises and resubmits.
- Client approval never implies Technical, UX, feature, sprint, or Done approval.

## 5. Planning and Progressive Elaboration

### 5.1 Module and Feature map

- A Module is both a capability grouping and outcome milestone.
- Required Module fields: name, outcome statement, success criteria, target start/end window, status, priority, rationale, audience, and dependencies.
- A Feature belongs to one Module and captures name, objective, acceptance summary, priority, dependencies, audience, and elaboration state.
- Module/Feature dependencies are directed and typed. A cycle is invalid and blocks readiness.

### 5.2 Elaboration states

Feature states: `OUTLINED → SPECIFYING → INTERNALLY_APPROVED → READY_FOR_BREAKDOWN → DELIVERING → DELIVERED`.

- Distant work remains `OUTLINED`.
- Promoting to the near-term horizon creates or updates a Feature Specification.
- Significant work requires an approved Feature Specification and applicable Technical/UX deltas.
- Compact work is allowed only when it changes no approved behavior or cross-cutting decision and traces to an existing approved Feature Specification.

### 5.3 Feature Specification minimum content

- Objective, actors, and client-visible outcome.
- Behavior scenarios and acceptance rules.
- Business rules, validation, errors, permissions, and edge states.
- Data entities and external/internal interfaces affected.
- Allocated performance, security, privacy, accessibility, and operational requirements.
- UX journeys/states and immutable external design references.
- Technical and UX baseline references/deltas.
- Explicit exclusions, assumptions, risks, and open questions.
- Requirement and source-claim traceability.

## 6. Work Items, Readiness, and Completion

### 6.1 Work types

| Type | Purpose | Required intent |
|---|---|---|
| `OUTCOME_STORY` | Independently testable user/business outcome | Actor/outcome, scenarios, applicable layers |
| `ENABLER` | Technical prerequisite supporting an approved outcome | Enabled capability, consumers, proof |
| `DEFECT` | Approved behavior is not met | Expected vs. actual, reproduction, regression test |
| `SPIKE` | Time-boxed uncertainty reduction | Question, timebox, evidence, decision/output |
| `OPERATIONAL_TASK` | Delivery/operations work | Operational outcome, validation, rollback |

### 6.2 Readiness

An item may enter Ready only when:

- Parent Feature and required specification/design artifacts are approved.
- Acceptance criteria/objective are testable.
- Requirement/spec traceability is complete.
- Applicable UI/backend/data/validation/operations layers are stated; omissions are explained.
- Dependencies are resolved or explicitly planned; no dependency cycle exists.
- Owner-eligible role and required review policy are known.
- VDE range, size, elapsed range, AI fit, uncertainty, consequence risk, estimate basis, and required review policy are present.
- Type-specific DoR is complete.
- XL/U3 work is split, clarified, or converted into a Spike; R3/R4 review rules are assigned.

### 6.3 Work lifecycle

- `BACKLOG → READY`: PM/Lead after readiness validation.
- `READY → IN_PROGRESS`: primary owner, PM, Lead, or authorized MCP agent acting for the owner.
- `IN_PROGRESS ↔ READY`: return requires reason; estimate-at-start remains in history.
- `IN_PROGRESS → IN_REVIEW`: requires implementation report and completed implementer DoD entries.
- `IN_REVIEW → IN_PROGRESS`: reviewer requests changes with findings.
- `IN_REVIEW → DONE`: authorized human review, complete DoD, no blocking defect, completion snapshot.
- `DONE`: no reopen. Behavioral follow-up creates a successor.

`Blocked` is a separate record linked to Ready/In Progress/In Review work and stores severity, reason, owner, dependency/person reference, opened time, target, resolution, and closed time.

### 6.4 Implementation report

Required fields:

- Summary of implementation.
- Affected components and files, expressed as text; repository integration is not required.
- Acceptance-criterion result per criterion.
- Test command/result records and manual validation.
- Applicable DoD evidence.
- Unresolved risks, limitations, or follow-ups.
- Optional commit/PR/build/deployment references.
- Originating user, optional OAuth client, submitted time, and evidence hash.

### 6.5 Human review and Done

- Reviewer may be PM, Lead, or permitted Contributor.
- Self-review is allowed with explicit validation evidence unless project risk policy requires a different user.
- Completion Snapshot freezes work type, scope, criteria, trace links, the complete estimate-at-start, aggregate actual VDE band, elapsed cycle time, DoD, implementation report, reviewer, and decision.
- Comments, later operational evidence, and audited non-substantive metadata corrections are append-only around the snapshot.

## 7. Sprint and Forecasting Rules

- Sprint cadence is set per project to 1 or 2 weeks; default is 1.
- Starting a Sprint freezes `SprintCommitment` containing goal, selected work, capacity assumptions, and forecast.
- Scope additions/removals require PM/Lead, reason, timestamp, and `SprintScopeChange`.
- Reports show initial commitment, current scope, completed initial work, added work, and removed work separately.
- Closing requires every incomplete item to be explicitly returned to Backlog, moved to a future planned sprint, or split/superseded.
- Estimates remain ranges. Forecasting combines availability, role bottlenecks, dependencies, VDE, elapsed cycle time, AI fit, uncertainty, consequence risk, review/rework, and project throughput for comparable work; it must not present a guaranteed date or use a universal AI speedup factor.

## 8. Client Input and Visibility

- Client submits `ClientInput` with contextual entity link and message.
- Initial state is `NEW`; PM triages to `CLARIFICATION`, `DEFECT`, `NON_MATERIAL_REFINEMENT`, or `MATERIAL_CHANGE`.
- Reclassification is allowed but append-only audited.
- Each item has owner, status `NEW | TRIAGED | IN_PROGRESS | WAITING_CLIENT | RESOLVED | CLOSED`, response history, and linked work/change records.
- Audience defaults:
  - Source Artifact uploaded by a team member: Team-only unless PM shares.
  - Source Artifact uploaded by a Client Stakeholder: Client-visible within that project unless the PM restricts it during intake.
  - Approved Requirement baseline: Client-visible for external projects.
  - Technical/UX/Feature artifacts: Team-only unless PM shares.
  - Work title/status/module progress: Client-visible by project policy.
  - Implementation reports, internal estimates, risks, comments: Team-only by default.
  - Cost items: Team-only unless explicitly shared.
- A child may be more restrictive than its parent, never more permissive without an explicit authorized share action.

## 9. Change Management

### 9.1 Materiality

A change is material if it alters any approved:

- Client-visible behavior or outcome.
- Scope boundary or acceptance term.
- Cost commitment.
- Target date or committed Module outcome.
- Security/privacy/compliance obligation promised to the client.

Everything else is non-material unless PM escalates it.

### 9.2 Change lifecycle

1. `PROPOSED`: origin, rationale, proposed Requirement delta.
2. `ANALYZING`: AI/manual impact analysis.
3. `PM_REVIEW`: PM edits impact, confirms materiality.
4. `CLIENT_REVIEW`: only material external changes; first stakeholder decision binds.
5. `APPROVED | REJECTED`: approved Requirement delta becomes new baseline.
6. `CHANGE_SET_REVIEW`: proposed downstream deltas generated.
7. `APPLIED`: PM/Lead applies selected deltas transactionally by group.

Non-material changes skip Client Review but still require PM/Lead review and audit.

### 9.3 Impact and application

Impact Report covers Requirement, Technical/UX plans, Feature Specs, Modules, Features, backlog, active sprint/work, Done work, forecast, and optional costs.

Change Set actions are `ADD`, `UPDATE_DRAFT`, `DEPRECATE`, `PAUSE`, `SPLIT`, `SUPERSEDE`, or `CREATE_SUCCESSOR`.

- Draft/Backlog records may be updated after review.
- Ready work may be updated only by returning it to Backlog and re-running readiness.
- In Progress/In Review work requires an explicit continue/pause/split/supersede decision.
- Done work is untouched; create successor work.
- Change Set application is idempotent and records partial-group failure without misreporting full application.

## 10. Audit, Concurrency, and Deletion

- Core mutations require `expected_revision`; mismatch returns `REVISION_CONFLICT` with current revision and safe summary.
- Retried commands use `idempotency_key` scoped to actor and command type.
- Audit events are append-only and redact credentials, document bodies, and secrets.
- Eligible deletion creates a recoverable tombstone for 30 days. Restoration reactivates the same IDs.
- Purge removes active database data and every application-managed immutable object key, writes a non-content purge receipt, and relies on documented backup expiry for final aging.
- Legal hold, if later introduced, must be a separate explicit policy; it is not part of the pilot.
