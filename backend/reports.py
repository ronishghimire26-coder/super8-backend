from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import date, timedelta
from core import (
    db, clean, now_iso, today_str, add_days, get_current_user, require_write,
    add_audit, publish_event,
)

router = APIRouter(prefix="/api/reports", tags=["reports"])


def month_range(month: str):
    y, m = month.split("-")
    start = date(int(y), int(m), 1)
    if int(m) == 12:
        end = date(int(y) + 1, 1, 1)
    else:
        end = date(int(y), int(m) + 1, 1)
    return start.isoformat(), end.isoformat()


def week_dates(date_str: str):
    d = date.fromisoformat(date_str)
    monday = d - timedelta(days=d.weekday())
    return [(monday + timedelta(days=i)).isoformat() for i in range(7)]


# ---------------- HOTEL REPORTS ----------------
async def hotel_day_data(d: str):
    sales = {"Cash": 0, "Card": 0, "Interac": 0}
    tax = 0
    refunds_total = 0
    items = {"checkins": [], "extensions": [], "payouts": [], "refunds": []}
    async for p in db.payments.find({"date": d}):
        m = p.get("payment_method")
        amt = p.get("amount", 0)
        bucket = "Cash" if m == "Cash" else ("Card" if m == "Card" else "Interac")
        if p.get("kind") in ("reservation", "reservation_adjust", "extension"):
            sales[bucket] += amt
    # check-ins
    async for r in db.reservations.find({"check_in": d, "status": {"$ne": "cancelled"}}):
        tax += r.get("tax", 0)
        items["checkins"].append({"guest": r["guest_name"], "room": r.get("room_number"),
                                  "room_type": r.get("room_type"), "nights": r.get("nights"),
                                  "rate": r.get("nightly_rate"), "method": r.get("payment_method"),
                                  "amount": r.get("amount_paid", 0), "total": r.get("total_after_tax", 0)})
    async for e in db.extensions.find({"date": d}):
        tax += e.get("tax", 0)
        items["extensions"].append({"reservation_id": e["reservation_id"], "nights": e["additional_nights"],
                                    "rate": e["nightly_rate"], "method": e["payment_method"],
                                    "amount": e["amount_paid"], "total": e["total_after_tax"]})
    async for p in db.payouts.find({"date": d}):
        items["payouts"].append({"recipient": p["recipient"], "amount": p["amount"], "reason": p["reason"]})
    async for rf in db.refunds.find({"date": d}):
        refunds_total += rf.get("amount", 0)
        items["refunds"].append({"guest": rf.get("guest_name"), "amount": rf["amount"], "reason": rf.get("reason")})
    cash_paid_out = sum(p["amount"] for p in items["payouts"])
    total_sales = round(sales["Cash"] + sales["Card"] + sales["Interac"], 2)
    return {
        "date": d,
        "cash_sales": round(sales["Cash"], 2),
        "interac_cheque_sales": round(sales["Interac"], 2),
        "card_sales": round(sales["Card"], 2),
        "tax_collected": round(tax, 2),
        "cash_paid_out": round(cash_paid_out, 2),
        "net_cash": round(sales["Cash"] - cash_paid_out, 2),
        "refunds_total": round(refunds_total, 2),
        "total_sales": round(total_sales - refunds_total, 2),
        "gross_sales": total_sales,
        "items": items,
    }


@router.get("/hotel/daily")
async def hotel_daily(date: Optional[str] = None, user: dict = Depends(get_current_user)):
    return await hotel_day_data(date or today_str())


