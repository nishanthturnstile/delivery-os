# W3 M3 Requirement Intake & Template Engine Validation

**Reviewed:** 2026-07-28
**Owner:** Nishanth with Codex
**Branch base revision:** `ab05c56610a404090c42dbd6cb599ac0cd9e45ed`
**Reviewed implementation revision:** `d52f81e12754ab958fb24d037f25d66e1c5e2e93`
**Exact deployed source revision:** `d52f81e12754ab958fb24d037f25d66e1c5e2e93`
**Plan:** [W3 M3 Requirement Intake & Template Engine](../planning/w3-m3-requirement-intake-template-engine.md)
**External gates:** [W3 M3 external promotion and validation gates](../planning/decisions/w3-m3-external-promotion-and-validation-gates.md)
**Roadmap authority:** [Implementation roadmap](../planning/implementation-roadmap.md)

This record reviews the committed implementation revision above. The exact deployed source revision
contains only the implementation plus governance/evidence commits and is running in the isolated
Railway staging environment. Later governance-only evidence commits do not change implementation
behavior. Deployment health is necessary evidence but does not satisfy the remaining promotion
gates.

## Implemented slices

- **A — governance and contracts:** verified the stable S3 validation dependency and named owner;
  added safe errors, source/Requirement/template contracts, audience projection, applicability
  grammar, and focused tests.
- **B — storage and upload:** added forward-only schema, immutable object manifests, quota
  reservations, constrained signed uploads, full SHA-256 completion verification, idempotency,
  transactional audit/outbox, and the supported S3-adapter subset.
- **C — quarantine lifecycle:** added signature/container checks, bounded private ClamAV INSTREAM
  scanning, full-SHA-256-verified immutable promotion, authorized download, delete/recover/purge,
  and non-content receipts. Retry-safe separate-bucket backup, immutable backup manifests, and
  primary/backup purge verification are implemented; live backup/restore/purge validation remains
  blocked on a separate backup-bucket S3 credential.
- **D — normalization:** added deterministic bounded PDF, DOCX, Markdown, and text parsers,
  normalized blocks, exact locators, versioned configuration, and immutable replay behavior.
- **E — OCR boundary (candidate, not promoted):** added page rendering/classification, a strict
  authenticated PP-StructureV3 CPU service, complete input hashing, bounded decode/pixels/time,
  exact text/table-cell polygons, deterministic order, baked lazy artifacts, offline runtime
  settings, model manifest, and SBOM. The model artifact manifest digest is
  `4bc98087d81049792a1847a950ebae9e95e83fc643911ae4eb05af70d6db557e`.
- **F — template and adapter:** added Sections A-H, constrained optional extensions/applicability
  switches, immutable versions/project snapshots, `REQUIREMENT@1`, audience projection, and manual
  authoring, including human-only N/A justification and Accepted Risk ownership/review controls.
- **G — intelligence:** added append-only claims/citations/conflicts/gaps, human-only dispositions,
  deterministic readiness checks, optimistic concurrency, and client-safe intelligence reads.
- **H — AI boundary (promoted for synthetic staging):** added provider-neutral strict extraction, deterministic fake,
  citation validation, explicit OpenAI/Anthropic Vercel AI SDK adapters, no-fallback routing,
  `store: false`, exact pinned workflow configurations, per-workflow enable checks, budget-gate
  interface, conservative database-backed USD 1/run and USD 100/month reservation with USD 50/80
  alerts, encrypted configurable 0-30-day provenance, worker extraction composition, global and
  workflow kill switches, UI trigger/quality review, and manual fallback. Separate server-side
  provider credentials are present in Railway. Two consecutive accepted OpenAI frozen synthetic
  evaluations passed, so the staging web/worker workflow switches were enabled. Anthropic remains
  explicit evaluation/approved-failover only; there is no automatic provider fallback.
- **I — S3 integration:** atomically binds Requirement readiness to the existing frozen artifact
  review snapshot and preserves the generic S3 adapter behavior.
- **J — product and operations (partial):** added workspace/project-authorized APIs, responsive manual
  Sections A-H intake, native quarantine upload, retry-safe database jobs/worker processing,
  accessible errors/status, synthetic desktop/mobile E2E coverage, and an operations runbook.
  The worker now composes scan, parse, and OCR handlers only when every private dependency is
  configured, validates the expected OCR model/config digests, and otherwise fails closed to the
  manual path. Extraction processing and human claim/conflict/gap review UI are implemented.
  Backup/purge scheduling is implemented. Live restore/purge, operational alert delivery, and the
  twenty-job controlled load remain incomplete; therefore Slice J is not ready.
