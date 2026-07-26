# W3 M3 Requirement Intake & Template Engine — Approved Implementation Plan

**Document status:** Approved implementation plan

**Authorization mode:** `IMPLEMENTATION_APPROVED`

**Implementation status authority:** [Module-Wise Implementation Roadmap](implementation-roadmap.md)

**Owner:** Nishanth with Codex

**Specification snapshot reviewed:** `ab05c56610a404090c42dbd6cb599ac0cd9e45ed`

**Prerequisite:** Shared Artifact Kernel is `Complete` with linked
[validation evidence](../validation/w2-shared-artifact-kernel.md)

**Requirements:** FR-M3-01–18; FR-CC-01–04, 07–08, 12–17; NFR-02, NFR-04–14;
[Standard Requirement Template Sections A–H](../core/product-plan.md#8-standard-requirement-template-sections-ah)

**Backlog:** [S4 Secure Source Storage and Deterministic Ingestion](delivery-backlog.md#s4--secure-source-storage-and-deterministic-ingestion)
and [S5 Requirement Extraction, Claims, Conflicts, and Gaps](delivery-backlog.md#s5--requirement-extraction-claims-conflicts-and-gaps)

**Roadmap:** [W3 M3 Requirement Intake & Template Engine](implementation-roadmap.md#7-w3--m3-requirement-intake--template-engine)

> Founder authorization permits implementation with synthetic/redacted fixtures only. It does not
> authorize a live AI provider, production R2/backup infrastructure, or real
> client/project/user/document data. The roadmap remains the sole implementation-status authority.

## 1. Gate, Scope, and Module Boundary

### 1.1 Gate verification

At implementation start:

1. The roadmap summary records Shared Artifact Kernel as `Complete`, owned by Nishanth with Codex,
   and links its stable validation record.
2. Roadmap Section 6 records M2 and Shared Artifact Kernel as `Complete`; the S3 exit gate states
   that its reusable behaviors pass before M3 builds the Requirement schema.
3. The S3 validation record identifies reviewed revision
   `a9e3c694eff066f51d822eab4f493e26275f25cb` and passing local/staging evidence.
4. Founder authorization records M3 owner `Nishanth with Codex`, approves synthetic/redacted
   fixtures, and approves only optional workspace fields/checks plus declared applicability tuning.
5. The roadmap summary and Section 7 are synchronized to `In Progress` with that owner in Slice A.
6. The working tree contains a pre-existing `apps/web/next-env.d.ts` change. This plan does
   not depend on, modify, unstage, or include that change.

Implementation and the complete manual path may proceed. Live provider provisioning, production
storage/backup provisioning, and real data use remain unauthorized.

### 1.2 Objective

Turn authorized PDF, scanned PDF, DOCX, Markdown, and text sources into an immutable, cited,
human-controlled Requirement artifact using:

- private, content-addressed source storage with quarantine, scanning, recovery, and purge;
- deterministic normalized blocks and exact navigable source locators;
- a versioned Sections A–H Requirement template with controlled workspace extensions;
- proposed claims, human dispositions, explicit conflicts, and approval-blocking gaps;
- evaluated, provider-neutral AI assistance with a complete manual path; and
- the existing S3 draft, review snapshot, approval, baseline, delta, comment, attachment, audience,
  diff, audit, outbox, and export lifecycle.

### 1.3 Included

- S4 source upload sessions, object manifests, immutable object generations, quotas, quarantine,
  malware scan, promotion, download authorization, recoverable deletion, backup manifests, purge,
  and non-content purge receipts.
- Deterministic parsers for PDF, DOCX, Markdown, and text.
- Page-selective OCR through the existing private PaddleOCR PP-StructureV3 boundary.
- Immutable NormalizedDocument, NormalizedBlock, and SourceLocator versions.
- Retry-safe scan, parse, OCR, extraction, backup, and purge jobs with actionable progress.
- A `REQUIREMENT@1` artifact adapter registered through the completed artifact-kind registry.
- A code-owned template registry for Sections A–H, deterministic conditional applicability, and
  versioned controlled workspace additions/tuning.
- SourceClaim, FieldMapping, SourceConflict, Gap, GapDisposition, Citation,
  RequirementReadinessSnapshot, AI workflow configuration, generation, and provenance records.
- Human accept/edit/reject, manual value entry, conflict resolution, Not Applicable, Accepted Risk,
  source comparison, clarifying questions, submission readiness, PM approval, and first-binding
  external decision integration.
- Reusable accessible intake, processing, citation, template-editor, claim-review, conflict, gap,
  provenance, and readiness UI patterns.
- Frozen synthetic/redacted evaluation fixtures and two-run promotion evidence.

### 1.4 Non-goals

- PPTX, XLSX, images as standalone source formats, handwriting guarantees, arbitrary archives, or
  password-protected/encrypted documents.
- A public object bucket, public REST API, workspace-wide file-content search, or browser access to
  storage credentials.
- Arbitrary user-authored formulas, executable template code, removal of mandatory system fields,
  unrestricted template builders, or retroactive mutation of project template snapshots.
- Rich-text editing, collaborative cursors, CRDTs, or replacing the S3 editor primitives.
- Technical/UX/Feature/Cost artifact schemas, work breakdown, material-change impact analysis, MCP
  resources, or the final client portal navigation.
- AI approval, autonomous conflict resolution, autonomous N/A or Accepted Risk disposition, or use
  of draft/in-review Requirement content as authoritative context.
- Production data migration or backfill. M3 creates new record families only.

### 1.5 Boundary rule

M3 owns source bytes, deterministic normalization, Requirement-specific content/readiness, and
Requirement intelligence. S3 continues to own generic artifact lifecycle and immutable baselines.
The web runtime authorizes commands and issues constrained capabilities; the worker owns file and
AI processing; the OCR service is stateless compute and owns no domain/storage credentials.

## 2. Confirmed Facts, Assumptions, Decisions, and Open Questions

### 2.1 Confirmed facts

- Effective access is the intersection of workspace membership, project membership, artifact/source
  audience, entity state, and action policy.
- PM, Lead, Contributor, and Client Stakeholder may upload; Viewer may not. Requirement draft edit,
  submission, and approval permissions remain those in the normative role matrix.
- Source formats are PDF/OCR, DOCX, Markdown, and text; the file cap is 50 MB and retained project
  cap is 500 MB.
- Source content is immutable while retained. Eligible deletion has 30-day recovery followed by
  active-store purge and documented backup aging.
- Client-uploaded sources default Client-visible within that project; team uploads default
  Team-only. A PM may restrict a client upload during intake. Children may be more restrictive,
  never silently more permissive.
- R2 is the production object store and MinIO is the local adapter. The supported subset deliberately
  excludes bucket versioning, Object Lock, ACLs, public buckets, and SSE-KMS.
- The repository already contains AWS SDK S3/presigner dependencies, a small storage port and fake,
  private local MinIO, ClamAV, an authenticated disabled OCR service, BullMQ, transactional outbox,
  processed-event deduplication, typed runtime config, safe logging, and S3 artifact attachment/export
  ports.
- S3 supplies deterministic artifact serialization/hashing, append-only revisions, frozen snapshots,
  race-safe approval, immutable baselines, audience inheritance, safe not-found behavior, optimistic
  concurrency, idempotency, and reusable artifact UI.
- English is the primary initial-release language. Unsupported languages/layouts must be surfaced
  truthfully, not hidden in aggregate OCR scores.
- AI output is a proposal. Only a human may accept/edit/reject a claim, resolve a conflict, mark N/A,
  accept risk, or approve a Requirement.

### 2.2 Planning assumptions

- One active Requirement artifact exists per project. Post-baseline edits use the S3 Delta path,
  not a second independent Requirement.
- Live sources have no automatic expiry while their project remains active. Project/workspace
  deletion starts the normative 30-day recovery clock.
- The 50 MB pilot cap uses one presigned `PUT`; multipart capability remains in the storage adapter
  contract and provider tests but is not exposed in the initial UI because it adds resumable-session
  complexity without being required by the pilot cap.
- A source generation is immutable. Re-uploading a changed file creates a new SourceArtifact
  generation; uploading identical bytes records a duplicate relationship and reuses no mutable
  processing result unless the workspace/project/audience/config authorization keys also match.
- Full original source bytes remain the evidence authority. Normalized content is a versioned,
  reproducible derived record and can be rebuilt without changing prior accepted claims/baselines.
- Searchable PDFs use deterministic embedded-text extraction where usable. Only image-only,
  text-unusable, or explicitly low-quality pages are rendered for OCR.
- The initial Requirement template and UI ship in English. Source text may contain Unicode, but OCR
  promotion guarantees only the frozen English pilot corpus until a language pack passes the same
  gates.
- Provider request/response bodies are not application logs. When retained for provenance, they
  are encrypted domain content with the source/Requirement audience and retention policy.

### 2.3 Proposed architecture decisions

1. **Single immutable source manifest authority.** PostgreSQL stores every expected primary,
   quarantine, backup, and purge-receipt object key plus size, media type, SHA-256, generation,
   purpose, and lifecycle state. Object listings are reconciliation evidence, never the domain
   source of truth.
2. **Single-PUT pilot upload.** Create a short-lived upload session and generated quarantine key,
   reserve quota transactionally, and sign exact key, operation, content type, and base64 SHA-256.
   Completion streams/re-hashes the full object; neither browser MIME nor ETag is trusted.
3. **Defense in depth.** Decode and validate the display filename, allowlist extension, inspect
   magic bytes/container structure, enforce size/quota, reject encryption and malformed containers,
   stream to ClamAV `INSTREAM`, parse in bounded workers, and never fetch embedded URLs. This follows
   the [OWASP File Upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).
4. **Private scanner boundary.** Use the existing pinned ClamAV service over a private network.
   Implement its small framed `INSTREAM` protocol in `@delivery-os/ingestion` with Node `net`; do
   not add an unmaintained ClamAV client package. ClamAV documents that its TCP protocol is
   unauthenticated, so it must never be publicly exposed
   ([ClamD protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html)).
5. **Parser dependency boundary.** Add only:
   - `file-type` for best-effort binary signature detection, never as the sole validator;
   - `pdfjs-dist` for bounded PDF text extraction, page geometry, and page rendering;
   - `yauzl` for lazy, bounded access to required DOCX ZIP members; and
   - `saxes` for streaming OOXML parsing with DTD/external entity behavior disabled.
   Pin exact reviewed versions in the workspace catalog. Markdown/text parsing remains small,
   deterministic repository code. No rich-text or generic document-conversion dependency is added.
6. **Bounded PDF rendering.** Use PDF.js's Node display API with explicit maximum image/pixel and
   page-batch limits. Validate the exact canvas implementation already supported by the reviewed
   PDF.js release before pinning it; do not assume a transitive native canvas package. PDF.js
   documents Node examples and bounded image controls
   ([PDF.js examples](https://mozilla.github.io/pdf.js/examples/index.html),
   [API](https://mozilla.github.io/pdf.js/api/)).
7. **Deterministic block identity.** Compute a normalized document hash from source SHA-256,
   parser/renderer/OCR config versions, and ordered canonical blocks. Block IDs are UUIDv7 records
   with a unique deterministic `block_key`; `block_key` hashes source generation, page/structural
   locator, normalized text, geometry, and configuration. A replay may return existing rows but may
   never replace them.
8. **Code-owned template registry.** `REQUIREMENT_TEMPLATE@1` defines stable section/field keys,
   value schemas, mandatory controls, default applicability, ordering, and validation. Conditional
   rules use a closed declarative AST (`all`, `any`, `not`, `equals`, `present`) evaluated by pure
   domain code—never `eval`, SQL, JSONPath scripts, or user code.
9. **Controlled workspace extensions.** Admins may add optional fields/checks and tune only
   explicitly configurable applicability. They cannot remove/relax system-mandatory controls.
   Publishing creates an immutable template version; a project snapshots the effective version.
   Existing projects never change retroactively. Arbitrary visual/form builders remain deferred.
10. **Requirement body as authoritative human state.** The `REQUIREMENT@1` artifact body contains
    the project template snapshot ID and stable field entries with canonical values, applicability,
    source-claim/citation references, provenance presentation state, and human-authored
    N/A/Accepted Risk detail. Source claims and generations remain separate immutable evidence.
11. **Append-only intelligence.** AI generations and SourceClaims are immutable proposals.
    Accept/edit/reject creates append-only ClaimDisposition records. Conflicts and gaps have stable
    identities; human resolution/disposition records append revisions rather than overwriting the
    original evidence.
12. **Submission readiness snapshot.** Extend the artifact application boundary with a
    kind-specific submission guard. In the same transaction that freezes the S3 ReviewSnapshot,
    M3 locks the Requirement and related readiness rows, proves zero unresolved Blocking gaps and
    conflicts, validates every mandatory/conditional field, and stores an immutable
    RequirementReadinessSnapshot containing template/config versions and hashes. Approval rechecks
    that it points to the same S3 snapshot; asynchronous jobs cannot change an open review.
13. **AI provider-neutral workflow.** `@delivery-os/ai` owns versioned workflow and provider ports;
    application/domain packages see validated proposal DTOs only. Extraction uses bounded batches
    of application-selected normalized blocks, strict Zod output, deterministic merge/conflict
    logic, and recorded provider/model/prompt/schema/config provenance. Document instructions never
    become system instructions and model calls have no tools.
14. **Manual path is first-class.** Requirement creation, field editing, gap disposition, review,
    approval, citations, and baseline creation work with the AI workflow disabled or unavailable.
    Provider outage changes assistance state, never Requirement lifecycle correctness.
15. **At-least-once jobs with database truth.** BullMQ transports work, but PostgreSQL job/result
    rows and unique constraints decide whether effects are committed. Use job IDs/deduplication for
    load control plus transactionally claimed attempt rows for correctness. BullMQ explicitly
    recommends atomic idempotent jobs
    ([idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs),
    [deduplication](https://docs.bullmq.io/patterns/deduplication)).
16. **Safe projection.** Source reads, citations, downloads, search, AI context, notifications, and
    exports re-evaluate current workspace/project membership and the most restrictive source,
    Requirement, field, child, and target audience. Signed URLs are short-lived bearer capabilities
    and are issued only after authorization
    ([Cloudflare presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)).

### 2.4 Recorded founder decisions and remaining external gates

The following decisions are recorded:

1. **M3 owner:** `Nishanth with Codex`, synchronized in the roadmap summary and Section 7.
2. **Development and staging data:** synthetic/redacted fixtures only; no real
   client/project/user/document data or credentials in staging, tests, prompts, logs, screenshots,
   or evaluation fixtures.
3. **Workspace template administration in the pilot:** Admins may add optional fields/checks and
   tune only explicitly declared applicability switches. No arbitrary layout, formula, or
   executable template builder.
4. **AI scope:** live AI is enabled only for Requirement extraction and gap suggestions. Output is
   advisory and cannot approve, resolve conflicts, mark N/A/Accepted Risk, change audience, or
   create an approved baseline.
5. **AI providers:** the default is OpenAI `gpt-5.6-terra`; Anthropic
   `claude-sonnet-5` is allowed only for an explicitly selected evaluation or approved failover.
   There is no automatic cross-provider fallback. Vercel AI SDK adapters are libraries only; no
   Vercel AI Gateway, hosted prompt logging, provider aliases, automatic upgrades, or unapproved
   provider fallback is allowed.
6. **AI data handling:** provider/model ID, prompt/schema/parameter/timeout/retry versions and a
   configuration hash are immutable per workflow. Staging has no contractual residency guarantee
   and uses provider default commercial API processing. Application provenance is encrypted and
   retained for 30 days by default, configurable by App Admin down to disabled. Logs contain only
   IDs, hashes, costs, and safe metrics. OpenAI uses `store: false`; provider file storage,
   background mode, training/evaluation sharing, feedback sharing, fine-tuning, and partner
   programs are prohibited.
7. **AI subprocessors and budget:** approved processors are Railway, Cloudflare R2, OpenAI API,
   Anthropic API, Resend, and Sentry/OTel with content scrubbing. Staging AI is capped at USD
   100/month and USD 1/extraction, with alerts at USD 50 and USD 80 and a hard stop at USD 100.
   Individual Codex/Claude Code subscriptions are development tools, not backend credentials or
   application budget.
8. **AI authority:** Nishanth is primary credential and kill-switch owner; Delivery OS App Admin is
   secondary. OpenAI and Anthropic use separate scoped API projects/keys stored only as Railway
   secrets. Global and per-workflow kill switches fail closed to the manual path.
9. **OCR:** self-hosted PP-StructureV3 using PaddleOCR 3.7.0 and PaddlePaddle 3.3.1, English only,
   CPU only. One private Railway replica is limited to 4 vCPU, 8 GiB RAM, concurrency 1, 300 DPI,
   20 megapixels/page, and 30 seconds/page. It has no public domain, Internet egress, database,
   Redis, or R2 credentials. The exact reviewed model artifacts must be baked into the image and
   identified by a calculated SHA-256 manifest digest; `null`, `latest`, or an unverified digest is
   never promotable. Nishanth or an explicitly delegated App Admin promotes it; Codex supplies and
   independently reviews evidence but cannot self-approve.
10. **Synthetic staging infrastructure:** use only the existing Railway `staging` environment. Do
    not create or deploy production. If a mandatory environment is named `production`, keep
    `APP_ENV=staging` and document it as staging-only rather than treating its name as authority.
    Codex may provision private R2, backup, ClamAV, and OCR resources for synthetic staging.
11. **Storage:** private buckets are `delivery-os-staging-primary` and
    `delivery-os-staging-backup`, using R2 location hint `enam` without claiming a US
    jurisdictional guarantee. Credentials are separated into runtime, backup, and operational
    scopes; the application receives only runtime credentials. No `r2.dev` or public custom
    domain. Primary CORS allows only the deployed staging HTTPS origin, currently
    `https://web-staging-5e5c.up.railway.app`, methods GET/HEAD/PUT, required upload headers,
    and exposed ETag. Browser DELETE, wildcards, and backup-bucket CORS are prohibited.
12. **Backup:** daily PostgreSQL backup, daily object-manifest snapshot, copy newly committed
    immutable objects, 35-day snapshot retention, daily integrity sampling, and quarterly restore
    drill. Purge deletes manifest-listed backup objects at day 30 and verifies absence. RPO is at
    most 24 hours and RTO at most 8 hours. Nishanth is initial alert and primary credential owner;
    App Admin is secondary.
13. **Validation authority:** Codex may deploy an exact committed revision to synthetic-only
    staging and run restore/purge and twenty-job load/backpressure drills. Codex reviews security,
    privacy, and audience evidence. Nishanth is the accountable human reviewer and final go/no-go
    owner. No Critical/High security, tenancy, audience, upload, parser, credential, data-loss, or
    irreversible-AI finding may remain open.
14. **Historical secret:** treat the redacted historical finding as potentially active until
    Nishanth verifies revocation or rotates it. Track sanitized evidence in restricted private
    GitHub issue `SEC-2026-001 Historical secret finding`, labelled `security` and `confidential`;
    never copy the secret value.
15. **Release:** use branch `codex/m3-promotion-gates`, target `main`, and open a draft PR. Codex may
    commit, push, and deploy the exact PR commit to staging after required tests pass. Nishanth must
    approve and merge; Codex is not the sole approver. Keep M3 `Blocked` until every Section 16 gate
    passes.

### 2.5 Open implementation questions

- Obtain separate scoped OpenAI and Anthropic API keys without placing them in chat or source.
- Review the baked OCR candidate manifest/SBOM, accept the complete frozen corpus, and obtain
  Nishanth's promotion approval only after two accepted exact-image runs.
- Review and explicitly approve the latest non-destructive Railway staging plan before apply, and
  authenticate an approved Cloudflare session before private R2 provisioning.
- Verify or rotate the historical credential and close the restricted sanitized incident.
- A real-client corpus, regulated data, production environment, or contractual residency promise
  requires a new written decision.

These do not change the authorized implementation scope. They remain promotion or exit-gate
requirements, and the roadmap remains the only implementation-status authority.

## 3. Current-State Findings

### 3.1 Foundations to retain

| Foundation | Current location | M3 use |
| --- | --- | --- |
| Generic artifact lifecycle | `packages/domain/src/artifacts.ts`, `packages/database/src/artifact-store.ts` | Register `REQUIREMENT@1`; reuse revision, snapshot, approval, baseline, Delta, audience, comments, attachments, export |
| Artifact APIs/UI | artifact Route Handlers, `artifact-workspace.tsx`, `@delivery-os/ui` primitives | Compose Requirement-specific intake/editor panels around existing lifecycle |
| S3-compatible port | `packages/ingestion/src/storage.ts` | Extend for stream, copy, list, multipart, batch delete, and immutable put without leaking provider types |
| Storage dependencies | AWS SDK S3 and request presigner in workspace catalog | Retain versions unless the provider contract proves a defect |
| Local services | MinIO, ClamAV, disabled OCR service in `compose.yaml` | Activate through explicit S4 gates; preserve private/local parity |
| OCR boundary | `services/ocr` | Replace disabled recognition stub with pinned, baked PP-StructureV3 inference and schema tests |
| Transaction kernel | database stores, idempotency, audit, outbox | Reuse command envelope, safe 404, revision conflict, atomic audit/outbox |
| Worker/outbox | `apps/worker/src/main.ts`, BullMQ, processed events | Split typed queue processors while retaining outbox dispatch/deduplication |
| Authorization | M1/M2 workspace/project stores and S3 audience policy | Add source/intelligence policies; never infer authorization from a signed URL |
| Runtime safety | typed config and Pino redaction | Add storage/scanner/OCR/AI/retention groups and allowlisted logs |
| Test harness | Vitest, PostgreSQL helpers, migrations, Playwright/axe | Add provider/parser/OCR/evaluation/security fixtures |
| Deployment contracts | infrastructure, OCR evaluation, CI container scans | Implement the already accepted R2/MinIO/PaddleOCR/ClamAV boundaries |

### 3.2 Gaps

- The storage port cannot currently stream/get/copy/list, create multipart uploads, verify immutable
  puts, or reconcile manifests.
- No source/upload/object-manifest/retention schema or source authorization store exists.
- The worker has one generic outbox consumer and no scan/parse/OCR/extraction/purge queue processors.
- The OCR service reports readiness but intentionally returns `501` for recognition.
- No deterministic parser, locator, normalized-document, or citation contract exists.
- No Requirement artifact adapter or Sections A–H template registry exists.
- The artifact adapter has no submission-readiness hook.
- No claim, field-mapping, conflict, gap, disposition, generation, or quality-signal schema exists.
- `@delivery-os/ai` contains no provider/workflow contract.
- Runtime config does not yet validate storage, ClamAV, OCR, AI, retention, backup, or job limits.
- CI does not start MinIO/ClamAV/OCR or run storage/parser/OCR/evaluation contract suites.
- There is no source intake, progress, citation navigator, claim-review, conflict, gap, or template
  administration UI.

## 4. Requirements-to-Design Traceability

| Requirement | Design and evidence |
| --- | --- |
| FR-M3-01 | Format detector plus PDF/DOCX/Markdown/text parser contracts; searchable/scanned/DOCX-table/Markdown/text fixtures |
| FR-M3-02 | Transactional per-file 50 MB and retained-project 500 MB reservation; boundary, race, and release-on-failure tests |
| FR-M3-03 | IntakeSet joins multiple source generations; extraction input manifest/hash preserves every selected source |
| FR-M3-04 | Generated immutable keys, SourceArtifact/ObjectManifest, server-authorized read/download, retention/purge tests |
| FR-M3-04A | Quarantine, allowlist/signature/container validation, ClamAV, async states, retry/dead-letter/actionable errors |
| FR-M3-05 | `REQUIREMENT_TEMPLATE@1`, field mappings, strict extraction workflow, manual creation |
| FR-M3-06 | immutable claims/citations/generations, exact locator, observable support/agreement/schema/eval signals |
| FR-M3-07 | append-only claim accept/edit/reject commands and accessible inline review |
| FR-M3-08 | every field has a human-author command independent of a claim/provider |
| FR-M3-08A | first-class conflict rows; required-field conflict blocks submit until human resolution/note |
| FR-M3-09 | deterministic gap evaluator and stable gap records for missing/weak/conflicting/conditional fields |
| FR-M3-10 | AI/manual clarifying-question proposals, never automatically sent |
| FR-M3-11 | declarative applicability, human-only N/A/Accepted Risk, complete disposition details, zero Blocking submit guard |
| FR-M3-12–17 | completed S3 lifecycle plus M3 readiness snapshot and Requirement approval policy |
| FR-M3-18 | manual path E2E with provider disabled, unavailable, quota exhausted, invalid, and timed out |
| FR-CC-01–04 | transactional audit events and project export references with no confidential body in audit/log payload |
| FR-CC-07–08 | reuse S3 audience-safe comments/mentions on Requirement snapshots/baselines |
| FR-CC-12, NFR-10 | versioned system template plus controlled workspace extensions and immutable project snapshot |
| FR-CC-13–14 | audience-filtered Requirement export/source download and access-time re-authorization |
| FR-CC-15, NFR-11 | recoverable deletion, manifest-complete purge, backup aging, receipt, restore drill |
| FR-CC-16, NFR-12 | expected revisions and idempotency on source/template/claim/conflict/gap/Requirement mutations |
| FR-CC-17 | durable job rows, BullMQ retry/dedupe/cancel/dead-letter, progress and actionable failure |
| NFR-02, NFR-14 | async heavy work, 20 concurrent document-job load profile, bounded resources |
| NFR-04–07 | encryption/private storage, tenant/audience/IDOR tests, audit, WCAG 2.2 AA |
| NFR-09 | strict AI schema/provenance/citations/evaluation/human gate/manual fallback |
| NFR-13 | correlated safe logs, metrics, traces, audit/outbox without source/prompt/OCR bodies |

The Section 7 exit gate additionally requires S3–S5 acceptance, adversarial/evaluation thresholds,
and an approved Requirement baseline from every supported format. Section 15 maps those proofs.

## 5. Architecture and Domain Design

### 5.1 Source storage and upload

`SourceArtifact` is the user-facing logical source. `SourceGeneration` is immutable bytes.
`UploadSession` is a short-lived capability reservation. `ObjectManifest` records every managed
object. `IntakeSet` freezes the ordered source generations used for extraction.

Upload flow:

1. Authorize current actor against workspace/project role and proposed audience.
2. Normalize the display filename; validate allowed extension and declared media type.
3. Lock the project quota row, reserve declared bytes, create SourceArtifact/Generation/UploadSession
   and quarantine manifest, audit, and outbox in one transaction.
4. Return a short-expiry single-use application session plus presigned PUT for the exact generated
   key/content type/checksum. The URL is never logged or stored in analytics.
5. Completion locks the session, heads and streams the object, verifies length/full SHA-256,
   consumes the reservation, and enqueues scan exactly once. Reuse returns the prior result;
   mismatched reuse returns `IDEMPOTENCY_KEY_REUSED`.
6. Scanner validates magic/container/encryption and ClamAV result. Invalid/infected content becomes
   `FAILED`, is never downloadable, and is scheduled for quarantine deletion.
7. Clean content is copied to a new `sources/` key, re-verified, manifested, then the quarantine
   object is deleted/verified. Processing begins only after the source manifest is `AVAILABLE`.

R2 support is rechecked against its current
[S3 compatibility table](https://developers.cloudflare.com/r2/api/s3/api/). In particular, the
application does not equate multipart ETag with a content hash and independently verifies SHA-256.

### 5.2 Deterministic normalization

Each parser returns ordered blocks using one DTO:

```ts
type NormalizedBlockDraft = {
  ordinal: number;
  kind: 'HEADING' | 'PARAGRAPH' | 'LIST_ITEM' | 'TABLE_CELL';
  text: string;
  locator:
    | { format: 'PDF'; page: number; polygon: number[]; textItemRange?: [number, number] }
    | { format: 'DOCX'; headingPath: string[]; paragraph?: number; table?: number; row?: number; cell?: number }
    | { format: 'MARKDOWN'; headingPath: string[]; startLine: number; endLine: number }
    | { format: 'TEXT'; startLine: number; endLine: number };
  extraction: 'EMBEDDED_TEXT' | 'OCR';
  confidence?: string;
};
```

- Normalize Unicode to NFC, line endings to LF, strip only non-semantic control characters, and
  retain original source bytes for visual comparison.
- Preserve ordered table cells; do not flatten a table without row/cell locators.
- Treat Markdown as text structure; never render source HTML as trusted HTML.
- Reject DOCX DTDs/external relationships, path traversal, unsupported compression, excessive
  entries, compression ratio, or expanded bytes.
- Reject encrypted/malformed PDFs. Mixed PDFs combine embedded blocks and OCR blocks in original
  page order.
- Persist a new immutable NormalizedDocument for any parser/renderer/OCR config change. Never
  update blocks in place.

### 5.3 OCR boundary

- Worker renders only required PDF pages at a configured bounded DPI and strips metadata.
- Request includes schema version, source/page hashes, page numbers, renderer/config version, and
  bounded image bytes; never an object URL.
- Private bearer credential authenticates worker to OCR service. The OCR service has no
  database/Redis/R2 credentials or public route.
- PP-StructureV3 code/models/fonts are baked and checksum/digest pinned; readiness is false until
  models load. Runtime network downloads and egress are denied.
- Response Zod/Pydantic schemas require page, polygon, text, confidence, reading order,
  structure/table coordinates, model/config version, and input hash.
- Dedupe key is source generation SHA-256 + page + renderer version + OCR config/model digest.
- Timeout, malformed response, hash mismatch, low confidence, crash, and exhaustion produce
  `NEEDS_ATTENTION`; partial OCR never silently becomes accepted evidence.
- Promotion uses the frozen gates in
  [OCR Evaluation](../research/ocr-evaluation.md#6-promotion-gates). Current PP-StructureV3
  documentation confirms structured layout/table/reading-order outputs and service deployment
  ([official usage](https://www.paddleocr.ai/main/en/version3.x/pipeline_usage/PP-StructureV3.html)).

### 5.4 Requirement template registry and extension boundary

`RequirementTemplateDefinition` is code-owned and versioned. Each field defines:

- stable key, section, order, label/description/help;
- value shape (`short_text`, `long_text`, `string_list`, `structured_list`, `date`, `enum`);
- system mandatory/optional status;
- applicability rule and which operands an Admin may tune;
- whether Accepted Risk is permitted; and
- citation expectations and gap strength threshold.

`WorkspaceTemplateVersion` stores only validated additions/overrides against a system base version.
Publishing is Admin-only, expected-revision/idempotency protected, and audited. `ProjectTemplateSnapshot`
freezes the merged definition and SHA-256 when the Requirement is created. Upgrading an active
project is an explicit PM command that creates a new Requirement draft/Delta with a migration
preview; it never rewrites an open review or baseline.

### 5.5 Requirement artifact adapter

Register one production adapter:

```ts
{
  kind: 'REQUIREMENT',
  schemaVersion: '1',
  policyVersion: '1',
  approvalPolicy: [
    { key: 'pm', role: 'PM', scope: 'INTERNAL', required: true },
    // Added only for external projects:
    { key: 'client', role: 'CLIENT_STAKEHOLDER', scope: 'EXTERNAL_BINDING', required: true }
  ]
}
```

The body uses stable field keys rather than display labels. It normalizes values and ordered lists,
projects field/child audience before reads/diffs/exports, and supplies field-aware semantic diffs.
Only a current approved Requirement baseline is returned by authoritative-context queries.

S3's registry must gain a backward-compatible submission-guard extension. Generic S3 tests prove an
adapter without a guard behaves unchanged; `REQUIREMENT@1` requires an M3 guard result.

### 5.6 Claims, citations, conflicts, gaps, and readiness

- `Citation` references one or more immutable NormalizedBlocks and retains a deterministic locator
  excerpt hash, never a mutable free-text URL.
- `SourceClaim` stores proposed normalized assertion, target field, citation IDs, generation ID,
  support/quality signals, and immutable provenance.
- `ClaimDisposition` records `ACCEPTED | EDITED | REJECTED`, actor, time, note, material-edit
  classification, and resulting field revision. Editing never changes the proposal.
- `FieldMapping` links the current draft field revision to human/source/claim/citation evidence.
- `SourceConflict` links all competing claim IDs, affected field, severity, and status.
  `ConflictResolution` records selected claim or authored value, resolver, required note, and time.
- `Gap` has stable template/field/reason identity. A deterministic evaluator creates or carries
  forward missing, weak-support, conflict, and conditional gaps.
- `GapDisposition` is append-only. `NOT_APPLICABLE` requires justification;
  `ACCEPTED_RISK` requires owner, rationale, consequence, and review date; `RESOLVED` requires the
  canonical field revision/evidence.
- AI can propose claims, conflicts, gaps, and questions. It cannot create human disposition rows.
- Submission locks the Requirement artifact, template snapshot, current field mappings, conflicts,
  and gaps in one consistent lock order. A database constraint/reference ensures the frozen
  readiness record and S3 ReviewSnapshot share the same artifact/draft/hash.

### 5.7 AI workflow

`AiWorkflow<I,O>` remains provider-neutral. M3 adds:

- immutable prompt/schema/workflow definitions;
- environment-specific evaluated workflow configurations;
- generation jobs/attempts with input manifest/hash, output hash, usage/cost, safe failures;
- strict proposal schema and unknown-field rejection;
- source-selection manifest proving only authorized blocks entered the request;
- deterministic proposal merge keyed by template field and cited block IDs;
- schema/support/agreement/evaluation-derived quality labels, never model self-confidence; and
- a kill switch that disables assistance without disabling manual editing/review.

Provider calls receive delimited content blocks and no tools or storage URLs. Retry only
transport/rate-limit/transient failures. Schema, safety, quota, and unusable-output failures are
actionable and never reported as successful extraction.

### 5.8 Authorization and safe-not-found

All commands/queries:

- resolve current active workspace/project membership server-side;
- scope every lookup by workspace, project, and parent IDs;
- apply action role, source/Requirement/child audience, state, and retention checks;
- return the same 404 for missing, foreign-workspace, foreign-project, and unauthorized IDs;
- prevent Client Stakeholders from seeing Team-only source names, counts, blocks, claims,
  conflicts, gaps, citations, AI context, notifications, search, exports, or signed URLs; and
- re-authorize at download issuance, job execution, AI input assembly, notification delivery, and
  export materialization time.

## 6. Data Model, Indexes, Constraints, and Retention

### 6.1 New tables

| Family | Tables |
| --- | --- |
| Storage | `source_artifacts`, `source_generations`, `source_upload_sessions`, `source_quota_reservations`, `object_manifests`, `source_purge_receipts` |
| Intake/jobs | `intake_sets`, `intake_set_sources`, `document_jobs`, `document_job_attempts` |
| Normalization | `normalized_documents`, `normalized_blocks`, `source_locators`, `ocr_page_results` |
| Templates | `workspace_requirement_template_versions`, `project_requirement_template_snapshots` |
| Requirement | `requirement_field_revisions`, `requirement_readiness_snapshots` |
| Intelligence | `ai_workflow_definitions`, `ai_workflow_configurations`, `ai_generations`, `source_claims`, `claim_citations`, `claim_dispositions`, `requirement_field_mappings`, `source_conflicts`, `conflict_claims`, `conflict_resolutions`, `requirement_gaps`, `gap_dispositions`, `clarifying_questions` |

All tenant-owned tables contain non-null workspace ID; project-owned tables contain project ID.
Composite foreign keys preserve workspace/project/parent scope.

### 6.2 Required indexes and constraints

- Unique one Requirement artifact per project: partial unique
  `(workspace_id, project_id, kind_key)` for `REQUIREMENT`.
- Unique active upload session per source generation; unique immutable object key; unique
  `(source_generation_id, purpose, replica)` manifest.
- Checks: declared/actual bytes `> 0 AND <= 52428800`; project reserved+retained enforced under a
  locked quota row and invariant tests; SHA-256 exactly 32-byte/64-hex representation at contracts.
- Unique normalized document on
  `(source_generation_id, parser_version, renderer_version, ocr_config_version)`.
- Unique block `(normalized_document_id, block_key)` and ordinal.
- Unique OCR page result on the complete page/config dedupe key.
- Unique published workspace template version number and hash; immutable triggers for published
  template/project snapshots.
- Unique current field mapping per Requirement draft/field key; field revision is monotonic.
- Unique claim per generation/output ordinal; citations require same workspace/project/source set.
- Unique open conflict per Requirement draft/field/conflict fingerprint.
- Unique current gap per Requirement draft/template field/reason fingerprint.
- Unique human disposition command through workspace idempotency; revision checks prevent stale
  conflict/gap/field overwrites.
- Unique readiness snapshot per S3 ReviewSnapshot; immutable trigger after insert.
- Job dedupe unique on `(job_type, input_hash, config_version)` within the authorized aggregate;
  attempts append monotonically.
- Partial worker indexes for queued/retry/dead-letter jobs, expiring upload sessions, recoverable
  sources, due purges, and pending backup manifests.
- Client-list/search indexes include workspace/project/audience/state before searchable metadata.
  Source body/block text is not added to global search.

### 6.3 Migration and forward-fix

- Use additive checked-in Drizzle migrations. Create types/tables/indexes/constraints first; add
  triggers after tables; register `REQUIREMENT@1` only after the migration is compatible.
- Test migration from empty, W0, W1, M2, and S3-complete schemas. No existing production rows are
  backfilled and no real data is used.
- Before staging/production migration, back up PostgreSQL and manifest state and verify restore in
  an isolated database/bucket.
- Do not down-migrate after source/Requirement rows exist. Recovery is application rollback to code
  that ignores additive tables, queue pause, and a forward-fix migration. Never delete source,
  normalized, claim, snapshot, or baseline evidence to roll back an application defect.
- If a parser/model/config is withdrawn, disable it for new jobs and retain historical readers and
  provenance.

### 6.4 Retention

- Expired incomplete upload sessions release quota and delete quarantine objects.
- Failed/infected quarantine objects are inaccessible and deleted after the incident-evidence
  window set by security operations; receipts retain no content.
- Available live sources remain while the project remains active.
- Authorized deletion moves SourceArtifact to recoverable state for 30 days and denies all reads,
  downloads, AI use, and new processing. Recovery restores manifest access without changing bytes.
- Purge enumerates and deletes every primary/backup manifest key, verifies absence, deletes active
  derived content according to FK order, and retains only a non-content receipt/audit reference.
- Backup copies age out on the documented schedule; manifest divergence is an alert, not silently
  repaired without audit.
- Approved Requirement baselines and their minimum citation/provenance audit references follow the
  project/workspace retention policy; purging source bodies must not leave a UI claiming a
  navigable citation still exists.

## 7. API and Contract Design

### 7.1 Contract files

Add versioned Zod contracts for:

- upload session create/complete/cancel and upload status;
- source list/read/download/delete/recover/retry;
- normalized document/block/citation reads;
- template draft/publish/snapshot/preview;
- Requirement field mutation and manual entry;
- claim disposition, conflict resolution, gap disposition, question mutation;
- extraction start/cancel/retry/progress and provenance;
- readiness evaluation/submission result; and
- worker job/event payloads.

Every mutation carries `schemaVersion`, workspace/project/aggregate IDs, actor, expected revision,
idempotency key, and correlation ID. URLs are returned only in dedicated no-store responses and are
not persisted in general DTOs.

### 7.2 Error taxonomy

Reuse existing stable codes and add only safe, actionable codes:

- `UPLOAD_SESSION_EXPIRED`
- `UPLOAD_INCOMPLETE`
- `CHECKSUM_MISMATCH`
- `UNSUPPORTED_MEDIA_TYPE`
- `ENCRYPTED_DOCUMENT`
- `MALWARE_DETECTED`
- `SOURCE_NOT_AVAILABLE`
- `PARSER_FAILED`
- `OCR_NEEDS_ATTENTION`
- `AI_WORKFLOW_UNAVAILABLE`
- `AI_OUTPUT_INVALID`
- `CONFLICT_UNRESOLVED`
- `BLOCKING_GAPS`
- `TEMPLATE_VERSION_CONFLICT`
- `RETENTION_STATE_CONFLICT`

Provider/parser/scanner internals, object keys, source text, and tenant existence never appear in
safe messages. `REVISION_CONFLICT` returns current revision plus a safe refetch hint. Foreign or
unauthorized IDs use `NOT_FOUND`, including nested citation/block/download routes.

### 7.3 Audit and outbox events

Write domain mutation, audit event, outbox event, idempotency result, and quota/result rows in one
transaction. Versioned events include IDs/hashes/config versions and safe summaries only:

- `source.upload-session-created.v1`
- `source.upload-completed.v1`
- `source.scan-requested|completed|failed.v1`
- `source.parse-requested|completed|failed.v1`
- `source.ocr-requested|completed|needs-attention.v1`
- `source.available|deleted|recovered|purged.v1`
- `source.backup-requested|verified|failed.v1`
- `requirement.template-published|snapshotted.v1`
- `requirement.extraction-requested|completed|failed.v1`
- `requirement.claim-dispositioned.v1`
- `requirement.conflict-resolved.v1`
- `requirement.gap-dispositioned.v1`
- `requirement.readiness-snapshotted.v1`

Events never contain file names for client-invisible sources, source/OCR text, claims, prompts,
provider responses, signed URLs, or object keys.

## 8. State Machines and Authorized Transitions

### 8.1 Upload/source

```text
UploadSession: OPEN → COMPLETED
                   ↘ CANCELLED | EXPIRED | FAILED

SourceArtifact: QUEUED → SCANNING → PROCESSING → SUCCEEDED
                   │          │          └→ NEEDS_ATTENTION ↔ PROCESSING
                   │          └→ FAILED
                   └→ FAILED

Retention: ACTIVE → RECOVERABLE → ACTIVE
                         └→ PURGING → PURGED
```

- Create/upload/complete: PM, Lead, permitted Contributor, Client Stakeholder.
- Retry/cancel processing: PM/Lead; uploader may cancel before a committed normalized result.
- Restrict client-upload audience: PM, audited.
- Delete/recover source: PM; workspace/project destructive-policy checks apply.
- Purge: system worker only after due time and an authorized retained deletion command.

### 8.2 Jobs

```text
QUEUED → RUNNING → SUCCEEDED
   │         ├→ RETRY_WAIT → RUNNING
   │         ├→ NEEDS_ATTENTION → QUEUED
   │         └→ DEAD_LETTER
   └→ CANCELLED (only before committed result)
```

Workers claim attempts transactionally. Cancellation is cooperative; once an immutable normalized
result/claim generation is committed, cancellation cannot erase it.

### 8.3 Claims/conflicts/gaps

```text
Claim: PROPOSED → ACCEPTED | EDITED | REJECTED
Conflict: OPEN → RESOLVED
Gap: BLOCKING → RESOLVED | NOT_APPLICABLE | ACCEPTED_RISK
                 ↑                (new evidence/rule may reopen a new gap revision)
Question: PROPOSED → EDITED | DISMISSED | READY_TO_COPY
```

- PM/Lead and explicitly granted Contributor may edit fields and disposition claims.
- Only PM may resolve an approval-blocking conflict, mark N/A, or accept risk; any future delegated
  policy must be a normative change.
- AI creates proposals only.
- Client Stakeholders may comment on visible Requirement/source evidence but cannot disposition
  internal claims/gaps.

### 8.4 Requirement review/approval

Reuse S3:

```text
DRAFT → IN_REVIEW → APPROVED
           └→ CHANGES_REQUESTED → DRAFT
           └→ REJECTED/CANCELLED → DRAFT
```

The new submit guard requires a frozen template, zero unresolved Blocking gaps/conflicts, and a
matching readiness snapshot. PM is the internal approval slot. External projects additionally use
the existing first-binding Client Stakeholder slot. Negative decisions require a human comment.
Resubmission creates a new S3 snapshot and a new RequirementReadinessSnapshot.

## 9. Worker, Queue, Retry, and Idempotency Design

Use separate BullMQ queues:

- `ingestion.scan`
- `ingestion.parse`
- `ingestion.ocr`
- `ai.extract`
- `retention.backup`
- `retention.purge`
- existing `exports.render`, `notifications.send`, and `outbox.dispatch`

Boundaries:

- Web writes an outbox request; dispatcher adds a deterministic queue job.
- Queue payload contains IDs/hashes only. Worker loads authorized current state from PostgreSQL.
- Scan streams quarantine bytes once to SHA-256, format validators, and ClamAV with byte/time caps.
- Parse and OCR commit immutable results with unique constraints. Duplicate/replayed jobs return the
  existing result after hash verification.
- Extraction pins the IntakeSet, template, workflow, prompt/schema, and source-block manifest
  hashes. Retry cannot replace a successful generation.
- Retry transient network/provider/429/5xx/timeouts with bounded exponential backoff and jitter.
  Malware, unsupported/encrypted/corrupt input, schema-invalid AI output, and policy failures are
  terminal or Needs Attention.
- Dead letters retain safe codes/IDs and support an audited PM/operations retry after the clearing
  condition changes.
- Queue concurrency is separately bounded for scan, parsing, OCR, and AI. Global pilot acceptance
  exercises 20 concurrent document jobs without exceeding OCR memory/latency limits.

## 10. UI Architecture

### 10.1 Routes and composition

Add a Requirement workspace under the project route, composed from S3 artifact controls:

- Sources: upload/drop zone plus keyboard file picker, quota meter, processing list, safe errors,
  retry/cancel/delete/recover, and authorized download.
- Requirement: Sections A–H navigation, structured field editor, save/conflict state, source support
  indicator, and manual-entry path.
- Review claims: proposed/accepted/edited/rejected filters and source comparison.
- Conflicts: competing cited claims side-by-side, authored-value option, required resolution note.
- Gaps to Close: Blocking/weak/conditional list, clarifying question, N/A/Accepted Risk dialogs.
- Review readiness: deterministic checklist and links to the exact blocking field/conflict/gap.
- Review/baseline: reuse S3 approval, history, diff, comments, attachments, audience, and exports.
- Template administration: system baseline preview, optional extension fields, allowed applicability
  controls, version diff, publish confirmation, and affected-project statement.

### 10.2 Citation experience

- Citation activation opens an authorized source preview at PDF page/region, DOCX heading/paragraph
  or table cell, or Markdown/text line range.
- Preserve the user's return focus and provide “previous/next citation.”
- OCR blocks visibly identify OCR and quality/Needs Attention state.
- A missing/purged source shows a truthful unavailable state and immutable locator metadata; it
  never silently falls back to unrelated text.
- Team-only source/claim existence is absent—not merely disabled—in client projections.

### 10.3 Accessibility and responsive behavior

- Native file input remains available; drag/drop is optional enhancement with a keyboard
  alternative.
- Processing changes use polite live regions; failures and readiness blockers receive programmatic
  summaries without stealing focus repeatedly.
- Claim cards, conflicts, gaps, and citations are operable by keyboard; no drag-only ordering.
- Dialogs restore focus, label consequences, and require explicit confirmation for N/A, Accepted
  Risk, delete, purge request, conflict resolution, and approval.
- Diff/provenance uses text/icons in addition to color and includes a linear screen-reader view.
- At 320 CSS px, source/template/field panels stack; sticky controls do not obscure focus. At 200%
  zoom, no two-dimensional scrolling is required except bounded source tables with an accessible
  alternative.
- Test desktop/mobile Chromium, reduced motion, high contrast, logical heading order, error
  association, focus visibility, and screen-reader announcement scripts.

## 11. Observability, Audit, Privacy, and Security

### 11.1 Safe telemetry

Allowlisted fields: correlation/event/job/source IDs, non-secret config versions/hashes, state,
attempt, duration, byte/page/block counts, queue age, error code, and aggregate quality metrics.

Never log or send to general telemetry:

- source filename when its audience is not known safe;
- source, normalized, OCR, claim, Requirement, prompt, or provider-response text;
- signed URLs, object keys, access credentials, authorization headers, cookies, or session data;
- Team-only counts/content in a client-scoped trace.

### 11.2 Metrics and alerts

- upload session expiry/completion/hash mismatch and quota rejection;
- scan latency/infected/error/signature freshness;
- parse/OCR queue age, attempts, dead letters, page latency, confidence, saturation, memory;
- normalized block counts/config versions and replay rate;
- extraction latency/schema failure/quota/cost/disabled state;
- citation validity, accepted-claim precision, unsupported claims, conflict recall, material rewrite;
- unresolved Blocking gap age and time-to-approved Requirement;
- R2 primary/backup manifest divergence, purge lag, restore failures;
- authorization denials and cross-workspace/audience canary failures.

### 11.3 Security tests

- CSRF on upload completion and all cookie-authenticated mutations.
- IDOR/cross-workspace/cross-project IDs for every source/intelligence family.
- Team-only leakage through list count, pagination, search, citation, download, AI input,
  notifications, audit summaries, export, errors, and timing-safe not-found behavior.
- Double extension, NUL/Unicode filename, MIME spoof, polyglot, corrupt/encrypted PDF, DOCX traversal,
  XML entity, archive bomb, oversized/decompression bomb, malware fixture, repeated upload URL, and
  checksum mismatch.
- Parser/OCR resource exhaustion, malformed response, wrong input hash, prompt injection, hidden
  instructions, unsupported output fields, exfiltration/cross-tenant references, and generated URL.
- Signed URL expiry/key/operation/header tampering and CORS allowlist.
- Purge completeness across primary/backup manifests and non-content receipt.

## 12. Affected Files and Modules

Exact names may be refined during Slice A discovery, but boundaries must remain:

### 12.1 Create

- `docs/planning/w3-m3-requirement-intake-template-engine.md` — this plan only.
- `docs/validation/w3-m3-requirement-intake-template-engine.md` — create only during validation.
- `packages/contracts/src/ingestion.ts`, `requirements.ts` and tests.
- `packages/domain/src/ingestion.ts`, `requirements.ts` and tests.
- `packages/application/src/ingestion.ts`, `requirements.ts` and tests.
- `packages/database/src/ingestion-store.ts`, `requirement-store.ts`.
- New Drizzle migration and metadata snapshot after the current S3 migration.
- `packages/ingestion/src/detection.ts`, `clamav.ts`, `parsers/*`, `normalization.ts`, `ocr.ts`
  and contract/fixture tests.
- `packages/ai/src/workflows.ts`, `requirement-extraction.ts`, provider fake and tests.
- Typed worker processors/configuration under `apps/worker/src/ingestion/`,
  `apps/worker/src/ai/`, and `apps/worker/src/retention/`.
- Requirement/source same-origin Route Handlers under the existing workspace/project API hierarchy.
- Requirement project page and focused client components under
  `apps/web/app/workspaces/[workspaceId]/projects/[projectId]/requirements/`.
- Reusable source, citation, claim, conflict, gap, readiness, provenance, progress, and template
  components/tests in `packages/ui`.
- Synthetic parser/OCR/evaluation/security fixtures under `tests/fixtures/m3/`.
- M3 integration, migration, E2E, accessibility, load, adversarial, and evaluation tests.
- OCR service inference modules/tests plus pinned model manifest/SBOM/checksum inputs.
- Storage/ingestion/AI/retention operational runbooks if no current runbook file owns them.

### 12.2 Modify

- Package exports and exact dependencies in relevant `package.json`, catalog, and lockfile.
- `packages/domain/src/artifacts.ts` for the backward-compatible submission guard and Requirement
  registration composition.
- `packages/application/src/artifacts.ts` and `packages/database/src/artifact-store.ts` only where
  needed to atomically invoke/store Requirement readiness; retain generic behavior.
- `packages/database/src/schema.ts` and index exports.
- `packages/ingestion/src/storage.ts` to complete the supported immutable S3 subset.
- `apps/worker/src/main.ts` to compose typed processors without one monolithic handler.
- Web API helpers/navigation/project surfaces and `@delivery-os/ui` exports.
- `services/ocr/Dockerfile`, `requirements.txt`, `app.py`/module split, `railway.json`, README.
- `compose.yaml`, `.env.example`, web/worker/OCR Dockerfiles, typed observability config, CI workflow,
  and dependency/boundary checks.
- `docs/deployment/infrastructure.md` and component/subprocessor records only if implementation
  discovers a provider/version/config fact not already normative.
- `docs/planning/implementation-roadmap.md`: only after owner+authorization, synchronize summary and
  Section 7 to `In Progress` in the same change that starts Slice A; later use governed validation
  transitions.

### 12.3 Verify, do not casually modify

- S3 migration/schema/store/domain/contracts and validation record.
- M1/M2 workspace/project authorization and safe-not-found behavior.
- Existing artifact APIs, browser acceptance, export storage forward-fix, audit/outbox tables.
- `docs/core/*`, pilot scope, AI/security, OCR evaluation, and technology decisions. A conflict
  requires changing the earliest authority and an ADR/decision entry, not an implementation-only
  workaround.
- `apps/web/next-env.d.ts`; preserve the unrelated staged change.

## 13. Testing and Validation Strategy

### 13.1 Unit/property

- filename/type/container validators, quota arithmetic, state machines, authorization/audience;
- template merge/applicability/mandatory-control preservation and snapshot hash;
- line/heading/table locators and deterministic block keys;
- claim/conflict/gap fingerprints and disposition/readiness policies;
- provider output validation/merge, support signals, prompt delimiting, manual fallback;
- retry classification, job dedupe, redaction, error mapping.

Property tests vary input ordering, Unicode, retries, duplicate sources, concurrent quota
reservations, block ordering, and malicious IDs.

### 13.2 Integration/contract/migration

- Real PostgreSQL commands, locks, idempotency, audit/outbox, revisions, readiness/S3 atomicity.
- MinIO with versioning disabled and R2 staging contract for put/head/get/range/copy/delete/list,
  checksum behavior, presigning, CORS, and multipart adapter support.
- ClamAV clean/EICAR/timeout/unavailable/oversize streams.
- PDF/DOCX/Markdown/text parser fixtures and retry identity.
- OCR authenticated schema, wrong hash, low confidence, malformed/timeouts, deterministic replay.
- AI fake and selected-provider schema/error/retention adapter tests with synthetic input.
- Empty/W0/W1/M2/S3 migration paths and backup/restore.

### 13.3 Authorization/adversarial

Cover every API/store query with foreign workspace/project/source/block/claim/conflict/gap/template
IDs and client Team-only filtering. Add upload/parser/OCR/prompt-injection and export/notification
leak tests described in Section 11.3.

### 13.4 Component/E2E/accessibility

- upload → scan → parse/OCR → source available;
- multi-source extraction → accept/edit/reject → conflict/gap closure → submit → approve baseline;
- fully manual Requirement with AI disabled/outage;
- reject/changes requested → edit/resubmit new readiness/S3 snapshot;
- stale field/conflict/gap editors receive conflict;
- Client Stakeholder upload, restricted Team-only evidence, first-binding approval;
- desktop/mobile keyboard, focus restoration, live progress, citation navigation, 200%/320px reflow,
  reduced motion, and zero automated axe violations.

### 13.5 Evaluation and staging

- Frozen `extraction-core`, `extraction-adversarial`, `gaps-core`, and `security-redteam` datasets use
  synthetic/redacted data with versioned gold annotations.
- Pass all AI thresholds in the assurance spec twice consecutively for the exact
  provider/model/prompt/schema/config hashes.
- Pass OCR promotion gates for exact image/model/config digest and resource class.
- In isolated staging, back up/restore first, migrate, deploy private ClamAV/OCR, pause queues,
  deploy worker/web, run synthetic flows for every format, resume gradually, inspect logs/metrics/
  dead letters/manifests, and verify no source or Team-only content appears in telemetry.
- Production/client data is prohibited from fixtures, source control, local validation, preview,
  or general logs.

## 14. Exact Validation Commands

Commands use current repository scripts unless marked as scripts that Slice A must add.

```bash
# Working-tree and gate checks
git status --short
git diff --cached -- apps/web/next-env.d.ts
rg -n -C 3 'Shared Artifact Kernel|M3 Requirement Intake' docs/planning/implementation-roadmap.md

# Local dependencies and migrations
docker compose up -d postgres redis minio minio-init mailpit clamav
docker compose --profile ocr up -d ocr
pnpm db:migrate
pnpm test:migrations

# Focused suites (paths created by M3)
pnpm exec vitest run packages/domain/src/ingestion.test.ts packages/domain/src/requirements.test.ts
pnpm exec vitest run packages/contracts/src/ingestion.test.ts packages/contracts/src/requirements.test.ts
pnpm exec vitest run packages/ingestion/src
pnpm exec vitest run packages/ai/src
pnpm exec vitest run tests/integration/m3-requirement-intake.test.ts
pnpm exec vitest run tests/security/m3-ingestion-adversarial.test.ts
pnpm exec playwright test tests/e2e/m3-requirement-intake.spec.ts --project=chromium
pnpm exec playwright test tests/e2e/m3-requirement-intake.spec.ts --project=mobile-chromium

# OCR service suite and deterministic evaluation (scripts must be added in Slice A)
pnpm test:ocr
pnpm eval:ocr
pnpm eval:requirements -- --run=1
pnpm eval:requirements -- --run=2

# Full repository gates
pnpm format:check
pnpm lint
pnpm typecheck
pnpm check:dependencies
pnpm check:docs
pnpm test:coverage
pnpm test:migrations
pnpm build
pnpm test:e2e
pnpm check
git diff --check

# Images and security gates, matching CI
docker build -f Dockerfile.web -t delivery-os-web:m3 .
docker build -f Dockerfile.worker -t delivery-os-worker:m3 .
docker build -f services/ocr/Dockerfile -t delivery-os-ocr:m3 services/ocr
trivy image --severity CRITICAL,HIGH --ignore-unfixed --exit-code 1 delivery-os-web:m3
trivy image --severity CRITICAL,HIGH --ignore-unfixed --exit-code 1 delivery-os-worker:m3
trivy image --severity CRITICAL,HIGH --ignore-unfixed --exit-code 1 delivery-os-ocr:m3
gitleaks detect --source . --no-banner
pnpm audit --prod --audit-level high
```

Staging commands must be recorded with exact environment/service/deployment IDs in the validation
record. Never paste secrets, signed URLs, source bodies, provider prompts/responses, or real data
into commands/evidence.

## 15. Ordered Implementation Slices

Each slice is small, reviewable, and has an independent stop point.

1. **Slice A — governed start and contracts.** Reverify S3 evidence and assigned M3 owner; record
   founder decisions; synchronize roadmap summary/Section 7 to `In Progress`; add traceability,
   contract/domain skeletons, Requirement/template registry interfaces, safe errors, and focused
   tests. Verify format/lint/type/contract tests. No provider call.
2. **Slice B — storage manifests and upload session.** Add additive schema/migration, quota lock,
   upload create/complete/cancel, extended storage fake/MinIO contract, immutable keys, audit/outbox,
   safe APIs, and IDOR tests. Verify migrations and clean upload/hash/quota races.
3. **Slice C — validation, scan, promotion, retention.** Add signature/container checks, ClamAV,
   quarantine promotion, authorized download, delete/recover/purge/receipt and backup manifests.
   Verify malicious/spoofed/encrypted/oversized/duplicate/purge/restore cases.
4. **Slice D — deterministic parsers.** Add reviewed pinned parser dependencies and PDF/DOCX/
   Markdown/text normalization with locators/immutable replay. Verify every deterministic fixture,
   malformed/resource limits, and no duplicate/replaced blocks.
5. **Slice E — OCR boundary.** Implement page classification/rendering, private authenticated
   PP-StructureV3 service, response validation, dedupe/failures, pinned image/model/SBOM, and frozen
   OCR evaluations. Stop if any promotion threshold fails.
6. **Slice F — template engine and Requirement adapter.** Implement Sections A–H definitions,
   controlled workspace extension publish/project snapshot, `REQUIREMENT@1`, structured editor,
   semantic diff/audience projection, and manual authoring. Verify mandatory controls cannot be
   removed and existing projects do not change retroactively.
7. **Slice G — claims, citations, conflicts, gaps.** Add append-only intelligence records,
   human dispositions, deterministic gap evaluator, citation navigation, conflict/gap UI, and
   readiness policy. Verify AI cannot make human-only transitions.
8. **Slice H — AI workflow.** After provider decision, add provider adapter/config, strict
   extraction/question proposals, provenance/quality UI, retries/kill switch/manual fallback, and
   frozen evaluations. Stop if two consecutive runs do not pass.
9. **Slice I — S3 readiness and approval integration.** Atomically bind readiness snapshot to S3
   review, use PM/external policy, block drafts/in-review authoritative context, and prove reject/
   resubmit/new-snapshot behavior and first-binding decision regression.
10. **Slice J — complete UI/E2E/operations.** Finish responsive intake/progress/retry/source
    preview/claim/gap/readiness flows, queue dashboards/alerts/runbooks, end-to-end/a11y/load/security
    checks, and no-content logs.
11. **Slice K — staging validation.** Back up/restore isolated staging, migrate, deploy exact images,
    run every-format synthetic journeys and adversarial checks, inspect manifests/queues/logs/
    metrics, and record exact evidence.
12. **Slice L — exit-gate assessment.** Create the M3 validation record; synchronize roadmap to
    `In Validation`; assess every criterion below. Set `Complete` only if all pass. Otherwise set
    `Blocked` with owner, opened date, clearing condition, and stable issue/decision link. Do not
    begin M4.

## 16. Acceptance Criteria and Exit Gate

### 16.1 Required scenario acceptance

1. Searchable PDF, scanned PDF, DOCX table, Markdown, and text each create deterministic normalized
   blocks and citations that navigate to the exact authorized page/region, heading/paragraph/cell,
   or line range.
2. Corrupt, encrypted, infected, spoofed-MIME, oversized, duplicate, low-confidence, timed-out, and
   malformed-OCR inputs report truthful safe state; no unsafe source becomes available and no
   partial result is presented as success.
3. Retried/concurrent scan, parse, OCR, extraction, and outbox jobs create at most one committed
   result per complete input/config key and never duplicate or replace normalized blocks.
4. Multiple documents form one immutable IntakeSet; contradictory claims remain separately cited
   and a required-field conflict blocks submission until a human resolves it with a note.
5. AI cannot accept/edit/reject on behalf of a human, resolve a conflict, mark N/A, accept risk,
   submit, approve, broaden audience, or create an authoritative baseline.
6. Provider disabled/outage/quota/invalid output leaves upload, manual template completion, gaps,
   review, approval, and baseline creation usable.
7. Every accepted claim and approved field retains exact source/generation/block/citation and
   workflow/human provenance; quality labels are derived from evidence, not self-confidence.
8. Zero unresolved Blocking gaps/conflicts is enforced transactionally at submission; stale
   readiness or field editors receive `REVISION_CONFLICT`.
9. Submission freezes matching S3 ReviewSnapshot and RequirementReadinessSnapshot. Later processing
   or editing cannot change them. Rejection/changes requested and resubmission create new snapshots.
10. Internal Requirement approval requires PM. External Requirement approval additionally uses the
    existing exactly-one first-binding Client Stakeholder decision. Approved baseline is immutable,
    numbered, and the only authoritative Requirement context.
11. Team-only source/blocks/claims/conflicts/gaps/comments/attachments cannot appear in a client
    list, count, read, citation, preview, signed download, search, AI input, notification, audit
    summary, diff, or export.
12. Workspace template extensions cannot remove mandatory controls or retroactively alter an active
    project's frozen template. Publish/upgrade is versioned, audited, and conflict-safe.
13. Delete/recovery/purge covers every primary and backup manifest key, denies access during
    recovery, restores within 30 days, verifies object absence at purge, and leaves only a
    non-content receipt.
14. Critical desktop/mobile flows pass WCAG 2.2 AA automation and manual keyboard/focus/screen-reader/
    reflow checks.

### 16.2 AI/OCR/security/operations gates

- OCR passes every frozen promotion threshold in the accepted OCR evaluation.
- Requirement extraction passes citation validity ≥98%, accepted-claim precision ≥95%,
  unsupported claim rate ≤1%, Critical seeded conflict recall 100%, overall conflict recall ≥90%,
  and no attribution loss on two consecutive runs.
- Security red-team has zero Critical safety failure and no unresolved Critical/High tenant,
  audience, upload, parser, data-loss, credential, or irreversible-AI finding.
- Storage/manifest restore meets RTO ≤8 hours and RPO ≤24 hours in the controlled drill.
- Pilot load proves 20 concurrent document jobs with bounded worker/OCR resources and truthful
  backpressure.
- Production-shaped logs/traces/metrics contain no source/OCR/Requirement/prompt/provider body,
  signed URL, secret, or private Team-only data.
- Full repository CI, migration, dependency, secret, container, accessibility, E2E, and staging
  gates pass for the exact reviewed revision.

### 16.3 Section 7 exit gate

M3 passes only when:

1. every S4 and S5 acceptance criterion and the reused S3 lifecycle scenarios pass;
2. an approved Requirement baseline is produced from each supported format, including a scanned
   PDF, with exact citations and complete approval evidence;
3. AI and adversarial thresholds pass twice for the exact promoted configuration;
4. manual completion passes with AI unavailable;
5. retention recovery/purge and primary/backup restore evidence pass;
6. security, audience, accessibility, migration, load, and operational gates pass;
7. the validation record links the exact reviewed/deployed revision and sanitized evidence; and
8. the roadmap summary and Section 7 are synchronized through `In Validation` to `Complete`.

If any item fails, M3 is not complete. Record `Blocked` in the roadmap with the required owner/date/
condition/link. M4 remains blocked.

## 17. Risks, Forward-Fix, Manual Steps, and Deferred Checks

### 17.1 Key risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Parser/native dependency vulnerability or non-reproducible build | Minimal reviewed dependencies, exact pins, SBOM/license/container scans, synthetic malformed corpus, image rollback |
| R2 S3 semantic drift/checksum assumptions | Supported-subset contract tests against MinIO and staging R2; full SHA-256 verification; compatibility recheck |
| Malware scanner unavailable/stale | Fail closed in quarantine, readiness/signature-age metrics, private service, actionable retry/dead letter |
| OCR resource/accuracy failure | Page-selective OCR, bounded DPI/batches, frozen thresholds, CPU-first profile, Needs Attention, rollback digest |
| AI prompt injection/unsupported claims | Application-selected context, no tools, strict schemas, exact citations, human-only dispositions, red-team and kill switch |
| Cross-audience evidence leak | Most-restrictive projection at every read/job/export/download; list/count/negative IDOR tests |
| Quota race or orphan objects | Locked quota reservation, expiring sessions, manifest reconciliation, immutable keys, cleanup jobs |
| Purge deletes incomplete set or too early | 30-day state machine, manifest enumeration/absence verification, backup aging, non-content receipt, restore drill |
| Template drift invalidates active work | Immutable versions/project snapshots; explicit upgrade through new draft/Delta |
| M3 change destabilizes S3 | Optional submission-guard extension, retained generic adapters/tests, focused S3 regression suite |

### 17.2 Forward-fix and rollback

- Pause only affected queues/workflows; keep manual Requirement path available.
- Disable provider/OCR/parser config for new jobs; retain historical readers/results.
- Roll back web/worker/OCR images to recorded digests while leaving additive schema intact.
- Repair schema/data invariants through reviewed forward migrations and replay derived work from
  immutable source/config hashes.
- Never overwrite or delete an approved baseline, frozen snapshot, source generation, accepted
  claim provenance, audit event, or purge receipt as rollback.
- If storage authorization is suspect, revoke bucket credentials and signed capability issuance,
  preserve redacted evidence, rotate secrets, reconcile manifests, and re-enable only after tests.

### 17.3 Manual account/environment steps

These require the authorized account/security owner and cannot be fabricated by implementation:

- assign the M3 owner and issue explicit founder implementation authorization;
- approve live AI provider/model/jurisdiction/retention/subprocessor/budget and create scoped secret;
- create private staging/production R2 and separate backup buckets in approved jurisdictions;
- create bucket-scoped runtime/backup/operational credentials and exact-origin CORS;
- provision private ClamAV and OCR Railway services, deny public routes/egress, set resource limits
  and service credentials;
- configure backup schedule/lifecycle rules/alerts and execute restore/purge drills;
- approve frozen synthetic fixtures/gold annotations and Critical/High reviewers;
- approve friendly-client data classification and production pilot go/no-go.

### 17.4 Deferred checks

- Non-English OCR/language packs, PPTX/XLSX, arbitrary workspace template builders, CDR, global
  file-content search, public API, and MCP Requirement resources remain deferred.
- Production provider behavior, residency, backup aging, and resource sizing cannot be validated in
  local-only work.
- M4 must independently register Technical/UX/Feature artifact schemas after M3 is `Complete` with
  stable evidence.

## 18. Recommended Status-Transition Checklist

- [x] Founder confirms the implementation-scope decisions recorded in Section 2.4.
- [x] Roadmap summary and Section 7 assign the same named M3 owner.
- [x] Founder explicitly authorizes M3 implementation with synthetic/redacted fixtures only.
- [x] Reverify Shared Artifact Kernel is `Complete` with stable evidence.
- [x] In Slice A's starting change, synchronize roadmap summary and Section 7 to `In Progress`.
- [ ] Execute Slices A–K and preserve unrelated working-tree changes.
- [ ] Create `docs/validation/w3-m3-requirement-intake-template-engine.md` with exact reviewed
      revision and sanitized evidence.
- [ ] Synchronize roadmap summary and Section 7 to `In Validation` while assessing every exit gate.
- [ ] If all gates pass, link the validation record and synchronize both roadmap locations to
      `Complete`.
- [ ] If any gate fails, synchronize both to `Blocked` and record owner, opened date, clearing
      condition, and stable issue/decision link.
- [ ] Do not begin M4 until M3 is `Complete` with linked stable evidence.

## 19. Implementation-Ready Summary

### Decisions

- Extend the validated S3 artifact kernel; do not create a parallel Requirement lifecycle.
- Use manifest-authoritative immutable R2/MinIO storage, single-PUT pilot uploads, full SHA-256
  verification, private ClamAV, deterministic parsers, and page-selective private PaddleOCR.
- Register a code-owned `REQUIREMENT@1` adapter and `REQUIREMENT_TEMPLATE@1` with declarative
  applicability and narrow controlled workspace extensions.
- Keep claims/generations immutable and human dispositions append-only; bind a frozen Requirement
  readiness snapshot atomically to the S3 review snapshot.
- Keep AI provider-neutral, strictly validated, cited, evaluated, human-gated, and optional to the
  complete manual path.

### Constraints

- Implementation is authorized with synthetic/redacted fixtures and the manual path.
- Live AI and production R2/backup integrations remain gated by the decisions in Section 2.4.
- Preserve `apps/web/next-env.d.ts` and all unrelated changes.
- No real client/project/user/document/production data in development, tests, fixtures, or logs.
- No Team-only content or confidential bodies in logs, AI contexts not authorized for them,
  notifications, search, downloads, or exports.
- M4 remains blocked until M3 is `Complete` with linked evidence.

### Files to edit

- Create ingestion/Requirement contracts, domain/application boundaries, stores, migration,
  parsers, AI workflow, worker processors, APIs/UI, OCR inference/tests, fixtures, validation record.
- Modify package exports/dependencies, storage port, optional S3 submission guard, schema, worker
  composition, runtime config, Compose/Docker/CI, navigation, UI exports, and governed roadmap/docs.
- Verify and preserve S3/M1/M2 behavior and unrelated `apps/web/next-env.d.ts`.

### Commands to run

- Start PostgreSQL/Redis/MinIO/ClamAV/OCR; migrate; run focused domain/contract/parser/AI/integration/
  security/E2E suites; run two OCR/Requirement evaluations; run `pnpm check`, coverage, migrations,
  full E2E, image builds/scans, Gitleaks, audit, backup/restore, and isolated staging journeys.
- Use the exact commands in Section 14 and record exact revisions, image digests, deployment IDs,
  configuration hashes, and sanitized results.

### Acceptance criteria

- Every pilot format yields deterministic exact citations; unsafe/malformed inputs fail safely.
- Retries do not duplicate/replace results; conflicts/gaps are human-resolved and block readiness.
- Manual completion works without AI; AI cannot perform binding human actions.
- Review/readiness snapshots and approved baselines are immutable and correctly authorized.
- Team-only content is absent from every client projection/capability.
- Retention, purge, backup/restore, OCR/AI thresholds, WCAG, security, load, CI, and staging gates
  all pass.

### Known risks/blockers

- Live AI provider and production R2/backup jurisdiction decisions are unresolved.
- PDF.js/canvas native/runtime fit requires a bounded dependency spike.
- Exact backup aging, provider operational limits, and production resource sizing require account
  owner/security operations evidence.
