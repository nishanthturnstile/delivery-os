# W0 Platform Foundation — Execution Packet

**Status:** Implemented; local validation passed **Wave:** W0 **Backlog slice:** S0 **Owner:** Platform
**Approved specification:** Repository `HEAD` plus the working-tree roadmap update **Requirements:**
NFR-03, NFR-06, NFR-12, NFR-13; FR-CC-01–03, FR-CC-16–17 **Normative sources:**
[Architecture & Contracts](../core/architecture-contracts.md),
[Development Guidelines](../core/development-guidelines.md),
[Design System](../core/design-system.md),
[Infrastructure & Deployment](../deployment/infrastructure.md)

## 1. Objective and Review Result

W0 establishes a production-shaped, locally runnable platform on which W1 and later functional
modules can implement the shared contracts without replacing the repository, runtime, persistence,
job, provider, UI, or observability foundations.

The plan was reviewed on 2026-07-24 against the W0 roadmap exit gate, S0 acceptance criteria, all
mapped FR/NFRs, and the current official documentation for Next.js, pnpm, Tailwind CSS, Base
UI/shadcn, Drizzle, BullMQ, Railway, OpenTelemetry, and PaddleOCR. The review found no normative
architecture change is required.

Implementation uses:

- Node.js 24 LTS and pnpm 11 workspaces with the `workspace:` and `catalog:` protocols.
- The current stable Next.js App Router, React, Tailwind CSS v4, Base UI, Zod, Drizzle, BullMQ,
  Vitest, and Playwright lines, plus the newest TypeScript and ESLint releases supported by their
  current official plugin peer ranges, locked to exact resolved versions.
- Checked-in, explicitly applied Drizzle SQL migrations. Application startup never generates or
  applies production migrations.
- A PostgreSQL transactional command store and outbox as the correctness boundary. Redis/BullMQ
  delivery is at least once; database consumers provide durable deduplication.
- Provider adapters that default to local/fake operation. Non-local email, storage, AI, and
  telemetry export remain disabled without explicit validated configuration.

Official guidance reviewed:

