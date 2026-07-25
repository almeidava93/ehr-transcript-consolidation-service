# Frontend — EHR × Transcript Simulator

A small Next.js (App Router) UI to simulate the `/v1/predict` API against a real
transcript. Upload the patient EHR (JSON object) and a transcript
(JSON with a `segments` array); on submit, each segment is sent to the API in
order and notifications render as they are generated — the browser equivalent of
[`scripts/simulate_requests.py`](../../scripts/simulate_requests.py).

## How it talks to the API

The browser never calls FastAPI directly. It posts to an internal Next.js route
handler (`app/api/predict/route.ts`) which forwards to the API server-side. This
avoids CORS and keeps the API URL off the client. The target is set via the
`API_BASE_URL` env var (default `http://localhost:8080`).

## Run locally (against a locally running API)

```bash
npm install
API_BASE_URL=http://localhost:8080 npm run dev   # http://localhost:3000
```

## Run with Docker Compose (from the repo root)

```bash
# Production
docker compose up --build

# Development (hot reload for both services)
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

The frontend is served on `http://localhost:3000` and reaches the API over the
compose network at `http://api:8080`.

## Sample data

Use the files under [`data/`](../../data): `medical-record.json` (EHR) and
`transcript.json` (transcript).
