"""
Seed realistic demo detections + alerts into the Sentinel database.
Run: python scripts/seed_demo_alerts.py
"""
import requests
import json
import time
import random
from datetime import datetime, timedelta

BACKEND = "http://localhost:4000/api/v1"

# Login as admin
print("Logging in...")
r = requests.post(f"{BACKEND}/auth/login", json={
    "email": "admin@sentinel.local",
    "password": "ChangeMe_Admin1!"
})
if r.status_code != 200:
    print(f"Login failed: {r.status_code} {r.text}")
    exit(1)

token = r.json()["accessToken"]
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# First, add some realistic plates to watchlist
print("Adding watchlist entries...")
watchlist_plates = [
    {"plate_normalized": "GJ01AB1234", "reason": "Stolen vehicle — FIR #2026/4821"},
    {"plate_normalized": "GJ06XY9999", "reason": "Wanted person associated vehicle"},
    {"plate_normalized": "GJ03CD5678", "reason": "Insurance fraud suspect"},
    {"plate_normalized": "GJ15EF4455", "reason": "Hit and run — Ahmedabad Ring Road"},
]

for wp in watchlist_plates:
    r = requests.post(f"{BACKEND}/watchlist", json=wp, headers=headers)
    if r.status_code in (201, 200):
        print(f"  Added watchlist: {wp['plate_normalized']}")
    else:
        print(f"  Watchlist {wp['plate_normalized']}: {r.status_code} (may already exist)")

# Camera IDs that exist in DB
camera_ids = [f"cam{str(i).zfill(2)}" for i in range(1, 31)]

# Generate demo detections — mix of watchlist hits and regular traffic
demo_plates = [
    # Watchlist matches (will trigger alerts)
    "GJ01AB1234", "GJ06XY9999", "GJ03CD5678", "GJ15EF4455",
    # Regular Gujarat traffic (no alerts, just detections)
    "GJ01AA0001", "GJ05BZ7788", "GJ18CC3344", "GJ27DK9012",
    "GJ01AB1234",  # second sighting of stolen vehicle on different camera!
    "GJ06XY9999",  # second sighting
]

print("\nSeeding detections...")
now = datetime.utcnow()
success_count = 0
alert_count = 0

for i, plate in enumerate(demo_plates):
    # Spread detections over the last 30 minutes
    ts = now - timedelta(minutes=random.randint(1, 30), seconds=random.randint(0, 59))
    cam = random.choice(camera_ids[:10])  # use first 10 cameras

    # Add slight OCR noise for realism
    raw_plate = plate
    if random.random() > 0.7:
        raw_plate = plate.replace("0", "O", 1)  # simulate OCR confusion

    payload = {
        "idempotency_key": f"demo-seed-{i}-{int(time.time())}",
        "camera_id": cam,
        "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "plate_text_raw": raw_plate,
        "plate_text_normalized": plate,
        "confidence": round(random.uniform(0.75, 0.98), 4),
        "frame_ref": f"frames/{cam}/{ts.strftime('%Y-%m-%d')}/demo-{i}.jpg",
    }

    r = requests.post(f"{BACKEND}/detections", json=payload, headers=headers)
    if r.status_code == 201:
        data = r.json()
        success_count += 1
        if data.get("matched"):
            alert_count += 1
            print(f"  🚨 ALERT: {plate} on {cam} → alert_id={data.get('alert_id')}")
        else:
            print(f"  ✅ Detection: {plate} on {cam} (no watchlist match)")
    else:
        print(f"  ❌ Failed: {plate} → {r.status_code}: {r.text[:100]}")

print(f"\nDone! {success_count} detections seeded, {alert_count} alerts triggered.")
print("Go check:")
print("  → http://localhost:3000/alerts")
print("  → http://localhost:3000/search")
print("  → http://localhost:3000/route (type GJ01AB1234)")
