# Delivery OS — Delivery Backlog & Traceability

**Status:** Executable implementation plan
**Parents:** [Product Plan](../core/product-plan.md), [Domain Model & Workflows](../core/domain-workflows.md), [Architecture & Contracts](../core/architecture-contracts.md)
**Gates:** [Pilot Scope](pilot-scope.md), [AI, Security & Evaluation](../assurance/ai-security-evaluation.md)
**Module execution view:** [Module-Wise Implementation Roadmap](implementation-roadmap.md)

This backlog sequences implementation by dependency. It is not the LVD framework that Delivery OS applies to customer projects. Each slice must pass its acceptance criteria before dependent slices begin, except tasks explicitly marked parallel.

## 1. Engineering Definition of Done

Every implementation slice requires:

- Approved linked specification and acceptance scenarios.
- Database migration and rollback/forward-fix note when data changes.
- Server-side authorization and tenant/audience tests.
- Unit/integration tests and relevant end-to-end scenario.
- Structured logs, metrics, safe errors, and audit/outbox behavior.
- Keyboard/accessibility coverage for UI.
- Threat-model update for new trust boundaries.
- Documentation and traceability updates.
- No Critical/High unresolved security issue.

## 2. Dependency Graph

```text
S0 Foundation
 ├─ S1 Identity/Tenancy
 │   └─ S2 Projects/RBAC
 │       ├─ S3 Artifact Baselines
 │       │   ├─ S4 Secure Ingestion
 │       │   │   └─ S5 Requirement Intelligence
 │       │   └─ S6 Technical/UX/Feature Specs
 │       │       └─ S7 Modules/Typed Work
 │       │           └─ S8 Sprints/Review/Done
 │       │               └─ S9 MCP/Workflow Pack
 │       └─ S10 Client Portal/Input
 ├───────────────────────────────┐
 S5 + S6 + S7 + S8 + S10 ───────┴─ S11 Change Management
 S3 + S2 ────────────────────────── S12 Optional Cost Plan
 All core slices ────────────────── S13 Assurance/Dogfood
```

## 3. Implementation Slices

### S0 — Repository and Platform Foundation

**Depends on:** none
**Requirements:** NFR-03, NFR-06, NFR-12, NFR-13; FR-CC-01–03, 16–17
**Implementation status:** `In Validation` — [finalized plan](w0-platform-foundation.md) and
[local evidence](../validation/w0-platform-foundation.md)

Deliver:

- pnpm monorepo, Next.js web, Node worker, shared packages.
- Docker Compose with PostgreSQL, Redis, MinIO, the pinned self-hosted OCR service, and local mail capture.
- Tailwind CSS v4 and a source-owned `packages/ui` design system initialized from current shadcn components with Base UI; dependency policy rejects Radix packages.
- Railway staging/pilot service definitions and environment validation.
- Cloudflare R2 production adapter/configuration with MinIO contract parity for the supported S3 subset.
- Resend and Sentry adapters with fake/local implementations, secret validation, redaction, and disabled-by-default non-local export.
- Drizzle migration pipeline and empty/prior-schema migration tests.
- Command/query framework, transaction boundary, optimistic concurrency, idempotency store.
- Audit Event, transactional outbox, BullMQ dispatch, correlation IDs.
- Zod contracts, stable error envelope, structured logging, health/readiness.
- CI: typecheck, lint, unit/integration, migration, dependency/secret/container scanning.

Acceptance:

- Duplicate command/outbox delivery creates one outcome.
- Stale revision produces `REVISION_CONFLICT`.
- Web/worker restart does not lose committed outbox work.
- Logs contain correlation IDs and no injected secrets.

### S1 — Accounts, Authentication, and Workspace Tenancy

**Depends on:** S0
**Requirements:** FR-M1-01–06, 08–14; NFR-04–05

Deliver:

- Better Auth password, magic link, verification, reset, sessions, TOTP, recovery.
- Explicit Workspace creation; WorkspaceMembership Admin/Member.
- Invitation acceptance/expiry/reissue and multi-workspace switcher.
- Last-Admin invariant, deactivation/session revocation.
- Step-up TOTP middleware for privileged commands.

