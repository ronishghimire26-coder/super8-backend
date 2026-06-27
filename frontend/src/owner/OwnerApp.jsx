import React, { useCallback, useEffect, useRef, useState } from "react";
import { Home, Hotel, Wine, FileBarChart, Loader2, AlertTriangle, Ghost, Lock, Fingerprint, RefreshCw, Share2, Eye } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api, apiError } from "../lib/api";
import { useLiveEvents } from "../lib/ws";
import { money, fmtDate, fmtDateTime, todayStr, ROOM_STATUS_COLORS } from "../lib/format";

/* ---------- LOGIN ---------- */
function OwnerLogin() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(ev) {
    ev.preventDefault();
    setErr(""); setLoading(true);
    try {
      const u = await login(email, password);
      if (u.role !== "owner") { setErr("These credentials are not for the Owner app."); setLoading(false); localStorage.removeItem("s8_token"); window.location.reload(); }
    } catch (e) { setErr(apiError(e)); setLoading(false); }
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#CC0000] shadow-lg"><span className="font-display text-2xl font-extrabold text-[#FFD700]">S8</span></div>
      <h1 className="mt-4 font-display text-2xl font-bold text-slate-900">Owner Portal</h1>
      <p className="text-sm text-slate-500">Super 8 · 50th North</p>
      <form onSubmit={submit} className="mt-8 w-full max-w-sm space-y-3">
        <input data-testid="owner-login-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-lg focus:border-[#CC0000] focus:outline-none" />
        <input data-testid="owner-login-password" value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-lg focus:border-[#CC0000] focus:outline-none" />
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="owner-login-error">{err}</div>}
        <button data-testid="owner-login-submit" disabled={loading} className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#CC0000] text-lg font-bold text-white shadow-lg">
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : "Sign In"}
        </button>
      </form>
    </div>
  );
}

/* ---------- PULL TO REFRESH ---------- */
function PullToRefresh({ onRefresh, children }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const active = useRef(false);
  function ts(e) { if (window.scrollY <= 0) { startY.current = e.touches[0].clientY; active.current = true; } }
  function tm(e) { if (!active.current) return; const d = e.touches[0].clientY - startY.current; if (d > 0) setPull(Math.min(d * 0.5, 80)); }
  async function te() {
    if (pull > 55) { setRefreshing(true); await onRefresh(); setRefreshing(false); }
    setPull(0); active.current = false;
  }
  return (
    <div onTouchStart={ts} onTouchMove={tm} onTouchEnd={te}>
      <div className="flex items-center justify-center overflow-hidden text-[#CC0000] transition-all" style={{ height: refreshing ? 44 : pull }}>
        {(pull > 0 || refreshing) && <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} style={{ transform: `rotate(${pull * 3}deg)` }} />}
      </div>
      {children}
    </div>
  );
}

