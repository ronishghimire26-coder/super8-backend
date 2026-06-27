import React from "react";
import { ROOM_STATUS_COLORS } from "../lib/format";

export function StatusBadge({ status, testId }) {
  const c = ROOM_STATUS_COLORS[status] || { bg: "#F1F5F9", text: "#334155", dot: "#94A3B8" };
  return (
    <span
      data-testid={testId}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider"
      style={{ background: c.bg, color: c.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.dot }} />
      {status}
    </span>
  );
}

export function Pill({ children, color = "slate", testId }) {
  const map = {
    slate: "bg-slate-100 text-slate-700",
    red: "bg-red-100 text-red-700",
    green: "bg-emerald-100 text-emerald-700",
    yellow: "bg-amber-100 text-amber-800",
    blue: "bg-blue-100 text-blue-700",
  };
  return (
    <span data-testid={testId} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[color]}`}>
      {children}
    </span>
  );
}
