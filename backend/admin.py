from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from core import (
    db, clean, new_id, now_iso, hash_password, verify_password, get_settings,
    get_current_user, require_write, require_roles, ROLES,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


class PinIn(BaseModel):
    pin: str


@router.post("/verify-pin")
async def verify_pin_endpoint(body: PinIn, user: dict = Depends(require_roles("admin", "manager"))):
    s = await db.settings.find_one({"id": "global"})
    if not s:
        await get_settings()
        s = await db.settings.find_one({"id": "global"})
    if str(s.get("admin_pin")) != str(body.pin):
        raise HTTPException(403, "Incorrect Admin PIN")
    return {"ok": True}


class ChangePinIn(BaseModel):
    current_pin: str
    new_pin: str


@router.post("/change-pin")
async def change_pin(body: ChangePinIn, user: dict = Depends(require_write("admin"))):
    s = await db.settings.find_one({"id": "global"})
    if str(s.get("admin_pin")) != str(body.current_pin):
        raise HTTPException(403, "Current PIN is incorrect")
    if not (4 <= len(body.new_pin) <= 6) or not body.new_pin.isdigit():
        raise HTTPException(400, "PIN must be 4 to 6 digits")
    await db.settings.update_one({"id": "global"}, {"$set": {"admin_pin": body.new_pin}})
    return {"ok": True}


# ---------------- SETTINGS ----------------
@router.get("/settings")
async def settings_get(user: dict = Depends(get_current_user)):
    return await get_settings()


class SettingsIn(BaseModel):
    report_emails: Optional[List[str]] = None
    owner_notifications: Optional[dict] = None
    occupancy_threshold: Optional[int] = None
    daily_summary_time: Optional[str] = None
    missing_entry_time: Optional[str] = None


@router.put("/settings")
async def settings_update(body: SettingsIn, user: dict = Depends(require_write("admin"))):
    await get_settings()
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if update:
        await db.settings.update_one({"id": "global"}, {"$set": update})
    return await get_settings()


# ---------------- USER MANAGEMENT ----------------
class UserIn(BaseModel):
    name: str
    email: str
    password: Optional[str] = None
    role: str
    active: bool = True


@router.get("/users")
async def list_users(user: dict = Depends(require_roles("admin"))):
    users = await db.users.find({}).sort("created_at", 1).to_list(1000)
    return [clean(u) for u in users]


@router.post("/users")
async def create_user(body: UserIn, user: dict = Depends(require_write("admin"))):
    if body.role not in ROLES:
        raise HTTPException(400, "Invalid role")
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "A user with this email already exists")
    if not body.password:
        raise HTTPException(400, "Password is required")
    doc = {"id": new_id(), "name": body.name, "email": email, "password_hash": hash_password(body.password),
           "role": body.role, "active": body.active, "created_at": now_iso()}
    await db.users.insert_one(doc)
    return clean(doc)


@router.put("/users/{user_id}")
async def update_user(user_id: str, body: UserIn, user: dict = Depends(require_write("admin"))):
    u = await db.users.find_one({"id": user_id})
    if not u:
        raise HTTPException(404, "User not found")
    update = {"name": body.name, "email": body.email.strip().lower(), "role": body.role, "active": body.active}
    if body.password:
        update["password_hash"] = hash_password(body.password)
    await db.users.update_one({"id": user_id}, {"$set": update})
    return clean(await db.users.find_one({"id": user_id}))


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require_write("admin"))):
    if user_id == user["id"]:
        raise HTTPException(400, "You cannot delete your own account")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}


# ---------------- EDIT LOGS VIEWER ----------------
@router.get("/audit-logs")
async def audit_logs(user: dict = Depends(require_roles("admin"))):
    logs = await db.audit_logs.find({}).sort("timestamp", -1).to_list(2000)
    return [clean(l) for l in logs]
