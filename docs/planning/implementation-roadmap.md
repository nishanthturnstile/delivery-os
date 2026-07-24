# Delivery OS — Module-Wise Implementation Roadmap

**Status:** Living execution roadmap **Target:** Controlled pilot **Parents:**
[Product Plan](../core/product-plan.md), [Domain Model & Workflows](../core/domain-workflows.md),
[Architecture & Contracts](../core/architecture-contracts.md) **Execution source:**
[Delivery Backlog & Traceability](delivery-backlog.md) **Gates:**
[Pilot Scope & Readiness](pilot-scope.md),
[AI, Security & Evaluation](../assurance/ai-security-evaluation.md)

This roadmap translates the dependency-ordered delivery slices into a module-wise implementation
path for product modules M1–M10. It is the living place for execution status, ownership, and
evidence links. It does not redefine product behavior, architecture, acceptance criteria, or pilot
gates.

When this roadmap and a normative document disagree, follow the authority rules in the
[documentation index](../README.md), correct the earliest authoritative source, and then update this
roadmap.

## 1. How to Use This Roadmap

### 1.1 Status model

| Status          | Meaning                                                                       |
| --------------- | ----------------------------------------------------------------------------- |
| `Not Started`   | No implementation work is active and prerequisite gates may still be open     |
| `In Progress`   | Implementation is active against an approved specification                    |
| `Blocked`       | A named dependency, decision, defect, or external condition prevents progress |
| `In Validation` | Implementation is complete enough for the module exit gate to run             |
| `Complete`      | The exit gate passed in staging and traceability evidence is recorded         |

Status is earned by evidence, not by code completion alone. A module cannot be `Complete` while a
required migration, authorization test, operational control, accessibility check, or acceptance
scenario is missing.

### 1.2 Tracking rules

- Update the summary table and the affected wave in the same change.
- Replace `Unassigned` before a module moves to `In Progress`.
- Replace `TBD` with stable test, report, runbook, or approved snapshot links.
- Record blockers with an owner, opened date, clearing condition, and linked decision or issue.
- Do not add calendar dates or duration promises until team capacity and a start date are explicitly
  approved.
- Keep one active database migration chain at a time.
- Deploy incomplete modules behind disabled feature flags.
- A module may enter `In Validation` only after its dependent module gates pass.
- A module is `Complete` only after its mapped backlog acceptance criteria pass in staging.

### 1.3 Module execution packet

Before implementation starts for a module, its owner creates or approves an execution packet
containing:

1. Applicable FR/NFR IDs and approved specification commit.
2. Vertical implementation slices and explicit exclusions.
3. Domain, persistence, command/query, API, UI, job, and provider changes.
4. Authorization, tenant, project, audience, and lifecycle rules.
5. Migration with rollback or forward-fix notes when data changes.
6. Observability, audit, outbox, retry, cancellation, and failure behavior.
7. Test IDs, fixtures, staging scenarios, and evidence destinations.
8. Threat-model and accessibility deltas.

## 2. Roadmap Summary

