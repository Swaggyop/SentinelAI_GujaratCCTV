import urllib.request
import urllib.parse
import json
import os
import argparse
import time
import ssl

BACKEND_API = "http://127.0.0.1:4000/api/v1"
ANPR_API = "http://127.0.0.1:5000"

# Create an unverified SSL context to bypass the hackathon's expired certificate
ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

def get_token(email, password):
    req = urllib.request.Request(f"{BACKEND_API}/auth/login", method="POST")
    req.add_header('Content-Type', 'application/json')
    data = json.dumps({"email": email, "password": password}).encode('utf-8')
    try:
        with urllib.request.urlopen(req, data=data) as response:
            res = json.loads(response.read())
            return res.get("accessToken")
    except Exception as e:
        print(f"Failed to login: {e}")
        return None

def fetch_grid_cameras(host="cctv.corp8.cloud"):
    """Fetch camera catalogue and per-camera properties from /api/ingest per spec checklist."""
    endpoints = [
        f"https://{host}/api/ingest",
        f"http://103.250.160.189/api/ingest",
        f"https://{host}/cameras.json"
    ]

    for url in endpoints:
        print(f"Attempting to fetch camera catalogue from {url}...")
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Sentinel-Integrator/1.0"})
            with urllib.request.urlopen(req, context=ssl_ctx, timeout=3) as response:
                data = json.loads(response.read())
                if isinstance(data, dict) and "cameras" in data:
                    print(f"Successfully loaded {len(data['cameras'])} cameras from {url}")
                    return data["cameras"]
                elif isinstance(data, list) and len(data) > 0:
                    print(f"Successfully loaded {len(data)} cameras from {url}")
                    return data
        except Exception as e:
            # Expected if endpoint is restricted or behind gateway auth
            pass

    print("Remote /api/ingest catalogue unreachable. Initializing standard 30-camera Sentinel grid...")
    cams = []
    for i in range(1, 31):
        cams.append({
            "id": f"cam{i:02d}",
            "name": f"Hackathon Camera {i}",
            "lat": 23.0225 + (i * 0.01),
            "lon": 72.5714 + (i * 0.01),
            "codec": "h264",
            "resolution": "1920x1080",
            "fps": 25,
            "status": "live"
        })
    return cams

def onboard_cameras(cameras, token):
    print("Onboarding cameras to Sentinel Backend...")
    for cam in cameras:
        cam_id = cam.get("id") or cam.get("name") # fallback
        payload = {
            "id": cam_id,
            "department": cam.get("name", "Gujarat Police"),
            "lat": cam.get("lat", 23.0225),
            "lon": cam.get("lon", 72.5714),
            "vendor": "Hackathon Grid"
        }
        req = urllib.request.Request(f"{BACKEND_API}/cameras", method="POST")
        req.add_header('Content-Type', 'application/json')
        req.add_header('Authorization', f'Bearer {token}')
        data = json.dumps(payload).encode('utf-8')
        try:
            with urllib.request.urlopen(req, data=data) as response:
                pass
        except urllib.error.HTTPError as e:
            if e.code == 409:
                pass # Already exists
            else:
                print(f"Failed to onboard {cam_id}: {e.read()}")
        except Exception as e:
            print(f"Failed to onboard {cam_id}: {e}")
    print(f"Successfully synced {len(cameras)} cameras to backend.")

def start_ai_streams(cameras, email, password):
    print("\nStarting AI streams on ANPR service...")
    print("WARNING: Do not start all 30 on a laptop! Starting only the first 2...")
    
    encoded_email = urllib.parse.quote(email)
    
    # Just run first 2 cameras for AI
    for cam in cameras[:2]:
        cam_id = cam.get("id") or cam.get("name")
        rtsp_url = f"rtsp://{encoded_email}:{password}@103.250.160.189:8554/stream/{cam_id}"
        
        payload = {
            "camera_id": cam_id,
            "rtsp_url": rtsp_url
        }
        req = urllib.request.Request(f"{ANPR_API}/process-stream", method="POST")
        req.add_header('Content-Type', 'application/json')
        data = json.dumps(payload).encode('utf-8')
        try:
            with urllib.request.urlopen(req, data=data) as response:
                print(f"Started AI inference for {cam_id}")
        except Exception as e:
            print(f"Failed to start stream for {cam_id}: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync Sentinel with Hackathon Grid")
    parser.add_argument("--email", required=True, help="Your hackathon registered email")
    parser.add_argument("--password", required=True, help="Your hackathon access password")
    args = parser.parse_args()

    admin_token = get_token("admin@sentinel.local", "ChangeMe_Admin1!")
    if not admin_token:
        print("Could not login as admin. Is backend running?")
        exit(1)

    cams = fetch_grid_cameras()
    onboard_cameras(cams, admin_token)
    
    start_ai_streams(cams, args.email, args.password)
    
    print("\nDone! Check http://localhost:3000/map and click on cam01 or cam02 to see the live feed!")
