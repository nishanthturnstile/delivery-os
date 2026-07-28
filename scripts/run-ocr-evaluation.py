#!/usr/bin/env python3
"""Run OCR evaluation against the OCR service.

Reads fixture images, sends them to the OCR /v1/recognize endpoint,
compares results against ground truth, computes metrics, and outputs a
result JSON file consumable by scripts/evaluate-m3.mjs.

Usage:
  # Against local Docker Compose OCR:
  python3 scripts/run-ocr-evaluation.py \
    --ocr-url http://127.0.0.1:58081 \
    --ocr-token delivery_os_ocr_local \
    --model-digest 4bc98087d81049792a1847a950ebae9e95e83fc643911ae4eb05af70d6db557e \
    --image-digest sha256:9d66f04d3f23c1c9c01585919ebcf2de4229eddf22dc508ab0f1c1da0afe5292 \
    --run 1 \
    --output /tmp/ocr-eval-result.json

  # Against Railway staging OCR (requires Railway private network access):
  python3 scripts/run-ocr-evaluation.py \
    --ocr-url http://ocr.railway.internal \
    --ocr-token <token> \
    --model-digest 4bc98087d81049792a1847a950ebae9e95e83fc643911ae4eb05af70d6db557e \
    --image-digest sha256:9d66f04d3f23c1c9c01585919ebcf2de4229eddf22dc508ab0f1c1da0afe5292 \
    --run 1 \
    --output /tmp/ocr-eval-result.json
"""

import argparse
import base64
import hashlib
import json
import os
import statistics
import sys
import time
from pathlib import Path
from urllib import request, error as urllib_error

FIXTURE_DIR = Path("tests/fixtures/m3/ocr")
PROMOTION_FILE = Path("tests/fixtures/m3/ocr-promotion.json")


def load_fixtures():
    with open(PROMOTION_FILE) as f:
        promotion = json.load(f)
    fixture_version = promotion["fixtureVersion"]

    fixtures = []
    for gt_path in sorted(FIXTURE_DIR.glob("*.gt.json")):
        with open(gt_path) as f:
            gt = json.load(f)

        png_path = gt_path.parent / (gt_path.stem.replace(".gt", "") + ".png")
        if not png_path.exists():
            print(f"  WARN: missing image for {gt_path.name}, skipping")
            continue

        with open(png_path, "rb") as f:
            png_data = f.read()
        png_b64 = base64.b64encode(png_data).decode("ascii")
        png_sha256 = hashlib.sha256(png_data).hexdigest()

        fixtures.append({
            "format": gt["format"],
            "gt_sha256": gt["sha256"],
            "png_data": png_data,
            "png_b64": png_b64,
            "png_sha256": png_sha256,
            "blocks": gt["blocks"],
        })

    print(f"Loaded {len(fixtures)} fixtures (version {fixture_version})")
    return fixture_version, fixtures


def call_ocr(
    ocr_url,
    ocr_token,
    config_digest,
    source_id,
    pages,
):
    payload = {
        "schemaVersion": "1",
        "sourceGenerationId": source_id,
        "sourceSha256": hashlib.sha256(
            "".join(page["inputHash"] for page in pages).encode("ascii")
        ).hexdigest(),
        "rendererVersion": "evaluation-script-v1",
        "ocrConfigVersion": config_digest or "evaluation",
        "pages": pages,
    }

    headers = {
        "Authorization": f"Bearer {ocr_token}",
        "Content-Type": "application/json",
    }

    req = request.Request(
        f"{ocr_url}/v1/recognize",
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        started = time.perf_counter()
        with request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8")), time.perf_counter() - started
    except urllib_error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"  OCR HTTP {e.code}: {body[:200]}")
        return None, None
    except Exception as e:
        print(f"  OCR request failed: {e}")
        return None, None


def levenshtein(a, b):
    m, n = len(a), len(b)
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev = dp[0]
        dp[0] = i
        for j in range(1, n + 1):
            temp = dp[j]
            if a[i - 1] == b[j - 1]:
                dp[j] = prev
            else:
                dp[j] = 1 + min(prev, dp[j], dp[j - 1])
            prev = temp
    return dp[n]


