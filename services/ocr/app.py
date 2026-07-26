import asyncio
import base64
import binascii
import hashlib
import json
import os
from pathlib import Path
from threading import Lock
from typing import Annotated

import cv2
import numpy as np
from fastapi import FastAPI, Header, HTTPException, Response, status
from paddleocr import PPStructureV3
from pydantic import BaseModel, ConfigDict, Field, field_validator


MODEL_VERSION = os.environ.get("OCR_MODEL_VERSION", "PP-StructureV3@paddleocr-3.7.0")
APPROVAL_MANIFEST = json.loads(Path("/app/model-manifest.json").read_text(encoding="utf-8"))
GENERATED_MANIFEST = json.loads(
    Path("/app/generated-model-manifest.json").read_text(encoding="utf-8")
)
BAKED_MODEL_DIGEST = GENERATED_MANIFEST["artifactManifestDigest"]
MODEL_DIGEST = os.environ.get("OCR_MODEL_DIGEST", BAKED_MODEL_DIGEST)
RECOGNITION_ENABLED = os.environ.get("OCR_RECOGNITION_ENABLED", "false") == "true"
EVALUATION_MODE = os.environ.get("OCR_EVALUATION_MODE", "false") == "true"
SERVICE_TOKEN = os.environ.get("OCR_SERVICE_TOKEN")
PAGE_TIMEOUT_SECONDS = 30
MAX_PAGE_PIXELS = 20_000_000
_pipeline: PPStructureV3 | None = None
_pipeline_lock = Lock()
_inference_lock = asyncio.Lock()
_timed_out = False

app = FastAPI(
    docs_url=None,
    openapi_url=None,
    redoc_url=None,
    title="Delivery OS private OCR boundary",
    version="1",
)


class RecognitionPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    page: int = Field(ge=1)
    inputHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    imageBase64: str = Field(min_length=4, max_length=32_000_000)


class RecognitionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: str = Field(pattern=r"^1$")
    sourceGenerationId: str = Field(min_length=1, max_length=100)
    sourceSha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    rendererVersion: str = Field(min_length=1, max_length=120)
    ocrConfigVersion: str = Field(min_length=1, max_length=160)
    pages: list[RecognitionPage] = Field(min_length=1, max_length=10)

    @field_validator("pages")
    @classmethod
    def unique_pages(cls, pages: list[RecognitionPage]) -> list[RecognitionPage]:
        if len({page.page for page in pages}) != len(pages):
            raise ValueError("page numbers must be unique")
        return pages


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ocr"}


@app.get("/ready")
def ready(response: Response) -> dict[str, str | bool | None]:
    promoted = (
        RECOGNITION_ENABLED
        and APPROVAL_MANIFEST.get("recognitionEnabled") is True
        and APPROVAL_MANIFEST.get("promotionEvidence")
        and MODEL_DIGEST == BAKED_MODEL_DIGEST == APPROVAL_MANIFEST.get("modelDigest")
    )
    if _timed_out or (not promoted and not EVALUATION_MODE):
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": (
            "degraded"
            if _timed_out
            else "ready"
            if promoted
            else ("evaluation_ready" if EVALUATION_MODE else "not_ready")
        ),
        "service": "ocr",
        "modelVersion": MODEL_VERSION,
        "modelDigest": MODEL_DIGEST,
        "modelLoaded": _pipeline is not None,
        "recognitionEnabled": promoted,
        "evaluationMode": EVALUATION_MODE,
    }


