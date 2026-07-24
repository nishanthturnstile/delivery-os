# Delivery OS Development Guidelines

**Status:** Normative engineering guidance
**Parents:** [Architecture & Contracts](architecture-contracts.md), [Domain Model & Workflows](domain-workflows.md)
**Related:** [Design System](design-system.md), [Delivery Backlog](../planning/delivery-backlog.md)

## 1. Change Workflow

1. Load the approved requirement, relevant baseline/specification, domain rules, architecture, and current work item.
2. Confirm acceptance criteria, audience, permissions, data migration, observability, and rollback.
3. Produce a file-level implementation and validation plan.
4. Implement the smallest complete vertical slice.
5. Run deterministic validation before asking AI or a human reviewer to judge the result.
6. Review the diff against intent, security boundaries, and maintainability.
7. Submit implementation evidence and request human review. Only a human moves work to Done.

If implementation reveals an intent or normative architecture change, stop and propose the documentation/change-set update. Do not silently make code the new source of truth.

## 2. AI-Assisted Engineering

- Treat agent output as untrusted proposed code.
- Provide approved, minimal context and explicit acceptance/test commands.
- Ask agents to inspect existing patterns before generating new abstractions.
- Keep agent changes reviewable; split large diffs even if an agent can generate them quickly.
- Never accept generated tests as the sole proof of the generated implementation. Review that tests assert intended behavior and include negative paths.
- Independently verify security, tenancy, authorization, migration, retention, and destructive behavior.
- Record the agent/tool/model/workflow profile in implementation evidence when it materially affected the work.
- Do not measure individual performance by tokens, prompts, agent runs, generated lines, or acceptance rate.

Sizing follows [AI-Aware Verified Delivery](../research/ai-assisted-sizing.md). Planning, prompting, review, testing, remediation, deployment preparation, and evidence all count.

## 3. TypeScript and Module Rules

- Enable strict TypeScript; avoid `any`. An unavoidable boundary `unknown` is parsed immediately with a schema.
- Domain and application packages do not import Next.js, database drivers, queues, providers, or UI code.
- Every mutation enters through an application command and transaction boundary.
- Cross-module behavior uses exported application interfaces or documented domain events.
- Validate external/internal wire data with versioned Zod contracts.
- Keep provider SDK types behind adapters.
- Use stable error codes and safe messages; never branch authorization based on client-side state.
- Prefer pure domain policies and explicit state transitions over implicit hook behavior.

## 4. Persistence and Jobs

- All schema changes use checked-in Drizzle migrations and a rollback/forward-fix note.
- Tenant queries require workspace context; project data also requires project context.
- Mutations enforce expected revision and idempotency where retry is possible.
- Store domain mutation, audit event, and outbox event in one transaction.
- Background consumers are at-least-once and deduplicate by event/job identity.
- Object storage uses immutable keys and manifests; never rely on provider overwrite/version semantics.
- Jobs classify retryable, terminal, and user-actionable errors. Exhaustion cannot be reported as success.

## 5. Frontend

- Use Server Components by default and isolate client state to the smallest boundary.
- Import components from `@delivery-os/ui`; do not import Base UI in apps and do not add Radix packages.
- Use semantic design tokens, not raw brand/status colors in screens.
- Authorization and audience checks remain server-side; hidden controls are only presentation.
- Every async view defines loading, empty, error, retry, stale/conflict, and partial-progress behavior.
- Every drag action has a keyboard/control alternative.
- Forms associate labels, descriptions, errors, and submission state programmatically.

## 6. Testing Standard

Use the lowest test layer that provides strong evidence, plus end-to-end coverage for critical journeys:

- Unit/property: value objects, policies, state machines, authorization, calculations, serialization.
- Integration: repositories, migrations, commands, outbox/jobs, provider/storage/OCR adapters.
- Contract: Zod DTOs, MCP tools/resources, R2/MinIO supported subset, OCR response schema.
- Component: variants, accessibility, keyboard/focus, visual states.
- End-to-end: cross-role approval, client visibility, upload/OCR/citation, agent evidence/human Done, change application, deletion/restore.
- Security/adversarial: cross-tenant IDs, audience leaks, prompt injection, malicious files, stale revisions, replay/duplication.

Tests must be deterministic, isolated by tenant, and free of production content. A flaky test is a defect, not a reason to retry CI indefinitely.

## 7. Observability and Secrets

- Propagate correlation ID through request, command, event, job, provider call, and notification.
- Use structured logs with allowlisted fields.
- Never log source text, OCR bodies, AI prompts/responses, signed URLs, cookies, authorization headers, recovery codes, or secrets.
- Metrics identify the workspace/project only through approved non-sensitive IDs or aggregates.
- Secrets live in environment/provider secret stores and are validated at startup.
- Local and test integrations default to fake/private endpoints; outbound telemetry is disabled unless explicitly enabled.

## 8. Documentation and Decisions

- Update the earliest authoritative document before or with code.
- New durable technology choices require an entry in [Technology Decisions](technology-decisions.md).
- Provider integrations include official-source links, supported/unsupported features, failure modes, retention, and credential boundaries.
- Research records alternatives and evidence; core docs contain the accepted rule.
- Relative links, anchors, requirement IDs, and terminology must pass CI.
- Avoid future-tense ambiguity: use “must/shall” for requirements and “may” only for deliberate options.

## 9. Review Checklist

- Intent and exclusions match the approved specification.
- Authorization, tenancy, audience, and state checks run server-side.
- Data migration, concurrency, idempotency, and rollback are safe.
- Failure, retry, cancellation, and partial states are visible and truthful.
- Tests independently demonstrate acceptance and negative paths.
- Logs/telemetry are useful and scrubbed.
- UI meets design-system and accessibility contracts.
- Documentation and traceability are updated.
- No unresolved Critical/High security issue remains.
