# OCR Boundary

W0 provides a private, authenticated, non-root, read-only service boundary pinned to PaddleOCR 3.7.0
and PaddlePaddle 3.3.1. Its health and readiness endpoints are usable, but recognition is
deliberately disabled until S4 bakes and verifies the PP-StructureV3 model artifacts, fixture
accuracy, resource limits, and image digest. The service has no database, Redis, object-store, or
Internet credential.

Run the boundary explicitly with:

```sh
docker compose --profile ocr up ocr
```

`POST /v1/recognize` fails with an actionable `503` in W0. This is truthful operational state, not a
placeholder success response.
