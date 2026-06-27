import React, { useEffect, useState } from "react";
import { Plus, Search, Pencil, X, ArrowRightCircle, CalendarPlus } from "lucide-react";
import { ExtendDialog } from "../components/ExtendDialog";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../components/ui/alert-dialog";
import { toast } from "sonner";
import { api, apiError } from "../lib/api";
import { money, fmtDate } from "../lib/format";
import { Pill } from "../components/StatusBadge";
import { ReservationDialog } from "../components/ReservationDialog";

const STATUS_COLORS = { active: "green", future: "blue", checked_out: "slate", cancelled: "red" };

export default function Reservations() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [extendRes, setExtendRes] = useState(null);

  async function load() {
    const { data } = await api.get("/hotel/reservations", { params: { status, q: q || undefined } });
    setItems(data);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  async function cancel(id) {
    try { await api.post(`/hotel/reservations/${id}/cancel`); toast.success("Reservation cancelled"); load(); }
    catch (e) { toast.error(apiError(e)); }
  }
  async function convert(r) {
    try { await api.post(`/hotel/reservations/${r.id}/convert`, null, { params: r.room_id ? { room_id: r.room_id } : {} });
      toast.success("Converted to check-in"); load(); }
    catch (e) { toast.error(apiError(e)); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Reservations</h1>
          <p className="text-sm text-slate-500">{items.length} records</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-[#CC0000] hover:bg-[#A30000]" data-testid="new-reservation-btn">
          <Plus className="mr-1.5 h-4 w-4" /> New Reservation
        </Button>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Tabs value={status} onValueChange={setStatus}>
            <TabsList data-testid="reservation-filters">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="future">Future</TabsTrigger>
              <TabsTrigger value="checked_out">Checked Out</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input data-testid="reservation-search" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Search name, phone, room..." className="h-10 pl-9" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Guest</TableHead><TableHead>Room</TableHead><TableHead>Dates</TableHead>
                <TableHead>Nights</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id} data-testid={`reservation-row-${r.id}`}>
                  <TableCell>
                    <div className="font-semibold">{r.guest_name}</div>
                    <div className="text-xs text-slate-400">{r.phone || "—"}</div>
                  </TableCell>
                  <TableCell>{r.room_number ? <span className="font-mono">{r.room_number}</span> : <span className="text-slate-400">{r.room_type || "Unassigned"}</span>}</TableCell>
                  <TableCell className="text-sm">{fmtDate(r.check_in)} → {fmtDate(r.check_out)}</TableCell>
                  <TableCell className="font-mono">{r.nights}</TableCell>
                  <TableCell className="font-mono font-semibold">{money(r.total_after_tax)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <Pill color={STATUS_COLORS[r.status]}>{r.status.replace("_", " ")}</Pill>
                      {r.arriving_today && <Pill color="yellow" testId={`arriving-${r.id}`}>Arriving Today</Pill>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {r.status === "future" && (
                        <Button size="icon" variant="ghost" title="Convert to Check-In" onClick={() => convert(r)} data-testid={`convert-${r.id}`}>
                          <ArrowRightCircle className="h-4 w-4 text-emerald-600" />
                        </Button>
                      )}
                      {r.status === "active" && (
                        <Button size="icon" variant="ghost" title="Extend Stay" onClick={() => setExtendRes(r)} data-testid={`extend-${r.id}`}>
                          <CalendarPlus className="h-4 w-4 text-blue-600" />
                        </Button>
                      )}
                      {(r.status === "active" || r.status === "future") && (
                        <>
                          <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setDialogOpen(true); }} data-testid={`edit-${r.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" data-testid={`cancel-${r.id}`}><X className="h-4 w-4 text-red-600" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Cancel reservation?</AlertDialogTitle>
                                <AlertDialogDescription>The room will be freed. This reservation is archived, not deleted.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Keep</AlertDialogCancel>
                                <AlertDialogAction onClick={() => cancel(r.id)} className="bg-red-600 hover:bg-red-700">Cancel Reservation</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-slate-400">No reservations found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <ReservationDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSaved={load} reservation={editing} />
      {extendRes && <ExtendDialog open={!!extendRes} onClose={() => setExtendRes(null)} onSaved={load} reservation={extendRes} />}
    </div>
  );
}
