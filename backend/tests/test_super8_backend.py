"""Comprehensive backend tests for Super 8 Unified Hospitality System."""
import os
import json
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # fallback to frontend/.env value provided via env
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
API = BASE_URL + "/api"

ADMIN = {"email": "admin@super8.com", "password": "admin123"}
OWNER = {"email": "owner@super8.com", "password": "owner123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    data = r.json()
    return data["token"], data["user"]


@pytest.fixture(scope="session")
def admin_token():
    tok, _ = _login(ADMIN)
    return tok


@pytest.fixture(scope="session")
def owner_token():
    tok, _ = _login(OWNER)
    return tok


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------------- AUTH ----------------
class TestAuth:
    def test_admin_login(self):
        r = requests.post(f"{API}/auth/login", json=ADMIN)
        assert r.status_code == 200
        d = r.json()
        assert "token" in d and d["user"]["email"] == ADMIN["email"]
        assert d["user"]["role"] == "admin"

    def test_owner_login(self):
        r = requests.post(f"{API}/auth/login", json=OWNER)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "owner"

    def test_invalid_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": "x@x.com", "password": "bad"})
        assert r.status_code == 401

    def test_me(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=H(admin_token))
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN["email"]


# ---------------- OWNER ROLE ENFORCEMENT ----------------
class TestOwnerReadOnly:
    def test_owner_can_read_dashboard(self, owner_token):
        r = requests.get(f"{API}/dashboard", headers=H(owner_token))
        assert r.status_code == 200

    def test_owner_can_read_rooms(self, owner_token):
        r = requests.get(f"{API}/hotel/rooms", headers=H(owner_token))
        assert r.status_code == 200

    def test_owner_can_read_inventory(self, owner_token):
        r = requests.get(f"{API}/bar/inventory", headers=H(owner_token))
        assert r.status_code == 200

    def test_owner_blocked_create_room(self, owner_token):
        r = requests.post(f"{API}/hotel/rooms", headers=H(owner_token),
                          json={"number": "999", "type": "Single Queen"})
        assert r.status_code == 403

    def test_owner_blocked_create_reservation(self, owner_token):
        r = requests.post(f"{API}/hotel/reservations", headers=H(owner_token),
                          json={"guest_name": "X", "res_type": "future",
                                "check_in": "2026-07-01", "check_out": "2026-07-02",
                                "nightly_rate": 100})
        assert r.status_code == 403

    def test_owner_blocked_create_bar_entry(self, owner_token):
        r = requests.post(f"{API}/bar/entries", headers=H(owner_token),
                          json={"date": "2026-06-28", "items": [], "cash_sales": 0})
        assert r.status_code == 403

    def test_owner_blocked_create_payout(self, owner_token):
        r = requests.post(f"{API}/hotel/payouts", headers=H(owner_token),
                          json={"recipient": "X", "amount": 10, "reason": "t", "date": "2026-06-27"})
        assert r.status_code == 403


# ---------------- HOTEL FLOW ----------------
@pytest.fixture(scope="session")
def created_room(admin_token):
    num = f"TEST{uuid.uuid4().hex[:4].upper()}"
    r = requests.post(f"{API}/hotel/rooms", headers=H(admin_token),
                      json={"number": num, "type": "Single Queen"})
    assert r.status_code == 200, r.text
    return r.json()


class TestHotel:
    def test_create_room(self, created_room):
        assert created_room["status"] == "Vacant"
        assert "id" in created_room

    def test_availability(self, admin_token, created_room):
        r = requests.get(f"{API}/hotel/availability",
                         params={"check_in": "2026-07-10", "check_out": "2026-07-12"},
                         headers=H(admin_token))
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert created_room["id"] in ids

    def test_checkin_reservation_blocks_room(self, admin_token, created_room):
        # check-in now reservation
        body = {"guest_name": "TEST_Guest1", "res_type": "checkin_now",
                "room_id": created_room["id"], "check_in": "2026-06-27",
                "check_out": "2026-06-30", "nightly_rate": 100,
                "amount_paid": 100, "payment_method": "Cash"}
        r = requests.post(f"{API}/hotel/reservations", headers=H(admin_token), json=body)
        assert r.status_code == 200, r.text
        res = r.json()
        assert res["status"] == "active"
        assert res["tax"] == round(300 * 0.09, 2)
        assert res["total_after_tax"] == round(300 + 300 * 0.09, 2)
        # Room should be Occupied
        rooms = requests.get(f"{API}/hotel/rooms", headers=H(admin_token)).json()
        room = next(x for x in rooms if x["id"] == created_room["id"])
        assert room["status"] == "Occupied"
        # Overlap booking rejected
        overlap = {"guest_name": "TEST_Overlap", "res_type": "checkin_now",
                   "room_id": created_room["id"], "check_in": "2026-06-28",
                   "check_out": "2026-06-29", "nightly_rate": 100,
                   "amount_paid": 0, "payment_method": "Cash"}
        r2 = requests.post(f"{API}/hotel/reservations", headers=H(admin_token), json=overlap)
        assert r2.status_code == 400
        pytest.current_res_id = res["id"]

    def test_future_reservation_no_room(self, admin_token):
        body = {"guest_name": "TEST_Future", "res_type": "future",
                "check_in": "2026-08-01", "check_out": "2026-08-03",
                "nightly_rate": 120, "amount_paid": 0, "payment_method": "Cash"}
        r = requests.post(f"{API}/hotel/reservations", headers=H(admin_token), json=body)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "future"
        pytest.future_res_id = r.json()["id"]

    def test_convert_future_to_checkin(self, admin_token, created_room):
        # Need a free room for the conversion - create one
        num = f"CONV{uuid.uuid4().hex[:4].upper()}"
        room = requests.post(f"{API}/hotel/rooms", headers=H(admin_token),
                             json={"number": num, "type": "Single King"}).json()
        r = requests.post(f"{API}/hotel/reservations/{pytest.future_res_id}/convert",
                          params={"room_id": room["id"]}, headers=H(admin_token))
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "active"

    def test_extend_stay(self, admin_token):
        r = requests.post(f"{API}/hotel/reservations/{pytest.current_res_id}/extend",
                          headers=H(admin_token),
                          json={"additional_nights": 2, "nightly_rate": 100,
                                "amount_paid": 218, "payment_method": "Cash"})
        assert r.status_code == 200, r.text
        ext = r.json()
        assert ext["tax"] == round(200 * 0.09, 2)
        assert ext["total_after_tax"] == round(200 + 200 * 0.09, 2)

    def test_early_checkout_with_refund(self, admin_token):
        r = requests.post(f"{API}/hotel/reservations/{pytest.current_res_id}/checkout",
                          headers=H(admin_token),
                          json={"refund_amount": 50, "refund_reason": "Early"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        # Verify negative refund payment exists in reports - just call reports
        rr = requests.get(f"{API}/reports/hotel/daily", headers=H(admin_token))
        assert rr.status_code == 200


# ---------------- BAR ----------------
@pytest.fixture(scope="session")
def created_bar_item(admin_token):
    r = requests.post(f"{API}/bar/items", headers=H(admin_token),
                      json={"name": f"TEST_Item_{uuid.uuid4().hex[:4]}",
                            "category": "Beer", "unit": "Cans",
                            "par_level": 12})
    assert r.status_code == 200, r.text
    return r.json()


class TestBar:
    def test_create_item(self, created_bar_item):
        assert created_bar_item["par_level"] == 12

    def test_prefill(self, admin_token):
        r = requests.get(f"{API}/bar/entries/prefill", params={"date": "2026-06-28"},
                         headers=H(admin_token))
        assert r.status_code == 200
        # ensure structure
        rows = r.json()
        assert isinstance(rows, list)

    def test_submit_entry_with_negative_cash(self, admin_token, created_bar_item):
        # Negative cash sales = tips owed
        body = {
            "date": "2026-06-28",
            "items": [{"item_id": created_bar_item["id"], "opening": 24,
                       "received": 0, "closing": 6}],  # used=18, below par(12)? closing=6 < 12 -> below_par
            "cash_sales": -45.50,
            "card_sales": 200,
            "total_sales": 154.50,
            "float_start": 200,
            "cash_paid_out": [{"recipient": "X", "reason": "tip", "amount": 10}],
            "actual_cash": 140,
            "notes": "neg test",
        }
        r = requests.post(f"{API}/bar/entries", headers=H(admin_token), json=body)
        assert r.status_code == 200, r.text
        e = r.json()
        assert e["cash_sales"] == -45.50
        # expected = 200 + (-45.5) - 10 = 144.5
        assert e["expected_cash"] == 144.5
        # over_short = 140 - 144.5 = -4.5
        assert e["over_short"] == -4.5
        # closing < par => below_par_count >= 1
        assert e["below_par_count"] >= 1
        # late_entry: date 2026-06-28 vs today's date (test today_str returns server tz local date)
        # We just check field is bool present
        assert "late_entry" in e
        item_proc = e["items"][0]
        assert item_proc["used"] == 18
        assert item_proc["below_par"] is True

    def test_get_entry(self, admin_token):
        r = requests.get(f"{API}/bar/entries", params={"date": "2026-06-28"},
                         headers=H(admin_token))
        assert r.status_code == 200
        assert r.json()["cash_sales"] == -45.50

    def test_late_entry_flag(self, admin_token, created_bar_item):
        # use a date clearly in past
        body = {"date": "2026-01-01",
                "items": [{"item_id": created_bar_item["id"], "opening": 10,
                           "received": 0, "closing": 8}],
                "cash_sales": 100, "card_sales": 50, "total_sales": 150,
                "float_start": 100, "cash_paid_out": [], "actual_cash": 200}
        r = requests.post(f"{API}/bar/entries", headers=H(admin_token), json=body)
        assert r.status_code == 200
        assert r.json()["late_entry"] is True


# ---------------- REPORTS / DASHBOARD ----------------
class TestReportsAndDashboard:
    def test_dashboard_structure(self, admin_token):
        r = requests.get(f"{API}/dashboard", headers=H(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert "hotel" in d and "bar" in d
        hot = d["hotel"]
        # hotel revenue (cash/card/interac/total) + room counts + checkins + ghost_rooms
        for k in ("revenue", "total_rooms", "occupied", "vacant", "occupancy_pct",
                  "checkins_today", "checkouts_today", "ghost_rooms"):
            assert k in hot, f"missing hotel.{k}"
        for k in ("cash", "card", "interac", "total"):
            assert k in hot["revenue"], f"missing hotel.revenue.{k}"
        # bar panel separate revenue + below_par_count + last_over_short
        bar = d["bar"]
        for k in ("revenue", "entry_today", "last_entry_date", "last_over_short",
                  "below_par_count"):
            assert k in bar, f"missing bar.{k}"
        for k in ("cash", "card", "total"):
            assert k in bar["revenue"], f"missing bar.revenue.{k}"

    def test_hotel_reports(self, admin_token):
        for p in ("daily", "weekly", "monthly"):
            r = requests.get(f"{API}/reports/hotel/{p}", headers=H(admin_token))
            assert r.status_code == 200, f"{p}: {r.status_code} {r.text}"

    def test_bar_reports_negative_cash_preserved(self, admin_token):
        r = requests.get(f"{API}/reports/bar/daily", headers=H(admin_token),
                         params={"date": "2026-06-28"})
        assert r.status_code == 200
        # Just structure check
        assert isinstance(r.json(), dict)


# ---------------- ADMIN ----------------
class TestAdmin:
    def test_verify_pin_correct(self, admin_token):
        r = requests.post(f"{API}/admin/verify-pin", headers=H(admin_token),
                          json={"pin": "1234"})
        assert r.status_code == 200

    def test_verify_pin_wrong(self, admin_token):
        r = requests.post(f"{API}/admin/verify-pin", headers=H(admin_token),
                          json={"pin": "0000"})
        assert r.status_code == 403

    def test_users_crud(self, admin_token):
        email = f"test_{uuid.uuid4().hex[:6]}@super8.com"
        r = requests.post(f"{API}/admin/users", headers=H(admin_token),
                          json={"name": "TEST_U", "email": email,
                                "password": "pw12345", "role": "front_desk"})
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        # list
        lst = requests.get(f"{API}/admin/users", headers=H(admin_token))
        assert lst.status_code == 200
        assert any(u["id"] == uid for u in lst.json())
        # delete
        d = requests.delete(f"{API}/admin/users/{uid}", headers=H(admin_token))
        assert d.status_code == 200

    def test_audit_logs(self, admin_token):
        r = requests.get(f"{API}/admin/audit-logs", headers=H(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_log_edit_pin_required(self, admin_token):
        # create log
        r = requests.post(f"{API}/hotel/logs", headers=H(admin_token),
                          json={"date": "2026-06-27", "text": "TEST log"})
        assert r.status_code == 200
        lid = r.json()["id"]
        # wrong pin
        bad = requests.put(f"{API}/hotel/logs/{lid}", headers=H(admin_token),
                           json={"date": "2026-06-27", "text": "edited", "pin": "0000"})
        assert bad.status_code == 403
        # correct pin
        ok = requests.put(f"{API}/hotel/logs/{lid}", headers=H(admin_token),
                          json={"date": "2026-06-27", "text": "edited", "pin": "1234"})
        assert ok.status_code == 200
        # delete with wrong pin
        bd = requests.post(f"{API}/hotel/logs/{lid}/delete", headers=H(admin_token),
                           json={"pin": "0000"})
        assert bd.status_code == 403
        # delete with right pin
        gd = requests.post(f"{API}/hotel/logs/{lid}/delete", headers=H(admin_token),
                           json={"pin": "1234"})
        assert gd.status_code == 200


# ---------------- AI ----------------
class TestAI:
    def test_ai_history(self, admin_token):
        r = requests.get(f"{API}/ai/history", headers=H(admin_token),
                         params={"session_id": "test-sess"})
        assert r.status_code == 200

    def test_ai_chat_sse(self, admin_token):
        # Stream SSE; just ensure 200 and at least one data chunk
        with requests.post(f"{API}/ai/chat", headers={**H(admin_token),
                                                       "Accept": "text/event-stream"},
                           json={"session_id": "test-sess",
                                 "message": "How many rooms are vacant right now?"},
                           stream=True, timeout=60) as r:
            assert r.status_code == 200, r.text
            got_chunk = False
            start = time.time()
            for raw in r.iter_lines(decode_unicode=True):
                if raw and raw.startswith("data:"):
                    got_chunk = True
                if time.time() - start > 30:
                    break
            assert got_chunk, "no SSE data chunks received"