| Wave | Product module or capability            | Backlog slices | Requirements                                            | Depends on                                     | Status        | Owner      | Evidence |
| ---- | --------------------------------------- | -------------- | ------------------------------------------------------- | ---------------------------------------------- | ------------- | ---------- | -------- |
| W0   | Platform Foundation                     | S0             | NFR-03, 06, 12–13; FR-CC-01–03, 16–17                   | None                                           | `Complete`    | Platform   | [Completion evidence](../validation/w0-platform-foundation.md) |
| W1   | M1 Identity, Tenancy & Workspace        | S1             | FR-M1-01–06, 08–14                                      | W0                                             | `Not Started` | Unassigned | TBD      |
| W2   | M2 Client & Project Registry            | S2             | FR-M1-07; FR-M2-01–09                                   | W1                                             | `Not Started` | Unassigned | TBD      |
| W2   | Shared Artifact Kernel                  | S3             | FR-M3-12–17; FR-M4-05–07; FR-M5-08; FR-CC-07–08, 14, 16 | W2 M2                                          | `Not Started` | Unassigned | TBD      |
| W3   | M3 Requirement Intake & Template Engine | S4–S5 plus S3  | FR-M3-01–18                                             | W2                                             | `Not Started` | Unassigned | TBD      |
| W4   | M4 Technical, UX & Delivery Planning    | S6             | FR-M4-01–12                                             | W3                                             | `Not Started` | Unassigned | TBD      |
| W5   | M6 Work Breakdown Engine                | S7             | FR-M6-01–16; FR-M2-10                                   | W4                                             | `Not Started` | Unassigned | TBD      |
| W6A  | M7 Sprint & Delivery Board              | S8             | FR-M7-01–15; FR-CC-11–12                                | W5                                             | `Not Started` | Unassigned | TBD      |
| W6B  | M8 Client Portal & Dashboard            | S10            | FR-M8-01–08; FR-CC-05                                   | W5                                             | `Not Started` | Unassigned | TBD      |
| W6C  | M5 Cost & Subscription Planning         | S12            | FR-M5-01–10                                             | W2                                             | `Not Started` | Unassigned | TBD      |
| W7   | M10 MCP Server & Agent Enablement       | S9             | FR-M10-01–11                                            | W6A                                            | `Not Started` | Unassigned | TBD      |
| W8   | M9 Change Management & Re-analysis      | S11            | FR-M9-01–11                                             | W3, W4, W5, W6A, W6B; W6C when cost is enabled | `Not Started` | Unassigned | TBD      |
| W9   | Cross-Cutting Assurance and Dogfood     | S13            | NFR-01–14; FR-CC-01–17; pilot gates                     | All required pilot modules                     | `Not Started` | Unassigned | TBD      |

M5 is an optional product capability but is included in the controlled-pilot scope. Its
implementation can proceed after the Artifact Kernel without blocking the core trusted lifecycle. It
must still pass its gate before pilot go/no-go.

### 2.1 Dependency waves

```text
W0 Platform Foundation
 └─ W1 M1 Identity/Tenancy
     └─ W2 M2 Projects + Shared Artifact Kernel
         ├─ W3 M3 Requirement Intake
         │   └─ W4 M4 Technical/UX/Feature Planning
         │       └─ W5 M6 Work Breakdown
         │           ├─ W6A M7 Sprint/Delivery
         │           │   └─ W7 M10 MCP/Agents
         │           └─ W6B M8 Client Portal
         └─ W6C M5 Optional Costs

W3 + W4 + W5 + W6A + W6B (+ W6C when enabled)
 └─ W8 M9 Change Management

All required modules
 └─ W9 Cross-Cutting Assurance and Dogfood
```

M7, M8, and M5 are independent execution tracks once their prerequisites pass. Parallel execution is
permitted only when ownership and migration coordination are explicit.

### 2.2 Product-to-architecture mapping

| Product roadmap area                    | Primary architecture modules                  |
| --------------------------------------- | --------------------------------------------- |
| W0 Platform Foundation                  | Platform                                      |
| M1 Identity, Tenancy & Workspace        | Identity & Access; Platform                   |
| M2 Client & Project Registry            | Projects & Clients; Planning; Platform        |
| Shared Artifact Kernel                  | Artifacts; Platform                           |
| M3 Requirement Intake & Template Engine | Artifacts; Ingestion; Platform                |
| M4 Technical, UX & Delivery Planning    | Artifacts; Planning                           |
| M5 Cost & Subscription Planning         | Costs; Artifacts                              |
| M6 Work Breakdown Engine                | Planning; Delivery                            |
| M7 Sprint & Delivery Board              | Delivery                                      |
| M8 Client Portal & Dashboard            | Projects & Clients; Changes; Platform         |
| M9 Change Management & Re-analysis      | Changes; Artifacts; Planning; Delivery; Costs |
| M10 MCP Server & Agent Enablement       | Agent Gateway; Identity & Access; Platform    |

## 3. Shared Implementation Contracts

Every wave must preserve these contracts.

### 3.1 Repository and module boundaries

- Use the pnpm modular-monolith layout defined in Architecture §1.2.
- Domain and application packages do not import Next.js, Drizzle, queues, provider SDKs, or UI code.
- Every mutation enters through an application command.
- Cross-module mutations use exported application interfaces or documented domain events.
- Direct cross-module table access is prohibited except for an explicitly documented reporting read
  model.
