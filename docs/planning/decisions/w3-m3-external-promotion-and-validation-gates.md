# W3 M3 Owner Decisions and Promotion Gates

**Recorded:** 2026-07-26
**Decision owner:** Nishanth
**Implementation owner:** Nishanth with Codex
**Related plan:** [W3 M3 Requirement Intake & Template Engine](../w3-m3-requirement-intake-template-engine.md)
**Validation record:** [W3 M3 validation](../../validation/w3-m3-requirement-intake-template-engine.md)

## Governance and data boundary

M3 remains governed by the implementation roadmap and cannot pass its exit gate until repository
coverage, two frozen AI and OCR evaluations, exact-revision staging, restore/purge, security,
accessibility, and load validation all pass.

Only synthetic or redacted fixtures are authorized. Real client documents, project or user data,
real credentials, and private content must not enter staging, tests, prompts, logs, screenshots, or
evaluation fixtures.

## AI decision

- AI is enabled only for Requirement extraction and gap suggestions. It is advisory and cannot
  approve, resolve conflicts, mark N/A/Accepted Risk, change audience, or create an approved
  baseline.
- OpenAI `gpt-5.6-terra` is the default. Anthropic `claude-sonnet-5` is permitted only for an
  explicitly selected evaluation or approved failover. Automatic cross-provider fallback is
  forbidden.
- Use server-side Railway secrets and Vercel AI SDK provider adapters without AI Gateway, hosted
  prompt logging, aliases, automatic upgrades, or unapproved fallback. Individual Codex or Claude
  Code subscriptions are developer tools and never backend credentials or application budget.
- Pin provider, exact model ID, prompt version, schema, parameters, timeout, retry policy, and
  configuration hash for every workflow.
- Synthetic staging uses the providers' default commercial API processing without a contractual
  residency guarantee. Any real client or regulated data requires a new written residency decision.
- Retain encrypted application prompt/output provenance for 30 days by default; App Admin may
  reduce it to disabled. Logs contain only IDs, hashes, costs, and safe metrics. OpenAI uses
  `store: false`; provider file storage, background mode, training/evaluation sharing, feedback
  sharing, fine-tuning, and partner programs are prohibited.
- Approved processors are Railway, Cloudflare R2, OpenAI API, Anthropic API, Resend, and Sentry/OTel
  with content scrubbing. Vercel AI SDK is an application library, not a hosted processor.
- Initial staging limits are USD 100/month and USD 1/extraction, alerts at USD 50 and USD 80, and a
  hard stop at USD 100.
- Nishanth is primary credential and kill-switch owner; Delivery OS App Admin is secondary. Use
  separate scoped OpenAI and Anthropic projects/keys. Global and per-workflow kill switches fail
  closed to the manual path.

## OCR decision

- Self-host PP-StructureV3 with PaddleOCR 3.7.0 and PaddlePaddle 3.3.1, English only and CPU only.
- Bake reviewed model artifacts into the OCR image and calculate an artifact-manifest SHA-256.
  Record it with the image digest, configuration digest, and SBOM in the promotion PR. `null`,
  `latest`, or an unverified digest is not approved.
- Run one private Railway OCR replica with 4 vCPU, 8 GiB RAM, concurrency 1, 300 DPI, at most
  20 megapixels/page, and a 30-second page timeout. Worker queues absorb the twenty-job test and OCR
  applies truthful backpressure.
- OCR has no public domain, Internet egress, database, Redis, or R2 credentials. The worker sends
  bounded rendered page bytes over authenticated private networking.
- Use a synthetic, versioned English fixture corpus. Nishanth accepts the corpus and results; Codex
  prepares and independently reviews evidence. Two consecutive runs must pass. Nishanth or an
  explicitly delegated App Admin owns promotion; Codex cannot self-approve.

## Synthetic staging infrastructure

- Use only the Railway environment named `staging`; do not create or deploy production. If a
  mandatory environment remains named `production`, its application mode stays `APP_ENV=staging`
  and it is documented as staging-only.
- Codex may provision and configure private primary/backup object storage, ClamAV, and OCR resources
  for synthetic staging.
- Primary bucket: `delivery-os-staging-primary`. Backup bucket:
  `delivery-os-staging-backup`. Use R2 location hint `enam` without claiming a US jurisdictional
  guarantee.
- Both buckets are private with no `r2.dev` or public custom domain. Use separate bucket-scoped
  runtime, backup, and operational credentials. The application receives only the runtime
  credential.
- Primary CORS allows exactly `https://web-staging-5e5c.up.railway.app`, replaced atomically if
  the staging web domain changes. Methods are GET, HEAD, and PUT; allow only required upload headers,
  expose ETag, prohibit browser DELETE and wildcards. Backup has no browser CORS.
- Run daily PostgreSQL backup, daily object-manifest snapshot, and copy newly committed immutable
  objects. Retain snapshots 35 days; purge manifest-listed backup objects at day 30 and verify
  absence. Run daily integrity sampling and a quarterly restore drill. RPO is at most 24 hours and
  RTO at most 8 hours.
- Nishanth is initial alert recipient and primary credential owner; App Admin is secondary.

## Validation, incident, and release authority

- Codex may deploy an exact committed revision to synthetic-only staging and run restore/purge and
  twenty-job load/backpressure tests.
- Codex reviews security, privacy, and audience evidence. Nishanth is the accountable human reviewer
  and final go/no-go owner.
- No Critical/High security, tenancy, audience, upload, parser, credential, data-loss, or
  irreversible-AI finding may remain open.
- Treat the historical secret finding as potentially active until Nishanth verifies revocation or
  rotates it. Track only a sanitized fingerprint, affected path/commit, owner, investigation date,
  revocation state, remediation, and closure evidence in restricted private GitHub issue
  `SEC-2026-001 Historical secret finding`, labelled `security` and `confidential`.
- Codex may create branch `codex/m3-promotion-gates`, commit, push, open a draft PR targeting `main`,
  and deploy the exact PR commit to staging after required tests pass. The PR includes owner
  decisions, validation evidence, exact model/image/config digests, sanitized infrastructure
  evidence, and remaining blockers. Nishanth must approve and merge; Codex is not the sole
  approver.

## Remaining clearing evidence

| Gate | Required evidence |
| --- | --- |
| Repository coverage | Existing 80% global statement and branch thresholds pass without weakening. |
| AI | Scoped secrets supplied outside source/chat; exact configuration pinned; two consecutive frozen synthetic evaluations meet every Section 16 threshold. |
| OCR | Reviewed model artifacts baked into the image; model-manifest/image/config/SBOM digests recorded; two consecutive frozen runs accepted by Nishanth. |
| Storage and malware scanning | Private primary/backup buckets, scoped credentials, exact CORS, private ClamAV, adversarial corpus, manifest reconciliation, and fail-closed evidence. |
| Restore and purge | Controlled synthetic drill meets RTO/RPO, recovery/purge covers primary and backup manifests, and absence is verified. |
| Load | Twenty concurrent document jobs prove bounded resources, truthful backpressure, and idempotent retry behavior. |
| Security and audience | Historical credential verified/rotated; restricted incident closed; no open Critical/High finding; Team-only negative paths pass. |
| Exact staging revision | Draft PR commit deployed to the `staging` environment; migrations, every-format journeys, accessibility, logs/metrics inspection, and stable sanitized evidence pass. |
