# Delivery OS — AI, Security & Evaluation

**Status:** Normative assurance specification
**Parents:** [Product Plan](../core/product-plan.md), [Architecture & Contracts](../core/architecture-contracts.md)
**Pilot gates:** [Pilot Scope & Readiness](../planning/pilot-scope.md)

This specification operationalizes AI trust, application security, privacy, and evaluation. It is informed by the [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework), [OWASP SAMM](https://owasp.org/www-project-samm/), and the [MCP Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices).

## 1. Trust Boundaries

Untrusted inputs include:

- Uploaded documents and OCR text.
- User/client comments and pasted URLs.
- AI model output.
- MCP tool arguments and client metadata.
- File metadata, external design links, and optional external references.

Trusted policy inputs include:

- Versioned system prompts and workflow schemas.
- Approved artifact snapshots explicitly selected by the application.
- Server-side authorization context.
- Versioned template and evaluation configuration.

Untrusted content is always delimited as data. Text inside a document cannot redefine tools, permissions, system prompts, output schema, approval rules, or destinations.

## 2. AI Workflow Inventory

| Workflow | Input | Output | Human gate |
|---|---|---|---|
| Requirement extraction | Normalized cited blocks | Proposed claims/field mappings | Accept/edit/reject each claim |
| Gap/question suggestion | Draft Requirement + support | Proposed gaps/questions | PM disposition |
| Technical baseline draft | Approved Requirement | Proposed Technical sections | PM/Lead approval |
| UX baseline draft | Approved Requirement | Proposed UX sections | PM/Lead approval |
| Module/Feature map | Approved baselines | Proposed outcome map | PM/Lead approval |
| Feature Specification | Approved context | Proposed behavior spec/deltas | PM/Lead approval |
| Work breakdown | Approved feature context | Proposed typed work/trace links | PM/Lead readiness |
| AI-aware sizing suggestion | Work context + comparable history + tool profile | VDE/elapsed ranges, size, AI fit, uncertainty, consequence risk, basis | Human owns and may revise before start |
| Impact analysis | Proposed Requirement delta + current graph | Proposed affected graph/actions | PM review, then Change Set review |
| Implementation validation aid | Approved work + submitted report | Findings only | Human reviewer decides |

No workflow can approve, mark N/A, accept risk, resolve conflict, apply a Change Set, or move work to Done.

## 3. Provider and Model Governance

- Implement provider-neutral adapters.
- Pilot infrastructure defaults are Railway, Cloudflare R2, self-hosted PaddleOCR, Resend, and Sentry. Replacing one requires an ADR, security/privacy review, fixture or operational regression evidence, license review, and an updated component/subprocessor register.
- Candidate models use enterprise API terms excluding customer content from training.
- Record provider retention, processing regions, subprocessors, abuse-monitoring exceptions, and deletion commitments.
- A model is enabled per workflow, not globally.
- Workflow configuration pins provider, model/version, prompt version, input/output schemas, parameters, timeout, retry class, and budget.
- A model/configuration change requires evaluation against the frozen regression set before promotion.
- Staging and evaluation use synthetic/redacted data unless explicit authorization covers real pilot content.
- Production content never appears in source control, test snapshots, analytics events, or developer logs.

## 4. Provenance and User Presentation

Every proposal stores:

- Workflow ID and job/correlation IDs.
- Provider/model identifiers.
- Prompt and schema versions.
- Approved artifact and normalized-block input IDs/hashes.
- Output validation results.
- Citations and support/conflict signals.
- Start/end time, latency, token usage, calculated cost.
- Retry/fallback history.
- Human accept/edit/reject outcome and material-edit classification.

The UI must distinguish:

- Direct source text/claim.
- Human-authored canonical value.
- AI proposal not yet accepted.
- Accepted AI-assisted value.
- Unsupported or conflicting value.

Do not present model self-confidence as calibrated probability. Quality labels derive from observable support, agreement, validation, and evaluated workflow performance.

## 5. Evaluation Sets

Maintain versioned datasets:

- `extraction-core`: searchable PDF, scanned PDF, DOCX, Markdown, text.
- `extraction-adversarial`: prompt injection, conflicting sources, misleading headers, tables, OCR noise, duplicate documents.
- `gaps-core`: conditional applicability, N/A traps, accepted-risk cases.
- `planning-core`: requirements with known Technical/UX constraints and expected Module/Feature coverage.
- `work-core`: examples requiring Outcome Story, Enabler, Defect, Spike, and Operational Task.
- `impact-core`: changes affecting backlog, active work, Done successors, UX, Technical, cost, and dates.
- `security-redteam`: exfiltration requests, cross-tenant references, malicious URLs, oversized outputs, tool-instruction injection.

Each case contains:

- Input fixture and data classification.
- Expected mandatory claims/citations/impacts.
- Explicit forbidden unsupported claims/actions.
- Severity-weighted scoring.
- Human-reviewed gold annotation and annotation version.

At least two reviewers adjudicate Critical/High gold cases. Evaluation reports retain dataset/model/prompt/schema hashes.

## 6. Pilot AI Thresholds

### Requirement extraction

- Citation validity ≥ 98%.
- Accepted-claim precision ≥ 95%.
- Unsupported claim rate ≤ 1%.
- Critical seeded conflict recall = 100%.
- Overall conflict recall ≥ 90%.
- No cross-document claim may lose all source attribution.

### Specifications and work breakdown

- Requirement-to-spec/work traceability coverage = 100% for mandatory seeded requirements.
- Zero forbidden work type/lifecycle/approval violations.
- Zero unresolved Blocking gap represented as resolved/N/A.
- ≥ 90% mandatory acceptance-scenario coverage.
- Human material-rewrite rate is reported; promotion requires no regression greater than 5 percentage points against the current production configuration.

### Impact analysis

- Critical seeded impact recall = 100%.
- Overall impact recall ≥ 95%.
- Precision ≥ 85%.
- Done items are never proposed for in-place mutation.
- Active work always receives an explicit continue/pause/split/supersede decision candidate.

### Promotion rule

- A candidate passes thresholds on two consecutive deterministic evaluation runs where provider behavior permits.
- Any Critical safety failure blocks promotion regardless of aggregate score.
- Rollback configuration remains deployable.
- Production monitoring may automatically disable an assisted workflow after repeated schema/safety failures; manual authoring remains available.

## 7. Human Outcome Feedback

Capture:

- Claim accepted, edited, or rejected.
- Edit distance and material vs. copy change.
- Gap reclassification.
- Work type correction.
- VDE/elapsed range revision, AI-fit/uncertainty/risk correction, and aggregate actual VDE band at completion.
- In Review return reason.
- Change Impact additions/removals by PM.

These signals are quality telemetry, not training consent. They may be aggregated only after removing client content and tenant-identifying data.

## 8. Application Security Requirements

### Identity and access

- Verified email; strong password hashing; rate-limited sign-in/reset/magic links.
- TOTP step-up for privileged actions.
- Session rotation/revocation after sensitive changes.
- Deny-by-default workspace/project/audience authorization.
- Automated cross-tenant and IDOR tests for every entity family.

### MCP

- OAuth 2.1 authorization code + PKCE for public clients.
- Protected Resource Metadata and authorization-server discovery.
- Exact redirect validation; short-lived access tokens; refresh rotation where used.
- Issuer, signature, expiry, audience/resource, client, grant, session, scope, and domain authorization checks.
- Never accept or pass through tokens issued for another resource.
- Incremental scopes; no wildcard scope.
- Consent clearly identifies client, user, workspace/project, and requested capabilities.
- Rate/size limits by user, client, workspace, tool, and IP risk signal.
- MCP sessions are never authentication; each request is independently authorized.

### Uploads and content

- Direct upload only to constrained quarantine keys.
- Checksum, size, MIME, extension, archive-bomb, and malware checks.
- Reject encrypted/password-protected files with safe error.
- Parser/OCR run with minimal filesystem access and bounded CPU/memory/time. The OCR runtime has no production R2 credentials, accepts only worker-authenticated bounded page images, and has no runtime Internet egress.
- Never fetch document-embedded external URLs automatically.
- Sanitize rendered document content and exports.

### Prompt injection and exfiltration

- Separate instructions from content structurally.
- Only application-selected approved context enters generation.
- Tool invocation is not available to document-processing model calls.
- Strip or classify secrets before provider requests where feasible.
- Generated external URLs are untrusted and never auto-fetched.
- Output schemas allow only required fields; reject unexpected tool/HTML/script content.
- Red-team attempts to reveal another workspace, system prompts, credentials, hidden Team-only fields, or raw storage keys.

### Web/API

- CSRF protection on cookie-authenticated mutations.
- CSP, secure headers, output encoding, safe Markdown/rendering.
- Parameterized database access.
- SSRF allow/block policy for any future server-side URL fetch.
- Secrets only in Railway secret variables/provider stores; never source control.
- Dependency, container, and secret scanning in CI.

## 9. Privacy and Data Handling

- Data classification: account data, project metadata, confidential source content, client-visible content, Team-only content, credentials/secrets.
- Minimize provider payloads to the specific workflow context.
- Do not send unrelated project history or Team-only content when not required.
- Retain provider request/response bodies only in the encrypted domain store when needed for provenance; application logs contain IDs/hashes and safe metrics only.
- Document external AI, email, object-store, and observability providers, processing jurisdiction, and retention in a subprocessor register. Record self-hosted OCR model/code versions and licenses in the software-component register; PaddleOCR is not an external data subprocessor when run on Delivery OS-controlled infrastructure.
- Configure Cloudflare R2 in the approved jurisdiction when residency is required; use bucket-scoped credentials and do not copy source content into email or observability payloads.
- Resend webhook payloads and Sentry telemetry are untrusted external inputs. Verify signatures where available, minimize stored fields, scrub content/secrets, and enforce retention before pilot data is processed.
- Workspace export precedes requested permanent deletion.
- Recoverable deletion lasts 30 days; purge jobs delete all application-managed immutable R2 keys and domain rows, then backup copies age out per schedule.

## 10. Audit and Incident Response

Audit:

- Authentication/MFA/session and membership changes.
- OAuth client registration, consent, elevation, revocation, and denied scopes.
- Privileged reads/exports/downloads.
- Artifact review/approval and client decisions.
- Agent tool calls and resulting domain actions.
- AI configuration promotion/rollback.
- Deletion, restoration, and purge.

Incident runbooks:

- Compromised user/session.
- Compromised OAuth client or leaked token.
- Cross-tenant/client-visibility exposure.
- Malicious uploaded document/parser exploit.
- Provider data-handling incident.
- Unsupported AI claim reaching an approved baseline.
- Lost/corrupt database or object.
- Stuck/duplicated Change Set or purge.

Critical incidents revoke affected sessions/grants, disable affected workflow/provider, preserve redacted evidence, notify owners, and require documented corrective action before re-enable.

## 11. Security and Evaluation Test Gates

- Static analysis, dependency scan, secret scan, container scan.
- Unit/property tests for authorization, state, materiality, audience, snapshots, and idempotency.
- Integration tests for OAuth, upload pipeline, provider adapters, deletion, restore, and audit redaction.
- DAST against staging.
- Manual abuse testing of client preview/export and MCP consent.
- AI regression and adversarial suites.
- Accessibility authentication tests under WCAG 2.2.
- Restore drill and purge verification.

No Critical/High finding may be accepted for pilot launch in tenant isolation, authorization, data loss, client visibility, credentials, or irreversible AI/domain mutation.
