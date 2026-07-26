# Infrastructure and Deployment

**Status:** Normative environment and provider specification
**Parents:** [Architecture & Contracts](../core/architecture-contracts.md), [Pilot Scope](../planning/pilot-scope.md)
**Related:** [OCR Evaluation](../research/ocr-evaluation.md), [AI/Security Evaluation](../assurance/ai-security-evaluation.md)

## 1. Environment Matrix

| Capability | Local | Preview/Staging | Production pilot |
|---|---|---|---|
| Web/API/MCP | Next.js process | Railway service | Railway service |
| Worker | Node process | Railway service | Railway service |
| OCR | Docker Compose PaddleOCR service | Private Railway service | Private Railway service |
| Database | PostgreSQL container | Railway PostgreSQL | Railway PostgreSQL |
| Queue/cache | Redis container | Railway Redis | Railway Redis |
| Object store | MinIO, private bucket | Dedicated non-production Cloudflare R2 bucket | Dedicated private Cloudflare R2 bucket |
| Email | Local mail capture/fake | Resend test/staging configuration | Resend production configuration |
| Telemetry | Local logs; outbound disabled | Scrubbed Sentry/OTel | Scrubbed Sentry/OTel |

Production data must never enter local, preview, fixtures, logs, or evaluation datasets.

## 2. Object Storage

### 2.1 Supported adapter subset

Delivery OS uses only:

- Head/list objects.
- Single/multipart put.
- Get/range get.
- Copy object.
- Delete one/many.
- Multipart create/upload/list/complete/abort.
- Lifecycle configuration for incomplete/disposable objects.
- Signature V4 presigned GET/PUT.

