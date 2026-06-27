import os, uuid, random
from datetime import datetime, timezone, date, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv
load_dotenv()

db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
TAX = 0.09
def nid(): return str(uuid.uuid4())
def iso(): return datetime.now(timezone.utc).isoformat()
random.seed(8)

rooms = list(db.rooms.find({}))
items = list(db.bar_items.find({}))
if not rooms or not items:
    raise SystemExit("Run base seed first (need rooms + bar items)")

names = ["Olivia Reed","Liam Patel","Emma Wong","Noah Singh","Ava Brooks","Ethan Clark","Sophia Diaz",
         "Mason Lee","Isabella Khan","Lucas Romanov","Mia Thompson","Henry Ford","Amelia Cruz","Jack Nolan",
         "Grace Miller","Owen Park","Chloe Adams","Leo Martins"]
methods = ["Cash","Card","Interac","Cheque","Card","Cash","Card","Interac"]

def add_payment(amount, method, d, guest, rid, kind="reservation"):
    if amount == 0: return
    db.payments.insert_one({"id": nid(),"kind":kind,"amount":round(amount,2),"payment_method":method,
        "date":d,"guest_name":guest,"reservation_id":rid,"note":"seed","created_at":iso()})

# ---- HOTEL: spread stays across June ----
start = date(2026,6,1)
created = 0
for i, nm in enumerate(names):
    ci = start + timedelta(days=random.randint(0,25))
    nights = random.choice([1,1,2,2,3])
    co = ci + timedelta(days=nights)
    room = rooms[i % len(rooms)]
    rate = random.choice([110,120,125,135,140,150])
    before = round(rate*nights,2); tax = round(before*TAX,2); after = round(before+tax,2)
    method = methods[i % len(methods)]
    today = date(2026,6,27)
    if co < today:
        status = "checked_out"
    elif ci <= today < co:
        status = random.choice(["active","checked_out"])
    else:
        status = "future"
    rid = nid()
    doc = {"id":rid,"guest_name":nm,"phone":f"306-555-0{100+i}","email":None,
           "res_type":"checkin_now" if status!="future" else "future",
           "room_id":room["id"],"room_number":room["number"],"room_type":room["type"],
           "check_in":ci.isoformat(),"check_out":co.isoformat(),"nights":nights,"nightly_rate":rate,
           "total_before_tax":before,"tax":tax,"total_after_tax":after,"amount_paid":after,
           "payment_method":method,"notes":None,"status":status,"created_at":iso(),"created_by":"Seed"}
    if status == "checked_out":
        doc["actual_check_out"] = co.isoformat(); doc["early_checkout"] = False
    db.reservations.insert_one(doc)
    add_payment(after, method, ci.isoformat(), nm, rid)
    if status == "active":
        db.rooms.update_one({"id":room["id"]},{"$set":{"status":"Occupied"}})
    created += 1

# a couple refunds + extension
some = list(db.reservations.find({"status":"checked_out"}).limit(2))
if some:
    r = some[0]
    db.refunds.insert_one({"id":nid(),"reservation_id":r["id"],"guest_name":r["guest_name"],
        "amount":75.0,"reason":"Early check-out refund","date":"2026-06-20","created_at":iso(),"created_by":"Seed"})
    add_payment(-75.0, r["payment_method"], "2026-06-20", r["guest_name"], r["id"], kind="refund")
    r2 = some[1]
    eb=round(120*2,2); etx=round(eb*TAX,2); ea=round(eb+etx,2)
    db.extensions.insert_one({"id":nid(),"reservation_id":r2["id"],"additional_nights":2,"nightly_rate":120,
        "total_before_tax":eb,"tax":etx,"total_after_tax":ea,"amount_paid":ea,"payment_method":"Card",
        "date":"2026-06-18","created_at":iso(),"created_by":"Seed"})
    add_payment(ea,"Card","2026-06-18",r2["guest_name"],r2["id"],kind="extension")

# payouts across month
for d,amt,who,why in [("2026-06-05",120,"City Linen","Laundry service"),("2026-06-12",80,"Petty Cash","Supplies"),
                      ("2026-06-19",200,"HVAC Tech","AC repair Rm 203"),("2026-06-24",60,"Window Co","Glass cleaning")]:
    db.payouts.insert_one({"id":nid(),"recipient":who,"amount":amt,"reason":why,"date":d,"created_by":"Seed","created_at":iso()})

# ---- BAR: entries across June (skip 22,25,26 to show missing + keep existing 26) ----
def make_entry(d, cash, card, total, prev, floats=200, actual=None, note=""):
    rows=[]; below=0
    for it in items:
        op = prev.get(it["id"], random.randint(it.get("par_level",6), it.get("par_level",6)+8))
        recv = random.choice([0,0,0,12,24])
        close = max(0, op + recv - random.randint(2,10))
        used = round(op+recv-close,2)
        par = it.get("par_level",0)
        bp = par>0 and close<par
        if bp: below+=1
        rows.append({"item_id":it["id"],"name":it["name"],"category":it["category"],"unit":it["unit"],
            "par_level":par,"opening":op,"received":recv,"closing":close,"used":used,
            "variance":used<0 or (par>0 and used>par*3),"below_par":bool(bp),"note":""})
        prev[it["id"]] = close
    paid_total=0
    exp = round(floats + cash - paid_total,2)
    if actual is None: actual = round(exp + random.choice([0,0,0,-3.5,5,-2]),2)
    db.bar_entries.update_one({"date":d},{"$set":{"id":nid(),"date":d,"items":rows,
        "cash_sales":cash,"card_sales":card,"total_sales":total,"float_start":floats,
        "cash_paid_out":[],"cash_paid_out_total":0,"expected_cash":exp,"actual_cash":actual,
        "over_short":round(actual-exp,2),"notes":note,"late_entry":d<"2026-06-27","below_par_count":below,
        "submitted_by":"Jordan (Bar)","submitted_at":iso()}}, upsert=True)
    return prev

prev={}
plan = [("2026-06-15",420,610,1030),("2026-06-16",380,540,920),("2026-06-17",510,700,1210),
        ("2026-06-18",-30,480,450),("2026-06-19",600,820,1420),("2026-06-20",470,560,1030),
        ("2026-06-21",350,500,850),("2026-06-23",680,910,1590),("2026-06-24",-45,520,475),
        ("2026-06-27",290,410,700)]
for d,cash,card,total in plan:
    note = "Tips owed to staff (negative cash)" if cash<0 else "Steady night"
    prev = make_entry(d, cash, card, total, prev, note=note)

print("reservations:", db.reservations.count_documents({}))
print("payments:", db.payments.count_documents({}))
print("bar_entries:", db.bar_entries.count_documents({}))
print("payouts:", db.payouts.count_documents({}), "refunds:", db.refunds.count_documents({}), "extensions:", db.extensions.count_documents({}))