def compute_cer(ocr_text, gt_text):
    if not gt_text and not ocr_text:
        return 0.0
    if not gt_text:
        return 1.0
    ed = levenshtein(ocr_text, gt_text)
    return ed / max(len(gt_text), 1)


def compute_table_f1(ocr_blocks, gt_blocks):
    gt_cells = [(b.get("row", 0), b.get("cell", 0), b["text"]) for b in gt_blocks if b.get("kind") == "TABLE_CELL"]
    ocr_cells = [(b.get("row", 0), b.get("cell", 0), b.get("text", "")) for b in ocr_blocks if b.get("kind") == "TABLE_CELL"]

    if not gt_cells:
        return 1.0

    gt_set = set()
    for r, c, t in gt_cells:
        gt_set.add((r, c, t.strip().lower()))

    ocr_set = set()
    for r, c, t in ocr_cells:
        ocr_set.add((r, c, t.strip().lower()))

    tp = len(gt_set & ocr_set)
    fp = len(ocr_set - gt_set)
    fn = len(gt_set - ocr_set)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    return f1


def _norm(t):
    return " ".join(t.strip().lower().split())

def compute_recall_precision(ocr_texts, gt_texts):
    if not gt_texts:
        return 1.0, 1.0

    ocr_all = " ".join(_norm(t) for t in ocr_texts)
    gt_all = " ".join(_norm(t) for t in gt_texts)

    ocr_words = set(ocr_all.split())
    gt_words = set(gt_all.split())

    tp = len(ocr_words & gt_words)
    fp = len(ocr_words - gt_words)
    fn = len(gt_words - ocr_words)

    recall = tp / (tp + fn) if (tp + fn) > 0 else 1.0
    precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0
    return recall, precision


def words(value):
    return set(_norm(value).split())


def polygon_bounds(polygon):
    if not isinstance(polygon, list) or len(polygon) != 8:
        return None
    xs = polygon[0::2]
    ys = polygon[1::2]
    return min(xs), min(ys), max(xs), max(ys)


def center_inside(inner, outer):
    inner_bounds = polygon_bounds(inner)
    outer_bounds = polygon_bounds(outer)
    if inner_bounds is None or outer_bounds is None:
        return False
    center_x = (inner_bounds[0] + inner_bounds[2]) / 2
    center_y = (inner_bounds[1] + inner_bounds[3]) / 2
    return (
        outer_bounds[0] <= center_x <= outer_bounds[2]
        and outer_bounds[1] <= center_y <= outer_bounds[3]
    )


def region_precision(ocr_blocks, gt_blocks):
    if not ocr_blocks:
        return 0.0
    matched = 0
    for ocr in ocr_blocks:
        ocr_words = words(ocr.get("text", ""))
        if not ocr_words:
            continue
        for gt in gt_blocks:
            gt_words = words(gt["text"])
            overlap = len(ocr_words & gt_words) / len(ocr_words)
            if overlap >= 0.8 and center_inside(ocr.get("polygon"), gt.get("polygon")):
                matched += 1
                break
    return matched / len(ocr_blocks)


def canonical_page_hash(ocr_result):
    return hashlib.sha256(
        json.dumps(ocr_result.get("pages", []), sort_keys=True, separators=(",", ":")).encode(
            "utf-8"
        )
    ).hexdigest()


def evaluate_fixture(fixture, ocr_result, elapsed_seconds):
    gt_blocks = fixture["blocks"]
    format_name = fixture["format"]

    if ocr_result is None or "pages" not in ocr_result or not ocr_result["pages"]:
        return {
            "format": format_name,
            "error": "OCR_FAILED",
            "charErrorRate": 1.0,
            "criticalRecall": 0.0,
            "precision": 0.0,
            "regionPrecision": 0.0,
            "tableF1": 0.0,
            "pageSeconds": elapsed_seconds,
        }

    ocr_blocks = ocr_result["pages"][0].get("blocks", [])

    gt_texts = [b["text"] for b in gt_blocks]
    ocr_texts = [b.get("text", "") for b in ocr_blocks]
    ocr_texts_clean = [t for t in ocr_texts if t.strip()]

    full_ocr = " ".join(ocr_texts_clean)
    full_gt = " ".join(gt_texts)
    cer = compute_cer(full_ocr, full_gt)

    _, precision = compute_recall_precision(ocr_texts_clean, gt_texts)
    critical_texts = [b["text"] for b in gt_blocks if b.get("critical") is True]
    critical_recall, _ = compute_recall_precision(ocr_texts_clean, critical_texts)

    table_f1 = compute_table_f1(ocr_blocks, gt_blocks)
    locator_precision = region_precision(ocr_blocks, gt_blocks)

    print(
        f"  {format_name}: CER={cer:.4f} criticalRecall={critical_recall:.4f} "
        f"precision={precision:.4f} regionPrecision={locator_precision:.4f} "
        f"tableF1={table_f1:.4f} seconds={elapsed_seconds:.3f}"
    )
    return {
        "format": format_name,
        "charErrorRate": cer,
        "criticalRecall": critical_recall,
        "precision": precision,
        "regionPrecision": locator_precision,
        "tableF1": table_f1,
        "pageSeconds": elapsed_seconds,
        "blockCount": len(ocr_blocks),
    }


