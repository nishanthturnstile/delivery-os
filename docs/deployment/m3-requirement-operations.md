# M3 Requirement Intake Operations

Related: [Infrastructure](infrastructure.md), [M3 implementation plan](../planning/w3-m3-requirement-intake-template-engine.md), and [AI/security assurance](../assurance/ai-security-evaluation.md).

This runbook covers only the private, content-safe synthetic staging path. It authorizes the
approved OpenAI/Anthropic backend adapters and private OCR/storage/scanner staging resources under
the recorded M3 decision, but it does not authorize production or real client data.

## Fail-closed service checks

- Source upload completion must verify declared size and a full streamed SHA-256 before a scan job
  exists. Provider ETags and unsigned metadata are not integrity evidence.
- ClamAV and OCR addresses must be private. If scan or OCR is unavailable, keep the source in
  quarantine and expose only a safe error code.
- OCR readiness requires `recognitionEnabled`, an exact model digest, a loaded model, and frozen
  promotion evidence. The checked-in service deliberately reports not ready without them.
- AI assistance is disabled unless the selected exact provider configuration, per-workflow switch,
  global switch, and budget gate all allow the workflow. OpenAI is default; Anthropic requires
  explicit evaluation or approved-failover selection. Never use automatic fallback. The manual
  Requirement path must remain usable.

## Approved AI staging operation

- Store scoped OpenAI and Anthropic API credentials only as Railway secrets. Individual developer
  subscriptions are not backend credentials.
- Use OpenAI `gpt-5.6-terra` by default and Anthropic `claude-sonnet-5` only when explicitly
  configured. Pin the exact provider/model ID, prompt, schema, parameters, timeout, retries, and
  configuration hash.
- Set OpenAI `store: false`. Do not use provider files, background mode, prompt logging, training,
  feedback/evaluation sharing, fine-tuning, hosted gateways, aliases, or automatic upgrades.
- Enforce USD 1 per extraction, USD 100 monthly staging hard stop, and alerts at USD 50 and USD 80.
- Retain encrypted prompt/output provenance for 30 days by default; App Admin may reduce retention
  to zero. Logs and metrics contain IDs, hashes, cost, token/page/block counts, durations, and safe
  codes only.
- Global and per-workflow kill switches fail closed to the manual path. Nishanth is primary owner;
  App Admin is secondary.

## Approved OCR staging operation

- Run one private CPU-only PP-StructureV3 replica with PaddleOCR 3.7.0 and PaddlePaddle 3.3.1,
  English only, concurrency 1, 4 vCPU, 8 GiB RAM, 300 DPI, 20 megapixels/page, and 30 seconds/page.
- Bake reviewed model artifacts into the image. Readiness requires the calculated artifact-manifest
  SHA-256 plus exact image/config/SBOM evidence and two accepted frozen runs.
- Give OCR no public domain, Internet egress, database, Redis, or R2 credentials. Only the worker
  sends bounded rendered page bytes over authenticated private networking.

## Queue handling

Document work is deduplicated by workspace, project, job type, complete input hash, and config
version. Workers claim with a database lock and `SKIP LOCKED`, record an attempt, and commit results
before marking the attempt successful. Retry only safe transient failures. Malware, encryption,
unsupported media, resource-limit, and provenance mismatch errors require attention and must not
be retried into an available state.

Pause the affected job type when queue age, dead letters, scanner signature age, or memory exceeds
the approved alert boundary. Do not pause manual editing, review, or approval.

## Privacy-safe diagnosis

Allowed diagnostic fields are IDs, state, attempt, duration, byte/page/block counts, exact
non-secret config hashes, and safe error codes. Never copy filenames, object keys, source/OCR/
Requirement text, prompts, responses, signed URLs, authorization headers, or Team-only counts into
logs, tickets, metrics, or validation evidence.

Use workspace/project/source IDs to inspect database state. Validate client projections with a
controlled Client Stakeholder account; do not infer audience safety from an internal response.

## Recovery and purge

Recovery is permitted only inside the 30-day recoverable window. Downloads remain denied while a
source is recoverable. Purge enumerates every quarantine, primary, and backup manifest, deletes all
keys, proves absence, removes derived content, decrements retained quota, and writes only the
non-content receipt.

Before any production-shaped migration, the account owner must execute and record a separate
primary/backup restore drill in the approved jurisdiction. Additive migrations remain in place
during image rollback; repair derived data through a forward migration and replay from immutable
source/config hashes.

## Remaining human promotion gates

1. Nishanth supplies the separately scoped provider secrets directly through Railway and promotes
   the exact OCR configuration after reviewing two frozen runs.
2. Nishanth verifies or rotates the historical credential and closes the restricted sanitized
   incident.
3. Nishanth reviews the exact PR/deployed revision evidence and gives the final go/no-go. M3 stays
   blocked until every Section 16 gate passes.
