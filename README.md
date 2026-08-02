# EHR & Transcript Consolidation Service

A service that watches a live clinical conversation and, chunk by chunk, compares
what is being said against the patient's existing Electronic Health Record (EHR).
When the transcript and the record disagree — or the transcript adds information
the record is missing — it emits **notifications**, each optionally carrying a
concrete **edit suggestion** for the EHR.

It is packaged as two application services (a Python API and a Next.js frontend)
backed by Redis and MySQL, and can be run either with Docker Compose or on a
Kubernetes cluster (locally via minikube).

---

## Architecture

```mermaid
flowchart LR
    User([Browser]) -->|HTTP :3000| FE[frontend<br/>Next.js]
    FE -->|/api/predict proxy| API[api<br/>FastAPI :8080]
    API -->|LLM inference| OpenAI[(OpenAI API)]
    API <-->|conversation sessions| Redis[(Redis :6379)]
    API -->|traces & spans| MySQL[(MySQL :3306)]
```

- The **browser only ever talks to the frontend.** The frontend proxies prediction
  calls to the API server-side, which keeps the API URL out of the client bundle and
  sidesteps CORS.
- The **API** performs the actual comparison using an LLM agent, remembers the
  conversation in **Redis**, and records execution traces in **MySQL**.

### How one prediction works

The API exposes `POST /v1/predict`. It is designed to be called repeatedly as a
conversation streams in:

1. **First call** — the client sends `session_id: null`, the **full `ehr_data`**, and
   the first `transcript_chunk`. The API creates a Redis-backed session, runs the
   agent, and returns a `session_id` alongside any notifications.
2. **Subsequent calls** — the client passes the returned `session_id` and only the
   next `transcript_chunk`. The EHR context and prior turns live in the Redis session,
   so each call stays small.

A response is a list of `notifications`, each with a `type`
(`information_missing` | `information_conflict`), a `message`, and an optional
`suggested_edit` (`add` / `replace` / `remove` against a field path in the EHR).

### Demo 

Here is a short video showing the processing of a fictional medical encounter in the context of the patient's EHR summary data. The frontend shows notifications popping up and, some of them, include important edit suggestions to make the EHR summary align with the information collected during the medical encounter.

<p align="center">
  <a href="https://www.youtube.com/watch?v=vZOHQUEYVy8">
    <img src="https://img.youtube.com/vi/vZOHQUEYVy8/0.jpg" alt="Watch the EHR transcript consolidation app demo" width="600">
  </a>
</p>

---

## Repository structure

```
.
├── compose.yaml            # Base Docker Compose stack (production images)
├── compose.dev.yaml        # Dev overlay: hot-reload, source bind mounts
├── k8s/                    # Kubernetes manifests (one folder per component)
│   ├── namespace.yaml
│   ├── api/                # Deployment (+ init container), Service, HPA
│   ├── frontend/           # Deployment, Service (LoadBalancer)
│   ├── redis/              # Deployment, Service
│   ├── mysql/              # Deployment, Service, PersistentVolume + Claim
│   └── secrets/            # mysql-secret manifest (api-secrets is created from .env)
├── scripts/
│   ├── build.sh            # docker build for the api image
│   ├── run.sh              # docker run for the api image (standalone)
│   └── apply_k8s.ps1       # Create secrets from .env + apply all k8s manifests
└── services/
    ├── api/                # FastAPI service (Python 3.12, uv)
    │   ├── api/
    │   │   ├── main.py     # App, tracing wiring, /health, /version
    │   │   ├── database.py # SQLAlchemy URL for MySQL
    │   │   ├── settings.py # Env-driven configuration
    │   │   └── routers/v1/ # /v1/predict router, service, schemas, config, tracing
    │   └── Dockerfile      # Multi-stage: test → production
    └── frontend/           # Next.js 15 app (Node 22)
        ├── app/
        │   ├── api/predict/route.ts  # Server-side proxy to the API
        │   ├── components/           # EHR panel, input screen, notifications
        │   └── lib/                  # Client-side API helpers
        └── Dockerfile               # Multi-stage: deps → builder → production
```

---

## The services

| Service    | Tech            | Port | Role |
|------------|-----------------|------|------|
| `api`      | FastAPI, Python 3.12 (uv) | 8080 | Core inference API. Runs the LLM agent that compares each transcript chunk to the EHR and produces notifications + edit suggestions. |
| `frontend` | Next.js 15, Node 22 | 3000 | User interface and **server-side proxy** to the API. The only service a browser talks to. |
| `redis`    | Redis           | 6379 | Stores per-conversation **session memory** so repeat calls only need the newest chunk. |
| `mysql`    | MySQL 8.4       | 3306 | Stores agent **traces and spans** for observability (tables `traces`, `spans` in `application_db`). |

### `api`

- **Framework:** FastAPI, served by Uvicorn. Dependencies managed by **uv**.
- **Inference:** uses the OpenAI Agents SDK. Agent behavior (model, instructions,
  prompt templates, output schema) is defined declaratively in
  `api/routers/v1/config/config_001.yaml` and loaded per request.
