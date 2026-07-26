"use client";

import { useMemo, useRef, useState } from "react";
import type { EhrModel, JsonValue, Transcript, UiNotification } from "./types";
import { predict } from "./lib/api";
import { applyEdit, describeEdit, serializeEhrForApi } from "./lib/ehr-edit";
import InputScreen from "./components/InputScreen";
import EhrPanel, { type ScrollToken } from "./components/EhrPanel";
import NotificationsPanel from "./components/NotificationsPanel";
import ThemeToggle from "./components/ThemeToggle";

function Topbar({ onRestart }: { onRestart?: () => void }) {
  return (
    <div className="topbar">
      <span className="brand">
        EHR Consolidation <span className="dot">·</span> Review
      </span>
      <span className="spacer" />
      {onRestart && (
        <button className="btn subtle" onClick={onRestart}>
          Start over
        </button>
      )}
      <ThemeToggle />
    </div>
  );
}

export default function Home() {
  const [screen, setScreen] = useState<"input" | "results">("input");
  const [model, setModel] = useState<EhrModel | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [notifications, setNotifications] = useState<UiNotification[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scrollToken, setScrollToken] = useState<ScrollToken | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cancelRef = useRef(false);
  const scrollNonce = useRef(0);
  const ehrForApiRef = useRef<JsonValue | string>("");

  const total = transcript?.segments.length ?? 0;

  function start(ehr: EhrModel, tr: Transcript) {
    ehrForApiRef.current = serializeEhrForApi(ehr);
    setModel(ehr);
    setTranscript(tr);
    setNotifications([]);
    setProcessed(0);
    setDone(false);
    setError(null);
    setHoveredId(null);
    setSelectedId(null);
    setScrollToken(null);
    setScreen("results");
    void runSimulation(tr);
  }

  async function runSimulation(tr: Transcript) {
    cancelRef.current = false;
    setRunning(true);
    let sessionId: string | null = null;
    const ehrData = ehrForApiRef.current;

    for (let i = 0; i < tr.segments.length; i++) {
      if (cancelRef.current) break;
      const seg = tr.segments[i];
      try {
        const res = await predict({ sessionId, ehrData, chunk: seg });
        sessionId = res.session_id;
        const fresh: UiNotification[] = res.notifications.map((no, j) => ({
          id: `${i}-${j}`,
          segment: seg,
          type: no.type,
          message: no.message,
          edit: no.suggested_edit ?? null,
          status: "pending",
        }));
        if (fresh.length) setNotifications((prev) => [...prev, ...fresh]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setProcessed(i + 1);
      }
    }
    setRunning(false);
    setDone(true);
  }

  function restart() {
    cancelRef.current = true;
    setScreen("input");
    setModel(null);
    setTranscript(null);
    setNotifications([]);
    setRunning(false);
    setDone(false);
    setProcessed(0);
    setHoveredId(null);
    setSelectedId(null);
    setScrollToken(null);
    setError(null);
  }

  // Hover previews transiently; a click selects and keeps the preview sticky.
  const activeId = hoveredId ?? selectedId;
  const active = notifications.find((n) => n.id === activeId) ?? null;
  const preview = useMemo(() => {
    if (!model || !active || !active.edit || active.status !== "pending") return null;
    return describeEdit(model, active.edit);
  }, [model, active]);

  // Clicking a card scrolls the EHR panel to the edit target and pins the preview.
  function select(n: UiNotification) {
    if (!n.edit) return;
    setSelectedId(n.id);
    scrollNonce.current += 1;
    setScrollToken({ path: n.edit.field, nonce: scrollNonce.current });
  }

  function approve(n: UiNotification) {
    if (!model || !n.edit) return;
    const res = applyEdit(model, n.edit);
    if (res.ok) {
      setModel(res.model);
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, status: "approved" } : x)),
      );
      setHoveredId(null);
      if (selectedId === n.id) setSelectedId(null);
    } else {
      setError(res.error ?? "Could not apply edit.");
    }
  }

  function reject(id: string) {
    setNotifications((prev) =>
      prev.map((x) => (x.id === id ? { ...x, status: "rejected" } : x)),
    );
    setHoveredId(null);
    if (selectedId === id) setSelectedId(null);
  }

  if (screen === "input" || !model || !transcript) {
    return (
      <div className="app">
        <Topbar />
        <InputScreen onStart={start} />
      </div>
    );
  }

  const pendingCount = notifications.filter(
    (n) => n.status === "pending" && n.edit,
  ).length;
  const progressPct = total ? Math.round((processed / total) * 100) : 0;
  const ehrMeta =
    model.kind === "json"
      ? "structured JSON"
      : `${model.lines.length} lines`;

  return (
    <div className="app">
      <Topbar onRestart={restart} />
      <div className="results">
        <div className="pane left">
          <div className="pane-head">
            EHR data
            <span className="count">{ehrMeta}</span>
          </div>
          <EhrPanel model={model} preview={preview} scrollToken={scrollToken} />
        </div>

        <div className="pane">
          <div className="statusbar">
            {running && <span className="spinner" aria-hidden />}
            <span>
              {processed}/{total} spans
            </span>
            <div className="progress-track" aria-hidden>
              <span style={{ width: `${progressPct}%` }} />
            </div>
            <span>
              {notifications.length} notes
              {pendingCount > 0 ? ` · ${pendingCount} to review` : ""}
            </span>
          </div>
          {error && (
            <div
              style={{
                padding: "8px 16px",
                fontSize: 12,
                color: "var(--conflict)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {error}
            </div>
          )}
          <NotificationsPanel
            notifications={notifications}
            model={model}
            activeId={activeId}
            running={running}
            done={done}
            onHover={setHoveredId}
            onSelect={select}
            onApprove={approve}
            onReject={reject}
          />
        </div>
      </div>
    </div>
  );
}