@router.get("/hotel/weekly")
async def hotel_weekly(date: Optional[str] = None, user: dict = Depends(get_current_user)):
    days = week_dates(date or today_str())
    daily = [await hotel_day_data(d) for d in days]
    by_method = {"Cash": 0, "Interac": 0, "Card": 0}
    by_room_type = {}
    total_refunds = 0
    occ_nights = 0
    for dd in daily:
        by_method["Cash"] += dd["cash_sales"]
        by_method["Interac"] += dd["interac_cheque_sales"]
        by_method["Card"] += dd["card_sales"]
        total_refunds += dd["refunds_total"]
        for c in dd["items"]["checkins"]:
            rt = c.get("room_type") or "Unassigned"
            by_room_type[rt] = round(by_room_type.get(rt, 0) + (c.get("total") or 0), 2)
    # occupancy: count active reservations overlapping the week
    start, end = days[0], add_days(days[-1], 1)
    async for r in db.reservations.find({"status": {"$in": ["active", "checked_out"]}}):
        if r["check_in"] < end and r["check_out"] > start:
            occ_nights += 1
    return {"week": days, "daily": daily, "by_method": {k: round(v, 2) for k, v in by_method.items()},
            "by_room_type": by_room_type, "refunds_total": round(total_refunds, 2), "stays_in_week": occ_nights}


@router.get("/hotel/monthly")
async def hotel_monthly(month: Optional[str] = None, user: dict = Depends(get_current_user)):
    month = month or today_str()[:7]
    start, end = month_range(month)
    # iterate days
    by_method = {"Cash": 0, "Interac": 0, "Card": 0}
    by_room_type = {}
    total_refunds = 0
    total_tax = 0
    weeks = {}
    d = date.fromisoformat(start)
    end_d = date.fromisoformat(end)
    grand = 0
    while d < end_d:
        ds = d.isoformat()
        dd = await hotel_day_data(ds)
        by_method["Cash"] += dd["cash_sales"]
        by_method["Interac"] += dd["interac_cheque_sales"]
        by_method["Card"] += dd["card_sales"]
        total_refunds += dd["refunds_total"]
        total_tax += dd["tax_collected"]
        grand += dd["total_sales"]
        wk = f"Week {((d.day - 1) // 7) + 1}"
        weeks[wk] = round(weeks.get(wk, 0) + dd["total_sales"], 2)
        for c in dd["items"]["checkins"]:
            rt = c.get("room_type") or "Unassigned"
            by_room_type[rt] = round(by_room_type.get(rt, 0) + (c.get("total") or 0), 2)
        d += timedelta(days=1)
    occ = 0
    async for r in db.reservations.find({"status": {"$in": ["active", "checked_out"]}}):
        if r["check_in"] < end and r["check_out"] > start:
            occ += 1
    return {"month": month, "weeks": weeks, "by_method": {k: round(v, 2) for k, v in by_method.items()},
            "by_room_type": by_room_type, "refunds_total": round(total_refunds, 2),
            "tax_collected": round(total_tax, 2), "stays_in_month": occ, "total_sales": round(grand, 2)}


# ---------------- BAR REPORTS ----------------
@router.get("/bar/daily")
async def bar_daily(date: Optional[str] = None, user: dict = Depends(get_current_user)):
    d = date or today_str()
    e = await db.bar_entries.find_one({"date": d})
    if not e:
        return {"date": d, "submitted": False}
    e = clean(e)
    e["submitted"] = True
    e["tips_owed"] = round(abs(e.get("cash_sales", 0)), 2) if e.get("cash_sales", 0) < 0 else 0
    return e


@router.get("/bar/weekly")
async def bar_weekly(date: Optional[str] = None, user: dict = Depends(get_current_user)):
    days = week_dates(date or today_str())
    daily = []
    tips_owed = 0
    for d in days:
        e = await db.bar_entries.find_one({"date": d})
        if e:
            cash = e.get("cash_sales", 0)
            if cash < 0:
                tips_owed += abs(cash)
            daily.append({"date": d, "submitted": True, "cash_sales": cash,
                          "card_sales": e.get("card_sales", 0), "total_sales": e.get("total_sales", 0),
                          "over_short": e.get("over_short", 0)})
        else:
            daily.append({"date": d, "submitted": False})
    totals = {"cash": round(sum(x.get("cash_sales", 0) for x in daily if x["submitted"]), 2),
              "card": round(sum(x.get("card_sales", 0) for x in daily if x["submitted"]), 2),
              "total": round(sum(x.get("total_sales", 0) for x in daily if x["submitted"]), 2)}
    return {"week": days, "daily": daily, "tips_owed": round(tips_owed, 2), "totals": totals}


