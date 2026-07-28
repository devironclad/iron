"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { formatPropId } from "@/lib/utils";
import type { OpportunityProperty } from "./OpportunityCard";
import "@/app/access/access.css";

export function ConfirmInterestModal({
  property,
  submitting,
  onCancel,
  onConfirm,
}: {
  property: OpportunityProperty;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (message: string) => void;
}) {
  const [message, setMessage] = useState("");

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" style={{ width: "100%", maxWidth: "440px", padding: "1.75rem" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
          <div>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 800, margin: 0, color: "#0f172a" }}>Register Purchase Interest</h3>
            <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "0.35rem 0 0" }}>
              {formatPropId(property.refId, property.id)}{property.address ? ` — ${property.address}` : ""}
            </p>
          </div>
          <button onClick={onCancel} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#94a3b8" }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#64748b", marginBottom: "0.4rem" }}>
          Message (optional)
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Any note for our team?"
          rows={3}
          style={{
            width: "100%", border: "1px solid #e2e8f0", borderRadius: "0.5rem",
            padding: "0.6rem 0.75rem", fontSize: "0.85rem", resize: "vertical", fontFamily: "inherit",
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem" }}>
          <button onClick={onCancel} disabled={submitting} className="filter-toggle-btn">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(message.trim())}
            disabled={submitting}
            className="primary-btn"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirm Interest
          </button>
        </div>
      </div>
    </div>
  );
}
