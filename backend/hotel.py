from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from core import (
    db, clean, new_id, now_iso, today_str, add_days, days_between, TAX_RATE,
    get_current_user, require_write, verify_pin, add_audit, publish_event,
)

router = APIRouter(prefix="/api/hotel", tags=["hotel"])

ROOM_TYPES = [
    "Single Queen", "Single Queen + Kitchen", "Single Queen Suite",
    "Single King", "Double Queen", "Double Queen Suite",
]
PAYMENT_METHODS = ["Cash", "Interac", "Cheque", "Card"]
ACTIVE_STATUSES = ["active", "future"]


def compute_totals(rate: float, nights: int):
    before = round(rate * nights, 2)
    tax = round(before * TAX_RATE, 2)
    after = round(before + tax, 2)
    return before, tax, after


async def record_payment(kind, amount, method, date_str, guest_name="", reservation_id=None, note=""):
    if amount == 0:
        return
    await db.payments.insert_one({
        "id": new_id(), "kind": kind, "amount": round(amount, 2), "payment_method": method,
        "date": date_str, "guest_name": guest_name, "reservation_id": reservation_id,
        "note": note, "created_at": now_iso(),
    })


async def is_room_available(room_id, check_in, check_out, exclude_res=None):
    q = {"room_id": room_id, "status": {"$in": ACTIVE_STATUSES}}
    if exclude_res:
        q["id"] = {"$ne": exclude_res}
    cur = db.reservations.find(q)
    async for r in cur:
        if r["check_in"] < check_out and r["check_out"] > check_in:
            return False
    return True


# ---------------- ROOMS ----------------
class RoomIn(BaseModel):
    number: str
    type: str
    floor: Optional[str] = None
    notes: Optional[str] = None


@router.get("/room-types")
async def room_types():
    return ROOM_TYPES


@router.get("/rooms")
async def list_rooms(user: dict = Depends(get_current_user)):
    rooms = await db.rooms.find({}).sort("number", 1).to_list(1000)
    result = []
    for r in rooms:
        clean(r)
        guest = None
        ghost = False
        if r["status"] == "Occupied":
            res = await db.reservations.find_one({"room_id": r["id"], "status": "active"})
            if res:
                guest = {
                    "guest_name": res["guest_name"], "check_in": res["check_in"],
                    "check_out": res["check_out"], "nightly_rate": res["nightly_rate"],
                    "total_after_tax": res["total_after_tax"], "payment_method": res["payment_method"],
                    "reservation_id": res["id"],
                }
            else:
                ghost = True
        r["current_guest"] = guest
        r["ghost"] = ghost
        result.append(r)
    return result


@router.post("/rooms")
async def create_room(body: RoomIn, user: dict = Depends(require_write("admin"))):
    if body.type not in ROOM_TYPES:
        raise HTTPException(400, "Invalid room type")
    if await db.rooms.find_one({"number": body.number}):
        raise HTTPException(400, "A room with this number already exists")
    doc = {"id": new_id(), "number": body.number, "type": body.type, "floor": body.floor,
           "notes": body.notes, "status": "Vacant", "active": True, "created_at": now_iso()}
    await db.rooms.insert_one(doc)
    await publish_event("room_created", {"number": body.number})
    return clean(doc)


@router.put("/rooms/{room_id}")
async def update_room(room_id: str, body: RoomIn, user: dict = Depends(require_write("admin"))):
    r = await db.rooms.find_one({"id": room_id})
    if not r:
        raise HTTPException(404, "Room not found")
    await db.rooms.update_one({"id": room_id}, {"$set": {
        "number": body.number, "type": body.type, "floor": body.floor, "notes": body.notes}})
    await publish_event("room_updated", {"id": room_id})
    return clean(await db.rooms.find_one({"id": room_id}))


@router.patch("/rooms/{room_id}/status")
async def update_room_status(room_id: str, status: str = Query(...), user: dict = Depends(require_write())):
    valid = ["Vacant", "Occupied", "Dirty", "Clean", "Under Maintenance"]
    if status not in valid:
        raise HTTPException(400, "Invalid status")
    r = await db.rooms.find_one({"id": room_id})
    if not r:
        raise HTTPException(404, "Room not found")
    await db.rooms.update_one({"id": room_id}, {"$set": {"status": status}})
    await publish_event("room_status_changed", {"id": room_id, "status": status})
    return clean(await db.rooms.find_one({"id": room_id}))


