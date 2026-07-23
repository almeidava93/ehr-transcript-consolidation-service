from pathlib import Path

from agents import set_trace_processors
from fastapi import FastAPI
import dotenv
from agents.tracing.processors import BatchTraceProcessor

from api.routers.v1.router import router as v1_router
from api.routers.v1.tracing import SQLiteTracingExporter

dotenv.load_dotenv()

app = FastAPI(
    title="EHR and transcript validation service",
    docs_url="/docs",
    redoc_url=None,
)

# Setup tracing
trace_processor = BatchTraceProcessor(exporter=SQLiteTracingExporter())
set_trace_processors([trace_processor])

app.include_router(v1_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
