# Delivery OS — Product Plan & Detailed Requirements

**Document type:** Authoritative Product Requirements Baseline
**Status:** Implementation-ready draft for internal dogfood
**Audience:** Product, Design, Engineering, Security, and Delivery teams building Delivery OS
**Scope:** This document defines what Delivery OS is, what it must do, and the product rules that must remain stable across implementations. Detailed domain rules, architecture, AI controls, pilot gates, and implementation sequencing live in the linked companion specifications.

**Companion specifications**
- [Pilot Scope & Readiness](../planning/pilot-scope.md)
- [Domain Model & Workflows](domain-workflows.md)
- [Architecture & Contracts](architecture-contracts.md)
- [Design System](design-system.md)
- [AI, Security & Evaluation](../assurance/ai-security-evaluation.md)
- [Delivery Backlog & Traceability](../planning/delivery-backlog.md)
- [AI-Assisted Work Sizing Research](../research/ai-assisted-sizing.md)
- [OCR Evaluation](../research/ocr-evaluation.md)
- [2026 Framework Assessment](../research/framework-assessment.md)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision & Goals](#2-product-vision--goals)
3. [Target Users & Personas](#3-target-users--personas)
4. [Product Principles](#4-product-principles)
5. [Delivery Framework — Lean Vertical Delivery (LVD)](#5-delivery-framework--lean-vertical-delivery-lvd)
6. [Functional Scope — Module Overview](#6-functional-scope--module-overview)
7. [Detailed Functional Requirements](#7-detailed-functional-requirements)
    - [M1. Identity, Tenancy & Workspace](#m1-identity-tenancy--workspace)
    - [M2. Client & Project Registry](#m2-client--project-registry)
    - [M3. Requirement Intake & Template Engine](#m3-requirement-intake--template-engine)
    - [M4. Technical, UX & Delivery Planning](#m4-technical-ux--delivery-planning)
    - [M5. Cost & Subscription Planning](#m5-cost--subscription-planning)
    - [M6. Work Breakdown Engine](#m6-work-breakdown-engine)
    - [M7. Sprint & Delivery Board](#m7-sprint--delivery-board)
    - [M8. Client Portal & Dashboard](#m8-client-portal--dashboard)
    - [M9. Change Management & Re-analysis Engine](#m9-change-management--re-analysis-engine)
    - [M10. MCP Server & Agent Enablement](#m10-mcp-server--agent-enablement)
    - [Cross-Cutting Requirements](#cross-cutting-requirements)
8. [Standard Requirement Template (Sections A–H)](#8-standard-requirement-template-sections-ah)
9. [Roles & Permissions Matrix](#9-roles--permissions-matrix)
10. [Core Workflows & State Machines](#10-core-workflows--state-machines)
11. [Non-Functional Requirements](#11-non-functional-requirements)
12. [Success Metrics](#12-success-metrics)
13. [Assumptions & Out-of-Scope](#13-assumptions--out-of-scope)
14. [Glossary](#14-glossary)

---

## 1. Executive Summary

Delivery OS is an **AI-native, end-to-end delivery lifecycle platform** designed for **startups and small teams** that need to move fast without losing rigor. It replaces the patchwork of tools typically used across a project's life — requirement docs, planning spreadsheets, ticket trackers, client-status decks — with a **single source of truth** that spans idea capture through delivery, change management, and agent-driven execution.

The platform standardizes how work is captured, planned, broken down, executed, and evolved. It is opinionated about **vertical-slice delivery**, **short cadence**, **client transparency**, and **AI/agent collaboration**, and treats human approvals as first-class controls at every critical step.

**Delivery OS exists to answer three questions for any project at any point in time:**
1. What did the client actually ask for, and what has been agreed?
2. What is the team doing right now, and what's next?
3. What has changed, and what has been delivered so far?

---

## 2. Product Vision & Goals

### 2.1 Vision
> Every small team should be able to deliver software with the discipline of a mature enterprise and the speed of a startup — without drowning in tools, ceremonies, or lost context.

### 2.2 Product Goals
| # | Goal | How Delivery OS Delivers |
|---|---|---|
| G1 | **Nothing is missed at intake** | Standardized template + AI extraction + explicit gap detection |
| G2 | **One tool, whole lifecycle** | Requirement → Plan → Specifications → Typed Work → Sprint → Client view — all in one place |
| G3 | **Ship small, ship often** | Vertical Outcome Stories by default, short cadence, type-specific DoD |
| G4 | **Clients always know what's happening** | Live client dashboard, weekly checkpoints, approval trail |
| G5 | **Requirement ↔ implementation stay in sync** | Change re-analysis engine + immutable delivered history |
| G6 | **AI agents are first-class collaborators** | MCP server exposes portal to agents; every agent change is human-approved |
| G7 | **Best practices are default** | Templates, checklists, and workflows encode the "right way" |

### 2.3 Non-Goals (for the product itself)
- Delivery OS is **not** a code editor, not a design tool, not a CRM.
- Delivery OS does **not** integrate with Jira, Azure DevOps, Confluence, or similar tools in its initial form; it replaces them within its scope.
- Delivery OS does **not** attempt to automate client relationships, contracts, or invoicing.

---

## 3. Target Users & Personas

Delivery OS is built for **startups, product teams, and small delivery agencies (typically 2–25 people)** who deliver software either as a product or as client work.

### 3.1 Personas

**P1. Alex — Founder / Admin**
- Sets up the workspace, invites the team, manages clients.
- Cares about visibility across all projects and delivery health.

**P2. Priya — Project Manager (PM)**
- Owns a project end-to-end.
- Runs intake, coordinates approvals, manages sprints, communicates with the client.

**P3. Ravi — Project Lead (Optional)**
- Technical lead on larger or more complex projects.
- Owns technical planning, reviews work, unblocks the team.

**P4. Sam — Team Member**
- Engineer/designer executing work, often with AI assistance in the IDE.
- Wants clear, well-scoped Outcome Stories and honest supporting work types with minimal ceremony.

**P5. Jordan — Client Stakeholder**
- External user invited to a specific project.
- Wants transparency, timely updates, and a clear channel to give feedback and approvals.

**P6. Agent — AI Agent (non-human)**
- Interacts with Delivery OS via MCP.
- Reads approved context, implements work, submits evidence, and proposes updates under human controls.

---

## 4. Product Principles

These principles guide every product decision and every requirement in this document.

1. **Standardize the important, simplify the rest.** Templates, DoD, and workflows are non-negotiable; UI/UX is minimal, opinionated, and fast.
2. **Vertical slices only.** Every unit of work is independently shippable and testable.
3. **Small cadence, tight loops.** 1-week sprints, weekly client checkpoints, always-visible progress.
4. **Approval follows material impact.** Initial requirements and material client commitments require explicit approval. Internal refinements, evidence, status updates, and non-material technical changes require the appropriate human review, not unnecessary client approval.
5. **Preserve decision and delivery history.** Approved artifact snapshots and Done completion snapshots are immutable. Later changes use explicit deltas and successors; append-only evidence and audited metadata corrections remain possible.
6. **AI accelerates humans; it does not replace their judgment.** AI extracts, suggests, decomposes, and estimates — humans confirm.
7. **Clients are participants, not spectators.** Client accounts are first-class; the client dashboard is a product surface, not an afterthought.
8. **Delivery OS is the delivery source of truth.** Requirements, plans, specifications, work, approvals, evidence, and change history are authoritative in Delivery OS. Code remains in external developer environments and repositories without tracker synchronization.

---

## 5. Delivery Framework — Lean Vertical Delivery (LVD)

Delivery OS is opinionated: it ships with **Lean Vertical Delivery (LVD)** as its default and only framework. LVD is designed for small AI-assisted teams that need speed without chaos. The framework governs projects managed inside Delivery OS; it does not prescribe how Delivery OS itself must be implemented.

### 5.1 Core Rules
- **Sprint length:** 1 week by default; a project may deliberately use a 1- or 2-week cadence.
- **Work types:** `Outcome Story`, `Enabler`, `Defect`, `Spike`, and `Operational Task`.
- **Verticality:** Outcome Stories deliver an independently testable outcome across every applicable layer. UI, backend, data, and validation are included only where the outcome requires them.
- **Workflow states:** `Backlog → Ready → In Progress → In Review → Done`. `Blocked` is an overlay on active work, not a separate lifecycle state.
- **Estimation:** AI suggests an AI-aware verified-delivery estimate; a human owns it. The estimate separates active human attention, elapsed lead time, machine runtime/cost, uncertainty, AI fit, and consequence risk. Forecasts learn from observed project outcomes without applying a universal “AI productivity” multiplier.
- **Definition of Done:** Every work type has a mandatory, versioned DoD. Done requires human review and a frozen completion snapshot.
- **Client checkpoint:** One weekly checkpoint/demo is scheduled by default for external projects but may be moved or waived with a reason. It is for transparency and feedback, not story approval.

### 5.2 Ceremonies

| Ceremony | Frequency | Duration | Attendees | Purpose |
|---|---|---|---|---|
| Sprint Kickoff | Weekly (Monday) | ≤ 30 min | Team | Confirm sprint scope, ownership |
| Async Standup | Daily | In-portal only | Team | Status, blockers, next |
| Client Checkpoint / Demo | Weekly by default | ≤ 30 min | Team + Client | Progress, clarification, demo, feedback |
| Team Retrospective | Sprint end | ≤ 30 min | Team only | Review flow, quality, and improvement actions |

### 5.3 AI-Aware Verified Delivery Sizing

LVD retains T-shirt labels as a planning shorthand but changes what they mean. Size is derived from the upper bound of **Verified Delivery Effort (VDE)**: aggregate active human attention from work start through production-ready evidence and human review. It is not based on code volume, prompt count, tokens, or the time an agent spends running.

VDE includes:

1. Codebase, architecture, requirement, and risk understanding.
2. Implementation planning, context preparation, prompting, and agent supervision.
3. AI-generated and human-authored implementation.
4. Automated and manual testing, security/accessibility checks, and integration validation.
5. Human review, correction, re-generation, remediation, and re-review.
6. Documentation, migration/deployment/rollback preparation, observability, and implementation evidence.

| Size | VDE active-human-attention range | Typical profile | Rule |
|---|---:|---|---|
| XS | 0.5–2 hours | Known pattern, narrow change, deterministic proof | Ready when all gates are known |
| S | >2–4 hours | Small vertical slice with limited integration and review | Ready when all gates are known |
| M | >4–8 hours | Standard vertical slice with multi-layer validation | Preferred maximum routine batch |
| L | >8–16 hours | Broad verification surface, migration/integration, or several correction cycles | PM/Lead readiness review and split challenge |
| XL | >16 hours or unbounded | Too large, insufficiently understood, or unsafe to verify as one unit | **Must be split or converted to a time-boxed Spike before Ready** |

Every estimate also records:

- An elapsed lead-time range, including unattended agent/CI time and waits for review or environments.
- Machine runtime and cost budget as operational constraints, never as human capacity.
- AI fit `A0–A3` (`prohibited/manual`, `low`, `moderate`, `high`) for the pinned tool/model and repository context.
- Uncertainty `U0–U3` (`routine`, `bounded`, `material unknowns`, `unbounded`). `U3` requires a Spike or clarification before Ready.
- Consequence risk `R1–R4` (`low`, `moderate`, `high`, `critical`). Risk changes required verification and review, not the definition of effort.
- Estimate basis, dominant drivers, assumptions, and the tool/model/workflow profile used.

The size follows the VDE upper bound after required verification is included. High-risk work cannot be made smaller by claiming high AI fit: `R3` requires independent human review and `R4` has an L size floor, independent review, and explicit security/operational evidence. Estimates may change until work starts; the complete estimate-at-start is frozen in the completion snapshot.

No global AI speedup factor is allowed. Defaults are calibrated per project, work type, repository area, tool/model profile, and risk class using VDE range accuracy, elapsed cycle time, review returns, escaped defects, and rework. Agent runs, prompts, tokens, and accepted lines are diagnostic telemetry only and are never performance targets. See [AI-Assisted Work Sizing Research](../research/ai-assisted-sizing.md).

### 5.4 Team-Size-Aware Planning
Team size and composition are captured at project creation. LVD uses this to:
- Calculate member availability and role-constrained capacity ranges.
- Suggest Module/Feature/work-item batching per sprint.
- Warn when the plan exceeds capacity for the target timeline.
- Incorporate observed throughput, VDE calibration, cycle time, review/rework, and stability as project history accumulates.

---

## 6. Functional Scope — Module Overview

Delivery OS is composed of **ten functional modules** and a set of **cross-cutting capabilities**. Detailed requirements for each follow in Section 7.

| # | Module | Purpose |
|---|---|---|
| M1 | Identity, Tenancy & Workspace | Sign-up, tenancy, workspace setup, roles, invitations |
| M2 | Client & Project Registry | Manage clients, internal + external projects, team composition |
| M3 | Requirement Intake & Template Engine | Multi-format upload, AI extraction, gap detection, approval |
| M4 | Technical, UX & Delivery Planning | Capture project baselines and feature-level design deltas |
| M5 | Cost & Subscription Planning | Capture subscriptions/tools/costs manually with a strong visual layer |
| M6 | Work Breakdown Engine | Progressively elaborate approved context into Modules → Features → typed work |
| M7 | Sprint & Delivery Board | Plan and run sprints, track ownership, visualize progress |
| M8 | Client Portal & Dashboard | Give clients a live, transparent, interactive view of the project |
| M9 | Change Management & Re-analysis | Handle scope changes; preserve delivered history |
| M10 | MCP Server & Agent Enablement | Expose portal to AI agents; route agent changes through human approval |
| — | Cross-Cutting | Audit, notifications, search, activity feeds, best-practice checklists |

---

## 7. Detailed Functional Requirements

Each module below lists **Functional Requirements (FR)**. Requirements are numbered for traceability (e.g., `FR-M1-01`).

---

### M1. Identity, Tenancy & Workspace

**Purpose:** Enable a new user to sign up, become an Admin, set up their workspace, and invite others.

**Functional Requirements**

- **FR-M1-01** The system shall allow a user with a verified email address to create an account using email/password or magic-link authentication.
- **FR-M1-02** A verified user shall explicitly create a **Workspace** and become its first Admin. Email domains shall not create, identify, or confer ownership of a tenant.
- **FR-M1-03** Workspace membership shall be invitation-based. A user may belong to multiple workspaces, and invited clients may use any verified email address.
- **FR-M1-04** The system shall support email/password and magic-link authentication, password reset, session listing/revocation, TOTP MFA, and recovery codes for team members and clients.
- **FR-M1-05** Admins shall configure the **Workspace Profile**, including: company name, logo, primary color, time zone, and default working hours.
- **FR-M1-06** Workspace roles shall be **Admin** and **Member**. Admins shall invite and manage workspace members.
- **FR-M1-07** Project roles shall be scoped independently as **Project Manager, Project Lead, Contributor, Viewer,** and **Client Stakeholder**. Admins and Project Managers shall invite clients to specific projects only.
- **FR-M1-08** Invitations shall expire after **7 days** and be re-issuable.
- **FR-M1-09** The system shall support **role changes** by Admins, with all changes captured in the audit log.
- **FR-M1-10** The system shall support **deactivation** of users; deactivated users retain historical attribution but cannot sign in.
- **FR-M1-11** A workspace shall have at least one active Admin at all times.
- **FR-M1-12** Users shall manage their own profile: display name, avatar, notification preferences, password.
- **FR-M1-13** Admin operations and authorization of MCP clients shall require recent step-up TOTP verification, including when the session originated from a magic link.
- **FR-M1-14** Workspace membership, project membership, and effective permissions shall be enforced server-side on every read, search, export, download, mutation, and MCP action.

---

### M2. Client & Project Registry

**Purpose:** Manage the portfolio of clients and projects (both external and internal).

**Functional Requirements**

- **FR-M2-01** Admins and PMs shall create **Clients**. A client record includes: name, logo, primary contact, industry, notes.
- **FR-M2-02** Admins and PMs shall create **Projects** under a Client, or as **Internal Projects** (no client).
- **FR-M2-03** Every Project shall capture at creation time:
  - Project name and short description
  - Project type (External / Internal)
  - Target start date and target end date
  - **Team membership, role composition, availability, and working calendar**
  - Assigned **Project Manager** (mandatory)
  - Assigned **Project Lead** (optional)
  - Assigned **Team Members**
  - Assigned **Client Stakeholders** (for external projects)
- **FR-M2-04** Team size and composition shall be editable throughout the project; changes shall be recorded in the audit log and shall trigger a re-calculation of sprint capacity.
- **FR-M2-05** Each Project shall have a governed lifecycle: `Draft → Intake → Planning → Execution → Completed → Archived`, plus `On Hold` and `Cancelled`. Hold, cancellation, resume, backward transitions, and archival require a reason and an audit event.
- **FR-M2-06** The system shall provide a **portfolio view** for Admins/PMs showing all clients and projects with health indicators (status, current sprint, blockers, upcoming milestones).
- **FR-M2-07** Projects shall be searchable and filterable by client, status, PM, and date range.
- **FR-M2-08** Archiving a project shall make it read-only but preserve all data.
- **FR-M2-09** Entry into Planning, Execution, and Completed shall enforce the readiness gates defined in the Domain Model & Workflows specification.
- **FR-M2-10** Modules shall act as project outcome milestones and capture a target window, outcome statement, success criteria, status, dependencies, and client visibility.

---

### M3. Requirement Intake & Template Engine

**Purpose:** Capture all project requirements in a standardized template, with AI-assisted extraction from uploaded documents and explicit gap detection.

**Functional Requirements**

**Intake — Document Upload**
- **FR-M3-01** The pilot shall support **PDF (including scanned-page OCR), DOCX, Markdown (.md), and plain text (.txt)**. PPTX and XLSX are deferred.
- **FR-M3-02** Individual files shall be limited to 50 MB and total retained source artifacts to 500 MB per project during the pilot.
- **FR-M3-03** The system shall accept **multiple documents per project** (e.g., an RFP plus a follow-up clarification plus a call transcript) and shall process them together as a single intake set.
- **FR-M3-04** Each uploaded document shall be content-immutable while retained, linked to the project, and viewable/downloadable only by authorized users. Authorized retention purge remains possible.
- **FR-M3-04A** Uploads shall be quarantined, MIME-validated, malware-scanned, and processed asynchronously. Each artifact shall expose `Queued`, `Scanning`, `Processing`, `Succeeded`, `Needs Attention`, or `Failed` state with retry-safe diagnostics.

**AI Extraction**
- **FR-M3-05** The system shall automatically extract requirement content from the uploaded documents and populate the **Standard Requirement Template** (defined in Section 8).
- **FR-M3-06** Every extracted claim shall retain exact source citation, extraction/generation provenance, and evidence-based quality signals derived from citation support, source agreement, schema validation, and evaluated workflow performance.
- **FR-M3-07** Users shall accept, edit, or reject each AI-extracted value inline.
- **FR-M3-08** Users shall manually add or override any field regardless of AI extraction.
- **FR-M3-08A** Conflicting claims shall be preserved as a first-class conflict record. A conflict affecting a required field is blocking until a human selects or authors the canonical value and records a resolution note.

**Gap Detection**
- **FR-M3-09** The system shall identify missing, weakly supported, conflicting, or conditionally required fields and present them as a **Gaps to Close** checklist.
- **FR-M3-10** For each gap, the system shall suggest **clarifying questions** the PM can send to the client.
- **FR-M3-11** Templates shall apply fields conditionally. Users may mark a field **Not Applicable** with justification or classify an unresolved item as **Accepted Risk** with owner, rationale, and review date. Approval requires zero unresolved Blocking gaps.

**Versioning**
- **FR-M3-12** Drafts shall autosave with edit history. Submission shall freeze a content-addressed review snapshot; approval shall create a numbered immutable baseline. Post-approval changes shall be explicit deltas.
- **FR-M3-13** Users shall view a diff between any two versions of the requirement.

**Approval**
- **FR-M3-14** The requirement shall pass through an approval workflow: `Draft → In Review → Approved` (with `Changes Requested` as a return path).
- **FR-M3-15** Approval requires zero unresolved Blocking gaps, PM approval, and—for external projects—the first binding decision from any assigned Client Stakeholder. A rejection closes that approval request and returns a new revision to Draft.
- **FR-M3-16** An approved Requirement baseline is a mandatory prerequisite for M6; Draft or In Review Requirement content shall never be used as authoritative generation context.
- **FR-M3-17** All approvals shall be recorded with timestamp, actor, and comments in the audit log.
- **FR-M3-18** AI failure, quota exhaustion, or unusable output shall never prevent manual authoring, review, or approval.

---

### M4. Technical, UX & Delivery Planning

**Purpose:** Capture stable technical and UX baselines plus focused feature-level deltas describing how approved behavior will be built and experienced.

**Functional Requirements**

- **FR-M4-01** A Technical Plan baseline shall be created after Requirement approval for every project; an internal project may skip it only through an explicit Admin waiver.
- **FR-M4-02** The Technical Plan shall be a structured document with the following mandatory sections (each may be marked N/A with justification):
  - **Technical Architecture** (components, interactions, data flow)
  - **Infrastructure Requirements** (compute, storage, network, environments)
  - **Deployment Approach** (target environments, deployment model, rollout strategy)
  - **CI/CD Setup** (build, test, release automation approach)
  - **Data & Storage Considerations** (data sources, retention, migration)
  - **Security & Compliance Considerations**
  - **Observability & Operations** (monitoring, logging, alerting expectations)
  - **Third-Party Services & Integrations**
  - **Risks & Mitigations**
  - **Assumptions & Constraints**
- **FR-M4-03** The Technical Plan shall be linked to the approved requirement version it addresses.
- **FR-M4-04** The system shall provide AI assistance to draft initial content in each section based on the approved requirement, which the team can accept, edit, or replace.
- **FR-M4-05** The Technical Plan shall use draft, frozen review snapshot, approved baseline, and delta semantics. Approvers are the PM and, if assigned, Project Lead.
- **FR-M4-06** Clients may view or comment on a shared Technical Plan but shall not approve it.
- **FR-M4-07** All approvals shall be recorded in the audit log.
- **FR-M4-08** A first-class UX Plan baseline shall be required when a user interface is in scope and may be waived with justification otherwise. It shall capture journeys, information architecture, interaction and state rules, responsive behavior, content guidance, accessibility expectations, and immutable external design references.
- **FR-M4-09** Significant features and material changes shall attach focused Technical and UX deltas to the applicable Feature Specification instead of rewriting an entire approved baseline.
- **FR-M4-10** A significant Feature Specification shall capture objective, actors, behavior scenarios, acceptance rules, business rules, data and interface impact, allocated NFRs, UX references, exclusions, risks, open questions, and traceability.
- **FR-M4-11** A compact specification embedded in a work item is allowed only when it traces to an approved Feature Specification and introduces no new behavior, permissions, data classification, external interface, architecture decision, material UX change, or client commitment.
- **FR-M4-12** Feature Specifications and design deltas are approved internally by the PM and, if assigned, Project Lead. Clients may comment on explicitly shared content but do not provide feature-level approval.

---

### M5. Cost & Subscription Planning

**Purpose:** Capture the expected tools, subscriptions, services, and rough cost estimates for the project, presented in a visually attractive, easy-to-read format.

**Functional Requirements**

- **FR-M5-01** The Cost Plan shall be an optional project track for estimated delivery and operating costs and shall never block requirement approval, specification, work breakdown, or execution.
- **FR-M5-02** The Cost Plan shall support the following item categories (extensible):
  - Cloud infrastructure (compute, storage, network)
  - SaaS subscriptions (per-seat and flat)
  - Third-party APIs (usage-based)
  - AI/LLM usage
  - Domains, certificates, and licenses
  - One-time setup costs
  - Other (free-text)
- **FR-M5-03** For each cost item, users shall capture: name, category, description, unit (per month / per user / per call / one-time), unit cost, quantity, currency, and notes.
- **FR-M5-04** The system shall compute per-item totals, category subtotals, monthly totals, and one-time totals automatically.
- **FR-M5-05** All pilot cost data shall be entered manually. External pricing and live FX APIs are deferred.
- **FR-M5-06** The system shall present the Cost Plan through a **visually attractive dashboard** that includes at minimum: category-wise breakdown (chart), monthly recurring vs. one-time split, top cost drivers, and total project cost estimate.
- **FR-M5-07** Users shall export the Cost Plan as a shareable view (viewable link) and as a downloadable document.
- **FR-M5-08** The Cost Plan shall use the standard draft/review-snapshot/baseline/delta model and require PM approval. Clients may view shared values, but only a material change to an agreed client commitment enters client approval through M9.
- **FR-M5-09** All cost items shall support currency selection at the item level, with a project default currency; the dashboard shall convert to project currency using a manually maintained rate (no live FX).
- **FR-M5-10** Cost calculations shall use fixed-precision decimal arithmetic and retain quantity, billing basis, duration, currency, manual exchange rate, rate effective date, and calculation snapshot.

---

### M6. Work Breakdown Engine

**Purpose:** Progressively convert approved project context into a structured, priority-ordered, dependency-aware outcome map and implementation-ready typed work.

**Functional Requirements**

**Decomposition**
- **FR-M6-01** The Work Breakdown Engine shall operate only on the approved Requirement baseline plus applicable Technical, UX, Feature Specification, and design-delta context.
- **FR-M6-02** On user trigger, the system shall first propose a coarse project hierarchy:
  - **Modules** grouped by outcome/capability, with target window, success criteria, priority, status, and dependencies
  - **Features** within each Module
  - Detailed typed work only for a user-selected near-term delivery horizon
- **FR-M6-03** Users shall review, edit, add, remove, reorder, and re-parent any node in the hierarchy.
- **FR-M6-04** Modules shall capture: name, outcome statement, success criteria, description, target window, status, priority, dependencies, rationale, and client visibility.
- **FR-M6-05** Features shall capture: name, description, parent Module, acceptance summary, priority, dependencies.

**Typed Work**
- **FR-M6-06** Work items shall have one type: **Outcome Story, Enabler, Defect, Spike,** or **Operational Task**. Outcome Stories shall deliver an independently testable vertical outcome across all applicable UI, backend, data, and validation layers.
- **FR-M6-07** Every work item shall capture: title, type, outcome/problem statement, acceptance criteria or investigation objective, DoR, DoD, priority, dependencies, tags, owner/collaborators, and traceability to its parent Feature and approved source artifacts.
- **FR-M6-08** Every work item shall have an AI-suggested, human-owned estimate containing VDE active-human-attention range, T-shirt size, elapsed lead-time range, machine runtime/cost budget when material, AI fit, uncertainty, consequence risk, basis, assumptions, and tool/model/workflow profile. Humans may revise it until work begins; the complete estimate-at-start is frozen in the completion snapshot.
- **FR-M6-09** Size shall follow the VDE upper bound after all required validation and review are included. XL or U3 items shall be blocked from Ready until split, clarified, or converted to a time-boxed Spike. L items require explicit Lead/PM readiness review. R3 requires independent human review; R4 has an L size floor plus explicit security and operational evidence.
- **FR-M6-10** Each work type shall have a versioned Definition of Done. The default Outcome Story DoD shall include, where applicable:
  - Applicable UI, backend, data, configuration, and operational changes implemented
  - Automated tests written and passing
  - Manual validation performed
  - Client-visible behavior demoed or documented
  - Documentation updated
  - Required human review completed
- **FR-M6-11** DoR/DoD templates shall use versioned controlled extensions. A work item snapshots the effective template and records any permitted per-item additions.

**Team-Size-Aware Batching**
- **FR-M6-12** The engine shall use member availability, role constraints, dependencies, uncertainty, VDE ranges, elapsed cycle time, review/rework, consequence risk, and observed throughput grouped by relevant project/work/tool profiles to suggest a sprint-by-sprint forecast aligned with the target timeline. It shall not apply a universal AI productivity multiplier.
- **FR-M6-13** The system shall warn when the proposed plan exceeds available capacity or the target end date.

**Traceability**
- **FR-M6-14** Every Module, Feature, Specification, design delta, and work item shall maintain many-to-many traceability to approved requirement fields and cited source claims. Coverage gaps shall be visible before readiness approval.
- **FR-M6-15** Dependencies shall be typed, cycle-checked, and validated before an item becomes Ready.
- **FR-M6-16** Progressive elaboration shall leave distant work at Module/Feature level until a user promotes a Feature into the near-term delivery horizon.

---

### M7. Sprint & Delivery Board

**Purpose:** Plan and run sprints under LVD, visualize progress, and manage ownership.

**Functional Requirements**

**Sprint Setup**
- **FR-M7-01** Sprints shall be 1 week by default. A project may deliberately select a 1- or 2-week cadence, scheduled against its workspace calendar and time zone.
- **FR-M7-02** Each Sprint shall have: sprint number, start date, end date, goal statement, planned work items, capacity summary.
- **FR-M7-03** PMs shall place Ready work into a Sprint; the system shall show VDE/capacity ranges, role bottlenecks, dependencies, AI fit, uncertainty, consequence risk, elapsed forecast, and calibration cohort.
- **FR-M7-03A** Starting a Sprint shall freeze its initial commitment. PM/Lead additions or removals require a reason and preserve initial-versus-current scope metrics. At close, every incomplete item shall be explicitly returned, moved, or re-planned.

**Board Views**
- **FR-M7-04** The Delivery Board shall provide the following views:
  - **Current Sprint** view (Kanban with columns: `Ready`, `In Progress`, `In Review`, `Done`; blocked items remain in their lifecycle column with a visible overlay)
  - **Upcoming Sprints** view (planned but not started)
  - **Backlog** view (all Ready work not yet placed in a sprint)
  - **Project Progress** view (module/feature completion, burndown, timeline)
- **FR-M7-05** Each work card shall show: type, title, owner, size/VDE range, AI fit, uncertainty, consequence risk, priority, tags, DoD progress, and blocker indicator. Elapsed and machine-budget detail shall be available without conflating it with human capacity.
- **FR-M7-06** Users shall filter and search work by type, owner, tag, Module, Feature, status, and size.

**Ownership & Status**
- **FR-M7-07** Work items shall have a single primary owner (Contributor) and optional collaborators.
- **FR-M7-08** Only the primary owner or PM/Lead may start work or change implementer-controlled status. An authorized human reviewer may return In Review work or move it to Done; Done requires completed DoD, structured implementation evidence, and a review decision.
- **FR-M7-09** Blockers shall be captured as structured entries: reason, blocked-by (person or dependency), raised-on date. Blockers shall be visible on the work card and in a project-level Blockers panel.
- **FR-M7-09A** A blocker shall retain the work item's lifecycle state and record severity, owner, target resolution date, resolution, and blocked duration.

**Async Standup**
- **FR-M7-10** The system shall provide a **daily async standup** entry point per project where each team member logs: yesterday, today, blockers. The standup view aggregates entries per day.

**Progress Visualization**
- **FR-M7-11** Project progress shall be visualized as: Module outcome status, Feature completion, work-item completion by type, current sprint burndown, and cumulative delivery over time.
- **FR-M7-12** The system shall highlight at-risk items: overdue work, chronic blockers, dependency risk, and capacity overruns.
- **FR-M7-13** An agent or human implementer moving work to In Review shall submit an implementation report containing change summary, affected components/files, acceptance-criterion results, test commands/results, manual validation, unresolved risks, and optional external references.
- **FR-M7-14** Independent human review is preferred. Self-review is allowed with recorded validation evidence; projects may require a separate reviewer for selected risk levels.
- **FR-M7-15** Done shall freeze scope, acceptance criteria, the complete estimate-at-start, aggregate actual VDE band, elapsed cycle time, DoD, implementation report, and review decision. Append-only comments/evidence and audited non-substantive metadata corrections remain allowed.

---

### M8. Client Portal & Dashboard

**Purpose:** Give clients a live, transparent, interactive view of the project scoped only to what they are allowed to see.

**Functional Requirements**

- **FR-M8-01** Clients shall log in using an invited, verified email account. Clients shall only see projects to which they are explicitly assigned.
- **FR-M8-02** The Client Dashboard shall provide the following views (all scoped to the client's project):
  - **Project Overview** — status, current sprint goal, progress at module/feature level
  - **What We're Working On Now** — Client-visible work currently in the sprint with status
  - **What's Coming Next** — the next 1–2 sprints in outline
  - **Delivered** — cumulative view of what has been completed and approved
  - **Requirements** — read-only view of the approved requirement and version history
  - **Cost Plan** — read-only visual view (if the PM has shared it)
  - **Changes** — view and decide material requirement changes that require client approval
- **FR-M8-03** Clients shall submit one contextual Client Input on a requirement, module, feature, work item, or project view. The PM shall triage it as Clarification, Defect, Non-material Refinement, or Material Change, with ownership, status, links, and audited reclassification.
- **FR-M8-04** Clients shall provide feedback during or after checkpoints without formally approving stories, features, sprints, or Done work.
- **FR-M8-05** Clients shall approve or reject only the initial external Requirement baseline and later material changes to agreed behavior, scope, acceptance terms, cost commitment, target date, or client-visible outcome.
- **FR-M8-06** Every shareable artifact, attachment, comment, and evidence entry shall have `Team-only` or `Client-visible` audience. Clients shall never see Team-only content, other clients' projects, or workspace settings.
- **FR-M8-07** Clients shall receive notifications for: pending approvals, sprint demos, delivered items, and responses to their clarifications.
- **FR-M8-08** PMs shall be able to preview the client portal using the selected Client Stakeholder's effective permissions and audience filters.

---

### M9. Change Management & Re-analysis Engine

**Purpose:** Handle changes to requirements after approval, keeping the plan and delivered work coherent and history preserved.

**Functional Requirements**

**Change Intake**
- **FR-M9-01** Change requests may originate from: the client, the team, or an AI agent (via MCP).
- **FR-M9-02** Change requests may be raised as: a new requirement document upload, an edit to an approved requirement field, or a free-text change proposal.

**Re-analysis**
- **FR-M9-03** When a change request is submitted, the system shall run an **Impact Re-analysis** and produce an Impact Report containing:
  - Requirement fields affected
  - Technical and UX baseline/delta decisions affected
  - Modules affected
  - Features affected
  - Feature Specifications affected
  - Work items affected, categorized as: **To Update**, **To Add**, **To Deprecate**
  - Active sprint/work whose implementation contract would change
  - Done work whose delivered behavior would change (see FR-M9-05)
  - Estimated effort delta
  - Estimated cost delta (if cost items are affected)
- **FR-M9-04** The Impact Report shall be reviewable and editable by the PM before materiality is confirmed. Only a material external-project change proceeds to Client Review.

**Preservation of Delivered History**
- **FR-M9-05** Done completion snapshots are immutable. A behavioral change to delivered work shall create a typed successor item linked to the original with reason and diff.
- **FR-M9-06** Delivered modules/features shall retain their historical record; scope changes create new modules/features where appropriate, linked to the originals.

**Approval**
- **FR-M9-07** Change requests shall pass through `Proposed → Impact Analysis → PM Review → [Client Review when material] → Approved / Rejected → Change Set Review → Applied`.
- **FR-M9-08** External client approval is mandatory only for material changes, regardless of whether the originator is a client, team member, or agent. The first decision from any assigned Client Stakeholder is binding for that approval request.
- **FR-M9-09** Approval shall create a new immutable Requirement baseline but shall not automatically rewrite downstream records. The system shall generate a reviewable change set covering plans, specs, modules, backlog, active work, sprint impact, and optional cost items.
- **FR-M9-10** PM/Lead shall explicitly apply the downstream change set. Active work shall be continued, paused, split, or superseded explicitly; no In Progress, In Review, or Done snapshot may be silently rewritten.
- **FR-M9-11** Non-material refinements require PM/Lead review and audit but no client approval.

---

### M10. MCP Server & Agent Enablement

**Purpose:** Expose Delivery OS to AI agents via an MCP interface so agents can read, plan, implement, validate, and propose changes — with human approval as the final gate.

**Functional Requirements**

**Availability & Compatibility**
- **FR-M10-01** Delivery OS shall expose an **MCP server** as a first-class product surface.
- **FR-M10-02** The remote HTTP MCP server shall be verified with **Codex, OpenCode, and representative VS Code-hosted MCP clients**. Delivery OS shall also ship a versioned, tool-agnostic workflow pack and client setup guidance.

**Access Control**
- **FR-M10-03** Pilot agent access shall use interactive, user-delegated OAuth 2.1 with PKCE, consent, protected-resource discovery, audience-bound short-lived access tokens, revocation, and incremental least-privilege scopes. Static pasted tokens and unattended service accounts are deferred.
- **FR-M10-04** Every agent action shall be logged with authorizing user, OAuth client/grant, scopes, action, target, and correlation ID.

**Agent Capabilities**
- **FR-M10-05** Through the MCP server, agents shall be able to:
  - **Read** approved Requirement, Technical, UX, Feature Specification, cost (when permitted), module/feature/work hierarchy, templates, and current sprint state
  - **Identify missing requirement details** and surface them to the user in-IDE
  - **Explain the plan** to the user (summaries, dependencies, next work)
  - **Start implementation** against a Ready work item (agents update it to `In Progress`)
  - **Validate** implemented work against applicable approved context, acceptance criteria, and DoD
  - **Submit structured implementation evidence** and move work to `In Review`
  - **Propose updates** to requirements, specifications, work, or related records when implementation reveals a needed change

**Human Approval of Agent Changes**
- **FR-M10-06** Agent-proposed baseline changes shall enter M9 and use the same materiality policy as human changes. Agent comments, evidence, blockers, and allowed status updates are not requirement changes.
- **FR-M10-07** Agents shall not be able to mark work Done; they may request In Review, which routes to a human reviewer.

**Safety**
- **FR-M10-08** The MCP server shall enforce rate limits, request size limits, project authorization, versioned scopes, expected entity revision, and idempotency keys on mutations.
- **FR-M10-09** The MCP server shall support read-only consent and scopes for agents that consume context without proposing or updating work.
- **FR-M10-10** MCP tools shall not approve baselines, apply downstream change sets, or move work to Done.
- **FR-M10-11** Every MCP request and resulting domain action shall carry a correlation ID and be auditable without logging access tokens or confidential content.

---

### Cross-Cutting Requirements

**Audit Trail**
- **FR-CC-01** The system shall maintain a basic audit trail on: workspace, membership/roles, clients, projects, source artifacts, Requirements, Technical/UX plans, Feature Specs, Cost Plans, Modules, Features, work items, sprints, approvals, Client Input, change requests/sets, and agent actions.
- **FR-CC-02** Each audit event shall capture: timestamp, actor/user and optional agent client, action, target entity, workspace/project, correlation ID, before/after summary or immutable snapshot reference, and reason where required.
- **FR-CC-03** Audit events shall be **append-only** and viewable by Admins and PMs.
- **FR-CC-04** Audit trails shall be exportable per project.

**Notifications**
- **FR-CC-05** The pilot shall provide invitations and pending-action email plus an in-app inbox for approvals, mentions, blocker escalations, change reviews, and failed background work.
- **FR-CC-06** Granular per-channel/per-event notification preferences are deferred; users shall at minimum control non-transactional email.

**Comments & Mentions**
- **FR-CC-07** Users shall comment on requirements, Technical/UX plans, Feature Specs, cost items, Modules, Features, work items, Client Input, and change requests.
- **FR-CC-08** Users shall @-mention teammates and clients (subject to visibility rules); mentions trigger notifications.

**Search & Activity**
- **FR-CC-09** The pilot shall provide basic project-scoped search across requirements, plans, specifications, modules, features, work items, and comments while enforcing effective permissions and audience. Workspace-wide file-content search is deferred.
- **FR-CC-10** Every project shall have an **activity feed** consolidating recent changes.

**Best-Practice Guardrails**
- **FR-CC-11** The system shall provide **checklists at key transitions**, enforcing best practices before allowing progression:
  - **Definition of Ready** — before a work item becomes Ready
  - **Definition of Done** — before a work item becomes Done
  - **Approval Readiness** — before a requirement/tech plan/cost plan enters review
  - **Sprint Kickoff Readiness** — before a sprint starts
- **FR-CC-12** Guardrail templates shall ship with versioned system defaults. Workspaces may add optional fields/checks, tune applicability, and disable only explicitly optional entries. Projects snapshot the selected template version.

**Data Export**
- **FR-CC-13** Users shall export the following per project as downloadable documents:
  - Approved Requirement
  - Approved Technical Plan
  - Approved Cost Plan
  - Full backlog (Modules/Features/typed work)
  - Sprint report
  - Audit log
- **FR-CC-14** Every shareable record shall enforce an explicit audience and safe inheritance rule. Permission evaluation shall occur at access time and export generation time.
- **FR-CC-15** Eligible deletions shall enter a 30-day recoverable state. After expiry, active data and objects shall be purged and backups shall expire on a documented schedule. Admins shall be able to export a workspace before permanent deletion.
- **FR-CC-16** Concurrent mutations shall use optimistic concurrency. A stale client or agent shall receive the current revision and a conflict response rather than overwrite newer state.
- **FR-CC-17** Background operations shall be idempotent, observable, retryable, and cancellable where safe, with dead-letter handling and actionable failure state.

---

## 8. Standard Requirement Template (Sections A–H)

Every project's requirement is captured against a versioned template derived from these sections. Applicability is conditional. A required item is either resolved, marked **Not Applicable** with justification, or retained as an **Accepted Risk** with owner, rationale, and review date. Blocking gaps prevent approval.

### Section A — Context
- Project name
- Project type (External / Internal)
- Client (if External)
- Sponsor / primary contact
- Team size and composition
- Target timeline (start, end)
- Budget band (optional)

### Section B — Problem & Users
- Problem statement (one-line summary + detailed description)
- Personas / user roles
- Current pain points / job-to-be-done
- Business success metrics (KPIs)

### Section C — Scope
- In-scope capabilities
- Explicit out-of-scope items
- Assumptions
- Constraints
- Dependencies (external teams, vendors, data sources)

### Section D — Functional Requirements
- User journeys / flows
- High-level feature list (feeds M6)
- Data entities involved
- Key business rules

### Section E — Non-Functional Requirements
- Performance and scale targets
- Availability / uptime expectations
- Security requirements
- Compliance requirements (e.g., SOC2, GDPR, HIPAA)
- Accessibility requirements
- Localization / i18n requirements

### Section F — Integrations & Interfaces
- External systems and APIs
- Authentication / SSO
- Payment providers
- Communication channels (email, SMS, push)
- Data import/export needs

### Section G — Delivery Preferences
- Deployment target (SaaS, on-prem, hybrid)
- Environment strategy (dev/stage/prod)
- Handover model
- Post-launch support expectations

### Section H — Risks & Open Questions
- Known risks
- Unknowns to be resolved
- Decisions pending
- Assumptions that need validation

**AI Behavior on This Template**
- Extract claims with exact citations and evidence-based support/validation signals.
- Preserve contradictory claims and flag conflicts as blocking.
- Flag missing, weakly supported, or conditionally required fields as gaps.
- Suggest clarifying questions per gap.
- Never auto-mark a field as N/A; that requires an explicit human action with justification.
- Record provider/model/prompt/schema provenance and never execute instructions found inside source content.

---

## 9. Roles & Permissions Matrix

Permissions combine a workspace role with a project-scoped role. Workspace Admin does not silently make a user the PM/Lead or client approver for every project; Admin override actions are explicit and audited.

| Workspace capability | Admin | Member |
|---|:---:|:---:|
| Manage workspace profile, templates, and security | ✅ | — |
| Invite/deactivate workspace members | ✅ | — |
| Maintain at least one active Admin | ✅ | — |
| Create clients and projects | ✅ | By project-creation policy |
| View workspace audit/export | ✅ | — |
| Delete/restore workspace | ✅ + step-up MFA | — |

| Project capability | PM | Lead | Contributor | Viewer | Client Stakeholder |
|---|:---:|:---:|:---:|:---:|:---:|
| Manage project membership/settings | ✅ | — | — | — | — |
| Upload source documents | ✅ | ✅ | ✅ | — | ✅ |
| Edit Requirement draft | ✅ | ✅ | ✅ when granted | — | Comment |
| Submit/approve internal Requirement step | ✅ | Comment | — | — | External decision |
| Edit Technical/UX plans and Feature Specs | ✅ | ✅ | Contribute/comment | — | Comment when shared |
| Approve Technical/UX/spec artifacts | ✅ | ✅ when assigned | — | — | — |
| Manage Modules/Features/work | ✅ | ✅ | Assigned work | Read | Comment when visible |
| Start/update work | ✅ | ✅ | Own/assigned | — | — |
| Review work to Done | ✅ | ✅ | When reviewer policy permits | — | — |
| Triage client input/change materiality | ✅ | ✅ when delegated | — | — | Submit/comment |
| Approve material change | PM internal gate | Review | — | — | First binding decision |
| Apply downstream change set | ✅ | ✅ | — | — | — |
| Authorize interactive MCP client | ✅ + step-up MFA | ✅ when project policy permits | Own access only | Read scope only | — |
| View project audit | ✅ | ✅ | Own-visible activity | — | Client-visible history |

Every action remains subject to project membership, artifact audience, state-transition rules, and server-side authorization.

---

## 10. Core Workflows & State Machines

### 10.1 Requirement Lifecycle
```
Draft → Frozen Review Snapshot → Approved Baseline
   ↑          ↓ Changes Requested
   └──────────┘
```
- Approval binds to the exact frozen snapshot.
- A later change is a delta that produces a new approved baseline; it never edits the prior baseline.

### 10.2 Technical, UX, Feature Specification & Cost Lifecycle
```
Draft → Frozen Review Snapshot → Approved Baseline/Delta → Superseded
   ↑          ↓ Changes Requested
   └──────────┘
```

### 10.3 Work Item Lifecycle
```
Backlog → Ready → In Progress → In Review → Done
```
- `Blocked` is an overlay on Ready, In Progress, or In Review.
- Ready requires the type-specific DoR, approved traceability, resolved dependencies, size ≠ XL, uncertainty ≠ U3, and the required risk review policy.
- Done requires completed DoD, implementation evidence, and human review.
- Done freezes a completion snapshot; behavioral changes use successor work.

### 10.4 Change Request Lifecycle
```
Proposed → Impact Analysis → PM Review ────────────────→ Approved
                                  └─ if material/external → Client Review
                                                               ↘ Rejected
Approved → Change Set Review → Applied
```
- Approval creates the new Requirement baseline.
- Downstream deltas are applied only after PM/Lead change-set review.

### 10.5 Project Lifecycle
```
Draft → Intake → Planning → Execution → Completed → Archived
  ↘       ↕         ↕          ↕
        On Hold   On Hold    On Hold
  └──────────────────────────────→ Cancelled
```
- Planning, Execution, and Completed have explicit readiness gates.
- Hold, resume, cancellation, governed backward movement, and archive require reason and audit.

---

## 11. Non-Functional Requirements

- **NFR-01 Usability:** The product shall be usable by a first-time Admin without training to complete workspace setup and invite the team within 15 minutes.
- **NFR-02 Performance:** Under the controlled-pilot load profile, p95 interactive reads shall complete within 2 seconds and board views within 3 seconds. OCR, AI, exports, and bulk change analysis shall be asynchronous.
- **NFR-03 Availability:** The controlled pilot shall target 99.5% monthly availability, RTO ≤ 8 hours, and RPO ≤ 24 hours, with tested restoration.
- **NFR-04 Security:** Authentication shall use verified email, secure password hashing, magic links, TOTP step-up for privileged actions, revocable sessions, and OAuth 2.1 for MCP. Data in transit and retained source artifacts shall be encrypted.
- **NFR-05 Data Privacy:** Client data shall be isolated by workspace; no cross-workspace data access is permitted.
- **NFR-06 Auditability:** All state changes on core entities shall be captured in the audit trail per FR-CC-01.
- **NFR-07 Accessibility:** Complete critical processes and responsive variants shall meet WCAG 2.2 AA, including a keyboard-accessible alternative to drag-and-drop.
- **NFR-08 Internationalization:** UI copy shall be structured to support future localization; initial release ships in English.
- **NFR-09 Reliability of AI Features:** AI workflows shall use exact citations where applicable, validated structured output, versioned provenance, task-specific evaluation gates, human acceptance before baselining, and a complete manual fallback.
- **NFR-10 Extensibility:** Requirement, DoR/DoD, cost-category, and guardrail templates shall support versioned controlled workspace extensions without allowing mandatory controls to be removed or active projects to change retroactively.
- **NFR-11 Data Lifecycle:** Eligible deleted data shall be recoverable for 30 days, then purged from active stores and aged out of backups on a documented schedule.
- **NFR-12 Concurrency:** Human and agent mutations shall be idempotent where applicable and protected by optimistic concurrency.
- **NFR-13 Observability:** Web, worker, MCP, storage, email, and AI operations shall emit correlated logs, metrics, traces, and auditable domain events without recording confidential bodies or credentials.
- **NFR-14 Pilot Scale:** Acceptance testing shall cover 50 workspaces, 25 users/workspace, 20 active projects/workspace, 5,000 work items/project, 200 concurrent browser sessions, 50 MCP sessions, and 20 concurrent document jobs.

---

## 12. Success Metrics

The controlled pilot's primary proof is a **complete trusted lifecycle**: real work repeatedly moves from cited source artifacts through approved baselines, specification, Ready work, agent evidence, human Done, and material-change handling with end-to-end traceability.

**Adoption**
- Number of workspaces created
- Weekly active users per workspace
- Projects created per workspace

**Efficiency**
- Time from document upload → Approved Requirement
- % of extracted claims accepted without material rewrite
- Human correction time per AI workflow
- VDE and elapsed-range calibration, review/rework share, and % of work materially re-estimated before start

**Delivery Health**
- Sprint goal achievement rate
- Work-item cycle time (Ready → Done), segmented by type
- Blocker frequency and mean time to resolve

**Client Satisfaction**
- Client login frequency
- Client approval turnaround time
- Client-input resolution time and classification

**AI/Agent**
- % of work items touched by an agent
- Implementation reports accepted vs. returned for missing evidence
- Agent-proposed material and non-material change rates
- Time from agent proposal → client decision
- Citation validity, unsupported-claim rate, conflict recall, impact-analysis coverage

**Pilot Go/No-Go**
- One internal project completes the full lifecycle.
- One friendly client validates portal visibility, Requirement approval, material change, and feedback paths.
- No unresolved critical/high tenant-isolation, authorization, data-loss, or client-visibility defects.
- Recovery and AI evaluation gates in the companion specifications pass.

---

## 13. Assumptions & Out-of-Scope

### Assumptions
- Teams are small (2–25 members) and comfortable with AI-assisted development.
- Users and clients have verified email addresses; users may belong to multiple workspaces.
- Clients are willing to log in for Requirement decisions, material changes, visibility, and feedback; weekly checkpoints may be moved or waived.
- Cost data is entered manually; users understand there is no live pricing feed.
- English is the primary language for the initial release.
- Delivery OS is authoritative for delivery artifacts; implementation occurs in external IDEs/repositories and returns structured evidence through MCP.
- The first rollout is internal dogfood plus one friendly client.

### Out-of-Scope (for this product plan)
- Integrations or synchronization with Jira, Azure DevOps, Confluence, GitHub Issues, source repositories, CI, or deployment providers.
- Contract management, invoicing, or CRM functionality.
- Live pricing/FX feeds for cost planning.
- Native mobile applications.
- On-premise or air-gapped deployment.
- Custom delivery frameworks beyond LVD (e.g., SAFe, waterfall templates).
- Timesheets, individual utilization surveillance, and payroll integration. Aggregate VDE ranges and completion calibration are delivery evidence, not timekeeping.
- Design tooling (whiteboards, wireframing) inside the platform.
- PPTX/XLSX extraction, unattended agent service accounts, static MCP tokens, public REST API, global file-content search, granular notification matrices, arbitrary role/template builders, SSO/SCIM, and native per-IDE plugins.

---

## 14. Glossary

| Term | Definition |
|---|---|
| **Workspace** | The explicit top-level tenant; membership is invitation-based and independent of email domain. |
| **Admin** | A workspace role with privileged workspace control and step-up MFA requirements. |
| **Project Manager (PM)** | The role that owns a project end-to-end. |
| **Project Lead** | An optional technical lead per project. |
| **Contributor** | A project-scoped role executing assigned work. |
| **Client Stakeholder** | An external user invited to a specific project. |
| **LVD** | Lean Vertical Delivery — the delivery framework baked into Delivery OS. |
| **Outcome Story** | An independently testable vertical outcome spanning every applicable UI, backend, data, and validation layer. |
| **Enabler / Defect / Spike / Operational Task** | Explicit work types for necessary delivery work that is not honestly an Outcome Story. |
| **Definition of Ready (DoR)** | The type-specific checklist a work item must satisfy before entering Ready. |
| **Definition of Done (DoD)** | The type-specific checklist a work item must satisfy before entering Done. |
| **Feature Specification** | The implementation-ready behavior contract for a significant near-term feature, linked to approved project baselines. |
| **Baseline** | An immutable numbered artifact version created by approval of an exact frozen review snapshot. |
| **Delta** | A proposed change to an approved baseline; approval produces a new baseline without editing the prior one. |
| **Change Request** | A proposed post-baseline change that is analyzed for materiality and downstream impact. |
| **Successor Work** | A new typed work item created to change delivered behavior, linked to the original Done item. |
| **MCP** | Model Context Protocol — the interface Delivery OS exposes to AI agents. |
| **Agent** | An AI agent interacting through user-delegated MCP authorization. |
| **Gap** | Missing, weakly supported, conflicting, or conditionally required information classified as Blocking or Accepted Risk. |
| **Completion Snapshot** | The immutable scope, criteria, DoD, implementation report, complete estimate-at-start, aggregate actual VDE band, elapsed cycle time, and review decision frozen when work becomes Done. |
| **VDE** | Verified Delivery Effort — aggregate active human attention required from work start through validated, documented, human-reviewed completion. |

---

*End of document.*