- Browser code imports UI components from `@delivery-os/ui`; only `packages/ui` may import Base UI.

### 3.2 Data and command contracts

- Generate UUIDv7 IDs in the application.
- Store `workspace_id` on every tenant record and `project_id` on every project-owned record.
- Give mutable aggregates an integer `revision`.
- Validate wire and snapshot payloads with versioned Zod schemas.
- Persist aggregate mutation, audit event, outbox event, and idempotency result in one transaction.
- Use fixed-precision `numeric` for money and rates.
- Use immutable, schema-versioned, deterministically serialized snapshot bodies.
- Keep historical snapshot schemas backward-readable.

Internal JSON mutations use the shared envelope:

```json
{
  "expectedRevision": 12,
  "idempotencyKey": "019...",
  "command": {}
}
```

Success responses contain the entity ID, new revision, state, relevant snapshot/action IDs, and
correlation ID. Failures use the stable error codes in Architecture §9 and must not reveal
cross-tenant entity existence.

### 3.3 Authorization and audience

- Build an `AuthorizationContext` for every command and repository/query access.
- Deny by default and enforce workspace membership, project role, OAuth scope, artifact audience,
  and state policy on the server.
- Require a TOTP verification no older than ten minutes for privileged actions.
- Evaluate visibility independently for reads, search, export, download, notifications, and MCP.
- Treat UI hiding and preview modes as presentation, never as security controls.

### 3.4 Jobs, providers, and observability

- All background work uses BullMQ with versioned job payloads.
- Store job identity, tenant/project, progress, attempts, safe error, and correlation ID.
- Deduplicate outbox events, jobs, notifications, exports, approvals, and purge.
- Classify retryable, terminal, and user-actionable failures explicitly.
- Keep provider SDKs behind storage, OCR, AI, email, and telemetry adapters.
- Propagate correlation IDs across HTTP, commands, events, jobs, providers, and notifications.
- Never log credentials, signed URLs, source/OCR bodies, prompts, AI responses, recovery codes,
  cookies, or authorization headers.

### 3.5 Module Definition of Done

In addition to the module-specific gate, every module requires:

- Approved execution packet and traceability mapping.
- Migration and rollback/forward-fix evidence when applicable.
- Server-side authorization, tenant-isolation, and audience tests.
- Unit, integration, and relevant end-to-end coverage.
- Audit, outbox, idempotency, concurrency, and safe-failure verification.
- Structured logs, metrics, traces, and actionable operational state.
- Keyboard, focus, responsive, screen-reader, and WCAG 2.2 AA evidence for affected workflows.
- Threat-model and documentation updates.
- No unresolved Critical/High security finding.

## 4. W0 — Platform Foundation

**Objective:** Provide a production-shaped development platform on which every functional module can
implement the shared contracts consistently.

**Deliverables**

- Create `apps/web`, `apps/worker`, the shared packages, and `services/ocr` boundaries defined by
  the architecture.
- Configure strict TypeScript, pnpm workspaces, linting, formatting checks, package boundary
  enforcement, and dependency policy.
- Add local Docker Compose services for PostgreSQL, Redis, MinIO, pinned OCR, malware scanning, and
  mail capture.
- Add Railway web, worker, OCR, PostgreSQL, and Redis configuration with bounded startup retries and
  health/readiness probes.
- Establish Drizzle schema/migration tooling and empty/prior-schema migration tests.
- Implement command/query dispatch, transaction boundaries, authorization context, expected
  revision, idempotency store, audit events, transactional outbox, and BullMQ dispatch.
- Define Zod contract conventions, stable error envelopes, correlation middleware, structured logs,
  metrics, tracing, and secret validation.
- Implement R2/MinIO, Resend/local-mail, Sentry/OpenTelemetry, and fake provider shells without
  enabling production data export by default.
- Initialize Tailwind CSS v4 and the source-owned Base UI/shadcn design system, semantic tokens,
  component harness, accessibility checks, and Radix bans.
- Add CI for typecheck, lint, unit/integration tests, migrations, documentation, dependency/secret
  scanning, and container scanning.
- Materialize the FR/test/owner/evidence traceability manifest required by S0.

**Exit gate**

