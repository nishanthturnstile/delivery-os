# Self-Hosted OCR Evaluation

**Status:** Accepted research decision
**Decision:** PaddleOCR PP-StructureV3 for the controlled pilot
**Related:** [Architecture & Contracts](../core/architecture-contracts.md), [Infrastructure & Deployment](../deployment/infrastructure.md), [AI/Security Evaluation](../assurance/ai-security-evaluation.md)
**Research current through:** 2026-07-24

## 1. Constraints

Delivery OS will not use a paid OCR API, subscription OCR product, or per-page commercial service. OCR must run on Delivery OS-controlled infrastructure with:

- A permissive open-source license suitable for production.
- No document transmission to an OCR vendor.
- Exact page and geometry output for citation navigation.
- PDF page, table, and reading-order support adequate for business requirements.
- A pinned, reproducible container with bounded CPU/memory/time.
- A manual/retry path when recognition is insufficient.

Self-hosting removes provider fees, not infrastructure costs. Production still pays for the compute, storage, monitoring, and engineering needed to run OCR safely.

## 2. Candidate Summary

| Candidate | License | Strengths | Constraints | Decision |
|---|---|---|---|---|
| [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) PP-StructureV3 | Apache-2.0 | Mature project, structured JSON/Markdown, fine-grained text/table coordinates, CPU/GPU and service deployment paths, multilingual models | Python/Paddle runtime and multiple models increase image size and operational complexity | **Selected** |
| [Unlimited OCR](https://github.com/baidu/Unlimited-OCR) | MIT | Strong reported OmniDocBench results, one-shot multi-page parsing, constant KV-cache design, vLLM/SGLang paths | Released June 2026, very young repository, GPU/CUDA-centric, custom remote model code, limited operational history, generative long-output failure modes | Research candidate only |
| [Tesseract](https://github.com/tesseract-ocr/tesseract) | Apache-2.0 | Very mature, CPU-friendly, many languages, TSV/hOCR coordinates, simple deployment | Weaker reading order, tables, complex layouts, and degraded scans without substantial preprocessing | Deterministic fallback/baseline |
| [docTR](https://github.com/mindee/doctr) | Apache-2.0 | Modern detection/recognition pipeline, page geometry, CPU/GPU | Less complete document-structure pipeline and smaller deployment ecosystem than PaddleOCR | Not selected |
| [EasyOCR](https://github.com/JaidedAI/EasyOCR) | Apache-2.0 | Easy Python API, many scripts, bounding boxes | Geared toward text detection/recognition rather than hierarchical document/table parsing | Not selected |

License acceptance covers the upstream project and pinned model artifacts separately. The software bill of materials must record both; no model is promoted on repository license alone.

## 3. Unlimited OCR Evaluation

### Accuracy and performance

The [Unlimited OCR paper](https://arxiv.org/abs/2606.23050) reports a 93.92 overall score on OmniDocBench v1.6, multi-page processing through a 32K context, and constant decode KV cache. Those are promising research results, especially for long documents.

They are not enough to declare production readiness for Delivery OS:

- The benchmark is author-reported and does not represent Delivery OS’s scanned business-document and exact-citation fixtures.
- At 40+ pages, the paper reports degraded edit distance and identifies finite-context/prefill limits.
- End-to-end VLM OCR can produce fluent but incorrect text; exact claims require deterministic citation checks and visible low-confidence behavior.

### License

The code repository declares MIT. Model artifacts and all transitive runtime components still require SBOM and license verification before any use.

### Self-hosting and integration

The official setup targets NVIDIA GPUs with recent CUDA and uses `trust_remote_code=True` for Transformers; alternative vLLM/SGLang images are available. This is feasible, but it is materially more complex than a CPU-first pilot service and expands the model execution and supply-chain trust boundary.

### Production-readiness verdict

**Not selected for the pilot.** As of 2026-07-24 the repository is roughly one month old, has very limited commit/release history, and lacks the operational maturity expected for the authoritative OCR path. It may be re-evaluated after stable tagged releases, independent fixture results, a pinned no-remote-code container, and demonstrated resource/error behavior.

## 4. Why PaddleOCR

PaddleOCR 3.x is a long-running Apache-2.0 project with thousands of commits and documented local/service deployment. The [PaddleOCR 3.0 technical report](https://arxiv.org/abs/2507.05595) identifies PP-StructureV3 as its hierarchical document-parsing pipeline. Current project documentation states that PP-StructureV3 returns fine-grained text and table-cell coordinates, which directly serves Delivery OS citation locators.

The pilot selects the non-generative coordinate-preserving pipeline rather than making a document VLM the sole source of text. Tesseract remains a fixture baseline and may be used as a fallback for simple pages if evaluation shows a clear deterministic advantage.

This is a conditional production choice: the exact PaddleOCR/PaddlePaddle/model versions are pinned only after the pilot fixture suite passes. “Latest” is evaluated in staging; it is never pulled automatically into production.

## 5. Deployment Contract

- Run a private stateless Python OCR service; it is an infrastructure compute boundary, not a domain microservice.
- Bake code and model artifacts into an image by digest. Verify checksums and licenses in CI.
- Deny runtime Internet egress and remote-code/model downloads.
- Give the service no database, Redis, Cloudflare, or MinIO credentials.
- The worker detects image-only pages, rasterizes only those pages at a bounded DPI, strips unnecessary metadata, and sends bounded page batches over the private network with service authentication.
- Validate the response schema and normalize page number, polygon/bounding box, reading order, text, confidence, table/cell structure, model/config version, and input hash.
- Deduplicate by source/page hash plus renderer/OCR configuration version.
- Bound request size, pages, pixels, CPU, memory, concurrency, and wall time.
- Treat malformed, timed-out, exhausted, or low-confidence output as `Needs Attention`; never silently accept partial text.
- Retain original source and normalized locators so a reviewer can compare OCR text to the exact page region.

## 6. Promotion Gates

Use a frozen, versioned fixture set representing clean scans, skew, rotation, low contrast, compression, multi-column layouts, tables, headers/footers, mixed searchable/scanned PDFs, and adversarial document text.

The pinned image must meet:

- Clean printed-document character error rate ≤ 2%.
- Degraded-but-supported character error rate ≤ 8%.
- Critical seeded requirement-string recall = 100%.
- Citation page accuracy = 100% and citation region precision ≥ 98%.
- Table cell content/association F1 ≥ 90% on pilot tables.
- No cross-page block association in the fixture suite.
- Idempotent retry produces the same normalized block identities.
- At configured pilot concurrency, p95 ≤ 30 seconds per rendered page and peak memory ≤ 8 GiB per replica on the selected production class.
- Timeout, corrupt image, oversized page, model crash, and malformed result tests all produce actionable failure without domain mutation.
- No Critical/High container, dependency, model-license, or supply-chain finding.

Accuracy thresholds apply to the controlled supported corpus and must be reported by fixture category. Unsupported handwriting/languages/layouts are surfaced, not hidden in aggregate scores.

## 7. Re-evaluation Triggers

Evaluate a new PaddleOCR version, Unlimited OCR, or another engine only when one of these occurs:

- The selected pipeline fails a launch-critical language/layout/accuracy gate.
- Pilot load cannot meet the asynchronous OCR SLO within the approved compute budget.
- A candidate has stable releases and materially improves Delivery OS fixtures.
- A license, security, maintenance, or hardware constraint changes.

Promotion requires the same frozen fixture run, SBOM/license review, resource profile, failure-mode tests, and rollback image.
