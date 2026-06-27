import React, { useEffect, useState } from "react";
import { Lock, Plus, Pencil, Trash2, Loader2, X } from "lucide-react";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { Textarea } from "../components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { toast } from "sonner";
import { api, apiError } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { StatusBadge, Pill } from "../components/StatusBadge";
import { useAuth } from "../lib/auth";

/* ---------- PIN GATE ---------- */
function PinGate({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit() {
    setLoading(true); setErr("");
    try { await api.post("/admin/verify-pin", { pin }); onUnlock(); }
    catch (e) { setErr(apiError(e)); }
    finally { setLoading(false); }
  }
  return (
    <Dialog open>
      <DialogContent className="max-w-sm" data-testid="pin-gate" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-50"><Lock className="h-6 w-6 text-[#CC0000]" /></div>
          <DialogTitle className="text-center font-display">Admin Settings Locked</DialogTitle>
        </DialogHeader>
        <p className="text-center text-sm text-slate-500">Enter the 4–6 digit Admin PIN to continue.</p>
        <Input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
          className="h-12 text-center text-2xl font-mono tracking-[0.5em]" maxLength={6} data-testid="pin-input" autoFocus />
        {err && <div className="text-center text-sm font-medium text-red-600" data-testid="pin-error">{err}</div>}
        <Button onClick={submit} disabled={loading} className="h-11 bg-[#CC0000] hover:bg-[#A30000]" data-testid="pin-submit">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Unlock"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- ROOMS ---------- */
function RoomManagement() {
  const [rooms, setRooms] = useState([]);
  const [types, setTypes] = useState([]);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({ number: "", type: "", floor: "", notes: "" });
  async function load() {
    const [r, t] = await Promise.all([api.get("/hotel/rooms"), api.get("/hotel/room-types")]);
    setRooms(r.data); setTypes(t.data);
  }
  useEffect(() => { load(); }, []);
  function openNew() { setEdit("new"); setForm({ number: "", type: types[0] || "", floor: "", notes: "" }); }
  function openEdit(r) { setEdit(r.id); setForm({ number: r.number, type: r.type, floor: r.floor || "", notes: r.notes || "" }); }
  async function save() {
    try {
      if (edit === "new") await api.post("/hotel/rooms", form);
      else await api.put(`/hotel/rooms/${edit}`, form);
      toast.success("Saved"); setEdit(null); load();
    } catch (e) { toast.error(apiError(e)); }
  }
  async function del(id) { try { await api.delete(`/hotel/rooms/${id}`); toast.success("Deleted"); load(); } catch (e) { toast.error(apiError(e)); } }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between"><h3 className="font-display font-bold">Room Management</h3>
        <Button onClick={openNew} size="sm" className="bg-[#CC0000] hover:bg-[#A30000]" data-testid="add-room-btn"><Plus className="mr-1 h-4 w-4" /> Add Room</Button></div>
      <Table>
        <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Type</TableHead><TableHead>Floor</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {rooms.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-mono font-bold">{r.number}</TableCell><TableCell>{r.type}</TableCell><TableCell>{r.floor || "—"}</TableCell>
              <TableCell><StatusBadge status={r.status} /></TableCell>
              <TableCell className="text-right">
                <Button size="icon" variant="ghost" onClick={() => openEdit(r)} data-testid={`edit-room-${r.number}`}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => del(r.id)} data-testid={`delete-room-${r.number}`}><Trash2 className="h-4 w-4 text-red-600" /></Button>
              </TableCell>
            </TableRow>
          ))}
          {rooms.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-slate-400">No rooms. Add your first room.</TableCell></TableRow>}
        </TableBody>
      </Table>

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent data-testid="room-dialog">
          <DialogHeader><DialogTitle>{edit === "new" ? "Add Room" : "Edit Room"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Room Number</Label><Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} className="mt-1" data-testid="room-number" /></div>
            <div><Label>Room Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="mt-1" data-testid="room-type"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Floor (optional)</Label><Input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} className="mt-1" /></div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save} className="bg-[#CC0000] hover:bg-[#A30000]" data-testid="room-save">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------- BAR INVENTORY ---------- */
function InventorySetup() {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ categories: [], units: [] });
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({ name: "", category: "", unit: "", par_level: "", cost_per_unit: "", notes: "", active: true });
  async function load() {
    const [it, m] = await Promise.all([api.get("/bar/items"), api.get("/bar/meta")]);
    setItems(it.data); setMeta(m.data);
  }
  useEffect(() => { load(); }, []);
  function openNew() { setEdit("new"); setForm({ name: "", category: meta.categories[0], unit: meta.units[0], par_level: "", cost_per_unit: "", notes: "", active: true }); }
  function openEdit(i) { setEdit(i.id); setForm({ name: i.name, category: i.category, unit: i.unit, par_level: i.par_level, cost_per_unit: i.cost_per_unit ?? "", notes: i.notes || "", active: i.active }); }
  async function save() {
    const payload = { ...form, par_level: Number(form.par_level || 0), cost_per_unit: form.cost_per_unit === "" ? null : Number(form.cost_per_unit) };
    try { if (edit === "new") await api.post("/bar/items", payload); else await api.put(`/bar/items/${edit}`, payload);
      toast.success("Saved"); setEdit(null); load(); } catch (e) { toast.error(apiError(e)); }
  }
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between"><h3 className="font-display font-bold">Bar Inventory Setup</h3>
        <Button onClick={openNew} size="sm" className="bg-[#CC0000] hover:bg-[#A30000]" data-testid="add-item-btn"><Plus className="mr-1 h-4 w-4" /> Add Item</Button></div>
      <Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Unit</TableHead><TableHead>Par</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {items.map((i) => (
            <TableRow key={i.id} className={!i.active ? "opacity-50" : ""}>
              <TableCell className="font-semibold">{i.name}</TableCell><TableCell>{i.category}</TableCell><TableCell>{i.unit}</TableCell>
              <TableCell className="font-mono">{i.par_level}</TableCell><TableCell>{i.active ? <Pill color="green">Active</Pill> : <Pill color="slate">Inactive</Pill>}</TableCell>
              <TableCell className="text-right"><Button size="icon" variant="ghost" onClick={() => openEdit(i)} data-testid={`edit-item-${i.id}`}><Pencil className="h-4 w-4" /></Button></TableCell>
            </TableRow>
          ))}
          {items.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-slate-400">No items. Add your first inventory item.</TableCell></TableRow>}
        </TableBody>
      </Table>
      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent data-testid="item-dialog">
          <DialogHeader><DialogTitle>{edit === "new" ? "Add Item" : "Edit Item"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Item Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" data-testid="item-name" /></div>
            <div><Label>Category</Label><Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger className="mt-1" data-testid="item-category"><SelectValue /></SelectTrigger><SelectContent>{meta.categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Unit</Label><Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}><SelectTrigger className="mt-1" data-testid="item-unit"><SelectValue /></SelectTrigger><SelectContent>{meta.units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Par Level</Label><Input type="number" value={form.par_level} onChange={(e) => setForm({ ...form, par_level: e.target.value })} className="mt-1" data-testid="item-par" /></div>
            <div><Label>Cost / Unit (optional)</Label><Input type="number" value={form.cost_per_unit} onChange={(e) => setForm({ ...form, cost_per_unit: e.target.value })} className="mt-1" /></div>
            <div className="col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" /></div>
            <div className="col-span-2 flex items-center gap-2"><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} data-testid="item-active" /><Label>Active</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save} className="bg-[#CC0000] hover:bg-[#A30000]" data-testid="item-save">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------- USERS ---------- */
const ROLES = ["admin", "manager", "front_desk", "bar_staff", "owner"];
function UserManagement() {
  const [users, setUsers] = useState([]);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "front_desk", active: true });
  async function load() { const { data } = await api.get("/admin/users"); setUsers(data); }
  useEffect(() => { load(); }, []);
  function openNew() { setEdit("new"); setForm({ name: "", email: "", password: "", role: "front_desk", active: true }); }
  function openEdit(u) { setEdit(u.id); setForm({ name: u.name, email: u.email, password: "", role: u.role, active: u.active }); }
  async function save() {
    try { if (edit === "new") await api.post("/admin/users", form); else await api.put(`/admin/users/${edit}`, form);
      toast.success("Saved"); setEdit(null); load(); } catch (e) { toast.error(apiError(e)); }
  }
  async function del(id) { try { await api.delete(`/admin/users/${id}`); toast.success("Removed"); load(); } catch (e) { toast.error(apiError(e)); } }
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between"><h3 className="font-display font-bold">User Management</h3>
        <Button onClick={openNew} size="sm" className="bg-[#CC0000] hover:bg-[#A30000]" data-testid="add-user-btn"><Plus className="mr-1 h-4 w-4" /> Add User</Button></div>
      <Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}><TableCell className="font-semibold">{u.name}</TableCell><TableCell>{u.email}</TableCell>
              <TableCell><Pill color={u.role === "owner" ? "yellow" : "blue"}>{u.role.replace("_", " ")}</Pill></TableCell>
              <TableCell>{u.active ? <Pill color="green">Active</Pill> : <Pill color="red">Off</Pill>}</TableCell>
              <TableCell className="text-right">
                <Button size="icon" variant="ghost" onClick={() => openEdit(u)} data-testid={`edit-user-${u.id}`}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => del(u.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent data-testid="user-dialog">
          <DialogHeader><DialogTitle>{edit === "new" ? "Add User" : "Edit User"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" data-testid="user-name" /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" data-testid="user-email" /></div>
            <div><Label>Password {edit !== "new" && <span className="text-xs text-slate-400">(leave blank to keep)</span>}</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1" data-testid="user-password" /></div>
            <div><Label>Role</Label><Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}><SelectTrigger className="mt-1" data-testid="user-role"><SelectValue /></SelectTrigger><SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r.replace("_", " ")}</SelectItem>)}</SelectContent></Select>
              {form.role === "owner" && <p className="mt-1 text-xs text-amber-600">Owner accounts can only use the Owner app and are read-only.</p>}</div>
            <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /><Label>Active</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save} className="bg-[#CC0000] hover:bg-[#A30000]" data-testid="user-save">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------- SETTINGS (emails + notifications + pin) ---------- */
