import React, { useEffect, useState } from "react";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { toast } from "sonner";
import { api, apiError } from "../lib/api";
import { fmtDate, todayStr } from "../lib/format";
import { StatusBadge, Pill } from "../components/StatusBadge";

const NEXT = { Dirty: "Clean", Clean: "Vacant" };

export default function Housekeeping() {
  const [date, setDate] = useState(todayStr());
  const [list, setList] = useState([]);

  async function load() {
    const { data } = await api.get("/hotel/housekeeping", { params: { date } });
    setList(data);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date]);

  async function setStatus(roomId, status) {
    try { await api.patch(`/hotel/rooms/${roomId}/status`, null, { params: { status } });
      toast.success(`Room → ${status}`); load(); }
    catch (e) { toast.error(apiError(e)); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Housekeeping</h1>
          <p className="text-sm text-slate-500">Tomorrow's check-outs &amp; all dirty rooms</p>
        </div>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" data-testid="housekeeping-date" />
      </div>

      <Card className="p-5">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Room</TableHead><TableHead>Type</TableHead><TableHead>Guest</TableHead>
                <TableHead>Check-Out</TableHead><TableHead>Status</TableHead><TableHead>Reason</TableHead><TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((r) => (
                <TableRow key={r.room_id} data-testid={`hk-row-${r.room_number}`}>
                  <TableCell className="font-mono font-bold">{r.room_number}</TableCell>
                  <TableCell className="text-sm">{r.room_type}</TableCell>
                  <TableCell>{r.guest_name || "—"}</TableCell>
                  <TableCell>{r.check_out_date ? fmtDate(r.check_out_date) : "—"}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell><Pill color={r.reason === "Dirty Status" ? "yellow" : "blue"}>{r.reason}</Pill></TableCell>
                  <TableCell className="text-right">
                    {NEXT[r.status] && (
                      <Button size="sm" variant="outline" onClick={() => setStatus(r.room_id, NEXT[r.status])} data-testid={`hk-mark-${r.room_number}`}>
                        Mark {NEXT[r.status]}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {list.length === 0 && <TableRow><TableCell colSpan={7} className="py-10 text-center text-slate-400">Nothing to clean for this date.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
