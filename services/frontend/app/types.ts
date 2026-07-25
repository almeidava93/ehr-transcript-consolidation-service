// Mirrors the API contract in services/api/api/routers/v1/schemas.py

export type EHRData = Record<string, unknown>;

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

export interface Notification {
  type: NotificationType;
  message: string;
}

export interface PredictionResponse {
  notifications: Notification[];
}

export type SegmentStatus = "pending" | "processing" | "done" | "error";

export interface SegmentResult {
  segment: TranscriptChunk;
  status: SegmentStatus;
  notifications: Notification[];
  error?: string;
}
