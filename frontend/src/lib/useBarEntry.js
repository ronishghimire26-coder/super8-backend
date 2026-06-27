import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, apiError } from "./api";

// Shared nightly bar entry state used by web Bar module and the Bar Staff PWA.
export function useBarEntry(date, persistKey) {
  const [rows, setRows] = useState([]);
  const [sales, setSales] = useState({ cash_sales: "", card_sales: "", total_sales: "" });
  const [recon, setRecon] = useState({ float_start: "", actual_cash: "" });
  const [paidOuts, setPaidOuts] = useState([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState(null);
  const [ready, setReady] = useState(false);
  const draftKey = persistKey ? `${persistKey}:${date}` : null;

  // load prefill + existing entry, or restore offline draft
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    async function load() {
      setLoading(true);
      try {
        const [pre, ent] = await Promise.all([
          api.get("/bar/entries/prefill", { params: { date } }),
          api.get("/bar/entries", { params: { date } }),
        ]);
        if (cancelled) return;
        const entry = ent.data;
        setExisting(entry);
        const draft = draftKey ? JSON.parse(localStorage.getItem(draftKey) || "null") : null;
        const draftHasData = draft && Array.isArray(draft.rows) && draft.rows.length > 0;
        if (draftHasData && !entry) {
          setRows(draft.rows); setSales(draft.sales); setRecon(draft.recon);
          setPaidOuts(draft.paidOuts || []); setNotes(draft.notes || "");
        } else if (entry) {
          setRows(entry.items.map((it) => ({
            item_id: it.item_id, name: it.name, category: it.category, unit: it.unit,
            par_level: it.par_level, opening: it.opening, received: it.received,
            closing: it.closing, note: it.note || "",
          })));
          setSales({ cash_sales: entry.cash_sales, card_sales: entry.card_sales, total_sales: entry.total_sales });
          setRecon({ float_start: entry.float_start, actual_cash: entry.actual_cash });
          setPaidOuts(entry.cash_paid_out || []);
          setNotes(entry.notes || "");
        } else {
          setRows(pre.data.map((it) => ({
            item_id: it.item_id, name: it.name, category: it.category, unit: it.unit,
            par_level: it.par_level, opening: it.opening, received: it.received, closing: "", note: "",
          })));
          setSales({ cash_sales: "", card_sales: "", total_sales: "" });
          setRecon({ float_start: "", actual_cash: "" });
          setPaidOuts([]); setNotes("");
        }
      } catch (e) {
        // offline: restore draft if available
        const draft = draftKey ? JSON.parse(localStorage.getItem(draftKey) || "null") : null;
        if (draft && Array.isArray(draft.rows) && draft.rows.length > 0) {
          setRows(draft.rows); setSales(draft.sales); setRecon(draft.recon); setPaidOuts(draft.paidOuts || []); setNotes(draft.notes || "");
        }
      } finally {
        if (!cancelled) { setLoading(false); setReady(true); }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [date]); // eslint-disable-line

  const setRow = useCallback((id, patch) => {
    setRows((rs) => rs.map((r) => (r.item_id === id ? { ...r, ...patch } : r)));
  }, []);

  // computed
  const computed = useMemo(() => {
    const enriched = rows.map((r) => {
      const used = +(Number(r.opening || 0) + Number(r.received || 0) - Number(r.closing || 0)).toFixed(2);
      const par = Number(r.par_level || 0);
      const below = par > 0 && Number(r.closing || 0) < par;
      const variance = used < 0 || (par > 0 && used > par * 3);
      return { ...r, used, below_par: below, variance };
    });
    const paidTotal = paidOuts.reduce((s, p) => s + Number(p.amount || 0), 0);
    const expected = +(Number(recon.float_start || 0) + Number(sales.cash_sales || 0) - paidTotal).toFixed(2);
    const overShort = +(Number(recon.actual_cash || 0) - expected).toFixed(2);
    return { enriched, paidTotal, expected, overShort, belowParCount: enriched.filter((e) => e.below_par).length };
  }, [rows, paidOuts, recon, sales]);

  // autosave draft every change + 30s heartbeat (only after initial load)
  useEffect(() => {
    if (!draftKey || !ready) return;
    const payload = { rows, sales, recon, paidOuts, notes };
    localStorage.setItem(draftKey, JSON.stringify(payload));
  }, [rows, sales, recon, paidOuts, notes, draftKey, ready]);

  const lastSaveRef = useRef(Date.now());
  useEffect(() => {
    if (!draftKey || !ready) return;
    const t = setInterval(() => {
      localStorage.setItem(draftKey, JSON.stringify({ rows, sales, recon, paidOuts, notes }));
      lastSaveRef.current = Date.now();
    }, 30000);
    return () => clearInterval(t);
  }, [rows, sales, recon, paidOuts, notes, draftKey]);

  function buildPayload() {
    return {
      date,
      items: rows.map((r) => ({
        item_id: r.item_id, opening: Number(r.opening || 0), received: Number(r.received || 0),
        closing: Number(r.closing || 0), note: r.note || null,
      })),
      cash_sales: Number(sales.cash_sales || 0),
      card_sales: Number(sales.card_sales || 0),
      total_sales: Number(sales.total_sales || 0),
      float_start: Number(recon.float_start || 0),
      cash_paid_out: paidOuts.map((p) => ({ recipient: p.recipient || "", reason: p.reason || "", amount: Number(p.amount || 0) })),
      actual_cash: Number(recon.actual_cash || 0),
      notes: notes || null,
    };
  }

  async function submit() {
    const payload = buildPayload();
    try {
      const { data } = await api.post("/bar/entries", payload);
      if (draftKey) localStorage.removeItem(draftKey);
      return { ok: true, data };
    } catch (e) {
      // offline fallback — queue
      if (!e.response) {
        const queue = JSON.parse(localStorage.getItem("bar_pending") || "[]");
        queue.push(payload);
        localStorage.setItem("bar_pending", JSON.stringify(queue));
        return { ok: true, offline: true };
      }
      return { ok: false, error: apiError(e) };
    }
  }

  return { rows, setRow, sales, setSales, recon, setRecon, paidOuts, setPaidOuts, notes, setNotes,
           computed, submit, loading, existing };
}

export async function flushPendingBarEntries() {
  const queue = JSON.parse(localStorage.getItem("bar_pending") || "[]");
  if (!queue.length) return 0;
  let sent = 0;
  for (const payload of queue) {
    try { await api.post("/bar/entries", payload); sent++; }
    catch { break; }
  }
  const remaining = queue.slice(sent);
  localStorage.setItem("bar_pending", JSON.stringify(remaining));
  return sent;
}
