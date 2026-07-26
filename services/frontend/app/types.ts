// Mirrors the API contract in services/api/api/routers/v1/schemas.py

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface TranscriptChunk {
  t: string; // "HH:MM:SS"
  speaker: string;
  text: string;
}

export interface Transcript {
  segments: TranscriptChunk[];
  [key: string]: unknown;
}

export type NotificationType = "information_missing" | "information_conflict";

export type EditOperator = "add" | "replace" | "remove";

export interface EditSuggestion {
  // Dot-notation path into the EHR. For text EHR, e.g. "text.3" targets line 3.
  field: string;
  value: string;
  operator: EditOperator;
}

export interface ApiNotification {
  type: NotificationType;
  message: string;
  suggested_edit?: EditSuggestion | null;
}

export interface PredictionResponse {
  notifications: ApiNotification[];
  session_id: string;
}

// ---- Client-side view models ----

// The EHR document the UI renders and edits. Either a parsed JSON object or a
// list of raw text lines (when uploaded as .txt).
export type EhrModel =
  | { kind: "json"; data: JsonValue }
  | { kind: "text"; lines: string[] };

export type EditStatus = "pending" | "approved" | "rejected";

// A single notification as tracked in the UI, tied to the segment it came from.
export interface UiNotification {
  id: string;
  segment: TranscriptChunk;
  type: NotificationType;
  message: string;
  edit: EditSuggestion | null;
  status: EditStatus; // pending until the user approves/rejects an edit
}
