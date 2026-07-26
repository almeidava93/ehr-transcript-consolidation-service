import type { JsonValue, PredictionResponse, TranscriptChunk } from "../types";

export interface PredictParams {
  sessionId: string | null;
  ehrData: JsonValue | string;
  chunk: TranscriptChunk;
}

// One call to the prediction endpoint (via the Next.js server-side proxy).
// The first call passes sessionId=null and the full ehr_data; the response's
// session_id is threaded into later calls, where the server only needs the
// transcript chunk.
export async function predict({
  sessionId,
  ehrData,
  chunk,
}: PredictParams): Promise<PredictionResponse> {
  const res = await fetch("/api/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      ehr_data: ehrData,
      transcript_chunk: chunk,
    }),
  });

  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload?.error ?? payload?.detail ?? `Request failed (${res.status})`);
  }
  return payload as PredictionResponse;
}
