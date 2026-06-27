from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from core import (
    db, clean, new_id, now_iso, today_str, get_current_user, require_write,
    publish_event, add_days,
)

router = APIRouter(prefix="/api/bar", tags=["bar"])

CATEGORIES = ["Spirits", "Beer", "Wine", "Coolers", "Non-Alcoholic", "Other"]
UNITS = ["Bottles", "Cans", "Kegs", "Cases", "Other"]


# ---------------- INVENTORY ITEMS ----------------
class ItemIn(BaseModel):
    name: str
    category: str
    unit: str
    par_level: float = 0
    cost_per_unit: Optional[float] = None
    notes: Optional[str] = None
    active: bool = True


@router.get("/meta")
async def meta(user: dict = Depends(get_current_user)):
    return {"categories": CATEGORIES, "units": UNITS}


@router.get("/items")
async def list_items(active_only: bool = False, user: dict = Depends(get_current_user)):
    q = {"active": True} if active_only else {}
    items = await db.bar_items.find(q).sort("name", 1).to_list(1000)
    return [clean(i) for i in items]


@router.post("/items")
async def create_item(body: ItemIn, user: dict = Depends(require_write("admin", "manager"))):
    doc = {"id": new_id(), "name": body.name, "category": body.category, "unit": body.unit,
           "par_level": body.par_level, "cost_per_unit": body.cost_per_unit, "notes": body.notes,
           "active": body.active, "created_at": now_iso()}
    await db.bar_items.insert_one(doc)
    await publish_event("bar_item_created", {"name": body.name})
    return clean(doc)


@router.put("/items/{item_id}")
async def update_item(item_id: str, body: ItemIn, user: dict = Depends(require_write("admin", "manager"))):
    i = await db.bar_items.find_one({"id": item_id})
    if not i:
        raise HTTPException(404, "Item not found")
    await db.bar_items.update_one({"id": item_id}, {"$set": body.model_dump()})
    await publish_event("bar_item_updated", {"id": item_id})
    return clean(await db.bar_items.find_one({"id": item_id}))


@router.delete("/items/{item_id}")
async def delete_item(item_id: str, user: dict = Depends(require_write("admin", "manager"))):
    await db.bar_items.update_one({"id": item_id}, {"$set": {"active": False}})
    return {"ok": True}


# ---------------- STOCK RECEIVING ----------------
class ReceivingIn(BaseModel):
    date: str
    item_id: str
    quantity: float
    supplier: Optional[str] = None
    invoice_number: Optional[str] = None


@router.get("/receiving")
async def list_receiving(user: dict = Depends(get_current_user)):
    items = await db.stock_receiving.find({}).sort("date", -1).to_list(2000)
    return [clean(r) for r in items]


@router.post("/receiving")
async def create_receiving(body: ReceivingIn, user: dict = Depends(require_write("admin", "manager"))):
    item = await db.bar_items.find_one({"id": body.item_id})
    if not item:
        raise HTTPException(404, "Item not found")
    doc = {"id": new_id(), "date": body.date, "item_id": body.item_id, "item_name": item["name"],
           "quantity": body.quantity, "supplier": body.supplier, "invoice_number": body.invoice_number,
           "entered_by": user.get("name"), "created_at": now_iso()}
    await db.stock_receiving.insert_one(doc)
    await publish_event("stock_received", {"item": item["name"]})
    return clean(doc)


# ---------------- NIGHTLY ENTRY ----------------
class EntryItemIn(BaseModel):
    item_id: str
    opening: float = 0
    received: float = 0
    closing: float = 0
    note: Optional[str] = None


class CashPaidOut(BaseModel):
    recipient: str
    reason: str
    amount: float


class EntryIn(BaseModel):
    date: str
    items: List[EntryItemIn]
    cash_sales: float = 0
    card_sales: float = 0
    total_sales: float = 0
    float_start: float = 0
    cash_paid_out: List[CashPaidOut] = []
    actual_cash: float = 0
    notes: Optional[str] = None


async def prev_closing_map(date_str: str):
    prev = await db.bar_entries.find({"date": {"$lt": date_str}}).sort("date", -1).to_list(1)
    result = {}
    if prev:
        for it in prev[0].get("items", []):
            result[it["item_id"]] = it.get("closing", 0)
    return result


def variance_flag(used: float, par: float) -> bool:
    if used < 0:
        return True
    if par and par > 0 and used > par * 3:
        return True
    return False