@app.post("/v1/recognize")
async def recognize(
    request: RecognitionRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, object]:
    global _timed_out
    if SERVICE_TOKEN is None or authorization != f"Bearer {SERVICE_TOKEN}":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthenticated")
    if _timed_out:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OCR worker requires restart after a page timeout.",
        )
    promoted = (
        RECOGNITION_ENABLED
        and APPROVAL_MANIFEST.get("recognitionEnabled") is True
        and APPROVAL_MANIFEST.get("promotionEvidence")
        and MODEL_DIGEST == BAKED_MODEL_DIGEST == APPROVAL_MANIFEST.get("modelDigest")
    )
    if not promoted and not EVALUATION_MODE:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OCR recognition is disabled until the M3 model promotion gate passes.",
        )
    if MODEL_DIGEST != BAKED_MODEL_DIGEST or len(MODEL_DIGEST) != 64:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OCR model digest does not match the immutable image manifest.",
        )
    pages: list[dict[str, object]] = []
    async with _inference_lock:
        if _timed_out:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="OCR worker requires restart after a page timeout.",
            )
        for page in request.pages:
            image = decode_page(page)
            try:
                result = await asyncio.wait_for(
                    asyncio.to_thread(infer_page, image, page), timeout=PAGE_TIMEOUT_SECONDS
                )
            except TimeoutError as error:
                # asyncio.to_thread cannot terminate native Paddle inference. Poison this
                # replica before releasing the lock so a second inference cannot overlap.
                # Railway then replaces the unready replica.
                _timed_out = True
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail="OCR page timeout.",
                ) from error
            pages.append(result)
    return {
        "schemaVersion": "1",
        "modelVersion": MODEL_VERSION,
        "modelDigest": MODEL_DIGEST,
        "configVersion": request.ocrConfigVersion,
        "pages": pages,
    }