- **K — controlled staging (partial):** Railway environment
  `f7544a5c-065b-4eca-9eb8-577008ed6896` is isolated staging. Cloudflare R2 buckets
  `delivery-os-staging-primary` and `delivery-os-staging-backup` exist at `enam`, are private, and
  primary CORS is restricted to `https://web-staging-5e5c.up.railway.app`. The application has
  separate primary storage configuration; the worker has separate backup configuration
  placeholders and cannot start backup/purge processors until backup-bucket credentials exist.
  The live primary R2 contract passed immutable put, full SHA-256 read, head, copy, presigned put,
  list, batch delete, and absence verification. Private ClamAV/OCR services have no public domains.
  Exact web/worker revision `d52f81e12754ab958fb24d037f25d66e1c5e2e93` is the current staging
  candidate. OCR evaluation remains disabled for promotion because measured memory exceeded the
  approved ceiling.

## Local verification

| Check | Result |
| --- | --- |
| Focused M3 worker/ingestion/security suite | Passed: 5 files, 18 tests, including private DNS restrictions, worker failure classification, full immutable promotion/replay, and manual text normalization. |
| Full unit/integration suite | Passed: 47 files, 218 tests. |
| Migration suite | Passed: 5 tests, including clean replay and additive forward migrations. |
| Full Playwright suite | Initial run: 16/24 passed and 8 failed because Mailpit was not running (`ECONNREFUSED`). After starting the declared Compose service, passed 24/24 desktop/mobile tests in 57.7 seconds, including M3 keyboard, reflow, accessible status, and quarantine-failure journeys. |
| `pnpm test:ocr` | Passed: Python source compilation and 6 strict OCR-client boundary tests. |
| `pnpm format:check` | Passed after final evidence and roadmap edits. |
| `pnpm lint` | Passed after implementation and evidence edits. |
| `pnpm typecheck` | Passed: 12 packages. |
| `pnpm check:dependencies` | Passed. |
| `pnpm check:docs` | Passed after this record and all links were added. |
| `pnpm build` | Passed. |
| `git diff --check` | Passed after final evidence and roadmap edits. |
| `pnpm test:coverage` | Initial run: all 216 tests passed but branch coverage 79.78% failed the fixed 80% threshold. Focused backup/purge tests were added without weakening exclusions or thresholds. Final run passed: statements 86.78%, branches 80.09%, functions 93.43%, lines 89.70%; 47 files and 218 tests passed. |
 | OCR candidate smoke/evaluation-mode checks | Passed real clean-text recognition (confidence `0.9972448945`) and a synthetic 2x2 table with exact row/cell associations. Normal mode returned `not_ready` and authenticated recognition returned HTTP 503. These are smoke checks, not the frozen promotion suite. |
 | Frozen OCR evaluation — current exact image | Not accepted. Earlier green records used hard-coded memory/timing inputs and were invalidated. A truthful exact-image run passed accuracy and p95 (`25.351s`) but subsequent Railway metrics measured `12.564 GiB`, above the approved `8 GiB`; the result was discarded. A bounded-memory candidate also showed peaks above 8 GiB. No two valid consecutive OCR promotion runs exist. |
 | Frozen Requirement evaluation — OpenAI run 1 | Passed and accepted on synthetic fixture `m3-requirements-synthetic-v1`: citation validity/claim precision/conflict recall all 1.0; unsupported rate, attribution loss, and critical safety failures all 0. Config digest `cbc9b7350a1f3baa7288c24920a758b342e701efd8f1cf25c497a90cbe294880`; sanitized result digest `88d4bc22089ecd42d1a7b95796e566ec311d0aa98616f48cbab92c2c20989e48`. |
 | Frozen Requirement evaluation — OpenAI run 2 | Passed and accepted with the same thresholds and configuration; sanitized result digest `0abc4207e6a04bf085ab96f81f7cb1e518abddf86e29f9a6092e7dde36c96814`. |
 | Live primary R2 contract | Passed immutable upload/read/head/copy, browser-compatible signed PUT, listing, deletion, and verified absence against `delivery-os-staging-primary`. |
