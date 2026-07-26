# W3 M3 Requirement Intake & Template Engine Validation

**Reviewed:** 2026-07-26
**Owner:** Nishanth with Codex
**Branch base revision:** `ab05c56610a404090c42dbd6cb599ac0cd9e45ed`
**Reviewed implementation revision:** `51f819af383723329f6fb347ce91c636ba6f814b`
**Exact deployed source revision:** `dc9b01c7dd87f55266b704ad4ff146a324a4d718`
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
  and non-content receipts. Backup creation and restore are not implemented or validated.
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
- **H — AI boundary (implemented, not promoted):** added provider-neutral strict extraction, deterministic fake,
  citation validation, explicit OpenAI/Anthropic Vercel AI SDK adapters, no-fallback routing,
  `store: false`, exact pinned workflow configurations, per-workflow enable checks, budget-gate
  interface, conservative database-backed USD 1/run and USD 100/month reservation with USD 50/80
  alerts, encrypted configurable 0-30-day provenance, worker extraction composition, global and
  workflow kill switches, UI trigger/quality review, and manual fallback. Provider secrets, alert
  delivery, and two live frozen evaluations are not complete.
- **I — S3 integration:** atomically binds Requirement readiness to the existing frozen artifact
  review snapshot and preserves the generic S3 adapter behavior.
- **J — product and operations (partial):** added workspace/project-authorized APIs, responsive manual
  Sections A-H intake, native quarantine upload, retry-safe database jobs/worker processing,
  accessible errors/status, synthetic desktop/mobile E2E coverage, and an operations runbook.
  The worker now composes scan, parse, and OCR handlers only when every private dependency is
  configured, validates the expected OCR model/config digests, and otherwise fails closed to the
  manual path. Extraction processing and human claim/conflict/gap review UI are implemented.
  Backup/restore scheduling, operational dashboards, and alert delivery remain incomplete;
  therefore Slice J is not ready.
- **K — controlled staging (partial):** applied Railway staging IaC operation
  `oKCxkzWOvgxz83OfqZQ7w` in environment
  `f7544a5c-065b-4eca-9eb8-577008ed6896`: 13 safe changes, zero destructive changes. The private
  ClamAV/OCR topology and disabled AI configuration are present. Revision
  `dc9b01c7dd87f55266b704ad4ff146a324a4d718` passed CI and was deployed successfully to web,
  worker, and OCR. All 11 forward migrations are applied and the six required M3 tables exist.
  Cloudflare Wrangler is not authenticated and the primary/backup R2 resources are absent, so
  every-format, restore/purge, and load validation remain blocked. An earlier exact-revision
  deployment found and forward-fixed a missing direct worker runtime dependency. An initial OCR
  local upload used the wrong archive root and failed before image build; the corrected
  repository-root upload was accepted.

## Local verification

| Check | Result |
| --- | --- |
| Focused M3 worker/ingestion/security suite | Passed: 5 files, 18 tests, including private DNS restrictions, worker failure classification, full immutable promotion/replay, and manual text normalization. |
| Full unit/integration suite | Passed: 47 files, 215 tests. |
| Migration suite | Passed: 5 tests, including clean replay and additive forward migrations. |
| Full Playwright suite | Passed: 24/24 desktop/mobile tests in 59.4 seconds, including M3 keyboard, reflow, accessible status, and quarantine-failure journeys. |
| `pnpm test:ocr` | Passed: Python source compilation and 3 strict OCR-client boundary tests. |
| `pnpm format:check` | Passed after final evidence and roadmap edits. |
| `pnpm lint` | Passed after implementation and evidence edits. |
| `pnpm typecheck` | Passed: 12 packages. |
| `pnpm check:dependencies` | Passed. |
| `pnpm check:docs` | Passed after this record and all links were added. |
| `pnpm build` | Passed. |
| `git diff --check` | Passed after final evidence and roadmap edits. |
| `pnpm test:coverage` | Passed without threshold or exclusion changes: statements 86.46%, branches 80.11%, functions 93.32%, lines 89.27%; 47 files and 215 tests passed. |
| OCR candidate smoke/evaluation-mode checks | Passed real clean-text recognition (confidence `0.9972448945`) and a synthetic 2x2 table with exact row/cell associations. Normal mode returned `not_ready` and authenticated recognition returned HTTP 503. These are smoke checks, not the frozen promotion suite. |
| `pnpm eval:ocr` | Still blocked: the checked-in harness is metadata-only and the complete frozen corpus has not been accepted or run twice. |
| `pnpm eval:requirements -- --run=1` and `--run=2` | Stopped truthfully with `AI_PROMOTION_DECISION_MISSING`. |
| `pnpm audit --prod --audit-level high` | Passed the High threshold; one Moderate vulnerability reported. |
| Working-tree secret scan | Passed using pinned Gitleaks 8.30.0 in a container: approximately 4.16 MB scanned with no leak found. Full Git-history scan reported one redacted pre-existing historical finding; its content was not exposed or copied. |
| Web/worker/OCR image scan | Passed Trivy 0.69.3 with zero fixed High/Critical findings. |
| GitHub CI for deployed source revision | Passed all 5 jobs in run `30208220862`: validate, secret scan, web image, worker image, and OCR image. |
| Railway migration/readiness | Passed: 11 migration records, six required M3 tables, and web readiness reported PostgreSQL and Redis up after the coordinated credential rotation. |

## Exact image and deployment evidence

- Exact Railway web image:
  `sha256:be0c0839f9b9cb071ffa58a146d78c41f272d37dc33d4d58d1e51bef9640051b`.
