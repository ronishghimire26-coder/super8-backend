import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "../lib/api";
import { money } from "../lib/format";

const PAYMENT_METHODS = ["Cash", "Interac", "Cheque", "Card"];
const TAX_RATE = 0.09;

const empty = {
  guest_name: "", phone: "", email: "", res_type: "checkin_now",
  room_id: "", room_type: "", check_in: "", check_out: "",
  nightly_rate: "", amount_paid: "", payment_method: "Cash", notes: "",
};

export function ReservationDialog({ open, onClose, onSaved, reservation }) {
  const [form, setForm] = useState(empty);
  const [roomTypes, setRoomTypes] = useState([]);
  const [available, setAvailable] = useState([]);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const isEdit = !!reservation;

  useEffect(() => {
    api.get("/hotel/room-types").then((r) => setRoomTypes(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      if (reservation) {
        setForm({
          guest_name: reservation.guest_name || "", phone: reservation.phone || "", email: reservation.email || "",
          res_type: reservation.res_type || "checkin_now", room_id: reservation.room_id || "",
          room_type: reservation.room_type || "", check_in: reservation.check_in || "", check_out: reservation.check_out || "",
          nightly_rate: reservation.nightly_rate ?? "", amount_paid: reservation.amount_paid ?? "",
          payment_method: reservation.payment_method || "Cash", notes: reservation.notes || "",
        });
      } else {
        setForm(empty);
      }
      setAvailable([]);
    }
  }, [open, reservation]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Live availability check
  useEffect(() => {
    if (!open || !form.check_in || !form.check_out) return;
    if (new Date(form.check_out) <= new Date(form.check_in)) { setAvailable([]); return; }
    setChecking(true);
    api.get("/hotel/availability", { params: { check_in: form.check_in, check_out: form.check_out } })
      .then((r) => {
        let rooms = r.data;
        // keep currently assigned room in list when editing
        if (reservation?.room_id && !rooms.find((x) => x.id === reservation.room_id)) {
          rooms = [{ id: reservation.room_id, number: reservation.room_number, type: reservation.room_type }, ...rooms];
        }
        setAvailable(rooms);
      })
      .catch(() => setAvailable([]))
      .finally(() => setChecking(false));
  }, [open, form.check_in, form.check_out]);

  const nights = useMemo(() => {
    if (!form.check_in || !form.check_out) return 0;
    const d = (new Date(form.check_out) - new Date(form.check_in)) / 86400000;
    return d > 0 ? Math.round(d) : 0;
  }, [form.check_in, form.check_out]);

  const rate = Number(form.nightly_rate || 0);
  const before = +(rate * nights).toFixed(2);
  const tax = +(before * TAX_RATE).toFixed(2);
  const after = +(before + tax).toFixed(2);

  const noRooms = form.check_in && form.check_out && nights > 0 && !checking && available.length === 0;

  function onRoomChange(roomId) {
    const room = available.find((r) => r.id === roomId);
    set("room_id", roomId);
    if (room) set("room_type", room.type);
  }

  async function save() {
    if (!form.guest_name.trim()) return toast.error("Guest name is required");
    if (nights <= 0) return toast.error("Select valid check-in and check-out dates");
    if (form.res_type === "checkin_now" && !form.room_id) return toast.error("Select a room for Check-In Now");
    if (noRooms) return toast.error("No rooms available for these dates");
    setSaving(true);
    const payload = {
      guest_name: form.guest_name, phone: form.phone || null, email: form.email || null,
      res_type: form.res_type, room_id: form.room_id || null, room_type: form.room_type || null,
      check_in: form.check_in, check_out: form.check_out, nightly_rate: rate,
      amount_paid: Number(form.amount_paid || 0), payment_method: form.payment_method, notes: form.notes || null,
    };
    try {
      if (isEdit) await api.put(`/hotel/reservations/${reservation.id}`, payload);
      else await api.post("/hotel/reservations", payload);
      toast.success(isEdit ? "Reservation updated" : "Reservation created");
      onSaved && onSaved();
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto" data-testid="reservation-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{isEdit ? "Edit Reservation" : "New Reservation"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <Label>Guest Name *</Label>
            <Input data-testid="res-guest-name" value={form.guest_name} onChange={(e) => set("guest_name", e.target.value)} className="mt-1" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Label>Phone</Label>
            <Input data-testid="res-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} className="mt-1" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Label>Email</Label>
            <Input data-testid="res-email" value={form.email} onChange={(e) => set("email", e.target.value)} className="mt-1" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Label>Reservation Type</Label>
            <Select value={form.res_type} onValueChange={(v) => set("res_type", v)}>
              <SelectTrigger data-testid="res-type" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="checkin_now">Check-In Now</SelectItem>
                <SelectItem value="future">Future Reservation</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <Label>Check-In Date</Label>
            <Input data-testid="res-checkin" type="date" value={form.check_in} onChange={(e) => set("check_in", e.target.value)} className="mt-1" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Label>Check-Out Date</Label>
            <Input data-testid="res-checkout" type="date" value={form.check_out} onChange={(e) => set("check_out", e.target.value)} className="mt-1" />
          </div>

          {noRooms && (
            <div className="col-span-2 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700" data-testid="res-no-rooms-warning">
              <AlertTriangle className="h-4 w-4" /> No rooms available for these dates. This reservation cannot be saved.
            </div>
          )}

          <div className="col-span-2 sm:col-span-1">
            <Label>Room {form.res_type === "checkin_now" ? "*" : "(optional)"}</Label>
            <Select value={form.room_id} onValueChange={onRoomChange} disabled={checking}>
              <SelectTrigger data-testid="res-room" className="mt-1">
                <SelectValue placeholder={checking ? "Checking..." : "Select room"} />
              </SelectTrigger>
              <SelectContent>
                {available.map((r) => (
                  <SelectItem key={r.id} value={r.id}>Room {r.number} · {r.type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Label>Room Type</Label>
            <Select value={form.room_type} onValueChange={(v) => set("room_type", v)} disabled={!!form.room_id}>
              <SelectTrigger data-testid="res-room-type" className="mt-1"><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {roomTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <Label>Number of Nights</Label>
            <Input data-testid="res-nights" value={nights} disabled className="mt-1 font-mono" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Label>Nightly Rate</Label>
            <Input data-testid="res-rate" type="number" value={form.nightly_rate} onChange={(e) => set("nightly_rate", e.target.value)} className="mt-1" />
          </div>

          <div className="col-span-2 grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-4">
            <div>
              <div className="text-xs font-medium text-slate-500">Before Tax</div>
              <div className="font-mono text-lg font-bold" data-testid="res-before-tax">{money(before)}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Tax (9%)</div>
              <div className="font-mono text-lg font-bold text-amber-700" data-testid="res-tax">{money(tax)}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Total After Tax</div>
              <div className="font-mono text-lg font-extrabold text-[#CC0000]" data-testid="res-after-tax">{money(after)}</div>
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <Label>Amount Paid</Label>
            <Input data-testid="res-amount-paid" type="number" value={form.amount_paid} onChange={(e) => set("amount_paid", e.target.value)} className="mt-1" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Label>Payment Method</Label>
            <Select value={form.payment_method} onValueChange={(v) => set("payment_method", v)}>
              <SelectTrigger data-testid="res-payment-method" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Notes</Label>
            <Textarea data-testid="res-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} className="mt-1" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="res-cancel">Cancel</Button>
          <Button onClick={save} disabled={saving || noRooms} className="bg-[#CC0000] hover:bg-[#A30000]" data-testid="res-save">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : isEdit ? "Save Changes" : "Create Reservation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
