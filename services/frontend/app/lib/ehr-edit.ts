import type { EditSuggestion, EhrModel, JsonValue } from "../types";

// ---------------------------------------------------------------------------
// Parsing / serialization
// ---------------------------------------------------------------------------

export function parseEhrJson(raw: string): EhrModel {
  const data = JSON.parse(raw) as JsonValue;
  return { kind: "json", data };
}

export function parseEhrText(raw: string): EhrModel {
  // Match the server's line handling (str.split("\n")).
  return { kind: "text", lines: raw.replace(/\r\n/g, "\n").split("\n") };
}

// What we actually send to the API as `ehr_data`. For text we send the raw
// string; the API adds line numbers itself (EHRData.from_text).
export function serializeEhrForApi(model: EhrModel): JsonValue | string {
  if (model.kind === "text") return model.lines.join("\n");
  return model.data;
}

// ---------------------------------------------------------------------------
// Diff preview — describes what an edit would change, without mutating.
// ---------------------------------------------------------------------------

export type EditPreview =
  | { kind: "json"; op: "replace"; path: string; before: JsonValue | undefined; after: JsonValue }
  | { kind: "json"; op: "append-array"; path: string; after: JsonValue }
  | { kind: "json"; op: "append-string"; path: string; before: string; appended: string }
  | { kind: "json"; op: "add-field"; path: string; after: JsonValue }
  | { kind: "json"; op: "remove"; path: string; before: JsonValue }
  | { kind: "text"; op: "replace-line"; line: number; before: string; after: string }
  | { kind: "text"; op: "append-line"; line: number; before: string; appended: string }
  | { kind: "text"; op: "add-line"; after: string }
  | { kind: "text"; op: "remove-line"; line: number; before: string }
  | { kind: "error"; message: string };

type PathSeg = string | number;

function parsePath(field: string): PathSeg[] {
  return field
    .split(".")
    .filter((s) => s.length > 0)
    .map((seg) => (/^\d+$/.test(seg) ? Number(seg) : seg));
}

// Try to interpret the API's stringy value as real JSON (number, object,
// array, bool). Fall back to the raw string.
function coerce(raw: string): JsonValue {
  const trimmed = raw.trim();
  if (trimmed === "") return raw;
  try {
    return JSON.parse(trimmed) as JsonValue;
  } catch {
    return raw;
  }
}

// For replace, don't turn a string field into a number (e.g. "50 mg" stays a
// string, and a numeric-looking id stays a string if it already was one).
function coerceForReplace(raw: string, existing: JsonValue | undefined): JsonValue {
  if (typeof existing === "string") return raw;
  return coerce(raw);
}

function navigateToParent(
  data: JsonValue,
  path: PathSeg[],
): { parent: JsonValue | undefined; key: PathSeg } | null {
  if (path.length === 0) return null;
  let node: JsonValue | undefined = data;
  for (let i = 0; i < path.length - 1; i++) {
    if (node == null || typeof node !== "object") return null;
    node = (node as Record<string, JsonValue>)[String(path[i])] as JsonValue;
  }
  return { parent: node, key: path[path.length - 1] };
}

function readAt(parent: JsonValue | undefined, key: PathSeg): JsonValue | undefined {
  if (parent == null || typeof parent !== "object") return undefined;
  return (parent as Record<string, JsonValue>)[String(key)];
}

// ---- Text path helpers ----

// Returns the 1-based line number the edit targets, or null for "whole text".
export function textLineTarget(field: string): number | null {
  const segs = parsePath(field);
  const rest = segs[0] === "text" ? segs.slice(1) : segs;
  if (rest.length === 1 && typeof rest[0] === "number") return rest[0];
  return null;
}