- Duplicate command and outbox delivery produces one domain outcome.
- A stale revision returns `REVISION_CONFLICT` with a safe current revision.
- Restarting web or worker does not lose committed outbox work.
- Empty and prior schema migrations pass.
- Health and readiness distinguish dependency failure.
- Correlation IDs survive request-to-job flow and secret-injection fixtures do not appear in logs.
- S0 acceptance and the shared CI pipeline pass.

## 5. W1 — M1 Identity, Tenancy & Workspace

**Objective:** Establish authenticated principals, explicit tenants, and the authorization base for
every later module.

**Domain and data**

- Add user/profile integration records, Workspace, WorkspaceMembership, Invitation, session
  metadata, MFA/recovery state, and audit attribution.
- Enforce explicit workspace creation, multi-workspace membership, verified email, seven-day
  invitation expiry, and at least one active Admin.
- Preserve historical attribution after deactivation while revoking active sessions and grants.

**Application and interfaces**

- Configure Better Auth password, magic link, verification, reset, TOTP, recovery code, and session
  management.
- Implement workspace create/update, invite/reissue/accept, membership role change, deactivation,
  session list/revoke, workspace switch, and profile commands/queries.
- Implement step-up middleware and safe authorization failures.
- Add Admin/Member settings, onboarding, invitations, workspace switching, profile, security,
  recovery, and session UI.

**Required scenarios**

- One verified user belongs to multiple workspaces without domain-derived access.
- A personal-email client invitation is accepted safely.
- Expired invitations fail and reissue invalidates the previous token.
- The last active Admin cannot be removed or deactivated.
- Deactivation preserves attribution and immediately blocks sign-in.
- A magic-link Admin completes TOTP before a privileged command.
- Guessed cross-workspace IDs reveal no entity existence.

**Exit gate:** The FR-M1 subset assigned to S1 maps to passing tests/evidence and S1 acceptance
passes in staging. Project-scoped role requirement FR-M1-07 completes with M2 in W2.

## 6. W2 — M2 Client & Project Registry and Shared Artifact Kernel

### 6.1 M2 Client & Project Registry

**Objective:** Create governed project containers, project-scoped roles, and portfolio visibility.

**Deliverables**

- Add Client, Project, ProjectMembership, WorkingCalendar, MemberAvailability, lifecycle history,
  and project health read models.
- Implement Admin, PM, Lead, Contributor, Viewer, and Client Stakeholder effective-permission
  policies independently of workspace role.
- Support external/internal project creation, mandatory PM, optional Lead, membership changes,
  availability, and calendar management.
- Implement `Draft → Intake → Planning → Execution → Completed → Archived` plus On Hold and
  Cancelled with reasoned backward/resume behavior.
- Return structured unmet criteria for Planning, Execution, and Completed gates.
- Add clients/projects CRUD, project settings/team/calendar, lifecycle actions, portfolio health,
  filtering, and project search UI.
- Create the initial outcome Module placeholder without prematurely elaborating features or work.

**Required scenarios**

- A user has different roles in different projects.
- An unassigned Workspace Admin must use an audited override rather than silently acting as PM.
- Hold resumes to the recorded prior state.
- Invalid transitions and readiness failures return stable, structured errors.
- Archive is read-only and preserves data.
- Cross-workspace project IDs never reveal existence.

**Exit gate:** FR-M1-07 and FR-M2 behavior required by S2 pass, excluding FR-M2-10's fuller Module
implementation completed in M6.

### 6.2 Shared Artifact Kernel

**Objective:** Provide one reusable, race-safe artifact lifecycle for Requirements, Technical/UX
plans, Feature Specifications, Cost Plans, and later change deltas.

**Deliverables**

- Add Artifact, DraftRevision, ReviewSnapshot, ApprovalRequest, ApprovalDecision, Baseline, Delta,
  Comment, Attachment, and audience records.
- Implement deterministic schema-versioned serialization, SHA-256 hashes, monotonic numbering, and
  immutable approved content.
- Support autosave/edit history, submission, changes requested, resubmission, internal approvals,
  external first-binding decisions, baseline history, and diffs.
- Enforce explicit audience, child-safe inheritance, share actions, and visibility-aware
  comments/attachments.
- Provide reusable draft editor, review, approval, history, diff, comment, and audience UI patterns.

