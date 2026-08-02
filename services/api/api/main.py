from agents import set_trace_processors
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
