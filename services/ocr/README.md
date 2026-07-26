# OCR Boundary

M3 provides a private, authenticated, non-root, read-only service boundary pinned to PaddleOCR
3.7.0, PaddlePaddle 3.3.1, and Paddlex 3.7.2. The build creates the complete PP-StructureV3
pipeline, exercises lazy model loading, hashes every baked artifact, and fails if the result differs
from `model-manifest.json`. Runtime model-source checks are disabled. The service has no database,
Redis, object-store, or Internet credential.

Run the boundary explicitly with:

```sh
docker compose --profile ocr up ocr
```

`POST /v1/recognize` accepts only authenticated bounded pages, verifies the complete SHA-256 before
decoding, enforces the 20-megapixel/page limit and 30-second timeout, and emits exact polygons,
confidence, order, and table-cell coordinates. Normal operation fails with an actionable `503` until
the immutable approval manifest contains human promotion evidence. `OCR_EVALUATION_MODE=true` is the
only pre-promotion execution path and reports `evaluation_ready`, never `ready`.

The current candidate is intentionally not promoted. Its model artifact manifest is
`4bc98087d81049792a1847a950ebae9e95e83fc643911ae4eb05af70d6db557e`; the final local image candidate
is recorded in the M3 validation record. Two frozen evaluation runs and Nishanth's acceptance remain
mandatory.