def decode_page(page: RecognitionPage) -> np.ndarray:
    try:
        encoded = base64.b64decode(page.imageBase64, validate=True)
    except (ValueError, binascii.Error) as error:
        raise HTTPException(status_code=422, detail="Invalid page encoding.") from error
    if hashlib.sha256(encoded).hexdigest() != page.inputHash:
        raise HTTPException(status_code=422, detail="Page hash mismatch.")
    image = cv2.imdecode(np.frombuffer(encoded, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=422, detail="Unsupported page image.")
    height, width = image.shape[:2]
    if height * width > MAX_PAGE_PIXELS:
        raise HTTPException(status_code=413, detail="Page pixel limit exceeded.")
    return image


def get_pipeline() -> PPStructureV3:
    global _pipeline
    with _pipeline_lock:
        if _pipeline is None:
            _pipeline = PPStructureV3(
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
    return _pipeline


def infer_page(image: np.ndarray, page: RecognitionPage) -> dict[str, object]:
    results = list(
        get_pipeline().predict(
            image,
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
    if len(results) != 1:
        raise RuntimeError("OCR_RESULT_CARDINALITY_INVALID")
    payload = results[0].json["res"]
    ocr = payload.get("overall_ocr_res", {})
    candidates: list[dict[str, object]] = []
    table_bounds: list[list[float]] = []
    for table_index, table in enumerate(payload.get("table_res_list", [])):
        cell_boxes = table.get("cell_box_list", [])
        table_ocr = table.get("table_ocr_pred", {})
        rows = table_rows(cell_boxes)
        for text, confidence, polygon in strict_ocr_rows(table_ocr):
            center = polygon_center(polygon)
            cell_index = containing_box_index(cell_boxes, center)
            cell_box = cell_boxes[cell_index] if cell_index is not None else polygon_bounds(polygon)
            row_index = rows[cell_index] if cell_index is not None else 0
            cells_in_row = [index for index, value in enumerate(rows) if value == row_index]
            column_index = cells_in_row.index(cell_index) if cell_index in cells_in_row else 0
            candidates.append(
                candidate(
                    text,
                    confidence,
                    polygon,
                    "TABLE_CELL",
                    table=table_index,
                    row=row_index,
                    cell=column_index,
                )
            )
        if cell_boxes:
            table_bounds.append(
                [
                    min(float(box[0]) for box in cell_boxes),
                    min(float(box[1]) for box in cell_boxes),
                    max(float(box[2]) for box in cell_boxes),
                    max(float(box[3]) for box in cell_boxes),
                ]
            )
    parsing_blocks = payload.get("parsing_res_list", [])
    for text, confidence, polygon in strict_ocr_rows(ocr):
        center = polygon_center(polygon)
        if any(point_in_box(center, box) for box in table_bounds):
            continue
        label = next(
            (
                str(block.get("block_label", "text"))
                for block in parsing_blocks
                if point_in_box(center, block.get("block_bbox", []))
            ),
            "text",
        )
        candidates.append(candidate(text, confidence, polygon, kind_for_label(label)))
    candidates.sort(key=lambda item: (item["_top"], item["_left"], item["text"]))
    blocks: list[dict[str, object]] = []
    for order, item in enumerate(candidates):
        item.pop("_top")
        item.pop("_left")
        item.update(
            {
                "page": page.page,
                "readingOrder": order,
                "inputHash": page.inputHash,
            }
        )
        blocks.append(item)
    return {"page": page.page, "inputHash": page.inputHash, "blocks": blocks}


def strict_ocr_rows(result: dict[str, object]) -> list[tuple[object, object, object]]:
    texts = result.get("rec_texts", [])
    scores = result.get("rec_scores", [])
    polygons = result.get("rec_polys", [])
    if not isinstance(texts, list) or not isinstance(scores, list) or not isinstance(polygons, list):
        raise RuntimeError("OCR_RESULT_SCHEMA_INVALID")
    if len(texts) != len(scores) or len(texts) != len(polygons):
        raise RuntimeError("OCR_RESULT_SCHEMA_INVALID")
    return list(zip(texts, scores, polygons))


def candidate(
    text: object,
    confidence: object,
    polygon: object,
    kind: str,
    **table_coordinates: int,
) -> dict[str, object]:
    normalized = str(text).strip()
    if not normalized:
        raise RuntimeError("OCR_EMPTY_BLOCK")
    if not isinstance(polygon, list) or len(polygon) != 4:
        raise RuntimeError("OCR_POLYGON_INVALID")
    flattened = [float(value) for point in polygon for value in point]
    if len(flattened) != 8:
        raise RuntimeError("OCR_POLYGON_INVALID")
    bounds = polygon_bounds(polygon)
    return {
        "polygon": flattened,
        "text": normalized,
        "confidence": float(confidence),
        "kind": kind,
        **table_coordinates,
        "_left": bounds[0],
        "_top": bounds[1],
    }


def polygon_bounds(polygon: object) -> list[float]:
    if not isinstance(polygon, list) or not polygon:
        raise RuntimeError("OCR_POLYGON_INVALID")
    xs = [float(point[0]) for point in polygon]
    ys = [float(point[1]) for point in polygon]
    return [min(xs), min(ys), max(xs), max(ys)]


def polygon_center(polygon: object) -> tuple[float, float]:
    left, top, right, bottom = polygon_bounds(polygon)
    return ((left + right) / 2, (top + bottom) / 2)


def point_in_box(point: tuple[float, float], box: object) -> bool:
    if not isinstance(box, list) or len(box) != 4:
        return False
    return float(box[0]) <= point[0] <= float(box[2]) and float(box[1]) <= point[1] <= float(
        box[3]
    )


def containing_box_index(boxes: object, point: tuple[float, float]) -> int | None:
    if not isinstance(boxes, list):
        return None
    return next((index for index, box in enumerate(boxes) if point_in_box(point, box)), None)


def table_rows(boxes: object) -> list[int]:
    if not isinstance(boxes, list):
        return []
    row_tops: list[float] = []
    rows: list[int] = []
    for box in boxes:
        top = float(box[1])
        row = next((index for index, value in enumerate(row_tops) if abs(value - top) <= 5), None)
        if row is None:
            row_tops.append(top)
            row = len(row_tops) - 1
        rows.append(row)
    return rows


def kind_for_label(label: str) -> str:
    if label in {"title", "paragraph_title", "doc_title"}:
        return "HEADING"
    if label in {"list", "list_item"}:
        return "LIST_ITEM"
    return "PARAGRAPH"
