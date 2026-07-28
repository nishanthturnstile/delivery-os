import hashlib
import json
import os
from pathlib import Path

import numpy as np
from paddleocr import PPStructureV3


CACHE_ROOT = Path(os.environ.get("PADDLE_PDX_CACHE_HOME", "/opt/paddlex"))
OUTPUT = Path(os.environ.get("OCR_MODEL_MANIFEST_OUTPUT", "/app/generated-model-manifest.json"))
APPROVAL_MANIFEST = Path(
    os.environ.get("OCR_APPROVAL_MANIFEST", "/app/model-manifest.json")
)


def expected_digest() -> str:
    environment_value = os.environ.get("OCR_EXPECTED_MODEL_DIGEST")
    if environment_value:
        return environment_value
    if not APPROVAL_MANIFEST.exists():
        raise RuntimeError("OCR_EXPECTED_MODEL_DIGEST_MISSING")
    value = json.loads(APPROVAL_MANIFEST.read_text(encoding="utf-8")).get("modelDigest")
    if not isinstance(value, str) or len(value) != 64:
        raise RuntimeError("OCR_EXPECTED_MODEL_DIGEST_MISSING")
    return value


def create_pipeline() -> PPStructureV3:
    return PPStructureV3(
        lang="en",
        ocr_version="PP-OCRv5",
        device="cpu",
        enable_mkldnn=False,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        use_seal_recognition=False,
        use_formula_recognition=False,
        use_chart_recognition=False,
        use_region_detection=False,
        use_table_recognition=True,
    )


def artifact_manifest() -> tuple[list[dict[str, str | int]], str]:
    artifacts: list[dict[str, str | int]] = []
    for path in sorted(item for item in CACHE_ROOT.rglob("*") if item.is_file()):
        relative = path.relative_to(CACHE_ROOT).as_posix()
        if relative.startswith("locks/") or "/.cache/" in relative:
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        artifacts.append({"path": relative, "sha256": digest, "bytes": path.stat().st_size})
    encoded = json.dumps(artifacts, separators=(",", ":"), sort_keys=True).encode()
    return artifacts, hashlib.sha256(encoded).hexdigest()


pipeline = create_pipeline()
# Trigger every lazy nested model while the image still has controlled build
# egress. The deployed private service must never download model artifacts.
probe = np.full((64, 64, 3), 255, dtype=np.uint8)
list(
    pipeline.predict(
        probe,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        use_seal_recognition=False,
        use_formula_recognition=False,
        use_chart_recognition=False,
        use_region_detection=False,
        use_table_recognition=True,
    )
)
artifacts, digest = artifact_manifest()
if not artifacts:
    raise RuntimeError("OCR_MODEL_ARTIFACTS_MISSING")
print(digest)
if digest != expected_digest():
    raise RuntimeError("OCR_MODEL_DIGEST_MISMATCH")
OUTPUT.write_text(
    json.dumps(
        {
            "schemaVersion": "1",
            "engine": "PP-StructureV3",
            "paddleOcrVersion": "3.7.0",
            "paddlePaddleVersion": "3.3.1",
            "language": "en",
            "ocrVersion": "PP-OCRv5",
            "artifactManifestDigest": digest,
            "artifacts": artifacts,
        },
        indent=2,
        sort_keys=True,
    )
    + "\n",
    encoding="utf-8",
)