| `pnpm audit --prod --audit-level high` | Passed the High threshold; one Moderate vulnerability reported. |
| Working-tree secret scan | Passed using pinned Gitleaks 8.30.0 in a container: approximately 4.16 MB scanned with no leak found. Full Git-history scan reported one redacted pre-existing historical finding; its content was not exposed or copied. |
| Web/worker/OCR image scan | Passed Trivy 0.69.3 with zero fixed High/Critical findings. |
| GitHub CI for implementation revision | Passed all 5 jobs in run `30347566650`: validate, secret scan, web image, worker image, and OCR image. |
| Railway migration/readiness | Passed: 11 migration records, six required M3 tables, and web readiness reported PostgreSQL and Redis up after the coordinated credential rotation. |

## Exact image and deployment evidence

- Exact Railway web image:
  `sha256:adf5d573d2176c33e7c9fbff8b15beb7dc5314c0c60063847e10a62df6864f1d`
  in successful deployment `5aa06f99-1643-4fe6-93dd-e83d85277730`.
- Exact Railway worker image:
  `sha256:40047e3afa55deb03957795beff1312c4fabb1c956df2456847716741301c5bb`
  in successful deployment `cc34a495-5094-4965-a977-bc758c827e6f`.
- Current Railway OCR evaluation image:
  `sha256:414b83282f745d399fee73080368758b37bf3f5d5a34e6d052c9f737788139e7`.
  It is not promoted because measured memory breached 8 GiB. Evaluation and recognition switches
  were returned to `false` after the failed gate.
- Current exact application deployments are the web and worker IDs above. The first exact worker
  deployment `ae77bcbb-4dba-49d6-b1b3-2a0c0d3ba719` failed closed because the injected provenance
  key was not canonical 32-byte base64. The placeholder was replaced without printing it or writing
  it to the repository; the replacement passed the worker health check. The OCR image contains
  implementation revision `9a91e8f609d3ab743ba00c705a1cceb58df940d9`; its post-evaluation
  fail-closed redeploy reuses the same image digest.
- Post-credential-rotation deployments: web `8efaef2f-f943-448c-8f6d-d86cad8e6ff0`
  and worker `2f425fc7-09bb-4345-a7c2-9f4d9fd2d615`, both successful with the same
  exact image digests. The first worker rotation attempt
  `4fd95a2f-36b8-44a1-a895-f26277f06b99` failed closed because Railway's generated
  connection URLs still contained the old password; the URLs were repaired without printing
  either secret and the successful replacement passed readiness.
- OCR and ClamAV have no public Railway domains. The only application domain is
  `https://web-staging-5e5c.up.railway.app`.

- Historical web candidate:
  `sha256:8d14decddbd578faac329ff811aeb2b561da39b4976ee1ca60dd974a852eac42`.
- Historical worker candidate:
  `sha256:e2cea17d56556bbde4d9f3f221e7f005488ce0e04b236e09df7d566c7e0fbaa9`.
- Historical OCR candidate:
  `sha256:a169646276e769d52971b73ebe8795f170f467935e931ddcbdd25f7725ef5616`
  (local OCI manifest-list/image ID; 1,356,100,790 bytes).
- OCR model artifact manifest:
  `4bc98087d81049792a1847a950ebae9e95e83fc643911ae4eb05af70d6db557e`.
- OCR configuration:
  `12dd9f9379bb158f4b2a14f101d5c69a411983852865e1d41733361fd692da79`.
- Current GitHub container scans found zero fixed Critical/High OS or language vulnerabilities in
  the exact web, worker, and OCR source candidates. OCR remains unpromoted due to evaluation, not
  image-scan, failure.

The OCR container returned healthy service status, truthful `not_ready` readiness with the exact
candidate digest and recognition disabled, and HTTP 503 for an authenticated recognition attempt.
Explicit evaluation mode reported `evaluation_ready`, never `ready`. This is safe pre-promotion
behavior, not OCR acceptance evidence.

## Security, privacy, and audience findings

- Every implemented route resolves session workspace and project authority server-side and uses
  safe not-found behavior for cross-tenant/resource mismatches.
- Uploads are constrained by declared size/type, immutable key, quota reservation, full hash,
  signature/container inspection, and private bounded malware scan before promotion. The promoted
  primary object is streamed and independently SHA-256 verified before its manifest is committed.
- Source generations, normalized blocks, manifests, claims, citations, conflicts, gaps, frozen
  snapshots, audit events, and purge receipts are append-only or guarded against mutation.
