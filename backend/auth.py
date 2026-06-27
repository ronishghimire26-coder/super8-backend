from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
from core import (
    db, clean, new_id, hash_password, verify_password, create_token,
    get_current_user, now_iso, logger,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str
    password: str


class LoginOut(BaseModel):
    token: str
    user: dict


@router.post("/login")
async def login(body: LoginIn):
    email = body.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="This account has been deactivated")
    token = create_token(user)
    return {"token": token, "user": clean(user)}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user