function GeneralSettings() {
  const [s, setS] = useState(null);
  const [newEmail, setNewEmail] = useState("");
  const [pinForm, setPinForm] = useState({ current_pin: "", new_pin: "" });
  async function load() { const { data } = await api.get("/admin/settings"); setS(data); }
  useEffect(() => { load(); }, []);
  async function save(patch) { const { data } = await api.put("/admin/settings", patch); setS(data); toast.success("Saved"); }
  function addEmail() { if (!newEmail) return; save({ report_emails: [...(s.report_emails || []), newEmail] }); setNewEmail(""); }
  function removeEmail(e) { save({ report_emails: s.report_emails.filter((x) => x !== e) }); }
  function toggleNotif(k, v) { save({ owner_notifications: { ...s.owner_notifications, [k]: v } }); }
  async function changePin() {
    try { await api.post("/admin/change-pin", pinForm); toast.success("PIN changed"); setPinForm({ current_pin: "", new_pin: "" }); }
    catch (e) { toast.error(apiError(e)); }
  }
  if (!s) return null;
  const notifLabels = { no_bar_entry: "No bar entry by set time", cash_discrepancy: "Cash discrepancy detected", below_par: "Item below par", low_occupancy: "Low occupancy", refund_issued: "Refund issued", daily_summary: "Daily revenue summary" };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <h3 className="mb-3 font-display font-bold">Report Email List</h3>
        <div className="flex gap-2"><Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@example.com" data-testid="email-input" /><Button onClick={addEmail} className="bg-[#CC0000] hover:bg-[#A30000]" data-testid="email-add">Add</Button></div>
        <div className="mt-3 space-y-2">
          {(s.report_emails || []).map((e) => (
            <div key={e} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{e}</span><Button size="icon" variant="ghost" onClick={() => removeEmail(e)}><X className="h-4 w-4" /></Button></div>
          ))}
          {(!s.report_emails || s.report_emails.length === 0) && <div className="py-4 text-center text-sm text-slate-400">No emails configured.</div>}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 font-display font-bold">Owner App Notifications</h3>
        <div className="space-y-2">
          {Object.entries(notifLabels).map(([k, label]) => (
            <div key={k} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-sm">{label}</span>
              <Switch checked={s.owner_notifications?.[k]} onCheckedChange={(v) => toggleNotif(k, v)} data-testid={`notif-${k}`} />
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Daily summary time</Label><Input type="time" defaultValue={s.daily_summary_time} onBlur={(e) => save({ daily_summary_time: e.target.value })} className="mt-1" /></div>
          <div><Label className="text-xs">Missing entry alert</Label><Input type="time" defaultValue={s.missing_entry_time} onBlur={(e) => save({ missing_entry_time: e.target.value })} className="mt-1" /></div>
          <div><Label className="text-xs">Low occupancy %</Label><Input type="number" defaultValue={s.occupancy_threshold} onBlur={(e) => save({ occupancy_threshold: Number(e.target.value) })} className="mt-1" /></div>
        </div>
      </Card>

      <Card className="p-5 lg:col-span-2">
        <h3 className="mb-3 font-display font-bold">Admin PIN Management</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div><Label>Current PIN</Label><Input type="password" value={pinForm.current_pin} onChange={(e) => setPinForm({ ...pinForm, current_pin: e.target.value })} className="mt-1 w-40" data-testid="current-pin" /></div>
          <div><Label>New PIN (4–6 digits)</Label><Input type="password" value={pinForm.new_pin} onChange={(e) => setPinForm({ ...pinForm, new_pin: e.target.value })} className="mt-1 w-40" data-testid="new-pin" /></div>
          <Button onClick={changePin} className="bg-[#CC0000] hover:bg-[#A30000]" data-testid="change-pin-btn">Change PIN</Button>
        </div>
      </Card>
    </div>
  );
}

/* ---------- AUDIT ---------- */
function AuditLogs() {
  const [logs, setLogs] = useState([]);
  useEffect(() => { api.get("/admin/audit-logs").then((r) => setLogs(r.data)); }, []);
  return (
    <Card className="p-5">
      <h3 className="mb-3 font-display font-bold">Edit Logs Viewer</h3>
      <div className="space-y-2">
        {logs.map((l) => (
          <div key={l.id} className="rounded-lg border border-slate-100 p-3 text-sm">
            <div className="flex items-center justify-between"><Pill color="blue">{l.kind.replace("_", " ")}</Pill><span className="text-xs text-slate-400">{fmtDateTime(l.timestamp)} · {l.user_name}</span></div>
            <div className="mt-1 text-xs text-slate-500">Reason: {l.reason}</div>
            <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded bg-red-50 p-2"><b>Before:</b> {JSON.stringify(l.original_content)}</div>
              <div className="rounded bg-emerald-50 p-2"><b>After:</b> {JSON.stringify(l.new_content)}</div>
            </div>
          </div>
        ))}
        {logs.length === 0 && <div className="py-8 text-center text-sm text-slate-400">No edits recorded yet.</div>}
      </div>
    </Card>
  );
}

export default function AdminSettings() {
  const { user } = useAuth();
  const [unlocked, setUnlocked] = useState(false);
  if (user.role === "manager") {
    // Managers cannot access Admin Settings per spec
    return <Card className="p-10 text-center text-slate-500">Admin Settings is restricted to Administrators.</Card>;
  }
  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />;
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Admin Settings</h1>
      <Tabs defaultValue="rooms">
        <TabsList className="flex-wrap" data-testid="admin-tabs">
          <TabsTrigger value="rooms">Rooms</TabsTrigger>
          <TabsTrigger value="inventory">Bar Inventory</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="general">Emails & Notifications</TabsTrigger>
          <TabsTrigger value="audit">Edit Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="rooms" className="mt-4"><RoomManagement /></TabsContent>
        <TabsContent value="inventory" className="mt-4"><InventorySetup /></TabsContent>
        <TabsContent value="users" className="mt-4"><UserManagement /></TabsContent>
        <TabsContent value="general" className="mt-4"><GeneralSettings /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditLogs /></TabsContent>
      </Tabs>
    </div>
  );
}
