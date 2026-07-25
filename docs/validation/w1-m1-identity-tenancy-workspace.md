# W1 M1 Identity, Tenancy & Workspace — Validation Record

**Validation result:** Local exit gates passed; staging acceptance pending  
**Date:** 2026-07-25  
**Owner:** Identity & Access  
**Plan:** [W1 M1 execution packet](../planning/w1-m1-identity-tenancy-workspace.md)  
**Backlog:** [S1 Accounts, Authentication, and Workspace Tenancy](../planning/delivery-backlog.md#s1--accounts-authentication-and-workspace-tenancy)

## 1. Outcome

W1 M1 implementation and all local exit gates pass. The roadmap remains `In Validation` because its
exit gate explicitly requires S1 acceptance in staging. No staging deployment, repository publish,
or production provider change was made as part of this local implementation change.

## 2. Implemented Capability

- Better Auth email/password, verification, magic link, reset, TOTP, encrypted recovery codes,
  database-backed rate limiting, session listing/revocation, and deactivated-user session denial.
- Explicit workspace creation, first-Admin assignment, profile configuration, multi-workspace
  selection, tenant-safe reads, Admin/Member roles, invitations, role changes, and deactivation.
- Transactional UUIDv7 commands with optimistic revision checks, idempotency, append-only audit,
  outbox events, last-active-Admin enforcement, and recent-TOTP step-up for privileged actions.
- Responsive authentication, onboarding, invitation acceptance, workspace, team, profile,
  password, MFA/recovery, and session-management browser surfaces.

## 3. Version Review

The implementation uses the newest compatible stable releases re-verified on 2026-07-25. Better Auth
and its Drizzle adapter are pinned to stable `1.6.25`; the newer `1.7.0` line is a release candidate
and was not selected. The existing validated platform versions remain exact-pinned, including
Next.js `16.2.11`, React `19.2.8`, Drizzle ORM `0.45.2`, PostgreSQL client `8.22.0`, Zod `4.4.3`,
Vitest `4.1.10`, Playwright `1.61.1`, and axe-playwright `4.12.1`.

A fresh recursive registry audit found no newer stable M1 runtime dependency. New major lines for
ESLint, Node.js types, and TypeScript remain platform-wide migrations rather than M1 dependency
updates and require their own compatibility review before changing the validated foundation. The
deactivated-user session boundary follows Better Auth's current recommendation to stop a database
hook by throwing an `APIError`, rather than relying on a false return alone.

## 4. Automated Results

| Gate | Result |
| --- | --- |
| Formatting | Passed |
| ESLint and package boundaries | Passed |
| TypeScript across 12 workspace packages | Passed |
| Exact dependency policy and documentation links | Passed |
| Unit, contract, component, integration, and repository tests | Passed: 15 files, 48 tests |
| Empty and prior-W0 migration paths | Passed: 2 tests |
| V8 coverage | Passed: 94.64% statements, 81.73% branches, 98.95% functions, 96.76% lines |
| Production build | Passed across all 12 workspace packages |
| Local PostgreSQL migration application | Passed |
| Local dependency health | Passed: PostgreSQL, Redis, MinIO, Mailpit, and ClamAV healthy |
| Web and worker production container builds | Passed |
| Production web-container smoke | Passed as UID/GID 65532; liveness and PostgreSQL/Redis readiness healthy |
| Source secret scan | Passed with Gitleaks 8.30.1; no leaks found |
| Runtime vulnerability scan | Passed with Trivy 0.72.0; zero fixed High/Critical findings in changed web and worker images |
| Staging S1 acceptance | Pending external deployment and provider configuration |

## 5. Browser Verification

Playwright CLI exercised the real Next.js, Better Auth, Mailpit, and PostgreSQL flow in desktop
Chromium and a Pixel 7 viewport:

- 10 repository browser tests passed across desktop and mobile projects: 6 exhaustive M1 scenarios
  plus 4 retained W0/authentication-decision scenarios.
- The browser journey covered account creation and verification, explicit workspace onboarding,
  Admin and Member experiences, workspace and personal profile persistence, multi-workspace
  switching, TOTP/recovery enrollment, recent-TOTP step-up, invitation reissue and acceptance,
  role changes, last-Admin protection, membership deactivation, session creation/revocation,
  password change, magic-link sign-in, recovery-code sign-in, enumeration-safe entry points, and a
  complete known-account password reset.
- 66 fresh full-page states were captured across desktop and mobile. Every captured state ran an
  axe scan with zero reported violations and asserted no horizontal overflow.
- All final screenshots were visually reviewed as current-run contact sheets. Navigation,
  hierarchy, status feedback, wrapping, responsive stacking, and sensitive-value masking were
  coherent.
- The review fixed pre-hydration auth clicks, profile-state rehydration, missing onboarding sign-out,
  MFA setup guidance, duplicate MFA feedback, heading readability, deactivated-user denial
  feedback, a sign-out test race, and the password-reset completion action.
- Local/test-only rate-limit ceilings allow deterministic repeated browser audits; preview, staging,
  and production limits remain unchanged.

The executable browser specification is `tests/e2e/identity.spec.ts`. Current local visual evidence
is generated under `test-results/m1-ui-audit-final-2/`; it is an ignored review artifact, while this
record and the browser specification remain the durable evidence.

## 6. Requirement and Exit-Gate Evidence

| Requirement or gate | Evidence/result |
| --- | --- |
| FR-M1-01, FR-M1-04 verified password, magic link, reset, sessions, TOTP, recovery | Browser flow, Better Auth configuration, and enumeration-safe scenario pass |
| FR-M1-02 explicit workspace and first Admin | Repository and onboarding browser scenarios pass |
| FR-M1-03 multi-workspace, personal email, no domain grants | Multi-workspace repository and personal-email browser scenarios pass |
| FR-M1-05 workspace profile | Contract and tenant-scoped settings integration scenarios pass |
| FR-M1-06, FR-M1-09 role management and audit | Command, repository, audit, revision, and outbox assertions pass |
| FR-M1-08 expiry and reissue | Clock policy and digest-only reissue/old-token rejection scenarios pass |
| FR-M1-10 deactivation and attribution | Session deletion, identity denial, other-workspace preservation, audit, and browser denied-sign-in scenarios pass |
| FR-M1-11 last active Admin | Pure policy, single-Admin denial, and competing-transaction scenarios pass |
| FR-M1-12 profile, avatar, notifications, password | HTTPS contract, repository settings, password change, and session-revocation surfaces pass |
| FR-M1-13 recent TOTP | Application gate, HTTP step-up, and magic-link Admin browser step-up pass |
| FR-M1-14 tenant-safe authorization | Foreign-workspace reads and commands return the same safe `NOT_FOUND` result as missing data |
| NFR-01 | Responsive onboarding and complete desktop/mobile browser journeys pass |
| NFR-04–05 | Rate limits, trusted origins, secure cookies, digested tokens, session revocation, secret scan, and adversarial tests pass |
| NFR-06, NFR-12–13 | Versioned contracts, UUIDv7, revisions, idempotency, audit, outbox, and correlation assertions pass |
| NFR-07 | Semantic labels, keyboard-operable controls, responsive review, and axe scan pass |

FR-M1-07 remains assigned to M2 as specified by the roadmap.

## 7. Operational Configuration

Local email is captured by Mailpit. Preview, staging, and production require an approved Resend API
key and verified sender. Production also requires a unique Better Auth secret and canonical HTTPS
base URL supplied through the platform secret manager. The deployment sequence, failure behavior,
rate limits, and incident notes are recorded in
[Infrastructure and Deployment](../deployment/infrastructure.md#9-m1-identity-and-email-operations).

## 8. Manual and Post-Validation Actions

The following external actions remain before M1 can move from `In Validation` to `Complete`:

1. Publish this change through the repository review/CI process and confirm all CI jobs pass.
2. Provision the staging Resend sender/API key and a staging-only Better Auth secret; set the exact
   staging HTTPS `BETTER_AUTH_URL`.
3. Back up staging, apply migration `0001`, deploy the reviewed web and worker artifacts, and run
   the S1 acceptance journey with controlled staging inboxes.
4. Record the deployment, migration, email-delivery, browser, and rollback evidence here. Then
   synchronize both roadmap locations to `Complete` only if the staging exit gate passes.