Acceptance:

- Same verified user belongs to multiple workspaces.
- Email domain grants no membership.
- Invited personal-email client account is valid.
- Last Admin cannot be removed.
- Magic-link Admin must pass TOTP before privileged action.

### S2 — Clients, Projects, Project Roles, and Lifecycle

**Depends on:** S1
**Requirements:** FR-M2-01–10; role matrix

Deliver:

- Client and Project CRUD with project membership roles.
- PM mandatory, Lead optional, Contributor/Viewer/Client Stakeholder.
- Project state machine, Hold/Resume/Cancel/Archive, backward transitions.
- Project profile, calendar, member availability, outcome Module placeholder.
- Effective-permission service and emergency Admin override.

Acceptance:

- One user has different roles in different projects.
- Workspace Admin without project role cannot silently act as PM.
- Hold resumes to prior state.
- Planning/Execution/Completed gates return structured unmet criteria.
- Cross-workspace IDs never reveal entity existence.

### S3 — Artifact Drafts, Review Snapshots, Baselines, Audience

**Depends on:** S2
**Requirements:** FR-M3-12–17; FR-M4-05–07; FR-M5-08; FR-CC-07–08, 14, 16

Deliver:

- Generic Artifact, Draft edit history, Review Snapshot, Approval Request, Baseline, Delta.
- Deterministic snapshot serialization/hash and monotonic numbering.
- Comment/attachment audience and safe inheritance.
- Internal and external Requirement approval policies.
- First-binding Client Stakeholder decision with race-safe transaction.
- Artifact diff and baseline history.

Acceptance:

- Edit after submission cannot alter snapshot under review.
- Concurrent client approve/reject yields one binding decision.
- Rejection/resubmission creates a new snapshot.
- Client export cannot include Team-only child content.
- Approved baseline is immutable.

### S4 — Secure Source Storage and Deterministic Ingestion

**Depends on:** S3
**Requirements:** FR-M3-01–04A; FR-CC-17; NFR-11

Deliver:

- Cloudflare R2 production adapter, MinIO local adapter, provider contract tests, constrained presigned upload/download, immutable object keys, and PostgreSQL object manifests.
- Quarantine, checksum/MIME/size/quota validation, malware scanning.
- PDF, DOCX, Markdown, and text parsers; private self-hosted PaddleOCR service using a pinned PP-StructureV3 pipeline.
- Baked and digest-pinned OCR model artifacts, denied runtime egress, bounded page rendering, authenticated internal requests, BullMQ deduplication/retry/dead-letter, and CPU/memory/concurrency limits.
- NormalizedDocument/Block and exact locator model.
- Job progress, retry/cancel/dead-letter, actionable failures.
- Source retention, 30-day recovery, immutable-key purge, independent backup bucket/manifests, and restore procedure.

Acceptance:

- Searchable/scanned PDF, DOCX table, Markdown, and text fixtures round-trip citations.
- Corrupt, encrypted, spoofed MIME, infected, oversized, and duplicate uploads behave safely.
- Retried parse does not duplicate blocks.
- Replayed OCR jobs cannot duplicate/replace normalized blocks; timeout, malformed output, low confidence, or service exhaustion produces actionable `Needs Attention`.
- Unauthorized signed URL cannot be issued.
- Purge removes every manifest-listed primary/backup object according to retention and leaves a non-content receipt.

### S5 — Requirement Extraction, Claims, Conflicts, and Gaps

**Depends on:** S4
**Requirements:** FR-M3-05–11, 18; Section 8; NFR-09

Deliver:

- AI provider/workflow adapter, prompt/schema registry, provenance.
- Proposed Source Claims and Requirement field mappings.
- Claim accept/edit/reject UI.
- Conflict detection/resolution and source comparison.
- Conditional applicability, Blocking/N/A/Accepted Risk gap dispositions.
- Clarifying-question suggestions and complete manual fallback.
- Requirement readiness and approval integration.

Acceptance:

- AI cannot mark N/A/Accepted Risk or resolve conflict.
- Contradictory sources remain separately cited and block approval.
- Approved field navigates to exact source locator.
- Provider outage leaves manual flow usable.
- Extraction and adversarial eval thresholds pass.