Do not use bucket policies, ACLs, S3 bucket versioning, S3 Object Lock, SSE-KMS, replication, or unsupported object tagging. [Cloudflare’s compatibility table](https://developers.cloudflare.com/r2/api/s3/api/) is authoritative for R2 support and must be rechecked during provider upgrades.

### 2.2 Production R2

- Private bucket; no `r2.dev` public access and no public custom domain.
- Use Standard storage for pilot source/quarantine objects.
- Use the required jurisdictional endpoint when residency applies. Cloudflare location hints are best-effort; [jurisdictional restrictions](https://developers.cloudflare.com/r2/reference/data-location/) are the residency control.
- R2 automatically encrypts all objects/metadata at rest with AES-256 and uses TLS in transit per [R2 data security](https://developers.cloudflare.com/r2/reference/data-security/).
- Runtime token: Object Read & Write for the exact application bucket only.
- Backup token: write/read only for the backup bucket; not available to web.
- Operational token: lifecycle/bucket administration, stored separately and used only by controlled jobs/runbooks.
- Presigned URLs are bearer credentials. Use generated immutable keys, short expiry, exact operation, and post-upload metadata/hash verification. R2 supports Signature V4 presigned GET/PUT as documented in [Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).

### 2.3 Key and retention model

```text
quarantine/{workspaceId}/{projectId}/{sourceId}/{generationId}
sources/{workspaceId}/{projectId}/{sourceId}/{generationId}
exports/{workspaceId}/{projectId}/{exportId}/{snapshotHash}
purge-receipts/{workspaceId}/{purgeId}
```

- Keys are opaque/generated and never reused.
- Promotion copies quarantine to a new source key, verifies it, then deletes quarantine.
- Replacements create a new generation and manifest row.
- Recoverable deletion denies access but retains keys for 30 days.
- Purge enumerates the manifest, deletes every key, verifies absence, and writes a non-content receipt.
- Lifecycle rules abort incomplete multipart uploads and remove disposable exports; they do not implement source recovery.

R2 does not provide S3 bucket versioning, so a database manifest plus immutable keys is mandatory. MinIO contract tests run with versioning disabled to prevent false local parity.

### 2.4 Backup and restore

- Daily database backup and daily object-manifest snapshot.
- Copy newly committed immutable keys to a separate backup bucket/path with credentials unavailable to the application.
- Daily integrity check samples manifest SHA-256 against primary/backup objects.
- Backup retention must meet the documented RPO and deletion-aging schedule.
- Restore into an isolated environment: database first, validate manifests, restore missing primary objects from backup, then run cross-tenant/audience and sample-download checks.
- Quarterly pilot restore drill must meet RTO ≤ 8 hours and RPO ≤ 24 hours.

Because R2 lacks object lock/versioning, the backup bucket is protected by credential separation and operational process, not claimed as WORM storage.

## 3. OCR Service

- Build from a pinned Python/PaddleOCR base with PP-StructureV3 model artifacts embedded by digest.
- Generate and retain an SBOM containing OS, Python, PaddlePaddle, PaddleOCR, model, and font/rendering dependencies.
- Run as a non-root user with read-only root filesystem and bounded temporary storage.
- Deny Internet egress and all database/Redis/R2/MinIO credentials.
- Expose only a private authenticated health endpoint and versioned recognition endpoint.
- Configure CPU/memory/request/page/pixel/time/concurrency limits. Start CPU-first; GPU requires a separate measured ADR.
- Worker renders pages and sends bytes; the service never fetches an object URL.
- Deployment health includes model loaded/readiness; liveness checks only process health.
- Roll forward/back by immutable image digest. Never download “latest” models at runtime.

Local Compose includes the same API/image with development resource limits. Fixture and contract tests run before staging promotion; the gates are in [OCR Evaluation](../research/ocr-evaluation.md#6-promotion-gates).

## 4. Configuration

Validate typed environment configuration at startup. Required groups include:

- Application/base URLs, environment, build/version.
- PostgreSQL and Redis connections.
- Storage provider, R2/MinIO endpoint, region (`auto` for R2), bucket, access key, secret, jurisdiction, presign expiries, quotas.
- OCR internal URL, service credential, model/config version, page/pixel/time/concurrency limits.
- Better Auth keys/URLs, email provider, OAuth issuer/audience.
- Resend keys/webhook secret and sender identity.
- Sentry/OTel endpoints, sampling, and explicit export enablement.
- Retention, backup bucket, and operational job settings.

Production refuses local/default credentials, public object endpoints, missing webhook secrets, unpinned OCR versions, wildcard CORS, or outbound telemetry without scrub configuration.

## 5. Deployment Sequence

1. Build, scan, sign/identify web, worker, and OCR images/artifacts.
2. Run unit, integration, contract, migration, UI accessibility, and OCR fixture gates.
3. Back up database/manifests; verify R2/backup credentials and capacity.
4. Apply checked-in migrations as an explicit release step.
5. Deploy OCR and worker; verify readiness and queue pause.
6. Deploy web/API; run health, auth, tenant, storage, and MCP smoke tests.
7. Resume queues gradually and observe age/errors/OCR saturation.
8. Run a synthetic upload → scan → OCR → citation check.
9. Record deployment evidence and rollback target.

Application startup never applies production migrations or downloads models.

## 6. Alerts and Runbooks

Alert on:

- HTTP/MCP error and latency.
- Database pool and migration mismatch.
- Queue age, retries, and dead letters.
- R2 upload/get/delete/hash/inventory failures.
- Primary/backup manifest divergence.
- OCR readiness, saturation, timeout, crash, low-confidence, and malformed output.
- Email bounce/complaint and invalid webhooks.
- Authentication/OAuth abuse.
- Purge lag and restore/backup failure.

Runbooks must cover missing/corrupt objects, failed promotion, backup restore, OCR
crash/saturation/bad model rollback, stuck queues, database restore, email outage, OAuth
compromise, accidental deletion, and response when R2 access is compromised.

## 7. Local W0 Runtime

W0 uses loopback-only ports chosen to avoid common workstation services:

| Service | Local endpoint |
| --- | --- |
| Web | `http://127.0.0.1:53000` |
| Worker health/readiness | `http://127.0.0.1:58080/health` and `/ready` |
| PostgreSQL | `127.0.0.1:55432` |
| Redis | `127.0.0.1:56379` |
| MinIO API/console | `http://127.0.0.1:59000` / `http://127.0.0.1:59001` |
| Mailpit SMTP/UI | `127.0.0.1:51025` / `http://127.0.0.1:58025` |
| ClamAV | `127.0.0.1:53310` |
| Optional OCR | `http://127.0.0.1:58081` |

Start the required dependencies with:

```bash
docker compose up -d postgres redis minio minio-init mailpit clamav
pnpm db:migrate
```

The OCR boundary is available with `docker compose --profile ocr up -d ocr`. Its health and
readiness endpoints run without downloading a model at startup; `/v1/recognize` remains disabled
until the S4 model-artifact gate. The local bucket is private and has versioning suspended to match
the supported R2 subset.

All ports can be overridden by the corresponding variables in `compose.yaml`. Safe local
application defaults are built in and mirrored by `.env.example`; production environments must
provide validated non-local values.

The web and worker ports are development-only, project-specific host assignments. Production
containers continue to receive their platform-assigned `PORT`. In VS Code Remote SSH, the
repository configuration automatically forwards `53000` to the same loopback port on the local
computer and ignores unrelated detected ports. Press `F5` and select
**Delivery OS: debug (full stack)** to prepare dependencies, start both hot-reload processes, and
open the locally forwarded app.

## 8. W0 Railway Validation Deployment

The W0 validation deployment was created on 2026-07-24 in `muthurema's Projects`:

- Project: [delivery-os](https://railway.com/project/d3b8b065-7605-41d2-a844-4625d527b0c2)
- Environment: Railway's single default `production` environment, with application mode
  `APP_ENV=staging` until the owner promotion gate is approved.
- Public web: <https://web-production-57ecb9.up.railway.app>
- Private services: worker and OCR; neither has a public domain.
- Data services: Railway PostgreSQL 18 and exact `redis:8.8.0-alpine`, both with persistent
  volumes.
- Application release: web `144ab84`, worker `ab681c3`; OCR has no source delta from its validated
  deployment.

The checked-in migration was applied twice through the PostgreSQL public release connection and was
idempotent. Web readiness verified PostgreSQL and Redis over Railway private networking. The
transactional probe returned `201`; the worker dispatched and processed its outbox event once.
Restarting web and worker retained the previously committed event and processed a new event once.
The worker also recovered from a deliberate Redis 8.8.0 restart, processed the next event once, and
emitted no raw error-level connection stacks.

Remote browser verification is reproducible with:

```bash
PLAYWRIGHT_BASE_URL=https://web-production-a2352.up.railway.app pnpm test:e2e
```

The validation environment intentionally uses `APP_ENV=staging` because the diagnostic platform
probe is denied in approved production mode. W0 is complete; keep this setting until the diagnostic
route is no longer required and an explicit production promotion is scheduled. PR #1 is merged, and
the web, worker, and OCR sources now track `mnishanth02/delivery-os` on `main`. Their first
repository-linked deployments built merge commit `bf8274a` and passed health checks and the remote
browser suite.

## 9. M1 Identity and Email Operations

M1 adds these required web-service settings:

| Variable | Local/test | Preview, staging, and production |
| --- | --- | --- |
| `BETTER_AUTH_URL` | `http://127.0.0.1:53000` | Exact canonical public HTTPS origin; no path or wildcard |
| `BETTER_AUTH_SECRET` | Non-production development value | Unique secret of at least 32 random characters from the platform secret manager |
| `EMAIL_PROVIDER` | `local` | `resend` |
| `MAILPIT_SMTP_URL` | `smtp://127.0.0.1:51025` | Unset |
| `AUTH_EMAIL_FROM` | Local sender label | Approved and verified sender identity |
| `RESEND_API_KEY` | Unset | Environment-specific restricted API key |
| `RESEND_FROM` | Unset | Approved and verified sender identity |

Apply `packages/database/drizzle/0001_wakeful_blizzard.sql` as an explicit release migration before
deploying the M1 web build. The migration is forward-only after release; runtime startup does not
apply or repair it.

Production and staging fail closed when the Better Auth secret or Resend configuration is missing.
They also reject a non-HTTPS, non-origin, path-bearing, or wildcard `BETTER_AUTH_URL`; local and test
are the only environments permitted to use the Mailpit SMTP adapter and development defaults.
Railway overwrites `X-Real-IP` with the remote client address, and the non-local Better Auth
configuration trusts that single header for per-client rate limiting instead of accepting a
spoofable forwarded chain.
Secure cookies are enabled outside local/test. Password sign-in is limited to five attempts per
minute, while reset and two-factor endpoints retain the stricter three-attempt limits. Local/test
limits are higher only so parallel browser projects sharing one loopback IP do not interfere.

Operational response:

- If email delivery fails, the invitation remains recorded and re-issuable; reissue revokes every
  prior pending link for that address.
- If sign-in or TOTP abuse increases, inspect rate-limit outcomes without logging email addresses,
  passwords, tokens, cookies, TOTP secrets, recovery codes, or message bodies.
- Deactivation revokes active sessions immediately. A user with no other active workspace
  membership is also denied new sessions; historical user and audit attribution remains.
- Rotate a compromised Better Auth secret and invalidate all sessions in a controlled incident
  change. Rotate a compromised Resend key independently and review provider delivery activity.
- Back up the database before migration and include auth, workspace, membership, invitation,
  selection, audit, idempotency, and outbox tables in restore validation.
