import React, { useEffect, useState } from "react";
import { Loader2, Wifi, WifiOff, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";
import { useAuth } from "../lib/auth";
import { apiError } from "../lib/api";
import { useBarEntry, flushPendingBarEntries } from "../lib/useBarEntry";
import { NumPadInput } from "../components/NumPad";
import { money, fmtDate, todayStr } from "../lib/format";

function DarkLogin() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setErr(""); setLoading(true);
    try { await login(email, password); } catch (er) { setErr(apiError(er)); setLoading(false); }
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-white">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#CC0000]"><span className="font-display text-2xl font-extrabold text-[#FFD700]">S8</span></div>
      <h1 className="mt-4 font-display text-2xl font-bold">50th North Bar</h1>
      <p className="text-sm text-zinc-500">Nightly Inventory Entry</p>
      <form onSubmit={submit} className="mt-8 w-full max-w-sm space-y-3">
        <input data-testid="bar-login-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email"
          className="h-14 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-lg text-white placeholder:text-zinc-600 focus:border-[#CC0000] focus:outline-none" />
        <input data-testid="bar-login-password" value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password"
          className="h-14 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-lg text-white placeholder:text-zinc-600 focus:border-[#CC0000] focus:outline-none" />
        {err && <div className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-300" data-testid="bar-login-error">{err}</div>}
        <button data-testid="bar-login-submit" disabled={loading} className="flex h-14 w-full items-center justify-center rounded-xl bg-[#CC0000] text-lg font-bold shadow-[0_0_15px_rgba(204,0,0,0.4)]">
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : "Log In"}
        </button>
      </form>
    </div>
  );
}

