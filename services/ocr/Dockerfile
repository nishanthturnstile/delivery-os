FROM python:3.13.11-slim-bookworm@sha256:20080e807bfc404f8450b185cf0fc95d553462673598549613735f70a5b4d5d0

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PADDLE_PDX_CACHE_HOME=/opt/paddlex

RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 10001 deliveryos \
    && useradd --system --uid 10001 --gid deliveryos --home-dir /app deliveryos

WORKDIR /app
COPY requirements.txt .
RUN python -m pip install --requirement requirements.txt

COPY prepare_models.py model-manifest.json ./
RUN python prepare_models.py \
    && chown -R deliveryos:deliveryos /opt/paddlex generated-model-manifest.json

ENV PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1

COPY --chown=deliveryos:deliveryos app.py model-manifest.json sbom.cdx.json ./
USER 10001:10001

EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log", "--workers", "1"]