**Required scenarios**

- Editing a draft cannot alter its frozen review snapshot.
- Concurrent external approve/reject attempts produce one binding decision.
- Rejection and resubmission creates a new snapshot.
- Approved baselines are immutable.
- A client read or export cannot include Team-only children.
- Stale editors receive a revision conflict instead of overwriting.

**Exit gate:** The reusable S3 artifact behaviors pass before M3, M4, or M5 builds module-specific
artifact schemas.

## 7. W3 — M3 Requirement Intake & Template Engine

**Objective:** Turn authorized source files into a cited, human-approved Requirement baseline with
explicit conflicts and gaps.

### 7.1 Secure source storage

- Add SourceArtifact, ObjectManifest, upload session, quarantine state, retention deadline, and
  non-content purge receipt records.
- Implement constrained presigned upload, completion verification, immutable keys, quota
  enforcement, MIME/checksum/size validation, malware scan, promotion from quarantine,
  authorization-aware download, recovery, and purge.
- Use MinIO locally and Cloudflare R2 in production only through the supported adapter subset.

### 7.2 Deterministic ingestion

- Add NormalizedDocument, NormalizedBlock, SourceLocator, and versioned parser/OCR configuration
  records.
- Implement PDF, DOCX, Markdown, and text parsers.
- Invoke the private pinned PaddleOCR service only for image-only or unusable PDF pages and preserve
  coordinates, reading order, structure, and confidence.
- Implement scan, parse, and OCR queues with deduplication, progress, safe retry, cancellation,
  dead-letter, and actionable `Needs Attention` state.

### 7.3 Requirement intelligence and approval

- Implement the versioned Sections A–H Requirement template with conditional applicability.
- Add SourceClaim, field mapping, Conflict, Gap, disposition, citation, quality signal, and
  generation provenance records.
- Run AI extraction through the versioned provider/workflow registry with strict schema validation
  and a complete manual path.
- Support claim accept/edit/reject, manual entry, source comparison, conflict resolution, clarifying
  questions, N/A justification, and Accepted Risk ownership/review dates.
- Integrate Requirement readiness with PM approval and first-binding external client approval.

**Required scenarios**

- Searchable PDF, scanned PDF, DOCX table, Markdown, and text fixtures preserve exact navigable
  citations.
- Corrupt, encrypted, infected, spoofed-MIME, oversized, duplicate, low confidence, timeout, and
  malformed-OCR inputs fail truthfully and safely.
- Retried parse/OCR jobs do not duplicate or replace normalized blocks.
- AI cannot resolve conflicts, mark N/A/Accepted Risk, or approve content.
- Contradictory sources remain separately cited and block approval.
- Provider outage leaves manual completion fully usable.
- Retention recovery and purge cover primary and backup manifests.

**Exit gate:** S3–S5 acceptance passes, requirement extraction and adversarial evaluation thresholds
pass, and an approved Requirement baseline can be produced from every supported pilot format.

## 8. W4 — M4 Technical, UX & Delivery Planning

**Objective:** Convert approved Requirements into governed Technical, UX, and Feature-level delivery
context.

**Deliverables**

- Define versioned Technical Plan, UX Plan/Waiver, Feature Specification, Technical Delta, and UX
  Delta artifact schemas.
- Add immutable external design references with captured metadata and hashes.
- Implement PM/Lead review, assigned Lead co-approval, changes requested, baseline/delta history,
  and controlled client comment-only sharing.
- Implement compact-path eligibility as a server-side policy; significant work cannot opt into it.
- Allocate Requirement, NFR, risk, assumption, and open-question coverage into planning artifacts.
- Add editors, review readiness, traceability views, coverage warnings, approval panels,
  baseline/delta history, and design-reference UI.

**Required scenarios**

- A UI feature cannot become breakdown-ready without an approved UX baseline/delta or justified
  waiver.
- Significant work cannot use the compact path.
- A client can comment only when an artifact is explicitly shared and cannot approve it.
- Assigned Lead co-approval is enforced.
- Approved specifications and deltas cannot be edited.
- Missing allocated NFR/risk/open-question coverage blocks readiness.

**Exit gate:** S6 passes and every Feature entering M6 has the approved context required by its
eligibility path.