def main():
    parser = argparse.ArgumentParser(description="Run OCR evaluation")
    parser.add_argument("--ocr-url", default="http://127.0.0.1:58081", help="OCR service URL")
    parser.add_argument("--ocr-token", default="delivery_os_ocr_local", help="OCR service token")
    parser.add_argument("--model-digest", required=True, help="Expected model digest")
    parser.add_argument("--image-digest", required=True, help="Exact OCR image digest")
    parser.add_argument("--config-digest", default="12dd9f9379bb158f4b2a14f101d5c69a411983852865e1d41733361fd692da79", help="OCR config digest")
    parser.add_argument("--run", type=int, default=1, help="Run number (1 or 2)")
    parser.add_argument("--output", default="/tmp/ocr-evaluation-result.json", help="Output result path")
    parser.add_argument("--peak-memory-gib", type=float, required=True, help="Measured peak service memory in GiB")
    parser.add_argument("--critical-high-findings", type=int, required=True, help="Critical/High image and service findings")
    parser.add_argument("--review-status", choices=["PENDING", "ACCEPTED"], default="PENDING")
    parser.add_argument("--accountable-reviewer", default="")
    args = parser.parse_args()
    exact_image_digest = args.image_digest.removeprefix("sha256:")
    if not (
        len(exact_image_digest) == 64
        and all(character in "0123456789abcdef" for character in exact_image_digest)
    ):
        parser.error("--image-digest must be a SHA-256 digest")

    fixture_version, fixtures = load_fixtures()
    if not fixtures:
        print("No fixtures found. Run scripts/generate-ocr-fixtures.py first.")
        sys.exit(1)

    source_id = f"ocr-evaluation-{fixture_version}-run-{args.run}"

    format_results = {}
    all_cers = []
    degraded_cer = None
    timings = []
    idempotent = True
    model_mismatch = False
    cross_page_associations = 0

    for fix in fixtures:
        fmt = fix["format"]
        print(f"Evaluating {fmt}...")

        page = {
            "page": 1,
            "inputHash": fix["png_sha256"],
            "imageBase64": fix["png_b64"],
        }
        ocr_result, elapsed = call_ocr(
            args.ocr_url,
            args.ocr_token,
            args.config_digest,
            f"{source_id}-{fmt}",
            [page],
        )
        replay, replay_elapsed = call_ocr(
            args.ocr_url,
            args.ocr_token,
            args.config_digest,
            f"{source_id}-{fmt}",
            [page],
        )
        if elapsed is not None:
            timings.append(elapsed)
        if replay_elapsed is not None:
            timings.append(replay_elapsed)
        if (
            ocr_result is None
            or replay is None
            or canonical_page_hash(ocr_result) != canonical_page_hash(replay)
        ):
            idempotent = False
        if ocr_result is not None and ocr_result.get("modelDigest") != args.model_digest:
            model_mismatch = True

        result = evaluate_fixture(fix, ocr_result, elapsed)
        format_results[fmt] = result

        if "error" not in result:
            all_cers.append(result["charErrorRate"])
            if fmt == "degraded-scan":
                degraded_cer = result["charErrorRate"]

    if len(fixtures) >= 2:
        multi_pages = [
            {
                "page": index + 1,
                "inputHash": fixture["png_sha256"],
                "imageBase64": fixture["png_b64"],
            }
            for index, fixture in enumerate(fixtures[:2])
        ]
        multi_result, multi_elapsed = call_ocr(
            args.ocr_url,
            args.ocr_token,
            args.config_digest,
            f"{source_id}-cross-page",
            multi_pages,
        )
        if multi_elapsed is not None:
            timings.append(multi_elapsed / len(multi_pages))
        expected_hashes = {page["page"]: page["inputHash"] for page in multi_pages}
        actual_pages = [] if multi_result is None else multi_result.get("pages", [])
        if len(actual_pages) != len(multi_pages):
            cross_page_associations += abs(len(actual_pages) - len(multi_pages)) or 1
        for page in actual_pages:
            expected_hash = expected_hashes.get(page.get("page"))
            if expected_hash is None or page.get("inputHash") != expected_hash:
                cross_page_associations += 1
            for block in page.get("blocks", []):
                if (
                    block.get("page") != page.get("page")
                    or block.get("inputHash") != expected_hash
                ):
                    cross_page_associations += 1

    clean_cer = format_results.get("clean-scan", {}).get("charErrorRate", 1.0)
    if degraded_cer is None:
        degraded_cer = format_results.get("degraded-scan", {}).get("charErrorRate", 1.0)

    table_f1 = format_results.get("table", {}).get("tableF1", 0.0)
    citation_recall = min(
        (r.get("criticalRecall", 0) for r in format_results.values() if "error" not in r),
        default=0.0,
    )
    region_minimum = min(
        (r.get("regionPrecision", 0) for r in format_results.values() if "error" not in r),
        default=0.0,
    )
    page_accuracy = 1.0 if all(
        "error" not in result for result in format_results.values()
    ) else 0.0
    p95_page_seconds = (
        statistics.quantiles(timings, n=20, method="inclusive")[18] if len(timings) > 1
        else timings[0] if timings
        else 999.0
    )
    errors_count = (
        sum(1 for r in format_results.values() if "error" in r)
        + args.critical_high_findings
        + (1 if model_mismatch else 0)
    )

    result = {
        "schemaVersion": "1",
        "fixtureVersion": fixture_version,
        "dataClassification": "SYNTHETIC",
        "exactPromotionDigest": args.model_digest,
        "exactImageDigest": exact_image_digest,
        "reviewStatus": args.review_status,
        "accountableReviewer": args.accountable_reviewer,
        "run": args.run,
        "metrics": {
            "cleanCharacterErrorRateMaximum": round(clean_cer, 6),
            "degradedCharacterErrorRateMaximum": round(degraded_cer, 6),
            "criticalRequirementRecall": round(citation_recall, 6),
            "citationPageAccuracy": page_accuracy,
            "citationRegionPrecisionMinimum": round(region_minimum, 6),
            "tableCellAssociationF1Minimum": round(table_f1, 6),
            "crossPageAssociationMaximum": cross_page_associations,
            "idempotentBlockIdentity": idempotent,
            "p95PageSecondsMaximum": round(p95_page_seconds, 3),
            "peakMemoryGiBMaximum": round(args.peak_memory_gib, 3),
            "criticalHighFindingsMaximum": errors_count,
        },
        "formatDetails": format_results,
        "errors": errors_count,
    }

    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(result, f, indent=2)

    print(f"\nResult written to {args.output}")

    print("\n=== PROMOTION THRESHOLD CHECK ===")
    with open(PROMOTION_FILE) as f:
        promo = json.load(f)
    thresholds = promo["promotionThresholds"]
    all_pass = True
    for name, threshold in thresholds.items():
        value = result["metrics"].get(name)
        if value is None:
            print(f"  {name}: MISSING")
            all_pass = False
            continue
        if isinstance(threshold, bool):
            passed = value == threshold
        elif name.endswith("Maximum"):
            passed = value <= threshold
        else:
            passed = value >= threshold
        status = "PASS" if passed else "FAIL"
        if not passed:
            all_pass = False
        print(f"  {name}: {value} vs {threshold} [{status}]")

    if all_pass:
        print("\n*** ALL THRESHOLDS PASSED ***")
    else:
        print("\n*** SOME THRESHOLDS FAILED ***")
        sys.exit(1)


if __name__ == "__main__":
    main()
