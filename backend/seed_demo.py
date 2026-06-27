import requests, json
API = "http://localhost:8001/api"
t = requests.post(f"{API}/auth/login", json={"email": "admin@super8.com", "password": "admin123"}).json()["token"]
H = {"Authorization": f"Bearer {t}"}

# rooms
existing = {r["number"] for r in requests.get(f"{API}/hotel/rooms", headers=H).json()}
for n, typ in [("101","Single Queen"),("102","Single King"),("103","Double Queen"),("104","Double Queen Suite"),("105","Single Queen + Kitchen"),("201","Single Queen Suite"),("202","Double Queen"),("203","Single King")]:
    if n not in existing:
        requests.post(f"{API}/hotel/rooms", headers=H, json={"number": n, "type": typ, "floor": n[0]})

# reservation check-in now
avail = requests.get(f"{API}/hotel/availability", headers=H, params={"check_in":"2026-06-27","check_out":"2026-06-30"}).json()
if avail:
    requests.post(f"{API}/hotel/reservations", headers=H, json={
        "guest_name":"John Carter","phone":"306-555-0101","res_type":"checkin_now",
        "room_id":avail[0]["id"],"check_in":"2026-06-27","check_out":"2026-06-30",
        "nightly_rate":120,"amount_paid":392.40,"payment_method":"Card"})
# future reservation
avail2 = requests.get(f"{API}/hotel/availability", headers=H, params={"check_in":"2026-07-02","check_out":"2026-07-05"}).json()
if avail2:
    requests.post(f"{API}/hotel/reservations", headers=H, json={
        "guest_name":"Maria Lopez","phone":"306-555-0199","res_type":"future",
        "room_id":avail2[1]["id"],"check_in":"2026-07-02","check_out":"2026-07-05",
        "nightly_rate":135,"amount_paid":441.45,"payment_method":"Interac"})

# bar items
items = {i["name"]: i["id"] for i in requests.get(f"{API}/bar/items", headers=H).json()}
def ensure_item(name, cat, unit, par, cost=None):
    if name in items: return items[name]
    r = requests.post(f"{API}/bar/items", headers=H, json={"name":name,"category":cat,"unit":unit,"par_level":par,"cost_per_unit":cost}).json()
    items[name] = r["id"]; return r["id"]
v = ensure_item("Grey Goose Vodka","Spirits","Bottles",6,35)
b = ensure_item("Budweiser","Beer","Cans",48)
w = ensure_item("Cabernet Sauvignon","Wine","Bottles",12,18)

# bar entry last night with negative cash (tips owed)
requests.post(f"{API}/bar/entries", headers=H, json={
    "date":"2026-06-26",
    "items":[
        {"item_id":v,"opening":10,"received":0,"closing":4},
        {"item_id":b,"opening":60,"received":24,"closing":50},
        {"item_id":w,"opening":15,"received":0,"closing":9}],
    "cash_sales":-45.50,"card_sales":820,"total_sales":774.50,
    "float_start":200,"actual_cash":154.50,"cash_paid_out":[],"notes":"Busy Friday night"})

# payout + log
requests.post(f"{API}/hotel/payouts", headers=H, json={"recipient":"Bell Plumbing","amount":150,"reason":"Leak repair Rm 104","date":"2026-06-27"})
requests.post(f"{API}/hotel/logs", headers=H, json={"date":"2026-06-27","text":"Front desk: ice machine on 2nd floor needs servicing."})

print(json.dumps(requests.get(f"{API}/dashboard", headers=H).json(), indent=2))
