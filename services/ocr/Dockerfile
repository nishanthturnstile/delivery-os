FROM python:3.13.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 10001 deliveryos \
    && useradd --system --uid 10001 --gid deliveryos --home-dir /app deliveryos

WORKDIR /app
COPY requirements.txt .
RUN python -m pip install --requirement requirements.txt

COPY --chown=deliveryos:deliveryos app.py .
USER 10001:10001

EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log", "--workers", "1"]