@router.patch("/rooms/{room_id}/active")
async def toggle_room_active(room_id: str, active: bool = Query(...), user: dict = Depends(require_write("admin"))):
    await db.rooms.update_one({"id": room_id}, {"$set": {"active": active}})
    return clean(await db.rooms.find_one({"id": room_id}))


@router.delete("/rooms/{room_id}")
async def delete_room(room_id: str, user: dict = Depends(require_write("admin"))):
    res = await db.reservations.find_one({"room_id": room_id, "status": {"$in": ACTIVE_STATUSES}})
    if res:
        raise HTTPException(400, "Cannot delete a room with active or future reservations")
    await db.rooms.delete_one({"id": room_id})
    await publish_event("room_deleted", {"id": room_id})
    return {"ok": True}


# ---------------- AVAILABILITY ----------------
@router.get("/availability")
async def availability(check_in: str, check_out: str, user: dict = Depends(get_current_user)):
    if days_between(check_in, check_out) <= 0:
        raise HTTPException(400, "Check-out must be after check-in")
    rooms = await db.rooms.find({"active": True, "status": {"$ne": "Under Maintenance"}}).sort("number", 1).to_list(1000)
    available = []
    for r in rooms:
        if await is_room_available(r["id"], check_in, check_out):
            clean(r)
            available.append(r)
    return available


# ---------------- RESERVATIONS ----------------
class ReservationIn(BaseModel):
    guest_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    res_type: str  # checkin_now | future
    room_id: Optional[str] = None
    room_type: Optional[str] = None
    check_in: str
    check_out: str
    nightly_rate: float
    amount_paid: float = 0
    payment_method: str = "Cash"
    notes: Optional[str] = None


async def build_reservation_doc(body: ReservationIn, existing_id=None):
    nights = days_between(body.check_in, body.check_out)
    if nights <= 0:
        raise HTTPException(400, "Check-out must be after check-in")
    before, tax, after = compute_totals(body.nightly_rate, nights)
    room_number = None
    room_type = body.room_type
    if body.room_id:
        room = await db.rooms.find_one({"id": body.room_id})
        if not room:
            raise HTTPException(404, "Room not found")
        room_number = room["number"]
        room_type = room["type"]
    return {
        "guest_name": body.guest_name, "phone": body.phone, "email": body.email,
        "res_type": body.res_type, "room_id": body.room_id, "room_number": room_number,
        "room_type": room_type, "check_in": body.check_in, "check_out": body.check_out,
        "nights": nights, "nightly_rate": body.nightly_rate,
        "total_before_tax": before, "tax": tax, "total_after_tax": after,
        "amount_paid": body.amount_paid, "payment_method": body.payment_method, "notes": body.notes,
    }


@router.post("/reservations")
async def create_reservation(body: ReservationIn, user: dict = Depends(require_write())):
    if body.res_type == "checkin_now" and not body.room_id:
        raise HTTPException(400, "A room must be selected for Check-In Now")
    if body.room_id:
        if not await is_room_available(body.room_id, body.check_in, body.check_out):
            raise HTTPException(400, "Selected room is not available for these dates")
    doc = await build_reservation_doc(body)
    doc["id"] = new_id()
    doc["status"] = "active" if body.res_type == "checkin_now" else "future"
    doc["created_at"] = now_iso()
    doc["created_by"] = user.get("name")
    await db.reservations.insert_one(doc)
    if body.res_type == "checkin_now" and body.room_id:
        await db.rooms.update_one({"id": body.room_id}, {"$set": {"status": "Occupied"}})
    await record_payment("reservation", body.amount_paid, body.payment_method, body.check_in,
                         body.guest_name, doc["id"], "Reservation payment")
    await publish_event("reservation_created", {"id": doc["id"], "guest": body.guest_name})
    return clean(doc)


@router.get("/reservations")
async def list_reservations(status: Optional[str] = None, q: Optional[str] = None,
                            user: dict = Depends(get_current_user)):
    query = {}
    if status and status != "all":
        query["status"] = status
    if q:
        query["$or"] = [{"guest_name": {"$regex": q, "$options": "i"}},
                        {"phone": {"$regex": q, "$options": "i"}},
                        {"room_number": {"$regex": q, "$options": "i"}}]
    items = await db.reservations.find(query).sort("created_at", -1).to_list(2000)
    today = today_str()
    for r in items:
        clean(r)
        r["arriving_today"] = r["status"] == "future" and r["check_in"] == today
    return items


