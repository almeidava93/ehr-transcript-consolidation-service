from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from agents import set_trace_processors, flush_traces
from fastapi import FastAPI
import dotenv
from agents.tracing.processors import BatchTraceProcessor

import api.settings as settings
from api.routers.v1.router import router as v1_router
from api.routers.v1.tracing import MySQLTracingExporter
from api.database import database_url
from api.logs import configure_logging, get_logger

configure_logging()
logger = get_logger(__name__)
dotenv.load_dotenv()


@asynccontextmanager
async def lifespan(
    app: FastAPI,
) -> AsyncGenerator[None]:
    # Setup connection with MySQL and tracing
    exporter: MySQLTracingExporter | None = None
    processor: BatchTraceProcessor | None = None

    try:
        exporter = MySQLTracingExporter(
            database_url=database_url,
        )

        processor = BatchTraceProcessor(
            exporter=exporter,
            schedule_delay=1.0,
        )

        set_trace_processors([processor])

    except Exception:
        logger.exception("MySQL tracing could not be initialized")

    try:
        yield
    finally:
        if processor is not None:
            flush_traces()
            processor.shutdown(timeout=5.0)

        if exporter is not None:
            exporter.close()


app = FastAPI(
    title=settings.TITLE,
    docs_url="/docs",
    redoc_url=None,
    version=settings.VERSION,
)

# Setup tracing
mysql_tracing_exporter = MySQLTracingExporter(
    database_url=database_url,
)

mysql_tracing_processor = BatchTraceProcessor(
    exporter=mysql_tracing_exporter,
    max_batch_size=128,
    schedule_delay=5.0,
)

set_trace_processors([mysql_tracing_processor])

app.include_router(v1_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/version")
async def version():
    return {"version": settings.VERSION}
