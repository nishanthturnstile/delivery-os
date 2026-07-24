# Delivery OS

Delivery OS is a pnpm/TypeScript modular monolith. W0 provides the local platform, transaction and
outbox kernel, worker, provider boundaries, observability shell, and responsive web validation
surface.

The authoritative product and engineering documentation starts at [docs/README.md](docs/README.md).
The finalized W0 plan is
[docs/planning/w0-platform-foundation.md](docs/planning/w0-platform-foundation.md), and its current
test evidence is
[docs/validation/w0-platform-foundation.md](docs/validation/w0-platform-foundation.md).

## Local start

Prerequisites are Node.js 24 LTS, pnpm 11.17.0, and Docker with Compose.

```bash
pnpm install --frozen-lockfile
docker compose up -d postgres redis minio minio-init mailpit clamav
pnpm db:migrate
```

Start the complete hot-reload development runtime:

```bash
pnpm dev
```

The web app uses the Delivery OS-specific loopback port `53000`; the worker uses `58080`. Open
<http://127.0.0.1:53000> and run the platform check. Local service ports and optional OCR startup
are documented in
[Infrastructure and Deployment](docs/deployment/infrastructure.md#7-local-w0-runtime).

When this folder is open through VS Code Remote SSH, press `F5` and select **Delivery OS: debug
(full stack)**. VS Code prepares the containers and database, starts the web and worker watchers,
forwards only the web port to the same port on the local computer, and opens a local Chrome
debugging session. No additional tunnel utility or public listener is required.

To run only one process from the integrated terminal:

```bash
pnpm web
pnpm worker
```

## Validation

With the local PostgreSQL and Redis services running:

```bash
TEST_DATABASE_URL=postgresql://delivery_os:delivery_os_local@127.0.0.1:55432/delivery_os pnpm check
TEST_DATABASE_URL=postgresql://delivery_os:delivery_os_local@127.0.0.1:55432/delivery_os pnpm test:coverage
pnpm test:e2e
```

Run the same browser and accessibility specification against an already deployed environment with:

```bash
PLAYWRIGHT_BASE_URL=https://your-web-domain.example pnpm test:e2e
```

When `PLAYWRIGHT_BASE_URL` is set, Playwright does not start the local Next.js development server.

Production provider export is disabled by default. Copy `.env.example` only when overriding the safe
local defaults; never commit a populated environment file.