@router.get("/reservations/{res_id}")
async def get_reservation(res_id: str, user: dict = Depends(get_current_user)):
    r = await db.reservations.find_one({"id": res_id})
    if not r:
        raise HTTPException(404, "Reservation not found")
    exts = await db.extensions.find({"reservation_id": res_id}).to_list(100)
    refs = await db.refunds.find({"reservation_id": res_id}).to_list(100)
    clean(r)
    r["extensions"] = [clean(e) for e in exts]
    r["refunds"] = [clean(x) for x in refs]
    return r


@router.put("/reservations/{res_id}")
async def update_reservation(res_id: str, body: ReservationIn, user: dict = Depends(require_write())):
    r = await db.reservations.find_one({"id": res_id})
    if not r:
        raise HTTPException(404, "Reservation not found")
    if body.room_id and not await is_room_available(body.room_id, body.check_in, body.check_out, exclude_res=res_id):
        raise HTTPException(400, "Selected room is not available for these dates")
    doc = await build_reservation_doc(body, existing_id=res_id)
    # adjust payment delta
    old_paid = r.get("amount_paid", 0)
    if body.amount_paid != old_paid:
        await record_payment("reservation_adjust", body.amount_paid - old_paid, body.payment_method,
                             body.check_in, body.guest_name, res_id, "Reservation edit adjustment")
    await db.reservations.update_one({"id": res_id}, {"$set": doc})
    # room re-assignment for active reservations
    if r["status"] == "active":
        if r.get("room_id") and r["room_id"] != body.room_id:
            await db.rooms.update_one({"id": r["room_id"]}, {"$set": {"status": "Dirty"}})
        if body.room_id:
            await db.rooms.update_one({"id": body.room_id}, {"$set": {"status": "Occupied"}})
    await publish_event("reservation_updated", {"id": res_id})
    return clean(await db.reservations.find_one({"id": res_id}))


@router.post("/reservations/{res_id}/cancel")
async def cancel_reservation(res_id: str, user: dict = Depends(require_write())):
    r = await db.reservations.find_one({"id": res_id})
    if not r:
        raise HTTPException(404, "Reservation not found")
    await db.reservations.update_one({"id": res_id}, {"$set": {"status": "cancelled", "cancelled_at": now_iso()}})
    if r.get("room_id") and r["status"] == "active":
        await db.rooms.update_one({"id": r["room_id"]}, {"$set": {"status": "Vacant"}})
    await publish_event("reservation_cancelled", {"id": res_id})
    return {"ok": True}


@router.post("/reservations/{res_id}/convert")
async def convert_reservation(res_id: str, room_id: Optional[str] = None, user: dict = Depends(require_write())):
    r = await db.reservations.find_one({"id": res_id})
    if not r:
        raise HTTPException(404, "Reservation not found")
    if r["status"] != "future":
        raise HTTPException(400, "Only future reservations can be converted")
    rid = room_id or r.get("room_id")
    if not rid:
        raise HTTPException(400, "A room must be assigned to check in this guest")
    if not await is_room_available(rid, r["check_in"], r["check_out"], exclude_res=res_id):
        raise HTTPException(400, "Assigned room is not available for these dates")
    room = await db.rooms.find_one({"id": rid})
    await db.reservations.update_one({"id": res_id}, {"$set": {
        "status": "active", "res_type": "checkin_now", "room_id": rid,
        "room_number": room["number"], "room_type": room["type"]}})
    await db.rooms.update_one({"id": rid}, {"$set": {"status": "Occupied"}})
    await publish_event("reservation_converted", {"id": res_id})
    return clean(await db.reservations.find_one({"id": res_id}))


class CheckoutIn(BaseModel):
    refund_amount: float = 0
    refund_reason: Optional[str] = None


@router.post("/reservations/{res_id}/checkout")
async def checkout(res_id: str, body: CheckoutIn, user: dict = Depends(require_write())):
    r = await db.reservations.find_one({"id": res_id})
    if not r:
        raise HTTPException(404, "Reservation not found")
    if r["status"] != "active":
        raise HTTPException(400, "Only active stays can be checked out")
    today = today_str()
    early = today < r["check_out"]
    update = {"status": "checked_out", "actual_check_out": today, "checked_out_at": now_iso(), "early_checkout": early}
    await db.reservations.update_one({"id": res_id}, {"$set": update})
    if r.get("room_id"):
        await db.rooms.update_one({"id": r["room_id"]}, {"$set": {"status": "Dirty"}})
    if body.refund_amount and body.refund_amount > 0:
        await db.refunds.insert_one({
            "id": new_id(), "reservation_id": res_id, "guest_name": r["guest_name"],
            "amount": round(body.refund_amount, 2), "reason": body.refund_reason or "Early check-out refund",
            "date": today, "created_at": now_iso(), "created_by": user.get("name")})
        await record_payment("refund", -abs(body.refund_amount), r["payment_method"], today,
                             r["guest_name"], res_id, "Refund issued")
        await publish_event("refund_issued", {"reservation_id": res_id, "amount": body.refund_amount})
    await publish_event("guest_checked_out", {"id": res_id, "early": early})
    return {"ok": True, "early": early}


