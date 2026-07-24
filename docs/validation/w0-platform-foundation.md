# W0 Platform Foundation — Validation Record

**Status:** Local, GitHub CI, and Railway validation passed; owner review/promotion pending
**Date:** 2026-07-24
**Owner:** Platform
**Plan:** [W0 execution packet](../planning/w0-platform-foundation.md)
**Backlog:** [S0 Repository and Platform Foundation](../planning/delivery-backlog.md#s0--repository-and-platform-foundation)

## 1. Outcome

W0 is implemented and its local and Railway validation flows pass. The repository now contains the production
boundaries, correctness kernel, provider shells, local services, CI gates, accessible browser
harness, and operator documentation required by S0. The roadmap is `In Validation`, rather than
`Complete`, until draft PR #1 is reviewed/merged and the engineering/security owner approves
promotion. GitHub CI and Railway deployment evidence are now recorded below.

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
| GitHub CI | Passed on PR #1: validation, Gitleaks, and all three container/Trivy jobs |
| Railway migration | Passed twice against Railway PostgreSQL; second application was idempotent |
| Railway deployment | Web, worker, OCR, PostgreSQL, and Redis reached terminal `SUCCESS` |

The integration suite verifies atomic mutation/audit/outbox/idempotency behavior, safe replay,
`REVISION_CONFLICT`, durable post-restart dispatch, database-side job deduplication, provider
contracts, readiness degradation, correlation propagation, and adversarial log redaction.

The final Vitest run contains 11 passing files and 29 passing tests. Production container smoke
tests used the real Compose network and completed web readiness, worker readiness, a committed
platform probe, dispatch, and one durable processed-event outcome. The final images are 59.1 MB
(web) and 66.3 MB (worker).

## 5. Browser Verification

Playwright exercised the real Next.js API and PostgreSQL transaction path in Chromium desktop and a
Pixel 7 viewport locally, in GitHub CI, and against the Railway domain:

- 4 browser tests passed across the two projects in each final validation run.
- The platform check reached `Ready`, displayed its correlation ID and committed revision, and
  created an outbox event that the live worker processed.
- Keyboard focus was verified on the primary action.
- The post-interaction axe scan reported zero violations.
- Full-page desktop and mobile screenshots were visually reviewed. The page remained readable,
  correctly stacked, and free of horizontal overflow.
- The deployed header reported the exact web build `144ab84`.

The executable browser specification is `tests/e2e/foundation.spec.ts`. The Railway run used
`PLAYWRIGHT_BASE_URL=https://web-production-57ecb9.up.railway.app`.

## 6. Exit-Gate Evidence

| W0 exit condition | Evidence/result |
| --- | --- |
| Duplicate command/outbox has one outcome | PostgreSQL integration tests pass; live processed-event count matches unique browser events |
| Stale revision fails safely | Integration test returns `REVISION_CONFLICT` and safe current revision |
| Restart retains committed work | Local reconstruction test and Railway web/worker restart smoke retain the prior row and process a new row once |
| Empty/prior migrations | Both isolated migration scenarios pass |
| Liveness differs from readiness | API/worker tests and live probes pass |
| Correlation survives request to job | Integration assertion and live structured worker logs pass |
| Injected secrets do not appear in logs | Adversarial captured-log tests pass |
| S0 shared pipeline | Passed locally and in GitHub Actions run `30095229451` |

## 7. Railway Validation Evidence

- Project: [delivery-os](https://railway.com/project/d3b8b065-7605-41d2-a844-4625d527b0c2)
- Single environment: Railway `production`; application mode remains `staging` for validation.
- Public web: <https://web-production-57ecb9.up.railway.app>
- Private worker and OCR services; PostgreSQL 18 and Redis 8.8.0 use persistent volumes.
- Web/worker release: `144ab84`.
- All five service deployments reached terminal `SUCCESS`.
- `/api/health` and `/api/ready` passed; readiness reported PostgreSQL and Redis `up`.
- A direct HTTPS probe and the post-restart/post-Redis-upgrade probes returned `201`; each outbox
  event reached `DISPATCHED` with one durable processed-event record.
- Private OCR readiness reported PP-StructureV3/PaddleOCR 3.7.0 with recognition disabled.
  Unauthenticated recognition returned `401`; authenticated recognition returned the intentional
  W0 `503`.
- The first web deployment failed its health gate because Next standalone bound to Railway's
  container hostname. Setting `HOSTNAME=0.0.0.0` resolved it; the final deployment and restart both
  passed.

GitHub evidence is [draft PR #1](https://github.com/mnishanth02/delivery-os/pull/1) and passing
[Actions run 30095229451](https://github.com/mnishanth02/delivery-os/actions/runs/30095229451).

## 8. Manual or External Follow-up

These actions require owner approval or provider resources outside W0:

1. Review and merge [draft PR #1](https://github.com/mnishanth02/delivery-os/pull/1), then require
   the passing CI workflow on `main`.
2. Provision private staging R2 and Resend resources and add secrets through the platform secret
   manager. Do not enable Sentry/OTel export until a scrubbed endpoint is approved.
3. Complete engineering/security owner review, change `APP_ENV` from `staging` to `production` when
   appropriate, then promote W0 from `In Validation` to `Complete`.

OCR recognition intentionally returns `503` in W0. S4 must embed and evaluate the pinned
PP-StructureV3 model artifact before enabling recognition; this is planned scope, not a W0 defect.

Next.js 16.2.11 currently declares optional `sharp ^0.34.5`, while the available security fix is in
the incompatible 0.35 line. W0 does not use `next/image`, so image optimization is explicitly
disabled and the unused vulnerable native package is removed from the standalone runtime. Re-enable
optimization only after Next.js supports a fixed Sharp line and its browser/image tests pass.
