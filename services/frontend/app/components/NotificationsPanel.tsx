"use client";

import { useMemo, useState } from "react";
import type { EhrModel, UiNotification } from "../types";
import { describeEdit } from "../lib/ehr-edit";

function Card({
  n,
  model,
  active,
  onHover,
  onSelect,
  onApprove,
  onReject,
}: {
  n: UiNotification;
  model: EhrModel;
  active: boolean;
  onHover: (id: string | null) => void;
  onSelect: (n: UiNotification) => void;
  onApprove: (n: UiNotification) => void;
  onReject: (id: string) => void;
}) {
  const preview = n.edit ? describeEdit(model, n.edit) : null;
  const previewError = preview && preview.kind === "error" ? preview.message : null;
  const interactive = n.status === "pending" && n.edit !== null && !previewError;
  const clickable = n.edit !== null;

  return (
    <div
      className={`card ${active ? "active" : ""} ${n.status !== "pending" ? n.status : ""} ${clickable ? "clickable" : ""}`}
      onMouseEnter={() => interactive && onHover(n.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => clickable && onSelect(n)}
    >
      <div className="card-head">
        <span className={`tag ${n.type}`}>{n.type.replace("information_", "")}</span>
        <span className="card-time">{n.segment.t}</span>
      </div>
      <p className="card-msg">{n.message}</p>
      <div className="card-src">
        <strong>{n.segment.speaker}:</strong> {n.segment.text}
      </div>

      {n.edit && (
        <div className="edit-box">
          <div className="edit-line">
            <span className="op">{n.edit.operator}</span>
            <span className="field mono">{n.edit.field}</span>
          </div>

          {previewError ? (
            <div className="err" style={{ marginTop: 8, fontSize: 11.5, color: "var(--conflict)" }}>
              Cannot apply automatically: {previewError}
            </div>
          ) : n.status === "pending" ? (
            <div className="edit-actions">
              <button
                className="mini approve"
                onClick={(e) => {
                  e.stopPropagation();
                  onApprove(n);
                }}
              >
                Approve
              </button>
              <button
                className="mini reject"
                onClick={(e) => {
                  e.stopPropagation();
                  onReject(n.id);
                }}
              >
                Dismiss
              </button>
            </div>
          ) : null}

          {n.status === "approved" && (
            <div className="resolved-note approved">✓ Applied to EHR</div>
          )}
          {n.status === "rejected" && (
            <div className="resolved-note rejected">Dismissed</div>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`chip ${active ? "on" : "off"}`} onClick={onClick}>
      {label}
      <span className="chip-count">{count}</span>
    </button>
  );
}

export default function NotificationsPanel({
  notifications,
  model,
  activeId,
  running,
  done,
  onHover,
  onSelect,
  onApprove,
  onReject,
}: {
  notifications: UiNotification[];
  model: EhrModel;
  activeId: string | null;
  running: boolean;
  done: boolean;
  onHover: (id: string | null) => void;
  onSelect: (n: UiNotification) => void;
  onApprove: (n: UiNotification) => void;
  onReject: (id: string) => void;
}) {
  const [showConflict, setShowConflict] = useState(true);
  const [showMissing, setShowMissing] = useState(true);
  const [showWithEdit, setShowWithEdit] = useState(true);
  const [showNoEdit, setShowNoEdit] = useState(true);

  const counts = useMemo(() => {
    let conflict = 0,
      missing = 0,
      withEdit = 0,
      noEdit = 0;
    for (const n of notifications) {
      if (n.type === "information_conflict") conflict++;
      else missing++;
      if (n.edit) withEdit++;
      else noEdit++;
    }
    return { conflict, missing, withEdit, noEdit };
  }, [notifications]);

  const visible = notifications.filter((n) => {
    const typeOk = n.type === "information_conflict" ? showConflict : showMissing;
    const editOk = n.edit ? showWithEdit : showNoEdit;
    return typeOk && editOk;
  });

  return (
    <>
      {notifications.length > 0 && (
        <div className="filterbar">
          <div className="filter-group">
            <span className="filter-label">Type</span>
            <Chip
              label="Conflict"
              count={counts.conflict}
              active={showConflict}
              onClick={() => setShowConflict((v) => !v)}
            />
            <Chip
              label="Missing"
              count={counts.missing}
              active={showMissing}
              onClick={() => setShowMissing((v) => !v)}
            />
          </div>
          <div className="filter-group">
            <span className="filter-label">Edit</span>
            <Chip
              label="With edit"
              count={counts.withEdit}
              active={showWithEdit}
              onClick={() => setShowWithEdit((v) => !v)}
            />
            <Chip
              label="No edit"
              count={counts.noEdit}
              active={showNoEdit}
              onClick={() => setShowNoEdit((v) => !v)}
            />
          </div>
        </div>
      )}

      <div className="notifs">
        {notifications.length === 0 && (
          <div className="notif-empty">
            {running
              ? "Processing transcript… notifications will appear here."
              : done
                ? "No notifications — the record matches the transcript."
                : "No notifications yet."}
          </div>
        )}
        {notifications.length > 0 && visible.length === 0 && (
          <div className="notif-empty">No notifications match the current filters.</div>
        )}
        {visible.map((n) => (
          <Card
            key={n.id}
            n={n}
            model={model}
            active={activeId === n.id}
            onHover={onHover}
            onSelect={onSelect}
            onApprove={onApprove}
            onReject={onReject}
          />
        ))}
      </div>
    </>
  );
}
