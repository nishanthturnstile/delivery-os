# W0 Platform Foundation — Validation Record

**Status:** Local implementation and validation passed; external CI/staging validation pending
**Date:** 2026-07-24
**Owner:** Platform
**Plan:** [W0 execution packet](../planning/w0-platform-foundation.md)
**Backlog:** [S0 Repository and Platform Foundation](../planning/delivery-backlog.md#s0--repository-and-platform-foundation)

## 1. Outcome

W0 is implemented and its complete local flow passes. The repository now contains the production
boundaries, correctness kernel, provider shells, local services, CI gates, accessible browser
harness, and operator documentation required by S0. The roadmap is `In Validation`, rather than
`Complete`, until the connected GitHub CI run and a provisioned Railway staging smoke test provide
external evidence.

The implementation stayed within W0. Authentication, tenants, project workflows, production
credentials, loaded OCR model artifacts, and later-wave product behavior were not introduced.

## 2. Implemented Capability

- pnpm workspace with strict TypeScript, exact dependency catalog, flat ESLint, Prettier, Turbo,
  package-boundary enforcement, dependency policy, documentation checks, Renovate, and a frozen
  lockfile.
- Next.js App Router web/API and Node/BullMQ worker, plus domain, contracts, application, database,
  UI, auth, ingestion, AI, observability, and test-support packages.
- Versioned Zod command/result/job/error contracts; authorization context; optimistic concurrency;
  request idempotency; append-only audit; transactional outbox; durable consumer deduplication; and
  correlation propagation.
- Checked-in Drizzle SQL migration and explicit migration command. Runtime startup does not migrate
  the database.
- PostgreSQL, Redis, private MinIO, Mailpit, ClamAV, and optional private OCR Compose services with
  health checks. The worker performs five bounded dependency attempts with exponential backoff.
- MinIO/R2-compatible storage, local/fake email, Resend email, fake AI, disabled Sentry/OTel export,
  structured redacted logs, and distinct liveness/readiness.
- Tailwind CSS v4 semantic tokens and source-owned Base UI components. Radix imports are rejected by
  policy.
- SHA-pinned current CI actions for validation, secret scanning, web/worker image builds, and
  Critical/High Trivy scanning.
- Digest-pinned distroless Node.js 24 production runtimes. The final web and worker images run as
  UID/GID 65532 and contain only their traced/deployed production files.
- Non-root, read-only OCR runtime with refreshed Debian security packages, private bearer
  authentication, no ambient service credentials, and a deliberately disabled recognition gate.

## 3. Versions Verified on 2026-07-24

The implementation pins exact current releases where their supported peer ranges permit them:

| Boundary | Verified version |
| --- | --- |
| Production runtime | Node.js 24.18.0 LTS; pnpm 11.17.0 |
| Web | Next.js 16.2.11; React 19.2.8; Tailwind CSS 4.3.3; Base UI 1.6.0 |
| Contracts/data/jobs | Zod 4.4.3; Drizzle ORM 0.45.2 / Kit 0.31.10; BullMQ 5.81.1 |
| Test tooling | Vitest 4.1.10; Playwright 1.61.1; axe-playwright 4.12.1 |
| OCR boundary | Python 3.13.11; FastAPI 0.139.2; PaddleOCR 3.7.0; PaddlePaddle 3.3.1 |
| Local services | PostgreSQL 18.4; Redis 8.8.0; Mailpit 1.30.5; ClamAV 1.5.3 |

TypeScript 6.0.3 and ESLint 9.39.5 are the newest releases inside the declared peer ranges of the
current TypeScript-ESLint and Next.js ESLint plugin stack. Selecting incompatible major versions
solely because their release numbers are newer would make the toolchain unsupported.

## 4. Automated Results

| Gate | Result |
| --- | --- |
| Format, ESLint, package boundaries | Passed |
| TypeScript | Passed across all 12 workspace packages |
| Exact dependency/Radix policy | Passed |
| Documentation links and required headings | Passed |
| Unit, component, contract, integration, and migration tests | Passed |
| V8 coverage | Passed: 99.30% statements, 91.13% branches, 100% functions, 99.29% lines |
| Empty and prior-marker migrations | Passed against isolated PostgreSQL databases |
| Production build | Passed across all 12 workspace packages |
| Compose validation | Passed; required local services healthy |
| OCR image and disabled-recognition contract | Passed |
| Live worker/outbox flow | Passed; all browser probes dispatched and processed once |
| Source secret scan | Passed with Gitleaks 8.30.1; no leaks found |
| Runtime vulnerability scan | Passed with Trivy 0.72.0; zero fixed High/Critical findings in web, worker, and OCR |

The integration suite verifies atomic mutation/audit/outbox/idempotency behavior, safe replay,
`REVISION_CONFLICT`, durable post-restart dispatch, database-side job deduplication, provider
contracts, readiness degradation, correlation propagation, and adversarial log redaction.

The final Vitest run contains 11 passing files and 29 passing tests. Production container smoke
tests used the real Compose network and completed web readiness, worker readiness, a committed
platform probe, dispatch, and one durable processed-event outcome. The final images are 59.1 MB
(web) and 66.3 MB (worker).

## 5. Browser Verification

Playwright exercised the real Next.js API and PostgreSQL transaction path in Chromium desktop and a
Pixel 7 viewport:

- 4 browser tests passed across the two projects.
- The platform check reached `Ready`, displayed its correlation ID and committed revision, and
  created an outbox event that the live worker processed.
- Keyboard focus was verified on the primary action.
- The post-interaction axe scan reported zero violations.
- Full-page desktop and mobile screenshots were visually reviewed. The page remained readable,
  correctly stacked, and free of horizontal overflow.

The executable browser specification is `tests/e2e/foundation.spec.ts`.

## 6. Exit-Gate Evidence

| W0 exit condition | Evidence/result |
| --- | --- |
| Duplicate command/outbox has one outcome | PostgreSQL integration tests pass; live processed-event count matches unique browser events |
| Stale revision fails safely | Integration test returns `REVISION_CONFLICT` and safe current revision |
| Restart retains committed work | Dispatcher reconstruction test drains the previously committed row |
| Empty/prior migrations | Both isolated migration scenarios pass |
| Liveness differs from readiness | API/worker tests and live probes pass |
| Correlation survives request to job | Integration assertion and live structured worker logs pass |
| Injected secrets do not appear in logs | Adversarial captured-log tests pass |
| S0 shared local pipeline | Passed; external GitHub execution remains pending |

## 7. Manual or External Follow-up

These actions require access or approvals that are not available in this local workspace:

1. Connect the repository to GitHub and require the checked-in CI workflow; retain its first passing
   run as external evidence.
2. Provision Railway web, worker, OCR, PostgreSQL, and Redis services, apply the checked-in migration
   as a release step, and record staging health/readiness and restart smoke tests.
3. Provision private staging R2 and Resend resources and add secrets through the platform secret
   manager. Do not enable Sentry/OTel export until a scrubbed endpoint is approved.
4. Complete engineering/security owner review, then promote W0 from `In Validation` to `Complete`.

OCR recognition intentionally returns `503` in W0. S4 must embed and evaluate the pinned
PP-StructureV3 model artifact before enabling recognition; this is planned scope, not a W0 defect.

Next.js 16.2.11 currently declares optional `sharp ^0.34.5`, while the available security fix is in
the incompatible 0.35 line. W0 does not use `next/image`, so image optimization is explicitly
disabled and the unused vulnerable native package is removed from the standalone runtime. Re-enable
optimization only after Next.js supports a fixed Sharp line and its browser/image tests pass.
