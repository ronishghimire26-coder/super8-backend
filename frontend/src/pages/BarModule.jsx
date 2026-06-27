import React, { useEffect, useState } from "react";
import { Plus, X, Loader2, AlertTriangle, PackagePlus } from "lucide-react";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { toast } from "sonner";
import { api, apiError } from "../lib/api";
import { money, fmtDate, fmtDateTime, todayStr } from "../lib/format";
import { Pill } from "../components/StatusBadge";
import { useBarEntry } from "../lib/useBarEntry";

function TonightEntry() {
  const [date, setDate] = useState(todayStr());
  const e = useBarEntry(date);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const res = await e.submit();
    setSaving(false);
    if (res.ok) toast.success(res.offline ? "Saved offline — will sync" : "Entry submitted");
    else toast.error(res.error);
    setDate((d) => d); // trigger reload
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Label className="whitespace-nowrap">Entry Date</Label>
          <Input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} className="w-auto" data-testid="bar-entry-date" />
          {date < todayStr() && <Pill color="yellow">Late Entry</Pill>}
          {e.existing && <Pill color="green">Submitted{e.existing.edited ? " · edited" : ""}</Pill>}
        </div>
      </div>

      {e.loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#CC0000]" /></div>
      ) : (
        <>
          <Card className="p-0">
            <div className="border-b border-slate-100 px-5 py-3 font-display font-bold">Inventory Count</div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead><TableHead>Opening</TableHead><TableHead>Received</TableHead>
                    <TableHead>Closing</TableHead><TableHead>Used/Sold</TableHead><TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {e.computed.enriched.map((r) => (
                    <TableRow key={r.item_id} className={r.below_par ? "bg-red-50" : r.variance ? "bg-amber-50" : ""} data-testid={`bar-item-${r.item_id}`}>
                      <TableCell>
                        <div className="font-semibold">{r.name}</div>
                        <div className="text-xs text-slate-400">{r.category} · par {r.par_level} {r.unit}</div>
                      </TableCell>
                      <TableCell><Input type="number" value={r.opening} onChange={(ev) => e.setRow(r.item_id, { opening: ev.target.value })} className="h-9 w-20 font-mono" /></TableCell>
                      <TableCell><Input type="number" value={r.received} onChange={(ev) => e.setRow(r.item_id, { received: ev.target.value })} className="h-9 w-20 font-mono" /></TableCell>
                      <TableCell><Input type="number" value={r.closing} onChange={(ev) => e.setRow(r.item_id, { closing: ev.target.value })} className="h-9 w-20 font-mono" data-testid={`closing-${r.item_id}`} /></TableCell>
                      <TableCell><span className="font-mono font-bold">{r.used}</span> {r.variance && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-amber-500" />}</TableCell>
                      <TableCell><Input value={r.note} onChange={(ev) => e.setRow(r.item_id, { note: ev.target.value })} className="h-9" placeholder="optional" /></TableCell>
                    </TableRow>
                  ))}
                  {e.rows.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-slate-400">No active items. Add inventory in Admin Settings.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-3 font-display font-bold">Sales &amp; Revenue</h3>
              <div className="space-y-3">
                <div>
                  <Label>Total Cash Sales <span className="text-xs text-slate-400">(negative = tips owed)</span></Label>
                  <Input type="number" value={e.sales.cash_sales} onChange={(ev) => e.setSales({ ...e.sales, cash_sales: ev.target.value })} className="mt-1 font-mono" data-testid="bar-cash-sales" />
                </div>
                <div><Label>Total Card Sales</Label><Input type="number" value={e.sales.card_sales} onChange={(ev) => e.setSales({ ...e.sales, card_sales: ev.target.value })} className="mt-1 font-mono" data-testid="bar-card-sales" /></div>
                <div><Label>Total Sales (All Methods)</Label><Input type="number" value={e.sales.total_sales} onChange={(ev) => e.setSales({ ...e.sales, total_sales: ev.target.value })} className="mt-1 font-mono" data-testid="bar-total-sales" /></div>
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="mb-3 font-display font-bold">Cash Reconciliation</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Float at Start</Label><Input type="number" value={e.recon.float_start} onChange={(ev) => e.setRecon({ ...e.recon, float_start: ev.target.value })} className="mt-1 font-mono" data-testid="bar-float" /></div>
                <div><Label>Actual Cash Count</Label><Input type="number" value={e.recon.actual_cash} onChange={(ev) => e.setRecon({ ...e.recon, actual_cash: ev.target.value })} className="mt-1 font-mono" data-testid="bar-actual-cash" /></div>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between"><Label>Cash Paid Out</Label>
                  <Button size="sm" variant="ghost" onClick={() => e.setPaidOuts([...e.paidOuts, { recipient: "", reason: "", amount: "" }])} data-testid="bar-add-paidout"><Plus className="h-4 w-4" /></Button>
                </div>
                {e.paidOuts.map((p, i) => (
                  <div key={i} className="mt-1 flex gap-2">
                    <Input placeholder="Recipient" value={p.recipient} onChange={(ev) => { const c = [...e.paidOuts]; c[i].recipient = ev.target.value; e.setPaidOuts(c); }} className="h-9" />
                    <Input placeholder="Reason" value={p.reason} onChange={(ev) => { const c = [...e.paidOuts]; c[i].reason = ev.target.value; e.setPaidOuts(c); }} className="h-9" />
                    <Input placeholder="Amt" type="number" value={p.amount} onChange={(ev) => { const c = [...e.paidOuts]; c[i].amount = ev.target.value; e.setPaidOuts(c); }} className="h-9 w-20 font-mono" />
                    <Button size="icon" variant="ghost" onClick={() => e.setPaidOuts(e.paidOuts.filter((_, x) => x !== i))}><X className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                <div>Expected Cash: <b className="font-mono">{money(e.computed.expected)}</b></div>
                <div data-testid="bar-over-short">Over/Short:{" "}
                  <b className={`font-mono ${e.computed.overShort === 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {e.computed.overShort === 0 ? "Balanced" : money(e.computed.overShort)}
                  </b>
                </div>
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <Label>General Notes</Label>
            <Textarea value={e.notes} onChange={(ev) => e.setNotes(ev.target.value)} className="mt-1" rows={2} data-testid="bar-notes" />
            <Button onClick={submit} disabled={saving} className="mt-3 h-12 w-full bg-[#CC0000] text-base font-semibold hover:bg-[#A30000]" data-testid="bar-submit">
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : e.existing ? "Update Entry" : "Submit Entry"}
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}

function LiveInventory() {
  const [inv, setInv] = useState({ items: [], last_entry_date: null, last_entry_time: null });
  useEffect(() => { api.get("/bar/inventory").then((r) => setInv(r.data)); }, []);
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display font-bold">Live Inventory</h3>
        <span className="text-xs text-slate-400">Last entry: {inv.last_entry_date ? fmtDateTime(inv.last_entry_time) : "None"}</span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Category</TableHead><TableHead>Current</TableHead><TableHead>Par</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {inv.items.map((i) => (
              <TableRow key={i.id} className={i.below_par ? "bg-red-50" : ""}>
                <TableCell className="font-semibold">{i.name}</TableCell>
                <TableCell>{i.category}</TableCell>
                <TableCell className="font-mono font-bold">{i.current_stock} {i.unit}</TableCell>
                <TableCell className="font-mono">{i.par_level}</TableCell>
                <TableCell>{i.below_par ? <Pill color="red">Below Par</Pill> : <Pill color="green">OK</Pill>}</TableCell>
              </TableRow>
            ))}
            {inv.items.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-slate-400">No inventory items.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function Receiving() {
  const [items, setItems] = useState([]);
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ date: todayStr(), item_id: "", quantity: "", supplier: "", invoice_number: "" });
  async function load() {
    const [it, rc] = await Promise.all([api.get("/bar/items", { params: { active_only: true } }), api.get("/bar/receiving")]);
    setItems(it.data); setList(rc.data);
  }
  useEffect(() => { load(); }, []);
  async function add() {
    if (!form.item_id || !form.quantity) return toast.error("Item and quantity required");
    try { await api.post("/bar/receiving", { ...form, quantity: Number(form.quantity) });
      toast.success("Delivery logged"); setForm({ date: todayStr(), item_id: "", quantity: "", supplier: "", invoice_number: "" }); load(); }
    catch (e) { toast.error(apiError(e)); }
  }
  return (
    <Card className="p-5">
      <h3 className="mb-3 flex items-center gap-2 font-display font-bold"><PackagePlus className="h-4 w-4" /> Stock Receiving</h3>
      <div className="grid gap-3 sm:grid-cols-5">
        <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1" /></div>
        <div><Label>Item</Label>
          <Select value={form.item_id} onValueChange={(v) => setForm({ ...form, item_id: v })}>
            <SelectTrigger className="mt-1" data-testid="receiving-item"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>{items.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Quantity</Label><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="mt-1" data-testid="receiving-qty" /></div>
        <div><Label>Supplier</Label><Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className="mt-1" /></div>
        <div className="flex items-end"><Button onClick={add} className="w-full bg-[#CC0000] hover:bg-[#A30000]" data-testid="receiving-add">Log</Button></div>
      </div>
      <div className="mt-4 space-y-2">
        {list.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <div><b>{r.item_name}</b> × {r.quantity} <span className="text-slate-400">· {r.supplier || "—"}</span></div>
            <div className="text-xs text-slate-400">{fmtDate(r.date)} · {r.entered_by}</div>
          </div>
        ))}
        {list.length === 0 && <div className="py-6 text-center text-sm text-slate-400">No deliveries logged.</div>}
      </div>
    </Card>
  );
}

export default function BarModule() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Bar — 50th North Pub &amp; Eatery</h1>
        <p className="text-sm text-slate-500">Nightly entry, live inventory &amp; stock receiving</p>
      </div>
      <Tabs defaultValue="entry">
        <TabsList data-testid="bar-tabs">
          <TabsTrigger value="entry">Tonight's Entry</TabsTrigger>
          <TabsTrigger value="inventory">Live Inventory</TabsTrigger>
          <TabsTrigger value="receiving">Receiving</TabsTrigger>
        </TabsList>
        <TabsContent value="entry" className="mt-4"><TonightEntry /></TabsContent>
        <TabsContent value="inventory" className="mt-4"><LiveInventory /></TabsContent>
        <TabsContent value="receiving" className="mt-4"><Receiving /></TabsContent>
      </Tabs>
    </div>
  );
}