### S6 — Technical, UX, and Feature Specification

**Depends on:** S3, S5
**Requirements:** FR-M4-01–12

Deliver:

- Technical baseline template and internal PM/Lead review.
- UX baseline/waiver and immutable external design references.
- Feature Specification schema, approval, Technical/UX deltas.
- Compact-path eligibility policy with server-side validation.
- Spec traceability and allocated NFR/risk/open-question coverage.

Acceptance:

- UI feature cannot become breakdown-ready without UX baseline/delta or valid waiver.
- Significant feature cannot use compact path.
- Client may comment only when explicitly shared and never approves.
- Lead co-approval required when assigned.
- Approved spec/deltas are immutable.

### S7 — Module/Feature Map, Typed Work, Traceability, Forecasting

**Depends on:** S6
**Requirements:** FR-M6-01–16; FR-M2-10

Deliver:

- Outcome Module and Feature map with progressive elaboration states.
- Dependency graph, typed links, cycle detection.
- AI-assisted near-term work generation for five work types.
- Type-specific DoR/DoD templates and controlled workspace extensions.
- Many-to-many Requirement/spec/source traceability and coverage report.
- AI-aware VDE and elapsed ranges, T-shirt size, AI fit, uncertainty, consequence risk, estimate basis/profile, and availability/role/throughput forecast.

Acceptance:

- API-only Outcome Story is valid without fake UI/data work when justified.
- Enabler/Defect/Spike/Operational Task use their own readiness rules.
- Size follows the VDE upper bound after verification; XL/U3 blocks Ready until split, clarification, or Spike.
- R3/R4 work receives the required independent review and R4 size floor.
- Forecasts never use a universal AI speedup factor and expose their calibration cohort.
- Dependency cycle blocks readiness.
- Generated work has complete mandatory traceability.
- Distant Features remain outlined without speculative work items.

### S8 — Sprint Board, Blockers, Evidence, Review, and Done

**Depends on:** S7
**Requirements:** FR-M7-01–15; FR-CC-11–12

Deliver:

- Project cadence/calendar and Sprint states.
- Initial Sprint Commitment and tracked scope changes.
- Board with Blocked overlay and accessible non-drag controls.
- Structured blockers and at-risk indicators.
- Implementation Report, review findings, self/independent review policy.
- Completion Snapshot and successor link.
- Async standup and core progress views.

Acceptance:

- Sprint reporting preserves initial and current scope.
- Incomplete close requires explicit disposition.
- Blocked work retains lifecycle state.
- In Review requires implementation report.
- Agent cannot move Done.
- Done snapshot cannot be edited; successor flow works.

### S9 — OAuth MCP Server and Workflow Pack

**Depends on:** S8
**Requirements:** FR-M10-01–11

Deliver:

- Better Auth OAuth 2.1 Provider, consent, dynamic public-client registration, JWKS.
- Protected Resource Metadata and Streamable HTTP MCP endpoint.
- Versioned scopes, resources, tools, per-request domain authorization.
- Expected revision, idempotency, rate/size limits, audit/correlation.
- Tool-agnostic Delivery OS workflow pack and setup guides.

Acceptance:

- PKCE, discovery, audience, expiry, scope, revocation, and step-up tests pass.
- Read-only consent cannot mutate.
- Revoked session/grant fails immediately within documented cache bound.
- Codex, OpenCode, and representative VS Code clients complete read/start/report flow.
- MCP cannot approve/apply/Done.

### S10 — Client Portal, Visibility Preview, and Client Input

**Depends on:** S3, S7
**Requirements:** FR-M8-01–08; FR-CC-05

Deliver:

- Client project dashboard and Client-visible Requirement/Module/work views.
- Audience enforcement in UI, search, notification, download, and export.
- Preview-as-client using actual permission evaluation.
- Unified Client Input and PM triage/reclassification.
- One weekly checkpoint event/default; team-only retrospective.

Acceptance:

