import os
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from core import db, new_id, now_iso, today_str, add_days, get_current_user, require_write
from dashboard import hotel_panel, bar_panel

router = APIRouter(prefix="/api/ai", tags=["ai"])

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")


async def build_live_context() -> str:
    today = today_str()
    h = await hotel_panel()
    b = await bar_panel()
    lines = [f"CURRENT DATE: {today}", ""]
    lines.append("=== HOTEL LIVE DATA ===")
    lines.append(f"Rooms total: {h['total_rooms']}, Occupied: {h['occupied']}, Vacant: {h['vacant']}, "
                 f"Dirty: {h['dirty']}, Clean: {h['clean']}, Under Maintenance: {h['maintenance']}, "
                 f"Occupancy: {h['occupancy_pct']}%, Ghost rooms: {h['ghost_rooms']}")
    rev = h["revenue"]
    lines.append(f"Today's hotel revenue -> Cash: ${rev['cash']}, Card: ${rev['card']}, "
                 f"Interac/Cheque: ${rev['interac']}, Hotel Total: ${rev['total']}")
    lines.append(f"Check-ins today: {h['checkins_today']}, Check-outs today: {h['checkouts_today']}, "
                 f"Departures tomorrow: {h['departures_tomorrow']}")
    # rooms detail
    rooms = await db.rooms.find({}).sort("number", 1).to_list(500)
    detail = []
    for r in rooms:
        guest = ""
        if r.get("status") == "Occupied":
            res = await db.reservations.find_one({"room_id": r["id"], "status": "active"})
            if res:
                guest = f" (guest: {res['guest_name']}, check-out {res['check_out']})"
        detail.append(f"Room {r['number']} [{r['type']}]: {r['status']}{guest}")
    lines.append("Rooms: " + "; ".join(detail) if detail else "Rooms: none configured")
    # upcoming reservations this week
    week_end = add_days(today, 7)
    upcoming = await db.reservations.find({"status": {"$in": ["active", "future"]},
                                           "check_in": {"$gte": today, "$lte": week_end}}).to_list(200)
    if upcoming:
        lines.append("Upcoming reservations this week: " + "; ".join(
            f"{r['guest_name']} ({r['check_in']}->{r['check_out']}, room {r.get('room_number') or 'unassigned'})"
            for r in upcoming))
    lines.append("")
    lines.append("=== BAR LIVE DATA ===")
    brev = b["revenue"]
    lines.append(f"Today's bar entry submitted: {b['entry_today']}. Last entry date: {b['last_entry_date']}")
    lines.append(f"Last night bar revenue total: ${b['last_night_revenue']}, "
                 f"Cash over/short: {b['last_over_short']}, Items below par: {b['below_par_count']}")
    inv = await db.bar_entries.find({}).sort("date", -1).to_list(1)
    if inv:
        e = inv[0]
        used = [f"{it['name']}: used {it['used']} {it['unit']} (closing {it['closing']}, par {it['par_level']})"
                for it in e.get("items", [])]
        lines.append("Latest inventory (" + e["date"] + "): " + "; ".join(used))
    # weekly used totals
    week_start = add_days(today, -7)
    week_entries = await db.bar_entries.find({"date": {"$gte": week_start, "$lte": today}}).to_list(10)
    usage = {}
    for e in week_entries:
        for it in e.get("items", []):
            usage[it["name"]] = round(usage.get(it["name"], 0) + it.get("used", 0), 2)
    if usage:
        lines.append("Past 7 days usage: " + "; ".join(f"{k}: {v}" for k, v in usage.items()))
    return "\n".join(lines)


class ChatIn(BaseModel):
    session_id: str
    message: str


@router.get("/history")
async def history(session_id: str, user: dict = Depends(get_current_user)):
    msgs = await db.chat_messages.find({"session_id": session_id}).sort("created_at", 1).to_list(200)
    return [{"role": m["role"], "content": m["content"]} for m in msgs]


@router.post("/chat")
async def chat(body: ChatIn, user: dict = Depends(require_write())):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI key not configured")
    from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

    context = await build_live_context()
    prev = await db.chat_messages.find({"session_id": body.session_id}).sort("created_at", 1).to_list(20)
    history_text = ""
    if prev:
        history_text = "\n\nRECENT CONVERSATION:\n" + "\n".join(
            f"{m['role'].upper()}: {m['content']}" for m in prev[-8:])

    system_message = (
        "You are the AI assistant for Super 8 by Wyndham hotel and 50th North Pub & Eatery bar. "
        "Answer staff questions using ONLY the live data provided below. Be concise and specific with numbers. "
        "If the data does not contain the answer, say so plainly. Never invent rooms, guests, or figures. "
        "Hotel revenue and bar revenue must always be reported separately, never combined.\n\n"
        f"LIVE DATA:\n{context}{history_text}"
    )

    chat_obj = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=body.session_id,
                       system_message=system_message).with_model("openai", "gpt-5.4")

    await db.chat_messages.insert_one({"id": new_id(), "session_id": body.session_id,
                                       "role": "user", "content": body.message, "created_at": now_iso()})

    async def gen():
        full = ""
        try:
            async for event in chat_obj.stream_message(UserMessage(text=body.message)):
                if isinstance(event, TextDelta):
                    full += event.content
                    yield f"data: {json.dumps({'delta': event.content})}\n\n"
                elif isinstance(event, StreamDone):
                    break
        except Exception as e:
            yield f"data: {json.dumps({'delta': f'[Error: {str(e)}]'})}\n\n"
        await db.chat_messages.insert_one({"id": new_id(), "session_id": body.session_id,
                                           "role": "assistant", "content": full, "created_at": now_iso()})
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
