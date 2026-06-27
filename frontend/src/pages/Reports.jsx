import React, { useEffect, useState } from "react";
import { Printer, Mail } from "lucide-react";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { toast } from "sonner";
import { api, apiError } from "../lib/api";
import { money, fmtDate, todayStr } from "../lib/format";
import { Pill } from "../components/StatusBadge";

const Row = ({ label, value, accent }) => (
  <div className="flex items-center justify-between border-b border-slate-100 py-2 text-sm">
    <span className="text-slate-600">{label}</span>
    <span className={`font-mono font-bold ${accent || ""}`}>{value}</span>
  </div>
);

function HotelReport({ period, date, month }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    const url = `/reports/hotel/${period}`;
    const params = period === "monthly" ? { month } : { date };
    api.get(url, { params }).then((r) => setData(r.data)).catch(() => setData(null));
  }, [period, date, month]);
  if (!data) return <div className="py-10 text-center text-sm text-slate-400">Loading report…</div>;
  // guard against stale data shape during period switch
  if (period === "daily" && !("items" in data)) return null;
  if (period === "weekly" && !("daily" in data)) return null;
  if (period === "monthly" && !("weeks" in data)) return null;

  if (period === "daily") {
    const i = data.items;
    return (
      <div className="space-y-4">
        <Card className="p-5">
          <h3 className="mb-2 font-display font-bold">Daily Hotel Report — {fmtDate(data.date)}</h3>
          <Row label="Total Cash Sales" value={money(data.cash_sales)} />
          <Row label="Total Interac & Cheque Sales" value={money(data.interac_cheque_sales)} />
          <Row label="Total Card Sales" value={money(data.card_sales)} />
          <Row label="Total Tax Collected (9%)" value={money(data.tax_collected)} accent="text-amber-700" />
          <Row label="Total Cash Paid Out" value={money(data.cash_paid_out)} accent="text-red-600" />
          <Row label="Net Cash" value={money(data.net_cash)} />
          <Row label="Total Refunds Issued" value={money(data.refunds_total)} accent="text-red-600" />
          <Row label="Total Sales (All Methods)" value={money(data.total_sales)} accent="text-[#CC0000] text-lg" />
        </Card>
        <Card className="p-5">
          <h4 className="mb-2 font-semibold">Itemized Activity</h4>
          {["checkins", "extensions", "payouts", "refunds"].map((k) => (
            i[k]?.length > 0 && (
              <div key={k} className="mb-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">{k}</div>
                {i[k].map((x, idx) => (
                  <div key={idx} className="flex justify-between py-1 text-sm">
                    <span>{x.guest || x.recipient || x.reservation_id || "—"} {x.room ? `· Rm ${x.room}` : ""} {x.reason ? `· ${x.reason}` : ""}</span>
                    <span className="font-mono">{money(x.amount ?? x.total)} {x.method ? `(${x.method})` : ""}</span>
                  </div>
                ))}
              </div>
            )
          ))}
          {Object.values(i).every((a) => !a.length) && <div className="py-4 text-center text-sm text-slate-400">No activity for this date.</div>}
        </Card>
      </div>
    );
  }
  if (period === "weekly") {
    return (
      <div className="space-y-4">
        <Card className="p-5">
          <h3 className="mb-2 font-display font-bold">Weekly Hotel Report</h3>
          <Table>
            <TableHeader><TableRow><TableHead>Day</TableHead><TableHead>Cash</TableHead><TableHead>Interac/Cheque</TableHead><TableHead>Card</TableHead><TableHead>Total</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.daily.map((d) => (
                <TableRow key={d.date}><TableCell>{fmtDate(d.date)}</TableCell>
                  <TableCell className="font-mono">{money(d.cash_sales)}</TableCell>
                  <TableCell className="font-mono">{money(d.interac_cheque_sales)}</TableCell>
                  <TableCell className="font-mono">{money(d.card_sales)}</TableCell>
                  <TableCell className="font-mono font-bold">{money(d.total_sales)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-4"><h4 className="mb-2 text-sm font-bold">By Payment Method</h4>{Object.entries(data.by_method).map(([k, v]) => <Row key={k} label={k} value={money(v)} />)}</Card>
          <Card className="p-4"><h4 className="mb-2 text-sm font-bold">By Room Type</h4>{Object.entries(data.by_room_type).map(([k, v]) => <Row key={k} label={k} value={money(v)} />)}{!Object.keys(data.by_room_type).length && <div className="text-sm text-slate-400">No data</div>}</Card>
          <Card className="p-4"><h4 className="mb-2 text-sm font-bold">Summary</h4><Row label="Stays in week" value={data.stays_in_week} /><Row label="Refunds" value={money(data.refunds_total)} accent="text-red-600" /></Card>
        </div>
      </div>
    );
  }
  // monthly
  return (
    <div className="space-y-4">
      <Card className="p-5"><h3 className="mb-2 font-display font-bold">Monthly Hotel Report — {data.month}</h3>
        {Object.entries(data.weeks).map(([k, v]) => <Row key={k} label={k} value={money(v)} />)}
        <Row label="Total Sales" value={money(data.total_sales)} accent="text-[#CC0000] text-lg" />
        <Row label="Tax Collected" value={money(data.tax_collected)} accent="text-amber-700" />
        <Row label="Refunds" value={money(data.refunds_total)} accent="text-red-600" />
        <Row label="Stays in month" value={data.stays_in_month} />
      </Card>
      <Card className="p-4"><h4 className="mb-2 text-sm font-bold">By Room Type</h4>{Object.entries(data.by_room_type).map(([k, v]) => <Row key={k} label={k} value={money(v)} />)}{!Object.keys(data.by_room_type).length && <div className="text-sm text-slate-400">No data</div>}</Card>
    </div>
  );
}

function BarReport({ period, date, month }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    const params = period === "monthly" ? { month } : { date };
    api.get(`/reports/bar/${period}`, { params }).then((r) => setData(r.data)).catch(() => setData(null));
  }, [period, date, month]);
  if (!data) return <div className="py-10 text-center text-sm text-slate-400">Loading report…</div>;
  // guard against stale data shape during period switch
  if (period === "daily" && !("submitted" in data)) return null;
  if (period === "weekly" && !("daily" in data)) return null;
  if (period === "monthly" && !("weeks" in data)) return null;

  if (period === "daily") {
    if (!data.submitted) return <Card className="p-8 text-center text-slate-400" data-testid="bar-no-entry">No entry was submitted for {fmtDate(data.date)}. A late entry can be added from the Bar module.</Card>;
    return (
      <div className="space-y-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold">Bar Report — {fmtDate(data.date)}</h3>
            <div className="flex gap-2">{data.late_entry && <Pill color="yellow">Late Entry</Pill>}<span className="text-xs text-slate-400">By {data.submitted_by}</span></div>
          </div>
        </Card>
        <Card className="p-5">
          <h4 className="mb-2 font-semibold">Inventory Summary</h4>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Cat</TableHead><TableHead>Open</TableHead><TableHead>Recv</TableHead><TableHead>Close</TableHead><TableHead>Used</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.items.map((it) => (
                  <TableRow key={it.item_id} className={it.below_par ? "bg-red-50" : it.variance ? "bg-amber-50" : ""}>
                    <TableCell className="font-semibold">{it.name}</TableCell><TableCell>{it.category}</TableCell>
                    <TableCell className="font-mono">{it.opening}</TableCell><TableCell className="font-mono">{it.received}</TableCell>
                    <TableCell className="font-mono">{it.closing}</TableCell><TableCell className="font-mono font-bold">{it.used}</TableCell>
                    <TableCell className="text-xs">{it.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-5"><h4 className="mb-2 font-semibold">Sales Summary</h4>
            <Row label="Total Cash Sales" value={money(data.cash_sales)} accent={data.cash_sales < 0 ? "text-red-600" : ""} />
            {data.cash_sales < 0 && <div className="text-xs font-semibold text-red-600">Negative — Tips Owed to Staff</div>}
            <Row label="Total Card Sales" value={money(data.card_sales)} />
            <Row label="Total Sales (All Methods)" value={money(data.total_sales)} accent="text-amber-600 text-lg" />
          </Card>
          <Card className="p-5"><h4 className="mb-2 font-semibold">Cash Reconciliation</h4>
            <Row label="Float" value={money(data.float_start)} />
            <Row label="Cash Sales" value={money(data.cash_sales)} />
            <Row label="Cash Paid Out" value={money(data.cash_paid_out_total)} />
            <Row label="Expected Cash" value={money(data.expected_cash)} />
            <Row label="Actual Cash" value={money(data.actual_cash)} />
            <Row label="Over / Short" value={data.over_short === 0 ? "Balanced" : money(data.over_short)} accent={data.over_short === 0 ? "text-emerald-600" : "text-red-600"} />
          </Card>
        </div>
        {data.notes && <Card className="p-5"><h4 className="mb-1 font-semibold">Staff Notes</h4><p className="text-sm text-slate-600">{data.notes}</p></Card>}
      </div>
    );
  }
  if (period === "weekly") {
    return (
      <div className="space-y-4">
        <Card className="p-5"><h3 className="mb-2 font-display font-bold">Weekly Bar Report</h3>
          <Table>
            <TableHeader><TableRow><TableHead>Day</TableHead><TableHead>Cash</TableHead><TableHead>Card</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.daily.map((d) => (
                <TableRow key={d.date}><TableCell>{fmtDate(d.date)}</TableCell>
                  <TableCell className={`font-mono ${d.cash_sales < 0 ? "text-red-600" : ""}`}>{d.submitted ? money(d.cash_sales) : "—"}</TableCell>
                  <TableCell className="font-mono">{d.submitted ? money(d.card_sales) : "—"}</TableCell>
                  <TableCell className="font-mono font-bold">{d.submitted ? money(d.total_sales) : "—"}</TableCell>
                  <TableCell>{d.submitted ? <Pill color="green">OK</Pill> : <Pill color="red">Missing</Pill>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-3 flex gap-6 text-sm"><span>Tips Owed: <b className="font-mono text-red-600">{money(data.tips_owed)}</b></span><span>Total: <b className="font-mono">{money(data.totals.total)}</b></span></div>
        </Card>
      </div>
    );
  }
  return (
    <Card className="p-5"><h3 className="mb-2 font-display font-bold">Monthly Bar Report — {data.month}</h3>
      {Object.entries(data.weeks).map(([k, v]) => <Row key={k} label={k} value={money(v)} />)}
      <Row label="Total Cash Sales" value={money(data.cash_total)} accent={data.cash_total < 0 ? "text-red-600" : ""} />
      <Row label="Total Card Sales" value={money(data.card_total)} />
      <Row label="Total Sales (All Methods)" value={money(data.total_total)} accent="text-amber-600 text-lg" />
      <Row label="Running Over/Short" value={money(data.over_short_total)} accent={data.over_short_total === 0 ? "text-emerald-600" : "text-red-600"} />
      {data.missing_days?.length > 0 && <div className="mt-2 text-sm text-red-600">Missing entries: {data.missing_days.map(fmtDate).join(", ")}</div>}
    </Card>
  );
}

function SideBySide({ period, date, month }) {
  const [hotel, setHotel] = useState(null);
  const [bar, setBar] = useState(null);
  useEffect(() => {
    setHotel(null); setBar(null);
    const params = period === "monthly" ? { month } : { date };
    api.get(`/reports/hotel/${period}`, { params }).then((r) => setHotel(r.data));
    api.get(`/reports/bar/${period}`, { params }).then((r) => setBar(r.data));
  }, [period, date, month]);
  const hotelTotal = hotel ? (hotel.total_sales ?? Object.values(hotel.by_method || {}).reduce((a, b) => a + b, 0)) : 0;
  const barTotal = bar ? (period === "daily" ? (bar.submitted ? bar.total_sales : 0) : period === "weekly" ? bar.totals?.total : bar.total_total) : 0;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="p-6" data-testid="sbs-hotel">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Hotel Revenue</div>
        <div className="mt-1 font-mono text-3xl font-extrabold text-[#CC0000]">{money(hotelTotal)}</div>
        <p className="mt-2 text-xs text-slate-400">Super 8 by Wyndham</p>
      </Card>
      <Card className="p-6" data-testid="sbs-bar">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Bar Revenue</div>
        <div className="mt-1 font-mono text-3xl font-extrabold text-amber-600">{money(barTotal)}</div>
        <p className="mt-2 text-xs text-slate-400">50th North Pub &amp; Eatery</p>
      </Card>
      <div className="col-span-full text-center text-xs text-slate-400">Hotel and bar revenue are reported separately and never combined.</div>
    </div>
  );
}

export default function Reports() {
  const [surface, setSurface] = useState("hotel");
  const [period, setPeriod] = useState("daily");
  const [date, setDate] = useState(todayStr());
  const [month, setMonth] = useState(todayStr().slice(0, 7));

  async function emailReport() {
    try {
      const { data } = await api.post("/reports/email", { report_type: `${surface}-${period}`, period: period === "monthly" ? month : date });
      data.ok ? toast.success(data.message) : toast.warning(data.message);
    } catch (e) { toast.error(apiError(e)); }
  }

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Reports</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()} data-testid="report-print"><Printer className="mr-1.5 h-4 w-4" /> Print</Button>
          <Button variant="outline" onClick={emailReport} data-testid="report-email"><Mail className="mr-1.5 h-4 w-4" /> Email</Button>
        </div>
      </div>

      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Tabs value={surface} onValueChange={setSurface}>
          <TabsList data-testid="report-surface-tabs">
            <TabsTrigger value="hotel">Hotel</TabsTrigger>
            <TabsTrigger value="bar">Bar</TabsTrigger>
            <TabsTrigger value="side">Side-by-Side</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Tabs value={period} onValueChange={setPeriod}>
            <TabsList data-testid="report-period-tabs">
              <TabsTrigger value="daily">Daily</TabsTrigger>
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
            </TabsList>
          </Tabs>
          {period === "monthly" ? (
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-auto" data-testid="report-month" />
          ) : (
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" data-testid="report-date" />
          )}
        </div>
      </div>

      <div className="print-area">
        <div className="mb-4 hidden items-center gap-3 print:flex">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#CC0000]"><span className="font-display text-lg font-extrabold text-[#FFD700]">S8</span></div>
          <div><div className="font-display text-lg font-bold">Super 8 by Wyndham</div><div className="text-xs text-slate-500">50th North Pub &amp; Eatery · {period} report</div></div>
        </div>
        {surface === "hotel" && <HotelReport period={period} date={date} month={month} />}
        {surface === "bar" && <BarReport period={period} date={date} month={month} />}
        {surface === "side" && <SideBySide period={period} date={date} month={month} />}
      </div>
    </div>
  );
}