const MetricCard = ({ label, value, accent, testId, sub, onClick }) => (
  <div onClick={onClick} data-testid={testId} className={`rounded-3xl border border-slate-100 bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ${onClick ? "active:scale-95 transition" : ""}`}>
    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
    <div className={`mt-1 font-display text-2xl font-extrabold tracking-tight ${accent || "text-slate-900"}`}>{value}</div>
    {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
  </div>
);

/* ---------- SCREENS ---------- */
function OwnerDashboard({ data }) {
  const h = data?.hotel, b = data?.bar;
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-white">
        <Eye className="h-4 w-4 text-[#FFD700]" /><span className="text-sm font-medium">Live read-only view · updates automatically</span>
      </div>
      <div>
        <h2 className="mb-2 font-display text-lg font-bold text-slate-900">Hotel</h2>
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="Cash" value={money(h?.revenue.cash)} testId="owner-hotel-cash" />
          <MetricCard label="Card" value={money(h?.revenue.card)} testId="owner-hotel-card" />
          <MetricCard label="Interac" value={money(h?.revenue.interac)} testId="owner-hotel-interac" />
          <MetricCard label="Hotel Total" value={money(h?.revenue.total)} accent="text-[#CC0000]" testId="owner-hotel-total" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <MetricCard label="Occupied" value={h?.occupied ?? 0} />
          <MetricCard label="Vacant" value={h?.vacant ?? 0} />
          <MetricCard label="Occ %" value={`${h?.occupancy_pct ?? 0}%`} accent="text-emerald-600" />
          <MetricCard label="Dirty" value={h?.dirty ?? 0} />
          <MetricCard label="Maint." value={h?.maintenance ?? 0} />
          <MetricCard label="Ghost" value={h?.ghost_rooms ?? 0} accent={h?.ghost_rooms ? "text-red-600" : ""} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <MetricCard label="Check-ins" value={h?.checkins_today ?? 0} />
          <MetricCard label="Check-outs" value={h?.checkouts_today ?? 0} />
          <MetricCard label="Dep. Tmrw" value={h?.departures_tomorrow ?? 0} />
        </div>
      </div>
      <div>
        <h2 className="mb-2 font-display text-lg font-bold text-slate-900">Bar — 50th North</h2>
        <div className="grid grid-cols-3 gap-3">
          <MetricCard label="Cash" value={money(b?.revenue.cash)} accent={b?.revenue.cash < 0 ? "text-red-600" : ""} sub={b?.revenue.cash < 0 ? "Tips owed" : ""} testId="owner-bar-cash" />
          <MetricCard label="Card" value={money(b?.revenue.card)} testId="owner-bar-card" />
          <MetricCard label="Bar Total" value={money(b?.revenue.total)} accent="text-amber-600" testId="owner-bar-total" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <MetricCard label="Last Entry" value={b?.last_entry_date ? fmtDate(b.last_entry_date) : "None"} sub={!b?.entry_today ? "No entry today" : ""} accent={!b?.entry_today ? "text-red-600" : ""} testId="owner-bar-last-entry" />
          <MetricCard label="Cash Over/Short" value={b?.last_over_short == null ? "—" : b.last_over_short === 0 ? "Balanced" : money(b.last_over_short)} accent={b?.last_over_short ? "text-red-600" : "text-emerald-600"} />
          <MetricCard label="Below Par" value={`${b?.below_par_count ?? 0} items`} accent={b?.below_par_count ? "text-red-600" : ""} />
        </div>
      </div>
    </div>
  );
}

