# W2 M2 Client & Project Registry — Validation Record

**Validation result:** Complete — implementation, CI, migration, deployment, controlled-email
acceptance, desktop/mobile browser, accessibility, security, and operational gates pass

**Date:** 2026-07-26

**Owner:** Projects & Clients

**Plan:** [W2 M2 execution packet](../planning/w2-m2-client-project-registry.md)

**Backlog:** [S2 Clients, Projects, Project Roles, and Lifecycle](../planning/delivery-backlog.md#s2--clients-projects-project-roles-and-lifecycle)

**Implementation PR:** [#1](https://github.com/nishanthturnstile/delivery-os/pull/1)

**Published revision:** `d6c64cd1d6cca5bad0b8ebe18d37392f76d272f6`

**Acceptance issue:**
[#2](https://github.com/nishanthturnstile/delivery-os/issues/2)

## 1. Outcome

The M2 implementation and every automatable exit-gate suite pass. It provides tenant-safe Client
and Project registries, independent project roles, linked stakeholder invitations, calendar and
availability management, governed lifecycle/readiness, portfolio search and filters, audit/outbox
records, an outcome Module placeholder, and responsive authenticated browser surfaces.

The reviewed source is merged, repository CI is green, migration `0002` is applied, the exact
implementation merge revision reached terminal success on Railway web and worker, and public
health/readiness and unauthenticated boundary smoke pass. That implementation revision remains in
the ancestry of the current healthy `main` release.

The previously external acceptance in
[#2](https://github.com/nishanthturnstile/delivery-os/issues/2) now passes. The public desktop and
mobile browser journeys used separate Resend-controlled test identities, retrieved the verification
and project invitation links through the authenticated Resend CLI, and completed the full M2
workflow. Provider events, runtime logs, metrics, outbox processing, accessibility checks, reflow,
and visually reviewed screenshots all pass, so the M2 exit gate is closed.

The linked Railway project has one environment named `production`; its application configuration
remains `APP_ENV=staging`. This record names that topology accurately instead of implying a second
Railway staging environment exists.

## 2. Implemented Capability

- Versioned Zod contracts, safe structured errors, project events, application command/query ports,
  and pure role, lifecycle, readiness, archive, calendar, and capacity policies.
- Additive Drizzle migration `0002_odd_fantastic_four.sql` with Client, Project, project
  membership/role, invitation, calendar, exception, availability, lifecycle, readiness, health,
  and outcome tables plus tenant-safe indexes and constraints.
- Transactional PostgreSQL adapter with exact-one-PM and max-one-Lead enforcement, atomic PM
  replacement, explicit stakeholder acceptance, optimistic revisions, idempotency, append-only
  audit, outbox, Admin override, conservative readiness, and archived read-only behavior.
- Same-origin Route Handlers that authenticate and derive actor, tenant, project, MFA, IDs, tokens,
  correlation, and idempotency context on the server.
- Bookmarkable Client and Project views with create/edit/archive/restore, internal/external project
  creation, profile/team/calendar/exception/availability controls, stakeholder invitations,
  structured lifecycle feedback, history, outcome milestone, search, and portfolio filters.
- Client-Stakeholder-only access classification that keeps the M1 internal directory and Team
  registry surfaces hidden until the client portal arrives in M8.

## 3. Version and Supply-Chain Review

Registry stable tags and official recommendations were refreshed immediately before validation.
The implementation uses exact stable pins for Next.js `16.2.11`, React `19.2.8`, Drizzle ORM
`0.45.2`, Zod `4.4.3`, Base UI `1.6.0`, axe-playwright `4.12.1`, and Playwright `1.62.0`.
Drizzle `1.0` remains prerelease and was not selected.

Resend CLI `2.10.0` reported itself current, accepted the deployment-scoped credential, and
confirmed `discovery.thaarei.com` verified with no pending domain. The public test used Resend's
[documented delivered test recipients](https://resend.com/docs/knowledge-base/what-email-addresses-to-use-for-testing)
with unique labels; no API key was copied into source, chat, test artifacts, or local credentials.

A live production dependency audit disclosed new High advisories in transitive `sharp`, `postcss`,
and `brace-expansion` releases. Compatible workspace resolutions now select stable `sharp 0.35.3`,
`postcss 8.5.23`, and `brace-expansion 5.0.8`. The resulting production audit has zero Critical or
High findings. One Moderate esbuild development-server advisory remains through Drizzle Kit's
deprecated loader chain; it is not present in the deployed runtime surfaces and does not cross the
M2 no-High/no-Critical exit gate.

## 4. Automated and Browser Results

| Gate | Result |
| --- | --- |
| Formatting, ESLint, package boundaries, TypeScript | Passed |
| Exact dependency and documentation policy | Passed |
| Unit, contract, application, repository, integration, and retained tests | Passed: 20 files, 71 tests |
| Empty, prior-W0, and prior-W1 migration paths | Passed: 3 tests |
| V8 coverage | 94.16% statements, 84.90% branches, 98.26% functions, 96.67% lines |
| Production build | Passed across all 12 workspace packages |
| Local real PostgreSQL migration | Passed; migration is repeatable through the checked-in chain |
| Full browser regression | Passed: 14 tests across desktop Chromium and Pixel 7 |
| Accessibility and reflow | Zero axe violations and no horizontal overflow on critical flows |
| Production dependency audit | Zero Critical/High; one accepted Moderate development-only finding |
| Current-tree secret scan | Passed with latest Gitleaks container; no leaks found |
| Container vulnerability scan | Passed with latest Trivy database; zero fixed Critical/High in web, worker, and OCR images |
| Pre-deploy database backup | Passed: Railway Postgres volume dump, 43,639 bytes, SHA-256 `5672991e936f5d91d516283092e3ae01743903a2843b9de63abd2b7814b5f7dd` |
| Backup restore test | Passed in disposable PostgreSQL 18.4; both recorded migrations restored |
| Repository publication | Passed: PR [#1](https://github.com/nishanthturnstile/delivery-os/pull/1) merged as `d6c64cd1`; all five required [CI jobs](https://github.com/nishanthturnstile/delivery-os/actions/runs/30183606465) passed |
| Railway migration | Passed: migration chain is at 3 records and sampled M2 tables are present; an immediate repeat was idempotent |
| Railway web/worker deployment | Passed: web `b3988a2e-4880-4fd8-b1bf-09d3431541eb` and worker `5101e7cd-8281-44cb-ba8f-e976955c9f13` reached terminal `SUCCESS` on exact implementation revision `d6c64cd1`; the superseding documentation-only `main` release also reached `SUCCESS` |
| Public liveness/readiness | Passed after acceptance: `/api/health` and `/api/ready`; PostgreSQL 19.24 ms and Redis 16.47 ms |
| Public boundary smoke | Passed: 2/2 retained desktop/mobile deployed checks in the closure run; prior 6/6 safe-boundary checks retained |
| Resend provider acceptance | Passed: 11/11 labeled closure messages reached `delivered` — 8 account verifications and 3 project invitations |
| Public authenticated M2 journey | Passed: complete desktop Chromium and Pixel 7 journeys; an additional mobile evidence rerun passed |
| Public accessibility, reflow, and visual review | Passed: zero axe violations, no horizontal viewport overflow, and 12 sanitized desktop/mobile screenshots reviewed |
| Post-acceptance logs and metrics | Passed: no web/worker runtime errors or HTTP 5xx; 415 sampled requests, 0% error rate; web averaged 0.00176 vCPU/90.79 MB and worker 0.00153 vCPU/109.95 MB over one hour |
| Worker/outbox processing | Passed: all 45 closure-run events reached `DISPATCHED`, including project creation, capacity, lifecycle, invitation acceptance, and identity events |

The browser registry scenario creates two workspaces, two clients, an internal project, and an
external project. It edits profile/calendar/availability data, records a calendar exception,
exercises Draft → Intake → On Hold → Intake, verifies a structured external readiness denial,
accepts the linked project invitation through a separate verified personal-email account, confirms
the minimal Client Stakeholder surface, filters the portfolio, proves a foreign-workspace project
returns 404, and completes the now-ready transition. Both desktop and Pixel 7 runs execute axe and
overflow assertions.

The repository/integration suites provide the non-UI concurrency and adversarial coverage:
different roles across projects, PM replacement races, max-Lead and stakeholder-role constraints,
Admin override step-up/audit, stale revisions, idempotency reuse, invitation replay/expiry/wrong
email/delivery failure, lifecycle invalid edges and readiness facts, hold/resume, cancel,
archive/unarchive read-only preservation, overlapping availability, unsafe calendar inputs,
tenant/project IDOR, bounded cursor pagination, and filter/search isolation.

## 5. Requirement and Exit-Gate Evidence

| Requirement or gate | Evidence/result |
| --- | --- |
| FR-M1-07 | Independent project roles, linked project invitation, explicit activation, and client-only access tests pass |
| FR-M2-01–04 | Client/project CRUD, leadership invariants, role/calendar/availability transactions, UI, audit, and capacity events pass |
| FR-M2-05 | Lifecycle policy, readiness, hold/resume, backward reason, cancel/archive/unarchive, history, and concurrency tests pass |
| FR-M2-06–07 | Tenant/role-scoped portfolio, health placeholder, bounded cursor, search, filters, dates, and responsive browser evidence pass |
| FR-M2-08 | Archived mutations are denied while preserved reads/history and authorized unarchive remain available |
| FR-M2-09 | Ordered stable readiness codes and human-safe HTTP/UI details pass |
| Bounded FR-M2-10 | Read-only initial outcome Module is created transactionally; full Module behavior remains assigned to M6 |
| NFR-01, NFR-07 | Guided responsive flow, semantic labels, keyboard-native controls, axe, and mobile reflow pass |
| NFR-04–06, NFR-12–13 | IDOR/adversarial tests, safe errors, revisions, idempotency, audit, outbox, correlation, migration, secret, dependency, and image scans pass |

## 6. Operational Gate

The pre-deploy Railway backup is stored on the existing Postgres volume as
`m2-predeploy-20260726.dump`. Its downloaded checksum and byte size match the remote evidence, and a
disposable PostgreSQL 18.4 restore completed successfully before migration or deployment.

Migration `0002` was applied through the checked-in migration command and then repeated
idempotently. Railway auto-deployed the merged revision to web and worker. Both deployments reached
terminal `SUCCESS`; the public liveness/readiness probes, migration state, worker/outbox
processing, bounded runtime and HTTP error logs, service metrics, and retained public boundary
smoke passed.

## 7. Public Controlled-Email Acceptance

The closure run used unique `delivered+label@resend.dev` identities for the internal Admin and
Client Stakeholder. Resend CLI authenticated only from the Railway-injected environment credential,
listed the exact recipient/subject messages, retrieved their bodies in the test process, and passed
only the extracted one-time links to Playwright. Eleven relevant messages were observed and all
reached the provider's `delivered` event.

Desktop Chromium and Pixel 7 each:

1. registered and verified separate Admin and Client Stakeholder accounts;
2. created the primary and boundary workspaces and enabled TOTP;
3. created two Clients plus internal and external Projects;
4. edited profile, availability, and calendar data;
5. exercised Draft → Intake → On Hold → Intake and the external readiness denial;
6. accepted the explicit project invitation as the matching verified stakeholder;
7. confirmed the stakeholder-only holding surface hides Clients, Projects, people, and portfolio;
8. filtered the portfolio and proved a foreign-workspace Project returns 404; and
9. passed axe and horizontal-overflow assertions at every captured checkpoint.

Twelve sanitized screenshots were visually reviewed. The desktop layout remained coherent and the
mobile layout stacked forms, filters, project details, lifecycle controls, and the stakeholder
holding surface without clipped controls or horizontal viewport overflow. Credentials, TOTP seeds,
cookies, invitation tokens, and email bodies were not persisted in evidence.

After the browser run, health/readiness remained green, bounded web/worker logs contained no
runtime errors, HTTP logs contained no 5xx responses, and all 45 closure-run outbox records were
`DISPATCHED`. Issue [#2](https://github.com/nishanthturnstile/delivery-os/issues/2) is the closure
trail for this acceptance.
