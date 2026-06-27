import React, { useState } from "react";
import { Search, User } from "lucide-react";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { api } from "../lib/api";
import { money, fmtDate } from "../lib/format";
import { Pill } from "../components/StatusBadge";

export default function Guests() {
  const [q, setQ] = useState("");
  const [guests, setGuests] = useState([]);
  const [profile, setProfile] = useState(null);

  async function search() {
    const { data } = await api.get("/hotel/guests", { params: { q } });
    setGuests(data);
    setProfile(null);
  }
  async function open(g) {
    const { data } = await api.get("/hotel/guests/profile", { params: { name: g.guest_name, phone: g.phone || undefined } });
    setProfile(data);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Guest History</h1>
        <p className="text-sm text-slate-500">Search by name or phone number</p>
      </div>

      <Card className="p-5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input data-testid="guest-search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="Guest name or phone..." className="h-11 pl-9" />
          </div>
          <Button onClick={search} className="h-11 bg-[#CC0000] hover:bg-[#A30000]" data-testid="guest-search-btn">Search</Button>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-1">
          <h3 className="mb-3 font-display font-bold">Results</h3>
          <div className="space-y-2">
            {guests.map((g, i) => (
              <button key={i} onClick={() => open(g)} data-testid={`guest-item-${i}`}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-3 text-left transition hover:border-[#CC0000]">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100"><User className="h-4 w-4 text-slate-500" /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{g.guest_name}</div>
                  <div className="text-xs text-slate-400">{g.phone || "No phone"} · {g.stays} stays</div>
                </div>
              </button>
            ))}
            {guests.length === 0 && <div className="py-8 text-center text-sm text-slate-400">No results yet.</div>}
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2" data-testid="guest-profile">
          {profile ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-2xl font-bold">{profile.guest_name}</h3>
                  <p className="text-sm text-slate-500">{profile.phone || "No phone"}</p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Lifetime</div>
                  <div className="font-mono text-lg font-extrabold text-[#CC0000]">{money(profile.total_revenue)}</div>
                  <div className="text-xs text-slate-400">{profile.total_nights} nights</div>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {profile.stays.map((s) => (
                  <div key={s.id} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{fmtDate(s.check_in)} → {fmtDate(s.check_out)}</div>
                      <Pill color={s.status === "cancelled" ? "red" : "slate"}>{s.status.replace("_", " ")}</Pill>
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-1 text-sm text-slate-600 sm:grid-cols-4">
                      <div>Room {s.room_number || "—"}</div>
                      <div>{s.room_type}</div>
                      <div>{money(s.nightly_rate)}/night</div>
                      <div>{s.payment_method}</div>
                    </div>
                    <div className="mt-1 text-sm">Total charged: <b className="font-mono">{money(s.total_after_tax)}</b></div>
                    {s.extensions?.length > 0 && <div className="mt-1 text-xs text-blue-600">{s.extensions.length} extension(s)</div>}
                    {s.refunds?.length > 0 && <div className="mt-1 text-xs text-red-600">Refunds: {s.refunds.map((r) => money(r.amount)).join(", ")}</div>}
                    {s.notes && <div className="mt-1 text-xs text-slate-400">Note: {s.notes}</div>}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-slate-400">Select a guest to view their full history.</div>
          )}
        </Card>
      </div>
    </div>
  );
}