export function describeEdit(model: EhrModel, edit: EditSuggestion): EditPreview {
  if (model.kind === "text") {
    const line = textLineTarget(edit.field);
    const idx = line === null ? null : line - 1;

    if (edit.operator === "add") {
      if (line === null) return { kind: "text", op: "add-line", after: edit.value };
      if (idx === null || idx < 0 || idx >= model.lines.length)
        return { kind: "error", message: `Line ${line} is out of range.` };
      return { kind: "text", op: "append-line", line, before: model.lines[idx], appended: edit.value };
    }
    if (line === null || idx === null || idx < 0 || idx >= model.lines.length)
      return { kind: "error", message: `Line ${line ?? "?"} is out of range.` };
    if (edit.operator === "remove")
      return { kind: "text", op: "remove-line", line, before: model.lines[idx] };
    return { kind: "text", op: "replace-line", line, before: model.lines[idx], after: edit.value };
  }

  // JSON
  const path = parsePath(edit.field);
  const loc = navigateToParent(model.data, path);
  if (!loc || loc.parent == null || typeof loc.parent !== "object")
    return { kind: "error", message: `Cannot resolve field "${edit.field}".` };
  const current = readAt(loc.parent, loc.key);

  if (edit.operator === "remove") {
    if (current === undefined)
      return { kind: "error", message: `Field "${edit.field}" does not exist.` };
    return { kind: "json", op: "remove", path: edit.field, before: current };
  }

  if (edit.operator === "add") {
    if (Array.isArray(current))
      return { kind: "json", op: "append-array", path: edit.field, after: coerce(edit.value) };
    if (typeof current === "string")
      return { kind: "json", op: "append-string", path: edit.field, before: current, appended: edit.value };
    if (current === undefined)
      return { kind: "json", op: "add-field", path: edit.field, after: coerce(edit.value) };
    return { kind: "json", op: "replace", path: edit.field, before: current, after: coerce(edit.value) };
  }

  // replace
  return {
    kind: "json",
    op: "replace",
    path: edit.field,
    before: current,
    after: coerceForReplace(edit.value, current),
  };
}

// ---------------------------------------------------------------------------
// Apply — returns a new EhrModel (immutable) or an error.
// ---------------------------------------------------------------------------

export interface ApplyResult {
  ok: boolean;
  model: EhrModel;
  error?: string;
}

export function applyEdit(model: EhrModel, edit: EditSuggestion): ApplyResult {
  const preview = describeEdit(model, edit);
  if (preview.kind === "error") return { ok: false, model, error: preview.message };

  if (model.kind === "text") {
    const lines = [...model.lines];
    switch (preview.op) {
      case "replace-line":
        lines[preview.line - 1] = preview.after;
        break;
      case "append-line":
        lines[preview.line - 1] = preview.before + preview.appended;
        break;
      case "add-line":
        lines.push(preview.after);
        break;
      case "remove-line":
        lines.splice(preview.line - 1, 1);
        break;
    }
    return { ok: true, model: { kind: "text", lines } };
  }

  const data = structuredClone(model.data);
  const path = parsePath(edit.field);
  const loc = navigateToParent(data, path);
  if (!loc || loc.parent == null || typeof loc.parent !== "object")
    return { ok: false, model, error: `Cannot resolve field "${edit.field}".` };
  const parent = loc.parent;
  const key = String(loc.key);

  switch (preview.op) {
    case "replace":
    case "add-field":
      (parent as Record<string, JsonValue>)[key] = preview.after;
      break;
    case "append-array":
      ((parent as Record<string, JsonValue>)[key] as JsonValue[]).push(preview.after);
      break;
    case "append-string":
      (parent as Record<string, JsonValue>)[key] = preview.before + preview.appended;
      break;
    case "remove":
      if (Array.isArray(parent) && typeof loc.key === "number") {
        parent.splice(loc.key, 1);
      } else {
        delete (parent as Record<string, JsonValue>)[key];
      }
      break;
  }
  return { ok: true, model: { kind: "json", data } };
}

// The dot-path (or line marker) whose row should be highlighted for a preview.
export function highlightTarget(preview: EditPreview): string | null {
  if (preview.kind === "error") return null;
  if (preview.kind === "text") {
    if (preview.op === "add-line") return null;
    return `text.${preview.line}`;
  }
  return preview.path;
}
