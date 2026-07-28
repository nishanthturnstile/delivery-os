# Delivery OS Documentation

This directory is the project’s source of truth. Start here; do not infer current decisions from old issue text, chat history, or framework defaults.

## Reading Path

For product or implementation work, read:

1. [Product Plan](core/product-plan.md) — authoritative product intent and functional requirements.
2. [Domain Model & Workflows](core/domain-workflows.md) — invariants, permissions, states, approvals, and change behavior.
3. [Architecture & Contracts](core/architecture-contracts.md) — runtime boundaries, persistence, interfaces, storage, OCR, and frontend stack.
4. [Design System](core/design-system.md) — UI component layers, visual principles, accessibility, and governance.
5. [Development Guidelines](core/development-guidelines.md) — coding, testing, AI-assisted implementation, and documentation rules.
6. [Module-Wise Implementation Roadmap](planning/implementation-roadmap.md) — the single source of implementation status, dependency waves, exit gates, ownership, and evidence tracking.
7. [Delivery Backlog](planning/delivery-backlog.md) — dependency-ordered implementation slices and acceptance criteria.

Current implementation evidence: [W2 M2 Client & Project Registry validation](validation/w2-m2-client-project-registry.md).

Before pilot or production changes, also read [Pilot Scope & Readiness](planning/pilot-scope.md), [AI, Security & Evaluation](assurance/ai-security-evaluation.md), and [Infrastructure & Deployment](deployment/infrastructure.md).

## Directory Map

```text
docs/
  core/          Stable normative product and engineering contracts
  planning/      Evolving scope, sequencing, and readiness plans
  validation/    Implementation results, test evidence, and external follow-up
  assurance/     Security, privacy, AI quality, and verification gates
  deployment/    Environment, provider, backup, and operational configuration
  research/      Evidence and alternatives behind accepted decisions
```

### Core

- [Product Plan](core/product-plan.md)
- [Domain Model & Workflows](core/domain-workflows.md)
- [Architecture & Contracts](core/architecture-contracts.md)
- [Design System](core/design-system.md)
- [Development Guidelines](core/development-guidelines.md)
- [Technology Decisions](core/technology-decisions.md)

### Planning and Assurance

- [Controlled Pilot Scope & Readiness](planning/pilot-scope.md)
- [Delivery Backlog & Traceability](planning/delivery-backlog.md)
- [Module-Wise Implementation Roadmap](planning/implementation-roadmap.md)
- [W0 Platform Foundation Plan](planning/w0-platform-foundation.md)
- [W0 Platform Foundation Validation](validation/w0-platform-foundation.md)
- [W1 M1 Identity, Tenancy & Workspace Plan](planning/w1-m1-identity-tenancy-workspace.md)
- [W1 M1 Identity, Tenancy & Workspace Validation](validation/w1-m1-identity-tenancy-workspace.md)
- [W2 M2 Client & Project Registry Execution Packet](planning/w2-m2-client-project-registry.md)
- [W2 M2 Client & Project Registry Validation](validation/w2-m2-client-project-registry.md)
- [W3 M3 Requirement Intake & Template Engine Plan](planning/w3-m3-requirement-intake-template-engine.md)
- [W3 M3 Requirement Intake & Template Engine Validation](validation/w3-m3-requirement-intake-template-engine.md)
- [W3 M3 External Promotion and Validation Gates](planning/decisions/w3-m3-external-promotion-and-validation-gates.md)
- [AI, Security & Evaluation](assurance/ai-security-evaluation.md)
- [Infrastructure & Deployment](deployment/infrastructure.md)
- [M3 Requirement Intake Operations](deployment/m3-requirement-operations.md)

### Research

- [AI-Assisted Work Sizing](research/ai-assisted-sizing.md)
- [OCR Evaluation](research/ocr-evaluation.md)
- [2026 Framework Assessment](research/framework-assessment.md)

## Authority and Change Rules

1. Product Plan controls product intent.
2. Domain Model & Workflows controls business invariants and state behavior.
3. Architecture & Contracts, Design System, and Development Guidelines control implementation boundaries.
4. Pilot Scope and AI/Security specifications control launch gates.
5. Delivery Backlog controls sequence and acceptance criteria, not implementation status or product behavior.
6. Research explains decisions but is not normative when it conflicts with a core document.
7. Resolve a conflict by changing the earliest authoritative source, then propagate the decision to every dependent document in the same change.
8. A technology decision or normative rule change requires an entry in [Technology Decisions](core/technology-decisions.md) and link validation.

## Maintenance Rules for Humans and Agents

- Use relative Markdown links and stable headings.
- State document status and parents/related documents near the top.
- Put durable rules in `core/`; put time-bound investigation in `research/`; put rollout sequence in `planning/`.
- Do not duplicate normative tables. Research documents should link to the canonical rule.
- Keep provider limitations explicit; “S3-compatible” never implies complete AWS S3 parity.
- Record the exact document commit in approved implementation evidence.
- Record and update implementation status only in the Module-Wise Implementation Roadmap. Before an
  agent begins a dependent module, it must verify that the predecessor is `Complete` there and that
  its linked validation evidence is stable.
- Run the documentation link/anchor and terminology checks before merging.
