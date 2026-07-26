# Frontend — EHR Consolidation Review

A minimal Next.js (App Router) UI for reviewing transcript-driven notifications
and applying suggested edits to the EHR.

## Flow

1. **Input screen** — load a patient EHR (`.json` object or `.txt` free text)
   and a transcript (`.json` with a `segments` array).
2. **Review screen** — the EHR is shown on the left; each transcript span is
   sent to `/v1/predict` in order and notifications stream in on the right.
   - Notifications carrying a **suggested edit** (`field` / `value` /
     `operator`) reveal **Approve / Dismiss** on hover.
   - Hovering a suggestion **highlights the target field/line** in the EHR and
     shows an inline **diff** of what approving would produce.
   - **Approve** applies the edit to the EHR in place; **Dismiss** discards it.

Light and dark themes are supported (toggle in the top bar; respects
`prefers-color-scheme` and persists the choice).

## How it talks to the API

The browser never calls FastAPI directly. It posts to an internal Next.js route
handler (`app/api/predict/route.ts`) which forwards to the API server-side —
avoiding CORS and keeping the API URL off the client. Target via `API_BASE_URL`
(default `http://localhost:8080`).

Sessions are threaded automatically: the first span sends `session_id: null`
plus the full EHR; the returned `session_id` is reused for later spans, which
only carry the transcript chunk.

## Applying edits

The edit engine lives in `app/lib/ehr-edit.ts` and runs entirely client-side:

- **JSON EHR** — `field` is a dot-path (`current_medications.0.dose`).
  `replace` sets a value, `add` appends to an array or string, `remove` deletes.
- **Text EHR** — sent to the API as raw text (the API adds line numbers);
  edits reference `text.N` (line N). `replace`/`add`/`remove` act on that line,
  and `add` on bare `text` appends a new line.

## Run locally (against a locally running API)

```bash
npm install
API_BASE_URL=http://localhost:8080 npm run dev   # http://localhost:3000
```

## Run with Docker Compose (from the repo root)

```bash
docker compose up --build                                     # production
docker compose -f compose.yaml -f compose.dev.yaml up --build # hot reload
```

Frontend on `http://localhost:3000`, reaching the API over the compose network
at `http://api:8080`.

## Sample data

Under [`services/api/data/`](../api/data): `medical-record.json` (EHR) and
`transcript.json` (transcript).