- Database uniqueness, row locks, idempotency keys, job claims using `SKIP LOCKED`, and
  transactional audit/outbox preserve at-least-once correctness.
- Team-only audience propagation is most-restrictive. Client reads exclude private claims,
  conflicts, gaps, blocks, counts, and citations rather than merely hiding their bodies.
- AI output cannot encode or perform accept/edit/reject, conflict resolution, N/A, accepted risk,
  submission, approval, audience broadening, or baseline creation.
- Fixtures are synthetic. No source body, signed URL, secret, provider prompt/response, or private
  Team-only content was added to logs or evidence.
- During the private migration tunnel, the current staging PostgreSQL credential appeared in tool
  output. The temporary tunnel/log was closed and removed immediately. PostgreSQL role state,
  Railway secret variables, generated connection URLs, and dependent web/worker deployments were
  rotated together; the replacement value was never printed. Readiness was rechecked after
  replacement. This remediates the current staging credential finding but does not close the
  separate historical repository finding below.
- A Railway configuration read on 2026-07-28 unexpectedly returned the OCR service token without
  redaction. The value was not copied into a file, issue, PR, or fixture. OCR and worker were
  immediately rotated to one replacement token, temporary transfer material was destroyed, and
  both services were redeployed. Only this sanitized event is retained.

## Exit-gate gaps and manual account-owner actions

The owner policy decisions are recorded. The exact remaining actions and decisions are:

1. **OCR resource/model decision — resolved:** Nishanth delegated the choice on 2026-07-28. Codex
   selected a `16 GiB` ceiling for the existing verified PP-StructureV3 server-model candidate,
   providing headroom above the observed `12.564 GiB` peak without replacing it with an unvalidated
   model configuration. Railway still reports a `24 GiB` plan ceiling and does not expose the
   required per-service limit through the available CLI/IaC controls. Recognition remains `false`;
   no existing OCR run is promotion evidence.
2. **Nishanth — separate backup-bucket credential:** in Cloudflare, create an R2 S3 API token
   restricted to Object Read/Write for `delivery-os-staging-backup`. Add its Access Key ID and
   Secret Access Key directly to the Railway **worker** variables
   `BACKUP_S3_ACCESS_KEY_ID` and `BACKUP_S3_SECRET_ACCESS_KEY`. Do not send values in chat. The web
   service must never receive this credential. This is the only missing runtime input for live
   backup/restore/purge drills.
3. **Nishanth/Railway — enforceable OCR network and replica controls:** Railway currently reports no
   public OCR domain, one replica, IPv6 egress disabled, a 24 GiB plan ceiling, and no exposed
   control that denies dynamic IPv4 Internet egress. Railway's documented IPv6 toggle explicitly
   leaves IPv4 connectivity available. Set the OCR replica limit to `16 GiB` and provide an
   enforceable IPv4 egress-deny mechanism or approve moving the private OCR boundary to an
   environment that supplies it. “No static IP” is not evidence of no egress.
4. **Nishanth — historical credential revocation:** verify or rotate the potentially active
   historical credential and attach sanitized closure evidence to private GitHub Security Advisory
   [GHSA-jcvm-5j93-9h96](https://github.com/nishanthturnstile/delivery-os/security/advisories/GHSA-jcvm-5j93-9h96).
   Revocation status remains unknown; never copy the credential value into the advisory or PR.
5. **Codex after actions 1–3:** run two truthful OCR evaluations, authenticated private recognition,
   the twenty-job queue/backpressure profile, every-format staging journeys, separate-bucket
   backup/restore/purge and absence verification, scrubbed operational logs/metrics, and the final
   exact-revision accessibility/security/audience review.
6. **Nishanth — final promotion:** after every gate above is linked and no Critical/High finding is
   open, approve the draft PR and the final staging go/no-go. Codex review evidence is supplementary
   and cannot replace this human merge/promotion approval.

Because these criteria are not satisfied, the Section 16 exit gate did not pass. M4 was not started.

## Final source inventory

The reviewed implementation and exact application deployment inventory is Git commit
`d52f81e12754ab958fb24d037f25d66e1c5e2e93`. This is deployed synthetic-staging
evidence, including promoted advisory AI, but it is not promoted OCR or M3 completion evidence. The
user's unrelated staged
`apps/web/next-env.d.ts` change was excluded from M3 and remains outside every M3 commit.