## 9. W5 — M6 Work Breakdown Engine

**Objective:** Progressively elaborate approved plans into traceable, typed, ready work and honest
forecasts.

**Domain and data**

- Add Module, Feature, progressive elaboration state, typed dependency/link, WorkItem, checklist
  template snapshot, traceability edge, estimate revision, estimate-at-start, and
  forecast/calibration records.
- Support Outcome Story, Enabler, Defect, Spike, and Operational Task with type-specific readiness
  and completion rules.
- Store the structured `WorkEstimate` contract from Architecture §3.5.

**Application and interfaces**

- Implement Module/Feature CRUD, promotion/demotion, dependency management, cycle detection, typed
  work creation, readiness evaluation, controlled checklist extensions, traceability coverage, and
  forecast queries.
- Add versioned AI breakdown proposals for near-term Features with human acceptance and full manual
  fallback.
- Derive T-shirt size from the VDE high bound and enforce XL, U3, R3, and R4 policies server-side.
- Build outcome map, Feature detail, dependency graph, typed work editor, readiness results,
  traceability report, estimate explanation, and range-based forecast UI.

**Required scenarios**

- An API-only Outcome Story is valid without artificial UI/data tasks when justified.
- Every work type uses its own readiness policy.
- XL or U3 work cannot become Ready.
- R3 requires independent human review; R4 also enforces the size floor and security/operational
  evidence.
- A dependency cycle blocks readiness.
- Generated work retains mandatory Requirement/spec/source traceability.
- Forecasts disclose their cohort and never apply a global AI multiplier.
- Distant Features remain outlined without speculative work items.

**Exit gate:** S7 passes and at least one approved Feature produces traceable, Ready work with a
defensible range forecast.

## 10. W6 — Parallel Delivery Surfaces

### 10.1 W6A — M7 Sprint & Delivery Board

**Objective:** Run Ready work through a truthful delivery lifecycle ending in a human-reviewed
immutable completion snapshot.

**Deliverables**

- Add Sprint, initial SprintCommitment, current scope history, Blocker, ImplementationReport,
  ReviewFinding, CompletionSnapshot, successor link, and async standup records.
- Implement sprint creation/start/close, kickoff readiness, scope-change history, accessible work
  transitions, blocker overlay, review routing, independent review policy, Done command, and
  successor creation.
- Freeze the estimate-at-start and record aggregate completion calibration without individual
  timesheets.
- Build board/list controls, sprint planning/close, blocker management, implementation evidence,
  review findings, completion history, standup, and progress views.

**Required scenarios**

- Initial and current sprint scope remain independently reportable.
- Incomplete close requires an explicit disposition.
- Blocked work retains its lifecycle state.
- In Review requires a structured implementation report.
- An agent cannot move work to Done.
- Done content is immutable and later behavior uses successor work.
- Every drag action has a keyboard/control alternative.

**Exit gate:** S8 passes and a work item completes Ready → In Progress → In Review → human Done with
frozen evidence.

### 10.2 W6B — M8 Client Portal & Dashboard

**Objective:** Give a project-scoped client a safe, understandable view and one governed input
channel.

**Deliverables**

- Build client project summary, approved Requirement, visible Module/progress, visible work,
  checkpoint, approval, input, and response views.
- Reuse actual effective-permission evaluation for preview-as-client.
- Enforce audience at query, search, notification, download, and export time.
- Add ClientInput, triage history, classification, owner, status, responses, and linked work/change
  records.
- Implement PM triage to Clarification, Defect, Non-material Refinement, or Material Change without
  automatically creating approval obligations.

**Required scenarios**

- Guessed project/entity IDs and exports reveal no other project or Team-only child content.
- Preview-as-client matches a real client account.
- Loading, counts, errors, and search results do not leak hidden records.
- Client Feedback does not automatically become a change request.
- PM classification creates the correct linked behavior.
- Weekly checkpoint defaults are client-visible; retrospective content remains Team-only.

**Exit gate:** S10 passes and the friendly-client visibility/input script is ready for W9.

### 10.3 W6C — M5 Cost & Subscription Planning

**Objective:** Provide optional, reproducible cost planning without blocking core delivery when
disabled.

**Deliverables**