@router.get("/bar/monthly")
async def bar_monthly(month: Optional[str] = None, user: dict = Depends(get_current_user)):
    month = month or today_str()[:7]
    start, end = month_range(month)
    d = date.fromisoformat(start)
    end_d = date.fromisoformat(end)
    weeks = {}
    cash_total = card_total = total_total = 0
    over_short_total = 0
    tips_owed = 0
    missing = []
    while d < end_d:
        ds = d.isoformat()
        e = await db.bar_entries.find_one({"date": ds})
        wk = f"Week {((d.day - 1) // 7) + 1}"
        if e:
            cash_total += e.get("cash_sales", 0)
            card_total += e.get("card_sales", 0)
            total_total += e.get("total_sales", 0)
            over_short_total += e.get("over_short", 0)
            if e.get("cash_sales", 0) < 0:
                tips_owed += abs(e.get("cash_sales", 0))
            weeks[wk] = round(weeks.get(wk, 0) + e.get("total_sales", 0), 2)
        elif d.isoformat() <= today_str():
            missing.append(ds)
        d += timedelta(days=1)
    return {"month": month, "weeks": weeks, "cash_total": round(cash_total, 2),
            "card_total": round(card_total, 2), "total_total": round(total_total, 2),
            "over_short_total": round(over_short_total, 2), "tips_owed": round(tips_owed, 2), "missing_days": missing}


# ---------------- REPORT EDITS (admin, mandatory reason) ----------------
class PaymentEditIn(BaseModel):
    amount: float
    payment_method: str
    reason: str


@router.put("/hotel/payments/{payment_id}")
async def edit_payment(payment_id: str, body: PaymentEditIn, user: dict = Depends(require_write("admin"))):
    if not body.reason.strip():
        raise HTTPException(400, "A written reason is required for any report edit")
    p = await db.payments.find_one({"id": payment_id})
    if not p:
        raise HTTPException(404, "Payment record not found")
    await add_audit("report_edit", "hotel_payment", payment_id, user,
                    {"amount": p["amount"], "payment_method": p["payment_method"]},
                    {"amount": body.amount, "payment_method": body.payment_method}, body.reason)
    await db.payments.update_one({"id": payment_id}, {"$set": {"amount": body.amount, "payment_method": body.payment_method}})
    await publish_event("report_edited", {"type": "hotel_payment"})
    return {"ok": True}


class BarEntryEditIn(BaseModel):
    cash_sales: float
    card_sales: float
    total_sales: float
    reason: str


@router.put("/bar/entries/{entry_id}")
async def edit_bar_entry(entry_id: str, body: BarEntryEditIn, user: dict = Depends(require_write("admin"))):
    if not body.reason.strip():
        raise HTTPException(400, "A written reason is required for any report edit")
    e = await db.bar_entries.find_one({"id": entry_id})
    if not e:
        raise HTTPException(404, "Bar entry not found")
    await add_audit("report_edit", "bar_entry", entry_id, user,
                    {"cash_sales": e["cash_sales"], "card_sales": e["card_sales"], "total_sales": e["total_sales"]},
                    {"cash_sales": body.cash_sales, "card_sales": body.card_sales, "total_sales": body.total_sales},
                    body.reason)
    await db.bar_entries.update_one({"id": entry_id}, {"$set": {
        "cash_sales": body.cash_sales, "card_sales": body.card_sales, "total_sales": body.total_sales, "edited": True}})
    await publish_event("report_edited", {"type": "bar_entry"})
    return {"ok": True}


# ---------------- EMAIL (logged no-op for now) ----------------
class EmailIn(BaseModel):
    report_type: str
    period: str


@router.post("/email")
async def email_report(body: EmailIn, user: dict = Depends(require_write())):
    settings = await db.settings.find_one({"id": "global"})
    emails = settings.get("report_emails", []) if settings else []
    await db.email_log.insert_one({"id": now_iso(), "report_type": body.report_type, "period": body.period,
                                   "recipients": emails, "sent_by": user.get("name"), "at": now_iso()})
    if not emails:
        return {"ok": False, "message": "No report email addresses configured in Admin Settings"}
    return {"ok": True, "message": f"Report queued to {len(emails)} recipient(s)", "recipients": emails}
