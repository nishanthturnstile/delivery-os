# Delivery OS Technology Decisions

**Status:** Normative decision index
**Detailed contracts:** [Architecture & Contracts](architecture-contracts.md), [Design System](design-system.md)

This index records accepted durable choices and their review triggers. Detailed behavior lives in the linked normative document; research explains the evidence.

| ID | Decision | Status | Normative detail | Review trigger |
|---|---|---|---|---|
| TD-001 | TypeScript modular monolith with separate web/worker runtimes and a stateless OCR compute boundary | Accepted | [Architecture §1](architecture-contracts.md#1-architecture-decisions) | Domain/team scale demonstrates a measured boundary failure |
| TD-002 | Next.js web/API/MCP and Node BullMQ worker on Railway | Accepted | [Architecture §1.3](architecture-contracts.md#13-runtime-and-infrastructure) | Pilot SLO/cost/security cannot be met |
| TD-003 | PostgreSQL + Drizzle, transactional outbox, optimistic concurrency, idempotent commands | Accepted | [Architecture §§3, 7](architecture-contracts.md#3-data-and-persistence) | Measured correctness or scale constraint |
| TD-004 | Cloudflare R2 in production; MinIO in local Docker Compose; immutable application-managed keys because R2 has no S3 bucket versioning | Accepted | [Architecture §6](architecture-contracts.md#6-object-storage-and-ingestion), [Deployment](../deployment/infrastructure.md) | Residency, restore, compatibility, or provider risk fails a gate |
| TD-005 | Self-hosted PaddleOCR PP-StructureV3; no paid/external OCR API | Accepted for pilot | [OCR Evaluation](../research/ocr-evaluation.md) | Fixture accuracy/resource/license/maintenance gate fails or a candidate materially exceeds it |
| TD-006 | Tailwind CSS v4 + source-owned shadcn components + Base UI only; no Radix UI | Accepted | [Design System](design-system.md) | Accessibility, maintenance, or platform support fails |
| TD-007 | AI-Aware Verified Delivery sizing: VDE-derived T-shirts plus separate elapsed/machine/fit/uncertainty/risk fields | Accepted | [Product Plan §5.3](product-plan.md#53-ai-aware-verified-delivery-sizing), [Research](../research/ai-assisted-sizing.md) | 30+ comparable items or replicated standard supports a better model |
| TD-008 | Better Auth for interactive identity and OAuth resource-server support | Accepted for pilot | [Architecture §4](architecture-contracts.md#4-authentication-and-authorization) | Required protocol/security capability is unavailable |
| TD-009 | Resend adapter for email and Sentry/OpenTelemetry for scrubbed operational telemetry | Accepted for pilot | [Architecture §§11–12](architecture-contracts.md#11-search-notifications-and-exports) | Privacy, deliverability, observability, or cost gate fails |

## Change Rule

A decision change must:

1. Identify the measured problem or new requirement.
2. Compare the current choice and alternatives using official sources and project fixtures.
3. Update this index, normative contracts, backlog/operations, tests, subprocessor/SBOM records, and migration/rollback plan together.
4. Preserve a dated research or ADR record explaining why.