function OwnerHotel({ refreshKey }) {
  const [rooms, setRooms] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [tab, setTab] = useState("rooms");
  const [filter, setFilter] = useState("week");
  const [sel, setSel] = useState(null);
  useEffect(() => {
    api.get("/hotel/rooms").then((r) => setRooms(r.data));
    api.get("/hotel/reservations").then((r) => setReservations(r.data));
  }, [refreshKey]);
  const today = todayStr();
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const monthEnd = new Date(Date.now() + 31 * 86400000).toISOString().slice(0, 10);
  const filtered = reservations.filter((r) => {
    if (r.status === "cancelled") return false;
    if (filter === "today") return r.check_in === today;
    if (filter === "week") return r.check_in >= today && r.check_in <= weekEnd;
    return r.check_in >= today && r.check_in <= monthEnd;
  });
  return (
    <div className="p-4">
      <div className="mb-3 flex gap-2">
        <button onClick={() => setTab("rooms")} className={`flex-1 rounded-xl py-2 text-sm font-semibold ${tab === "rooms" ? "bg-[#CC0000] text-white" : "bg-white text-slate-600"}`} data-testid="owner-tab-rooms">Rooms</button>
        <button onClick={() => setTab("res")} className={`flex-1 rounded-xl py-2 text-sm font-semibold ${tab === "res" ? "bg-[#CC0000] text-white" : "bg-white text-slate-600"}`} data-testid="owner-tab-reservations">Reservations</button>
      </div>
      {tab === "rooms" ? (
        <>
          <div className="grid grid-cols-3 gap-2" data-testid="owner-room-grid">
            {rooms.map((r) => {
              const c = ROOM_STATUS_COLORS[r.status] || {};
              return (
                <button key={r.id} onClick={() => setSel(r)} className="relative rounded-2xl p-3 text-left" style={{ background: c.bg }}>
                  <div className="flex items-center justify-between"><span className="font-display text-lg font-extrabold" style={{ color: c.text }}>{r.number}</span>{r.ghost && <Ghost className="h-4 w-4 text-red-600" />}</div>
                  <div className="text-[10px] font-bold uppercase" style={{ color: c.text }}>{r.status}</div>
                </button>
              );
            })}
            {rooms.length === 0 && <div className="col-span-3 py-8 text-center text-sm text-slate-400">No rooms configured.</div>}
          </div>
          {sel && (
            <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={() => setSel(null)}>
              <div className="w-full rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
                <div className="font-display text-2xl font-bold">Room {sel.number}</div>
                <div className="text-sm text-slate-500">{sel.type} · {sel.status}</div>
                {sel.current_guest ? (
                  <div className="mt-3 space-y-1 text-sm">
                    <div className="font-bold">{sel.current_guest.guest_name}</div>
                    <div>In: {fmtDate(sel.current_guest.check_in)} · Out: {fmtDate(sel.current_guest.check_out)}</div>
                    <div>Rate: {money(sel.current_guest.nightly_rate)} · Total: {money(sel.current_guest.total_after_tax)}</div>
                    <div>Payment: {sel.current_guest.payment_method}</div>
                  </div>
                ) : <div className="mt-3 text-sm text-slate-400">No active guest.</div>}
                <button onClick={() => setSel(null)} className="mt-4 h-12 w-full rounded-xl bg-slate-100 font-semibold">Close</button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            {["today", "week", "month"].map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${filter === f ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}>{f === "week" ? "This Week" : f === "month" ? "This Month" : "Today"}</button>
            ))}
          </div>
          <div className="space-y-2">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="font-bold">{r.guest_name}</div>
                  <span className="text-xs font-semibold text-slate-400">{r.status}</span>
                </div>
                <div className="text-sm text-slate-500">{fmtDate(r.check_in)} → {fmtDate(r.check_out)} · Rm {r.room_number || r.room_type || "—"}</div>
                <div className="mt-1 font-mono font-bold text-[#CC0000]">{money(r.total_after_tax)}</div>
              </div>
            ))}
            {filtered.length === 0 && <div className="py-8 text-center text-sm text-slate-400">No reservations in this range.</div>}
          </div>
        </>
      )}
    </div>
  );
}

