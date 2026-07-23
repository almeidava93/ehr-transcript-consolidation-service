import sqlite3
import json
from typing import Any

from agents import Span, Trace
from agents.tracing.processor_interface import TracingExporter

from api.settings import TRACES_DB_PATH


class SQLiteTracingExporter(TracingExporter):
    def connect_db(self) -> sqlite3.Connection:
        conn = sqlite3.connect(TRACES_DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS traces (
                trace_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                tracing_api_key TEXT,
                data TEXT NOT NULL
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS spans (
                span_id TEXT PRIMARY KEY,
                trace_id TEXT NOT NULL,
                parent_id TEXT,
                span_data TEXT NOT NULL,
                span_error TEXT,
                started_at TEXT NOT NULL,
                ended_at TEXT NOT NULL,
                tracing_api_key TEXT,
                trace_metadata TEXT
            )
            """
        )
        return conn

    def _export_trace(self, trace: Trace) -> None:
        conn = self.connect_db()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO traces (trace_id, name, tracing_api_key, data)
            VALUES (?, ?, ?, ?)
            """,
            (
                trace.trace_id,
                trace.name,
                trace.tracing_api_key,
                json.dumps(trace.export()),
            ),
        )
        conn.commit()
        conn.close()

    def _export_span(self, span: Span[Any]) -> None:
        conn = self.connect_db()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO spans (span_id, trace_id, parent_id, span_data, span_error, started_at, ended_at, tracing_api_key, trace_metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                span.span_id,
                span.trace_id,
                span.parent_id,
                json.dumps(span.span_data.export()),
                json.dumps(span.error),
                span.started_at,
                span.ended_at,
                span.tracing_api_key,
                span.trace_metadata,
            ),
        )
        conn.commit()
        conn.close()

    def export(self, items: list["Trace | Span[Any]"]) -> None:
        for item in items:
            match item:
                case Trace():
                    self._export_trace(item)
                case Span():
                    self._export_span(item)
