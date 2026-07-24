import os
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException, status
from pydantic import BaseModel, ConfigDict


MODEL_VERSION = os.environ.get("OCR_MODEL_VERSION", "PP-StructureV3@paddleocr-3.7.0")
RECOGNITION_ENABLED = os.environ.get("OCR_RECOGNITION_ENABLED", "false") == "true"
SERVICE_TOKEN = os.environ.get("OCR_SERVICE_TOKEN")

app = FastAPI(
    docs_url=None,
    openapi_url=None,
    redoc_url=None,
    title="Delivery OS private OCR boundary",
    version="1",
)


class RecognitionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str
    source_id: str
    page_hashes: list[str]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ocr"}


@app.get("/ready")
def ready() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "service": "ocr",
        "modelVersion": MODEL_VERSION,
        "recognitionEnabled": RECOGNITION_ENABLED,
    }


@app.post("/v1/recognize")
def recognize(
    request: RecognitionRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, str]:
    if SERVICE_TOKEN is None or authorization != f"Bearer {SERVICE_TOKEN}":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthenticated")
    if not RECOGNITION_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OCR recognition is disabled until the S4 model artifact gate passes.",
        )
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Recognition pipeline is delivered by S4.",
    )
