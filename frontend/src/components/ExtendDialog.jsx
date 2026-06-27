import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "../lib/api";
import { money } from "../lib/format";

const PAYMENT_METHODS = ["Cash", "Interac", "Cheque", "Card"];

export function ExtendDialog({ open, onClose, onSaved, reservation }) {
  const [nights, setNights] = useState("");
  const [rate, setRate] = useState("");
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState("Cash");
  const [saving, setSaving] = useState(false);

  const n = Number(nights || 0), r = Number(rate || 0);
  const before = +(n * r).toFixed(2);
  const tax = +(before * 0.09).toFixed(2);
  const after = +(before + tax).toFixed(2);

  async function save() {
    if (n <= 0) return toast.error("Enter additional nights");
    setSaving(true);
    try {
      await api.post(`/hotel/reservations/${reservation.id}/extend`, {
        additional_nights: n, nightly_rate: r, amount_paid: Number(paid || 0), payment_method: method,
      });
      toast.success("Stay extended");
      onSaved && onSaved();
      onClose();
      setNights(""); setRate(""); setPaid("");
    } catch (e) { toast.error(apiError(e)); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent data-testid="extend-dialog">
        <DialogHeader><DialogTitle className="font-display text-xl">Extend Stay — {reservation?.guest_name}</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-500">This hotel is fully prepaid. The extension must be paid to confirm.</p>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Additional Nights</Label><Input data-testid="extend-nights" type="number" value={nights} onChange={(e) => setNights(e.target.value)} className="mt-1" /></div>
          <div><Label>Nightly Rate</Label><Input data-testid="extend-rate" type="number" value={rate} onChange={(e) => setRate(e.target.value)} className="mt-1" /></div>
          <div className="col-span-2 grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-4">
            <div><div className="text-xs text-slate-500">Before Tax</div><div className="font-mono font-bold">{money(before)}</div></div>
            <div><div className="text-xs text-slate-500">Tax (9%)</div><div className="font-mono font-bold text-amber-700">{money(tax)}</div></div>
            <div><div className="text-xs text-slate-500">Total After Tax</div><div className="font-mono font-extrabold text-[#CC0000]">{money(after)}</div></div>
          </div>
          <div><Label>Amount Paid</Label><Input data-testid="extend-paid" type="number" value={paid} onChange={(e) => setPaid(e.target.value)} className="mt-1" /></div>
          <div>
            <Label>Payment Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger data-testid="extend-method" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#CC0000] hover:bg-[#A30000]" data-testid="extend-save">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm & Pay"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