- Add CostPlan, CostItem, category, billing basis, fixed-precision quantity, duration, currency,
  manual rate, effective date, audience, baseline, and delta records.
- Implement deterministic calculation, multi-currency presentation without implied FX conversion,
  versioned snapshots, audience-filtered totals, and exports.
- Add enable/disable policy, cost editor, visual totals, history/diff, share controls, and material
  commitment linkage.

**Required scenarios**

- Disabled cost planning blocks no core gate.
- A baseline remains reproducible after manual rates change.
- Team-only items never leak into client totals or exports.
- Cost changes enter client approval only after material commitment classification.

**Exit gate:** S12 passes. This gate must pass before pilot go/no-go even though the track does not
block W3–W7.

## 11. W7 — M10 MCP Server & Agent Enablement

**Objective:** Allow user-delegated agents to consume approved context and perform bounded delivery
actions through the same human-controlled domain rules.

**Authentication and transport**

- Configure Better Auth OAuth 2.1 provider behavior, dynamic public-client registration, PKCE,
  consent, JWKS, audience-bound short-lived tokens, revocation, and protected-resource discovery.
- Expose Streamable HTTP at `/mcp`.
- Validate issuer, signature, expiry, audience/resource, OAuth client, user, active grant/session,
  scopes, workspace/project permission, and step-up where required.

**Resources and tools**

- Implement the resources, scopes, and tools in Architecture §10 with versioned Zod contracts.
- Route start, update, evidence, comment, and change proposal operations through existing
  application commands.
- Require expected revision and idempotency for mutations and propagate the MCP correlation ID into
  domain actions.
- Enforce rate limits, request-size limits, incremental scope, and read-only consent.
- Ship the versioned tool-agnostic workflow pack and setup guides.

**Required scenarios**

- PKCE, discovery, audience, expiry, revocation, consent, and scope tests pass.
- Read-only consent cannot mutate.
- Revoked sessions/grants fail within the documented cache bound.
- MCP cannot approve, apply a Change Set, or move work to Done.
- Codex, OpenCode, and a representative VS Code client can read approved context, start Ready work,
  submit evidence, and request In Review.
- Audit identifies the authorizing user, OAuth client/grant, scopes, target, and correlation without
  storing tokens or confidential content.

**Exit gate:** S9 passes for every supported representative MCP client.

## 12. W8 — M9 Change Management & Re-analysis

**Objective:** Apply approved change without rewriting historical decisions, active work, or
delivered evidence silently.

**Domain and data**

- Add ProposedChange, MaterialityDecision, ImpactReport, RequirementDelta, ChangeSet,
  ChangeSetGroup, ChangeAction, application result, and successor relationships.
- Preserve append-only state/decision history and first-binding external client decisions.

**Application and interfaces**

- Implement propose, analyze, edit impact, confirm materiality, PM review, conditional Client
  Review, approve/reject, generate Change Set, review groups, and apply selected groups.
- Cover Requirement, Technical/UX plans, Feature Specifications, Modules, Features, Backlog, active
  work, sprint, forecast, Done work, and enabled costs in impact analysis.
- Support `ADD`, `UPDATE_DRAFT`, `DEPRECATE`, `PAUSE`, `SPLIT`, `SUPERSEDE`, and `CREATE_SUCCESSOR`
  actions.
- Make grouped application idempotent and report partial-group failure without claiming full
  application.
- Build change proposal, impact review, materiality decision, client decision, Requirement delta,
  Change Set review, active-work decision, and application result UI.

**Required scenarios**

- Non-material refinement requires PM/Lead review but no client decision.
- Material external change requires one first-binding client decision.
- Approval creates a new Requirement baseline without rewriting downstream data.
- Ready work returns to Backlog before change.
- Active work requires continue, pause, split, or supersede.
- Done work is untouched and receives a successor.
- Replayed Change Set application does not duplicate actions.
- Critical impact evaluation misses none of the seeded effects.

**Exit gate:** S11 passes, including critical impact-analysis thresholds and an end-to-end material
external change.

## 13. W9 — Cross-Cutting Assurance and Dogfood

**Objective:** Prove that the complete controlled-pilot lifecycle is secure, operable, accessible,
recoverable, and useful.

**Product completion**

