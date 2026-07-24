# AI-Assisted Software Work Sizing — 2026 Research and Decision

**Status:** Research record supporting an accepted product decision
**Normative rule:** [Product Plan §5.3](../core/product-plan.md#53-ai-aware-verified-delivery-sizing)
**Related:** [Domain Workflows](../core/domain-workflows.md), [AI/Security Evaluation](../assurance/ai-security-evaluation.md)
**Research current through:** 2026-07-24

## 1. Decision

There is no mature industry standard that reliably converts an AI-assisted task into story points or hours. Delivery OS will therefore keep T-shirt sizes as a simple user-facing bucket but replace the old, ambiguous effort number with an **AI-Aware Verified Delivery** estimate.

The primary sizing quantity is **Verified Delivery Effort (VDE)**: aggregate active human attention required from work start through a production-ready, tested, documented, human-reviewed outcome. Elapsed lead time, machine runtime/cost, AI fit, uncertainty, and consequence risk are recorded separately.

This decision avoids two unsafe assumptions:

- AI-generated code is not equivalent to completed delivery.
- A productivity percentage measured for one tool, task, developer, or repository can be applied to another.

## 2. What Current Evidence Says

| Evidence | Relevant finding | Delivery OS implication |
|---|---|---|
| [DORA: Balancing AI tensions (2026)](https://dora.dev/insights/balancing-ai-tensions/) | Initial generation is faster, but savings frequently move into prompting, auditing, verification, review, and production integration. DORA explicitly recommends adjusting estimates for the prototype-to-production gap. | Estimate the whole verified lifecycle, including reviewer effort and remediation. |
| [DORA: Working in small batches](https://dora.dev/capabilities/working-in-small-batches/) | Small batches strengthen feedback and amplify AI’s positive effect; work should be decomposed so it can complete in a week or less. | Keep vertical slices small and challenge L; block XL. |
| [DORA delivery metrics (updated 2026)](https://dora.dev/guides/dora-metrics/) | Throughput and instability must be considered together; code/output volume is not delivery performance. | Calibrate with cycle time, rework, failures, and recovery—not generated output. |
| [DORA: Measurement frameworks](https://dora.dev/insights/measurement-frameworks/) | Developer productivity requires a constellation of measures selected for the organizational goal. | Do not reduce AI effectiveness to tokens, prompts, accepted lines, or one velocity number. |
| [METR developer experiment update (2026)](https://metr.org/blog/2026-02-24-uplift-update/) | Updated AI productivity measurement is heavily affected by task selection, developer selection, concurrent agents, quality differences, and unreliable time attribution. | Never use a universal AI speedup multiplier; calibrate within comparable local cohorts. |
| [Toward LLM-aware effort estimation (2026)](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2026.1772418/full) | Emerging research identifies context completeness, reasoning complexity, transformation impact, iteration cycles, and human oversight as AI-era effort drivers, while noting that the model is not yet industrially calibrated. | Record AI fit/context, change surface, iterations, and oversight, but keep human ownership and local calibration. |
| [Hybrid Intelligence Effort study (2026)](https://link.springer.com/article/10.1007/s10791-026-10331-6) | Story points retain some signal, but interaction, validation, correction, and integration explain additional effort; the work is exploratory rather than a final predictive model. | Retain a familiar bucket while changing its derivation and collecting evidence for later calibration. |

Vendor studies showing speedups are useful evidence that AI can help particular tasks, but they do not justify a planning discount across repositories. The current evidence is context-sensitive and changes rapidly with models, agent harnesses, codebase quality, tests, and developer familiarity.

## 3. Estimation Target

### 3.1 Included in VDE

Estimate low and high active-attention hours for:

1. **Understand** — approved intent, codebase, architecture, data, dependencies, risk, and prior decisions.
2. **Plan and prepare context** — implementation plan, task slicing, environment setup, prompt/context construction, and tool selection.
3. **Produce** — agent supervision, prompting, AI output assessment, manual code/configuration, and local correction.
4. **Verify** — automated tests, static analysis, security/privacy/accessibility checks, migrations, integration, manual scenarios, and negative paths.
5. **Review and remediate** — reviewer attention, findings, re-generation, fixes, re-tests, and re-review.
6. **Release evidence** — documentation, observability, deployment/rollback preparation, implementation report, and acceptance evidence.

Count attention from every required participant. Two people reviewing for one hour is two VDE hours. Do not count unattended agent inference or CI waiting as human attention.

### 3.2 Recorded separately

- **Elapsed lead-time range:** expected clock time from start to Done, including waits and unattended execution.
- **Machine budget:** inference/runtime duration, concurrency, tokens where available, and monetary ceiling.
- **AI fit:** suitability of the pinned tool/model/workflow in this repository context.
- **Uncertainty:** how bounded the estimate and solution are.
- **Consequence risk:** harm if the result is wrong.

These quantities answer different planning questions. Combining them into one number hides bottlenecks: a task can have two hours of human effort, twelve hours of machine runtime, and three days of review wait.

## 4. Required Estimate Record

| Field | Rule |
|---|---|
| `vdeLowHours`, `vdeHighHours` | Sum phase ranges; high must include likely verification/remediation, not a first-pass happy path |
| `size` | Derived from the VDE high bound using the canonical Product Plan table |
| `elapsedLowHours`, `elapsedHighHours` | Includes machine and queue/review/environment waits |
| `aiFit` | `A0` prohibited/manual, `A1` low, `A2` moderate, `A3` high |
| `uncertainty` | `U0` routine, `U1` bounded, `U2` material unknowns, `U3` unbounded |
| `consequenceRisk` | `R1` low, `R2` moderate, `R3` high, `R4` critical |
| `basis` | Comparable completed items, expert decomposition, or cold-start default |
| `drivers` | Context gaps, integration surface, data migration, verification burden, review policy, environment/tool constraints |
| `toolProfile` | Agent/tool, model/configuration, workflow version, repository area, and relevant test/platform maturity |

AI proposes this record and cites its basis. The PM/Lead or responsible human accepts or edits it. Model self-confidence is not an estimation confidence score.

## 5. Sizing Procedure

1. Confirm the work is behaviorally Ready. If the outcome or acceptance rules are unknown, clarify them; do not hide discovery inside an optimistic implementation estimate.
2. Select comparable history for the same work type, repository area, tool profile, and risk class. If none exists, mark the estimate as cold-start.
3. Estimate each VDE phase independently as a range. Include all required human roles.
4. Assign AI fit based on demonstrated capability in this context, not general model marketing or benchmark rank.
5. Assign uncertainty. `U3` means the work is not Ready and needs clarification or a time-boxed Spike.
6. Assign consequence risk and add its mandatory validation/review. Risk does not directly inflate a number; its required work changes the VDE range.
7. Derive the T-shirt size from the VDE high bound. Apply the `R4` L floor.
8. Estimate elapsed lead time and machine budget separately.
9. Human-review the estimate, dominant assumptions, and split options. Challenge all L items; block XL.
10. Freeze the record when work starts. On Done, record the actual aggregate VDE band, elapsed time, review returns, defects, and material deviations.

## 6. Worked Example

A small authorization endpoint appears easy for an agent to generate:

| Phase | VDE range |
|---|---:|
| Understand policy and existing authorization | 0.5–1.0 h |
| Plan/context/prompt | 0.25–0.5 h |
| Produce implementation | 0.5–1.0 h |
| Tenant, negative-path, and integration tests | 1.5–2.5 h |
| Independent review and remediation | 0.75–1.5 h |
| Documentation/evidence/deployment check | 0.25–0.5 h |
| **Total** | **3.75–7.0 h** |

The result is **M**, `A3`, `U1`, and at least `R3` if it protects tenant data. Fast generation did not make it S because verification and independent review dominate. Its elapsed range may be 8–24 hours depending on reviewer availability.

## 7. Forecasting and Calibration

### Cold start

- Use the canonical ranges and explicit uncertainty.
- Do not discount for AI.
- Keep sprint commitment conservative and favor XS–M work.
- Treat the first 10–20 completed comparable items as calibration evidence, not a benchmark against individuals.

### With history

Group evidence by work type, repository area, tool/model/workflow profile, and risk class. Track:

- Percentage of actual VDE bands overlapping the estimated range.
- Median high-bound error and range width.
- Elapsed cycle time and queue/review wait.
- VDE share by understand/plan/produce/verify/review/release.
- In Review returns, deployment rework, escaped defects, and incidents.
- AI proposal acceptance/correction and material tool-profile changes.
- Machine runtime/cost per accepted outcome.

Use throughput and cycle-time distributions for sprint/date forecasts; use VDE for role capacity and bottleneck checks. Prefer probabilistic ranges or scenario bands over a single promised date. Recalibrate after a material model, agent harness, test-platform, architecture, or team change.

## 8. Anti-Patterns

- Applying “AI makes development 30% faster” to every estimate.
- Sizing by lines changed, code generated, token use, prompts, or agent runs.
- Counting only author time and making review/QA/operations invisible.
- Treating passing generated tests as independent verification.
- Using T-shirt labels as individual productivity targets.
- Comparing sizes or velocity across unrelated projects.
- Lowering an estimate because AI fit is high while omitting risk-required review.
- Converting uncertain work to XL instead of clarifying or running a Spike.

## 9. Review Trigger

Revisit this decision after at least 30 comparable completed items or when credible, replicated industry evidence establishes a stable AI-assisted estimation model. Any replacement must preserve human accountability, quality/stability measures, risk gates, and project-local calibration.