- Exact Railway worker image:
  `sha256:a4eab81af2c3f279f6f874b0408703612e317c498e9d779173299cbd6ad333f8`.
- Exact Railway OCR image:
  `sha256:9d66f04d3f23c1c9c01585919ebcf2de4229eddf22dc508ab0f1c1da0afe5292`.
- Initial exact deployments: web `ead6850c-379d-4a7d-8273-90a862957e38`, worker
  `a6883f1d-75ff-47b0-acff-c4a03f847828`, and OCR
  `4d4a222f-17ce-44c2-9daf-5c104de3b9dc`.
- Post-credential-rotation deployments: web `8efaef2f-f943-448c-8f6d-d86cad8e6ff0`
  and worker `2f425fc7-09bb-4345-a7c2-9f4d9fd2d615`, both successful with the same
  exact image digests. The first worker rotation attempt
  `4fd95a2f-36b8-44a1-a895-f26277f06b99` failed closed because Railway's generated
  connection URLs still contained the old password; the URLs were repaired without printing
  either secret and the successful replacement passed readiness.
- OCR and ClamAV have no public Railway domains. The only application domain is
  `https://web-staging-5e5c.up.railway.app`.

- Prior web candidate:
  `sha256:8d14decddbd578faac329ff811aeb2b561da39b4976ee1ca60dd974a852eac42`.
- Prior worker candidate:
  `sha256:e2cea17d56556bbde4d9f3f221e7f005488ce0e04b236e09df7d566c7e0fbaa9`.
- Prior OCR candidate:
  `sha256:a169646276e769d52971b73ebe8795f170f467935e931ddcbdd25f7725ef5616`
  (local OCI manifest-list/image ID; 1,356,100,790 bytes).
- OCR model artifact manifest:
  `4bc98087d81049792a1847a950ebae9e95e83fc643911ae4eb05af70d6db557e`.
- OCR configuration:
  `12dd9f9379bb158f4b2a14f101d5c69a411983852865e1d41733361fd692da79`.
- Trivy 0.72.0 found zero fixed Critical/High OS or language vulnerabilities in all three prior
  candidates. Worker and OCR code changed afterward, so every candidate digest is stale and none is
  exact-revision promotion evidence. All images must be rebuilt and rescanned for the PR revision.

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

## Exit-gate gaps and manual account-owner actions

The owner policy decisions are recorded. The remaining actions and decisions are:

1. **Nishanth — provider credentials:** create separate scoped OpenAI and Anthropic API projects and
   place their keys directly in Railway staging secrets. Do not send them in chat or commit them.
   The OpenAI workflow configuration hash is
   `cbc9b7350a1f3baa7288c24920a758b342e701efd8f1cf25c497a90cbe294880`;
   the Anthropic evaluation configuration hash is
   `8915a32f8901a3e854da10553884ca04da9148d5d7d1bf5ec0ead2cf57dfe83e`.
   Keep both Railway workflow switches disabled until Codex verifies the injected secrets and runs
   the frozen synthetic evaluations. Individual Codex/Claude subscriptions remain developer tools
   and cannot be used by the backend.
2. **Nishanth — OCR fixture acceptance and promotion:** review and accept the complete frozen
   synthetic English corpus/gold annotations, then review two consecutive exact-image runs. If
   every threshold passes, approve the candidate digest in a separate human promotion change.
   Codex cannot set `recognitionEnabled` or self-approve.
3. **Codex — remaining Railway validation:** the owner-approved staging IaC apply, exact-revision
   deployment, migrations, health/readiness, and no-public-domain checks passed. The 4-vCPU/8-GiB
   OCR ceiling, authenticated private recognition, network-egress restriction, every-format
   journey, and twenty-job load/backpressure test still require the promoted OCR configuration and
   provisioned object storage.
4. **Nishanth — Cloudflare authentication:** authenticate Wrangler on this machine, or provide an
   approved Cloudflare connector/session. Current `wrangler whoami` reports unauthenticated. Only
   then can Codex create `delivery-os-staging-primary` and `delivery-os-staging-backup`, `enam`
   placement, private bucket-scoped credentials, and CORS for the actual staging origin
   `https://web-staging-5e5c.up.railway.app`.
5. **Nishanth — historical credential revocation:** verify or rotate the potentially active
   credential and attach sanitized closure evidence to private GitHub Security Advisory
   [GHSA-jcvm-5j93-9h96](https://github.com/nishanthturnstile/delivery-os/security/advisories/GHSA-jcvm-5j93-9h96).
   Revocation status remains unknown; never copy the credential value into the advisory or PR.
6. **Codex implementation before full live validation:** add the separately credentialed
   backup/restore scheduler and alert delivery, then complete the frozen OCR and Requirement
   evaluation runners. Coverage and the full local E2E suite now pass without weakened gates.
7. **Codex after the above:** run exact-revision CI/images, synthetic staging every-format and
   manual-AI-off journeys, primary/backup restore and purge drills, adversarial/security/audience
   tests, accessibility review, twenty-job load/backpressure, and scrubbed logs/metrics inspection.
   Nishanth then supplies the final human go/no-go, PR approval, and merge.

Because these criteria are not satisfied, the Section 16 exit gate did not pass. M4 was not started.

## Final source inventory

The implementation inventory is Git commit
`51f819af383723329f6fb347ce91c636ba6f814b`; deployed source revision
`dc9b01c7dd87f55266b704ad4ff146a324a4d718` adds evidence-only commits. This is deployed staging
evidence, not promoted OCR/AI or M3 completion evidence. The user's unrelated staged
`apps/web/next-env.d.ts` change was excluded from M3 and remains outside every M3 commit.
