import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Ghost, LogOut } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "../lib/api";
import { ROOM_STATUS_COLORS, money, fmtDate } from "../lib/format";
import { StatusBadge } from "./StatusBadge";

const STATUSES = ["Vacant", "Occupied", "Dirty", "Clean", "Under Maintenance"];

export function RoomGrid({ rooms, onRefresh, readOnly = false }) {
  const [selected, setSelected] = useState(null);
  const [checkoutRoom, setCheckoutRoom] = useState(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [early, setEarly] = useState(false);

  async function changeStatus(room, status) {
    try {
      await api.patch(`/hotel/rooms/${room.id}/status`, null, { params: { status } });
      toast.success(`Room ${room.number} → ${status}`);
      onRefresh && onRefresh();
      setSelected(null);
    } catch (e) { toast.error(apiError(e)); }
  }

  function startCheckout(room) {
    const guest = room.current_guest;
    const isEarly = guest && new Date(guest.check_out) > new Date();
    setEarly(isEarly);
    setRefundAmount("");
    setCheckoutRoom(room);
    setSelected(null);
  }

  async function confirmCheckout(withRefund) {
    const res = checkoutRoom.current_guest;
    try {
      await api.post(`/hotel/reservations/${res.reservation_id}/checkout`, {
        refund_amount: withRefund ? Number(refundAmount || 0) : 0,
        refund_reason: withRefund ? "Early check-out refund" : null,
      });
      toast.success("Guest checked out");
      setCheckoutRoom(null);
      onRefresh && onRefresh();
    } catch (e) { toast.error(apiError(e)); }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8" data-testid="room-grid">
        {rooms.map((room) => {
          const c = ROOM_STATUS_COLORS[room.status] || {};
          return (
            <button
              key={room.id}
              data-testid={`room-card-${room.number}`}
              onClick={() => setSelected(room)}
              className="relative flex min-h-[96px] flex-col justify-between rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
              style={{ background: c.bg, borderColor: c.dot + "55" }}
            >
              <div className="flex items-start justify-between">
                <span className="font-display text-xl font-extrabold" style={{ color: c.text }}>{room.number}</span>
                {room.ghost && <Ghost className="h-4 w-4 text-red-600" data-testid={`ghost-${room.number}`} />}
              </div>
              <div>
                <div className="truncate text-[11px] font-medium" style={{ color: c.text }}>{room.type}</div>
                <div className="mt-1 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.dot }} />
                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: c.text }}>{room.status}</span>
                </div>
              </div>
            </button>
          );
        })}
        {rooms.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">
            No rooms yet. Add rooms in Admin Settings.
          </div>
        )}
      </div>

      {/* Room detail dialog */}
      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent data-testid="room-detail-dialog">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 font-display text-2xl">
                  Room {selected.number}
                  <StatusBadge status={selected.status} />
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-1 text-sm">
                <div className="text-slate-500">{selected.type}{selected.floor ? ` · Floor ${selected.floor}` : ""}</div>
                {selected.ghost && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                    <Ghost className="h-4 w-4" /> Ghost room — Occupied with no active guest record.
                  </div>
                )}
              </div>

              {selected.current_guest ? (
                <div className="rounded-xl bg-slate-50 p-4 text-sm">
                  <div className="font-display text-lg font-bold text-slate-900">{selected.current_guest.guest_name}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-slate-600">
                    <div>Check-In: <b>{fmtDate(selected.current_guest.check_in)}</b></div>
                    <div>Check-Out: <b>{fmtDate(selected.current_guest.check_out)}</b></div>
                    <div>Rate: <b>{money(selected.current_guest.nightly_rate)}</b></div>
                    <div>Total: <b>{money(selected.current_guest.total_after_tax)}</b></div>
                    <div>Payment: <b>{selected.current_guest.payment_method}</b></div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-400">No active guest in this room.</div>
              )}

              {!readOnly && (
                <div className="space-y-3">
                  {selected.current_guest && (
                    <Button onClick={() => startCheckout(selected)} className="w-full bg-[#CC0000] hover:bg-[#A30000]" data-testid="room-checkout-btn">
                      <LogOut className="mr-2 h-4 w-4" /> Check Out
                    </Button>
                  )}
                  <div>
                    <Label className="text-xs">Set Status</Label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {STATUSES.map((s) => (
                        <Button key={s} size="sm" variant={selected.status === s ? "default" : "outline"}
                          onClick={() => changeStatus(selected, s)} data-testid={`room-status-${s.replace(/\s/g, "-")}`}>
                          {s}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Checkout / refund flow */}
      <AlertDialog open={!!checkoutRoom} onOpenChange={(v) => !v && setCheckoutRoom(null)}>
        <AlertDialogContent data-testid="checkout-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{early ? "Early Check-Out" : "Confirm Check-Out"}</AlertDialogTitle>
            <AlertDialogDescription>
              {early
                ? "This guest is checking out early. Would you like to issue a refund for the unused nights?"
                : "The room will be marked Dirty and added to today's housekeeping list."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {early && (
            <div>
              <Label>Refund Amount (optional)</Label>
              <Input type="number" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)}
                className="mt-1" placeholder="0.00" data-testid="refund-amount" />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {early ? (
              <>
                <Button variant="outline" onClick={() => confirmCheckout(false)} data-testid="checkout-no-refund">No Refund</Button>
                <AlertDialogAction onClick={() => confirmCheckout(true)} data-testid="checkout-issue-refund">Issue Refund</AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction onClick={() => confirmCheckout(false)} data-testid="checkout-confirm">Check Out</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
