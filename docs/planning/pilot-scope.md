# Delivery OS — Controlled Pilot Scope & Readiness

**Status:** Normative pilot boundary
**Parent:** [Product Plan](../core/product-plan.md)
**Related:** [Delivery Backlog](delivery-backlog.md), [AI, Security & Evaluation](../assurance/ai-security-evaluation.md)

## 1. Pilot Objective

Prove a complete trusted lifecycle using Delivery OS itself, followed by one friendly external client:

`Source documents → approved Requirement baseline → Technical/UX baselines → Module/Feature map → Feature Specification → Ready typed work → agent implementation report → human Done → material change → reviewed downstream application`

The pilot is successful only when this lifecycle is repeated with end-to-end traceability and no critical trust failure. Fast document generation alone is not success.

## 2. Launch-Critical Capabilities

### Included

- Verified-email accounts, password/magic-link sign-in, TOTP, recovery, sessions.
- Explicit multi-workspace tenancy and project-scoped roles.
- Project lifecycle, readiness gates, Admin/PM/Lead/Contributor/Viewer/Client access.
- PDF/OCR, DOCX, Markdown, and text ingestion with quarantine, citations, conflicts, and gaps.
- Requirement snapshots/baselines and initial external client approval.
- Technical and UX baselines, Feature Specifications, design deltas, progressive Module/Feature elaboration.
- Typed work, traceability, readiness, sprint board, blockers, range-based forecasting.
- Implementation reports, human review, immutable Done snapshots.
- Remote MCP with interactive OAuth and official workflow pack.
- Client portal, explicit audience, preview-as-client, unified Client Input.
- Materiality, impact analysis, client decision, downstream Change Set review, successors.
- Optional Cost Plan using manual rates.
- Audit, project activity, in-app inbox, transactional/action email, basic project search.
- Requirement/spec/backlog PDF, Markdown, and JSON exports.
- 30-day deletion recovery and permanent purge workflow.

### Deferred

- PPTX/XLSX ingestion.
- Jira/Azure DevOps/GitHub Issues/repository/CI/deployment synchronization.
- Unattended agent service accounts and static pasted tokens.
- Public REST API.
- Workspace-wide file-content search.
- Granular per-event notification matrix.
- Arbitrary custom roles and unrestricted template builder.
- SSO/SCIM.
- Native separate plugins for every IDE.
- On-premise/air-gapped deployment.
- Public signup, billing, and commercial self-service.

## 3. Pilot Participants and Environments

- Phase A: Delivery OS team uses an internal project to build and operate Delivery OS.
- Phase B: one friendly client is invited to a separate external project.
- The friendly client validates requirement approval, portal visibility, material changes, and feedback; they do not approve stories or sprints.
- Environments: local Docker Compose, Railway preview/staging, Railway production pilot.
- Production access is invite-only and feature-flagged.

## 4. Pilot Capacity and Service Targets

| Dimension | Acceptance profile |
|---|---|
| Workspaces | 50 |
| Users per workspace | 25 |
| Active projects per workspace | 20 |
| Work items per project | 5,000 |
| Concurrent browser sessions | 200 |
| Concurrent MCP sessions | 50 |
| Concurrent ingestion jobs | 20 |
| Interactive read p95 | < 2 seconds |
| Board view p95 | < 3 seconds |
| Availability | 99.5% monthly |
| RTO | ≤ 8 hours |
| RPO | ≤ 24 hours |

OCR, AI, exports, impact analysis, and purge are asynchronous and report progress. Their SLOs are measured separately by input size and provider.

## 5. Readiness Gates

### Documentation readiness

- Product, domain, architecture, AI/security, and delivery documents have no contradictory normative rules.
- Every launch-critical FR maps to an implementation slice and acceptance evidence.
- No unresolved Blocking product decision remains.

### Security/privacy readiness

- No open Critical/High tenant-isolation, IDOR, client-visibility, authorization, token, upload, or data-loss issue.
- Privileged operations require step-up TOTP.
- MCP OAuth discovery, PKCE, audience validation, scope enforcement, consent, and revocation pass.
- Malware, MIME, prompt-injection, SSRF, log-redaction, deletion, and restore scenarios pass.
- External AI subprocessors and Cloudflare R2 jurisdiction/retention are documented; the self-hosted OCR component inventory records model/code versions and licenses.

### AI readiness

- Each enabled workflow passes the task-specific thresholds in [AI, Security & Evaluation](../assurance/ai-security-evaluation.md).
- Model/prompt/schema provenance is visible for every generated proposal.
- Manual completion works when AI is unavailable.
- No AI action can approve, apply a Change Set, mark N/A/Accepted Risk, or move work to Done.

### Operational readiness

- Database and object restore drill meets RTO/RPO.
- Dead-letter jobs are observable and recoverable.
- Runbooks cover provider outage, stuck queue, R2 failure, OCR saturation/failure, email failure, compromised OAuth client, and accidental deletion.
- Application-level latency/error/job/AI-quality dashboards and alerts are active.

### Experience readiness

- Critical flows meet WCAG 2.2 AA, including keyboard alternatives for drag-and-drop.
- Internal project completes the full lifecycle.
- Friendly client completes the external Requirement decision, visibility, material-change, and Client Input scripts.

## 6. Pilot Metrics

### Primary

- Count of projects completing the trusted lifecycle.
- Traceability coverage from Requirement to Done.
- Number and severity of trust failures: unsupported claims, wrong visibility, stale overwrite, unauthorized transition, lost evidence, or missed material impact.

### Efficiency

- Upload-to-approved-Requirement time.
- Feature promotion-to-Ready time.
- Human correction time per AI workflow.
- Ready-to-Done cycle time and blocker duration.

### Quality

- Requirement claims accepted vs. materially rewritten.
- Work returned from In Review for missing evidence.
- Post-Done Defect rate.
- Forecast interval calibration.
- VDE/elapsed estimate calibration by work/tool/risk cohort and review/rework share.
- Change Impact false-negative/false-positive rate.

### Client

- Requirement/material-change decision time.
- Client Input response/resolution time.
- Portal visits around checkpoints.
- Visibility or comprehension issues reported.

## 7. Go/No-Go Decision

Proceed beyond the pilot only when:

1. All readiness gates pass.
2. Internal and friendly-client scripts complete without manual database intervention.
3. No Critical/High security or privacy finding remains.
4. Restore drill passes.
5. Enabled AI workflows pass evaluation thresholds for two consecutive evaluation runs.
6. Product owner, engineering lead, and security owner sign the frozen pilot-readiness snapshot.
