import React, { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { api, apiError } from "../lib/api";
import { money, fmtDate, fmtDateTime, todayStr } from "../lib/format";

export default function CashLog() {
  const [summary, setSummary] = useState({ cash_in: 0, paid_out: 0, net_cash: 0 });
  const [payouts, setPayouts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [payout, setPayout] = useState({ recipient: "", amount: "", reason: "", date: todayStr() });
  const [log, setLog] = useState({ date: todayStr(), text: "" });
  const [editLog, setEditLog] = useState(null);
  const [delLog, setDelLog] = useState(null);
  const [pin, setPin] = useState("");

  async function load() {
    const [s, p, l] = await Promise.all([api.get("/hotel/cash-summary"), api.get("/hotel/payouts"), api.get("/hotel/logs")]);
    setSummary(s.data); setPayouts(p.data); setLogs(l.data);
  }
  useEffect(() => { load(); }, []);

  async function addPayout() {
    if (!payout.recipient || !payout.amount) return toast.error("Recipient and amount required");
    try { await api.post("/hotel/payouts", { ...payout, amount: Number(payout.amount) });
      toast.success("Payout recorded"); setPayout({ recipient: "", amount: "", reason: "", date: todayStr() }); load(); }
    catch (e) { toast.error(apiError(e)); }
  }
  async function addLog() {
    if (!log.text) return toast.error("Entry text required");
    try { await api.post("/hotel/logs", log); toast.success("Log added"); setLog({ date: todayStr(), text: "" }); load(); }
    catch (e) { toast.error(apiError(e)); }
  }
  async function saveEdit() {
    try { await api.put(`/hotel/logs/${editLog.id}`, { date: editLog.date, text: editLog.text, pin });
      toast.success("Log updated"); setEditLog(null); setPin(""); load(); }
    catch (e) { toast.error(apiError(e)); }
  }
  async function confirmDelete() {
    try { await api.post(`/hotel/logs/${delLog.id}/delete`, { pin });
      toast.success("Log deleted"); setDelLog(null); setPin(""); load(); }
    catch (e) { toast.error(apiError(e)); }
  }

  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Cash &amp; Manual Log</h1>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4" data-testid="cash-in"><div className="text-xs uppercase tracking-wider text-slate-500">Total Cash In</div><div className="font-mono text-2xl font-extrabold text-emerald-600">{money(summary.cash_in)}</div></Card>
        <Card className="p-4" data-testid="cash-out"><div className="text-xs uppercase tracking-wider text-slate-500">Total Paid Out</div><div className="font-mono text-2xl font-extrabold text-red-600">{money(summary.paid_out)}</div></Card>
        <Card className="p-4" data-testid="cash-net"><div className="text-xs uppercase tracking-wider text-slate-500">Net Cash</div><div className="font-mono text-2xl font-extrabold text-[#CC0000]">{money(summary.net_cash)}</div></Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Payouts */}
        <Card className="p-5">
          <h2 className="mb-3 font-display text-lg font-bold">Cash Payouts</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Recipient</Label><Input data-testid="payout-recipient" value={payout.recipient} onChange={(e) => setPayout({ ...payout, recipient: e.target.value })} className="mt-1" /></div>
            <div><Label>Amount</Label><Input data-testid="payout-amount" type="number" value={payout.amount} onChange={(e) => setPayout({ ...payout, amount: e.target.value })} className="mt-1" /></div>
            <div className="col-span-2"><Label>Reason</Label><Input data-testid="payout-reason" value={payout.reason} onChange={(e) => setPayout({ ...payout, reason: e.target.value })} className="mt-1" /></div>
            <div><Label>Date</Label><Input data-testid="payout-date" type="date" value={payout.date} onChange={(e) => setPayout({ ...payout, date: e.target.value })} className="mt-1" /></div>
            <div className="flex items-end"><Button onClick={addPayout} className="w-full bg-[#CC0000] hover:bg-[#A30000]" data-testid="payout-add"><Plus className="mr-1 h-4 w-4" /> Record</Button></div>
          </div>
          <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
            {payouts.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <div><span className="font-semibold">{p.recipient}</span> <span className="text-slate-400">· {p.reason}</span><div className="text-xs text-slate-400">{fmtDate(p.date)}</div></div>
                <span className="font-mono font-bold text-red-600">{money(p.amount)}</span>
              </div>
            ))}
            {payouts.length === 0 && <div className="py-6 text-center text-sm text-slate-400">No payouts recorded.</div>}
          </div>
        </Card>

        {/* Manual Log */}
        <Card className="p-5">
          <h2 className="mb-3 font-display text-lg font-bold">Manual Log</h2>
          <div className="space-y-3">
            <div className="flex gap-3">
              <div><Label>Date</Label><Input data-testid="log-date" type="date" value={log.date} onChange={(e) => setLog({ ...log, date: e.target.value })} className="mt-1" /></div>
              <div className="flex-1"><Label>Entry</Label><Textarea data-testid="log-text" value={log.text} onChange={(e) => setLog({ ...log, text: e.target.value })} className="mt-1" rows={2} /></div>
            </div>
            <Button onClick={addLog} variant="outline" className="w-full" data-testid="log-add"><Plus className="mr-1 h-4 w-4" /> Add Entry</Button>
          </div>
          <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
            {logs.map((l) => (
              <div key={l.id} className="rounded-lg border border-slate-100 p-3 text-sm" data-testid={`log-card-${l.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-slate-500">{fmtDate(l.date)} · {l.created_by}</div>
                    <div className="mt-0.5 whitespace-pre-wrap">{l.text}</div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => { setEditLog({ ...l }); setPin(""); }} data-testid={`log-edit-${l.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => { setDelLog(l); setPin(""); }} data-testid={`log-delete-${l.id}`}><Trash2 className="h-3.5 w-3.5 text-red-600" /></Button>
                  </div>
                </div>
              </div>
            ))}
            {logs.length === 0 && <div className="py-6 text-center text-sm text-slate-400">No log entries.</div>}
          </div>
        </Card>
      </div>

      {/* Edit log dialog */}
      <Dialog open={!!editLog} onOpenChange={(v) => !v && setEditLog(null)}>
        <DialogContent data-testid="log-edit-dialog">
          <DialogHeader><DialogTitle>Edit Log Entry</DialogTitle></DialogHeader>
          {editLog && (
            <div className="space-y-3">
              <div><Label>Date</Label><Input type="date" value={editLog.date} onChange={(e) => setEditLog({ ...editLog, date: e.target.value })} className="mt-1" /></div>
              <div><Label>Entry</Label><Textarea value={editLog.text} onChange={(e) => setEditLog({ ...editLog, text: e.target.value })} className="mt-1" rows={3} /></div>
              <div><Label>Admin PIN</Label><Input data-testid="log-edit-pin" type="password" value={pin} onChange={(e) => setPin(e.target.value)} className="mt-1" placeholder="Required to edit" /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditLog(null)}>Cancel</Button>
            <Button onClick={saveEdit} className="bg-[#CC0000] hover:bg-[#A30000]" data-testid="log-edit-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete log dialog */}
      <Dialog open={!!delLog} onOpenChange={(v) => !v && setDelLog(null)}>
        <DialogContent data-testid="log-delete-dialog">
          <DialogHeader><DialogTitle>Delete Log Entry</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500">Enter the Admin PIN to confirm deletion. This is recorded in the audit trail.</p>
          <div><Label>Admin PIN</Label><Input data-testid="log-delete-pin" type="password" value={pin} onChange={(e) => setPin(e.target.value)} className="mt-1" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelLog(null)}>Cancel</Button>
            <Button onClick={confirmDelete} className="bg-red-600 hover:bg-red-700" data-testid="log-delete-confirm">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
