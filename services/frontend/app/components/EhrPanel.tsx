"use client";

import React, { useEffect, useRef } from "react";
import type { EhrModel, JsonValue } from "../types";
import { textLineTarget, type EditPreview } from "../lib/ehr-edit";

const INDENT = 14;

export interface ScrollToken {
  path: string; // edit.field
  nonce: number;
}

function scalarText(v: JsonValue): string {
  return JSON.stringify(v);
}

function pretty(v: JsonValue): string {
  return JSON.stringify(v, null, 2);
}

function ScalarValue({ v }: { v: JsonValue }) {
  if (typeof v === "string") return <span className="jstr">{JSON.stringify(v)}</span>;
  if (typeof v === "number") return <span className="jnum">{String(v)}</span>;
  if (typeof v === "boolean") return <span className="jbool">{String(v)}</span>;
  if (v === null) return <span className="jbool">null</span>;
  return <span>{scalarText(v)}</span>;
}

// ---------------------------------------------------------------------------
// JSON renderer: emits an array of "row" elements with dot-path awareness.
// ---------------------------------------------------------------------------

function JsonView({ data, preview }: { data: JsonValue; preview: EditPreview | null }) {
  const rows: React.ReactNode[] = [];
  let key = 0;
  const nextKey = () => key++;

  const p = preview && preview.kind === "json" ? preview : null;
  const removedPath = p && p.op === "remove" ? p.path : null;
  const isRemoved = (path: string) =>
    removedPath !== null && (path === removedPath || path.startsWith(removedPath + "."));
  const highlight = p ? p.path : null;

  const style = (depth: number): React.CSSProperties => ({
    paddingLeft: depth * INDENT + 6,
  });

  function addedBlock(value: JsonValue, depth: number, label: string) {
    rows.push(
      <div key={nextKey()} className="jrow added" style={style(depth)}>
        <span className="jkey">{label}</span>
        <span className="ins" style={{ whiteSpace: "pre" }}>
          {pretty(value)}
        </span>
      </div>,
    );
  }

  function render(
    value: JsonValue,
    path: string,
    depth: number,
    label: string,
    comma: boolean,
  ) {
    const removed = isRemoved(path);
    const cls = `jrow${removed ? " removed" : path === highlight ? " target" : ""}`;
    const anchor = path || undefined;

    // Replace targeting this exact node.
    if (p && p.op === "replace" && p.path === path) {
      if (value !== null && typeof value === "object") {
        rows.push(
          <div key={nextKey()} className="jrow" style={style(depth)} data-path={anchor}>
            <span className="jkey">{label}</span>
            <span className="del" style={{ whiteSpace: "pre" }}>
              {pretty(value)}
            </span>
          </div>,
        );
        addedBlock(p.after, depth, "");
      } else {
        rows.push(
          <div key={nextKey()} className="jrow target" style={style(depth)} data-path={anchor}>
            <span className="jkey">{label}</span>
            <span className="del">{scalarText(value)}</span>
            <span className="diff-arrow">{"→"}</span>
            <span className="ins">{scalarText(p.after)}</span>
            <span className="jpunct">{comma ? "," : ""}</span>
          </div>,
        );
      }
      return;
    }

    // Append a suffix to a string leaf.
    if (p && p.op === "append-string" && p.path === path && typeof value === "string") {
      rows.push(
        <div key={nextKey()} className="jrow target" style={style(depth)} data-path={anchor}>
          <span className="jkey">{label}</span>
          <span className="jstr">{'"' + value}</span>
          <span className="ins">{p.appended}</span>
          <span className="jstr">{'"'}</span>
          <span className="jpunct">{comma ? "," : ""}</span>
        </div>,
      );
      return;
    }

    // Arrays
    if (Array.isArray(value)) {
      const appendHere = p && p.op === "append-array" && p.path === path;
      rows.push(
        <div key={nextKey()} className={cls} style={style(depth)} data-path={anchor}>
          <span className="jkey">{label}</span>
          <span className="jpunct">[</span>
        </div>,
      );
      value.forEach((el, i) => {
        const childPath = path ? `${path}.${i}` : String(i);
        render(el as JsonValue, childPath, depth + 1, "", i < value.length - 1 || Boolean(appendHere));
      });
      if (appendHere) addedBlock(p.after, depth + 1, "");
      rows.push(
        <div key={nextKey()} className={`jrow${removed ? " removed" : ""}`} style={style(depth)}>
          <span className="jpunct">{comma ? "]," : "]"}</span>
        </div>,
      );
      return;
    }

    // Objects
    if (value !== null && typeof value === "object") {
      const entries = Object.entries(value);
      const base = path ? path + "." : "";
      const addFieldHere =
        p &&
        p.op === "add-field" &&
        p.path.startsWith(base) &&
        p.path.slice(base.length).indexOf(".") === -1;
      rows.push(
        <div key={nextKey()} className={cls} style={style(depth)} data-path={anchor}>
          <span className="jkey">{label}</span>
          <span className="jpunct">{"{"}</span>
        </div>,
      );
      entries.forEach(([k, v], i) => {
        const childPath = base + k;
        render(v as JsonValue, childPath, depth + 1, `"${k}": `, i < entries.length - 1 || Boolean(addFieldHere));
      });
      if (addFieldHere) {
        const newKey = p.path.slice(base.length);
        addedBlock(p.after, depth + 1, `"${newKey}": `);
      }
      rows.push(
        <div key={nextKey()} className={`jrow${removed ? " removed" : ""}`} style={style(depth)}>
          <span className="jpunct">{comma ? "}," : "}"}</span>
        </div>,
      );
      return;
    }

    // Scalar leaf
    rows.push(
      <div key={nextKey()} className={cls} style={style(depth)} data-path={anchor}>
        <span className="jkey">{label}</span>
        <ScalarValue v={value} />
        <span className="jpunct">{comma ? "," : ""}</span>
      </div>,
    );
  }

  render(data, "", 0, "", false);
  return <div className="json">{rows}</div>;
}

// ---------------------------------------------------------------------------
// Text renderer: numbered lines with per-line diff.
// ---------------------------------------------------------------------------

function TextView({ lines, preview }: { lines: string[]; preview: EditPreview | null }) {
  const t = preview && preview.kind === "text" ? preview : null;
  return (
    <div className="text">
      {lines.map((line, i) => {
        const ln = i + 1;
        if (t && "line" in t && t.line === ln) {
          if (t.op === "replace-line") {
            return (
              <div key={i} className="tline target" data-line={ln}>
                <span className="lnum">{ln}</span>
                <span>
                  <span className="del">{t.before}</span>
                  <span className="diff-arrow">{"→"}</span>
                  <span className="ins">{t.after}</span>
                </span>
              </div>
            );
          }
          if (t.op === "append-line") {
            return (
              <div key={i} className="tline target" data-line={ln}>
                <span className="lnum">{ln}</span>
                <span>
                  {t.before}
                  <span className="ins">{t.appended}</span>
                </span>
              </div>
            );
          }
          if (t.op === "remove-line") {
            return (
              <div key={i} className="tline removed" data-line={ln}>
                <span className="lnum">{ln}</span>
                <span className="del">{t.before}</span>
              </div>
            );
          }
        }
        return (
          <div key={i} className="tline" data-line={ln}>
            <span className="lnum">{ln}</span>
            <span>{line}</span>
          </div>
        );
      })}
      {t && t.op === "add-line" && (
        <div className="tline added">
          <span className="lnum">+</span>
          <span className="ins">{t.after}</span>
        </div>
      )}
    </div>
  );
}

export default function EhrPanel({
  model,
  preview,
  scrollToken,
}: {
  model: EhrModel;
  preview: EditPreview | null;
  scrollToken: ScrollToken | null;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollToken) return;
    const root = ref.current;
    if (!root) return;
    let el: Element | null = null;
    if (model.kind === "text") {
      const line = textLineTarget(scrollToken.path);
      if (line !== null) el = root.querySelector(`[data-line="${line}"]`);
    } else {
      el = root.querySelector(`[data-path="${CSS.escape(scrollToken.path)}"]`);
    }
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToken?.nonce]);

  return (
    <div className="ehr" ref={ref}>
      {model.kind === "json" ? (
        <JsonView data={model.data} preview={preview} />
      ) : (
        <TextView lines={model.lines} preview={preview} />
      )}
    </div>
  );
}
