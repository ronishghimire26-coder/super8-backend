export function money(n, withSign = false) {
  const num = Number(n || 0);
  const abs = Math.abs(num).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = num < 0 ? "-" : withSign && num > 0 ? "+" : "";
  return `${sign}$${abs}`;
}

export function fmtDate(d) {
  if (!d) return "—";
  try {
    const date = typeof d === "string" && d.length === 10 ? new Date(d + "T00:00:00") : new Date(d);
    return date.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return d;
  }
}

export function fmtDateTime(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return d;
  }
}

export function todayStr() {
  const tz = new Date().toLocaleDateString("en-CA"); // yyyy-mm-dd in many locales
  // ensure yyyy-mm-dd
  const d = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const ROOM_STATUS_COLORS = {
  Vacant: { bg: "#D1FAE5", text: "#065F46", dot: "#10B981" },
  Occupied: { bg: "#FEE2E2", text: "#991B1B", dot: "#CC0000" },
  Dirty: { bg: "#FEF3C7", text: "#92400E", dot: "#F59E0B" },
  Clean: { bg: "#DBEAFE", text: "#1E40AF", dot: "#3B82F6" },
  "Under Maintenance": { bg: "#F1F5F9", text: "#334155", dot: "#64748B" },
};