- Complete project activity, in-app inbox, action email, permission-aware project search, and
  snapshot-based PDF/Markdown/JSON exports.
- Complete deletion recovery, permanent purge, backup aging, and workspace export.
- Resolve remaining responsive, keyboard, screen-reader, contrast, reflow, touch, reduced-motion,
  and focus issues across critical paths.

**Security and operations**

- Run tenant isolation, IDOR, audience, OAuth, session, upload, malware, MIME, SSRF, prompt
  injection, exfiltration, stale write, replay, deletion, and restore suites.
- Verify telemetry scrub/retention and activate application, R2, OCR, queue, email, OAuth,
  AI-quality, latency, and error dashboards/alerts.
- Complete runbooks for provider outage, stuck/dead-letter work, R2 failure, OCR saturation, email
  failure, compromised OAuth client, and accidental deletion.
- Perform database and object restore drills against the stated RTO/RPO.
- Run the controlled-pilot load profile.

**Pilot scripts**

1. Use Delivery OS internally to complete:
   `source → approved Requirement → Technical/UX baselines → Module/Feature map → Feature Specification → Ready work → agent implementation report → human Done → material change → reviewed downstream application`.
2. Invite one friendly client into a separate external project.
3. Have that client complete Requirement approval, client visibility, Client Input, material-change
   decision, and feedback scripts.
4. Run every enabled AI evaluation twice consecutively against the frozen configuration.
5. Freeze the pilot-readiness snapshot and obtain product, engineering, and security owner approval.

**Exit gate**

- Every launch-critical FR has an owner, test ID, and stable evidence link.
- All documentation, security/privacy, AI, operational, and experience gates in Pilot Scope §5 pass.
- No Critical/High trust finding remains.
- No pilot script requires manual database intervention.
- Restore drills meet RTO/RPO and AI gates pass twice consecutively.
- S13 and the formal pilot go/no-go decision pass.

## 14. Test and Evidence Matrix

Each row becomes concrete test IDs and evidence links as its owning module starts.

| Test family                      | Primary waves      | Minimum evidence                                                                                |
| -------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| Unit/property                    | All                | Domain policy, state-machine, authorization, calculation, readiness, and serialization reports  |
| Migration/repository integration | W0–W8              | Empty/prior migration run, tenant-scoped repository tests, rollback/forward-fix note            |
| Command/outbox/job integration   | W0, W3, W7–W9      | Atomicity, replay, retry, cancellation, dead-letter, and correlation reports                    |
| Provider contracts               | W0, W3, W7, W9     | R2/MinIO subset, OCR schema, AI schema, OAuth/MCP, email webhook, and telemetry scrub evidence  |
| Component/accessibility          | All UI waves       | State fixtures, automated a11y, keyboard/focus, responsive, and visual review                   |
| Module end-to-end                | W1–W8              | Role-correct happy path plus authorization, conflict, and failure paths                         |
| Security/adversarial             | W1, W3, W6B, W7–W9 | Cross-tenant, audience leak, malicious file, prompt injection, replay, and token misuse reports |
| Performance/recovery             | W3, W6A, W7, W9    | Pilot load, queue/OCR saturation, R2/database backup, and restore drill results                 |
| Trusted lifecycle                | W9                 | Internal and friendly-client frozen scenario reports                                            |

## 15. Pilot Completion Checklist

- [x] W0 Platform Foundation is `Complete`.
- [ ] M1–M10 and the Shared Artifact Kernel are `Complete`.
- [ ] The optional M5 capability passes its pilot acceptance criteria.
- [ ] Every launch-critical FR maps to a passing test and stable evidence.
- [ ] Every pilot AI workflow passes two consecutive frozen evaluation runs.
- [ ] No Critical/High security, privacy, tenant, audience, or data-loss finding remains.
- [ ] Database and object restore drills meet RTO ≤ 8 hours and RPO ≤ 24 hours.
- [ ] Controlled-pilot load and service targets pass.
- [ ] Critical paths meet WCAG 2.2 AA.
- [ ] Internal dogfood completes the full trusted lifecycle.
- [ ] The friendly client completes the external approval, visibility, change, and input scripts.
- [ ] Product owner, engineering lead, and security owner approve the frozen pilot-readiness
      snapshot.