class ExtendIn(BaseModel):
    additional_nights: int
    nightly_rate: float
    amount_paid: float
    payment_method: str = "Cash"


@router.post("/reservations/{res_id}/extend")
async def extend(res_id: str, body: ExtendIn, user: dict = Depends(require_write())):
    r = await db.reservations.find_one({"id": res_id})
    if not r:
        raise HTTPException(404, "Reservation not found")
    if r["status"] != "active":
        raise HTTPException(400, "Only active stays can be extended")
    if body.additional_nights <= 0:
        raise HTTPException(400, "Additional nights must be positive")
    before, tax, after = compute_totals(body.nightly_rate, body.additional_nights)
    new_checkout = add_days(r["check_out"], body.additional_nights)
    # availability for extended range
    if r.get("room_id") and not await is_room_available(r["room_id"], r["check_out"], new_checkout, exclude_res=res_id):
        raise HTTPException(400, "Room is not available for the extended dates")
    today = today_str()
    ext = {"id": new_id(), "reservation_id": res_id, "additional_nights": body.additional_nights,
           "nightly_rate": body.nightly_rate, "total_before_tax": before, "tax": tax,
           "total_after_tax": after, "amount_paid": body.amount_paid, "payment_method": body.payment_method,
           "date": today, "created_at": now_iso(), "created_by": user.get("name")}
    await db.extensions.insert_one(ext)
    await db.reservations.update_one({"id": res_id}, {"$set": {"check_out": new_checkout},
                                     "$inc": {"nights": body.additional_nights}})
    await record_payment("extension", body.amount_paid, body.payment_method, today, r["guest_name"], res_id, "Stay extension")
    await publish_event("stay_extended", {"id": res_id})
    return clean(ext)


# ---------------- HOUSEKEEPING ----------------
@router.get("/housekeeping")
async def housekeeping(date: Optional[str] = None, user: dict = Depends(get_current_user)):
    target = date or today_str()
    tomorrow = add_days(target, 1)
    entries = {}
    # dirty rooms
    dirty = await db.rooms.find({"status": "Dirty"}).to_list(1000)
    for room in dirty:
        entries[room["id"]] = {
            "room_id": room["id"], "room_number": room["number"], "room_type": room["type"],
            "status": room["status"], "guest_name": None, "check_out_date": None, "reason": "Dirty Status"}
    # scheduled check-outs tomorrow
    scheduled = await db.reservations.find({"status": "active", "check_out": tomorrow}).to_list(1000)
    for res in scheduled:
        if not res.get("room_id"):
            continue
        room = await db.rooms.find_one({"id": res["room_id"]})
        if not room:
            continue
        entries[room["id"]] = {
            "room_id": room["id"], "room_number": room["number"], "room_type": room["type"],
            "status": room["status"], "guest_name": res["guest_name"], "check_out_date": res["check_out"],
            "reason": "Scheduled Check-Out"}
    result = sorted(entries.values(), key=lambda x: x["room_number"])
    return result


# ---------------- GUEST HISTORY ----------------
@router.get("/guests")
async def search_guests(q: str = "", user: dict = Depends(get_current_user)):
    query = {}
    if q:
        query["$or"] = [{"guest_name": {"$regex": q, "$options": "i"}},
                        {"phone": {"$regex": q, "$options": "i"}}]
    items = await db.reservations.find(query).to_list(3000)
    guests = {}
    for r in items:
        key = (r["guest_name"].strip().lower(), r.get("phone") or "")
        g = guests.setdefault(key, {"guest_name": r["guest_name"], "phone": r.get("phone"),
                                    "email": r.get("email"), "stays": 0, "total_nights": 0, "total_revenue": 0})
        if r["status"] != "cancelled":
            g["stays"] += 1
            g["total_nights"] += r.get("nights", 0)
            g["total_revenue"] += r.get("total_after_tax", 0)
    return list(guests.values())