- [Next.js installation and supported runtime](https://nextjs.org/docs/app/getting-started/installation)
- [pnpm workspaces](https://pnpm.io/workspaces) and [catalogs](https://pnpm.io/catalogs)
- [Tailwind CSS with Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs)
- [Base UI quick start](https://base-ui.com/react/overview/quick-start)
- [shadcn monorepo guidance](https://ui.shadcn.com/docs/monorepo)
- [Drizzle generated migration flow](https://orm.drizzle.team/docs/drizzle-kit-migrate)
- [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs)
- [Railway health checks](https://docs.railway.com/deployments/healthchecks)
- [OpenTelemetry Node.js guidance](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)
- [PaddleOCR PP-StructureV3](https://paddlepaddle.github.io/PaddleOCR/main/en/version3.x/pipeline_usage/PP-StructureV3.html)

## 2. Implementation Slices

### W0.1 Repository and dependency policy

- Add the pnpm workspace, root scripts, shared TypeScript configuration, formatting/linting,
  deterministic dependency catalog, and lockfile.
- Materialize every architecture boundary under `apps/`, `packages/`, and `services/ocr`.
- Enforce acyclic package boundaries, `@delivery-os/ui` browser imports, Base UI ownership, and the
  Radix dependency ban.

### W0.2 Contracts, command kernel, and persistence

- Add versioned Zod mutation, result, job, health, and error schemas.
- Add authorization context, stable application errors, command/query dispatch, expected-revision
  enforcement, and transaction interfaces.
- Add PostgreSQL tables and repositories for a W0 probe aggregate, idempotency records, append-only
  audit events, outbox events, and processed events.
- Store aggregate mutation, audit, outbox, and completed idempotency result in one transaction.

### W0.3 Durable jobs and observability

- Dispatch committed outbox records to BullMQ with stable event job IDs.
- Deduplicate the database-side consumer outcome and retain safe retry/dead-letter state.
- Propagate correlation IDs through HTTP, command, audit, outbox, and job payloads.
- Add allowlisted structured logging, secret redaction tests, metrics/tracing shells, environment
  validation, and distinct liveness/readiness checks.

### W0.4 Providers and runtime boundaries

- Add MinIO/R2-compatible storage, local/fake and Resend email, fake AI, and disabled-by-default
  Sentry/OpenTelemetry adapter shells.
- Add Docker Compose for PostgreSQL, Redis, MinIO, ClamAV, Mailpit, and the pinned private OCR
  service.
- Add web, worker, and OCR container/Railway configuration with bounded startup behavior and probes.

### W0.5 Web and design-system harness

- Add the Next.js web runtime and a responsive W0 operations page.
- Initialize CSS-first Tailwind v4 semantic tokens and source-owned Base UI wrappers in
  `packages/ui`.
- Expose platform health/readiness APIs and a browser-runnable correlation probe without adding W1
  authentication or tenant functionality.
- Add component accessibility checks and Playwright coverage for the complete foundation page flow.

### W0.6 Assurance, CI, and evidence

- Add unit, integration, migration, provider contract, accessibility, and browser tests.
- Add CI gates for format, types, lint, package boundaries, tests, migrations, documentation links,
  dependency policy, secrets, and container scanning.
- Record exact validation results and update the roadmap/backlog evidence.

## 3. Explicit Exclusions

W0 does not implement user accounts, Better Auth flows, workspace/project records, artifact
ingestion, a loaded OCR model, production provider credentials, production data export, or any W1–W9
product workflow. The OCR boundary is pinned and health-checkable in W0; model artifacts and
recognition fixtures are delivered in S4.

No production Railway, R2, Resend, Sentry, or DNS resource is created by this wave. Configuration is
prepared and validated, while external provisioning and secrets remain an operator action.

## 4. Data, Authorization, and Failure Rules

- W0 probe data uses UUIDv7 IDs, a workspace ID, an integer revision, and UTC timestamps.
- Commands require an authorization context, expected revision, idempotency key, and correlation ID.
- Reusing an idempotency key with the same request returns the original result; reusing it for a
  different request fails safely.
- A stale command returns `REVISION_CONFLICT` and the safe current revision.
- Audit rows are append-only at the application role boundary.
- Outbox rows remain durable until dispatched. Consumers tolerate replay and never rely on BullMQ
  retention alone for deduplication.
- Readiness fails when required configuration, PostgreSQL, or Redis is unavailable; liveness remains
  process-only.
- Logs contain only allowlisted metadata and redact common credential fields, URLs, cookies,
  authorization headers, prompts, and confidential bodies.

## 5. Migration and Recovery

The initial migration creates only W0 platform tables. Validation applies the full migration chain
to:

1. An empty PostgreSQL database.
2. A prior-schema fixture containing the version marker that immediately precedes W0.

The initial migration is additive. Before pilot data exists, rollback is to drop the isolated W0
schema in a disposable environment. After shared use begins, rollback is forward-fix only: restore
from the verified backup, deploy the previous application version, and add a compensating checked-in
migration. Application startup never performs the rollback or migration.

## 6. Required Evidence

| Gate                                 | Evidence                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Duplicate command has one outcome    | Integration test asserts one aggregate revision, one audit row, and one outbox row                  |
| Stale revision is safe               | Unit and integration tests assert `REVISION_CONFLICT` and current revision                          |
| Duplicate outbox/job has one outcome | Integration test replays one event and asserts one processed-event row                              |
| Restart does not lose committed work | Integration test commits before dispatch, reconstructs the dispatcher, and drains the pending event |
| Empty/prior migration                | Isolated migration tests for both starting states                                                   |
| Health versus readiness              | API/unit tests with healthy and failed dependency fixtures                                          |
| Correlation propagation              | Request-to-command-to-outbox-to-job assertion                                                       |
| Secret-safe logs                     | Adversarial redaction fixture and captured-log assertion                                            |
| UI/accessibility                     | Component tests, automated axe scan, keyboard checks, and responsive browser screenshots            |
| Repository policy                    | Boundary, dependency, Radix, Base UI ownership, format, type, and lint gates                        |

## 7. Exit Decision

W0 may move to `In Validation` when all implementation slices compile and the required local
services are health-checkable. It may move to `Complete` only when the evidence in section 6 passes,
the browser flow is verified, the CI definition is valid, and the roadmap links to the recorded
results. Production provider provisioning is a documented manual prerequisite for later staging
validation, not permission to weaken or bypass the W0 gates.

Implementation and test results are recorded in the
[W0 validation record](../validation/w0-platform-foundation.md). Local gates passed on 2026-07-24;
external GitHub CI and Railway staging evidence remain before the roadmap can move from
`In Validation` to `Complete`.
