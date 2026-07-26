# W2 M2 Client & Project Registry — Validation Record

**Validation result:** In Validation — local gates pass; repository publication and Railway release
validation remain active  
**Date:** 2026-07-26  
**Owner:** Projects & Clients  
**Plan:** [W2 M2 execution packet](../planning/w2-m2-client-project-registry.md)  
**Backlog:** [S2 Clients, Projects, Project Roles, and Lifecycle](../planning/delivery-backlog.md#s2--clients-projects-project-roles-and-lifecycle)

## 1. Outcome

The M2 implementation and every local exit-gate suite pass. It provides tenant-safe Client and
Project registries, independent project roles, linked stakeholder invitations, calendar and
availability management, governed lifecycle/readiness, portfolio search and filters, audit/outbox
records, an outcome Module placeholder, and responsive authenticated browser surfaces.

M2 remains `In Validation` until the reviewed source is published through repository CI, its
additive migration and web/worker releases reach terminal success on Railway, and the public
runtime/browser checks pass. The linked Railway project currently has one environment named
`production`; its application configuration remains `APP_ENV=staging`. This record names that
topology accurately instead of implying a second Railway staging environment exists.

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
| Repository CI and Railway deployment | Pending terminal validation |

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

The remaining validation sequence is:

1. Publish the reviewed revision and obtain a green complete CI run.
2. Apply migration `0002` through the checked-in migration command.
3. Deploy web and worker and observe terminal `SUCCESS`.
4. Verify public liveness/readiness, migration state, worker/outbox processing, bounded runtime and
   HTTP error logs, and service metrics.
5. Run the public desktop/mobile registry and retained boundary smoke, then update this record and
   move both roadmap locations to `Complete` only if every check passes.
