import json
import sqlite3
from typing import Any

from agents import Span, Trace
from agents.tracing.processor_interface import TracingExporter
from agents.tracing.span_data import ResponseSpanData

from api.settings import TRACES_DB_PATH


class SQLiteTracingExporter(TracingExporter):
    def connect_db(self) -> sqlite3.Connection:
        conn = sqlite3.connect(TRACES_DB_PATH)

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS traces (
                trace_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                tracing_api_key TEXT,
                data TEXT NOT NULL
            )
            """
        )

        conn.execute(
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

    @staticmethod
    def _serialize_span_data(span: Span[Any]) -> dict[str, Any]:
        span_data = span.span_data
        payload = span_data.export()

        if isinstance(span_data, ResponseSpanData):
            response = span_data.response

            payload["input"] = span_data.input
            payload["response"] = (
                response.model_dump(mode="json", exclude_none=True)
                if response is not None
                else None
            )
            payload["output_text"] = (
                response.output_text if response is not None else None
            )

        return payload

    def _export_trace(self, trace: Trace) -> None:
        with self.connect_db() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO traces (
                    trace_id,
                    name,
                    tracing_api_key,
                    data
                )
                VALUES (?, ?, ?, ?)
                """,
                (
                    trace.trace_id,
                    trace.name,
                    trace.tracing_api_key,
                    json.dumps(trace.export(), ensure_ascii=False),
                ),
            )

    def _export_span(self, span: Span[Any]) -> None:
        with self.connect_db() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO spans (
                    span_id,
                    trace_id,
                    parent_id,
                    span_data,
                    span_error,
                    started_at,
                    ended_at,
                    tracing_api_key,
                    trace_metadata
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    span.span_id,
                    span.trace_id,
                    span.parent_id,
                    json.dumps(
                        self._serialize_span_data(span),
                        ensure_ascii=False,
                    ),
                    (
                        json.dumps(span.error, ensure_ascii=False)
                        if span.error is not None
                        else None
                    ),
                    span.started_at,
                    span.ended_at,
                    span.tracing_api_key,
                    (
                        json.dumps(span.trace_metadata, ensure_ascii=False)
                        if span.trace_metadata is not None
                        else None
                    ),
                ),
            )

    def export(self, items: list[Trace | Span[Any]]) -> None:
        for item in items:
            match item:
                case Trace():
                    self._export_trace(item)
                case Span():
                    self._export_span(item)
