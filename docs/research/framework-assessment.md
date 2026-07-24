# Delivery OS — 2026 Framework Assessment

**Status:** Decision record
**Purpose:** Record which open-source/framework patterns Delivery OS adopts, adapts, or rejects.

Delivery OS does not embed any reviewed framework as its product workflow. It uses the smallest proven patterns that strengthen intent, traceability, change safety, agent context, and delivery feedback.

## 1. Assessment Matrix

| Framework/tool | Proven pattern | Delivery OS decision | Not adopted |
|---|---|---|---|
| [GitHub Spec Kit](https://github.github.com/spec-kit/quickstart.html) | Constitution → Specify → Clarify → Plan → Checklist → Tasks → Analyze → Implement → Converge; cross-artifact checks | Adopt separation of intent/spec/design/work, targeted clarification, readiness checklist, read-only consistency analysis, and post-implementation convergence | Its repository CLI/file layout, branch conventions, and one-feature Markdown harness |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | Current truth separated from proposed changes; proposal/spec delta/tasks/archive | Adopt immutable Baselines, explicit Deltas, reviewable Change Sets, and merge-after-approval semantics | Filesystem archive as the authoritative store and unrestricted artifact iteration without product gates |
| [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/reference/workflow-map.md) | Progressive context through analysis/planning/solutioning/implementation; readiness gate; Quick Flow | Adopt progressive Feature elaboration, Technical/UX context, implementation-readiness gate, and governed compact path | Persona-agent ceremony, mandatory full-document production for small work, and framework-specific sprint files |
| [Backstage Software Templates](https://backstage.io/docs/features/software-templates/) | Schema-based input, review before execution, step logs, cancel/retry/results | Adopt versioned controlled templates, review snapshots, asynchronous jobs, progress, cancellation, retry, safe results, and dry-run-style validation | Software scaffolding/catalog scope and arbitrary execution actions |
| [Plane](https://github.com/makeplane/plane) | Work items, cycles, Modules, relations, views, intake, activity; broad typed MCP tools | Adopt generic typed work, Module outcomes, relation graph, filters, and validated MCP schemas | Rebuilding a general Jira replacement, 100+ CRUD MCP tools, destructive agent actions, and tracker synchronization |
| [OpenProject](https://github.com/opf/openproject) | Mature work packages, planning, Agile boards, budgets, meetings, Git linkage | Use as evidence that delivery work requires richer states/relations than a single Story model | Gantt/time-tracking/meeting/wiki breadth and enterprise configurability in the pilot |
| [Backstage TechDocs](https://backstage.io/docs/features/techdocs/) | Documentation close to implementation and searchable ownership context | Keep Delivery OS specifications portable through Markdown/JSON exports and immutable references | Making source control the Delivery OS system of record |
| [DORA AI/measurement guidance](https://dora.dev/insights/balancing-ai-tensions/) | Measure outcomes across the value stream; AI shifts work into verification and can amplify large-batch instability | Adopt end-to-end VDE, separate elapsed/machine measures, small batches, and calibration against review/rework/stability | Code volume, token use, or a universal AI productivity multiplier |

## 2. Resulting Delivery OS Artifact Model

```text
Project principles and Requirement baseline
  ├─ Technical baseline
  ├─ UX baseline
  └─ Module / Feature outcome map
        └─ Near-term Feature Specification
             ├─ Technical delta
             ├─ UX delta
             └─ Typed work
                  └─ Implementation report
                       └─ Human Done completion snapshot
```

Post-baseline change:

```text
Proposed Requirement delta
  → Impact Report
  → materiality decision
  → client decision only when material/external
  → new Requirement baseline
  → reviewed downstream Change Set
  → explicit application/successors
```

This combines Spec Kit's staged quality gates, OpenSpec's current-truth/delta separation, and BMAD's progressive context without imposing their repository mechanics on Delivery OS users.

## 3. Work-Management Decision

The original plan treated every delivery item as a UI + backend + database + test Story. Plane/OpenProject demonstrate why mature systems use more general work packages and relations.

Delivery OS therefore uses:

- Outcome Story for independently testable vertical behavior.
- Enabler for a technical prerequisite.
- Defect for deviation from approved behavior.
- Spike for time-boxed uncertainty reduction.
- Operational Task for delivery/operations outcomes.

Verticality remains the default for behavior; typed supporting work prevents unrelated layers from being bundled merely to satisfy a template.

## 4. Agent and MCP Decision

The current [MCP Authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) requires OAuth 2.1 discovery, protected-resource metadata, PKCE for public clients, resource/audience binding, and secure token handling. The [MCP security guidance](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices) emphasizes scope minimization, token audience validation, consent, SSRF defense, and session security.

Delivery OS therefore:

- Uses interactive user-delegated OAuth at pilot launch.
- Exposes a small intent-oriented resource/tool surface rather than generic CRUD.
- Requires domain authorization in addition to scopes.
- Accepts structured implementation evidence but never lets an agent approve, apply Change Sets, or move work to Done.
- Ships a workflow pack on top of MCP instead of separate business logic per IDE.

## 5. Quality and Operational Standards

- [DORA's 2026 metrics](https://dora.dev/guides/dora-metrics/) inform flow/stability measurement and the preference for small batches. Delivery OS can measure internal flow immediately; commit/deployment DORA metrics remain unavailable without repository/deployment integration.
- [AI-assisted sizing research](ai-assisted-sizing.md) changes T-shirt size from an ambiguous construction-effort proxy into a VDE bucket covering understanding, planning, agent supervision, validation, human review, remediation, release preparation, and evidence. Elapsed lead time, machine cost/runtime, AI fit, uncertainty, and consequence risk remain separate so a faster generator cannot hide a review or production bottleneck.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) replaces the draft's WCAG 2.1 target and requires an accessible alternative to drag-and-drop.
- [NIST AI RMF](https://www.nist.gov/itl/ai-risk-management-framework) informs model provenance, evaluation, monitoring, and human oversight.
- [OWASP SAMM](https://owasp.org/www-project-samm/) informs risk-driven, measurable security activities across design, implementation, verification, and operations.

## 6. Product Boundary Decisions

Delivery OS is not:

- A code host, IDE, CI/CD engine, or repository synchronizer.
- A general-purpose configurable project-management platform.
- A design editor.
- A contract, billing, CRM, or time-tracking system.
- A wrapper around one AI provider or one agent client.

Its differentiated responsibility is to preserve trusted intent and evidence across requirement intake, progressive specification, typed delivery work, human review, client visibility, and safe change propagation.
