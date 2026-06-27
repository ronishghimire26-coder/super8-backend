import os
import jwt
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from starlette.middleware.cors import CORSMiddleware
from core import (
    db, client, manager, logger, hash_password, verify_password, new_id, now_iso,
    get_settings, JWT_SECRET, JWT_ALGORITHM,
)
import auth as auth_module
import hotel as hotel_module
import bar as bar_module
import admin as admin_module
import reports as reports_module
import dashboard as dashboard_module
import ai_assistant as ai_module

app = FastAPI(title="Super 8 by Wyndham — Unified System")

app.include_router(auth_module.router, prefix="/api")
app.include_router(hotel_module.router, prefix="/api")
app.include_router(bar_module.router, prefix="/api")
app.include_router(admin_module.router, prefix="/api")
app.include_router(reports_module.router, prefix="/api")
app.include_router(dashboard_module.router, prefix="/api")
app.include_router(ai_module.router, prefix="/api")

@app.get("/api/")
async def root():
    return {"message": "Super 8 by Wyndham — Unified System API"}


@app.websocket("/api/ws")
async def websocket_endpoint(ws: WebSocket, token: str = Query(None)):
    # validate token (any authenticated role may subscribe)
    if not token:
        await ws.close(code=4001)
        return
    try:
        jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        await ws.close(code=4001)
        return
    await manager.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception:
        manager.disconnect(ws)


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.rooms.create_index("number")
    await db.reservations.create_index("status")
    await db.payments.create_index("date")
    await db.bar_entries.create_index("date", unique=True)
    await get_settings()
    # seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@super8.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({"id": new_id(), "name": "Administrator", "email": admin_email,
                                   "password_hash": hash_password(admin_password), "role": "admin",
                                   "active": True, "created_at": now_iso()})
        logger.info("Seeded admin user")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})
    # seed owner demo account
    owner_email = "owner@super8.com"
    if not await db.users.find_one({"email": owner_email}):
        await db.users.insert_one({"id": new_id(), "name": "Owner", "email": owner_email,
                                   "password_hash": hash_password("owner123"), "role": "owner",
                                   "active": True, "created_at": now_iso()})


@app.on_event("shutdown")
async def shutdown():
    client.close()
