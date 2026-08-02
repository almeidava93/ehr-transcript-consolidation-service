from __future__ import annotations

import json
import sqlite3
from typing import Any

from sqlalchemy import (
    Column,
    MetaData,
    String,
    Table,
    create_engine,
)
from sqlalchemy.dialects.mysql import (
    LONGTEXT,
    insert as mysql_insert,
)
from sqlalchemy.engine import Connection, Engine, URL


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


class MySQLTracingExporter(TracingExporter):
    def __init__(self, database_url: str | URL) -> None:
        self._engine: Engine = create_engine(
            database_url,
            pool_pre_ping=True,
            pool_recycle=1800,
        )

        self._metadata = MetaData()

        self._traces = Table(
            "traces",
            self._metadata,
            Column(
                "trace_id",
                String(64),
                primary_key=True,
            ),
            Column(
                "name",
                String(255),
                nullable=False,
            ),
            Column(
                "tracing_api_key",
                String(512),
                nullable=True,
            ),
            Column(
                "data",
                LONGTEXT,
                nullable=False,
            ),
        )

        self._spans = Table(
            "spans",
            self._metadata,
            Column(
                "span_id",
                String(64),
                primary_key=True,
            ),
            Column(
                "trace_id",
                String(64),
                nullable=False,
                index=True,
            ),
            Column(
                "parent_id",
                String(64),
                nullable=True,
            ),
            Column(
                "span_data",
                LONGTEXT,
                nullable=False,
            ),
            Column(
                "span_error",
                LONGTEXT,
                nullable=True,
            ),
            Column(
                "started_at",
                String(64),
                nullable=False,
            ),
            Column(
                "ended_at",
                String(64),
                nullable=False,
            ),
            Column(
                "tracing_api_key",
                String(512),
                nullable=True,
            ),
            Column(
                "trace_metadata",
                LONGTEXT,
                nullable=True,
            ),
        )

        self._metadata.create_all(self._engine)

    @staticmethod
    def _serialize_span_data(
        span: Span[Any],
    ) -> dict[str, Any]:
        span_data = span.span_data
        payload = span_data.export()

        if isinstance(span_data, ResponseSpanData):
            response = span_data.response

            payload["input"] = span_data.input
            payload["response"] = (
                response.model_dump(
                    mode="json",
                    exclude_none=True,
                )
                if response is not None
                else None
            )
            payload["output_text"] = (
                response.output_text if response is not None else None
            )

        return payload

    def _export_trace(
        self,
        connection: Connection,
        trace: Trace,
    ) -> None:
        values = {
            "trace_id": trace.trace_id,
            "name": trace.name,
            "tracing_api_key": trace.tracing_api_key,
            "data": json.dumps(
                trace.export(),
                ensure_ascii=False,
            ),
        }

        insert_statement = mysql_insert(
            self._traces,
        ).values(**values)

        upsert_statement = insert_statement.on_duplicate_key_update(
            name=insert_statement.inserted.name,
            tracing_api_key=(insert_statement.inserted.tracing_api_key),
            data=insert_statement.inserted.data,
        )

        connection.execute(upsert_statement)

    def _export_span(
        self,
        connection: Connection,
        span: Span[Any],
    ) -> None:
        values = {
            "span_id": span.span_id,
            "trace_id": span.trace_id,
            "parent_id": span.parent_id,
            "span_data": json.dumps(
                self._serialize_span_data(span),
                ensure_ascii=False,
            ),
            "span_error": (
                json.dumps(
                    span.error,
                    ensure_ascii=False,
                )
                if span.error is not None
                else None
            ),
            "started_at": span.started_at,
            "ended_at": span.ended_at,
            "tracing_api_key": span.tracing_api_key,
            "trace_metadata": (
                json.dumps(
                    span.trace_metadata,
                    ensure_ascii=False,
                )
                if span.trace_metadata is not None
                else None
            ),
        }

        insert_statement = mysql_insert(
            self._spans,
        ).values(**values)

        upsert_statement = insert_statement.on_duplicate_key_update(
            trace_id=insert_statement.inserted.trace_id,
            parent_id=insert_statement.inserted.parent_id,
            span_data=insert_statement.inserted.span_data,
            span_error=insert_statement.inserted.span_error,
            started_at=insert_statement.inserted.started_at,
            ended_at=insert_statement.inserted.ended_at,
            tracing_api_key=(insert_statement.inserted.tracing_api_key),
            trace_metadata=(insert_statement.inserted.trace_metadata),
        )

        connection.execute(upsert_statement)

    def export(
        self,
        items: list[Trace | Span[Any]],
    ) -> None:
        if not items:
            return

        # One connection and one transaction for the entire batch.
        with self._engine.begin() as connection:
            for item in items:
                if isinstance(item, Trace):
                    self._export_trace(
                        connection,
                        item,
                    )
                elif isinstance(item, Span):
                    self._export_span(
                        connection,
                        item,
                    )
                else:
                    raise TypeError(
                        f"Expected a Trace or Span, received {type(item).__name__}."
                    )

    def close(self) -> None:
        self._engine.dispose()
