import os
import jwt
import bcrypt
import uuid
import json
import logging
from datetime import datetime, timezone, timedelta, date
from zoneinfo import ZoneInfo
from pathlib import Path
from typing import List, Optional
from dotenv import load_dotenv
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("super8")

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'dev-secret')
JWT_ALGORITHM = 'HS256'
TOKEN_HOURS = 24
TAX_RATE = 0.09
TZ = ZoneInfo(os.environ.get('TIMEZONE', 'America/Regina'))

ROLES = ["admin", "front_desk", "bar_staff", "manager", "owner"]


def now_utc():
    return datetime.now(timezone.utc)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def today_str():
    return datetime.now(TZ).date().isoformat()


def add_days(date_str: str, days: int) -> str:
    d = date.fromisoformat(date_str)
    return (d + timedelta(days=days)).isoformat()


def days_between(a: str, b: str) -> int:
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def new_id():
    return str(uuid.uuid4())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(user: dict) -> str:
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "role": user["role"],
        "scope": "read" if user["role"] == "owner" else "write",
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


security = HTTPBearer(auto_error=False)


def clean(doc: Optional[dict]):
    if not doc:
        return doc
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user or not user.get("active", True):
        raise HTTPException(status_code=401, detail="User not found or deactivated")
    return clean(user)


def require_roles(*roles):
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="You do not have permission for this action")
        return user
    return dep


# Write access: everyone except owner (owner is read-only, enforced server side)
WRITE_ROLES = ["admin", "front_desk", "bar_staff", "manager"]


def require_write(*roles):
    allowed = roles if roles else WRITE_ROLES
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] == "owner":
            raise HTTPException(status_code=403, detail="Owner account is read-only. Write operations are forbidden.")
        if user["role"] not in allowed:
            raise HTTPException(status_code=403, detail="You do not have permission for this action")
        return user
    return dep


# ---------------- WebSocket manager ----------------
class ConnectionManager:
    def __init__(self):
        self.active: List = []

    async def connect(self, ws):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, message: dict):
        dead = []
        data = json.dumps(message, default=str)
        for ws in list(self.active):
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


async def publish_event(event_type: str, payload: dict = None):
    await manager.broadcast({"type": event_type, "payload": payload or {}, "ts": now_iso()})


# ---------------- Settings ----------------
DEFAULT_SETTINGS = {
    "id": "global",
    "report_emails": [],
    "owner_notifications": {
        "no_bar_entry": True,
        "cash_discrepancy": True,
        "below_par": True,
        "low_occupancy": True,
        "refund_issued": True,
        "daily_summary": True,
    },
    "occupancy_threshold": 50,
    "daily_summary_time": "20:00",
    "missing_entry_time": "23:00",
}


async def get_settings() -> dict:
    s = await db.settings.find_one({"id": "global"})
    if not s:
        doc = dict(DEFAULT_SETTINGS)
        doc["admin_pin"] = os.environ.get("ADMIN_PIN", "1234")
        doc["created_at"] = now_iso()
        await db.settings.insert_one(doc)
        s = doc
    return clean(s)


async def verify_pin(pin: str) -> bool:
    s = await db.settings.find_one({"id": "global"})
    if not s:
        s = await get_settings()
        s = await db.settings.find_one({"id": "global"})
    return str(s.get("admin_pin")) == str(pin)


async def add_audit(kind: str, entity: str, entity_id: str, user: dict, original, new, reason: str):
    await db.audit_logs.insert_one({
        "id": new_id(),
        "kind": kind,
        "entity": entity,
        "entity_id": entity_id,
        "user_name": user.get("name"),
        "user_email": user.get("email"),
        "timestamp": now_iso(),
        "original_content": original,
        "new_content": new,
        "reason": reason,
    })