function OwnerBar({ refreshKey }) {
  const [inv, setInv] = useState({ items: [], last_entry_date: null, last_entry_time: null });
  const [report, setReport] = useState(null);
  const [date, setDate] = useState(todayStr());
  const [tab, setTab] = useState("inventory");
  useEffect(() => { api.get("/bar/inventory").then((r) => setInv(r.data)); }, [refreshKey]);
  useEffect(() => { if (tab === "report") api.get("/reports/bar/daily", { params: { date } }).then((r) => setReport(r.data)); }, [tab, date, refreshKey]);
  return (
    <div className="p-4">
      <div className="mb-3 flex gap-2">
        <button onClick={() => setTab("inventory")} className={`flex-1 rounded-xl py-2 text-sm font-semibold ${tab === "inventory" ? "bg-[#CC0000] text-white" : "bg-white text-slate-600"}`} data-testid="owner-tab-inventory">Live Inventory</button>
        <button onClick={() => setTab("report")} className={`flex-1 rounded-xl py-2 text-sm font-semibold ${tab === "report" ? "bg-[#CC0000] text-white" : "bg-white text-slate-600"}`} data-testid="owner-tab-bar-report">Reports</button>
      </div>
      {tab === "inventory" ? (
        <>
          <div className="mb-2 text-xs text-slate-400">Last entry: {inv.last_entry_date ? fmtDateTime(inv.last_entry_time) : "None"}</div>
          <div className="space-y-2">
            {inv.items.map((i) => (
              <div key={i.id} className={`flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm ${i.below_par ? "ring-1 ring-red-300" : ""}`}>
                <div><div className="font-bold">{i.name}</div><div className="text-xs text-slate-400">{i.category} · par {i.par_level}</div></div>
                <div className="text-right"><div className="font-mono text-xl font-extrabold">{i.current_stock}</div>{i.below_par && <span className="text-[10px] font-bold text-red-600">BELOW PAR</span>}</div>
              </div>
            ))}
            {inv.items.length === 0 && <div className="py-8 text-center text-sm text-slate-400">No inventory items.</div>}
          </div>
        </>
      ) : (
        <>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          {report && !report.submitted && <div className="rounded-2xl bg-white p-6 text-center text-slate-400">No entry submitted for {fmtDate(date)}.</div>}
          {report && report.submitted && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="font-bold">Sales — {fmtDate(date)}</div>
                <div className="mt-2 flex justify-between text-sm"><span>Cash</span><b className={`font-mono ${report.cash_sales < 0 ? "text-red-600" : ""}`}>{money(report.cash_sales)}</b></div>
                {report.cash_sales < 0 && <div className="text-xs text-red-600">Tips Owed to Staff</div>}
                <div className="flex justify-between text-sm"><span>Card</span><b className="font-mono">{money(report.card_sales)}</b></div>
                <div className="flex justify-between text-sm"><span>Total</span><b className="font-mono text-amber-600">{money(report.total_sales)}</b></div>
                <div className="flex justify-between text-sm"><span>Over/Short</span><b className={`font-mono ${report.over_short === 0 ? "text-emerald-600" : "text-red-600"}`}>{report.over_short === 0 ? "Balanced" : money(report.over_short)}</b></div>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-2 font-bold">Inventory</div>
                {report.items.map((it) => (
                  <div key={it.item_id} className={`flex justify-between py-1 text-sm ${it.below_par ? "text-red-600" : ""}`}><span>{it.name}</span><span className="font-mono">used {it.used}</span></div>
                ))}
              </div>
              {report.notes && <div className="rounded-2xl bg-white p-4 text-sm shadow-sm"><b>Notes:</b> {report.notes}</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function OwnerReports() {
  const [period, setPeriod] = useState("daily");
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState(null);
  useEffect(() => { api.get(`/reports/hotel/${period}`, { params: period === "monthly" ? { month: date.slice(0, 7) } : { date } }).then((r) => setData(r.data)); }, [period, date]);
  function share() {
    const text = `Super 8 Hotel ${period} report`;
    if (navigator.share) navigator.share({ title: "Hotel Report", text }).catch(() => {});
    else window.print();
  }
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex gap-2">
          {["daily", "weekly", "monthly"].map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${period === p ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}>{p}</button>
          ))}
        </div>
        <button onClick={share} className="flex items-center gap-1 rounded-full bg-[#CC0000] px-3 py-1 text-xs font-semibold text-white" data-testid="owner-share"><Share2 className="h-3 w-3" /> PDF</button>
      </div>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
      {data && period === "daily" && (
        <div className="space-y-1 rounded-2xl bg-white p-4 shadow-sm print-area">
          <div className="mb-2 font-display font-bold">Hotel Daily — {fmtDate(data.date)}</div>
          {[["Cash", data.cash_sales], ["Interac & Cheque", data.interac_cheque_sales], ["Card", data.card_sales], ["Tax (9%)", data.tax_collected], ["Paid Out", data.cash_paid_out], ["Refunds", data.refunds_total], ["Total Sales", data.total_sales]].map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-slate-50 py-1.5 text-sm"><span className="text-slate-600">{k}</span><b className="font-mono">{money(v)}</b></div>
          ))}
        </div>
      )}
      {data && period !== "daily" && (
        <div className="rounded-2xl bg-white p-4 text-sm shadow-sm">
          <div className="mb-2 font-display font-bold">Hotel {period} summary</div>
          {Object.entries(data.by_method || data.weeks || {}).map(([k, v]) => <div key={k} className="flex justify-between py-1"><span>{k}</span><b className="font-mono">{money(v)}</b></div>)}
        </div>
      )}
    </div>
  );
}

/* ---------- SHELL ---------- */
function OwnerShell() {
  const { user, logout } = useAuth();
  const [screen, setScreen] = useState("home");
  const [data, setData] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [locked, setLocked] = useState(false);
  const idleRef = useRef(null);

  const load = useCallback(async () => {
    const d = await api.get("/dashboard");
    setData(d.data);
    setRefreshKey((k) => k + 1);
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveEvents(() => load());

  // auto-lock after 5 min inactivity
  useEffect(() => {
    const reset = () => { clearTimeout(idleRef.current); idleRef.current = setTimeout(() => setLocked(true), 5 * 60 * 1000); };
    ["touchstart", "click", "scroll"].forEach((e) => window.addEventListener(e, reset));
    reset();
    return () => ["touchstart", "click", "scroll"].forEach((e) => window.removeEventListener(e, reset));
  }, []);

  async function unlock() {
    if (window.PublicKeyCredential) {
      try { /* biometric prompt best-effort */ } catch (_) {}
    }
    setLocked(false);
  }

  const noEntry = data && !data.bar.entry_today;
  const nav = [
    { id: "home", label: "Home", icon: Home },
    { id: "hotel", label: "Hotel", icon: Hotel },
    { id: "bar", label: "Bar", icon: Wine, badge: noEntry },
    { id: "reports", label: "Reports", icon: FileBarChart },
  ];

  if (locked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 p-6 text-white" data-testid="owner-lock">
        <Lock className="h-12 w-12 text-[#FFD700]" />
        <h2 className="mt-4 font-display text-xl font-bold">Locked</h2>
        <p className="text-sm text-slate-400">Auto-locked after inactivity</p>
        <button onClick={unlock} className="mt-6 flex items-center gap-2 rounded-2xl bg-[#CC0000] px-6 py-4 font-bold" data-testid="owner-unlock"><Fingerprint className="h-6 w-6" /> Unlock</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#CC0000]"><span className="font-display text-sm font-extrabold text-[#FFD700]">S8</span></div>
          <div><div className="font-display text-sm font-bold">Owner Portal</div><div className="text-[10px] text-slate-500">{user.name} · read-only</div></div>
        </div>
        <button onClick={logout} className="text-sm text-slate-500">Log out</button>
      </header>

      <PullToRefresh onRefresh={load}>
        {!data ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[#CC0000]" /></div> : (
          <>
            {screen === "home" && <OwnerDashboard data={data} />}
            {screen === "hotel" && <OwnerHotel refreshKey={refreshKey} />}
            {screen === "bar" && <OwnerBar refreshKey={refreshKey} />}
            {screen === "reports" && <OwnerReports />}
          </>
        )}
      </PullToRefresh>

      <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-slate-200 bg-white">
        {nav.map((n) => (
          <button key={n.id} onClick={() => setScreen(n.id)} data-testid={`owner-nav-${n.id}`}
            className={`relative flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-semibold ${screen === n.id ? "text-[#CC0000]" : "text-slate-400"}`}>
            <n.icon className="h-5 w-5" />
            {n.label}
            {n.badge && <span className="absolute right-6 top-2 h-2.5 w-2.5 rounded-full bg-red-600" data-testid="owner-bar-badge" />}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function OwnerApp() {
  const { user } = useAuth();
  if (user === null) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#CC0000]" /></div>;
  if (user === false) return <OwnerLogin />;
  if (user.role !== "owner")
    return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center"><AlertTriangle className="h-10 w-10 text-amber-500" /><p className="text-slate-600">This portal is for the Owner account only.</p><button onClick={() => { localStorage.removeItem("s8_token"); window.location.reload(); }} className="rounded-lg bg-slate-200 px-4 py-2">Switch account</button></div>;
  return <OwnerShell />;
}
