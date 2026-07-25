"use client";

import { useMemo, useRef, useState } from "react";
import type {
  EHRData,
  PredictionResponse,
  SegmentResult,
  Transcript,
  TranscriptChunk,
} from "./types";

interface FileState<T> {
  data: T | null;
  fileName: string | null;
  error: string | null;
}

const emptyFile = <T,>(): FileState<T> => ({
  data: null,
  fileName: null,
  error: null,
});

async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text();
  return JSON.parse(text);
}

function isTranscript(value: unknown): value is Transcript {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { segments?: unknown }).segments)
  );
}

export default function Home() {
  const [ehr, setEhr] = useState<FileState<EHRData>>(emptyFile);
  const [transcript, setTranscript] = useState<FileState<Transcript>>(emptyFile);
  const [results, setResults] = useState<SegmentResult[]>([]);
  const [running, setRunning] = useState(false);
  const cancelRef = useRef(false);

  const totalSegments = transcript.data?.segments.length ?? 0;
  const processedCount = results.filter(
    (r) => r.status === "done" || r.status === "error",
  ).length;

  const { conflicts, missing } = useMemo(() => {
    let conflicts = 0;
    let missing = 0;
    for (const r of results) {
      for (const n of r.notifications) {
        if (n.type === "information_conflict") conflicts++;
        else if (n.type === "information_missing") missing++;
      }
    }
    return { conflicts, missing };
  }, [results]);

  const canRun = ehr.data !== null && transcript.data !== null && !running;

  async function handleEhrFile(file: File | undefined) {
    if (!file) return;
    try {
      const data = await readJsonFile(file);
      if (typeof data !== "object" || data === null || Array.isArray(data)) {
        setEhr({ data: null, fileName: file.name, error: "Expected a JSON object." });
        return;
      }
      setEhr({ data: data as EHRData, fileName: file.name, error: null });
    } catch (e) {
      setEhr({
        data: null,
        fileName: file.name,
        error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  async function handleTranscriptFile(file: File | undefined) {
    if (!file) return;
    try {
      const data = await readJsonFile(file);
      if (!isTranscript(data)) {
        setTranscript({
          data: null,
          fileName: file.name,
          error: 'Expected an object with a "segments" array.',
        });
        return;
      }
      setTranscript({ data, fileName: file.name, error: null });
    } catch (e) {
      setTranscript({
        data: null,
        fileName: file.name,
        error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  async function predictSegment(
    ehrData: EHRData,
    chunk: TranscriptChunk,
  ): Promise<PredictionResponse> {
    const res = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ehr_data: ehrData, transcript_chunk: chunk }),
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(
        payload?.error ?? payload?.detail ?? `Request failed (${res.status})`,
      );
    }
    return payload as PredictionResponse;
  }

  async function runSimulation() {
    if (!ehr.data || !transcript.data) return;
    const ehrData = ehr.data;
    const segments = transcript.data.segments;

    cancelRef.current = false;
    setRunning(true);
    // Seed every segment as pending so the full list renders up front.
    setResults(
      segments.map((segment) => ({
        segment,
        status: "pending",
        notifications: [],
      })),
    );

    for (let i = 0; i < segments.length; i++) {
      if (cancelRef.current) break;

      setResults((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], status: "processing" };
        return next;
      });

      try {
        const response = await predictSegment(ehrData, segments[i]);
        setResults((prev) => {
          const next = [...prev];
          next[i] = {
            ...next[i],
            status: "done",
            notifications: response.notifications ?? [],
          };
          return next;
        });
      } catch (e) {
        setResults((prev) => {
          const next = [...prev];
          next[i] = {
            ...next[i],
            status: "error",
            error: e instanceof Error ? e.message : String(e),
          };
          return next;
        });
      }
    }

    setRunning(false);
  }

  function stopSimulation() {
    cancelRef.current = true;
  }

  const progressPct = totalSegments
    ? Math.round((processedCount / totalSegments) * 100)
    : 0;

  return (
    <main className="container">
      <h1>EHR × Transcript Simulator</h1>
      <p className="subtitle">
        Upload the patient EHR (JSON) and a transcript (JSON), then run the
        simulation. Each transcript span is sent to <code>/v1/predict</code> in
        order — notifications appear as they are generated.
      </p>

      <section className="panel">
        <div className="field">
          <label className="field-label" htmlFor="ehr">
            EHR data (JSON object)
          </label>
          <input
            id="ehr"
            type="file"
            accept="application/json,.json"
            onChange={(e) => handleEhrFile(e.target.files?.[0])}
          />
          <div className="hint">
            e.g. <code>data/medical-record.json</code>
          </div>
          {ehr.fileName && !ehr.error && (
            <div className="status-line ok">Loaded {ehr.fileName}</div>
          )}
          {ehr.error && <div className="status-line err">{ehr.error}</div>}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="transcript">
            Transcript (JSON with a <code>segments</code> array)
          </label>
          <input
            id="transcript"
            type="file"
            accept="application/json,.json"
            onChange={(e) => handleTranscriptFile(e.target.files?.[0])}
          />
          <div className="hint">
            e.g. <code>data/transcript.json</code>
          </div>
          {transcript.fileName && !transcript.error && (
            <div className="status-line ok">
              Loaded {transcript.fileName} — {totalSegments} segment
              {totalSegments === 1 ? "" : "s"}
            </div>
          )}
          {transcript.error && (
            <div className="status-line err">{transcript.error}</div>
          )}
        </div>

        <div className="actions">
          <button
            className="primary"
            onClick={runSimulation}
            disabled={!canRun}
          >
            {running ? "Running…" : "Run simulation"}
          </button>
          {running && (
            <button className="ghost" onClick={stopSimulation}>
              Stop
            </button>
          )}
        </div>
      </section>

      {results.length > 0 && (
        <>
          <div className="progress">
            {running && <span className="spinner" aria-hidden />}
            <span>
              {processedCount} / {totalSegments} processed
            </span>
            <div className="progress-bar" aria-hidden>
              <span style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          <div className="summary-badges">
            <span className="badge conflict">{conflicts} conflicts</span>
            <span className="badge missing">{missing} missing</span>
          </div>

          <section>
            {results.map((r, i) => (
              <div
                key={i}
                className={`segment ${r.status === "processing" ? "processing" : ""}`}
              >
                <div className="segment-head">
                  <span className="timestamp">{r.segment.t}</span>
                  <span className="speaker">{r.segment.speaker}</span>
                  <span className={`state-tag ${r.status}`}>
                    {r.status === "processing" ? "processing…" : r.status}
                  </span>
                </div>
                <p className="segment-text">{r.segment.text}</p>

                {r.status === "done" &&
                  (r.notifications.length > 0 ? (
                    <div className="notifications">
                      {r.notifications.map((n, j) => (
                        <div key={j} className={`notification ${n.type}`}>
                          <span className="n-type">
                            {n.type.replace("information_", "")}
                          </span>
                          {n.message}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="no-issues">No issues detected</div>
                  ))}

                {r.status === "error" && (
                  <div className="error-text">Error: {r.error}</div>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
