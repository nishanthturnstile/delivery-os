# W1 M1 Identity, Tenancy & Workspace — Validation Record

**Validation result:** Local and Railway deployment gates passed; controlled-inbox S1 acceptance pending
**Date:** 2026-07-25  
**Owner:** Identity & Access  
**Plan:** [W1 M1 execution packet](../planning/w1-m1-identity-tenancy-workspace.md)  
**Backlog:** [S1 Accounts, Authentication, and Workspace Tenancy](../planning/delivery-backlog.md#s1--accounts-authentication-and-workspace-tenancy)

## 1. Outcome

W1 M1 implementation, local exit gates, Railway migration/deployment, provider delivery smoke, and
public desktop/mobile browser checks pass. The roadmap remains blocked because its exit gate
requires the complete S1 journey in staging: the restricted send-only Resend key correctly cannot
read email bodies, and no controlled staging inbox was available to follow verification, magic,
reset, and invitation links. The reviewed source is also not yet published through repository
review, so it is not safe to mark the module complete.

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
| Unit, contract, component, integration, and repository tests | Passed: 16 files, 56 tests |
| Empty and prior-W0 migration paths | Passed: 2 tests |
| V8 coverage | Passed: 94.47% statements, 83.73% branches, 98.97% functions, 96.68% lines |
| Production build | Passed across all 12 workspace packages |
| Local PostgreSQL migration application | Passed |
| Local dependency health | Passed: PostgreSQL, Redis, MinIO, Mailpit, and ClamAV healthy |
| Web and worker production container builds | Passed |
| Production web-container smoke | Passed as UID/GID 65532; liveness and PostgreSQL/Redis readiness healthy |
| Source secret scan | Passed with Gitleaks 8.30.1; no leaks found |
| Runtime vulnerability scan | Passed with Trivy 0.72.0; zero fixed High/Critical findings in changed web and worker images |
| Railway migration | Passed twice; migration `0001` created all 10 M1 tables and the second run was idempotent |
| Railway deployment | Passed: web and worker reached terminal `SUCCESS` |
| Railway provider smoke | Passed through the deployed sign-up UI with Resend's safe delivered-test addresses |
| Staging S1 acceptance | Partial: public/provider boundaries pass; controlled-inbox email-link journey remains |

## 5. Browser Verification

Playwright CLI exercised the real Next.js, Better Auth, Mailpit, and PostgreSQL flow in desktop
Chromium and a Pixel 7 viewport:

- 12 repository browser tests passed across desktop and mobile projects: 6 exhaustive M1 scenarios,
  4 retained W0/authentication-decision scenarios, and 2 deployed-boundary smoke scenarios.
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
- Deployment preflight found and fixed a staging-safety gap: preview, staging, and production now
  require a canonical HTTPS Better Auth origin, a secret of at least 32 characters, and complete
  Resend configuration instead of silently falling back to local SMTP. Eight focused configuration
  tests, lint, typecheck, and the production build pass after the correction.
- Six public-URL Playwright checks passed: four foundation/identity-surface checks plus two
  desktop/mobile deployed-boundary checks. The latter verify security headers, anonymous session
  behavior, protected-route denial, the invitation sign-in boundary, axe results, horizontal fit,
  and Resend acceptance through the real sign-up UI.
- Runtime review found and fixed Railway client-IP attribution. Better Auth now trusts Railway's
  overwritten `X-Real-IP` header rather than collapsing all staging users into one rate-limit
  bucket; the corrected release emitted zero warnings, errors, or HTTP 5xx responses.
- The final review also replaced a repeated-success-message test race with waits on actual
  membership role transitions and raised only the local/test sensitive ceiling so immediate
  repeated audits remain deterministic. Staging's limit remains three.
- Local/test-only rate-limit ceilings allow deterministic repeated browser audits; preview, staging,
  and production limits remain unchanged.

The executable browser specifications are `tests/e2e/identity.spec.ts`,
`tests/e2e/foundation.spec.ts`, and `tests/e2e/deployed-identity-smoke.spec.ts`. Current local visual
evidence is generated under `test-results/m1-ui-audit-final-2/` and deployed visual evidence under
`test-results/deployed-m1/`; both are ignored review artifacts, while this record and the browser
specifications remain the durable evidence.

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

## 8. Railway Deployment and Validation Evidence

The linked [Railway project](https://railway.com/project/d3b8b065-7605-41d2-a844-4625d527b0c2)
serves M1 at <https://web-production-57ecb9.up.railway.app>. Its Railway environment is named
`production`, while the application correctly remains in `APP_ENV=staging`.

On 2026-07-25:

- A PostgreSQL 18.4 custom-format pre-migration dump was verified with `pg_restore --list`. Its
  operator-local path is `/tmp/delivery-os-m1-railway-backup.AYcyNl/pre-m1.dump`, size is 20 KiB,
  and SHA-256 is `4b980e069d77d596dd12fb0fff07650f257b42bb8866eb69dcc61ba731e52a6e`.
- Migration `0001_wakeful_blizzard.sql` applied successfully. All 10 expected M1 tables were present,
  and an immediate second migration run passed without another schema change.
- Required Better Auth, canonical origin, Resend, PostgreSQL, and Redis settings passed a
  value-presence/configuration check without printing secret values.
- Worker deployment `cd5665f2-34d4-4b0d-aaa1-94b438cff47d` reached terminal `SUCCESS` and reports
  release `321fef4-m1.1`.
- Web deployment `3c681748-d823-4119-abfa-fce513d003a0` reached terminal `SUCCESS` and reports
  release `321fef4-m1.3`.
- Public liveness and readiness returned `200`; PostgreSQL and Redis were both up. Anonymous session
  resolution returned `null`, and the retained platform transaction returned `201`.
- Four foundation checks and two deployed identity/provider smoke checks passed across desktop
  Chromium and Pixel 7 projects. Final full-page screenshots were visually reviewed with coherent
  layout and no horizontal overflow; all mapped axe scans reported zero violations.
- Two sign-up requests through the deployed UI were accepted by Resend using its official
  `delivered+label@resend.dev` safe test pattern. The exact unverified validation users were removed
  afterward. The restricted send-only key returned `401` for email-list access as intended, so no
  secret scope was widened merely to automate link retrieval.
- The final web deployment logged zero warning/error entries, zero client-IP fallback messages, and
  zero HTTP 5xx responses after browser validation. Worker startup was healthy with no error entry.
- Security headers included `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY`.

## 9. Manual and Post-Validation Actions

The following external actions remain before the M1 staging exit gate can pass:

1. Publish commit `321fef4` and the reviewed working-tree corrections through repository review/CI.
   Until `main` contains M1, a future repository-linked autodeploy can replace the validated release
   with the older W0 source.
2. Move the operator-local pre-migration dump to approved encrypted backup storage and verify its
   recorded checksum there.
3. Using one controlled Admin inbox and one personal-email client inbox, complete verification,
   invitation/reissue, magic-link, and password-reset link journeys on the public URL. No secret or
   inbox credential should be placed in source control or chat.
4. Record the controlled-inbox acceptance evidence here. Then synchronize both roadmap locations to
   `Complete` only if the staging exit gate passes.
