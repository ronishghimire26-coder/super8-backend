from fastapi import APIRouter, Depends
from typing import Optional
from core import db, get_current_user, today_str, add_days


async def hotel_revenue_for_date(date_str: str):
    cash = card = interac = 0
    async for p in db.payments.find({"date": date_str}):
        m = p.get("payment_method")
        amt = p.get("amount", 0)
        if m == "Cash":
            cash += amt
        elif m == "Card":
            card += amt
        else:  # Interac, Cheque
            interac += amt
    total = round(cash + card + interac, 2)
    return {"cash": round(cash, 2), "card": round(card, 2), "interac": round(interac, 2), "total": total}


async def hotel_panel():
    today = today_str()
    tomorrow = add_days(today, 1)
    revenue = await hotel_revenue_for_date(today)
    rooms = await db.rooms.find({}).to_list(1000)
    total = len(rooms)
    counts = {"Vacant": 0, "Occupied": 0, "Dirty": 0, "Clean": 0, "Under Maintenance": 0}
    for r in rooms:
        counts[r.get("status", "Vacant")] = counts.get(r.get("status", "Vacant"), 0) + 1
    occupied = counts["Occupied"]
    occupancy_pct = round((occupied / total) * 100) if total else 0
    checkins_today = await db.reservations.count_documents({"check_in": today, "status": {"$in": ["active", "checked_out"]}})
    checkouts_today = await db.reservations.count_documents({"actual_check_out": today, "status": "checked_out"})
    departures_tomorrow = await db.reservations.count_documents({"check_out": tomorrow, "status": "active"})
    # ghost rooms
    ghosts = 0
    for r in rooms:
        if r.get("status") == "Occupied":
            res = await db.reservations.find_one({"room_id": r["id"], "status": "active"})
            if not res:
                ghosts += 1
    return {
        "revenue": revenue,
        "total_rooms": total, "occupied": occupied, "vacant": counts["Vacant"],
        "dirty": counts["Dirty"], "clean": counts["Clean"], "maintenance": counts["Under Maintenance"],
        "occupancy_pct": occupancy_pct, "checkins_today": checkins_today,
        "checkouts_today": checkouts_today, "departures_tomorrow": departures_tomorrow, "ghost_rooms": ghosts,
    }


async def bar_panel():
    today = today_str()
    today_entry = await db.bar_entries.find_one({"date": today})
    last_entries = await db.bar_entries.find({}).sort("date", -1).to_list(1)
    last = last_entries[0] if last_entries else None
    # below par from latest entry
    below = 0
    if last:
        below = last.get("below_par_count", 0)
    revenue = {"cash": 0, "card": 0, "total": 0}
    if today_entry:
        revenue = {"cash": today_entry.get("cash_sales", 0), "card": today_entry.get("card_sales", 0),
                   "total": today_entry.get("total_sales", 0)}
    return {
        "revenue": revenue,
        "entry_today": bool(today_entry),
        "last_entry_date": last["date"] if last else None,
        "last_night_revenue": last.get("total_sales", 0) if last else 0,
        "last_over_short": last.get("over_short", 0) if last else None,
        "below_par_count": below,
    }


router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
async def dashboard(user: dict = Depends(get_current_user)):
    return {"hotel": await hotel_panel(), "bar": await bar_panel(), "today": today_str()}
