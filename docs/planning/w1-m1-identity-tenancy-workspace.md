# W1 M1 Identity, Tenancy & Workspace — Execution Packet

**Owner:** Identity & Access  
**Approved specification commit:** `ca0da86`  
**Requirements:** FR-M1-01–06, FR-M1-08–14; NFR-01, NFR-04–07, NFR-12–13  
**Backlog:** [S1 Accounts, Authentication, and Workspace Tenancy](delivery-backlog.md#s1--accounts-authentication-and-workspace-tenancy)  
**Roadmap:** [W1 M1](implementation-roadmap.md#5-w1--m1-identity-tenancy--workspace)

## 1. Objective and Boundaries

Deliver the authenticated, tenant-safe workspace lifecycle needed by all later modules. Better Auth
authenticates human principals; Delivery OS commands and repositories own tenant membership,
authorization, invitation lifecycle, audit, revision, and idempotency.

Included:

- Verified email/password and magic-link account creation and sign-in.
- Password reset, session listing/revocation, TOTP enrollment/challenge, and recovery codes.
- Explicit workspace creation and profile editing.
- Admin/Member membership, multi-workspace switching, invitation issue/reissue/acceptance, role
  change, and deactivation.
- Last-active-Admin enforcement, session revocation after deactivation or privilege change, recent
  TOTP step-up for privileged commands, and safe cross-tenant failures.
- Onboarding, sign-in, invitation, workspace, member, profile, security, recovery, and session
  browser surfaces.

Explicitly excluded:

- Project membership and FR-M1-07, which complete with M2.
- MCP OAuth provider/client authorization, which completes with M10. M1 supplies the recent-TOTP
  authorization contract it will consume.
- Production email-domain verification, provider credentials, workspace deletion/export, and
  production release operations.

## 2. Approved Technical Approach

- Pin the current stable Better Auth `1.6.25` line and its Drizzle adapter. Do not adopt the
  `1.7.0` release candidate.
- Use Better Auth's PostgreSQL/Drizzle adapter, Next.js standard request handler, email/password,
  Magic Link, and Two-Factor plugins. Keep Better Auth tables in the checked-in Drizzle migration
  chain and never let runtime startup migrate them.
- Keep Delivery OS workspace tables separate from Better Auth organization tables. Email domain
  never creates or selects a tenant.
- Store only token digests for Delivery OS invitations. A reissue transaction revokes every prior
  pending token for the membership. Acceptance locks and validates invitation, verified email,
  expiry, and membership state together.
- Use application-generated UUIDv7 IDs for Delivery OS aggregates. Better Auth keeps its supported
  string identifiers because its adapter controls those records.
- Enforce tenant scope inside repository methods from a server-derived authorization context. A
  foreign workspace identifier returns the same safe `NOT_FOUND` response as a missing identifier.
- Execute workspace and membership mutations transactionally with revision checks, idempotency,
  append-only audit, and outbox records. Privileged commands require TOTP verification no older
  than ten minutes.
- Use Server Components for session-derived reads and small Client Components for interactive auth
  and mutation forms. Application screens import primitives only from `@delivery-os/ui`.
- Local/test email uses a deterministic capture adapter. Production remains fail-closed until an
  approved Resend configuration exists.

## 3. Vertical Slices and File-Level Plan

### Slice A — Contracts, policies, and persistence

- Add versioned identity/workspace command, query, and result schemas to `packages/contracts`.
- Add pure invitation, last-Admin, membership, tenant-scope, and recent-step-up policies to
  `packages/domain` and `packages/auth`.
- Add Better Auth and Delivery OS identity tables, indexes, constraints, and the next checked-in
  migration to `packages/database`.
- Add tenant-scoped repositories that atomically write workspace/membership state, audit, outbox,
  revision, and idempotency records.

### Slice B — Authentication and application commands

- Configure the Better Auth server/client adapters, password verification/reset, Magic Link, TOTP,
  recovery codes, session management, safe trusted origins, secure production cookies, and
  rate-limiting behavior.
- Implement create/update workspace, invite/reissue/accept, role change, deactivate, profile
  update, workspace switch, session list/revoke, and authorization-context queries.
- Revoke affected Better Auth sessions after deactivation and privilege changes. Do not log tokens,
  cookies, passwords, TOTP secrets, recovery codes, or email bodies.

### Slice C — HTTP and accessible workspace UI

- Mount `/api/auth/[...all]` and authenticated Delivery OS workspace endpoints.
- Replace the W0 harness landing page with responsive authentication/onboarding and authenticated
  workspace settings surfaces while retaining platform health endpoints.
- Cover labels, descriptions, errors, busy states, keyboard order, focus restoration, mobile
  layout, reduced motion, and screen-reader status announcements.

### Slice D — Evidence and operations

- Add unit, contract, repository/integration, migration, security/adversarial, component, and
  Playwright coverage.
- Document environment variables, email/provider behavior, migration/forward-fix notes, auth
  operational signals, and manual production setup.
- Record the complete validation result and link it from both W1 roadmap locations.

## 4. Authorization and Lifecycle Rules

| Action | Actor/gate |
| --- | --- |
| Create workspace | Verified active user; creator becomes first active Admin |
| Read workspace/member data | Active membership in the same workspace |
| Update workspace profile | Active Admin plus recent TOTP |
| Invite/reissue member | Active Admin plus recent TOTP |
| Accept invitation | Signed-in verified user whose normalized email matches the invite |
| Change role/deactivate | Active Admin plus recent TOTP; expected revision; not last active Admin |
| Update own profile | Signed-in active user |
| List/revoke own sessions | Signed-in active user; current-session revocation signs out |
| Switch workspace | Active membership; stored selection is presentation context, not authority |

Deactivated membership preserves user and audit attribution. A user may remain active in other
workspaces. Authorization derives the selected workspace on every request and does not use email
domain, hidden controls, or client-provided role claims.

## 5. Migration and Failure Plan

- Migration adds Better Auth core/plugin tables plus user profile, workspace, membership,
  invitation, workspace-selection, and MFA-step-up metadata.
- Empty-schema and prior-W0 migrations must both pass. Forward fix is the supported recovery path
  after deployment; before release, the migration may be reverted only against disposable local
  or test databases.
- Unique/index constraints cover normalized email, workspace membership, active invitation token
  digest, tenant lookup, and Better Auth session/token lookup.
- Email send failure leaves the invitation safely re-issuable and reports an actionable state.
- Expired, revoked, consumed, wrong-email, missing, and foreign-workspace invitation failures use
  safe stable errors.
- Authentication/provider dependency failures return safe responses and correlated operational
  logs without secrets.

## 6. Observability and Threat-Model Delta

Record safe counters and correlated logs for sign-in result class, verification/reset/magic-link
delivery result, MFA challenge result, session revocation, workspace mutation, invitation lifecycle,
last-Admin denial, and tenant-scope denial. Workspace and user IDs may be recorded where approved;
email addresses, raw tokens, cookies, credentials, TOTP secrets, QR payloads, and recovery codes may
not.

Threat cases covered by tests:

- Account enumeration, credential/reset/magic-link abuse, replay, expired/reissued invitations,
  personal-email invitation acceptance, and email-domain tenant confusion.
- Client-forged workspace/role/MFA claims, cross-workspace IDs, session fixation/reuse after
  revocation, last-Admin race, stale revisions, and duplicate commands.
- CSRF/trusted-origin enforcement and secret leakage through errors or logs.

## 7. Acceptance and Validation Matrix

| Requirement/gate | Evidence |
| --- | --- |
| FR-M1-01, 04 verified password/magic-link/reset | Auth contract/integration and browser flows |
| FR-M1-02 explicit workspace/first Admin | Command integration and onboarding browser flow |
| FR-M1-03 multi-workspace/personal email/no domain access | Repository security tests and browser switch |
| FR-M1-05 profile fields | Contract, repository, and settings browser tests |
| FR-M1-06, 09 roles/audit | Command integration and audit assertions |
| FR-M1-08 expiry/reissue | Clock-controlled domain and integration tests |
| FR-M1-10 deactivation/attribution/revocation | Integration and adversarial session test |
| FR-M1-11 last active Admin | Policy plus concurrent transaction test |
| FR-M1-12 own profile/security | Contract and browser flows |
| FR-M1-13 recent TOTP for privileged action | Policy, HTTP, magic-link Admin browser flow |
| FR-M1-14 tenant-safe server authorization | Cross-tenant/IDOR test suite |
| NFR-01 onboarding usability | Timed browser scenario and responsive review |
| NFR-04–05 security/privacy | Auth abuse, token, CSRF, session, IDOR, and log-redaction suite |
| NFR-06, 12–13 shared contracts | Audit/outbox/idempotency/revision/correlation assertions |
| NFR-07 accessibility | Keyboard/focus, axe, desktop, and mobile Playwright evidence |
| Migration/operations | Empty/prior migration, production build, readiness, and runbook review |

Required final commands include formatting, lint/boundaries, typecheck, dependency/doc checks,
unit/integration/migration suites, coverage, production build, Playwright desktop/mobile, and
source/dependency security scans available in the repository.

## 8. Plan Review

Reviewed on 2026-07-24 against the Product Plan, Domain Model, Architecture & Contracts, Design
System, Security Evaluation, S1 backlog, roadmap Definition of Done, Better Auth stable
documentation, and the existing W0 implementation.

Review conclusions:

- W0 is `Complete` and has stable linked validation evidence.
- Identity & Access is the assigned M1 owner.
- All S1 requirements have an implementation slice and evidence destination.
- FR-M1-07 and MCP OAuth are deliberately deferred to their dependency waves.
- Better Auth stable `1.6.25` is compatible with the current Drizzle `0.45.2` peer requirement.
- The plan preserves one migration chain, application-owned tenancy, server-side authorization,
  secure failure behavior, and the repository module boundaries.

The execution packet is finalized for implementation.