@router.get("/entries/prefill")
async def prefill(date: str, user: dict = Depends(get_current_user)):
    """Opening counts (prev closing) + received-today totals for active items."""
    prev = await prev_closing_map(date)
    received = {}
    async for r in db.stock_receiving.find({"date": date}):
        received[r["item_id"]] = received.get(r["item_id"], 0) + r.get("quantity", 0)
    items = await db.bar_items.find({"active": True}).sort("name", 1).to_list(1000)
    rows = []
    for i in items:
        rows.append({
            "item_id": i["id"], "name": i["name"], "category": i["category"], "unit": i["unit"],
            "par_level": i.get("par_level", 0), "opening": prev.get(i["id"], 0),
            "received": received.get(i["id"], 0), "prev_closing": prev.get(i["id"], 0)})
    return rows


@router.get("/entries")
async def get_entry(date: str, user: dict = Depends(get_current_user)):
    e = await db.bar_entries.find_one({"date": date})
    return clean(e) if e else None


@router.post("/entries")
async def submit_entry(body: EntryIn, user: dict = Depends(require_write("admin", "manager", "bar_staff"))):
    items_meta = {i["id"]: i async for i in db.bar_items.find({})}
    processed = []
    below_par_count = 0
    for it in body.items:
        meta = items_meta.get(it.item_id, {})
        used = round(it.opening + it.received - it.closing, 2)
        par = meta.get("par_level", 0)
        below = par and par > 0 and it.closing < par
        if below:
            below_par_count += 1
        processed.append({
            "item_id": it.item_id, "name": meta.get("name", ""), "category": meta.get("category", ""),
            "unit": meta.get("unit", ""), "par_level": par, "opening": it.opening,
            "received": it.received, "closing": it.closing, "used": used,
            "variance": variance_flag(used, par), "below_par": bool(below), "note": it.note})
    paid_out_total = round(sum(p.amount for p in body.cash_paid_out), 2)
    expected_cash = round(body.float_start + body.cash_sales - paid_out_total, 2)
    over_short = round(body.actual_cash - expected_cash, 2)
    today = today_str()
    late = body.date < today
    doc = {
        "date": body.date, "items": processed,
        "cash_sales": body.cash_sales, "card_sales": body.card_sales, "total_sales": body.total_sales,
        "float_start": body.float_start, "cash_paid_out": [p.model_dump() for p in body.cash_paid_out],
        "cash_paid_out_total": paid_out_total, "expected_cash": expected_cash,
        "actual_cash": body.actual_cash, "over_short": over_short, "notes": body.notes,
        "late_entry": late, "below_par_count": below_par_count,
        "submitted_by": user.get("name"), "submitted_at": now_iso(),
    }
    existing = await db.bar_entries.find_one({"date": body.date})
    if existing:
        doc["id"] = existing["id"]
        doc["edited"] = True
        await db.bar_entries.update_one({"date": body.date}, {"$set": doc})
    else:
        doc["id"] = new_id()
        await db.bar_entries.insert_one(doc)
    await publish_event("bar_entry_submitted", {"date": body.date, "over_short": over_short,
                        "below_par_count": below_par_count, "cash_sales": body.cash_sales})
    return clean(await db.bar_entries.find_one({"date": body.date}))


# ---------------- LIVE INVENTORY / BELOW PAR ----------------
async def latest_entry():
    items = await db.bar_entries.find({}).sort("date", -1).to_list(1)
    return items[0] if items else None


@router.get("/inventory")
async def live_inventory(user: dict = Depends(get_current_user)):
    le = await latest_entry()
    closing_map = {}
    if le:
        for it in le.get("items", []):
            closing_map[it["item_id"]] = it
    items = await db.bar_items.find({"active": True}).sort("name", 1).to_list(1000)
    result = []
    for i in items:
        c = closing_map.get(i["id"], {})
        current = c.get("closing", 0)
        par = i.get("par_level", 0)
        result.append({
            "id": i["id"], "name": i["name"], "category": i["category"], "unit": i["unit"],
            "par_level": par, "current_stock": current, "below_par": bool(par and par > 0 and current < par)})
    return {"items": result, "last_entry_date": le["date"] if le else None,
            "last_entry_time": le.get("submitted_at") if le else None}


@router.get("/below-par")
async def below_par(user: dict = Depends(get_current_user)):
    inv = await live_inventory(user)
    return [i for i in inv["items"] if i["below_par"]]


@router.get("/items/{item_id}/trend")
async def item_trend(item_id: str, user: dict = Depends(get_current_user)):
    entries = await db.bar_entries.find({"items.item_id": item_id}).sort("date", -1).to_list(7)
    trend = []
    for e in reversed(entries):
        for it in e.get("items", []):
            if it["item_id"] == item_id:
                trend.append({"date": e["date"], "closing": it.get("closing", 0), "used": it.get("used", 0)})
    return trend