function Entry() {
  const { user, logout } = useAuth();
  const [date, setDate] = useState(todayStr());
  const e = useBarEntry(date, "bardraft");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => { setOnline(true); flushPendingBarEntries().then((n) => n && console.log("synced", n)); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    flushPendingBarEntries();
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  async function submit() {
    setSaving(true);
    const res = await e.submit();
    setSaving(false);
    if (res.ok) setConfirm({ offline: res.offline });
    else alert(res.error);
  }

  if (confirm) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-center text-white">
        <CheckCircle2 className="h-20 w-20 text-emerald-500" />
        <h1 className="mt-4 font-display text-3xl font-bold">{confirm.offline ? "Saved Offline" : "Entry Submitted"}</h1>
        <p className="mt-2 text-zinc-400">{confirm.offline ? "Will sync automatically when back online." : `Nightly entry for ${fmtDate(date)} recorded.`}</p>
        <div className="mt-6 w-full max-w-sm rounded-2xl bg-zinc-900 p-5 text-left">
          <div className="flex justify-between py-1"><span className="text-zinc-400">Cash Sales</span><span className={`font-mono font-bold ${Number(e.sales.cash_sales) < 0 ? "text-red-400" : ""}`}>{money(e.sales.cash_sales)}</span></div>
          <div className="flex justify-between py-1"><span className="text-zinc-400">Card Sales</span><span className="font-mono font-bold">{money(e.sales.card_sales)}</span></div>
          <div className="flex justify-between py-1"><span className="text-zinc-400">Total Sales</span><span className="font-mono font-bold text-amber-400">{money(e.sales.total_sales)}</span></div>
          <div className="flex justify-between py-1"><span className="text-zinc-400">Over/Short</span><span className={`font-mono font-bold ${e.computed.overShort === 0 ? "text-emerald-400" : "text-red-400"}`}>{e.computed.overShort === 0 ? "Balanced" : money(e.computed.overShort)}</span></div>
        </div>
        <button onClick={() => setConfirm(null)} className="mt-6 flex h-14 items-center gap-2 rounded-xl bg-zinc-800 px-6 font-semibold"><ArrowLeft className="h-5 w-5" /> Back to entry</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 pb-28 text-zinc-50">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/90 px-4 py-3 backdrop-blur">
        <div>
          <div className="font-display text-lg font-bold">Tonight's Entry</div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            {online ? <Wifi className="h-3 w-3 text-emerald-500" /> : <WifiOff className="h-3 w-3 text-amber-500" />}
            {online ? "Online · auto-save on" : "Offline · saved locally"}
          </div>
        </div>
        <button onClick={logout} className="text-sm text-zinc-400">Log out</button>
      </header>

      <div className="px-4 py-4">
        <div className="mb-3 flex items-center gap-2">
          <input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} data-testid="bar-app-date"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white" />
          {date < todayStr() && <span className="rounded-full bg-amber-900/40 px-2 py-1 text-xs font-semibold text-amber-400">Late Edit</span>}
          {e.existing && <span className="rounded-full bg-emerald-900/40 px-2 py-1 text-xs font-semibold text-emerald-400">Submitted</span>}
        </div>

        {e.loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-[#CC0000]" /></div>
        ) : (
          <>
            <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wider text-zinc-500">Inventory Count</h2>
            <div className="space-y-3">
              {e.computed.enriched.map((r) => (
                <div key={r.item_id} className={`rounded-2xl border p-4 ${r.below_par ? "border-red-700 bg-red-950/30" : r.variance ? "border-amber-700 bg-amber-950/20" : "border-zinc-800 bg-zinc-900"}`} data-testid={`bar-app-item-${r.item_id}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <div className="font-bold">{r.name}</div>
                      <div className="text-xs text-zinc-500">{r.category} · last close {r.opening} {r.unit}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-zinc-500">Used/Sold</div>
                      <div className="font-mono text-xl font-extrabold">{r.used} {r.variance && <AlertTriangle className="inline h-4 w-4 text-amber-500" />}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <NumPadInput label="Received" value={r.received} onChange={(v) => e.setRow(r.item_id, { received: v })} unit={r.unit} testId={`recv-${r.item_id}`} />
                    <NumPadInput label="Closing" value={r.closing} onChange={(v) => e.setRow(r.item_id, { closing: v })} unit={r.unit} testId={`close-${r.item_id}`} />
                  </div>
                  <input value={r.note} onChange={(ev) => e.setRow(r.item_id, { note: ev.target.value })} placeholder="Note (optional)"
                    className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600" />
                </div>
              ))}
              {e.rows.length === 0 && <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-zinc-600">No active items configured.</div>}
            </div>

            <h2 className="mb-2 mt-6 font-display text-sm font-bold uppercase tracking-wider text-zinc-500">Sales &amp; Revenue</h2>
            <div className="space-y-3">
              <NumPadInput label="Total Cash Sales (± tips)" value={e.sales.cash_sales} onChange={(v) => e.setSales({ ...e.sales, cash_sales: v })} allowNegative testId="bar-app-cash" />
              <NumPadInput label="Total Card Sales" value={e.sales.card_sales} onChange={(v) => e.setSales({ ...e.sales, card_sales: v })} testId="bar-app-card" />
              <NumPadInput label="Total Sales (All Methods)" value={e.sales.total_sales} onChange={(v) => e.setSales({ ...e.sales, total_sales: v })} testId="bar-app-total" />
            </div>

            <h2 className="mb-2 mt-6 font-display text-sm font-bold uppercase tracking-wider text-zinc-500">Cash Reconciliation</h2>
            <div className="space-y-3">
              <NumPadInput label="Float at Start" value={e.recon.float_start} onChange={(v) => e.setRecon({ ...e.recon, float_start: v })} testId="bar-app-float" />
              <NumPadInput label="Actual Cash Count" value={e.recon.actual_cash} onChange={(v) => e.setRecon({ ...e.recon, actual_cash: v })} testId="bar-app-actual" />
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex justify-between text-sm"><span className="text-zinc-400">Expected Cash</span><span className="font-mono font-bold">{money(e.computed.expected)}</span></div>
                <div className="mt-1 flex justify-between text-sm"><span className="text-zinc-400">Over / Short</span>
                  <span className={`font-mono font-bold ${e.computed.overShort === 0 ? "text-emerald-400" : "text-red-400"}`}>{e.computed.overShort === 0 ? "Balanced" : money(e.computed.overShort)}</span></div>
              </div>
            </div>

            <textarea value={e.notes} onChange={(ev) => e.setNotes(ev.target.value)} placeholder="General notes about the night..."
              className="mt-4 w-full rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-white placeholder:text-zinc-600" rows={3} data-testid="bar-app-notes" />
          </>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-zinc-950/95 p-3 backdrop-blur">
        <button onClick={submit} disabled={saving || e.loading} data-testid="bar-app-submit"
          className="flex h-16 w-full items-center justify-center rounded-2xl bg-[#CC0000] text-xl font-bold text-white shadow-[0_0_20px_rgba(204,0,0,0.4)] active:scale-[0.99]">
          {saving ? <Loader2 className="h-6 w-6 animate-spin" /> : e.existing ? "Update Entry" : "Submit Entry"}
        </button>
      </div>
    </div>
  );
}

export default function BarApp() {
  const { user } = useAuth();
  if (user === null) return <div className="flex min-h-screen items-center justify-center bg-zinc-950"><Loader2 className="h-8 w-8 animate-spin text-[#CC0000]" /></div>;
  if (user === false) return <DarkLogin />;
  if (!["bar_staff", "admin", "manager"].includes(user.role))
    return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-950 p-6 text-center text-white"><AlertTriangle className="h-10 w-10 text-amber-500" /><p>This app is for bar staff only.</p><button onClick={() => { localStorage.removeItem("s8_token"); window.location.reload(); }} className="rounded-lg bg-zinc-800 px-4 py-2">Switch account</button></div>;
  return <Entry />;
}
