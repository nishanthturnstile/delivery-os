# W2 M2 Client & Project Registry — Execution Packet

**Plan status:** Approved; implementation complete and exit-gate validation active
**Owner:** Projects & Clients
**Specification snapshot reviewed:** `16638a6`
**Approved specification commit:** `16638a6`
**Requirements:** FR-M1-07; FR-M2-01–09; bounded FR-M2-10 placeholder; NFR-01, NFR-04–07, NFR-12–13  
**Backlog:** [S2 Clients, Projects, Project Roles, and Lifecycle](delivery-backlog.md#s2--clients-projects-project-roles-and-lifecycle)  
**Roadmap:** [W2 M2 Client & Project Registry](implementation-roadmap.md#61-m2-client--project-registry)

## 1. Gate Assessment

The prerequisite and authorization gates were rechecked immediately before implementation:

1. W1 M1 is `Complete` in the roadmap summary and detailed W1 section, with its stable
   [validation record](../validation/w1-m1-identity-tenancy-workspace.md) linked.
2. The owner approved this execution packet on 2026-07-25 and the specification baseline is frozen
   at commit `16638a6`.
3. The roadmap assigns M2 to `Projects & Clients`.
4. The roadmap summary and detailed W2 section move to `In Progress` in the same change that begins
   Slice A.

The M2 implementation gate is clear. Shared Artifact Kernel and all later dependent modules remain
`Not Started`.

## 2. Objective and Scope Boundary

Deliver the tenant-safe project container and portfolio registry required by every later project
module. Better Auth continues to authenticate the principal; Delivery OS application policies
combine active workspace membership, project membership, project state, action policy, and any
explicit emergency override.

Included:

- Client create, read, update, list, archive, and restore.
- External and internal project create, read, update, list, and governed lifecycle actions.
- Project-scoped PM, Lead, Contributor, Viewer, and Client Stakeholder roles independently of the
  workspace Admin/Member role.
- Project-specific client invitations, including a safe pending state until the invited verified
  account has active workspace and project membership.
- Project working calendars, calendar exceptions, member allocation periods, and capacity-change
  events.
- Portfolio summaries, project search, client/status/PM/date filters, and the M2-defined health
  fields.
- Structured readiness failures for Intake, Planning, Execution, and Completed transitions.
- An initial read-only outcome Module placeholder sufficient to preserve the project-to-planning
  handoff.
- Server-side tenant/project authorization, audited Admin emergency override, revision,
  idempotency, audit, outbox, correlation, accessibility, and staging evidence.

Explicitly excluded:

- Requirement drafts, review snapshots, approvals, and baselines, which begin with the Shared
  Artifact Kernel and M3.
- Technical/UX plans, Feature Specifications, and approved Module/Feature maps, which arrive in
  M4 and M6.
- Sprint CRUD, active-work state, blockers, forecasts, and delivery-board behavior, which arrive in
  M6/M7.
- Full Module editing, dependency management, readiness, and progress calculation. M6 consumes and
  elaborates the M2 placeholder.
- Client portal, client-visible artifact projection, Client Input, preview-as-client, and client
  dashboard behavior, which arrive in M8.
- File-backed logo upload. M2 accepts validated HTTPS logo URLs; managed upload begins with the
  approved storage capability.
- Physical purge of client or project data. M2 uses reversible states and preserves attribution;
  retention/purge remains governed by the later platform retention work.
- Workspace-wide search, exports, notifications beyond the existing invitation delivery path, MCP
  tools, and production launch.

## 3. Decisions Resolved by This Packet

These decisions turn the normative requirements into an implementable pilot contract without
adding a second product scope.

### 3.1 Client records

- A client belongs to exactly one workspace and contains name, optional HTTPS logo URL, required
  primary-contact name and email, optional industry, notes, revision, and state.
- Notes are Team-only. M2 never exposes them to a Client Stakeholder.
- `ACTIVE` and `ARCHIVED` are the client states. Archiving is reversible and is denied while the
  client has any project not in `ARCHIVED` or `CANCELLED`.
- Client names are not globally unique. The UI warns on a normalized same-name match in the same
  workspace but does not merge records automatically.
- Workspace Admins may manage any client in their workspace. A PM may create a client and may edit
  clients attached to a project where that user is an active PM. Client archive/restore is Admin
  only because it affects the workspace-wide registry.
- Client/project creation or mutation performed under Workspace Admin authority requires recent
  TOTP. An active PM acting through project authority does not inherit or forge that Admin step-up.

### 3.2 Project creation and ownership

- An active Workspace Admin or a user who is an active PM on at least one project in the workspace
  may create a project. This resolves the project-scoped nature of PM without inventing a new
  workspace role.
- Every project has exactly one active PM. It may have at most one active Lead. A replacement is
  atomic; the current PM cannot be removed without selecting the replacement in the same command.
- A person may hold multiple internal roles on one project. `CLIENT_STAKEHOLDER` cannot be combined
  with PM, Lead, Contributor, or Viewer on the same project because its audience boundary is
  materially different.
- An external project requires one Client and at least one active or pending Client Stakeholder
  assignment. An internal project has no Client and cannot have a Client Stakeholder.
- An Admin may create a project and assign an active workspace member as PM, but does not thereby
  gain project mutation authority.

### 3.3 Client invitation boundary

- A project invitation records the project, client, normalized email, intended
  `CLIENT_STAKEHOLDER` role, state, seven-day expiry, digest-only project token, revision, and its
  linked workspace invitation when one is needed. Reissue invalidates every earlier pending
  project and linked workspace token for that project/email pair.
- If the email is already an active workspace member, accepting the explicit project invitation
  activates only the project assignment.
- Otherwise, the project-invitation application flow issues or reissues an ordinary workspace
  `MEMBER` invitation through a server-only, project-bound Identity & Access command and links the
  two records. That command accepts only `MEMBER`, can be invoked only after the Projects
  application service authorizes the PM/Admin action, and never trusts a browser-supplied project
  authorization claim.
- Workspace invitation acceptance never silently grants every project. Project activation requires
  the matching, unexpired project invitation, verified-email match, and an active workspace
  membership. The combined acceptance endpoint is retry-safe: a committed workspace acceptance
  followed by a transient project-activation failure remains pending and completes idempotently on
  retry.
- Partial delivery is visible and retryable. A saved project invitation with failed email delivery
  cannot grant access.
- Until M8, a Client Stakeholder may authenticate and hold project membership, but does not receive
  the future client portal. Internal workspace directory/settings and Team-only project details
  remain inaccessible.
- The M1 workspace-detail endpoint and authenticated shell must therefore classify a
  Client-Stakeholder-only principal through the exported Projects query interface and return a
  minimal holding surface instead of the workspace member directory. A user who also has an active
  internal role on another project keeps only the permissions granted for each requested surface;
  no role broadens another project's audience.

### 3.4 Calendar, availability, and capacity

- A project snapshots the workspace time zone and default working hours at creation. Later
  workspace-profile changes do not silently rewrite project history.
- The project calendar stores IANA time zone, working weekdays, daily start/end time, and dated
  working/non-working exceptions.
- Member availability stores non-overlapping effective date ranges and an integer allocation from
  0–100 percent for an active internal project member.
- The application derives planned weekly minutes from the calendar and allocation. It does not
  create individual timesheets or promise delivery dates.
- Team, calendar, or availability changes increment a project `capacityRevision` and append a
  `project.capacity.recalculation-requested.v1` outbox event. M7 later consumes the current
  projection when sprint capacity exists.

### 3.5 Lifecycle and readiness

- The main lifecycle is `DRAFT → INTAKE → PLANNING → EXECUTION → COMPLETED → ARCHIVED`.
- `ON_HOLD` records the prior active state, reason, owner, and review date. Resume returns to that
  recorded state, never to a client-supplied state.
- `CANCELLED` requires a reason and active-work disposition. `ARCHIVED` is available only from
  `COMPLETED` or `CANCELLED`.
- Backward transitions require a reason. `COMPLETED → EXECUTION` is an audited reopen. Unarchive
  returns to the recorded pre-archive `COMPLETED` or `CANCELLED` state.
- An archived project is read-only except for an authorized unarchive command. Data, membership,
  history, audit, and read models are preserved.
- Readiness is evaluated from a project-owned projection populated transactionally now and by
  versioned domain events from later modules. M2 does not read later-module tables directly.
- A readiness denial returns `READINESS_FAILED` with ordered, stable unmet-criterion codes and
  human-safe messages. An impossible state edge returns `INVALID_TRANSITION`; neither response
  reveals a foreign project.

Readiness criteria:

| Transition | Required facts |
| --- | --- |
| Draft → Intake | Profile fields complete; exact active PM; calendar configured; at least one active internal member; external Client and active Client Stakeholder |
| Intake → Planning | Approved Requirement baseline |
| Planning → Execution | Approved Technical baseline or waiver; approved UX baseline or waiver; approved Module/Feature map; at least one Ready work item |
| Execution → Completed | No active sprint; no In Progress/In Review work; completion summary recorded |
| Completed/Cancelled → Archived | Transition reason |

### 3.6 Portfolio and health

- Workspace Admins see all project portfolio summaries in the workspace but do not gain project
  mutation authority.
- PMs see portfolio summaries only for projects where they are an active PM. Other project roles
  see only projects to which they are assigned and do not receive the Admin/PM portfolio aggregate.
- Search covers project name and short description. Filters cover Client, lifecycle status, active
  PM, and overlapping target date range.
- Date filtering uses interval overlap:
  `project.targetStart <= filterEnd && project.targetEnd >= filterStart`.
- Results use cursor pagination, a bounded page size, and deterministic `updatedAt DESC, id DESC`
  ordering.
- The health projection contains lifecycle status, current sprint label when one exists, blocker
  count, and next outcome milestone name/date. Before M7 supplies sprint/blocker facts, the UI
  truthfully displays “Not available yet” and zero only where zero is a known fact.

### 3.7 Initial Module placeholder

- Project creation also creates one read-only placeholder Module owned by the Planning boundary.
- It uses the project name/description and target dates, `OUTLINED` status, no dependencies, empty
  success criteria, and `CLIENT_VISIBLE` audience for external projects or `TEAM_ONLY` for internal
  projects.
- M2 displays the placeholder as the upcoming outcome milestone but provides no Module edit,
  dependency, approval, or work-breakdown controls.
- M6 upgrades this record through its own commands and completes FR-M2-10. M2 does not claim the
  full FR-M2-10 exit gate.

## 4. Domain and Persistence Model

Add the following relational records to the single checked-in Drizzle migration chain:

| Record | Key fields and constraints |
| --- | --- |
| `clients` | UUIDv7 ID; workspace ID; revision; contact fields; state; archive metadata; tenant/name and tenant/state indexes |
| `projects` | UUIDv7 ID; workspace/client IDs; type; lifecycle state; prior hold/archive state; dates; revision; capacity revision; completion summary; tenant/filter indexes |
| `project_memberships` | Project/user key; workspace ID; state; revision; optional client ID; activation/deactivation attribution |
| `project_membership_roles` | Project/user/role key; indexed role lookup; roles constrained by application policy |
| `project_invitations` | UUIDv7 ID; workspace/project/client IDs; normalized email; digest/link metadata; expiry/state/revision; pending lookup indexes |
| `project_working_calendars` | One per project; workspace ID; revision; time zone; weekdays; daily start/end |
| `project_calendar_exceptions` | Project/date key; working/non-working kind; optional minutes; reason |
| `member_availability` | UUIDv7 ID; workspace/project/user IDs; effective dates; allocation percent; revision; range lookup index |
| `project_lifecycle_history` | Append-only transition ID; from/to; actor; reason; hold owner/review date; correlation ID; time |
| `project_readiness_facts` | One project-owned projection row; version; later-module facts; last event ID/time |
| `project_health` | One project-owned portfolio projection; state; sprint/blocker/milestone facts; refreshed time |
| `project_outcome_modules` | Initial placeholder only; project/workspace IDs; target window; outcome/audience/status; schema version |

Database constraints enforce tenant keys, type/client consistency, valid target ranges, positive
revisions, allocation bounds, valid state metadata, and normalized invitation email where SQL can
do so. Transactional application policies enforce exact-one-PM, max-one-Lead, incompatible
stakeholder roles, non-overlapping availability ranges, valid lifecycle edges, and last-role races.

All tenant records carry `workspace_id`; project-owned records also carry `project_id`. Mutable
aggregates use integer revisions. IDs are application-generated UUIDv7 values. Core relational
fields are not placed in JSONB.

## 5. Application and Authorization Design

Add versioned M2 contracts, pure policies, commands, query ports, and database adapters without
importing Next.js or database libraries into domain/application packages.

Primary commands:

- `CreateClient`, `UpdateClient`, `ArchiveClient`, `RestoreClient`.
- `CreateProject`, `UpdateProjectProfile`.
- `InviteProjectStakeholder`, `ReissueProjectInvitation`, `AcceptProjectInvitation`.
- `ReplaceProjectManager`, `SetProjectRoles`, `DeactivateProjectMember`.
- `UpdateProjectCalendar`, `SetCalendarException`, `SetMemberAvailability`.
- `TransitionProjectLifecycle`.
- `UseAdminProjectOverride` as an action-bound authorization path, not a persistent membership.

Primary queries:

- `ListClients`, `GetClient`.
- `ListPortfolioProjects`, `SearchProjects`, `GetProject`.
- `ListProjectMembers`, `GetProjectCalendar`, `ListMemberAvailability`.
- `GetProjectReadiness`, `ListProjectLifecycleHistory`, `GetProjectOutcomePlaceholder`.

Every mutation:

1. Parses a versioned Zod command with server-derived actor and authorization context.
2. Requires expected revision and caller-supplied idempotency key.
3. Locks the relevant project/client and invariant rows.
4. Re-evaluates active workspace and project roles from the database.
5. Applies pure domain policy and state transition logic.
6. Writes aggregate, audit, outbox, lifecycle/projection, and idempotency result in one transaction.
7. Returns entity ID, new revision/state, audit/outbox IDs, correlation ID, and replay status.

Extend the shared error contract and `ApplicationError` so `READINESS_FAILED` can safely carry a
typed array of unmet criteria and `INVALID_TRANSITION` can carry the allowed next states. Map
`READINESS_FAILED` to HTTP 422 and retain the safe 404 behavior for missing, foreign-tenant, and
unauthorized project identifiers.

### 5.1 Effective permission matrix

| Capability | Workspace Admin without project role | PM | Lead | Contributor | Viewer | Client Stakeholder |
| --- | --- | --- | --- | --- | --- | --- |
| Portfolio summary | All workspace projects | Own PM projects | Assigned project summary | Assigned project summary | Assigned project summary | Deferred client-safe surface |
| Create client/project | Yes; must assign PM | Yes, within workspace | No | No | No | No |
| Read full Team project | Explicit audited override | Yes | Yes | Yes | Yes | No |
| Edit project profile/team/calendar | Explicit audited override | Yes | No | No | No | No |
| Transition lifecycle | Explicit audited override | Yes | No | No | No | No |
| Read client-safe project identity | No implicit portal | Yes | Yes | Yes | Yes | Minimal membership confirmation only |
| Archive/restore client | Admin rule, recent TOTP | No | No | No | No | No |

An emergency Admin override is scoped to one command, requires recent TOTP and a non-empty reason,
and writes a dedicated override audit event plus the ordinary mutation audit event. It never
creates a project role or lets the Admin act as the recorded PM.

## 6. HTTP and Frontend Plan

Use the existing same-origin, versioned JSON API contract. Route Handlers are public API boundaries:
they authenticate, derive workspace/project authorization context on the server, parse input, and
delegate to application commands/queries.

Planned endpoint groups:

- `/api/workspaces/[workspaceId]/clients`
- `/api/workspaces/[workspaceId]/clients/[clientId]`
- `/api/workspaces/[workspaceId]/projects`
- `/api/workspaces/[workspaceId]/projects/[projectId]`
- `/api/workspaces/[workspaceId]/projects/[projectId]/members`
- `/api/workspaces/[workspaceId]/projects/[projectId]/invitations`
- `/api/workspaces/[workspaceId]/projects/[projectId]/calendar`
- `/api/workspaces/[workspaceId]/projects/[projectId]/availability`
- `/api/workspaces/[workspaceId]/projects/[projectId]/lifecycle`
- `/api/invitations/project/accept`

Reads use a server-only data-access layer with explicit DTO selection. Server Components are the
default for portfolio/detail reads. Client Components are limited to filters, dialogs, forms, and
pending/error state. Successful mutations refresh authoritative server data; role, lifecycle,
archive, invitation, and readiness results are never represented optimistically.

Add bookmarkable authenticated pages:

- Workspace portfolio with search, filters, pagination, honest empty/loading/error states, and
  responsive table/card presentation.
- Clients list, create/edit dialog, detail summary, archive/restore confirmation, and associated
  project list.
- Project creation flow covering identity, type/client, dates, PM/Lead/team, stakeholder invite,
  calendar, availability, and review.
- Project detail with Overview, Team, Calendar & Availability, Lifecycle & Readiness, and History.
- Project invitation acceptance handoff that reuses verified M1 authentication and clearly reports
  pending, expired, reissued, accepted, or delivery-failed states.

Refactor the existing M1 `WorkspaceApp` only as needed to extract a reusable authenticated shell and
identity panels. Preserve all M1 behavior and tests. Application screens import only
`@delivery-os/ui`. Add source-owned UI wrappers/patterns for Dialog, filterable Combobox, Textarea,
Checkbox, data table, empty state, confirmation, and structured readiness list as needed; only
`packages/ui` may import Base UI.

Accessibility requirements include:

- Programmatic labels, descriptions, error relationships, and fieldset/legend grouping.
- Keyboard-complete client/project creation, membership, filters, calendar, and lifecycle actions.
- Focus entry/restoration for dialogs and confirmations.
- Live announcements for saved, conflict, readiness, invitation, and lifecycle results.
- Non-color lifecycle/health cues, 200% zoom, 320 CSS-pixel reflow, touch target spacing, reduced
  motion, and no horizontal overflow on the critical mobile flow.

## 7. Vertical Implementation Slices and File Impact

### Slice A — Shared contracts and pure domain policies

- Add `packages/contracts/src/projects.ts` and contract tests for DTOs, filters, commands,
  lifecycle/readiness details, outbox jobs, and safe responses.
- Add `packages/domain/src/projects.ts` and property/unit tests for roles, calendar/availability,
  lifecycle, readiness, archive read-only policy, and capacity derivation.
- Extend shared error and authorization contracts without weakening existing M1/W0 parsing.
- Export M2 contracts/policies through package entry points.

### Slice B — Schema, migration, and repositories

- Extend `packages/database/src/schema.ts` with the M2 records and constraints.
- Generate and review the next Drizzle SQL migration; do not use runtime `push`.
- Add `packages/database/src/project-store.ts` with tenant/project-scoped commands, queries,
  projections, audit/outbox/idempotency, and safe not-found behavior.
- Extend `packages/database/src/index.ts` exports and test factories under
  `packages/test-support`.
- Add empty-schema, prior-W0, and prior-W1 migration paths plus forward-fix notes.
- Add a deterministic M2 readiness/health projection fixture seeder under `packages/test-support`.
  It is available only to test/validation processes with direct test-database access, is not
  imported by web/worker production bundles, and is the only way M2 staging evidence may simulate
  later-module facts before those modules exist.

### Slice C — Application services and identity handoff

- Add `packages/application/src/projects.ts` command/query ports and orchestration.
- Add the exported Identity & Access checks needed for active workspace membership and linked
  project-bound workspace invitation issue/acceptance without direct domain-package table
  coupling. Add the Projects access-classification query used by the existing workspace endpoint
  to prevent a Client-Stakeholder-only account from receiving the M1 internal directory.
- Add outbox event contracts for client/project, membership, lifecycle, invitation, and capacity
  changes; extend the worker union/consumer acknowledgement safely.
- Add application tests for permissions, Admin override, stale revisions, idempotency, and
  structured errors.

### Slice D — Server data access and HTTP

- Add a server-only projects/clients data-access module under `apps/web/lib`.
- Add the endpoint groups in Section 6 using the existing correlation and safe-error patterns.
- Centralize server-derived authorization context and ensure client-provided workspace, role, MFA,
  or override claims are ignored.
- Add HTTP contract and adversarial tests for every actor class and foreign/missing identifiers.

### Slice E — Accessible registry UI

- Extract a reusable authenticated shell from the M1 screen without regressing identity flows.
- Add the M2 pages, small interactive components, and required `packages/ui` wrappers/patterns.
- Implement conflict reload/retry, structured readiness display, archive read-only presentation,
  invitation delivery state, and explicit Admin override confirmation.
- Add component tests and desktop/mobile Playwright coverage with current-run visual evidence.

### Slice F — Staging, evidence, and handoff

- Apply the reviewed migration to the staging database only after a verified backup.
- Deploy web and worker from the reviewed source revision.
- Run the complete role/lifecycle/portfolio/invitation flow on the public URL.
- Inspect liveness, readiness, migration state, job processing, safe logs, and error/latency signals.
- Write `docs/validation/w2-m2-client-project-registry.md`, link it from both roadmap locations,
  and move M2 through `In Validation` to `Complete` only if every exit condition passes.

## 8. Migration, Rollout, and Failure Plan

- The next migration is additive from both an empty schema and the validated W1 schema.
- Before staging application, take and verify a database backup and record only its approved
  location, size, checksum, and restore evidence—not credentials or data.
- Use one migration chain. Production startup never generates or silently applies schema.
- The supported post-deployment recovery is a forward fix. Destructive rollback is limited to a
  disposable local/test database before release.
- Default readiness and health projections are conservative. Missing later-module evidence is
  unmet/unknown, never inferred as passed or healthy.
- A failed invitation email leaves a non-authorizing, retryable record. A failed capacity consumer
  leaves an observable pending/failed outbox event; it never reports capacity as recalculated.
- Search and portfolio queries are bounded and indexed before staging. Load evidence must cover the
  pilot fixture size and a high-cardinality workspace without using production content.
- Incomplete UI is not exposed in staging until its feature flag/default routing is explicitly
  enabled for validation.

## 9. Observability and Threat-Model Delta

Record allowlisted correlated logs and metrics for client/project mutation result class, lifecycle
denials, readiness criterion codes, invitation delivery/activation, authorization denials, Admin
override, revision conflict, idempotency replay, portfolio query latency, and capacity-event lag.
Do not log client notes, contact email, invitation tokens/digests, cookies, authorization headers,
or form bodies.

Threat cases covered by tests:

- Cross-workspace and cross-project IDOR on reads, filters, search, mutation, history, and
  invitation acceptance.
- Forged workspace/project roles, client ID, project type, MFA timestamp, override reason/flag, and
  readiness facts.
- Workspace Admin silently acting as PM, stale/replayed override, and missing step-up.
- Last-PM and max-Lead races, incompatible stakeholder/internal roles, concurrent role replacement,
  and deactivated workspace membership.
- Invitation replay, wrong email, expiry, reissue, delivery failure, workspace-only acceptance, and
  client/project mismatch.
- Lifecycle races, forged resume target, archived mutation, readiness time-of-check/time-of-use,
  and stale expected revision.
- Search enumeration, unauthorized filter counts, unsafe error detail, formula/HTML injection in
  text fields, oversized notes/query input, and sensitive log leakage.
- Overlapping availability ranges, invalid calendar/time zone/date range, and capacity-event
  duplication.

No unresolved Critical or High security finding may enter the exit gate.

## 10. Acceptance and Validation Matrix

| Requirement/gate | Planned evidence |
| --- | --- |
| FR-M1-07 independent project roles and project-specific client invite | Role policy, repository races, HTTP adversarial tests, multi-project browser journey |
| FR-M2-01 Client fields and Admin/PM creation | Contract/repository tests and Admin/PM client UI |
| FR-M2-02 external/internal creation | Type/client constraints, command integration, creation browser flow |
| FR-M2-03 profile, dates, composition, availability, calendar, PM/Lead/stakeholders | Creation contract, transaction assertions, complete project wizard |
| FR-M2-04 editable composition/audit/capacity event | Repository audit/outbox assertions and team/calendar browser flow |
| FR-M2-05 lifecycle, reason, hold/resume/backward/archive | State-machine/property tests, concurrency tests, lifecycle browser flow |
| FR-M2-06 portfolio health | Query integration, bounded load test, responsive desktop/mobile portfolio |
| FR-M2-07 search and filters | Query/authorization/index-plan tests and filter browser flow |
| FR-M2-08 archive read-only/preservation | Mutation denial, preserved reads/history, archive/unarchive browser flow |
| FR-M2-09 readiness gates | Criterion unit tests, projection integration, structured error/UI evidence |
| Bounded FR-M2-10 placeholder | Creation transaction, read-only milestone display, explicit M6 handoff |
| NFR-01 usability | Guided creation, clear next actions, timed critical-flow review |
| NFR-04–05 security/privacy | Tenant/project IDOR, role forgery, invitation, override, log-redaction suite |
| NFR-06, NFR-12–13 shared contracts | Migration, revisions, idempotency, audit/outbox, correlation, load evidence |
| NFR-07 accessibility | Component semantics, keyboard/focus, axe, zoom/reflow, desktop/mobile evidence |
| Operational gate | Backup/restore evidence, migration, deploy, health/readiness, logs/metrics review |

Required final validation includes:

1. Formatting, lint/boundaries, typecheck, dependency policy, documentation checks, and production
   build.
2. Unit, property, contract, component, application, repository, integration, migration,
   adversarial, and retained W0/M1 regression suites.
3. Coverage review for meaningful M2 domain/application branches; a percentage alone is not the
   exit gate.
4. Source secret scan, runtime dependency audit, and available fixed-vulnerability image scan.
5. Local real PostgreSQL/Redis/Mailpit flow and web/worker container smoke.
6. Playwright desktop Chromium and Pixel 7 flows with axe, keyboard/focus, no-overflow, and
   current-run screenshot review.
7. Staging migration/deploy, public desktop/mobile browser flow, liveness/readiness, worker/outbox,
   safe log, and error-rate review.

The minimum browser scenario creates two workspaces, two clients, an internal project, and an
external project; assigns one user different roles in different projects; invites and accepts a
personal-email Client Stakeholder; proves cross-workspace/project denial; edits team/calendar and
observes a capacity event; searches/filters the portfolio; exercises failed and passing readiness
facts; holds/resumes/reopens/cancels/archives/unarchives; verifies archived read-only behavior; and
uses an explicit step-up Admin override without granting a persistent project role.

## 11. Version and Recommended-Practice Review

Registry and primary-documentation checks were refreshed on 2026-07-25.

- No new runtime library is required for M2.
- The current exact pins remain the latest stable releases for Next.js `16.2.11`, React `19.2.8`,
  Drizzle ORM `0.45.2`, Zod `4.4.3`, Base UI `1.6.0`, and axe-playwright `4.12.1`.
- Drizzle `1.0` remains prerelease; the implementation stays on stable `0.45.2`, uses checked-in
  generated migrations, named indexes/constraints, and explicit transactions.
- Playwright `1.62.0` became stable on 2026-07-24 and is newer than the repository pin `1.61.1`.
  Recheck it at implementation start, review its release notes/browser image impact, then upgrade
  the package and browser binaries together before recording M2 browser evidence.
- ESLint 10, TypeScript 7, and Node 26 types are newer major lines than the validated platform
  pins. They are not M2 runtime dependencies. A major platform toolchain upgrade requires a
  separate compatibility migration and complete W0/M1 regression evidence; M2 must not silently
  mix that migration into feature code.
- Follow current Next.js guidance by centralizing secure authorization in a server-only data-access
  layer, returning explicit DTOs, and treating every Route Handler or Server Action as a public
  authorization boundary.
- Follow current Base UI guidance by using a Combobox only for a sufficiently large predefined
  filtered choice, a Select for non-filtered choices, and programmatic labels/descriptions for
  every form control.

Re-run the stable dist-tag, peer/engine, deprecation, vulnerability, and official-recommendation
checks immediately before implementation and again before validation. Exact versions and the
lockfile are the evidence; prerelease, canary, preview, and release-candidate lines are excluded
unless an approved decision explicitly selects them.

Primary references:

- [Next.js authentication and authorization guide](https://nextjs.org/docs/app/guides/authentication)
- [Drizzle transactions](https://orm.drizzle.team/docs/transactions)
- [Drizzle indexes and constraints](https://orm.drizzle.team/docs/indexes-constraints)
- [Drizzle migration guidance](https://orm.drizzle.team/docs/faq)
- [Base UI form guidance](https://base-ui.com/react/handbook/forms)
- [Base UI Combobox guidance](https://base-ui.com/react/components/combobox)
- [Playwright release notes](https://playwright.dev/docs/release-notes)

## 12. Plan Review

Reviewed on 2026-07-25 against the Product Plan, Domain Model & Workflows, Architecture & Contracts,
Design System, Development Guidelines, AI/Security Evaluation, Pilot Scope, S2 backlog, roadmap
Definition of Done, current W1 implementation/validation, package registry stable tags, and the
primary documentation linked above.

Review conclusions:

- Every assigned M2 requirement has a domain, persistence, application, API, UI, authorization,
  migration, test, staging, and evidence destination.
- The plan preserves the normative separation between workspace and project roles and does not
  give Workspace Admins silent PM authority.
- Cross-module readiness uses an event-fed project projection rather than direct later-module
  table access.
- The initial Module placeholder preserves the M6 handoff without claiming full FR-M2-10.
- No new runtime dependency is needed; the one newer direct validation tool is explicitly queued
  for compatibility review at implementation start.
- The plan keeps a single migration chain, conservative readiness, reversible archival, explicit
  failure states, and deny-by-default tenant/project access.
- W1 is `Complete`, this packet is approved, the specification commit is frozen, and the roadmap
  owner/status changes are synchronized with the first implementation slice.

Implementation proceeds through the vertical slices above. M2 moves to `In Validation` only after
the mapped implementation, test, migration, accessibility, security, browser, and operational
evidence is ready for its exit gate.