@router.get("/guests/profile")
async def guest_profile(name: str, phone: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {"guest_name": {"$regex": f"^{name}$", "$options": "i"}}
    if phone:
        query["phone"] = phone
    stays = await db.reservations.find(query).sort("check_in", -1).to_list(1000)
    total_nights = 0
    total_revenue = 0
    result_stays = []
    for s in stays:
        clean(s)
        exts = await db.extensions.find({"reservation_id": s["id"]}).to_list(100)
        refs = await db.refunds.find({"reservation_id": s["id"]}).to_list(100)
        s["extensions"] = [clean(e) for e in exts]
        s["refunds"] = [clean(x) for x in refs]
        if s["status"] != "cancelled":
            total_nights += s.get("nights", 0)
            total_revenue += s.get("total_after_tax", 0)
        result_stays.append(s)
    return {"guest_name": name, "phone": phone, "stays": result_stays,
            "total_nights": total_nights, "total_revenue": round(total_revenue, 2)}


# ---------------- CASH PAYOUTS ----------------
class PayoutIn(BaseModel):
    recipient: str
    amount: float
    reason: str
    date: str


@router.get("/payouts")
async def list_payouts(user: dict = Depends(get_current_user)):
    items = await db.payouts.find({}).sort("date", -1).to_list(2000)
    return [clean(p) for p in items]


@router.post("/payouts")
async def create_payout(body: PayoutIn, user: dict = Depends(require_write())):
    doc = {"id": new_id(), "recipient": body.recipient, "amount": round(body.amount, 2),
           "reason": body.reason, "date": body.date, "created_by": user.get("name"), "created_at": now_iso()}
    await db.payouts.insert_one(doc)
    await publish_event("payout_created", {"amount": body.amount})
    return clean(doc)


@router.get("/cash-summary")
async def cash_summary(user: dict = Depends(get_current_user)):
    cash_in = 0
    async for p in db.payments.find({"payment_method": "Cash"}):
        cash_in += p.get("amount", 0)
    paid_out = 0
    async for p in db.payouts.find({}):
        paid_out += p.get("amount", 0)
    return {"cash_in": round(cash_in, 2), "paid_out": round(paid_out, 2), "net_cash": round(cash_in - paid_out, 2)}


# ---------------- MANUAL LOG ----------------
class LogIn(BaseModel):
    date: str
    text: str


class LogEditIn(BaseModel):
    date: str
    text: str
    pin: str


class PinIn(BaseModel):
    pin: str


@router.get("/logs")
async def list_logs(user: dict = Depends(get_current_user)):
    items = await db.manual_logs.find({}).sort("date", -1).to_list(2000)
    return [clean(l) for l in items]


@router.post("/logs")
async def create_log(body: LogIn, user: dict = Depends(require_write())):
    doc = {"id": new_id(), "date": body.date, "text": body.text,
           "created_by": user.get("name"), "created_at": now_iso()}
    await db.manual_logs.insert_one(doc)
    await publish_event("log_created", {})
    return clean(doc)


@router.put("/logs/{log_id}")
async def edit_log(log_id: str, body: LogEditIn, user: dict = Depends(require_write())):
    if not await verify_pin(body.pin):
        raise HTTPException(403, "Incorrect Admin PIN")
    log = await db.manual_logs.find_one({"id": log_id})
    if not log:
        raise HTTPException(404, "Log not found")
    await add_audit("log_edit", "manual_log", log_id, user,
                    {"date": log["date"], "text": log["text"]},
                    {"date": body.date, "text": body.text}, "Manual log edited")
    await db.manual_logs.update_one({"id": log_id}, {"$set": {"date": body.date, "text": body.text}})
    return clean(await db.manual_logs.find_one({"id": log_id}))


@router.post("/logs/{log_id}/delete")
async def delete_log(log_id: str, body: PinIn, user: dict = Depends(require_write())):
    if not await verify_pin(body.pin):
        raise HTTPException(403, "Incorrect Admin PIN")
    log = await db.manual_logs.find_one({"id": log_id})
    if not log:
        raise HTTPException(404, "Log not found")
    await add_audit("log_delete", "manual_log", log_id, user,
                    {"date": log["date"], "text": log["text"]}, None, "Manual log deleted")
    await db.manual_logs.delete_one({"id": log_id})
    return {"ok": True}