- Client cannot access another project or Team-only child by guessed ID/export/search.
- Preview matches actual client account results.
- Client Feedback does not create approval requirement automatically.
- PM classification creates linked Clarification/Defect/Refinement/Change behavior.

### S11 — Material Change and Reviewed Downstream Application

**Depends on:** S5–S8, S10
**Requirements:** FR-M9-01–11

Deliver:

- Proposed Change, Materiality decision, Impact Report.
- Client Review only for material external changes.
- New Requirement baseline on approval.
- Reviewable downstream Change Set across plans/specs/modules/work/sprints/cost.
- Active-work decisions, successor generation, idempotent grouped application.

Acceptance:

- Non-material agent refinement needs PM/Lead review but no client.
- Material external change requires first-binding client decision.
- Approval alone does not rewrite downstream records.
- Active work is never silently changed.
- Done creates successor.
- Critical Impact eval has no missed seeded effect.

### S12 — Optional Cost Plan

**Depends on:** S2, S3
**Requirements:** FR-M5-01–10

Deliver:

- Optional enablement, item categories, fixed-precision calculations.
- Billing basis, quantity, duration, currency, manual rate/effective date.
- Baselines/deltas, Team/Client audience, visual totals, export.
- Change linkage when client commitment is materially affected.

Acceptance:

- Cost disabled does not block any core gate.
- Multi-currency snapshot is reproducible after rates change.
- Team-only item never leaks into client totals/export.
- Cost change enters client approval only when PM classifies commitment impact as material.

### S13 — Cross-Cutting Assurance and Dogfood

**Depends on:** S0–S12 required pilot features
**Requirements:** NFR-01–14; FR-CC-01–17; Pilot gates

Deliver:

- Project activity, in-app inbox, action email, project search.
- Snapshot-based PDF/Markdown/JSON exports.
- WCAG 2.2 remediation and manual verification.
- Load, security, AI regression/adversarial, backup/restore, deletion/purge tests.
- Sentry/OpenTelemetry dashboards, scrub/retention verification, R2/OCR health and saturation monitoring, Resend delivery webhook monitoring, alerts, and runbooks.
- Internal lifecycle dogfood and one friendly-client script.

Acceptance:

- All gates in [Pilot Scope](pilot-scope.md) pass.
- No Critical/High trust finding remains.
- RTO/RPO restore drill passes.
- AI thresholds pass twice consecutively.
- Product owner, engineering lead, security owner approve pilot-readiness snapshot.

## 4. Requirement Traceability

| Requirement group | Primary slices |
|---|---|
| FR-M1-01–14 Identity/Tenancy | S1 primary; S2 project-role enforcement; S9 MCP authorization |
| FR-M2-01–10 Client/Project | S2 primary; S7 Module outcomes; S10 client surface |
| FR-M3-01–18 Intake/Requirements | S3 snapshots/approval; S4 files; S5 claims/gaps/AI |
| FR-M4-01–12 Technical/UX/Specs | S6 |
| FR-M5-01–10 Cost | S12 |
| FR-M6-01–16 Work Breakdown | S7 |
| FR-M7-01–15 Sprint/Delivery | S8 |
| FR-M8-01–08 Client Portal | S10 |
| FR-M9-01–11 Change Management | S11 |
| FR-M10-01–11 MCP/Agents | S9 |
| FR-CC-01–17 Cross-cutting | S0 platform, S3 audience/audit, S4 retention/jobs, S13 experience/operations |
| NFR-01–14 | S0, S1, S4, S9, S13 according to acceptance type |

S0 shall materialize this complete mapping into a machine-readable traceability manifest containing exact FR IDs, test IDs, owner, and evidence location. CI fails when a launch-critical FR lacks a test/evidence owner or when an implementation slice references an unknown requirement.

## 5. Implementation Control

- Work on one active database migration chain at a time.
- Feature flags protect incomplete pilot capabilities.
- No slice changes an approved domain rule without updating the Product Plan and Domain specification first.
- Architecture deviations require an ADR linked from [Architecture & Contracts](../core/architecture-contracts.md).
- AI configuration promotion is independent of application deployment and follows the evaluation gate.
- A slice may be deployed disabled; it is complete only when its acceptance criteria pass in staging.
