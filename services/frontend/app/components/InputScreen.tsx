"use client";

import { useState } from "react";
import type { EhrModel, Transcript } from "../types";
import { parseEhrJson, parseEhrText } from "../lib/ehr-edit";

interface LoadState<T> {
  value: T | null;
  fileName: string | null;
  error: string | null;
}

const empty = <T,>(): LoadState<T> => ({
  value: null,
  fileName: null,
  error: null,
});

function isTranscript(v: unknown): v is Transcript {
  return (
    typeof v === "object" &&
    v !== null &&
    Array.isArray((v as { segments?: unknown }).segments)
  );
}

export default function InputScreen({
  onStart,
}: {
  onStart: (ehr: EhrModel, transcript: Transcript) => void;
}) {
  const [ehr, setEhr] = useState<LoadState<EhrModel>>(empty);
  const [transcript, setTranscript] = useState<LoadState<Transcript>>(empty);

  async function handleEhr(file: File | undefined) {
    if (!file) return;
    const isJson =
      file.name.toLowerCase().endsWith(".json") || file.type === "application/json";
    try {
      const raw = await file.text();
      const model = isJson ? parseEhrJson(raw) : parseEhrText(raw);
      if (isJson && (model.kind !== "json" || typeof model.data !== "object" || model.data === null)) {
        setEhr({ value: null, fileName: file.name, error: "Expected a JSON object." });
        return;
      }
      setEhr({ value: model, fileName: file.name, error: null });
    } catch (e) {
      setEhr({
        value: null,
        fileName: file.name,
        error: `Could not parse: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  async function handleTranscript(file: File | undefined) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!isTranscript(data)) {
        setTranscript({
          value: null,
          fileName: file.name,
          error: 'Expected an object with a "segments" array.',
        });
        return;
      }
      setTranscript({ value: data, fileName: file.name, error: null });
    } catch (e) {
      setTranscript({
        value: null,
        fileName: file.name,
        error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  const ready = ehr.value !== null && transcript.value !== null;
  const segCount = transcript.value?.segments.length ?? 0;

  return (
    <div className="input-wrap">
      <h1>Consolidation review</h1>
      <p className="lede">
        Load a patient EHR and a visit transcript. Each transcript span is
        checked against the record, and suggested edits can be reviewed and
        applied.
      </p>

      <div className="drop">
        <div className="label">EHR data</div>
        <div className="sub">JSON object (.json) or free text (.txt)</div>
        <input
          type="file"
          accept=".json,.txt,application/json,text/plain"
          onChange={(e) => handleEhr(e.target.files?.[0])}
        />
        {ehr.value && !ehr.error && (
          <div className="loaded">
            Loaded {ehr.fileName} —{" "}
            {ehr.value.kind === "json"
              ? "structured JSON"
              : `${ehr.value.lines.length} lines of text`}
          </div>
        )}
        {ehr.error && <div className="err">{ehr.error}</div>}
      </div>

      <div className="drop">
        <div className="label">Transcript</div>
        <div className="sub">
          JSON with a <code>segments</code> array
        </div>
        <input
          type="file"
          accept=".json,application/json"
          onChange={(e) => handleTranscript(e.target.files?.[0])}
        />
        {transcript.value && !transcript.error && (
          <div className="loaded">
            Loaded {transcript.fileName} — {segCount} segment
            {segCount === 1 ? "" : "s"}
          </div>
        )}
        {transcript.error && <div className="err">{transcript.error}</div>}
      </div>

      <div className="input-actions">
        <button
          className="btn primary"
          disabled={!ready}
          onClick={() => {
            if (ehr.value && transcript.value) onStart(ehr.value, transcript.value);
          }}
        >
          Start review
        </button>
        <span className="topbar meta" style={{ border: "none", padding: 0, background: "none" }}>
          e.g. <code>services/api/data/medical-record.json</code> +{" "}
          <code>services/api/data/transcript.json</code>
        </span>
      </div>
    </div>
  );
}
