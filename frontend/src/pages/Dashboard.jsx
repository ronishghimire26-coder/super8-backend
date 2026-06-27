import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Wine, BedDouble, FileBarChart, Search, AlertTriangle, Ghost, TrendingUp, Hotel } from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { api } from "../lib/api";
import { money, fmtDate, todayStr } from "../lib/format";
import { RoomGrid } from "../components/RoomGrid";
import { AIChat } from "../components/AIChat";
import { ReservationDialog } from "../components/ReservationDialog";
import { useLiveEvents } from "../lib/ws";
import { useAuth } from "../lib/auth";

function Metric({ label, value, accent, testId, sub }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3" data-testid={testId}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`font-mono text-xl font-extrabold ${accent || "text-slate-900"}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [search, setSearch] = useState("");
  const [resOpen, setResOpen] = useState(false);

  async function load() {
    const [d, r] = await Promise.all([api.get("/dashboard"), api.get("/hotel/rooms")]);
    setData(d.data);
    setRooms(r.data);
  }
  useEffect(() => { load(); }, []);
  useLiveEvents(() => load());

  const filtered = search ? rooms.filter((r) => r.number.toLowerCase().includes(search.toLowerCase())) : rooms;
  const h = data?.hotel;
  const b = data?.bar;
  const noEntryToday = b && !b.entry_today;

  return (
    <div className="space-y-6">
      {/* Header + quick actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">{fmtDate(todayStr())} · Live overview</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setResOpen(true)} className="bg-[#CC0000] hover:bg-[#A30000]" data-testid="quick-new-reservation">
            <Plus className="mr-1.5 h-4 w-4" /> New Reservation
          </Button>
          <Button variant="outline" onClick={() => navigate("/bar")} data-testid="quick-bar-entry"><Wine className="mr-1.5 h-4 w-4" /> Tonight's Bar Entry</Button>
          <Button variant="outline" onClick={() => navigate("/housekeeping")} data-testid="quick-housekeeping"><BedDouble className="mr-1.5 h-4 w-4" /> Housekeeping</Button>
          <Button variant="outline" onClick={() => navigate("/reports")} data-testid="quick-reports"><FileBarChart className="mr-1.5 h-4 w-4" /> Reports</Button>
        </div>
      </div>

      {/* Panels */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Hotel */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-5" data-testid="hotel-panel">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50"><Hotel className="h-5 w-5 text-[#CC0000]" /></div>
              <h2 className="font-display text-lg font-bold">Hotel</h2>
              {h?.ghost_rooms > 0 && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700" data-testid="ghost-alert">
                  <Ghost className="h-3.5 w-3.5" /> {h.ghost_rooms} Ghost
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Cash" value={money(h?.revenue.cash)} testId="hotel-cash" />
              <Metric label="Card" value={money(h?.revenue.card)} testId="hotel-card" />
              <Metric label="Interac" value={money(h?.revenue.interac)} testId="hotel-interac" />
              <Metric label="Hotel Total" value={money(h?.revenue.total)} accent="text-[#CC0000]" testId="hotel-total" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
              <Metric label="Rooms" value={h?.total_rooms ?? 0} testId="hotel-rooms" />
              <Metric label="Occupied" value={h?.occupied ?? 0} testId="hotel-occupied" />
              <Metric label="Vacant" value={h?.vacant ?? 0} testId="hotel-vacant" />
              <Metric label="Dirty" value={h?.dirty ?? 0} testId="hotel-dirty" />
              <Metric label="Maint." value={h?.maintenance ?? 0} testId="hotel-maintenance" />
              <Metric label="Occ. %" value={`${h?.occupancy_pct ?? 0}%`} accent="text-emerald-600" testId="hotel-occupancy" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Metric label="Check-ins Today" value={h?.checkins_today ?? 0} testId="hotel-checkins" />
              <Metric label="Check-outs Today" value={h?.checkouts_today ?? 0} testId="hotel-checkouts" />
              <Metric label="Departures Tmrw" value={h?.departures_tomorrow ?? 0} testId="hotel-departures" />
            </div>
          </Card>
        </motion.div>

        {/* Bar */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="p-5" data-testid="bar-panel">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50"><Wine className="h-5 w-5 text-amber-600" /></div>
              <h2 className="font-display text-lg font-bold">Bar — 50th North</h2>
              {noEntryToday && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700" data-testid="bar-no-entry-alert">
                  <AlertTriangle className="h-3.5 w-3.5" /> No entry today
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Cash Sales" value={money(b?.revenue.cash)} accent={b?.revenue.cash < 0 ? "text-red-600" : ""} testId="bar-cash" sub={b?.revenue.cash < 0 ? "Tips owed" : ""} />
              <Metric label="Card Sales" value={money(b?.revenue.card)} testId="bar-card" />
              <Metric label="Bar Total" value={money(b?.revenue.total)} accent="text-amber-600" testId="bar-total" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Metric label="Last Entry" value={b?.last_entry_date ? fmtDate(b.last_entry_date) : "None"} testId="bar-last-entry" />
              <Metric label="Last Night Total" value={money(b?.last_night_revenue)} testId="bar-last-night" />
              <div className="rounded-xl bg-slate-50 p-3" data-testid="bar-over-short">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Last Cash Over/Short</div>
                {b?.last_over_short === null || b?.last_over_short === undefined ? (
                  <div className="font-mono text-xl font-extrabold text-slate-400">—</div>
                ) : (
                  <div className={`font-mono text-xl font-extrabold ${b.last_over_short === 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {b.last_over_short === 0 ? "Balanced" : money(b.last_over_short)}
                  </div>
                )}
              </div>
              <button onClick={() => navigate("/bar")} className="rounded-xl bg-slate-50 p-3 text-left transition hover:bg-slate-100" data-testid="bar-below-par">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Below Par</div>
                <div className={`font-mono text-xl font-extrabold ${b?.below_par_count > 0 ? "text-red-600" : "text-slate-900"}`}>{b?.below_par_count ?? 0} items</div>
              </button>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Room search + grid */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">Rooms</h2>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input data-testid="room-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search room number..." className="h-10 pl-9" />
          </div>
        </div>
        <RoomGrid rooms={filtered} onRefresh={load} />
      </Card>

      {/* AI */}
      <AIChat />

      <ReservationDialog open={resOpen} onClose={() => setResOpen(false)} onSaved={load} />
    </div>
  );
}