- **Sessions:** `RedisSession` keyed by a generated `session_id`; requires `REDIS_URL`.
- **Tracing:** a custom `MySQLTracingExporter` wrapped in a `BatchTraceProcessor`
  batches traces/spans and writes them to MySQL. Tables are created at startup.
- **Endpoints:** `POST /v1/predict`, `GET /health`, `GET /version`, `GET /docs`.

### `frontend`

- **Framework:** Next.js (App Router). Built as a **standalone** output for a small
  production image.
- The route `app/api/predict/route.ts` forwards `POST /api/predict` to
  `${API_BASE_URL}/v1/predict`. `API_BASE_URL` is a **server-side** env var
  (defaults to `http://localhost:8080`; set to `http://api:8080` in-cluster).

---

## Configuration

The API reads its configuration from environment variables. Locally these live in
`services/api/.env` (not committed). Required keys:

| Variable | Used by | Purpose |
|----------|---------|---------|
| `OPENAI_API_KEY` | api | LLM inference |
| `REDIS_URL` | api | Session store, e.g. `redis://redis-service:6379` |
| `MYSQL_HOST` | api | MySQL host (`mysql-service`) |
| `MYSQL_PORT` | api | MySQL port (`3306`) |
| `MYSQL_USER` / `MYSQL_PASSWORD` | api, mysql | Application DB credentials |
| `MYSQL_DATABASE` | api, mysql | Application database name |
| `MYSQL_ROOT_PASSWORD` | mysql | Root password for DB initialization |
| `API_BASE_URL` | frontend | URL of the API (server-side only) |

> **Note:** MySQL only provisions `MYSQL_DATABASE` / `MYSQL_USER` on **first
> initialization of an empty data directory**. The credentials the API connects with
> must match the ones MySQL was initialized with.

---

## Running locally with Docker Compose

Prerequisites: Docker Desktop, and a populated `services/api/.env`.

### Production-like stack

```bash
docker compose up --build
```

- Frontend: <http://localhost:3000>
- API docs: <http://localhost:8080/docs>

The API waits for MySQL to be healthy before starting (`depends_on`), and reaches
Redis/MySQL over the Compose network by service name.

### Development (hot reload)

The `compose.dev.yaml` overlay mounts source into the containers and swaps in
dev commands (`uvicorn --reload` for the API, `next dev` for the frontend):

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

> The dev overlay builds the frontend’s `builder` stage. Do **not** reuse that image
> for Kubernetes — its default command is the bare `node` REPL, which exits
> immediately outside Compose. Always build the `production` target for the cluster.

---

## Running on Kubernetes (minikube)

All resources live in the `ehr-transcript-consolidation-service` namespace.

### 1. Start the cluster and metrics

```bash
minikube start
minikube addons enable metrics-server
```

### 2. Build the images into minikube’s Docker daemon

Pods use local images (`imagePullPolicy: IfNotPresent` / `Never`), so the images
must exist **inside** minikube — not just in Docker Desktop. Building directly into
minikube’s daemon is the most reliable route:

```bash
minikube image build -t api:latest ./services/api
minikube image build -t frontend:latest ./services/frontend
```

(`minikube image load <name>` also works if you built on the host first, but it will
not overwrite a tag that a running pod is holding — see gotchas.)

### 3. Create secrets and apply manifests

`scripts/apply_k8s.ps1` creates the `api-secrets` secret from `services/api/.env`
and applies everything under `k8s/` (including the committed `mysql-secret`):

```powershell
powershell -File scripts/apply_k8s.ps1
```

### 4. Access the app

The frontend Service is `type: LoadBalancer`, which stays `<pending>` on minikube.
Open it with:

```bash
minikube service frontend -n ehr-transcript-consolidation-service
```

(or run `minikube tunnel` in a separate terminal to get a real external IP).

### 5. Verify

```bash
# Pods should all be Running / 1/1
kubectl get pods -n ehr-transcript-consolidation-service

# Trace tables exist and fill after predictions flush (~5s batching window)
kubectl exec -n ehr-transcript-consolidation-service deploy/mysql-deployment -- \
  sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -e \
  "SHOW TABLES FROM application_db; SELECT COUNT(*) FROM application_db.spans;"'
```

### Kubernetes components

| Manifest | Kind | Notes |
|----------|------|-------|
| `api/deployment.yaml` | Deployment | Includes a `wait-for-mysql` init container; replicas managed by the HPA; liveness/readiness/startup probes on `/health`. |
| `api/service.yaml` | Service (ClusterIP) | Internal DNS name `api`. |
| `api/hpa.yaml` | HorizontalPodAutoscaler | CPU-target autoscaling, 1–5 replicas (needs metrics-server). |
| `frontend/*` | Deployment + Service (LoadBalancer) | External entry point on port 3000. |
| `redis/*` | Deployment + Service | Session store, DNS name `redis-service`. |
| `mysql/*` | Deployment + Service + PV/PVC | `Recreate` strategy; data persisted on a `hostPath` PV at `/mnt/data`. |
| `secrets/mysql.yaml` | Secret | `mysql-secret` (DB credentials). `api-secrets` is created from `.env` by the apply script. |

