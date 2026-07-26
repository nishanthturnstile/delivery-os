# W2 Shared Artifact Kernel — Validation Record

**Validation result:** Passed — implementation, migration, concurrency, authorization,
accessibility, security, staging, and operational gates pass

**Date:** 2026-07-26

**Owner:** Nishanth with Codex

**Plan:** [W2 Shared Artifact Kernel implementation plan](../planning/w2-shared-artifact-kernel.md)

**Backlog:** [S3 Artifact Drafts, Review Snapshots, Baselines, Audience](../planning/delivery-backlog.md#s3--artifact-drafts-review-snapshots-baselines-audience)

**Reviewed revision:** `a9e3c694eff066f51d822eab4f493e26275f25cb`

## 1. Outcome

The Shared Artifact Kernel provides one generic lifecycle for schema-versioned artifacts without
registering an M3, M4, or M5 production body schema. It includes deterministic canonical JSON and
SHA-256 hashing, append-only draft history, frozen review snapshots, internal and first-binding
external decisions, immutable numbered baselines, successor Deltas, restrictive audience
inheritance, comments, attachment references, asynchronous export contracts, transactional
audit/outbox behavior, and reusable responsive UI patterns.

Every required S3 scenario passes against real PostgreSQL locally. The reviewed revision was
deployed to an isolated Railway `staging` environment after a backup and restore rehearsal.
Desktop and mobile browser acceptance passed against the public staging domain using an explicitly
gated, synthetic-only fixture. The fixture flag was then disabled and the same revision redeployed;
the final staging route returns 404. No real client, project, user, document, attachment, or
production data was used.

The initial staging worker exposed a valid integration defect: it required M3-owned object storage
at process start. Forward-fix `61a378047bd2dffe209844b629db33cdd2492928` keeps the worker healthy
without an S3 bucket while rejecting actual export writes with `EXPORT_STORAGE_UNAVAILABLE`.
Local/test environments retain the existing MinIO adapter. This preserves the accepted S3/M3
boundary and gives export jobs deterministic retry and terminal-failure behavior until M3 binds
scanned object storage.

## 2. Reviewed Changes

| Revision | Purpose |
| --- | --- |
| `b19e030bc4d12038907fb41b00b8906e72423226` | Shared Artifact Kernel implementation, migration, APIs, worker behavior, UI, and tests |
| `61a378047bd2dffe209844b629db33cdd2492928` | Keep the worker healthy while deferred export storage is unavailable |
| `a9e3c694eff066f51d822eab4f493e26275f25cb` | Explicitly gate the synthetic staging UI fixture and extend reject/resubmit browser acceptance |

The pre-existing staged `apps/web/next-env.d.ts` modification is unrelated, was excluded from all
three revisions, and remains preserved in the working tree.

## 3. Automated Results

| Gate | Result |
| --- | --- |
| Formatting, ESLint, package boundaries, TypeScript, dependency policy, docs links | Passed |
| Unit, contract, application, repository, and retained regression tests | Passed: 26 files, 104 tests |
| Focused real-PostgreSQL S3 scenarios | Passed: 4/4 |
| Empty, W0, W1, and M2 migration paths | Passed: 4/4 |
| Coverage | 88.15% statements, 80.24% branches, 94.23% functions, 91.47% lines |
| Production build | Passed across all 12 workspace packages |
| Full local browser regression | Passed: 20/20 across desktop Chromium and mobile Chromium |
| Focused local S3 browser acceptance | Passed: 6/6 with zero axe violations |
| Public staging S3 browser acceptance | Passed: 6/6 with zero axe violations |
| Current-tree secret scan | Passed with Gitleaks 8.30.1; no leaks found |
| Production dependency audit | No Critical/High; one Moderate advisory remains below the exit threshold |
| Container vulnerability scans | Web, worker, and OCR passed with Trivy 0.72.0; zero fixed Critical/High findings |
| Diff hygiene | `git diff --check` passed |

The focused PostgreSQL suite proves:

- a frozen snapshot does not change when editing resumes, stale writes fail, and resubmission
  creates a new snapshot;
- independent approve/reject transactions serialize to exactly one external binding decision;
- a successor Delta produces an immutable, monotonically numbered baseline; and
- Team-only children and foreign-workspace identifiers are filtered before client projection.

The domain, contract, application, repository, and migration suites additionally cover canonical
serialization/hash vectors, two materially different test adapters, historical schema readers,
invalid transitions, idempotency replay/reuse, immutable-database triggers, baseline allocation,
safe not-found behavior, cross-project IDOR, child list/count/search/diff/export projection,
comments, mentions, attachment references, audit/outbox atomicity, worker retry/deduplication, and
unavailable export storage.

## 4. Migration and Recovery Evidence

An isolated Railway environment was created by duplicating configuration, not data:

- Project: `delivery-os` (`aed782dd-4921-4b1b-a9f2-e442a5e84570`)
- Environment: `staging` (`f7544a5c-065b-4eca-9eb8-577008ed6896`)
- Public web domain: `https://web-staging-5e5c.up.railway.app`

The fresh staging database contained no application or client data. Before migration, a custom
PostgreSQL dump was captured at
`/tmp/delivery-os-s3-staging-backup-b19e030/pre-s3.dump`:

- Size: 885 bytes
- SHA-256: `a85c416cc912148d9c3af3b0de9da0a2dc0dd77d78b66e73e59ceb0f3001a9cf`

The dump restored successfully into the disposable database
`delivery_os_s3_restore_verify`, reported all four pre-existing schemas/migration objects expected
from the fresh environment, and was then removed. Migration `0003_smiling_the_order.sql` applied
successfully and repeatably. Staging now records four Drizzle migrations and exposes all 12
`artifact*` tables. The additive migration requires no data backfill or destructive rollback;
deployment recovery is application rollback plus forward-fix migration while immutable artifact
history remains retained.

## 5. Staging Deployment and Operations

| Evidence | Result |
| --- | --- |
| Reviewed revision | `a9e3c694eff066f51d822eab4f493e26275f25cb` |
| Final web deployment | `a962c799-d7e7-4333-824a-2af15d4c6365` — `SUCCESS` |
| Final worker deployment | `0a501fee-fda2-4694-b945-d2cfae2f0b98` — `SUCCESS` |
| Public liveness | `/api/health` returned `ok` |
| Public readiness | `/api/ready` returned PostgreSQL and Redis `up` at 33.77 ms and 26.42 ms |
| Validation fixture after acceptance | `/dev/artifact-kernel` returned 404 |
| Runtime logs, last hour | Web 5 lines and worker 2 lines; zero error/fatal and zero artifact-body/Team-only markers |
| HTTP metrics, last hour | 81 requests, 80 2xx, one expected 4xx fixture denial, zero 5xx, 0% error rate |
| Resource metrics, last hour | Web averaged 0.00179 vCPU/29.05 MB; worker averaged 0.00149 vCPU/36.41 MB |
| Worker health | Container reached `SUCCESS`, logged `worker started`, and remained healthy without an M3 bucket |
| Outbox state | Fresh synthetic-free staging database: no pending, failed, or undispatched records |

The public browser run used route interception only for deterministic synthetic mutation results;
it never sent an artifact body, comment, attachment, user identity, or project record to staging.
It exercised stale-editor preservation, frozen review, approval confirmation, first-binding
external rejection rationale, resubmission, history/diff/attachment presentation, responsive
layout, and axe checks in desktop and mobile projects.

## 6. Requirement and Exit-Gate Traceability

| Requirement or gate | Evidence/result |
| --- | --- |
| FR-M3-12–14 | Append-only revisions, frozen snapshots, semantic diff, lifecycle, resubmit, and immutable baselines pass |
| FR-M3-15 | Repeated independent-connection approve/reject race yields exactly one binding decision |
| FR-M3-16–17 | Only baselines enter authoritative context; decisions, baselines, snapshots, and audit rows reject mutation/deletion |
| FR-M4-05–07 / FR-M5-08 | Generic registry and policy fixtures prove later plan/cost adapters without kernel schema changes |
| FR-CC-07–08 | Authorized comments, mentions, immutable targets, and safe notification events pass |
| FR-CC-14 | Restrictive audience inheritance passes for read, child, count, search, diff, notification, attachment, and export projections |
| FR-CC-16 / NFR-12 | Expected revisions, idempotency, and recoverable 409 conflicts prevent overwrite |
| NFR-02, NFR-10 | Indexed bounded reads, versioned adapters/readers, deterministic hashes, and async export contracts pass |
| NFR-04–06 | Cross-workspace/project IDOR, role/state denial, safe 404, immutability, audit, secret, dependency, and image scans pass |
| NFR-07 | Native controls, non-color diff/status, live conflict/decision feedback, axe, desktop/mobile layout, and 320-pixel reflow checks pass |
| NFR-13 | Correlation-safe audit/outbox behavior, health/readiness, bounded logs/metrics, and body-content redaction checks pass |

## 7. Required Scenario Acceptance

| Required scenario | Result |
| --- | --- |
| Editing a draft cannot alter its frozen review snapshot | Passed in domain/repository/integration/browser tests |
| Concurrent external approve/reject produces exactly one binding decision | Passed repeatedly with two real PostgreSQL connections and unique-constraint fallback |
| Rejection or changes requested followed by resubmission creates a new snapshot | Passed in integration and desktop/mobile browser acceptance |
| Approved baselines are immutable and monotonically numbered per artifact | Passed through direct tamper tests, allocation race, and Delta successor integration |
| Client operations cannot include Team-only child content | Passed across direct read, list/count, comment, attachment, search, diff, notification, export, and cross-workspace projections |
| Stale editors receive a revision conflict instead of overwriting | Passed in repository/integration and recoverable desktop/mobile conflict UI |

## 8. Deferred Boundaries and Residual Risk

- S3 attachment records remain metadata/reference-only. M3 owns quarantine, malware scanning,
  object storage, download binding, source ingestion, OCR, and normalized documents.
- Export storage is intentionally unavailable in staging until M3 binds a scanned-object-capable
  provider. Export requests fail safely through the documented retry/terminal-failure contract;
  the worker itself remains healthy.
- Requirement, Technical/UX Plan, Feature Specification, and Cost Plan body schemas remain owned by
  M3/M4/M5. The kernel proves their extension boundary only with non-production adapters.
- The final client portal placement/copy and later MCP projection remain owned by M8/M10.
- The remaining Moderate dependency advisory is below the no-Critical/no-High exit threshold and
  is not a reason to upgrade the validated stack during S3.

No unresolved Critical/High security, privacy, tenant, audience, data-loss, accessibility, or
immutable-history finding remains.
